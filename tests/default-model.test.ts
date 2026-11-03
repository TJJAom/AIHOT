// The engine's own model: one OpenAI-compatible model (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL) runs every
// step of the analysis when nothing picks another one for a step.
import { stub, tag, Reply } from "./setup.ts";
import { analysisStep, SELECTING_SCORE, type AnalysisStep } from "./analysis-steps.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { analyzeArticle } from "@aihot/backend/editorial/analyze";
import { CAPABILITIES, type Capability } from "@aihot/backend/editorial/models";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { chatJson } from "@aihot/backend/providers/llm";
import { z } from "zod";

// Nothing chosen per step: every capability falls back to the `default` model (a step the site
// gives a model of its own is sent back to it by its environment variable).
for (const c of Object.values(CAPABILITIES) as Capability[]) {
  if (c.default === "default") delete process.env[c.env];
  else process.env[c.env] = "default";
}

const T = tag();
const SOURCE = `test-default-model-${T}`;
const seen: Array<{ model: string; step: AnalysisStep }> = [];
const provider = await stub((_hit, req) => {
  const step = analysisStep(req.body);
  seen.push({ model: (JSON.parse(req.body) as { model: string }).model, step });
  const content =
    step === "prefilter" ? { label: "PASS", reason: "測試" }
    : step === "score" ? { attentionScore: SELECTING_SCORE }
    : step === "understand" ? { itemType: "product_launch", authorRole: "principal", tags: ["產品更新"], editorialJudgment: "理由", titleZh: "一個模型的標題", summaryZh: "一個模型寫的摘要。第二句。" }
    : step === "structure" ? { category: "ai-products", tags: ["產品更新"], subjects: [], fact: null }
    : "title_zh: 標題\nsummary_zh: 摘要。";
  return { id: `stub-${seen.length}`, choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
});
Object.assign(process.env, { LLM_BASE_URL: `${provider.url}/v1`, LLM_API_KEY: "test-key", LLM_MODEL: "one-model", MODEL_CALLS_ENABLED: "true" });

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${SOURCE}, 'Test default model', 'rss', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await provider.close();
  await stopBoss();
  await closeDb();
});

test("one model runs the prefilter, both scores, the writing and the structure", async () => {
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${T}`, title: `A product launch ${T}`, bodyText: `A company launched a product with pricing and availability. ${T} `.repeat(6),
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  } as never);
  const res = await analyzeArticle(articleId);
  assert.equal(res!.output!.selected, true);
  assert.equal(res!.output!.titleZh, "一個模型的標題");
  assert.deepEqual(seen.map((r) => r.step).sort(), ["prefilter", "score", "score", "structure", "understand"]);
  assert.ok(seen.every((r) => r.model === "one-model"), "every request names the configured model");
  const services = await sql<{ service: string }[]>`SELECT DISTINCT service FROM receipts WHERE subject LIKE ${`article:${articleId}%`}`;
  assert.deepEqual(services.map((s) => s.service), ["llm"]);
});

test("Luna 的正式呼叫使用完成 token 上限，跨用途串行且重用付費回執", async () => {
  let active = 0, peak = 0;
  const bodies: Record<string, unknown>[] = [];
  const local = await stub(async (_hit, req) => {
    active++; peak = Math.max(peak, active); bodies.push(JSON.parse(req.body));
    await new Promise(resolve => setTimeout(resolve, 30));
    active--;
    return { choices: [{ message: { content: '{"ok":true}' } }] };
  });
  const previous = { LLM_BASE_URL: process.env.LLM_BASE_URL, LLM_MODEL: process.env.LLM_MODEL, LLM_EXTRA_JSON: process.env.LLM_EXTRA_JSON };
  Object.assign(process.env, { LLM_BASE_URL: `${local.url}/v1`, LLM_MODEL: "gpt-6-luna", LLM_EXTRA_JSON: '{"reasoning_effort":"high"}' });
  const request = (purpose: string) => ({ model: "default", purpose, subject: `luna:${T}:${purpose}`, promptVersion: "1", system: "測試", user: "測試", schema: z.object({ ok: z.boolean() }), maxTokens: 16384 });
  try {
    await Promise.all([chatJson(request("understand_article")), chatJson(request("article_reading")), chatJson(request("story_digest"))]);
    assert.equal(peak, 1);
    assert.equal(bodies.length, 3);
    for (const body of bodies) {
      assert.equal(body.max_completion_tokens, 16384);
      assert.equal("max_tokens" in body, false);
      assert.equal(body.reasoning_effort, "none");
    }
    assert.equal((await chatJson(request("article_reading"))).reused, true);
    assert.equal(local.hits(), 3);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await local.close();
  }
});

test("Luna 首筆遭拒仍釋放序列，後續工作不會整天卡住", async () => {
  const local = await stub(hit => hit === 1 ? new Reply(400, { error: "invalid request" })
    : { choices: [{ message: { content: '{"ok":true}' } }] });
  const oldUrl = process.env.LLM_BASE_URL, oldModel = process.env.LLM_MODEL;
  Object.assign(process.env, { LLM_BASE_URL: `${local.url}/v1`, LLM_MODEL: "gpt-6-luna" });
  const request = (id: string) => ({ model: "default", purpose: "article_reading", subject: `rejected:${T}:${id}`, promptVersion: "1", system: "測試", user: id, schema: z.object({ ok: z.boolean() }) });
  try {
    const [first, second] = await Promise.allSettled([chatJson(request("first")), chatJson(request("second"))]);
    assert.equal(first!.status, "rejected");
    assert.equal(second!.status, "fulfilled");
    assert.equal(local.hits(), 2);
  } finally {
    process.env.LLM_BASE_URL = oldUrl; process.env.LLM_MODEL = oldModel;
    await local.close();
  }
});
