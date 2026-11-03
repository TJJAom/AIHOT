// Operations alerts. The person reading them is the site owner, not an engineer: each
// message says what readers see, whether it heals by itself and what, if anything, the owner must do.
//   now   — readers are affected and it has not healed: sent at once, repeated hourly, recovery reported.
//   today — money at risk or only the owner can act: sent at once, repeated at most daily, recovery reported.
//   later — other follow-ups: one 09:00 list a day for the agent (the owner's only without one). A source's follow-up is
//           closed on its own: a fix removes it, and one judged not worth fixing is closed with a reason.
// A finding with agentOnly is still now or today, but it only wakes the agent: nothing is sent when it
// opens, nothing is sent when it clears, and it stays off the 09:00 digest.
// A module can name those alerts as well, including `name:<item>`, so a row saved before the flag still closes quietly.
// With an agent taking the alerts (notify/agent.ts), a now or today problem that is not the owner's own
// (Finding.owner) is handed to the agent instead. The owner hears of it when the same problem is handed over
// a third time in a day, or when it is still open HANDED_MS after the handoff, and from then on as above;
// an incident the agent judged not a fault (holdAlert) is not told before its hold ends. The agent is not
// woken for what is the owner's alone (owner "only"). While the channel to the agent fails, the owner hears everything again.
// The shared hub owns serial execution and retry; accepted events are never dispatched again here.
// Delivery goes through sendAlert (alert webhook or ops chat, internal-chat fallback; off unless FEISHU_INTERNAL_ENABLED).
import { addDays, beijingAt, beijingDate, beijingDay, beijingStamp, isValidDate } from "@aihot/contracts/time";
import { ALERTS, EDITION_TIMES } from "@aihot/site";
import { audit } from "../audit.ts";
import { sql } from "../db.ts";
import { agentConfigured, agentTransportFindings, flushAgentEvents, handoffs, wakeAgent, wakeDigest } from "../notify/agent.ts";
import { duration, formatAlert, formatRecovery, formatReturn, sendAlert, type Finding, type Level } from "../notify/feishu.ts";
import { stepsOnService } from "../editorial/models.ts";
import { backupConfigured } from "./backup.ts";
import { GROUPING_WARN_AFTER_MS, waitingSelectedNews } from "./grouping.ts";
import { upstreamFindings } from "../media/upstream.ts";
import { serverModules } from "../modules.ts";
import { awaitingRelease, providerAccessRefused } from "../providers/receipts.ts";
import { SOURCE_PROBLEMS, sourceHealth } from "../sources/health.ts";

const REPEAT_MS: Record<Exclude<Level, "later">, number> = { now: 3600_000, today: 24 * 3600_000 };
/**
 * How long the agent has a problem before the owner hears of it too: readers affected now, the first hourly
 * reminder; otherwise time to ship a fix and retry it once (10-19..10-21 the agent closed its alerts within 25 minutes).
 */
const HANDED_MS: Record<Exclude<Level, "later">, number> = { now: 3600_000, today: 3 * 3600_000 };
/** The handoff that tells the owner a problem keeps coming back, counted over a day; told at most once a day. */
const RETURNS = 3;
const DAY_MS = 86_400_000;

// Valves default off: read at call time, only an explicit "true" turns them on.
const collecting = () => process.env.COLLECT_ENABLED === "true";
const modelsOn = () => process.env.MODEL_CALLS_ENABLED === "true";
/**
 * How long the site may go without a new article before it counts as stalled (ALERT_QUIET_MINUTES, else
 * the site's own setting; small source lists are quieter), and how long while editorial fetches keep
 * succeeding. At most a day: the check looks one day back.
 */
const QUIET_MINUTES = Math.min(Number(process.env.ALERT_QUIET_MINUTES || ALERTS.quietMinutes), 1440);
const QUIET_FETCHING_MINUTES = Math.min(Math.max(ALERTS.quietWhileFetchingMinutes, QUIET_MINUTES), 1440);

/** One check: the problems it finds now. `open` retains ongoing incidents, read once per round. */
type Check = (now: number, open: AlertState) => Promise<Finding[]>;

/** Everything checked every round, in the order the findings are listed. */
const CHECKS: Check[] = [
  // Readers affected now
  contentCollection,
  sourcesFailing,
  selectedGrouping,
  contentProcessing,
  dailyReportFindings,
  // Money, and things only the owner can do
  providerFindings,
  refusedDeliveries,
  backupAge,
  upstreamFindings,
  moduleAlerts,
  // Follow-ups
  sourceFollowUps,
  unknownOutcomes,
  agentTransportFindings,
  waitingQueues,
  moduleFollowUps,
];

/** Everything wrong right now, with its level. */
export async function collectFindings(now = Date.now(), open?: AlertState): Promise<Finding[]> {
  const announced = open ?? await alertState();
  const out: Finding[] = [];
  for (const check of CHECKS) out.push(...(await check(now, announced)));
  return out;
}

// Content flow, judged by outcome: whatever broke (worker, egress proxy, models, queues), readers see
// a site that stops changing. Its persisted backlog survives worker restarts and paused valves.
async function contentCollection(now: number, open: AlertState): Promise<Finding[]> {
  if (!collecting() && !open["content.collect"]) return [];
  const [last] = await sql<{ at: Date | null }[]>`SELECT max(a.discovered_at) AS at FROM articles a
    JOIN sources s ON s.id = a.source_id WHERE s.participation_mode = 'editorial' AND a.discovered_at > now() - interval '1 day'`;
  const quietFor = last?.at ? now - last.at.getTime() : Infinity;
  if (quietFor <= QUIET_MINUTES * 60_000) return [];
  // Fetches still succeeding with nothing new is the sources being quiet, not collection stopping.
  const [fetching] = quietFor <= QUIET_FETCHING_MINUTES * 60_000 ? await sql`SELECT 1 FROM fetch_runs f JOIN sources s ON s.id = f.source_id
    WHERE s.participation_mode = 'editorial' AND f.status = 'ok' AND f.started_at > ${new Date(now - QUIET_MINUTES * 60_000)} LIMIT 1` : [];
  if (fetching) return [];
  // A site without an enabled source has nothing to collect.
  const [anySource] = await sql`SELECT 1 FROM sources WHERE enabled AND participation_mode = 'editorial' LIMIT 1`;
  if (!anySource) return [];
  return [{
    key: "content.collect",
    level: "now",
    title: "網站停止收錄新文章",
    impact: last?.at ? `讀者看不到新文章：最後一篇收錄於 ${beijingStamp(last.at)}` : "讀者看不到新文章：一天內沒有收錄任何文章",
    heals: ALERTS.usualFlow ? `沒有，${ALERTS.usualFlow}` : "沒有",
    action: "把這條發給 AI 排查處理",
    detail: quietFor <= QUIET_FETCHING_MINUTES * 60_000
      ? `editorial articles.discovered_at 超過 ${QUIET_MINUTES} 分鐘沒有新值，期間沒有一次成功的 editorial fetch_runs（熱度訊號單獨評估）；查 worker、sources.schedule、出網代理與採集失敗`
      : `editorial articles.discovered_at 超過 ${QUIET_FETCHING_MINUTES} 分鐘沒有新值（採集仍成功也算）；查採集結果為何一直是 new_count=0：解析、去重與入庫`,
    since: last?.at ?? undefined,
  }];
}

/**
 * Many sources failing at once points at the site's way out, not at the sources: the site keeps changing
 * with what still works, so the stall above stays quiet. Each enabled source counts by its latest fetch,
 * however long ago: a failing one waits hours before it is fetched again, and collection may be paused or the
 * worker down meanwhile, so only a fetch that works again is recovery. Production, 30 days to 2026-10-28:
 * the egress proxy dropped on 10-05, 10-17 and 10-26 and 23–37% of the sources were failing at the worst;
 * at no other time more than 11.5%. Fewer than 50 failing sources are each one's own follow-up.
 */
const FAILING_SHARE = 0.15;
const FAILING_SOURCES = 50;

async function sourcesFailing(now: number, open: AlertState): Promise<Finding[]> {
  if (!collecting() && !open["content.fetch"]) return [];
  const latest = sql`SELECT r.status, r.error, r.started_at FROM sources s CROSS JOIN LATERAL (
      SELECT status, error, started_at FROM fetch_runs f
      WHERE f.source_id = s.id AND f.status IN ('ok', 'failed') AND f.started_at <= ${new Date(now)}
      ORDER BY started_at DESC LIMIT 1) r
    WHERE s.enabled`;
  const [r] = await sql<{ fetched: number; failing: number }[]>`
    SELECT count(*)::int AS fetched, count(*) FILTER (WHERE status = 'failed')::int AS failing FROM (${latest}) l`;
  if (!r || r.failing < FAILING_SOURCES || r.failing < r.fetched * FAILING_SHARE) return [];
  const errors = await sql<{ error: string; n: number; first: Date }[]>`
    SELECT left(coalesce(error, ''), 120) AS error, count(*)::int AS n, min(started_at) AS first FROM (${latest}) l
    WHERE status = 'failed' GROUP BY 1 ORDER BY 2 DESC`;
  return [{
    key: "content.fetch",
    level: "now",
    title: "大量信源抓取失敗，這些信源的新文章進不來",
    impact: `最近抓取過的 ${r.fetched} 個信源裡，${r.failing} 個最近一次抓取失敗，讀者暫時看不到它們的新文章`,
    heals: "伺服器連外網的線路恢復後會按排程重新抓取，這段時間的新文章會晚到；線路不恢復就一直進不來",
    action: "轉給 AI 檢查出網代理和抓取錯誤",
    detail: `失敗信源佔 ${Math.round((r.failing / r.fetched) * 100)}%（門檻 ${FAILING_SHARE * 100}% 且至少 ${FAILING_SOURCES} 個）；常見錯誤：${errors.slice(0, 3).map((e) => `${e.error || "（無）"} ×${e.n}`).join("；")}`,
    since: new Date(Math.min(...errors.map((e) => e.first.getTime()))),
  }];
}

/** Processing is checked while collection and models run, and while either of its incidents is open. */
const watchingProcessing = (open: AlertState) => (collecting() && modelsOn()) || !!open["content.grouping"] || !!open["content.process"];

async function selectedGrouping(now: number, open: AlertState): Promise<Finding[]> {
  if (!watchingProcessing(open)) return [];
  const waiting = (await waitingSelectedNews()).filter((item) => open["content.grouping"] || now - item.since.getTime() >= GROUPING_WARN_AFTER_MS);
  if (!waiting.length) return [];
  const manual = waiting.filter((item) => item.recovery === "manual").length;
  const receipt = waiting.some((item) => item.recovery === "receipt");
  return [{
    key: "content.grouping",
    level: "now",
    title: "有精選新聞卡在去重確認，暫未釋出",
    impact: `${waiting.length} 條已達到精選條件的新聞仍未完成去重確認，還沒進入精選，讀者可能晚看到這些更新`,
    heals: manual ? `${manual} 條需要人工處理後才能恢復${manual < waiting.length ? "；其餘仍在自動恢復" : ""}`
      : receipt ? "仍在等待自動恢復；付費結果未知的請求會在 30 分鐘後自動放行一次" : "還會自動重試，但等待已經超過正常範圍",
    action: manual ? "轉給 AI 處理；核對計費，或在已有恢復授權內如實記錄計費未知後放行" : "轉給 AI 檢查等待原因，避免繼續積壓",
    detail: waiting.slice(0, 8).map((item) => `${item.articleId}${item.receiptId ? ` 回執 #${item.receiptId}` : ""}${item.error ? `：${item.error.slice(0, 120)}` : ""}`).join("；"),
    since: waiting[0]!.since,
  }];
}

async function contentProcessing(now: number, open: AlertState): Promise<Finding[]> {
  if (!watchingProcessing(open)) return [];
  // An article still new two hours after discovery is overdue, and one failed in the last three hours counts.
  // While an announced incident is open, the windows stay where its first detection put them: time passing
  // cannot remove unfinished articles from it. The alert's duration starts at detection, not article age.
  const incident = open["content.process"];
  const detectedAt = incident ? Math.min(now, Date.parse(incident.since)) : now;
  const overdueBefore = now - 2 * 3600_000;
  const waitingAfter = new Date(detectedAt - 2 * 86400_000);
  const waitingBefore = new Date(incident ? Math.max(overdueBefore, detectedAt) : overdueBefore);
  const failedAfter = new Date(detectedAt - 3 * 3600_000);
  const unfinished = sql`(processing_state = 'new' AND discovered_at > ${waitingAfter} AND discovered_at < ${waitingBefore})
    OR (processing_state = 'failed' AND discovered_at > ${failedAfter})`;
  const [p] = await sql<{ waiting: number; failed: number; oldest: Date | null }[]>`
    SELECT count(*) FILTER (WHERE processing_state = 'new')::int AS waiting,
           count(*) FILTER (WHERE processing_state = 'failed')::int AS failed,
           min(discovered_at) FILTER (WHERE processing_state = 'new') AS oldest
    FROM articles WHERE ${unfinished}`;
  if (p!.waiting < 10 && p!.failed < 20 && !(incident && p!.waiting + p!.failed > 0)) return [];
  const errors = await sql<{ error: string; n: number }[]>`
    SELECT left(coalesce(processing_error, '（無）'), 120) AS error, count(*)::int AS n FROM articles
    WHERE (${unfinished}) AND processing_error IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 3`;
  return [{
    key: "content.process",
    level: "now",
    title: "新內容卡住了，進不了網站",
    impact: [p!.waiting > 0 && `${p!.waiting} 篇積壓文章仍在等待處理`, p!.failed > 0 && `${p!.failed} 篇處理失敗的文章仍未補齊`]
      .filter(Boolean)
      .join("；") + "，精選和熱點會缺內容",
    heals: p!.failed > 0 ? "已失敗的文章需要恢復處理；服務恢復不代表積壓已經補齊" : "排隊中的文章會繼續處理，仍需核實是否完成",
    action: "轉給 AI 處理",
    // Article age is useful detail; incident duration starts at first detection.
    detail: [p!.oldest && `最老的一篇 ${beijingStamp(p!.oldest)} 收進`, errors.map((e) => `${e.error}（${e.n}）`).join("；") || "沒有記錄錯誤"].filter(Boolean).join("；"),
  }];
}

// Content-group pushes the Feishu webhook refused (a removed bot, a changed address); nothing resends them.
async function refusedDeliveries(now: number, open: AlertState): Promise<Finding[]> {
  const incident = open["deliveries.failed"];
  const since = new Date((incident ? Date.parse(incident.since) : now) - 86400_000);
  const [refused] = await sql<{ n: number; target: string | null; response: string | null }[]>`
    SELECT count(*)::int AS n, max(t.note) AS target, left(max(d.response), 200) AS response FROM deliveries d JOIN notify_targets t ON t.key = d.target_key
    WHERE d.updated_at > ${since}
      AND (d.status = 'failed' OR (${!!incident} AND (d.status = 'unknown' OR (d.status IN ('pending','sending') AND d.attempts > 0))))
      AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.action = 'delivery.drop'
        AND a.subject = 'delivery:' || d.id AND a.created_at >= d.updated_at)`;
  if (!refused!.n) return [];
  return [{
    key: "deliveries.failed",
    level: "today",
    title: "飛書內容群有推送沒發出去",
    impact: `${refused!.n} 條通知尚未確認送達${refused!.target ?? "內容群"}`,
    heals: "不會自動重發",
    action: "轉給 AI 處理；如果推送機器人被移出了群，需要你把它加回去",
    detail: refused!.response ?? "",
  }];
}

async function backupAge(now: number): Promise<Finding[]> {
  if (!backupConfigured()) return [];
  const [b] = await sql<{ value: { at: string; uploaded: boolean; filesError?: string } }[]>`SELECT value FROM settings WHERE key = 'backup.last'`;
  // A failed archive updates backup.last too. Reuse the run history so repeated failures cannot
  // reset the age; before the first success, count from the first attempt rather than from now.
  const [runs] = await sql<{ last_ok: Date | null; first_attempt: Date | null }[]>`
    SELECT max(finished_at) FILTER (WHERE status = 'ok') AS last_ok, min(started_at) AS first_attempt
    FROM job_runs WHERE job = 'ops.backup'`;
  const lastOk = Math.max(runs?.last_ok?.getTime() ?? 0, b?.value.uploaded ? Date.parse(b.value.at) : 0);
  const since = lastOk || runs?.first_attempt?.getTime() || now;
  const age = now - since;
  const state = b?.value.filesError ? `資料庫已上傳，附件打包失敗：${b.value.filesError}` : b?.value.uploaded === false ? "未上傳" : "";
  if (age > 50 * 3600_000) {
    return [{
      key: "backup.failed",
      level: "today",
      title: "資料庫備份連續兩天沒成功",
      impact: lastOk ? `萬一伺服器出事，最近 ${duration(age)} 的資料可能無法完整恢復` : "還沒有成功的完整備份，伺服器出事時可能無法恢復資料",
      heals: "不會",
      action: "轉給 AI 處理",
      detail: `${lastOk ? "最近一次成功" : "首次備份嘗試"} ${beijingStamp(since)}${state ? `；${state}` : ""}；看 ops.backup 的執行記錄`,
      since: new Date(since),
    }];
  }
  if (!b || !b.value.uploaded || age > 30 * 3600_000) {
    return [{ key: "backup.stale", level: "later", title: "資料庫備份超過一天沒成功", detail: b ? `最近一次 ${beijingStamp(b.value.at)}${state ? `（${state}）` : ""}；看 ops.backup` : "還沒有成功的備份記錄" }];
  }
  return [];
}

/** What the site's modules find. */
async function moduleAlerts(now: number): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const m of serverModules()) if (m.alerts) out.push(...(await m.alerts(now)));
  return out;
}

/**
 * One follow-up per source and problem, so fixing a source removes its own line. A quiet source is left to
 * the weekly report: being slow, or too new to have a rhythm, is nothing anyone can fix, and may never end.
 */
async function sourceFollowUps(now: number): Promise<Finding[]> {
  if (!collecting()) return [];
  return (await sourceHealth(now)).flatMap(group => SOURCE_PROBLEMS.flatMap(p => group[p.problem].map((s): Finding => ({
    key: `sources.${p.problem}.${s.id}`, level: "later", title: `${group.name}信源「${s.name}」${p.title}`,
    detail: `${s.id}：${p.describe(s)}；${p.action}`, observedAt: p.observedAt(s) ?? undefined,
  }))));
}

/** Paid requests and content-group pushes whose outcome is not known yet. */
async function unknownOutcomes(): Promise<Finding[]> {
  const out: Finding[] = [];

  const [r] = await sql<{ receipts: number; services: string | null; deliveries: number }[]>`
    SELECT (SELECT count(*)::int FROM receipts WHERE ${awaitingRelease()}) AS receipts,
           (SELECT string_agg(DISTINCT service || '/' || purpose, '、') FROM receipts WHERE ${awaitingRelease()}) AS services,
           (SELECT count(*)::int FROM deliveries WHERE status = 'unknown') AS deliveries`;
  if (r!.receipts > 0) {
    out.push({ key: "receipts.unknown", level: "later", title: `${r!.receipts} 個付費請求的結果尚未確認`, detail: `${r!.services}；仍擋住內容釋出的請求需核對計費或按已有授權放行` });
  }
  if (r!.deliveries > 0) out.push({ key: "deliveries.unknown", level: "later", title: `${r!.deliveries} 條飛書內容群推送不確定是否送達`, detail: "核對飛書內容群裡有沒有發出，再標記或補發" });
  return out;
}

/** Runnable jobs (deferred ones excluded) that have waited more than two hours. */
async function waitingQueues(now: number): Promise<Finding[]> {
  const queues = await sql<{ name: string; n: number; oldest: Date }[]>`
    SELECT name, count(*)::int AS n, min(start_after) AS oldest FROM pgboss.job
    WHERE state IN ('created', 'retry') AND start_after <= now() AND name NOT LIKE 'cron.%' GROUP BY 1`;
  return queues.filter((q) => now - q.oldest.getTime() > 2 * 3600_000).map((q): Finding => (
    { key: `queue.${q.name}`, level: "later", title: `後臺任務排隊超過 2 小時：${q.name}`, detail: `${q.n} 個等待，最早的等了 ${duration(now - q.oldest.getTime())}` }));
}

/** The site's modules' follow-ups. */
async function moduleFollowUps(now: number): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const m of serverModules()) if (m.followUps) out.push(...(await m.followUps(now)));
  return out;
}

/** Current routing describes possible impact; recent failed calls do not prove every step has stopped. */
async function modelStops(service: string, models?: ReadonlySet<string>): Promise<string> {
  const steps = await stepsOnService(service, models);
  return steps.length ? `${steps.join("、")}可能受影響` : "當前沒有處理步驟使用這家模型服務";
}
/** `stops` is for the services that are not models; a model service's follows from the steps that use it. */
const PROVIDERS: Record<string, { name: string; where: string; stops?: string }> = {
  llm: { name: "預設模型服務", where: "模型服務商的控制檯" },
  zhipu: { name: "智譜", where: "智譜開放平台" },
  dashscope: { name: "阿里雲百鍊", where: "阿里雲百鍊控制檯" },
  deepseek: { name: "DeepSeek", where: "DeepSeek 開放平台" },
  mimo: { name: "小米 MiMo", where: "小米 MiMo 開放平台" },
  socialdata: { name: "SocialData", stops: "X（推特）上的新內容收不到", where: "SocialData 後臺" },
  jina: { name: "Jina", stops: "部分文章取不到正文", where: "Jina 後臺" },
  dajiala: { name: "極致了（Dajiala）", stops: "公眾號新文章收不到", where: "極致了後臺" },
};
export const providerName = (service: string) => PROVIDERS[service]?.name ?? service;
export const providerStops = async (service: string, models?: ReadonlySet<string>): Promise<string> => {
  const p = PROVIDERS[service];
  return p ? (p.stops ?? modelStops(service, models)) : "相關功能停了";
};
export const providerConsole = (service: string) => PROVIDERS[service]?.where ?? `${service} 後臺`;

const REFUSED_PREFIX = "provider.refused.";

/** Paid services that refuse us (no balance, a dead key), and daily budgets used up. */
async function providerFindings(now: number, open: AlertState): Promise<Finding[]> {
  const out: Finding[] = [];
  const ongoing = Object.keys(open).filter(key => key.startsWith(REFUSED_PREFIX)).map(key => key.slice(REFUSED_PREFIX.length).split(":")[0]!);
  const failures = await sql<{ service: string; model: string | null; error: string; n: number; latest: Date }[]>`
    SELECT service, model, error, count(*)::int AS n, max(started_at) AS latest FROM receipt_attempts a
    WHERE status = 'failed' AND (started_at > ${new Date(now - 3600_000)} OR service = ANY(${ongoing})) AND error IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM receipt_attempts good WHERE good.service = a.service AND good.model IS NOT DISTINCT FROM a.model AND good.status = 'received' AND good.started_at > a.started_at)
    GROUP BY service, model, error ORDER BY latest DESC`;
  const models = new Map<string, { service: string; model: string | null; n: number; last: string; latest: number }>();
  for (const p of failures) {
    if (!providerAccessRefused(p.service, p.error)) continue;
    const key = `${REFUSED_PREFIX}${p.service}${p.model === null ? "" : `:${encodeURIComponent(p.model)}`}`;
    const summary = models.get(key) ?? { service: p.service, model: p.model, n: 0, last: p.error.slice(0, 200), latest: p.latest.getTime() };
    summary.n += p.n;
    models.set(key, summary);
  }
  // Earlier versions combined every model under a service key without saving its scope. Freeze the
  // unresolved models once for those existing events; their old timestamps cannot establish that scope.
  for (const [key, incident] of Object.entries(open)) {
    if (!key.startsWith(REFUSED_PREFIX) || key.includes(":") || incident.refusedModels) continue;
    const service = key.slice(REFUSED_PREFIX.length);
    incident.refusedModels = [...models.values()].filter(p => p.service === service).map(p => p.model);
  }
  const refused = new Map<string, { service: string; n: number; last: string; models?: Set<string> }>();
  for (const [modelKey, p] of models) {
    const legacyKey = `${REFUSED_PREFIX}${p.service}`;
    const legacy = open[legacyKey];
    const key = legacy?.refusedModels?.includes(p.model) ? legacyKey : modelKey;
    if (!open[key] && p.latest <= now - 3600_000) continue;
    const summary = refused.get(key) ?? { service: p.service, n: 0, last: p.last, models: new Set<string>() };
    summary.n += p.n;
    if (p.model === null) summary.models = undefined;
    else summary.models?.add(p.model);
    refused.set(key, summary);
  }
  for (const [key, p] of refused) {
    const service = p.service;
    const unused = p.models && !PROVIDERS[service]?.stops && !(await stepsOnService(service, p.models)).length;
    out.push({
      key,
      level: unused ? "later" : "today",
      ...(unused ? {} : { owner: true as const }),
      title: unused ? `${providerName(service)} 的舊模型限制尚未驗證` : `${providerName(service)} 拒絕呼叫，需要核對賬號或額度`,
      impact: unused ? "當前處理步驟未使用這些受限模型；舊限制仍未驗證" : await providerStops(service, p.models),
      heals: "需先恢復訪問，再確認失敗任務已接續",
      action: `去${providerConsole(service)}看餘額、套餐和消費上限；充值或恢復後讓 AI 核實呼叫並補跑剛才失敗的任務（後臺看著都正常的話，也把這條發給 AI 查原因）`,
      detail: `${p.models ? `模型 ${[...p.models].join("、")}；` : ""}最近一次成功後被拒 ${p.n} 次，尚未取得後續成功呼叫：${p.last}`,
    });
  }
  const capped = await sql<{ service: string; per_day: number; used: number }[]>`
    SELECT b.service, b.per_day, count(a.id)::int AS used FROM budgets b
    JOIN receipt_attempts a ON a.service = b.service AND a.origin = 'live' AND a.started_at > now() - interval '1 day'
    WHERE b.per_day > 0 GROUP BY 1, 2 HAVING count(a.id) >= b.per_day`;
  for (const c of capped) {
    out.push({
      key: `budget.day.${c.service}`,
      level: "later",
      title: `${providerName(c.service)} 過去 24 小時的呼叫額度用完了`,
      impact: `${await providerStops(c.service)}，直到額度隨時間騰出來`,
      heals: "會，額度按 24 小時滾動恢復",
      action: "這次不用處理；如果經常出現，再決定要不要調高額度",
      detail: `24 小時內 ${c.used} 次，上限 ${c.per_day}（budgets 表）`,
    });
  }
  return out;
}

interface AlertState {
  [key: string]: { title: string; since: string; sentAt?: string; agentOnly?: true; handedAt?: string; refusedModels?: (string | null)[] };
}

const DAILY_PREFIX = "report.daily:";
const dailyDate = (key: string) => key.startsWith(DAILY_PREFIX) && isValidDate(key.slice(DAILY_PREFIX.length))
  ? key.slice(DAILY_PREFIX.length) : undefined;
/** Missing dailies are looked for, and announced ones followed, over the last seven Beijing calendar days. */
const dailyScanFrom = (now: number) => addDays(beijingDate(now), -6);

async function alertState(): Promise<AlertState> {
  const [row] = await sql<{ value: AlertState }[]>`SELECT value FROM settings WHERE key = 'alerts.state'`;
  return { ...(row?.value ?? {}) };
}

/** When the owner was last told that a problem keeps coming back, by key, for the last day. */
async function returnsTold(now: number): Promise<Record<string, string>> {
  const [row] = await sql<{ value: Record<string, string> }[]>`SELECT value FROM settings WHERE key = 'alerts.returns'`;
  return Object.fromEntries(Object.entries(row?.value ?? {}).filter(([, at]) => now - Date.parse(at) < DAY_MS));
}

/** A handed-over incident the agent judged not a fault: until when and why. `since` ties it to that incident. */
export interface HeldAlert { since: string; until: string; reason: string; by: string; at: string }

async function savedHolds(): Promise<Record<string, HeldAlert>> {
  const [row] = await sql<{ value: Record<string, HeldAlert> }[]>`SELECT value FROM settings WHERE key = 'alerts.held'`;
  return row?.value ?? {};
}

/**
 * The agent looked at an incident it was handed and judged it not a fault (10-25: a quiet Saturday morning
 * escalated as "停止收錄"): the owner is not told of that incident before `until`, a day at most. Past it, or
 * for a later incident, the handoff runs as before. Audited.
 */
export async function holdAlert(key: string, reason: string, until: Date, actor: string, now = Date.now()): Promise<HeldAlert> {
  if (!reason?.trim()) throw new Error("reason is required");
  if (!(until.getTime() > now && until.getTime() <= now + DAY_MS)) throw new Error("hold until a time within the next day");
  const open = (await alertState())[key];
  if (!open?.handedAt || open.sentAt) throw new Error(`not an open incident the agent has and the owner was not told of: ${key}`);
  const before = (await savedHolds())[key] ?? null;
  const held: HeldAlert = { since: open.since, until: until.toISOString(), reason: reason.trim(), by: actor, at: new Date(now).toISOString() };
  await sql.begin(async (tx) => {
    // Merged by key in the row itself, so holds written at the same time all stand; ended ones are dropped here.
    await tx`INSERT INTO settings (key, value, updated_by) VALUES ('alerts.held', ${tx.json({ [key]: held } as never)}, ${actor})
             ON CONFLICT (key) DO UPDATE SET value = coalesce((SELECT jsonb_object_agg(k, v) FROM jsonb_each(settings.value) AS e(k, v)
               WHERE (v->>'until')::timestamptz > ${new Date(now)}), '{}'::jsonb) || EXCLUDED.value,
               updated_by = EXCLUDED.updated_by, updated_at = now()`;
    await audit(actor, "alert.hold", `alert:${key}`, held.reason, before, held, { db: tx });
  });
  return held;
}

async function dailyReportFindings(now: number, open: AlertState): Promise<Finding[]> {
  if (!collecting() || !modelsOn()) return [];
  const today = beijingDate(now);
  const [activity] = await sql<{ first_report: string | null; first_attempt: Date | null }[]>`
    SELECT (SELECT min(key) FROM reports WHERE kind = 'daily') AS first_report,
           (SELECT min(started_at) FROM job_runs WHERE job = 'reports.compose') AS first_attempt`;
  const starts = [activity?.first_report, activity?.first_attempt && beijingDate(activity.first_attempt)]
    .filter((date): date is string => !!date && isValidDate(date)).sort();
  const start = starts[0] ?? today;
  // New gaps and announced editions alike are followed for the scan window; settleDailies closes older ones.
  const from = dailyScanFrom(now);
  const dates = new Set(Object.keys(open).map(dailyDate).filter((date): date is string => !!date && date >= from));
  for (let date = from; date <= today; date = addDays(date, 1)) {
    if (date >= start) dates.add(date);
  }
  const overdue = [...dates].filter(date => now >= beijingAt(date, EDITION_TIMES.daily).getTime() + 2 * 3600_000).sort();
  if (!overdue.length) return [];
  const published = new Set((await sql<{ key: string }[]>`SELECT key FROM reports WHERE kind = 'daily' AND key IN ${sql(overdue)}`).map(r => r.key));
  return overdue.filter(date => !published.has(date)).map(date => ({
    key: `${DAILY_PREFIX}${date}`, level: "now",
    title: `${date} 的日報還沒生成`, impact: `讀者看不到 ${date} 的日報`,
    heals: "尚未補齊；需檢視執行記錄確認是否需要人工補做",
    action: "把這條發給 AI 排查補跑",
    detail: `reports daily ${date} 不存在；看 reports.compose 的執行記錄`,
  }));
}

/**
 * Announced editions this round did not find, because generation is paused or they fell out of the scan
 * window. Only an edition that exists has recovered (checkAlerts says so); one still missing stays open
 * quietly within the window, and past it is closed with one message instead of being reminded about forever.
 */
async function settleDailies(open: AlertState, found: Set<string>, now: number): Promise<{ missing: Set<string>; sent: string[] }> {
  const missing = new Set<string>();
  const sent: string[] = [];
  const dates = Object.keys(open).filter((key) => !found.has(key)).map(dailyDate).filter((date): date is string => !!date);
  if (!dates.length) return { missing, sent };
  const published = new Set((await sql<{ key: string }[]>`SELECT key FROM reports WHERE kind = 'daily' AND key IN ${sql(dates)}`).map((r) => r.key));
  for (const date of dates.filter((date) => !published.has(date))) {
    const key = `${DAILY_PREFIX}${date}`;
    if (date >= dailyScanFrom(now)) {
      missing.add(key);
      continue;
    }
    await sendAlert(`${date} 的日報沒能補出，停止提醒`, [`讀者看不到 ${date} 的日報；缺期從 ${beijingStamp(new Date(open[key]!.since))} 起，已超出七天的檢查範圍`]);
    sent.push(`${key}:expired`);
    delete open[key];
  }
  return { missing, sent };
}

/**
 * Every 10 minutes: new problems and recoveries of the now/today levels go out; follow-ups wait for 09:00.
 */
export async function checkAlerts(now = Date.now()) {
  const state = await alertState();
  const all = await collectFindings(now, state);
  const handing = agentConfigured() && !all.some((f) => f.key === "webhook.transport");
  const returns = await returnsTold(now);
  const holds = await savedHolds();
  const sent: string[] = [];
  for (const f of all) {
    const open = state[f.key];
    if (f.level === "later") {
      // Switching before the first check changes the impact, not whether access has recovered.
      if (f.key.startsWith(REFUSED_PREFIX) && !open) state[f.key] = { title: f.title, since: new Date(now).toISOString() };
      continue;
    }
    if (f.agentOnly) {
      const since = open?.since ?? (f.since ?? new Date(now)).toISOString();
      state[f.key] = { title: f.title, since, agentOnly: true };
      continue;
    }
    if (handing && !f.owner && !open?.sentAt) {
      const handedAt = open?.handedAt ?? new Date(now).toISOString();
      const hold = holds[f.key];
      const held = !!hold && hold.since === open?.since && now < Date.parse(hold.until);
      if (held || now - Date.parse(handedAt) < HANDED_MS[f.level]) {
        // Before this round's handoff is published, the earlier ones of the day are counted.
        const earlier = open || returns[f.key] ? 0 : await handoffs(f.key, new Date(now - DAY_MS));
        if (earlier >= RETURNS - 1) {
          const msg = formatReturn(f, earlier + 1);
          await sendAlert(msg.title, msg.lines);
          returns[f.key] = new Date(now).toISOString();
          sent.push(`${f.key}:repeated`);
        }
        state[f.key] = { title: f.title, since: open?.since ?? (f.since ?? new Date(now)).toISOString(), handedAt };
        continue;
      }
    }
    if (open?.sentAt && now - Date.parse(open.sentAt) <= REPEAT_MS[f.level]) continue;
    const since = open ? new Date(open.since) : (f.since ?? new Date(now));
    // Claim AI was notified only after the hub actually accepts this incident's wake; persist the occurrence
    // timestamp first so a failed owner send or crash after waking cannot mint a second incident ID on retry.
    let woken = false;
    if (handing && f.key !== "webhook.transport" && f.owner !== "only" && f.action === "把這條發給 AI 排查處理") {
      if (!open) {
        const entry = { title: f.title, since: since.toISOString() };
        state[f.key] = entry;
        await sql`INSERT INTO settings (key, value, updated_by) VALUES ('alerts.state', ${sql.json({ [f.key]: entry } as never)}, 'alerts')
                  ON CONFLICT (key) DO UPDATE SET value = coalesce(settings.value, '{}'::jsonb) || ${sql.json({ [f.key]: entry } as never)}, updated_at = now()`;
      }
      woken = await wakeAgent({ ...f, since }, now);
    }
    // A problem the agent has had and not closed: the owner learns it is the agent's, and for how long.
    const shown = handing && !f.owner && open?.handedAt
      ? { ...f, heals: `AI 接手 ${duration(now - Date.parse(open.handedAt))} 還沒解決`, action: "問問 AI 卡在哪了；需要你動手的它會說明" }
      : woken
        ? { ...f, action: "已自動通知 AI 排查處理，修不好或要你拍板時會再找你；恢復後會再發一條通知" }
        : f;
    const msg = formatAlert(shown, since, now, !!open?.sentAt);
    await sendAlert(msg.title, msg.lines);
    state[f.key] = { ...open, title: f.title, since: since.toISOString(), sentAt: new Date(now).toISOString() };
    sent.push(f.key);
  }
  const found = new Set(all.map((f) => f.key));
  const dailies = await settleDailies(state, found, now);
  sent.push(...dailies.sent);
  for (const [key, open] of Object.entries(state)) {
    if (found.has(key) || dailies.missing.has(key)) continue;
    // An agent-only incident was never told to the owner, so clearing it stays quiet too.
    if (open.agentOnly || !open.sentAt) {
      delete state[key];
      continue;
    }
    const [dropped] = key === "deliveries.failed" ? await sql`SELECT count(*)::int AS n FROM deliveries d
      WHERE d.status='failed' AND d.updated_at>${new Date(Date.parse(open.since)-86400_000)}
        AND EXISTS(SELECT 1 FROM audit_log a WHERE a.action='delivery.drop' AND a.subject='delivery:' || d.id AND a.created_at>=d.updated_at)` : [];
    const msg = formatRecovery(open.title, new Date(open.since), now);
    if (dropped?.n) await sendAlert(`已結束跟進：${open.title}`, [`${dropped.n} 條舊通知已決定不再補發，未確認送達`]);
    else await sendAlert(msg.title, msg.lines);
    sent.push(`${key}:${dropped?.n ? "closed" : "recovered"}`);
    delete state[key];
  }
  await sql`INSERT INTO settings (key, value, updated_by) VALUES ('alerts.state', ${sql.json(state as never)}, 'alerts')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  await sql`INSERT INTO settings (key, value, updated_by) VALUES ('alerts.returns', ${sql.json(returns)}, 'alerts')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  // Revisit every open incident: a crash between saving the owner's alert and dispatching cannot lose it.
  // Transport receipts retain IDs across uncertain responses, independently from owner reminders.
  for (const f of all) if (f.level !== "later" && f.key !== "webhook.transport" && f.owner !== "only" && state[f.key]) {
    await wakeAgent({ ...f, since: new Date(state[f.key]!.since) }, now);
  }
  await flushAgentEvents();
  return { open: Object.keys(state), sent };
}

/**
 * What a closure covers. "observed": the failures seen by its time (a fix whose old failures still sit in
 * the window): any new one reopens it, as on 10-17 when HN detail failures went on after "fixed". "ongoing":
 * the condition itself, judged acceptable (an upstream that fails a few times a day and recovers, dates
 * missing by rule): it holds through new failures for a week, then the condition is listed and judged again.
 * A source that stops working is another follow-up (`sources.failing.*`), never covered by either.
 */
export type ClosureScope = "observed" | "ongoing";
const ONGOING_CLOSURE_MS = 7 * 86_400_000;

/** A follow-up someone judged not worth fixing: who, when and why; `until` ends an ongoing closure. */
export interface DismissedFollowUp { title: string; reason: string; by: string; at: string; until?: string }

/** The follow-ups closed as not to be fixed, by key. */
async function savedDismissals(): Promise<Record<string, DismissedFollowUp>> {
  const [row] = await sql<{ value: Record<string, DismissedFollowUp> }[]>`SELECT value FROM settings WHERE key = 'alerts.dismissed'`;
  return row?.value ?? {};
}

/** The closures still covering a current follow-up (ClosureScope). */
export async function dismissedFollowUps(findings?: Finding[], now = Date.now()): Promise<Record<string, DismissedFollowUp>> {
  const current = findings ?? await sourceFollowUps(now);
  return Object.fromEntries(Object.entries(await savedDismissals()).filter(([key, closed]) => {
    const finding = current.find(f => f.key === key);
    if (!finding) return false;
    if (closed.until) return now < Date.parse(closed.until);
    return !finding.observedAt || finding.observedAt.getTime() <= Date.parse(closed.at);
  }));
}

/**
 * Closes a current source follow-up as not to be fixed, with the reason (audited): the digest stops listing
 * it. Only these name one source and one problem; a follow-up that counts many records would hide records
 * that arrive later. `scope` says what it covers (ClosureScope); disappearance also lapses the closure.
 */
export async function dismissFollowUp(key: string, reason: string, actor: string, now = Date.now(), scope: ClosureScope = "observed"): Promise<DismissedFollowUp> {
  if (!reason?.trim()) throw new Error("reason is required");
  const finding = (await sourceFollowUps(now)).find((f) => f.key === key);
  if (!finding) throw new Error(`not a current source follow-up: ${key}`);
  const before = (await savedDismissals())[key] ?? null;
  const dismissed: DismissedFollowUp = { title: finding.title, reason: reason.trim(), by: actor, at: new Date(now).toISOString(),
    ...(scope === "ongoing" ? { until: new Date(now + ONGOING_CLOSURE_MS).toISOString() } : {}) };
  await sql.begin(async (tx) => {
    await tx`INSERT INTO settings (key, value, updated_by) VALUES ('alerts.dismissed', ${tx.json({ [key]: dismissed } as never)}, ${actor})
             ON CONFLICT (key) DO UPDATE SET value = settings.value || EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    await audit(actor, "followup.dismiss", `followup:${key}`, dismissed.reason, before, dismissed, { db: tx });
  });
  return dismissed;
}

/** Undoes a closure (audited): the digest lists the follow-up again while it lasts. Null when it is not closed. */
export async function restoreFollowUp(key: string, reason: string, actor: string): Promise<DismissedFollowUp | null> {
  if (!reason?.trim()) throw new Error("reason is required");
  const before = (await savedDismissals())[key];
  if (!before) return null;
  await sql.begin(async (tx) => {
    await tx`UPDATE settings SET value = value - ${key}::text, updated_by = ${actor}, updated_at = now() WHERE key = 'alerts.dismissed'`;
    await audit(actor, "followup.restore", `followup:${key}`, reason.trim(), before, null, { db: tx });
  });
  return before;
}

/** 09:00: the open follow-ups, one list; nothing when there are none. Closures whose problem is gone lapse here.
 *  Agent-only handoffs stay on the ops list and are not part of the owner's message. */
export async function sendDigest(now = Date.now()) {
  const found = (await collectFindings(now)).filter((f) => f.level === "later");
  const dismissed = await dismissedFollowUps(found, now);
  const lapsed = Object.keys(await savedDismissals()).filter((key) => !dismissed[key]);
  if (lapsed.length) await sql`UPDATE settings SET value = value - ${sql.array(lapsed)}::text[], updated_at = now() WHERE key = 'alerts.dismissed'`;
  const items = found.filter((f) => !dismissed[f.key] && !f.agentOnly);
  const lines = items.map((f, i) => `${i + 1}. ${f.title}${f.detail ? `\n   ${f.detail}` : ""}`);
  // Once the hub has the list, the agent works through it alone and passes on what is still the owner's. Without
  // an agent, or when the list did not get through, the owner gets it as before.
  const taken = found.some(f => !dismissed[f.key]) && await wakeDigest(beijingDate(now), lines.length || found.length);
  const toldOwner = lines.length > 0 && !taken;
  if (toldOwner) await sendAlert(`📋 系統日報 · ${beijingDay(now)}`, ["以下事項需要跟進，具體影響見各條說明；可把整條轉給 AI 處理。", ...lines]);
  await flushAgentEvents();
  return { items: lines.length, toldOwner };
}
