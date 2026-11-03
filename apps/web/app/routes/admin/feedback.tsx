import { ADMIN, SITE } from "@aihot/site";
import { useState } from "react";
import { Form, useSearchParams } from "react-router";
import type { Route } from "./+types/feedback";
import type { AdminFeedback, AdminFeedbackRow } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj } from "../../features/admin/format";
import { FEEDBACK_KIND, FEEDBACK_STATUS } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, Empty, FilterChips, Input, Pager, ReasonDialog, Select, Textarea, Time } from "../../features/admin/ui";



export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminFeedback>(request, `/api/admin/feedback${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `回饋 · ${SITE.name} 後臺` }];

const TONE: Record<string, "accent" | "warn" | "ok" | "muted"> = { new: "accent", triaged: "warn", replied: "ok", resolved: "ok", spam: "muted" };
/** The pool's names, offered while naming a suggestion so the same idea keeps one name. */
const IDEAS_LIST = "feedback-ideas";

function FeedbackCard({ f }: { f: AdminFeedbackRow }) {
  const { run, pending } = useAdminAction();
  const [note, setNote] = useState(f.note ?? "");
  const [idea, setIdea] = useState(f.idea ?? "");
  const [dialog, setDialog] = useState<null | "ban" | "email-ban" | "erase">(null);
  const base = `/api/admin/feedback/${f.id}`;
  const version = new Date(f.updated_at).toISOString();
  const edited = note !== (f.note ?? "") || idea !== (f.idea ?? "");
  return (
    <article className="rounded-panel bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
        <span className="num font-medium text-ink-2">#{f.id}</span>
        <Badge tone={TONE[f.status] ?? "muted"}>{FEEDBACK_STATUS[f.status] ?? f.status}</Badge>
        {f.kind && <Badge tone="info">{FEEDBACK_KIND[f.kind] ?? f.kind}</Badge>}
        {f.idea && <Badge tone="muted" title="歸入建議池的這一條">{f.idea}</Badge>}
        <Time at={f.created_at} />
        {f.email && <a className="text-accent" href={`mailto:${f.email}`}>{f.email}</a>}
        {f.page_url && <a className="max-w-[320px] truncate hover:text-accent" href={f.page_url} target="_blank" rel="noreferrer">{f.page_url}</a>}
        {f.from_source > 1 && <Badge tone="info" title="同一來源（IP 與瀏覽器家族的不可逆標識）">同來源 {f.from_source} 條</Badge>}
        {f.banned && <Badge tone="bad">來源已封禁</Badge>}
        {f.email_banned && <Badge tone="bad">電子郵件已臨時封禁</Badge>}
        {!f.forwarded_at && f.status === "new" && (
          <Badge tone="warn" title={f.forward_error && f.forward_error !== "pending" ? `還沒有轉發到內部飛書群：${f.forward_error}` : "還沒有轉發到內部飛書群"}>未轉發</Badge>
        )}
      </div>
      <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{f.content}</p>
      {f.screenshot === "local" && (
        <a href={`${base}/screenshot`} target="_blank" rel="noreferrer" className="mt-2 inline-block">
          <img src={`${base}/screenshot`} alt="回饋截圖" loading="lazy" className="max-h-48 rounded-control ring-1 ring-line" />
        </a>
      )}
      {f.screenshot === "feishu" && <p className="mt-2 text-[12.5px] text-ink-4">截圖已隨回饋轉到內部飛書群。</p>}
      {f.screenshot === "gone" && <p className="mt-2 text-[12.5px] text-ink-4">截圖未能轉到飛書，已刪除。</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-start">
        <div className="grid gap-2">
          <Select
            aria-label="處理狀態"
            value={f.status}
            disabled={!!pending}
            onChange={(e) => run("PATCH", base, { status: e.target.value, version }, { label: "status", success: "狀態已更新" })}
          >
            {Object.entries(FEEDBACK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select
            aria-label="型別"
            value={f.kind ?? ""}
            disabled={!!pending}
            onChange={(e) => run("PATCH", base, { kind: e.target.value || null, version }, { label: "kind", success: "型別已更新" })}
          >
            <option value="">未分類</option>
            {Object.entries(FEEDBACK_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div className="grid gap-2">
          <Textarea rows={1} className="!min-h-[38px]" placeholder="處理備註（僅內部可見）" value={note} onChange={(e) => setNote(e.target.value)} />
          {f.kind === "suggestion" && (
            <Input list={IDEAS_LIST} aria-label="歸入的建議" placeholder="歸入的建議（同一需求用同一個名字）" value={idea} onChange={(e) => setIdea(e.target.value)} />
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="md" disabled={!edited} busy={pending === "note"} onClick={() => run("PATCH", base, { note: note || null, ...(f.kind === "suggestion" ? { idea: idea || null } : {}), version }, { label: "note", success: "已儲存" })}>
            儲存
          </Button>
          <Button tone="ghost" onClick={() => setDialog(f.banned ? null : "ban")} disabled={f.banned} title="拒絕這個來源的後續回饋">封禁來源</Button>
          {f.email && <Button tone="ghost" onClick={() => setDialog("email-ban")} disabled={f.email_banned} title="拒絕填寫這個電子郵件的回饋，48 小時後自動解除">臨時封禁電子郵件</Button>}
          <Button tone="ghost" onClick={() => setDialog("erase")} title="按隱私說明刪除提交者的資料">刪除資料</Button>
        </div>
      </div>
      <ReasonDialog
        open={dialog === "ban"}
        title="封禁這個回饋來源"
        description={`同一來源之後提交回饋會被拒絕。來源標識不可還原成 IP。${ADMIN?.banNote ?? ""}`}
        danger
        confirmLabel="封禁"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", "/api/admin/feedback-bans", { sourceHash: f.source_hash, reason }, { label: "ban", success: "已封禁" })) !== null}
      />
      <ReasonDialog
        open={dialog === "email-ban"}
        title="臨時封禁這個回饋電子郵件"
        description="填寫這個電子郵件的回饋將暫停 48 小時，換網路或瀏覽器也生效。電子郵件未經驗證，請只在確認持續濫用後使用；不會連帶封禁其他電子郵件或訪問網頁。"
        danger
        confirmLabel="封禁 48 小時"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", "/api/admin/feedback-bans", { feedbackId: f.id, reason }, { label: "email-ban", success: "電子郵件已臨時封禁 48 小時" })) !== null}
      />
      <ReasonDialog
        open={dialog === "erase"}
        title="刪除提交者資料"
        description="刪除正文、電子郵件、頁面地址和截圖，只保留處理記錄。不可恢復。"
        danger
        confirmLabel="刪除"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", `${base}/erase`, { reason }, { label: "erase", success: "資料已刪除" })) !== null}
      />
    </article>
  );
}

export default function FeedbackAdmin({ loaderData }: Route.ComponentProps) {
  const { rows, counts, kinds, ideas, bans, page } = loaderData;
  const [sp] = useSearchParams();
  const { run } = useAdminAction();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <AdminPage title="回饋" subtitle={ADMIN?.feedbackNote}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2">
          <FilterChips
            param="status"
            options={[{ value: "", label: "全部", count: total }, ...Object.entries(FEEDBACK_STATUS).map(([k, v]) => ({ value: k, label: v, count: counts[k] ?? 0 }))]}
          />
          <FilterChips
            param="kind"
            resets={["idea"]}
            options={[{ value: "", label: "全部型別" }, ...Object.entries(FEEDBACK_KIND).map(([k, v]) => ({ value: k, label: v, count: kinds[k] ?? 0 }))]}
          />
        </div>
        <Form method="get" className="w-full max-w-xs">
          {["status", "kind", "idea"].map((k) => sp.get(k) && <input key={k} type="hidden" name={k} value={sp.get(k)!} />)}
          <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="搜尋內容、電子郵件、頁面" aria-label="搜尋回饋" />
        </Form>
      </div>
      {sp.get("kind") === "suggestion" && ideas.length > 0 && (
        <Card className="mb-4" title="建議池" right="按提出人數排序">
          <FilterChips param="idea" options={[{ value: "", label: "全部建議" }, ...ideas.map((i) => ({ value: i.idea, label: i.idea, count: i.people }))]} />
        </Card>
      )}
      <datalist id={IDEAS_LIST}>{ideas.map((i) => <option key={i.idea} value={i.idea} />)}</datalist>
      <div className="space-y-3">
        {rows.length ? rows.map((f) => <FeedbackCard key={`${f.id}-${f.updated_at}`} f={f} />) : <Card><Empty>沒有符合條件的回饋</Empty></Card>}
      </div>
      <Pager page={page} hasMore={rows.length === 50} />
      {bans.length > 0 && (
        <Card className="mt-8" title="回饋封禁">
          <ul className="space-y-2 text-[13px]">
            {bans.map((b) => (
              <li key={b.source_hash} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {b.source_hash.startsWith("email:") ? "電子郵件" : "來源"} · <span className="break-all font-mono text-[12px] text-ink-3">{b.source_hash}</span> · {b.reason} · {b.created_by} · {bj(b.created_at, true)}
                  {b.expires_at && <span> · {bj(b.expires_at, true)} 自動解除</span>}
                </span>
                <Button size="sm" tone="ghost" onClick={() => run("DELETE", `/api/admin/feedback-bans/${encodeURIComponent(b.source_hash)}`, undefined, { label: `unban-${b.source_hash}`, success: "已解除封禁" })}>
                  解除
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AdminPage>
  );
}
