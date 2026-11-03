import { test } from "node:test";
import assert from "node:assert/strict";
import { createLunaTransport, selectPilotArticles } from "../scripts/luna-pilot.ts";

const endpoint = "https://api.openai.com/v1/chat/completions";
const request = () => ({ method: "POST", body: JSON.stringify({ model: "gpt-6-luna", messages: [{ role: "user", content: "測試" }], max_tokens: 1500, temperature: 0.2, reasoning_effort: "none" }) });

test("試跑最多選十個來源的十篇最新文章，排除重複、未知與未來日期", () => {
  const now = Date.parse("2026-11-03T08:00:00Z");
  const articles = Array.from({ length: 13 }, (_, i) => ({ sourceId: `source-${i}`, identityKey: `article-${i}`, publishedAt: new Date(now - i * 1000) }));
  const selected = selectPilotArticles([
    { sourceId: "future", identityKey: "future", publishedAt: new Date(now + 1000) },
    { sourceId: "unknown", identityKey: "unknown", publishedAt: null },
    ...articles,
    { ...articles[0]!, sourceId: "duplicate" },
    { ...articles[0]!, identityKey: "same-source-older", publishedAt: new Date(now - 500) },
  ], now);
  assert.equal(selected.length, 10);
  assert.deepEqual(selected.map(a => a.identityKey), Array.from({ length: 10 }, (_, i) => `article-${i}`));
});

test("僅使用 Luna、轉換 OpenAI 輸出參數、禁止重新導向", async () => {
  let sent: Record<string, unknown> | undefined;
  const transport = createLunaTransport(async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    assert.equal(init?.redirect, "error");
    return new Response('{"usage":{"prompt_tokens":10,"completion_tokens":2}}');
  });
  await transport.fetch(endpoint, request());
  assert.equal(sent?.max_completion_tokens, 1500);
  assert.equal("max_tokens" in sent!, false);
  assert.equal(transport.requests(), 1);
  await transport.fetch(endpoint, { ...request(), body: request().body.replace("1500", "16384") });
  assert.equal(sent?.max_completion_tokens, 16384);
  await transport.fetch(endpoint, { ...request(), body: request().body.replace('"max_tokens"', '"max_completion_tokens"') });
  assert.equal(sent?.max_completion_tokens, 1500, "正式 provider 已轉換的請求也可用於有界批次");
});

test("80 次後拒絕新付費請求，計數不因錯誤或重新導向重置", async () => {
  let calls = 0;
  const transport = createLunaTransport(async () => { calls++; return new Response("{}"); }, 79);
  await transport.fetch(endpoint, request());
  await assert.rejects(transport.fetch(endpoint, request()), /80/);
  assert.equal(calls, 1);
});

test("今日批次可明確提高請求上限，十篇試跑預設仍維持 80 次", async () => {
  let calls = 0;
  const transport = createLunaTransport(async () => { calls++; return new Response("{}"); }, 80, message => new Error(message), 82);
  await transport.fetch(endpoint, request());
  await transport.fetch(endpoint, request());
  await assert.rejects(transport.fetch(endpoint, request()), /82/);
  assert.equal(calls, 2);
});

test("拒絕其他模型、端點、超長輸入與過高輸出額度", async () => {
  const bad = [
    { url: "http://ollama:11434/v1/chat/completions", init: request() },
    { url: endpoint, init: { ...request(), body: request().body.replace("gpt-6-luna", "gpt-6-astra") } },
    { url: endpoint, init: { ...request(), body: request().body.replace("1500", "65536") } },
    { url: endpoint, init: { ...request(), body: request().body.replace("測試", "a".repeat(200000)) } },
  ];
  for (const { url, init } of bad) {
    let calls = 0;
    const transport = createLunaTransport(async () => { calls++; return new Response("{}"); });
    await assert.rejects(transport.fetch(url, init));
    assert.equal(calls, 0);
  }
});

test("序列傳送；一次網路失敗會阻止已排隊的後續請求", async () => {
  let calls = 0;
  const transport = createLunaTransport(async () => { calls++; throw new Error("network failure"); });
  const results = await Promise.allSettled([transport.fetch(endpoint, request()), transport.fetch(endpoint, request())]);
  assert.equal(calls, 1);
  assert.ok(results.every(r => r.status === "rejected"));
});
