// Reports: a scheduled run that starts late still writes the issue it was due for, never one whose
// window is still open; a daily whose window nothing was judged in is refused rather than published as a
// quiet day; and an older weekly that froze no summaries shows the cited articles' public summaries.
import { editionAt, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadReport } from "@aihot/backend/publication/reports";
import { composeDaily, dueDaily, dueMonthly, dueWeekly } from "@aihot/backend/reports/compose";
import { SITE } from "@aihot/site";

const T = tag();
const SOURCE = `test-reports-${T}`;
const WEEK = "2098-W20";
after(async () => {
  await stopBoss();
  await closeDb();
});

test("a late run writes the issue that was due, not today's", () => {
  assert.equal(dueDaily(editionAt("daily", "2026-09-29", 6)), "2026-09-29");
  assert.equal(dueDaily(editionAt("daily", "2026-09-30", -60)), "2026-09-29", "the 29th's run delayed until just before the next issue");
  assert.equal(dueWeekly(editionAt("weekly", "2026-09-28")), "2026-W39");
  assert.equal(dueWeekly(editionAt("weekly", "2026-10-05", -60)), "2026-W39", "Monday before its edition time: the next week is not due yet");
  assert.equal(dueWeekly(editionAt("weekly", "2026-10-05", 60)), "2026-W40");
  assert.equal(dueMonthly(editionAt("monthly", "2026-10-01")), "2026-09");
  assert.equal(dueMonthly(editionAt("monthly", "2026-10-01", -60)), "2026-08");
  assert.equal(dueMonthly(editionAt("monthly", "2027-01-15")), "2026-12");
});

test("a daily with nothing judged in its window is refused, not published as a quiet day", async () => {
  const date = "2098-01-15";
  await assert.rejects(composeDaily(date), /nothing judged/);
  const [row] = await sql`SELECT 1 FROM reports WHERE kind = 'daily' AND key = ${date}`;
  assert.equal(row, undefined);
});

test("手動補刊使用實際日界與截止，等所有公開文章含非精選完成正文後才發布", async () => {
  const date = "2024-03-12", start = new Date("2024-03-11T16:00:00Z"), end = new Date("2024-03-12T14:30:00Z");
  const source = `daily-ready-${T}`, id = `daily-ready-${T}`;
  await sql`INSERT INTO sources (id,name,kind,tier) VALUES (${source},'Ready','rss','T1')`;
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at,body_text,body_status)
    VALUES (${id},${source},${id},'https://example.com/ready','Ready',${start},${start},'完整來源','ok')`;
  const options = { start, asOf: end };
  await assert.rejects(composeDaily(date, "補刊", options), /未完成/);
  const [analysis] = await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,score,selected,title_zh,summary_zh)
    VALUES (${id},1,'rule',NULL,30,false,'完整新聞','導讀') RETURNING id`;
  await assert.rejects(composeDaily(date, "分析中", options), /未完成/);
  await sql`UPDATE analyses SET relevance='pass' WHERE id=${analysis!.id}`;
  await sql`UPDATE articles SET processing_state='analyzed',grouping_status='complete' WHERE id=${id}`;
  await publishArticle(id, { releasedAt: start });
  await assert.rejects(composeDaily(date, "補刊", options), /未完成/);
  await sql`INSERT INTO article_readings (article_id,input_revision,analysis_id,override_version,input_hash,prompt_version,sections)
    VALUES (${id},1,${analysis!.id},0,'fixture','fixture','[{"heading":"內容","paragraphs":["完整內容第一段，資料來自原文。","完整內容第二段，包含具體細節。"]}]')`;
  await composeDaily(date, "補刊", options);
  const [saved] = await sql`SELECT window_start,window_end,revision FROM reports WHERE kind='daily' AND key=${date}`;
  assert.equal(saved!.window_start.toISOString(), start.toISOString());
  assert.equal(saved!.window_end.toISOString(), end.toISOString());
  await assert.rejects(composeDaily(date, "未來", { start, asOf: new Date(Date.now()+60_000) }), /截止/);
  await composeDaily(date, "修訂補刊", options);
  assert.equal((await sql`SELECT revision FROM reports WHERE kind='daily' AND key=${date}`)[0]!.revision, 2);
});

test("a weekly that froze no summaries shows the articles' public summaries", async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${SOURCE}, 'Reports', 'rss', 'T1', 'editorial', '2100-01-01')`;
  // Found, published and released a minute ago: a rolling window that ends at the reader's clock holds it.
  const minuteAgo = new Date(Date.now() - 60_000);
  const { articleId } = await upsertMaterial({ sourceId: SOURCE, url: `https://example.com/${T}`, title: `R ${T}`, bodyText: "b", bodyHtml: "<p>b</p>", bodyStatus: "ok", via: "fetch", publishedAt: minuteAgo, discoveredAt: minuteAgo });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'industry', ${`標題-${T}`}, ${`公開摘要-${T}`}, 80, true)`;
  await publishArticle(articleId, { releasedAt: minuteAgo });
  const content = { kind: "weekly", title: `${SITE.name} 週報 · ${WEEK}`, overview: "o", themes: [{ heading: "h", summary: "s", storyRefs: [{ itemId: articleId, title: `標題-${T}`, sourceName: "Old aggregator", sourceId: "old-source", firstParty: false, sourceUrl: "https://example.com" }] }] };
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
            VALUES ('weekly', ${WEEK}, now(), now(), ${sql.json(content as never)}, now(), 'imported')`;
  const report = await loadReport("weekly", WEEK);
  assert.equal(report?.lead, null, "the Traditional issue name is not a news headline");
  await sql`UPDATE reports SET content = ${sql.json({ ...content, title: `${SITE.name} 周报 · ${WEEK}` } as never)} WHERE kind = 'weekly' AND key = ${WEEK}`;
  assert.equal((await loadReport("weekly", WEEK))?.lead, null, "historical Simplified issue names keep the same headline rule");
  assert.equal(report?.sections[0]?.items[0]?.summary, `公開摘要-${T}`);
  assert.equal(report?.sections[0]?.items[0]?.sourceName, "Reports");
  assert.equal(report?.sections[0]?.items[0]?.firstParty, true, "a frozen citation cannot override verified current provenance");
  await sql`UPDATE sources SET tier = 'T1_5', first_party = true WHERE id = ${SOURCE}`;
  await publishArticle(articleId);
  assert.equal((await loadReport("weekly", WEEK))?.sections[0]?.items[0]?.firstParty, false);
});

test("正文確認失敗是終態，不再擋住日報；自動出刊從上一期截止接著算", async () => {
  const date = "2097-05-02", prevEnd = new Date("2097-05-01T14:36:59Z"), at = new Date("2097-05-01T18:00:00Z");
  const source = `daily-terminal-${T}`;
  await sql`INSERT INTO sources (id,name,kind,tier) VALUES (${source},'Terminal','rss','T1')`;
  await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at)
    VALUES ('daily','2097-05-01',${new Date(prevEnd.getTime() - 86400000)},${prevEnd},'{}',${prevEnd})`;
  const add = async (id: string, bodyStatus: string) => {
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at,body_status,processing_state,grouping_status)
      VALUES (${id},${source},${id},${`https://example.com/${id}`},${id},${at},${at},${bodyStatus},'analyzed','complete')`;
    await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,score,selected,title_zh,summary_zh)
      VALUES (${id},1,'rule','pass',80,true,${`新聞 ${id}`},'導讀摘要')`;
    await publishArticle(id, { releasedAt: at });
  };
  await add(`terminal-a-${T}`, "unconfirmed");
  await add(`terminal-b-${T}`, "pending");
  await assert.rejects(composeDaily(date), new RegExp(`未完成.*terminal-b-${T}`), "仍在抓取的正文要等");
  await sql`UPDATE articles SET body_status='unconfirmed' WHERE id=${`terminal-b-${T}`}`;
  await composeDaily(date);
  const [saved] = await sql`SELECT window_start,window_end FROM reports WHERE kind='daily' AND key=${date}`;
  assert.equal(saved!.window_start.toISOString(), prevEnd.toISOString(), "從上一期截止接著算，不重疊");
  assert.equal(saved!.window_end.toISOString(), editionAt("daily", date).toISOString());
});
