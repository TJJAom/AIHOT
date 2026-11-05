// 自撰閱讀內文；不改來源全文許可、摘要、評分或人工編輯。
import { z } from "zod";
import { sql, type Db } from "../db.ts";
import { sha256 } from "../lib/ids.ts";
import { chatJson, extractJson } from "../providers/llm.ts";
import { completeReceipt, ModelOutputError } from "../providers/receipts.ts";
import { announceArticleReading } from "../publication/reading.ts";
import { modelFor } from "./models.ts";
import { promptText, promptVersion } from "./prompts.ts";
import { looksZh } from "./writing.ts";

const Sections = z.array(z.object({
  heading: z.string().trim().min(1).max(120),
  paragraphs: z.array(z.string().trim().min(1).max(8000)).min(1).max(8),
})).min(1).max(10);
/** 一篇整理，或模型判斷材料不足（只有導覽、標籤、贊助文字，或內容寫不出兩段）時的原因。 */
export const ReadingSchema = z.union([
  z.object({ sections: Sections }),
  z.object({ insufficient: z.string().trim().min(1).max(300) }),
]);
export type ReadingSection = z.infer<typeof Sections>[number];

/**
 * 模型有時把多個小標寫進同一個物件（{"heading":…,"paragraphs":[…],"heading":…}），JSON 只留最後一組。
 * 段落陣列後直接接下一個 heading 時拆成新物件；字串內的引號必定跳脫，不會誤拆內文。
 */
const parseReading = (content: string) => extractJson(content.replace(/\]\s*,\s*"heading"\s*:/g, ']},{"heading":'));
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

/**
 * 整理結果：written 寫入新整理；insufficient 模型判斷材料不足；unusable 回覆無法使用（格式錯、只重述導讀、非中文）。
 * 後兩者記成空整理並結案：這一版材料不再重送付費請求，也不再擋住日報；文章只顯示導讀。材料或提示詞改版後重新整理。
 */
export type ReadingStatus = "written" | "current" | "skipped" | "stale" | "insufficient" | "unusable";

export async function composeArticleReading(articleId: string, expectedHash?: string): Promise<{ status: ReadingStatus; receiptId?: number; reason?: string }> {
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
  let response;
  try {
    response = await chatJson({ model: await modelFor("understand"), purpose: "article_reading", subject,
      promptVersion: VERSION, system: SYSTEM, user, schema: ReadingSchema, parse: parseReading, temperature: 0.2, maxTokens: 8192, timeoutMs: 180_000 });
  } catch (error) {
    if (!(error instanceof ModelOutputError) || error.receiptId === null) throw error;
    return conclude(articleId, input, hash, [], error.receiptId, "unusable", error.message);
  }
  if ("insufficient" in response.data) return conclude(articleId, input, hash, [], response.receiptId, "insufficient", response.data.insufficient);
  const sections = response.data.sections;
  const paragraphs = sections.flatMap(s => s.paragraphs);
  const normalized = (text: string) => text.replace(/[\p{P}\s]/gu, "");
  if (new Set(paragraphs.map(normalized).filter(p => p.length >= 12)).size < 2 || normalized(paragraphs.join("")) === normalized(input.summary)) {
    return conclude(articleId, input, hash, [], response.receiptId, "unusable", "整理不足兩個實質段落，或只重述導讀");
  }
  if (!looksZh(paragraphs.join(""))) return conclude(articleId, input, hash, [], response.receiptId, "unusable", "整理未使用中文");
  return conclude(articleId, input, hash, sections, response.receiptId, "written");
}

/** 在材料未變時保存整理（空整理表示這一版材料沒有可用整理），並結清回執。 */
async function conclude(articleId: string, input: Input, hash: string, sections: ReadingSection[], receiptId: number,
  outcome: "written" | "insufficient" | "unusable", reason?: string): Promise<{ status: ReadingStatus; receiptId: number; reason?: string }> {
  const status = await sql.begin(async tx => {
    await tx`SELECT id FROM articles WHERE id=${articleId} FOR UPDATE`;
    await tx`SELECT article_id FROM publications WHERE article_id=${articleId} FOR UPDATE`;
    const current = await inputOf(articleId, tx);
    if (!current || fingerprint(current) !== hash) {
      await completeReceipt(tx, receiptId);
      return "stale" as const;
    }
    await tx`INSERT INTO article_readings(article_id,input_revision,analysis_id,override_version,input_hash,prompt_version,sections,receipt_id)
      VALUES(${articleId},${input.revision},${input.analysis_id},${input.override_version},${hash},${VERSION},${sql.json(sections)},${receiptId})
      ON CONFLICT(article_id) DO UPDATE SET input_revision=EXCLUDED.input_revision,analysis_id=EXCLUDED.analysis_id,
        override_version=EXCLUDED.override_version,input_hash=EXCLUDED.input_hash,prompt_version=EXCLUDED.prompt_version,
        sections=EXCLUDED.sections,receipt_id=EXCLUDED.receipt_id,updated_at=now()`;
    await completeReceipt(tx, receiptId);
    // 空整理也可能取代舊提示詞寫的整理，讀者看到的內容會變。
    await announceArticleReading(tx, articleId);
    return outcome;
  });
  return { status, receiptId, ...(reason && status !== "stale" ? { reason } : {}) };
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
