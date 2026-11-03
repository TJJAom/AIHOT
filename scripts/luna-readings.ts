// 固定名單、單次一個請求的閱讀整理補齊；不採集、不評分、不改人工覆寫、不啟動 worker。
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createLunaTransport } from "./luna-pilot.ts";

interface PlannedItem { articleId: string; revision: number; inputHash: string; inputBytes: number; status?: string; receiptId?: number }
interface Manifest {
  batch: string; state: "prepared" | "running" | "completed" | "failed";
  items: PlannedItem[]; sourceCursors: unknown; overrides: unknown; previousJobIds: string[];
  receiptBaseline: number; requests: number; startedAt?: string; finishedAt?: string; error?: string; verification?: unknown;
}

async function main() {
  const [mode, batch] = process.argv.slice(2);
  assert.ok(["--prepare", "--run"].includes(mode ?? "") && batch && /^[a-z0-9-]{1,60}$/.test(batch), "用法：luna-readings.ts --prepare|--run 批次名稱");
  if (mode === "--run") assert.ok(process.env.OPENAI_API_KEY?.trim(), "缺少 OPENAI_API_KEY");
  Object.assign(process.env, { COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: mode === "--run" ? "true" : "false",
    LLM_BASE_URL: "https://api.openai.com/v1", LLM_API_KEY: process.env.OPENAI_API_KEY ?? "", LLM_MODEL: "gpt-6-luna",
    LLM_EXTRA_JSON: '{"reasoning_effort":"none"}', LLM_REASONING_TOKENS: "0", LLM_JSON_MODE: "true", LLM_VISION: "false",
    FEISHU_CONTENT_PUSH_ENABLED: "false", INDEXNOW_SUBMIT_ENABLED: "false", EMBEDDING_API_KEY: "", DASHSCOPE_API_KEY: "", JINA_API_KEY: "" });
  const { sql, closeDb } = await import("@aihot/backend/db");
  const { config } = await import("@aihot/backend/config");
  const { CAPABILITIES, modelSources } = await import("@aihot/backend/editorial/models");
  const { composeArticleReading, planArticleReadings } = await import("@aihot/backend/editorial/reading");
  const { articleReadingHtml } = await import("@aihot/backend/publication/reading");
  const { ProviderRejectedError } = await import("@aihot/backend/providers/receipts");
  for (const capability of Object.values(CAPABILITIES)) process.env[capability.env] = "default";
  assert.ok(Object.values(await modelSources()).every(route => route.model === "default"), "後台有非 Luna 模型覆寫");
  const directory = path.join(config.dataDir, "pilots");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${batch}.json`);
  const snapshot = async () => ({
    sourceCursors: await sql`SELECT id,cursor,site_fulltext,syndicate_fulltext FROM sources ORDER BY id`,
    overrides: await sql`SELECT article_id,fields,visibility,version FROM editorial_overrides ORDER BY article_id`,
  });
  let manifest: Manifest | undefined;
  let transport: ReturnType<typeof createLunaTransport> | undefined;
  const originalFetch = globalThis.fetch;
  const save = async () => { await writeFile(`${file}.tmp`, JSON.stringify(manifest, null, 2), { mode: 0o600 }); await rename(`${file}.tmp`, file); };
  const session = await sql.reserve();
  try {
    const [lock] = await session`SELECT pg_try_advisory_lock(hashtext('aihot-luna-pilot')) AS acquired`;
    assert.ok(lock?.acquired, "已有其他單批工作執行中");
    assert.equal((await sql`SELECT id FROM pgboss.job WHERE state IN ('created','retry','active')`).length, 0, "先核對現有待辦，持續 worker 必須停止");
    if (mode === "--prepare") {
      const items = await planArticleReadings();
      assert.ok(items.length > 0, "沒有可整理的公開文章");
      const [baseline] = await sql`SELECT coalesce(max(id),0)::int AS id FROM receipts`;
      manifest = { batch, state: "prepared", items, ...await snapshot(), previousJobIds: (await sql<{ id: string }[]>`SELECT id FROM pgboss.job`).map(j => j.id),
        receiptBaseline: baseline!.id, requests: 0 };
      await writeFile(file, JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ stage: "prepared", file, articles: items.length, maxInputBytes: Math.max(...items.map(i => i.inputBytes)) }));
      return;
    }
    manifest = JSON.parse(await readFile(file, "utf8")) as Manifest;
    assert.equal(manifest.batch, batch);
    assert.ok(["prepared", "running", "failed", "completed"].includes(manifest.state));
    assert.equal(new Set(manifest.items.map(i => i.articleId)).size, manifest.items.length);
    assert.equal(JSON.stringify(await snapshot()), JSON.stringify({ sourceCursors: manifest.sourceCursors, overrides: manifest.overrides }));
    const ids = manifest.items.map(i => i.articleId);
    const plan = await planArticleReadings(ids);
    assert.deepEqual(plan, manifest.items.map(({ articleId, revision, inputHash, inputBytes }) => ({ articleId, revision, inputHash, inputBytes })), "名單內容已變更，禁止替換候選或盲目重跑");
    const previous = await sql<{ id: number; status: string; attempts: number }[]>`SELECT id,status,attempts FROM receipts
      WHERE id>${manifest.receiptBaseline} AND purpose='article_reading' AND split_part(split_part(subject,':',2),'@',1)=ANY(${ids}::text[])`;
    assert.ok(previous.every(r => ["received", "completed"].includes(r.status)), "有失敗／未知／尚在執行回執，先人工核對；禁止自動重送");
    transport = createLunaTransport(originalFetch, previous.reduce((sum, r) => sum + r.attempts, 0), message => new ProviderRejectedError(message, null, false), manifest.items.length);
    globalThis.fetch = transport.fetch;
    manifest.state = "running"; manifest.startedAt ??= new Date().toISOString(); delete manifest.error; await save();
    for (const item of manifest.items) {
      const result = await composeArticleReading(item.articleId, item.inputHash);
      assert.ok(result.status === "written" || result.status === "current", `文章 ${item.articleId} 整理未完成：${result.status}`);
      assert.ok(await articleReadingHtml(item.articleId), `文章 ${item.articleId} 尚無可公開整理正文`);
      Object.assign(item, result); manifest.requests = transport.requests(); await save();
      console.log(JSON.stringify({ stage: "reading", id: item.articleId, status: result.status, requests: manifest.requests }));
    }
    manifest.state = "completed";
  } catch (error) {
    if (manifest?.startedAt) { manifest.state = "failed"; manifest.error = String(error).slice(0, 600); process.exitCode = 1; }
    else throw error;
  } finally {
    transport?.stop(); globalThis.fetch = originalFetch;
    try {
      if (manifest?.startedAt && transport) {
        manifest.requests = transport.requests(); manifest.finishedAt = new Date().toISOString();
        const unchanged = JSON.stringify(await snapshot()) === JSON.stringify({ sourceCursors: manifest.sourceCursors, overrides: manifest.overrides });
        const ids = manifest.items.map(i => i.articleId);
        const receipts = await sql`SELECT id,purpose,status,model,usage FROM receipts WHERE id>${manifest.receiptBaseline}
          AND purpose='article_reading' AND split_part(split_part(subject,':',2),'@',1)=ANY(${ids}::text[]) ORDER BY id`;
        const newJobs = await sql`SELECT id,name,state FROM pgboss.job WHERE NOT(id=ANY(${manifest.previousJobIds}::uuid[])) AND state IN ('created','retry','active')`;
        manifest.verification = { unchanged, receipts, newJobs };
        if (!unchanged || newJobs.length || receipts.some(r => r.status !== "completed" || r.model !== "gpt-6-luna")) {
          manifest.state = "failed"; manifest.error ??= "來源／人工覆寫改變，或仍有未完成回執／待辦"; process.exitCode = 1;
        }
        await save();
        console.log(JSON.stringify({ stage: "finished", state: manifest.state, articles: manifest.items.length, requests: manifest.requests, unchanged, error: manifest.error }));
      }
    } finally { await session`SELECT pg_advisory_unlock(hashtext('aihot-luna-pilot'))`; session.release(); await closeDb(); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
