// RTX 今日單批：以台灣日界篩選全部 RSS 候選，重用既有內容，完成事件摘要後停止。
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Candidate } from "@aihot/backend/sources/types";
import { createLunaTransport } from "./luna-pilot.ts";

export function todayWindow(date: string, cutoff = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日期須為 YYYY-MM-DD");
  const start = Date.parse(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(start) || new Date(start + 8 * 3600000).toISOString().slice(0, 10) !== date || cutoff < start) throw new Error("無效或尚未開始的日期");
  return { start, end: Math.min(start + 86400000, cutoff + 1) };
}

export function inToday(candidate: { publishedAt?: Date | null }, window: { start: number; end: number }) {
  const at = candidate.publishedAt?.getTime();
  return at !== undefined && at >= window.start && at < window.end;
}

interface Item {
  sourceId: string; sourceName: string; candidate: Candidate;
  state: "ready" | "existing" | "unavailable" | "analyzed" | "completed";
  articleId?: string; result?: string; error?: string; storyIds?: number[];
}
interface Manifest {
  batch: string; date: string; cutoff: string; window: { start: number; end: number };
  state: "preparing" | "prepared" | "running" | "completed" | "partial" | "failed";
  sources: Array<{ id: string; name: string; fetched?: number; today?: number; admitted?: number; unknownDates?: number; error?: string }>;
  items: Item[]; sourceCursors: unknown; overrides: unknown; previousJobIds: string[]; requests: number;
  startedAt?: string; finishedAt?: string; error?: string; digests?: Array<{ storyId: number; updated: boolean }>; verification?: unknown;
}

async function main() {
  const [mode, date, batch] = process.argv.slice(2);
  if (!["--prepare", "--run"].includes(mode ?? "") || !date || !batch || !/^[a-z0-9-]{1,60}$/.test(batch)) throw new Error("用法：node scripts/luna-today.ts --prepare|--run YYYY-MM-DD 批次名稱");
  const window = todayWindow(date);
  if (mode === "--run" && !process.env.OPENAI_API_KEY?.trim()) throw new Error("缺少 OPENAI_API_KEY");
  process.env.COLLECT_ENABLED = "false";
  process.env.MODEL_CALLS_ENABLED = mode === "--run" ? "true" : "false";
  process.env.LLM_BASE_URL = "https://api.openai.com/v1";
  process.env.LLM_API_KEY = process.env.OPENAI_API_KEY ?? "";
  process.env.LLM_MODEL = "gpt-6-luna";
  process.env.LLM_EXTRA_JSON = '{"reasoning_effort":"none"}';
  process.env.LLM_REASONING_TOKENS = "0";
  process.env.LLM_JSON_MODE = "true";
  process.env.LLM_VISION = "false";
  for (const name of ["EMBEDDING_API_KEY", "DASHSCOPE_API_KEY", "JINA_API_KEY"]) process.env[name] = "";
  process.env.FEISHU_CONTENT_PUSH_ENABLED = "false";
  process.env.INDEXNOW_SUBMIT_ENABLED = "false";
  const { sql, closeDb } = await import("@aihot/backend/db");
  const { config } = await import("@aihot/backend/config");
  const { getBoss, stopBoss } = await import("@aihot/backend/jobs/queue");
  const { loadSource, listingEntries } = await import("@aihot/backend/sources/collect");
  const { fetchRss } = await import("@aihot/backend/sources/rss");
  const { extractFromUrl, pageRules } = await import("@aihot/backend/content/extract");
  const { upsertMaterial } = await import("@aihot/backend/content/materials");
  const { analyzeArticle } = await import("@aihot/backend/editorial/analyze");
  const { groupArticle } = await import("@aihot/backend/events/group");
  const { composeStoryDigest } = await import("@aihot/backend/events/digest");
  const { liveStory } = await import("@aihot/backend/events/consolidate");
  const { computeHotRanking } = await import("@aihot/backend/events/hot");
  const { digestReports, digestInputsHash } = await import("@aihot/backend/publication/story-evidence");
  const { publishArticle } = await import("@aihot/backend/publication/publish");
  const { composeArticleReading, planArticleReadings } = await import("@aihot/backend/editorial/reading");
  const { articleReadingHtml } = await import("@aihot/backend/publication/reading");
  const { CAPABILITIES, modelSources } = await import("@aihot/backend/editorial/models");
  const { ProviderRejectedError } = await import("@aihot/backend/providers/receipts");
  for (const capability of Object.values(CAPABILITIES)) process.env[capability.env] = "default";
  if (Object.values(await modelSources()).some(route => route.model !== "default")) throw new Error("後台存在非 Luna 模型覆寫");
  const directory = path.join(config.dataDir, "pilots");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${batch}.json`);
  const cursors = () => sql`SELECT id,cursor FROM sources ORDER BY id`;
  const overrides = () => sql`SELECT article_id,fields,visibility,version FROM editorial_overrides ORDER BY article_id`;
  let manifest: Manifest | undefined;
  let transport: ReturnType<typeof createLunaTransport> | undefined;
  const originalFetch = globalThis.fetch;
  const save = async () => { await writeFile(`${file}.tmp`, JSON.stringify(manifest, null, 2), { mode: 0o600 }); await rename(`${file}.tmp`, file); };
  const affectedStories = async () => {
    const ids = manifest!.items.flatMap(i => i.articleId ? [i.articleId] : []);
    const rows = await sql<{ story_id: number }[]>`SELECT DISTINCT f.story_id FROM fact_articles fa JOIN facts f ON f.id=fa.fact_id WHERE fa.article_id=ANY(${ids}::text[])
      UNION SELECT d.story_id FROM grouping_decisions d WHERE d.article_id=ANY(${ids}::text[]) AND d.created_at>=${manifest!.startedAt!}::timestamptz AND d.story_id IS NOT NULL
      UNION SELECT f.story_id FROM grouping_decisions d CROSS JOIN LATERAL jsonb_array_elements(d.candidates) c JOIN facts f ON f.id::text=c->>'id'
        WHERE d.article_id=ANY(${ids}::text[]) AND d.created_at>=${manifest!.startedAt!}::timestamptz`;
    const known = new Set([...rows.map(r => r.story_id), ...(manifest!.digests ?? []).map(r => r.storyId), ...manifest!.items.flatMap(i => i.storyIds ?? [])]);
    for (const id of [...known]) { const current = await liveStory(id); if (current !== null) known.add(current); }
    const ancestors = await sql<{ id: number }[]>`WITH RECURSIVE related AS (
      SELECT id FROM stories WHERE id=ANY(${[...known]}::bigint[])
      UNION SELECT s.id FROM stories s JOIN related r ON s.merged_into=r.id
    ) SELECT id FROM related`;
    return [...new Set([...known, ...ancestors.map(r => r.id)])];
  };
  const session = await sql.reserve();
  try {
    const [lock] = await session`SELECT pg_try_advisory_lock(hashtext('aihot-luna-pilot')) AS acquired`;
    assert.ok(lock?.acquired, "已有其他單批工作執行中");
    assert.equal((await sql`SELECT id FROM pgboss.job WHERE state IN ('created','retry','active')`).length, 0, "先確認既有待辦範圍");
    if (mode === "--prepare") {
      manifest = { batch, date, cutoff: new Date(window.end - 1).toISOString(), window, state: "preparing", sources: [], items: [], sourceCursors: await cursors(), overrides: await overrides(), previousJobIds: [], requests: 0 };
      await writeFile(file, JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
      const sources = await sql<{ id: string }[]>`SELECT id FROM sources WHERE enabled AND kind='rss' AND participation_mode='editorial' ORDER BY id`;
      const seen = new Set<string>();
      for (const { id } of sources) {
        const source = await loadSource(id);
        assert.ok(source);
        const record: Manifest["sources"][number] = { id, name: source.name };
        manifest.sources.push(record);
        try {
          const feed = await fetchRss(source, { force: true });
          record.fetched = feed.candidates.length;
          record.unknownDates = feed.candidates.filter(c => !c.publishedAt).length;
          const dated = feed.candidates.filter(c => inToday(c, window));
          record.today = dated.length;
          const entries = await listingEntries(source, dated);
          record.admitted = entries.length;
          for (const candidate of entries) {
            assert.ok(inToday(candidate, window), "來源日期規則改變，需核對正文日期");
            assert.ok(candidate.identityKey);
            if (seen.has(candidate.identityKey)) continue;
            seen.add(candidate.identityKey);
            const [existing] = await sql<{ id: string; processing_state: string; grouping_status: string }[]>`SELECT id,processing_state,grouping_status FROM articles WHERE identity_key=${candidate.identityKey}`;
            if (existing) {
              assert.ok(["analyzed", "blocked", "skipped"].includes(existing.processing_state) && existing.grouping_status === "complete", "既有文章未完成，需先核對處理進度");
              manifest.items.push({ sourceId: id, sourceName: source.name, candidate, articleId: existing.id, state: "existing" });
              continue;
            }
            const item: Item = { sourceId: id, sourceName: source.name, candidate, state: "ready" };
            manifest.items.push(item);
            if (!candidate.bodyText || candidate.bodyStatus !== "ok") {
              try {
                const body = await extractFromUrl(candidate.url, `today:${batch}`, pageRules(source.config), { paidFallback: false });
                if (!body) throw new Error("無法確認公開正文");
                candidate.bodyText = body.text; candidate.bodyHtml = body.html; candidate.bodyStatus = "ok";
              } catch (error) { item.state = "unavailable"; item.error = String(error).slice(0, 300); }
            }
          }
        } catch (error) { record.error = String(error).slice(0, 300); }
        await save();
        console.log(JSON.stringify({ stage: "source", ...record, ready: manifest.items.filter(i => i.state === "ready").length, unavailable: manifest.items.filter(i => i.state === "unavailable").length }));
      }
      manifest.state = "prepared"; await save();
      console.log(JSON.stringify({ stage: "prepared", file, count: manifest.items.length, ready: manifest.items.filter(i => i.state === "ready").length, existing: manifest.items.filter(i => i.state === "existing").length, unavailable: manifest.items.filter(i => i.state === "unavailable").map(i => ({ source: i.sourceName, url: i.candidate.url, error: i.error })) }));
      return;
    }
    manifest = JSON.parse(await readFile(file, "utf8")) as Manifest;
    assert.equal(manifest.state, "prepared", "已執行的批次不得盲目重跑");
    assert.equal(manifest.batch, batch); assert.equal(manifest.date, date);
    assert.equal(JSON.stringify(await cursors()), JSON.stringify(manifest.sourceCursors));
    assert.equal(JSON.stringify(await overrides()), JSON.stringify(manifest.overrides));
    for (const item of manifest.items) {
      item.candidate.publishedAt = item.candidate.publishedAt ? new Date(item.candidate.publishedAt) : null;
      item.candidate.sourceUpdatedAt = item.candidate.sourceUpdatedAt ? new Date(item.candidate.sourceUpdatedAt) : null;
      assert.ok(inToday(item.candidate, manifest.window));
      if (item.state === "ready") assert.ok(item.candidate.bodyStatus === "ok" && item.candidate.bodyText);
    }
    transport = createLunaTransport(originalFetch, 0, message => new ProviderRejectedError(message, null, false), Math.max(80, manifest.items.length * 30));
    globalThis.fetch = transport.fetch;
    await getBoss();
    manifest.previousJobIds = (await sql<{ id: string }[]>`SELECT id FROM pgboss.job`).map(j => j.id);
    manifest.state = "running"; manifest.startedAt = new Date().toISOString(); await save();
    for (const item of manifest.items.filter(i => i.state === "ready")) {
      const material = await upsertMaterial({ ...item.candidate, sourceId: item.sourceId, via: `today:${batch}` });
      assert.ok(material.created, "候選已由另一個工作建立，先讀回再繼續");
      item.articleId = material.articleId; await save();
      const analysis = await analyzeArticle(material.articleId);
      assert.ok(analysis?.output && !analysis.stale && !analysis.needsBody, "分析未完成");
      item.result = analysis.output.relevance; item.state = "analyzed"; await save();
      if (analysis.output.relevance === "pass") {
        const grouped = await groupArticle(material.articleId);
        item.storyIds = [...new Set([...(grouped.storyId ? [grouped.storyId] : []), ...(grouped.redirected ?? []), ...(grouped.consolidated ?? []).flatMap(c => [c.from, c.into])])];
        const error = grouped.consolidationError || grouped.reclaimError || grouped.rematchError;
        if (error) { item.error = error; await save(); throw new Error(`歸組部分失敗，先核對已保存回執：${error}`); }
      } else await publishArticle(material.articleId);
      item.state = "completed"; manifest.requests = transport.requests(); await save();
      console.log(JSON.stringify({ stage: "article", id: item.articleId, result: item.result, done: manifest.items.filter(i => i.state === "completed").length, requests: manifest.requests }));
    }
    const storyIds = [...new Set((await Promise.all((await affectedStories()).map(liveStory))).filter((id): id is number => id !== null))];
    manifest.digests = [];
    for (const storyId of storyIds) {
      const result = await composeStoryDigest(storyId);
      const reports = await digestReports(sql, [storyId]);
      if (reports.length) {
        const [stored] = await sql<{ inputs_hash: string }[]>`SELECT inputs_hash FROM story_digests WHERE story_id=${storyId} ORDER BY version DESC LIMIT 1`;
        assert.equal(stored?.inputs_hash, digestInputsHash(reports), "事件摘要尚未涵蓋目前公開文章");
      }
      manifest.digests.push({ storyId, updated: result.updated }); manifest.requests = transport.requests(); await save();
      console.log(JSON.stringify({ stage: "digest", storyId, ...result, requests: manifest.requests }));
    }
    for (const item of await planArticleReadings(manifest.items.flatMap(i => i.articleId ? [i.articleId] : []))) {
      const reading = await composeArticleReading(item.articleId, item.inputHash);
      assert.ok(["written", "current"].includes(reading.status) && await articleReadingHtml(item.articleId), `文章 ${item.articleId} 尚無完整整理內文`);
      manifest.requests = transport.requests(); await save();
    }
    await computeHotRanking();
    manifest.state = manifest.sources.some(s => s.error || s.unknownDates) || manifest.items.some(i => i.state === "unavailable") ? "partial" : "completed";
  } catch (error) {
    if (manifest?.state === "running") { manifest.state = "failed"; manifest.error = String(error).slice(0, 600); process.exitCode = 1; }
    else throw error;
  } finally {
    transport?.stop(); globalThis.fetch = originalFetch;
    try {
      if (manifest?.startedAt) {
        manifest.requests = transport?.requests() ?? manifest.requests; manifest.finishedAt = new Date().toISOString();
        // 只取消本批文章與受影響事件的衍生工作，保留其他操作新增的待辦。
        const ids = manifest.items.flatMap(i => i.articleId ? [i.articleId] : []);
        const storyIds = (await affectedStories()).map(String);
        const related = await sql<{ article_id: string }[]>`SELECT fa.article_id FROM fact_articles fa JOIN facts f ON f.id=fa.fact_id WHERE f.story_id::text=ANY(${storyIds}::text[])`;
        const articleIds = [...new Set([...ids, ...related.map(row => row.article_id)])];
        const pending = await sql<{ id: string; name: string; data: unknown }[]>`SELECT id,name,data FROM pgboss.job WHERE state IN ('created','retry') AND NOT(id=ANY(${manifest.previousJobIds}::uuid[]))
          AND (data->>'articleId'=ANY(${articleIds}::text[]) OR data->>'storyId'=ANY(${storyIds}::text[]))`;
        const boss = pending.length ? await getBoss() : null;
        for (const job of pending) await boss!.cancel(job.name, job.id);
        const receiptRows = await sql`SELECT id,purpose,status,model,usage FROM receipts WHERE created_at>=${manifest.startedAt}::timestamptz ORDER BY id`;
        const remaining = await sql`SELECT id,name FROM pgboss.job WHERE state IN ('created','retry','active') AND NOT(id=ANY(${manifest.previousJobIds}::uuid[]))`;
        const cursorsUnchanged = JSON.stringify(await cursors()) === JSON.stringify(manifest.sourceCursors);
        const overridesUnchanged = JSON.stringify(await overrides()) === JSON.stringify(manifest.overrides);
        manifest.verification = { cursorsUnchanged, overridesUnchanged, receipts: receiptRows, cancelledJobs: pending, remainingJobs: remaining };
        if (remaining.length || receiptRows.some(row => row.status !== "completed" || row.model !== "gpt-6-luna")) { manifest.state = "failed"; manifest.error ??= "仍有未完成的工作或模型回執，需核對"; process.exitCode = 1; }
        if (!cursorsUnchanged || !overridesUnchanged) { manifest.state = "failed"; manifest.error = "來源游標或人工覆寫在執行期間改變"; process.exitCode = 1; }
        await save();
        console.log(JSON.stringify({ stage: "finished", state: manifest.state, requests: manifest.requests, cursorsUnchanged, overridesUnchanged, cancelledJobs: pending.length, error: manifest.error }));
      }
    } finally { await session`SELECT pg_advisory_unlock(hashtext('aihot-luna-pilot'))`; session.release(); await stopBoss(); await closeDb(); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
