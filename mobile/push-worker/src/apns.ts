// APNs HTTP/2 用 provider token（ES256 JWT）。Workers 的 fetch 會對 api.push.apple.com 使用 HTTP/2。
// 參考 Apple「Establishing a token-based connection to APNs」。

export interface ApnsCredentials {
  keyP8: string;   // .p8 內容（PEM）
  keyId: string;
  teamId: string;
}

export interface ApnsMessage {
  title: string;
  body: string;
  subtitle?: string;
  threadId?: string;
  collapseId?: string;
  data?: Record<string, string>;
}

export type ApnsResult =
  | { ok: true; apnsId: string | null }
  | { ok: false; status: number; reason: string; unregistered: boolean };

let cachedJwt: { token: string; issuedAt: number; keyId: string } | null = null;

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** DER (r,s) 轉 JOSE 的 raw 64 bytes；WebCrypto 的 ECDSA 已直接輸出 raw，這裡只做長度保險。 */
function ensureRawSignature(sig: ArrayBuffer): Uint8Array {
  const u = new Uint8Array(sig);
  if (u.length === 64) return u;
  // DER: 0x30 len 0x02 rlen r 0x02 slen s
  let offset = 2;
  const rLen = u[offset + 1]; const r = u.slice(offset + 2, offset + 2 + rLen); offset += 2 + rLen;
  const sLen = u[offset + 1]; const s = u.slice(offset + 2, offset + 2 + sLen);
  const raw = new Uint8Array(64);
  raw.set(r.slice(-32), 32 - Math.min(32, r.length));
  raw.set(s.slice(-32), 64 - Math.min(32, s.length));
  return raw;
}

/** Apple 要求 token 20–60 分鐘內更新一次；這裡 50 分鐘重簽，並在 isolate 記憶體內快取。 */
export async function providerToken(creds: ApnsCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.keyId === creds.keyId && now - cachedJwt.issuedAt < 50 * 60) return cachedJwt.token;

  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(creds.keyP8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: creds.keyId })));
  const claims = base64url(new TextEncoder().encode(JSON.stringify({ iss: creds.teamId, iat: now })));
  const signingInput = `${header}.${claims}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput));
  const token = `${signingInput}.${base64url(ensureRawSignature(sig))}`;
  cachedJwt = { token, issuedAt: now, keyId: creds.keyId };
  return token;
}

export async function sendApns(
  creds: ApnsCredentials,
  opts: { topic: string; environment: "sandbox" | "production"; deviceToken: string; message: ApnsMessage },
): Promise<ApnsResult> {
  const host = opts.environment === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const jwt = await providerToken(creds);
  const payload = {
    aps: {
      alert: { title: opts.message.title, body: opts.message.body, ...(opts.message.subtitle ? { subtitle: opts.message.subtitle } : {}) },
      sound: "default",
      ...(opts.message.threadId ? { "thread-id": opts.message.threadId } : {}),
      "mutable-content": 0,
    },
    ...(opts.message.data ?? {}),
  };
  const headers: Record<string, string> = {
    authorization: `bearer ${jwt}`,
    "apns-topic": opts.topic,
    "apns-push-type": "alert",
    "apns-priority": "10",
    "apns-expiration": String(Math.floor(Date.now() / 1000) + 6 * 3600),
    "content-type": "application/json",
  };
  if (opts.message.collapseId) headers["apns-collapse-id"] = opts.message.collapseId.slice(0, 64);

  const res = await fetch(`https://${host}/3/device/${opts.deviceToken}`, { method: "POST", headers, body: JSON.stringify(payload) });
  if (res.ok) return { ok: true, apnsId: res.headers.get("apns-id") };
  let reason = "";
  try { reason = ((await res.json()) as { reason?: string }).reason ?? ""; } catch { /* 非 JSON */ }
  // 410 Unregistered / 400 BadDeviceToken：token 失效，呼叫端應刪除。
  const unregistered = res.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic";
  return { ok: false, status: res.status, reason: reason || `HTTP ${res.status}`, unregistered };
}
