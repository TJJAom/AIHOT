// 自撰閱讀內文；不改來源全文許可、摘要、評分或人工編輯。
import { z } from "zod";
import { sql, type Db } from "../db.ts";
import { sha256 } from "../lib/ids.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { announceArticleReading } from "../publication/reading.ts";
import { modelFor } from "./models.ts";
import { promptText, promptVersion } from "./prompts.ts";
import { looksZh } from "./writing.ts";

export const ReadingSchema = z.object({ sections: z.array(z.object({
  heading: z.string().trim().min(1).max(120),
  paragraphs: z.array(z.string().trim().min(1).max(8000)).min(1).max(8),
})).min(1).max(10) });
export type ReadingSection = z.infer<typeof ReadingSchema>["sections"][number];
const VERSION = promptVersion("article-reading");
const SYSTEM = promptText("article-reading");

interface Input {
  id: string; revision: number; analysis_id: number; override_version: number;
  title: string; summary: string; source: string; url: string; published_at: Date | null;
  body_text: string; corrections: Record<string, unknown>;
}
async function inputOf(id: string, db: Db = sql): Promise<Input | null> {
  const [row] = await db<Input[]>`SELECT a.id,a.revision,p.analysis_id,coalesce(e.version,0)::int AS override_version,
      p.title,p.summary,s.name AS source,a.url,a.published_at,a.body_text,coalesce(e.fields,'{}'::jsonb) AS corrections
    FROM articles a JOIN publications p ON p.article_id=a.id JOIN sources s ON s.id=a.source_id JOIN analyses an ON an.id=p.analysis_id
    LEFT JOIN editorial_overrides e ON e.article_id=a.id
    WHERE a.id=${id} AND p.eligible AND p.visibility='public' AND s.participation_mode='editorial'
      AND an.input_revision=a.revision AND a.body_status='ok' AND length(a.body_text)>0`;
  return row ?? null;
}
const fingerprint = (input: Input) => sha256(JSON.stringify(input));
const requestText = (input: Input) => JSON.stringify({ editorial: { title: input.title, summary: input.summary, corrections: input.corrections },
  source: { name: input.source, url: input.url, publishedAt: input.published_at }, untrustedSourceText: input.body_text });
const inputBytes = (input: Input) => Buffer.byteLength(JSON.stringify({ system: SYSTEM, user: requestText(input) }));

export async function planArticleReadings(articleIds?: string[]) {
  const ids = await sql<{ article_id: string }[]>`SELECT article_id FROM publications WHERE eligible AND visibility='public'
    ${articleIds ? sql`AND article_id=ANY(${articleIds}::text[])` : sql``} ORDER BY article_id`;
  const plan = [];
  for (const { article_id } of ids) {
    const input = await inputOf(article_id);
    if (!input) throw new Error(`文章 ${article_id} 尚無目前版本的完整材料，不能宣稱全部完成`);
    const bytes = inputBytes(input);
    if (bytes > 190_000) throw new Error(`文章 ${article_id} 完整材料 ${bytes} bytes 超過單次閱讀整理上限，需先核對分段方案`);
    plan.push({ articleId: article_id, revision: input.revision, inputHash: fingerprint(input), inputBytes: bytes });
  }
  return plan;
}

export async function composeArticleReading(articleId: string, expectedHash?: string): Promise<{ status: "written" | "current" | "skipped" | "stale"; receiptId?: number }> {
  const input = await inputOf(articleId);
  if (!input) return { status: "skipped" };
  const hash = fingerprint(input);
  if (expectedHash && expectedHash !== hash) throw new Error(`文章 ${articleId} 已變更，停止固定名單以供核對`);
  const [saved] = await sql`SELECT article_id FROM article_readings WHERE article_id=${articleId} AND input_hash=${hash} AND prompt_version=${VERSION}`;
  if (saved) return { status: "current" };
  const user = requestText(input);
  // 為 JSON 包裝與取樣參數保留空間；長材料明確停止，不默默截去後半。
  if (Buffer.byteLength(JSON.stringify({ system: SYSTEM, user })) > 190_000) throw new Error(`文章 ${articleId} 完整材料超過單次閱讀整理上限，需先核對分段方案`);
  const subject = `article:${articleId}@${input.revision}:${hash}`;
  const unresolved = await sql`SELECT id,status FROM receipts WHERE purpose='article_reading' AND subject=${subject} AND status IN ('pending','unknown','failed')`;
  if (unresolved.length) throw new Error(`文章 ${articleId} 有未核對的整理回執，不自動重送`);
  const response = await chatJson({ model: await modelFor("understand"), purpose: "article_reading", subject,
    promptVersion: VERSION, system: SYSTEM, user, schema: ReadingSchema, temperature: 0.2, maxTokens: 8192, timeoutMs: 180_000 });
  const paragraphs = response.data.sections.flatMap(s => s.paragraphs);
  const normalized = (text: string) => text.replace(/[\p{P}\s]/gu, "");
  if (new Set(paragraphs.map(normalized).filter(p => p.length >= 12)).size < 2 || normalized(paragraphs.join("")) === normalized(input.summary)) {
    // 保留 received 回執；再次處理只會重用同一答案，不另付費。
    throw new Error(`文章 ${articleId} 整理至少兩個實質段落，不可僅重述導讀`);
  }
  if (!looksZh(paragraphs.join(""))) throw new Error(`文章 ${articleId} 整理未使用中文，需核對既有回執`);
  const status = await sql.begin(async tx => {
    await tx`SELECT id FROM articles WHERE id=${articleId} FOR UPDATE`;
    await tx`SELECT article_id FROM publications WHERE article_id=${articleId} FOR UPDATE`;
    const current = await inputOf(articleId, tx);
    if (!current || fingerprint(current) !== hash) {
      await completeReceipt(tx, response.receiptId);
      return "stale" as const;
    }
    await tx`INSERT INTO article_readings(article_id,input_revision,analysis_id,override_version,input_hash,prompt_version,sections,receipt_id)
      VALUES(${articleId},${input.revision},${input.analysis_id},${input.override_version},${hash},${VERSION},${sql.json(response.data.sections)},${response.receiptId})
      ON CONFLICT(article_id) DO UPDATE SET input_revision=EXCLUDED.input_revision,analysis_id=EXCLUDED.analysis_id,
        override_version=EXCLUDED.override_version,input_hash=EXCLUDED.input_hash,prompt_version=EXCLUDED.prompt_version,
        sections=EXCLUDED.sections,receipt_id=EXCLUDED.receipt_id,updated_at=now()`;
    await completeReceipt(tx, response.receiptId);
    await announceArticleReading(tx, articleId);
    return "written" as const;
  });
  return { status, receiptId: response.receiptId };
}

/** Worker 補齊所有可公開文章，包括非精選與低分；讀者請求不走此流程。 */
export async function composePendingReadings(limit = 30) {
  const rows = await sql<{ article_id: string }[]>`SELECT p.article_id FROM publications p JOIN articles a ON a.id=p.article_id
    JOIN sources s ON s.id=p.source_id JOIN analyses an ON an.id=p.analysis_id LEFT JOIN editorial_overrides e ON e.article_id=a.id
    LEFT JOIN article_readings r ON r.article_id=a.id AND r.input_revision=a.revision AND r.analysis_id=p.analysis_id
      AND r.override_version=coalesce(e.version,0) AND r.prompt_version=${VERSION}
    WHERE p.eligible AND p.visibility='public' AND s.participation_mode='editorial' AND an.input_revision=a.revision
      AND a.body_status='ok' AND length(a.body_text)>0 AND r.article_id IS NULL
    ORDER BY p.discovered_at LIMIT ${limit}`;
  const results = [];
  const errors: Error[] = [];
  for (const row of rows) {
    try { results.push({ articleId: row.article_id, ...await composeArticleReading(row.article_id) }); }
    catch (error) { errors.push(new Error(`${row.article_id}: ${String(error).slice(0, 500)}`, { cause: error })); }
  }
  if (errors.length) throw new AggregateError(errors, `閱讀整理 ${errors.length} 篇失敗；其餘 ${results.length} 篇已處理。${errors.map(e => e.message).join("；")}`);
  return results;
}
