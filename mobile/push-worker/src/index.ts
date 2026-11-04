// 日耕 iOS 推播 Worker
// - POST /devices：App 登錄 device token 與偏好（匿名，只存 token／環境／偏好）
// - DELETE /devices/:token：取消登錄
// - Cron（每 5 分鐘）：讀網站精選／全部動態，比對 KV 內已見過的文章，對新文章發 APNs
// - /admin/*（Bearer ADMIN_TOKEN）：看統計、手動跑一輪、發測試通知
// 只讀網站公開 HTTPS API，不碰正式後端與資料庫；不呼叫任何模型。

import { sendApns, type ApnsCredentials, type ApnsMessage } from "./apns";

export interface Env {
  PUSH_KV: KVNamespace;
  SITE_BASE: string;
  APNS_TOPIC: string;
  MAX_INDIVIDUAL_PER_RUN: string;
  MIN_SCORE: string;
  APNS_KEY_P8: string;
  APNS_KEY_ID: string;
  APNS_TEAM_ID: string;
  ADMIN_TOKEN: string;
}

interface Device {
  token: string;
  environment: "sandbox" | "production";
  enabled: boolean;
  mode: "selected" | "all";
  categories: string[];       // 空陣列＝全部類別
  locale?: string;
  appVersion?: string;
  createdAt: string;
  updatedAt: string;
  failures?: number;
}

interface FeedItem {
  id: string;
  title: string;
  summary: string | null;
  source: { name: string };
  publishedAt: string | null;
  timelineAt: string;
  category: string | null;
  score: number | null;
  selected: boolean;
}

const SEEN_KEY = "seen:v1";
const SEEN_CAP = 800;
const FRESH_WINDOW_MS = 6 * 3600 * 1000;   // 只推最近 6 小時內進站的文章，避免冷啟動或資料回填時狂推
const HEX64 = /^[0-9a-f]{64}$/i;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" && (path === "/" || path === "/health")) {
      return json({ ok: true, service: "aihot-push", time: new Date().toISOString() });
    }

    if (request.method === "POST" && path === "/devices") return registerDevice(request, env);

    if (request.method === "DELETE" && path.startsWith("/devices/")) {
      const token = path.slice("/devices/".length);
      if (!HEX64.test(token)) return json({ error: "bad token" }, 400);
      await env.PUSH_KV.delete(`dev:${token.toLowerCase()}`);
      return json({ ok: true });
    }

    if (path.startsWith("/admin/")) {
      if (!isAdmin(request, env)) return json({ error: "unauthorized" }, 401);
      if (path === "/admin/stats" && request.method === "GET") {
        const devices = await listDevices(env);
        const seen = await loadSeen(env);
        return json({
          devices: devices.length,
          enabled: devices.filter((d) => d.enabled).length,
          sandbox: devices.filter((d) => d.environment === "sandbox").length,
          production: devices.filter((d) => d.environment === "production").length,
          seenItems: seen.length,
          lastChange: await env.PUSH_KV.get("meta:lastRun"),
        });
      }
      if (path === "/admin/run" && request.method === "POST") {
        const report = await runCycle(env, { dryRun: url.searchParams.get("dry") === "1" });
        return json(report);
      }
      if (path === "/admin/test" && request.method === "POST") {
        // body: { token?: string }  未指定 token 則推給所有已啟用裝置
        const body = (await request.json().catch(() => ({}))) as { token?: string };
        const devices = (await listDevices(env)).filter((d) => d.enabled && (!body.token || d.token === body.token.toLowerCase()));
        const results = await sendToDevices(env, devices, () => ({
          title: "日耕 測試通知",
          body: "推播通道正常。這是從 Cloudflare Worker 送出的測試。",
          collapseId: "aihot-test",
        }));
        return json({ sent: results.sent, failed: results.failed, removed: results.removed });
      }
      if (path === "/admin/reset-seen" && request.method === "POST") {
        await env.PUSH_KV.delete(SEEN_KEY);
        return json({ ok: true });
      }
      return json({ error: "not found" }, 404);
    }

    return json({ error: "not found" }, 404);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCycle(env, { dryRun: false }).then((r) => console.log(JSON.stringify(r))));
  },
};

// MARK: 登錄

async function registerDevice(request: Request, env: Env): Promise<Response> {
  let body: Partial<Device>;
  try { body = (await request.json()) as Partial<Device>; } catch { return json({ error: "invalid json" }, 400); }
  const token = String(body.token ?? "").toLowerCase();
  if (!HEX64.test(token)) return json({ error: "bad token" }, 400);
  const environment = body.environment === "sandbox" ? "sandbox" : "production";
  const mode = body.mode === "all" ? "all" : "selected";
  const categories = Array.isArray(body.categories) ? body.categories.filter((c) => typeof c === "string").slice(0, 12) : [];
  const key = `dev:${token}`;
  const existing = (await env.PUSH_KV.get(key, "json")) as Device | null;
  const now = new Date().toISOString();
  const device: Device = {
    token,
    environment,
    enabled: body.enabled !== false,
    mode,
    categories,
    locale: typeof body.locale === "string" ? body.locale.slice(0, 20) : undefined,
    appVersion: typeof body.appVersion === "string" ? body.appVersion.slice(0, 60) : undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    failures: 0,
  };
  await env.PUSH_KV.put(key, JSON.stringify(device));
  return json({ ok: true, device: { environment, mode, categories, enabled: device.enabled } });
}

async function listDevices(env: Env): Promise<Device[]> {
  const out: Device[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.PUSH_KV.list({ prefix: "dev:", cursor, limit: 1000 });
    const values = await Promise.all(page.keys.map((k) => env.PUSH_KV.get(k.name, "json") as Promise<Device | null>));
    for (const v of values) if (v && HEX64.test(v.token)) out.push(v);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

// MARK: 輪詢與推送

interface CycleReport {
  dryRun: boolean;
  seeded?: boolean;
  fetched: { selected: number; all: number };
  newSelected: string[];
  newAll: string[];
  devices: number;
  sent: number;
  failed: number;
  removed: number;
  errors: string[];
}

async function runCycle(env: Env, opts: { dryRun: boolean }): Promise<CycleReport> {
  const report: CycleReport = { dryRun: opts.dryRun, fetched: { selected: 0, all: 0 }, newSelected: [], newAll: [], devices: 0, sent: 0, failed: 0, removed: 0, errors: [] };
  const minScore = Number(env.MIN_SCORE || "40");
  const maxIndividual = Number(env.MAX_INDIVIDUAL_PER_RUN || "3");

  // 依序抓取，避免同時打兩個請求被網站限流（503／429）。
  const selected = await fetchSelected(env);
  const all = await fetchAll(env);
  report.fetched = { selected: selected.length, all: all.length };
  if (selected.length === 0 && all.length === 0) { report.errors.push("site returned nothing"); return report; }

  const seen = await loadSeen(env);
  const seenSet = new Set(seen);
  const seeded = seen.length === 0;
  const now = Date.now();
  const fresh = (it: FeedItem) => now - Date.parse(it.timelineAt) <= FRESH_WINDOW_MS;
  const scoreOk = (it: FeedItem) => (it.score ?? 0) >= minScore;

  const newSelected = selected.filter((it) => !seenSet.has(it.id) && fresh(it) && scoreOk(it));
  const newAll = all.filter((it) => !seenSet.has(it.id) && fresh(it) && scoreOk(it));
  report.newSelected = newSelected.map((i) => i.id);
  report.newAll = newAll.map((i) => i.id);

  const union = new Set([...all.map((i) => i.id), ...selected.map((i) => i.id), ...seen]);
  const nextSeen = [...union].slice(-SEEN_CAP);

  if (seeded) {
    // 第一次執行只記錄現狀，不推送，避免把既有幾十篇一次全推出去。
    report.seeded = true;
    if (!opts.dryRun) await persistSeen(env, seen, nextSeen);
    return report;
  }
  if (newSelected.length === 0 && newAll.length === 0) {
    if (!opts.dryRun) await persistSeen(env, seen, nextSeen);
    return report;
  }

  const devices = (await listDevices(env)).filter((d) => d.enabled);
  report.devices = devices.length;

  if (!opts.dryRun && devices.length > 0) {
    // 每台裝置依自己的範圍與類別取候選；候選相同的裝置共用同一組訊息。
    const results = await sendToDevices(env, devices, (device) => {
      const pool = device.mode === "all" ? newAll : newSelected;
      const cats = new Set(device.categories);
      const candidates = cats.size === 0 ? pool : pool.filter((it) => it.category && cats.has(it.category));
      if (candidates.length === 0) return null;
      return buildMessages(candidates, maxIndividual);
    });
    report.sent = results.sent; report.failed = results.failed; report.removed = results.removed; report.errors.push(...results.errors);
  }

  if (!opts.dryRun) await persistSeen(env, seen, nextSeen);
  return report;
}

function buildMessages(items: FeedItem[], maxIndividual: number): ApnsMessage[] {
  if (items.length <= maxIndividual) {
    return items.map((it) => ({
      title: it.selected ? "日耕精選" : "日耕 新動態",
      subtitle: it.source.name,
      body: it.title,
      threadId: "aihot-items",
      collapseId: `item-${it.id}`,
      data: { itemId: it.id },
    }));
  }
  const titles = items.slice(0, 3).map((it) => `・${it.title}`).join("\n");
  return [{
    title: `日耕：有 ${items.length} 則新動態`,
    body: titles + (items.length > 3 ? `\n…還有 ${items.length - 3} 則` : ""),
    threadId: "aihot-digest",
    collapseId: "aihot-digest",
    data: { itemId: items[0].id },
  }];
}

async function sendToDevices(
  env: Env,
  devices: Device[],
  messagesFor: (device: Device) => ApnsMessage | ApnsMessage[] | null,
): Promise<{ sent: number; failed: number; removed: number; errors: string[] }> {
  // 密鑰以 wrangler secret 寫入時可能帶入結尾換行（例如由 PowerShell 管線傳入），一律去除頭尾空白。
  const creds: ApnsCredentials = { keyP8: (env.APNS_KEY_P8 ?? "").trim(), keyId: (env.APNS_KEY_ID ?? "").trim(), teamId: (env.APNS_TEAM_ID ?? "").trim() };
  if (!creds.keyP8 || !creds.keyId || !creds.teamId) return { sent: 0, failed: 0, removed: 0, errors: ["APNs secrets not configured"] };
  const result = { sent: 0, failed: 0, removed: 0, errors: [] as string[] };
  const queue = [...devices];
  const worker = async () => {
    while (queue.length) {
      const device = queue.shift()!;
      const built = messagesFor(device);
      if (!built) continue;
      const messages = Array.isArray(built) ? built : [built];
      for (const message of messages) {
        try {
          const r = await sendApns(creds, { topic: env.APNS_TOPIC, environment: device.environment, deviceToken: device.token, message });
          if (r.ok) { result.sent++; continue; }
          result.failed++;
          if (r.unregistered) {
            await env.PUSH_KV.delete(`dev:${device.token}`);
            result.removed++;
            break;
          }
          if (result.errors.length < 10) result.errors.push(`${device.environment}:${r.status}:${r.reason}`);
        } catch (e) {
          result.failed++;
          if (result.errors.length < 10) result.errors.push(String(e));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, devices.length) }, worker));
  return result;
}

// MARK: 網站讀取（公開 API）

async function fetchSelected(env: Env): Promise<FeedItem[]> {
  const res = await siteGet(env, "/api/site/timeline?channel=all&limit=40");
  if (!res) return [];
  const data = res as { cards?: Array<{ item: FeedItem }> };
  return (data.cards ?? []).map((c) => c.item);
}

async function fetchAll(env: Env): Promise<FeedItem[]> {
  const res = await siteGet(env, "/api/site/pool?tab=time&page=1&channel=all");
  if (!res) return [];
  const data = res as { items?: FeedItem[] };
  return data.items ?? [];
}

async function siteGet(env: Env, path: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${env.SITE_BASE}${path}`, { headers: { accept: "application/json", "user-agent": "aihot-push-worker/1.0" } });
      if (res.ok) return await res.json();
      console.warn("site", path, res.status);
      if (res.status !== 429 && res.status !== 503) return null;
      const wait = Math.min(5, Number(res.headers.get("retry-after")) || 2);
      await new Promise((r) => setTimeout(r, wait * 1000));
    } catch (e) {
      console.warn("site fetch failed", path, String(e));
    }
  }
  return null;
}

async function loadSeen(env: Env): Promise<string[]> {
  const v = (await env.PUSH_KV.get(SEEN_KEY, "json")) as string[] | null;
  return Array.isArray(v) ? v : [];
}

/**
 * 只在已見清單有變動時寫入（含最後變動時間）。排程每 5 分鐘跑一次，每次都寫會吃掉 Cloudflare 免費方案
 * 每天 1,000 次的 KV 寫入額度；沒有新文章的輪次不寫。
 */
async function persistSeen(env: Env, before: string[], next: string[]): Promise<void> {
  const known = new Set(before);
  if (next.length === before.length && next.every((id) => known.has(id))) return;
  await saveSeen(env, next);
  await env.PUSH_KV.put("meta:lastRun", new Date().toISOString());
}

async function saveSeen(env: Env, ids: string[]): Promise<void> {
  await env.PUSH_KV.put(SEEN_KEY, JSON.stringify(ids));
}

// MARK: 工具

function isAdmin(request: Request, env: Env): boolean {
  const token = (env.ADMIN_TOKEN ?? "").trim();
  const auth = (request.headers.get("authorization") ?? "").trim();
  return token.length > 0 && auth === `Bearer ${token}`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
