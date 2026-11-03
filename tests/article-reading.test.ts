import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadItemDetail, exportMarkdown } from "@aihot/backend/publication/detail";
import { composeArticleReading, composePendingReadings, planArticleReadings } from "@aihot/backend/editorial/reading";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { overrideFields, setVisibility } from "@aihot/backend/admin/content";

const source = `reading-${tag()}`;
let answer = { sections: [{ heading: "發生什麼事", paragraphs: ["研究團隊公開了新的評測結果，結果只適用於這次實驗。"] }, { heading: "背景與限制", paragraphs: ["測試使用固定樣本，原文沒有提供正式上線時程。"] }] };
let requestText = "";
let duringResponse: (() => Promise<void>) | null = null;
const provider = await stub(async (_hit, req) => {
  requestText = req.body;
  if (duringResponse) { const run = duringResponse; duringResponse = null; await run(); }
  return { choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } };
});

test("摘要限定、撤回、blocked 與已改版材料不會洩出舊整理內文", async () => {
  for (const visibility of ["summary-only", "withdrawn"] as const) {
    const id = await article(visibility);
    await composeArticleReading(id);
    await setVisibility(id, { visibility, reason: "測試可見性", version: 0 }, "test");
    const page = await loadItemDetail(id);
    if (visibility === "withdrawn") assert.equal(page.kind, "not_found");
    else { assert.equal(page.kind, "found"); if (page.kind === "found") assert.equal(page.item.body, null); }
    assert.equal(await exportMarkdown(id), null);
    const hits = provider.hits();
    assert.equal((await composeArticleReading(id)).status, "skipped");
    assert.equal(provider.hits(), hits);
  }
  const blocked = await article("blocked");
  await composeArticleReading(blocked);
  await sql`UPDATE analyses SET relevance='block' WHERE article_id=${blocked}`;
  await publishArticle(blocked);
  const page = await loadItemDetail(blocked);
  if (page.kind === "found") assert.equal(page.item.body, null);
  assert.doesNotMatch((await exportMarkdown(blocked))?.body ?? "", /背景與限制/);
  assert.equal((await composeArticleReading(blocked)).status, "skipped");
  const revised = await article("revised");
  await composeArticleReading(revised);
  await sql`UPDATE articles SET revision=2 WHERE id=${revised}`;
  const newer = await loadItemDetail(revised);
  if (newer.kind === "found") assert.equal(newer.item.body, null);
});

test("模型標記只當文字；晚到結果不覆蓋人工更正，重跑使用完整原文與目前校正", async () => {
  const id = await article("correction");
  answer = { sections: [{ heading: '<script>alert(1)</script>', paragraphs: ['<img src=x onerror=alert(1)> 已確認營收為原先12倍，不是年增12倍。', '原文未提供其他比較期間，不能推測新的成長率。'] }] };
  duringResponse = () => overrideFields(id, { fields: { title: "營收是去年同期12倍", summary: "校正後導讀。" }, reason: "倍數校正", version: 0 }, "test").then(() => {});
  assert.equal((await composeArticleReading(id)).status, "stale");
  const stale = await loadItemDetail(id);
  if (stale.kind === "found") assert.equal(stale.item.body, null);
  assert.equal((await composeArticleReading(id)).status, "written");
  assert.match(requestText, /校正後導讀/);
  const page = await loadItemDetail(id);
  assert.equal(page.kind, "found");
  if (page.kind !== "found") return;
  assert.equal(page.item.title, "營收是去年同期12倍");
  assert.equal(page.item.summary, "校正後導讀。");
  assert.doesNotMatch(page.item.body!.zh!, /<script|<img/);
  assert.match(page.item.body!.zh!, /&lt;img/);
  assert.doesNotMatch((await exportMarkdown(id))!.body, /<script|<img/);
});

test("只有一段摘要不算完成，也不自動重送付費請求", async () => {
  const id = await article("too-short");
  answer = { sections: [{ heading: "摘要", paragraphs: ["保留的導讀摘要。"] }] };
  const hits = provider.hits();
  await assert.rejects(composeArticleReading(id), /至少兩個|導讀/);
  await assert.rejects(composeArticleReading(id), /至少兩個|導讀/);
  assert.equal(provider.hits() - hits, 1);
  const detail = await loadItemDetail(id);
  if (detail.kind === "found") assert.equal(detail.item.body, null);
  await setVisibility(id, { visibility: "withdrawn", reason: "測試清理", version: 0 }, "test");
});
process.env.UNDERSTAND_MODEL = "default";
process.env.LLM_BASE_URL = `${provider.url}/v1`;
process.env.LLM_API_KEY = "test-key";
process.env.LLM_MODEL = "local-reading-stub";
after(async () => { await provider.close(); await stopBoss(); await closeDb(); });

async function article(suffix: string) {
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext,syndicate_fulltext,next_fetch_at)
    VALUES(${source},'來源','rss','T2','editorial',false,false,'2100-01-01') ON CONFLICT DO NOTHING`;
  const material = await upsertMaterial({ sourceId: source, url: `https://example.org/${source}/${suffix}`, title: suffix,
    bodyText: "ORIGINAL_ONLY The researchers released benchmark results. No release date was provided.",
    bodyHtml: "<p>ORIGINAL_ONLY The researchers released benchmark results.</p>", bodyStatus: "ok", via: "test", publishedAt: new Date() });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,score,selected)
    VALUES(${material.articleId},1,'rule','pass','評測結果','保留的導讀摘要。',25,false)`;
  await sql`UPDATE articles SET grouping_status='complete' WHERE id=${material.articleId}`;
  await publishArticle(material.articleId);
  return material.articleId;
}

test("非精選且來源不允許全文的文章，有獨立整理內文；重跑不重付費且 Markdown 與頁面一致", async () => {
  answer = { sections: [{ heading: "發生什麼事", paragraphs: ["研究團隊公開了新的評測結果，結果只適用於這次實驗。"] }, { heading: "背景與限制", paragraphs: ["測試使用固定樣本，原文沒有提供正式上線時程。"] }] };
  const id = await article("readable");
  const before = provider.hits();
  assert.equal((await composeArticleReading(id)).status, "written");
  const detail = await loadItemDetail(id);
  assert.equal(detail.kind, "found");
  if (detail.kind !== "found") return;
  assert.equal(detail.item.selected, false);
  assert.equal(detail.item.summary, "保留的導讀摘要。");
  assert.equal(detail.item.body?.zhKind, "reading");
  assert.match(detail.item.body!.zh!, /背景與限制/);
  assert.equal(detail.item.body?.original, null);
  assert.doesNotMatch(JSON.stringify(detail.item), /ORIGINAL_ONLY/);
  const markdown = await exportMarkdown(id);
  assert.match(markdown!.body, /AI 重點整理/);
  assert.match(markdown!.body, /原文沒有提供正式上線時程/);
  assert.doesNotMatch(markdown!.body, /ORIGINAL_ONLY/);
  assert.match(requestText, /ORIGINAL_ONLY/);
  assert.equal((await composeArticleReading(id)).status, "current");
  assert.equal(provider.hits() - before, 1);
  await sql`DELETE FROM article_readings WHERE article_id=${id}`;
  assert.equal((await composeArticleReading(id)).status, "written", "回執已付費但投影未保存時，恢復使用相同回執");
  assert.equal(provider.hits() - before, 1);
});

test("worker 的補齊流程實際為新非精選文章生成內文，重跑沒有新付費", async () => {
  const id = await article("future");
  const before = provider.hits();
  const results = await composePendingReadings();
  assert.ok(results.some(r => r.articleId === id && r.status === "written"));
  const page = await loadItemDetail(id);
  assert.ok(page.kind === "found" && page.item.body?.zhKind === "reading");
  assert.deepEqual(await composePendingReadings(), []);
  assert.equal(provider.hits() - before, 1);
});

test("固定名單在付費前核對版本；過長原文明確拒絕而不截短", async () => {
  const id = await article("bounded");
  const [plan] = await planArticleReadings([id]);
  await overrideFields(id, { fields: { summary: "新的校正導讀，不可沿用上一版整理。" }, reason: "校正", version: 0 }, "test");
  const before = provider.hits();
  await assert.rejects(composeArticleReading(id, plan!.inputHash), /已變更/);
  await sql`UPDATE articles SET body_text=${"完整來源資料".repeat(40000)} WHERE id=${id}`;
  await assert.rejects(planArticleReadings([id]), /超過單次閱讀整理上限/);
  await assert.rejects(composeArticleReading(id), /超過單次閱讀整理上限/);
  assert.equal(provider.hits(), before);
});

test("worker 首筆無法整理時仍完成後續文章，但整輪明確回報失敗", async () => {
  const bad = await article("bad-first");
  await sql`UPDATE articles SET body_text=${"過長完整來源".repeat(40000)} WHERE id=${bad}`;
  const good = await article("good-after");
  await assert.rejects(composePendingReadings(), AggregateError);
  const page = await loadItemDetail(good);
  assert.ok(page.kind === "found" && page.item.body?.zhKind === "reading", "壞首筆不能餓死好後筆");
  const unchanged = await loadItemDetail(bad);
  if (unchanged.kind === "found") assert.equal(unchanged.item.body, null);
});
