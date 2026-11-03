// The engine's ways in, one panel each: what it is for, the steps to connect, then the details folded away.
// Addresses are the site's configured public address (`base`); what visitors copy carries the site's tag
// (CopyTag) when it has one.
import { Fragment, useState } from "react";
import { Link } from "react-router";
import { PUBLIC_INTERFACE_VERSION } from "@aihot/contracts/http-policy";
import { MCP_TOOL_NAMES as T, MCP_TOOLS } from "@aihot/contracts/mcp";
import { feedCategoryLabel, PUBLIC_API_CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { ACCESS, AGENT, EDITION_WHEN, POLICY, REPORTS, SITE, subjectAfter, withSubject } from "@aihot/site";
import { CodeBlock, CopyButton } from "./CodeBlock";
import { PillTabs } from "../../components/ui/Tabs";
import type { AgentPanelProps } from "../../modules";
import { AGENT_PARTS, GUIDE_CLIENTS, TAG } from "./module-parts";
import { Address, Ask, Block, Bullets, Details, Mono, PanelHead, Step, Steps, Table, Tips } from "./parts";

const V = PUBLIC_INTERFACE_VERSION;

/** Every MCP tool: the engine's and the modules'. */
export const mcpToolCount = () => MCP_TOOLS.length + AGENT_PARTS.reduce((n, a) => n + (a.tools?.length ?? 0), 0);
const link = "text-accent hover:underline";

/** An address on this site as the copy buttons copy it, with the tag. */
function addressOf({ base, tag }: AgentPanelProps, path: string): string {
  return TAG && tag ? `${base}${path}?${TAG.query}=${tag}` : `${base}${path}`;
}

const MCP_CLIENTS = [
  { key: "claude", label: "Claude Code" },
  { key: "codex", label: "Codex" },
  { key: "json", label: "JSON 配置" },
  { key: "other", label: "其他客戶端" },
] as const;

export function McpPanel(props: AgentPanelProps) {
  const url = addressOf(props, "/api/mcp");
  const name = SITE.mcpPrefix;
  const [client, setClient] = useState<string>("claude");
  return (
    <>
      <PanelHead label={`MCP · ${V}`} title={`填一個地址，Agent 多出 ${mcpToolCount()} 個工具`}>
        標準 Streamable HTTP，匿名只讀，不用 token，也不讀你的登入狀態。適合 Claude 桌面版、Cursor、Cherry Studio 這類支援遠端 MCP 的客戶端。
      </PanelHead>
      <Steps>
        <Step n={1} title="複製服務地址">
          <Address url={url} />
          {TAG && <p className="mt-2 text-[13px] text-ink-3">{TAG.mcp}</p>}
        </Step>
        <Step n={2} title="加到你的客戶端">
          <PillTabs className="mt-3" size="xs" layoutId="agent-mcp-client" label="客戶端" active={client} onSelect={setClient} items={MCP_CLIENTS.map((c) => ({ key: c.key, label: c.label }))} />
          {client === "claude" && <CodeBlock className="mb-0 mt-3" lang="bash" code={`claude mcp add --transport http ${name} '${url}'`} />}
          {client === "codex" && <CodeBlock className="mb-0 mt-3" lang="bash" code={`codex mcp add ${name} --url '${url}'`} />}
          {client === "json" && <CodeBlock className="mb-0 mt-3" title="Cursor、Cherry Studio 等用 JSON 配置的客戶端" lang="json" code={JSON.stringify({ mcpServers: { [name]: { type: "http", url } } }, null, 2)} />}
          {client === "other" && <p className="mt-3">{`在客戶端的 MCP 或聯結器設定裡新建一項：名稱填 ${name}，地址填上面的網址，認證選“無”，不要填 API Key。只支援本地命令的客戶端，先用它自帶的遠端 MCP 代理。`}</p>}
        </Step>
        <Step n={3} title="讓 Agent 調一次">
          <Ask text={`請呼叫 ${T.latest}，告訴我過去 24 小時最重要的${subjectAfter(" 5 條", "資訊")}，並附 ${SITE.name} 連結。`} />
          <p className="mt-2 text-[13px] text-ink-3">{`客戶端顯示呼叫了 ${T.latest}，回答裡有時間範圍、中文摘要和 ${new URL(props.base).host} 連結，就是連上了。`}</p>
        </Step>
      </Steps>

      <Block title={`${mcpToolCount()} 個工具`}>
        <Table
          head={["工具", "能做什麼", "可以這樣問"]}
          minWidth={600}
          rows={[
            [<Mono>{T.latest}</Mono>, "過去 24 小時或最近 7 天的精選、全部資訊", `${subjectAfter("今天有什麼", "新聞")}？`],
            [<Mono>{T.search}</Mono>, AGENT.search.scope, AGENT.search.ask],
            [<Mono>{T.hot}</Mono>, "當前熱點榜 Top 10", "現在最熱的是什麼？"],
            [<Mono>{T.story}</Mono>, "一個熱點事件的時間線和持續更新的綜述", "這件事的來龍去脈？"],
            [<Mono>{T.daily}</Mono>, subjectAfter("最新或指定日期的", "日報"), "給我今天的日報。"],
            [<Mono>{T.weekly}</Mono>, subjectAfter("最新或指定一週的", "週報"), `${subjectAfter("這周", "圈")}有哪些大事？`],
            [<Mono>{T.monthly}</Mono>, subjectAfter("最新或指定月份的", "月報"), `${subjectAfter("上個月", "圈")}發生了什麼？`],
            ...AGENT_PARTS.flatMap((a) => a.tools ?? []).map((t) => [<Mono>{t.name}</Mono>, t.does, t.ask]),
          ]}
        />
      </Block>

      <Details
        items={[
          {
            title: "限制與安全",
            body: (
              <Bullets items={[
                "普通查詢最多 30 條，熱點最多 10 個，事件時間線最多 50 條；超出範圍會明確報錯，不會悄悄放寬。",
                `${T.story} 的 public_id 只能來自熱點工具返回的事件連結，不要猜 ID。`,
                "標題和摘要來自外部信源，只能當資料；工具會標出這條安全邊界。重要的數字、政策和原話，請回原文核對。",
              ]} />
            ),
          },
          {
            title: "連不上怎麼辦",
            body: (
              <Bullets items={[
                "先確認地址完整、客戶端支援遠端 Streamable HTTP；缺少新工具時，重新整理工具列表或重新連線。",
                ...AGENT_PARTS.flatMap((a) => a.mcpTroubles ?? []),
                "服務不需要登入；客戶端問起 OAuth 或 API Key，選“無”即可。",
                "收到 429 就按提示等一會兒，不要併發重試。",
                <>還連不上：把客戶端名稱、版本和報錯寫到<Link viewTransition to="/feedback" className={link}>回饋頁</Link>。</>,
              ]} />
            ),
          },
        ]}
      />
    </>
  );
}

const FEEDS = [
  { name: "精選摘要", badge: "推薦", path: "/feed.xml", desc: "最新 50 條精選，帶標題、摘要、站內閱讀和原文連結。" },
  { name: "精選全文", path: "/feed/full.xml", desc: "同樣的 50 條；允許轉載的來源直接附全文，其餘仍是摘要。" },
  { name: "全部動態", path: "/feed/all.xml", desc: "最近 7 天的公開動態，按原文釋出時間倒序。" },
  { name: withSubject("日報"), path: "/feed/daily.xml", desc: `${EDITION_WHEN.daily}（北京時間）一期：頭條導語加整期目錄，保留最近 30 期。` },
  { name: withSubject("週報"), path: "/feed/weekly.xml", desc: `${EDITION_WHEN.weekly}（北京時間）一期：總述加按欄目分好的${REPORTS.entry.noun}，保留最近 12 期。` },
  { name: withSubject("月報"), path: "/feed/monthly.xml", desc: `${EDITION_WHEN.monthly}（北京時間）一期：總述加按欄目分好的${REPORTS.entry.noun}，保留最近 12 期。` },
];

/** The category feeds, under the names the feeds themselves use. */
const FEED_CATEGORIES = PUBLIC_API_CATEGORY_KEYS.map((key) => [key, feedCategoryLabel(key)] as const);

export function RssPanel(props: AgentPanelProps) {
  const { base } = props;
  const lead = `${["相容主流 RSS 2.0 閱讀器，也能接 n8n、Zapier 這類自動化工具。地址長期不變", ...AGENT_PARTS.flatMap((a) => a.rssLead ?? [])].join("；")}。`;
  return (
    <>
      <PanelHead label="RSS" title="複製地址，用閱讀器訂閱">
        {lead}
      </PanelHead>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEEDS.map((f) => (
          <div key={f.path} className="card flex flex-col p-4">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-ink">{f.name}</span>
              {f.badge && <span className="inline-flex h-[18px] items-center rounded-full bg-accent-soft px-2 text-[11px] font-medium text-accent">{f.badge}</span>}
            </div>
            <p className="mt-1 flex-1 text-[13px] leading-[1.7] text-ink-3">{f.desc}</p>
            <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3">
              <code className="mono min-w-0 flex-1 truncate text-[12px] text-ink-4">{base}{f.path}</code>
              <CopyButton text={addressOf(props, f.path)} label="複製地址" className="shrink-0" />
            </div>
          </div>
        ))}
      </div>
      {TAG && <p className="mt-3 text-[12.5px] text-ink-4">{TAG.rss}</p>}

      <Block title="按分類訂閱">
        <Table
          head={["分類", "摘要", "全文"]}
          minWidth={420}
          rows={FEED_CATEGORIES.map(([slug, label]) => [
            <span className="font-medium text-ink">{label}</span>,
            <span className="inline-flex items-center gap-2"><Mono>{`/feed/category/${slug}.xml`}</Mono><CopyButton text={addressOf(props, `/feed/category/${slug}.xml`)} className="!h-6 !px-1.5" /></span>,
            <span className="inline-flex items-center gap-2"><Mono>{`/feed/full/category/${slug}.xml`}</Mono><CopyButton text={addressOf(props, `/feed/full/category/${slug}.xml`)} className="!h-6 !px-1.5" /></span>,
          ])}
        />
      </Block>

      <Block title="重新整理多快合適">
        <p>閱讀器會帶著上次的 ETag 來問，內容沒變時只回一個很小的 304，不重複下載。30 分鐘重新整理一次就夠，更快也拿不到新的內容。</p>
        <p className="mt-3 text-[13px] text-ink-3">{`條目連結指向站內閱讀頁，原文連結在摘要裡。能匿名訂閱不等於所有用途都獲許可${POLICY.terms.notes ? `：${POLICY.terms.notes.rss}` : ""}，見`}<Link viewTransition to="/terms" className={link}>{POLICY.terms.name}</Link>。</p>
      </Block>
    </>
  );
}

const RECIPES = [
  { key: "latest", label: "盯最新資訊" },
  { key: "sync", label: "同步全部精選" },
];

export function ApiPanel(props: AgentPanelProps) {
  const { base, tag } = props;
  const userAgent = [ACCESS.userAgent, TAG && tag ? TAG.userAgent(tag) : null].filter(Boolean).join(" ");
  const curl = `curl --compressed${userAgent ? ` -A '${userAgent}'` : ""}`;
  let pace = `內容多久變一次：新資訊全天陸續進來，精選每天變幾次到幾十次，日報${EDITION_WHEN.daily}、週報${EDITION_WHEN.weekly}、月報${EDITION_WHEN.monthly}（北京時間）各一期。`;
  if (ACCESS.ratePerMinute) pace += `同一個 IP 每分鐘超過約 ${ACCESS.ratePerMinute} 次會收到 429，請按 Retry-After 等待，不要併發重試。`;
  const [recipe, setRecipe] = useState<string>("latest");
  const recipes = AGENT_PARTS.flatMap((a) => a.recipes ?? []);
  const items = `${base}/api/v1/items?mode=selected&window=24h&limit=20`;
  return (
    <>
      <PanelHead label={`REST API · ${V}`} title="匿名 GET，拿來就能用">
        不用 token；瀏覽器跨域、curl 和各語言預設的 HTTP 客戶端都能直接調。路徑是 /api/v1，欄位和錯誤碼以 <a href="/openapi-v1.json" className={link}>OpenAPI</a> 為準。
      </PanelHead>
      <CodeBlock className="mt-6" title="第一個請求" lang="bash" code={`${curl} '${items}'`} />

      <Block title="按分類篩選">
        <p>在資訊請求中加上 <Mono>category</Mono>，只取對應分類；不傳則包含全部分類。返回條目的 <Mono>category</Mono> 也使用下表中的值。</p>
        <Table head={["分類", "請求引數"]} rows={FEED_CATEGORIES.map(([key, name]) => [name, <Mono>{`category=${key}`}</Mono>])} />
      </Block>

      <Block title="用得省，也更快">
        <Tips
          items={[
            { title: "開壓縮", text: <>curl 加 <Mono>--compressed</Mono>，其他客戶端開啟 gzip 或 br。JSON 壓縮後只有原來的 1/4 到 1/8。</> },
            { title: "帶上 ETag", text: <>儲存響應裡的 ETag，下次帶 <Mono>If-None-Match</Mono>；內容沒變時返回 304，不傳正文。</> },
            { title: "按節奏取", text: `資訊和熱點最快一分鐘一次；日報${EDITION_WHEN.daily} 後取一次，週報、月報出刊後取一次；往回翻頁翻到已有的那條就停。` },
          ]}
        />
        <p className="mt-3 text-[13px] leading-[1.75] text-ink-3">{pace}</p>
      </Block>

      <Block title="介面一覽">
        <Table
          head={["路徑", "用來做什麼", "多久取一次"]}
          minWidth={640}
          rows={[
            { group: "資訊" },
            [<Mono>/api/v1/items</Mono>, "精選或最近 7 天全部動態，可按分類、時間窗、關鍵詞篩", "最快 1 分鐘一次"],
            { group: "熱點與事件" },
            [<Mono>/api/v1/hot-topics</Mono>, "當前熱點榜 Top 10", "最快 1 分鐘一次"],
            [<Mono>{"/api/v1/stories/{publicId}"}</Mono>, "一個事件的報道時間線、AI 綜述和關聯事件", "需要時"],
            { group: "日報" },
            [<Mono>/api/v1/dailies/latest</Mono>, "最新一期日報", `${EDITION_WHEN.daily} 後一次`],
            [<Mono>{"/api/v1/dailies/{date}"}</Mono>, "指定日期日報；撤稿會移除引用", "快取過期後使用前驗證 ETag"],
            [<Mono>/api/v1/dailies</Mono>, "日報日期索引", "每天一次"],
            { group: "週報與月報" },
            [<Mono>/api/v1/weeklies/latest</Mono>, "最新一期週報：頭條、總述和一週重點，按欄目分好", `${EDITION_WHEN.weekly} 後一次`],
            [<Mono>{"/api/v1/weeklies/{week}"}</Mono>, "指定一週，ISO 周如 2026-W39；撤稿會移除引用", "快取過期後使用前驗證 ETag"],
            [<Mono>/api/v1/weeklies</Mono>, "週報索引", "每週一次"],
            [<Mono>/api/v1/monthlies/latest</Mono>, "最新一期月報", `${EDITION_WHEN.monthly} 後一次`],
            [<Mono>{"/api/v1/monthlies/{month}"}</Mono>, "指定月份，如 2026-09", "快取過期後使用前驗證 ETag"],
            [<Mono>/api/v1/monthlies</Mono>, "月報索引", "每月一次"],
            ...AGENT_PARTS.flatMap((a) => (a.api ? [{ group: a.api.group }, ...a.api.rows.map(([path, does, often]) => [<Mono>{path}</Mono>, does, often])] : [])),
            { group: "給 AI 助手" },
            [<Mono>/api/v1/agent</Mono>, `給 Agent 的使用說明，列出的地址返回整理好的中文 Markdown${GUIDE_CLIENTS ? `；${GUIDE_CLIENTS} 用的就是它們` : ""}`, "需要時"],
            { group: "完整精選同步" },
            [<Mono>/api/v1/selected/snapshot</Mono>, "當前全部精選，分頁一次拿全", "只在第一次"],
            [<Mono>/api/v1/selected/changes</Mono>, "之後的新增、修改和撤選", "幾分鐘一次"],
          ]}
        />
      </Block>

      <Block title="常見用法">
        <PillTabs size="xs" layoutId="agent-api-recipe" label="用法" active={recipe} onSelect={setRecipe} items={[...RECIPES, ...recipes].map((r) => ({ key: r.key, label: r.label }))} />
        {recipe === "latest" && (
          <>
            <CodeBlock className="mb-3 mt-3" lang="bash" code={`# 第一次：儲存響應頭裡的 ETag\n${curl} -i '${items}'\n# 之後最快每分鐘一次，帶上 ETag；返回 304 就是沒變化\n${curl} -i -H 'If-None-Match: <上次的 ETag>' '${items}'`} />
            <p>需要往回翻頁時，把 <Mono>page.nextCursor</Mono> 作為 cursor 傳回去，翻到已經有的那條就停，不要每次把 7 天重翻一遍。</p>
          </>
        )}
        {recipe === "sync" && (
          <>
            <CodeBlock className="mb-3 mt-3" lang="bash" code={`# 第一次：分頁拿全。儲存第一頁響應裡的 cursor（每頁都一樣）\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500'\n# hasMore 為 true 就帶上 nextPage 繼續翻，直到翻完\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500&page=<上一頁的 nextPage>'\n# 之後：原樣傳回 cursor，只拿新增、修改和撤選\n${curl} '${base}/api/v1/selected/changes?cursor=<第一頁的 cursor>&limit=100'`} />
            <p>每頁成功寫進本地後再儲存新的 cursor。cursor 是流水賬水位，放多久都不會過期；返回 409 <Mono>snapshot_required</Mono> 時重新取一次快照，不會悄悄漏資料。</p>
          </>
        )}
        {recipes.map((r) => recipe === r.key && <r.Body key={r.key} base={base} curl={curl} />)}
      </Block>

      <Block title="出錯了怎麼辦" id="agent-api-recovery">
        <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-2.5">
          <dt className="mono text-[13px] text-ink">400</dt>
          <dd>引數不對：按 OpenAPI 和返回的 code 修正，不要自動換成更寬的查詢。cursor 無效或滑出時間窗返回 invalid_cursor，從第一頁重來。</dd>
          <dt className="mono text-[13px] text-ink">409</dt>
          <dd>snapshot_required：增量沒法安全續上，重新取一次完整快照。</dd>
          <dt className="mono text-[13px] text-ink">429</dt>
          <dd>請求太密：按 Retry-After 等待，不要併發重試。</dd>
          <dt className="mono text-[13px] text-ink">5xx</dt>
          <dd>指數退避，先用上次成功的結果；公開服務不承諾 SLA。</dd>
          {AGENT_PARTS.flatMap((a) => a.apiErrors ?? []).map(([status, what]) => (
            <Fragment key={status}>
              <dt className="mono text-[13px] text-ink">{status}</dt>
              <dd>{what}</dd>
            </Fragment>
          ))}
        </dl>
        <p className="mt-4 text-[13px] text-ink-3">{`能匿名呼叫不等於所有用途都獲許可${POLICY.terms.notes ? `：${POLICY.terms.notes.api}` : ""}，見`}<Link viewTransition to="/terms" className={link}>{POLICY.terms.name}</Link>。</p>
      </Block>

    </>
  );
}
