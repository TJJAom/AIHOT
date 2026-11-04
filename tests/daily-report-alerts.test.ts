import { editionAt } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { beijingAt } from "@aihot/contracts/time";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { checkAlerts, collectFindings } from "@aihot/backend/operations/alerts";

const at = (date: string, time = "10:00") => beijingAt(date, time).getTime();
const overdue = (date: string, minutes = 0) => editionAt("daily", date, 7200 + minutes * 60).getTime();
const key = (date: string) => `report.daily:${date}`;
const daily = (keys: string[]) => keys.filter(k => k.startsWith("report.daily"));
async function report(date: string) {
  await sql`INSERT INTO reports(kind,key,window_start,window_end,content,generated_at) VALUES('daily',${date},${new Date(at(date))},${new Date(at(date))},'{}',${new Date(at(date))})`;
}
async function attempt(date: string) {
  await sql`INSERT INTO job_runs(job,started_at,status) VALUES('reports.compose',${editionAt("daily", date)},'failed')`;
}
before(async () => { await getBoss(); });
beforeEach(async () => {
  Object.assign(process.env, { COLLECT_ENABLED: "true", MODEL_CALLS_ENABLED: "true", FEISHU_INTERNAL_ENABLED: "false" });
  await sql`DELETE FROM reports`;
  await sql`DELETE FROM job_runs WHERE job='reports.compose'`;
  await sql`DELETE FROM settings WHERE key IN ('alerts.state','heartbeat.worker')`;
});
after(async () => { await stopBoss(); await closeDb(); });

test("midnight preserves a missing edition; each date recovers only when its report exists", async () => {
  await attempt("2026-10-06");
  let result = await checkAlerts(at("2026-10-06", "23:30"));
  assert.deepEqual(daily(result.sent), [key("2026-10-06")]);
  result = await checkAlerts(at("2026-10-07", "00:10"));
  assert.deepEqual(daily(result.open), [key("2026-10-06")]);
  assert.deepEqual(daily(result.sent), []);
  result = await checkAlerts(overdue("2026-10-07"));
  assert.deepEqual(daily(result.open).sort(), [key("2026-10-06"), key("2026-10-07")]);
  await report("2026-10-07");
  result = await checkAlerts(overdue("2026-10-07", 10));
  assert.deepEqual(daily(result.sent), [`${key("2026-10-07")}:recovered`]);
  assert.deepEqual(daily(result.open), [key("2026-10-06")]);
  await report("2026-10-06");
  assert.deepEqual(daily((await checkAlerts(overdue("2026-10-07", 20))).sent), [`${key("2026-10-06")}:recovered`]);
  assert.deepEqual(daily((await checkAlerts(overdue("2026-10-07", 30))).sent), []);
});

test("recent gap detection uses report activity and each edition's overdue time", async () => {
  await sql`INSERT INTO job_runs(job,started_at,status) VALUES('reports.compose',${new Date(at("2026-10-05"))},'failed')`;
  await report("2026-10-06");
  const findings = await collectFindings(overdue("2026-10-07", -1));
  assert.deepEqual(daily(findings.map(f => f.key)), [key("2026-10-05")]);
  await report("2026-09-01");
  // 08:00 出刊的兩小時寬限在 10/7 10:00 到期；最近七個日曆日從 10/1 起算。
  assert.deepEqual(daily((await collectFindings(overdue("2026-10-07"))).map(f => f.key)),
    [1,2,3,4,5,7].map(d => key(`2026-10-0${d}`)));
});

test("open dates outlive disabled generation and restarts keep checking missing editions", async () => {
  await attempt("2026-10-01");
  await checkAlerts(overdue("2026-10-01"));
  await sql`DELETE FROM job_runs WHERE job='reports.compose'`;
  process.env.MODEL_CALLS_ENABLED = "false";
  let result = await checkAlerts(overdue("2026-10-06"));
  assert.deepEqual(daily(result.open), [key("2026-10-01")]);
  assert.deepEqual(daily(result.sent), []);
  process.env.MODEL_CALLS_ENABLED = "true";
  await attempt("2026-10-06");
  await sql`INSERT INTO settings(key,value) VALUES('heartbeat.worker',${sql.json({ startedAt: new Date(overdue("2026-10-06")).toISOString() })})`;
  result = await checkAlerts(overdue("2026-10-06"));
  assert.deepEqual(daily(result.open), [key("2026-10-01"), key("2026-10-06")]);
  assert.ok(result.sent.includes(key("2026-10-01")), "a restart keeps checking the unresolved edition");
  await sql`DELETE FROM settings WHERE key='heartbeat.worker'`;
  result = await checkAlerts(overdue("2026-10-06"));
  assert.deepEqual(result.sent, [], "rechecking after the restart does not duplicate the reminder");
  process.env.COLLECT_ENABLED = "false";
  await report("2026-10-01");
  assert.ok((await checkAlerts(overdue("2026-10-06", 10))).sent.includes(`${key("2026-10-01")}:recovered`));
});

test("an edition still missing past the scan window is closed once instead of reminded forever", async () => {
  await attempt("2026-10-01");
  await checkAlerts(overdue("2026-10-01"));
  let result = await checkAlerts(overdue("2026-10-08"));
  assert.ok(result.sent.includes(`${key("2026-10-01")}:expired`));
  assert.ok(!result.open.includes(key("2026-10-01")));
  result = await checkAlerts(overdue("2026-10-08", 120));
  assert.ok(!result.sent.some(k => k.startsWith(key("2026-10-01"))));
});
