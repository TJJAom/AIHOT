// RTX 單批試跑：固定十篇、僅 Luna，不啟動 worker、排程或本機模型。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Candidate } from "@aihot/backend/sources/types";

interface DatedArticle { sourceId: string; identityKey?: string; publishedAt?: Date | null }

export function selectPilotArticles<T extends DatedArticle>(articles: T[], now = Date.now()): T[] {
  const seenSources = new Set<string>();
  const seenArticles = new Set<string>();
  return articles.filter(a => a.publishedAt && a.publishedAt.getTime() <= now && a.publishedAt.getTime() >= now - 360 * 86400000)
    .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())
    .filter(a => {
      if (!a.identityKey || seenSources.has(a.sourceId) || seenArticles.has(a.identityKey)) return false;
      seenSources.add(a.sourceId);
      seenArticles.add(a.identityKey);
      return true;
    }).slice(0, 10);
}

// 此界線仍在 chatJson → paidRequest 內；回執與既有預算檢查不會被繞過。
// 不估算字數後擅自截文：超出單批限制就拒絕，保留原文及錯誤供檢查。
export function createLunaTransport(upstream: typeof fetch, alreadySent = 0, refusal: (message: string) => Error = message => new Error(message), maxRequests = 80) {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) throw new Error("請求上限必須是正整數");
  let sent = alreadySent;
  let stopped = false;
  let tail = Promise.resolve();
  const limitedFetch: typeof fetch = async (input, init) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      if (stopped) throw refusal("本批已停止，不再傳送付費請求");
      if (sent >= maxRequests) throw refusal(`本批最多 ${maxRequests} 次模型請求`);
      if (String(input) !== "https://api.openai.com/v1/chat/completions" || init?.method !== "POST") throw refusal("本批只允許 OpenAI Chat Completions");
      if (typeof init.body !== "string" || Buffer.byteLength(init.body) > 196608) throw refusal("單次輸入超過試跑限制");
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (body.model !== "gpt-6-luna" || body.reasoning_effort !== "none") throw refusal("本批只允許 Luna 非推理模式");
      const maxTokens = Number(body.max_tokens);
      if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 16384) throw refusal("單次輸出必須介於 1 與 16384 token");
      if (!Array.isArray(body.messages) || body.messages.length > 5 || body.messages.some(m => typeof m.content !== "string")) throw refusal("本批僅處理文字訊息");
      body.max_completion_tokens = maxTokens;
      delete body.max_tokens;
      init.signal?.throwIfAborted();
      sent++;
      const response = await upstream(input, { ...init, body: JSON.stringify(body), redirect: "error" });
      const text = await response.text();
      if (!response.ok) stopped = true;
      return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      stopped = true;
      throw error;
    } finally {
      release();
    }
  };
  return { fetch: limitedFetch, requests: () => sent, stop: () => { stopped = true; } };
}

interface PilotItem {
  sourceId: string;
  sourceName: string;
  candidate: Candidate;
  articleId?: string;
  result?: string;
  titleZh?: string;
  summaryZh?: string;
  storyIds?: number[];
}

interface PilotManifest {
  batch: string;
  model: "gpt-6-luna";
  state: "prepared" | "running" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  requests: number;
  sourceCursors: unknown;
  previousJobIds?: string[];
  items: PilotItem[];
  error?: string;
  verification?: unknown;
}

async function main() {
  const [mode, batch] = process.argv.slice(2);
  if (!["--prepare", "--run"].includes(mode ?? "") || !batch || !/^[a-z0-9-]{1,60}$/.test(batch)) throw new Error("用法：node scripts/luna-pilot.ts --prepare|--run 批次名稱");
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
  const { filterPublicationWindow } = await import("@aihot/backend/sources/filters");
  const { fetchRss } = await import("@aihot/backend/sources/rss");
  const { upsertMaterial } = await import("@aihot/backend/content/materials");
  const { extractFromUrl, pageRules } = await import("@aihot/backend/content/extract");
  const { analyzeArticle } = await import("@aihot/backend/editorial/analyze");
  const { groupArticle } = await import("@aihot/backend/events/group");
  const { publishArticle } = await import("@aihot/backend/publication/publish");
  const { CAPABILITIES, modelSources } = await import("@aihot/backend/editorial/models");
  const { ProviderRejectedError } = await import("@aihot/backend/providers/receipts");
  for (const capability of Object.values(CAPABILITIES)) process.env[capability.env] = "default";
  const routes = await modelSources();
  if (Object.values(routes).some(r => r.model !== "default")) throw new Error("後台有其他模型覆寫；本批尚未執行");
  const directory = path.join(config.dataDir, "pilots");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${batch}.json`);
  const sourceCursors = () => sql`SELECT id, cursor FROM sources ORDER BY id`;
  const session = await sql.reserve();
  let manifest: PilotManifest | undefined;
  let transport: ReturnType<typeof createLunaTransport> | undefined;
  const originalFetch = globalThis.fetch;
  const save = () => writeFile(file, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  try {
    const [lock] = await session`SELECT pg_try_advisory_lock(hashtext('aihot-luna-pilot')) AS acquired`;
    if (!lock?.acquired) throw new Error("已有另一個單批試跑進行中");
    if (mode === "--prepare") {
      try { await readFile(file); throw new Error("批次已存在；請先讀回，禁止覆寫或重複採集"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const cursors = await sourceCursors();
      const sources = await sql<{ id: string }[]>`SELECT id FROM sources WHERE enabled AND kind = 'rss' AND participation_mode = 'editorial' ORDER BY id`;
      const candidates: Array<Candidate & { sourceId: string; sourceName: string }> = [];
      for (const { id } of sources) {
        const source = await loadSource(id);
        if (!source) continue;
        try {
          const feed = await fetchRss(source, { force: true });
          const recent = filterPublicationWindow(feed.candidates, source.config.publishedAfter)
            .filter(c => c.publishedAt && c.publishedAt.getTime() <= Date.now())
            .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime()).slice(0, 20);
          const entries = await listingEntries(source, recent);
          candidates.push(...entries.map(c => ({ ...c, sourceId: source.id, sourceName: source.name })));
          console.log(JSON.stringify({ stage: "feed", source: source.name, candidates: entries.length }));
        } catch { console.log(JSON.stringify({ stage: "feed", source: source.name, status: "unavailable" })); }
      }
      const selected: typeof candidates = [];
      const triedSources = new Set<string>();
      while (selected.length < 10) {
        const candidate = selectPilotArticles(candidates.filter(c => !triedSources.has(c.sourceId) && !selected.some(s => s.identityKey === c.identityKey)))[0];
        if (!candidate) throw new Error(`只有 ${selected.length} 篇可確認正文，尚未建立付費批次`);
        triedSources.add(candidate.sourceId);
        if (!candidate.bodyText || candidate.bodyStatus !== "ok") {
          const source = await loadSource(candidate.sourceId);
          const body = await extractFromUrl(candidate.url, `pilot:${batch}`, pageRules(source!.config), { paidFallback: false });
          if (!body) { console.log(JSON.stringify({ stage: "material", source: candidate.sourceName, status: "unconfirmed" })); continue; }
          candidate.bodyText = body.text;
          candidate.bodyHtml = body.html;
          candidate.bodyStatus = "ok";
        }
        selected.push(candidate);
        console.log(JSON.stringify({ stage: "material", source: candidate.sourceName, count: selected.length }));
      }
      const existing = await sql`SELECT id FROM articles WHERE identity_key = ANY(${selected.map(c => c.identityKey!)}::text[])`;
      if (existing.length) throw new Error("候選含已存在文章，須先核對，禁止重複付費處理");
      manifest = { batch, model: "gpt-6-luna", state: "prepared", createdAt: new Date().toISOString(), requests: 0, sourceCursors: cursors,
        items: selected.map(({ sourceId, sourceName, ...candidate }) => ({ sourceId, sourceName, candidate })) };
      await writeFile(file, JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ stage: "prepared", count: 10, file, articles: manifest.items.map(i => ({ source: i.sourceName, title: i.candidate.title, url: i.candidate.url })) }));
      return;
    }
    manifest = JSON.parse(await readFile(file, "utf8")) as PilotManifest;
    if (manifest.batch !== batch || manifest.model !== "gpt-6-luna" || manifest.state !== "prepared" || manifest.items.length !== 10 || new Set(manifest.items.map(i => i.candidate.identityKey)).size !== 10) throw new Error("批次不是尚未執行的十篇名單；禁止自動重試");
    if (JSON.stringify(await sourceCursors()) !== JSON.stringify(manifest.sourceCursors)) throw new Error("來源進度已變動，尚未發出模型請求");
    const existing = await sql`SELECT id FROM articles WHERE identity_key = ANY(${manifest.items.map(i => i.candidate.identityKey!)}::text[])`;
    if (existing.length) throw new Error("名單中的文章已存在，禁止自動重試");
    transport = createLunaTransport(originalFetch, 0, message => new ProviderRejectedError(message, null, false));
    globalThis.fetch = transport.fetch;
    await getBoss();
    manifest.previousJobIds = (await sql<{ id: string }[]>`SELECT id FROM pgboss.job`).map(j => j.id);
    manifest.state = "running";
    manifest.startedAt = new Date().toISOString();
    await save();
    for (const item of manifest.items) {
      const source = await loadSource(item.sourceId);
      if (!source) throw new Error("試跑來源不存在");
      const candidate = item.candidate;
      candidate.publishedAt = candidate.publishedAt ? new Date(candidate.publishedAt) : null;
      candidate.sourceUpdatedAt = candidate.sourceUpdatedAt ? new Date(candidate.sourceUpdatedAt) : null;
      if (!candidate.bodyText || candidate.bodyStatus !== "ok") throw new Error("名單缺少已確認正文，未替換候選");
      const material = await upsertMaterial({ ...candidate, sourceId: item.sourceId, via: `pilot:${batch}` });
      if (!material.created) throw new Error("文章已由另一個程序建立，停止以避免重複處理");
      item.articleId = material.articleId;
      await save();
      const analysis = await analyzeArticle(material.articleId);
      if (!analysis?.output || analysis.stale || analysis.needsBody) throw new Error("文章分析未完成，停止本批");
      item.result = analysis.output.relevance;
      item.titleZh = analysis.output.titleZh;
      item.summaryZh = analysis.output.summaryZh;
      if (analysis.output.relevance === "pass") {
        const grouped = await groupArticle(material.articleId);
        item.storyIds = [...new Set([...(grouped.storyId ? [grouped.storyId] : []), ...(grouped.redirected ?? []), ...(grouped.consolidated ?? []).flatMap(c => [c.from, c.into])])];
      } else await publishArticle(material.articleId);
      manifest.requests = transport.requests();
      await save();
      console.log(JSON.stringify({ stage: "article", completed: manifest.items.filter(i => i.result).length, id: item.articleId, result: item.result, requests: manifest.requests }));
    }
    manifest.state = "completed";
  } catch (error) {
    if (manifest?.state === "running") {
      manifest.state = "failed";
      manifest.error = String(error).slice(0, 600);
      process.exitCode = 1;
    } else throw error;
  } finally {
    transport?.stop();
    globalThis.fetch = originalFetch;
    try {
      if (manifest?.startedAt) {
        manifest.requests = transport?.requests() ?? manifest.requests;
        manifest.finishedAt = new Date().toISOString();
        const ids = manifest.items.flatMap(i => i.articleId ? [i.articleId] : []);
        const associated = await sql<{ story_id: number }[]>`SELECT DISTINCT f.story_id FROM fact_articles fa JOIN facts f ON f.id = fa.fact_id WHERE fa.article_id = ANY(${ids}::text[])`;
        const storyIds = [...new Set([...manifest.items.flatMap(i => i.storyIds ?? []), ...associated.map(r => r.story_id)])].map(String);
        const pending = await sql<{ id: string; name: string }[]>`SELECT id, name FROM pgboss.job WHERE state IN ('created', 'retry')
          AND NOT (id = ANY(${manifest.previousJobIds ?? []}::uuid[]))
          AND (data->>'articleId' = ANY(${ids}::text[]) OR data->>'storyId' = ANY(${storyIds}::text[]))`;
        const boss = pending.length ? await getBoss() : null;
        for (const job of pending) await boss!.cancel(job.name, job.id);
        const receipts = await sql`SELECT purpose, status, usage FROM receipts WHERE service = 'llm' AND model = 'gpt-6-luna' AND created_at >= ${manifest.startedAt}::timestamptz ORDER BY id`;
        const publications = await sql`SELECT article_id, eligible, selected, visibility FROM publications WHERE article_id = ANY(${ids}::text[]) ORDER BY article_id`;
        const cursorsUnchanged = JSON.stringify(await sourceCursors()) === JSON.stringify(manifest.sourceCursors);
        manifest.verification = { cursorsUnchanged, cancelledArticleJobs: pending, receipts, publications };
        if (!cursorsUnchanged) { manifest.state = "failed"; manifest.error = "來源進度在試跑期間發生變動"; process.exitCode = 1; }
        await save();
        console.log(JSON.stringify({ stage: "finished", state: manifest.state, requests: manifest.requests, cursorsUnchanged, cancelledArticleJobs: pending.length, error: manifest.error, file }));
      }
    } finally {
      await session`SELECT pg_advisory_unlock(hashtext('aihot-luna-pilot'))`;
      session.release();
      await stopBoss();
      await closeDb();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
