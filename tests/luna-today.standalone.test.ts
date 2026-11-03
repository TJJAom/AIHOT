import { test } from "node:test";
import assert from "node:assert/strict";
import { inToday, todayWindow, completedTodayArticle } from "../scripts/luna-today.ts";

test("今日重掃重用已封鎖或略過文章，僅通過分析的文章需要完成歸組", () => {
  assert.equal(completedTodayArticle({ processing_state: "blocked", grouping_status: "pending" }), true);
  assert.equal(completedTodayArticle({ processing_state: "skipped", grouping_status: "pending" }), true);
  assert.equal(completedTodayArticle({ processing_state: "analyzed", grouping_status: "pending" }), false);
  assert.equal(completedTodayArticle({ processing_state: "analyzed", grouping_status: "complete" }), true);
  assert.equal(completedTodayArticle({ processing_state: "failed", grouping_status: "complete" }), false);
});

test("台灣今日從 UTC 前日 16:00 開始，含起點但不含次日與未知日期", () => {
  const window = todayWindow("2026-11-03", Date.parse("2026-11-04T00:00:00Z"));
  assert.deepEqual(window, { start: Date.parse("2026-11-02T16:00:00Z"), end: Date.parse("2026-11-03T16:00:00Z") });
  for (const [date, expected] of [["2026-11-02T15:59:59Z", false], ["2026-11-02T16:00:00Z", true], ["2026-11-03T15:59:59Z", true], ["2026-11-03T16:00:00Z", false]] as const) assert.equal(inToday({ publishedAt: new Date(date) }, window), expected);
  assert.equal(inToday({ publishedAt: null }, window), false);
  assert.equal(inToday({ publishedAt: new Date("invalid") }, window), false);
});

test("今日批次只處理截止時刻已發布文章，不接受尚未到來或無效日期", () => {
  const cutoff = Date.parse("2026-11-03T06:00:00Z");
  const window = todayWindow("2026-11-03", cutoff);
  assert.equal(inToday({ publishedAt: new Date(cutoff) }, window), true);
  assert.equal(inToday({ publishedAt: new Date(cutoff + 1) }, window), false);
  assert.throws(() => todayWindow("2026-11-04", cutoff));
  assert.throws(() => todayWindow("2026-02-30", cutoff));
});
