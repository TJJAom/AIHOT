# 信源

信源在後臺“信源”頁管理：新建、試抓一次看看抓到什麼、改頻率、啟停、看失敗原因和最近的條目。首次啟動時，`industry/sources.json` 裡的示範信源會被匯入。

## 六種信源

| 型別 | 適合 | 需要 |
|---|---|---|
| `rss` | 有 RSS / Atom 的部落格、媒體、Substack、公眾號轉 RSS 服務 | 無 |
| `web_list` | 沒有 RSS 的網頁列表（新聞頁、部落格列表、更新日誌） | 寫選擇器；按需配置 Jina Reader 渲染（按次計費） |
| `json_list` | 返回 JSON 的介面（GitHub Releases 等） | 寫欄位路徑 |
| `x_search` | X（推特）賬號 | SocialData 的 key，按請求計費 |
| `mp_account` | 微信公眾號 | 極致了（Dajiala）的 key，按請求計費 |
| `external` | 你自己的指令碼推送進來的內容 | `INGEST_TOKEN`，見下文 |

`json_list` 的地址或配置可能攜帶憑據，只跟隨同源重定向（協議、主機和埠都相同）。若介面搬到另一個來源，請直接更新信源地址；不要依賴跨源跳轉傳遞認證資訊。

抓取預設不連內網地址。訂閱或列表地址指向自建在內網的服務時（比如同一 Docker 網路裡的 RSSHub，地址寫 `http://rsshub:1200/...`），在 `.env` 裡設 `PRIVATE_FEED_HOSTS=rsshub`（逗號分隔的完整主機名，不區分大小寫），重啟 API 和 worker。放行只對 `rss` 的 `feedUrl`、`web_list` 與 `json_list` 的 `url` 本身生效，這些主機直連、不走 `EGRESS_PROXY_URL`；跳轉到別的主機、文章正文、詳情頁、圖片和圖示仍按原規則拒絕內網地址，鏈路本地和雲後設資料地址（`169.254.0.0/16`、`100.100.100.200` 等）任何時候都拒絕。

每種信源認哪些配置項寫在 [`config-keys.ts`](../packages/backend/src/sources/config-keys.ts)。填了不認識的配置項，儲存會被拒絕、抓取會直接失敗並在後臺顯示原因，不會悄悄退回通用解析。

## 先預覽，再建立

進入 `/admin/sources/new`，填寫 ID、名稱，選擇型別，再把[下一節](#每種信源怎麼配置)對應的 JSON 填入“採集配置（JSON）”。這裡填的是配置物件，不要包上 `kind` 或 `config`。切換型別會重置配置，先選型別再貼上。

名稱裡全形括號中的備註（比如“某媒體（熱點 RSS）”）只給後臺看，讀者在網頁、RSS、Agent Markdown、MCP 和搜尋裡看到的是去掉備註的名字；X 賬號寫成 `X：顯示名 (@handle)` 的，讀者只看到顯示名。公開 API 的 JSON 裡仍是完整的名字。

`rss`、`web_list`、`json_list`、`x_search` 可以點“預覽抓取”：顯示條目總數和前 20 條的標題、原文連結、釋出時間、摘要，不把條目存入文章庫。檢查抓到的是文章而不是導航，日期與原文一致，再點“建立”。預覽和正式採集套用同一組過濾（地址字首、分類、噪聲詞、地址改寫、`publishedAfter`），看到的就是正式採集會收的條目；但它不等於完成生產採集，也不經過後續詳情補齊、精選和公開發布流程。

預覽仍會發出抓取請求；X 和 Jina 預覽也可能產生費用，經過付費回執和預算。`COLLECT_ENABLED=false` 只關閉後臺自動採集，不能用它來保證手動預覽不訪問外部服務。下面的本地 HTML/JSON 示例不需要任何 API key。

## 每種信源怎麼配置

### rss

```json
{ "feedUrl": "https://example.com/feed.xml" }
```

可選：`summaryIsBody`（確認文字訂閱裡的摘要就是全文時，將 RSS 的 `description`、Atom 的 `summary` 當正文，不再去抓原文頁）、`allowCategories` / `denyCategories`（按訂閱裡的分類過濾）。

所有信源的 YouTube、Vimeo 影片播放頁都不作為文章正文提取。Media RSS 的影片描述保留為摘要，即使設定了 `summaryIsBody` 也不會把描述當成影片字幕；訂閱透過 `content` / `content:encoded` 提供的真實文字仍可使用。其他文章中嵌入影片，不影響文章本身的正文讀取。

文章正文中的原生影片保留安全的媒體地址和候選格式，使用瀏覽器控制元件手動播放。影片檔案由瀏覽器直連原站，封面沿用圖片代理；不自動播放、不迴圈，預載入提示設為 `none`，但瀏覽器不保證互動前完全沒有請求。沒有媒體地址和可用封面的播放器只保留後備文字。Markdown 和允許再分發的全文 RSS 保留影片結構，能否播放取決於閱讀器；動態平台播放器和 iframe 不在此範圍。

文章插圖裡內嵌的 SVG 圖不保留圖形本身（顏色和字型依賴原站樣式表），換成原站給這張圖寫的無障礙文字說明（`aria-label`、`aria-labelledby` 指向的文字，或圖裡的 `<title>`、`<desc>`），作為純文字放在圖原來的位置；同一張圖的寬窄兩版只留一份，插圖裡已經顯示的文字（圖注、小標題）不重複。沒有文字說明的圖和插圖之外的 SVG 圖示照舊去掉。

沒有網頁的播客單集（沒有 `<link>`、`guid` 也不是網址），原文連結用它的音訊或影片檔案，瀏覽器可以直接播放；這類單集不抓網頁，按訂閱裡的文書處理。

### web_list

支援普通 CSS 選擇器，`div` 列表也能採集。關鍵是 `itemSelector` 要選中**每條新聞**，而不是包住所有新聞的容器。例如：

```html
<div class="news-list">
  <div class="news-item">
    <h2><a href="/posts/first">第一條示例新聞</a></h2>
    <time datetime="2026-10-01T09:00:00+08:00">10 月 1 日</time>
  </div>
  <div class="news-item">
    <h2><a href="/posts/second">第二條示例新聞</a></h2>
    <time datetime="2026-10-01T10:00:00+08:00">10 月 1 日</time>
  </div>
</div>
```

對應配置（`example.com` 是佔位地址，換成目標網頁；可執行版本見[本地示例](#本地跑通-htmljson-示例)）：

```json
{
  "url": "https://example.com/news",
  "parseMode": "html",
  "itemSelector": ".news-list > .news-item",
  "linkSelector": "h2 a",
  "titleSelector": "h2 a",
  "publishedAtSelector": "time",
  "allowUrlPrefixes": ["https://example.com/posts/"]
}
```

- `itemSelector` 在整個頁面找條目；`linkSelector`、`titleSelector` 在每個條目內取第一個匹配節點，也可以匹配條目自身。選 `.news-list` 只會得到一個容器，通常只取到第一條新聞；只寫 `div` 又會混入巢狀容器。要選重複出現的新聞節點。
- 連結取自 `href`；`/posts/first` 等相對連結按列表重定向後的最終地址解析，也可用 `baseUrl` 指定基準地址。標題取節點文字。重複連結會合並；Markdown 列表先出現“Read more”等按鈕、後出現真實標題時，使用真實標題。指向列表自身的連結通常會跳過。
- 日期在條目內查詢 `publishedAtSelector`，依次嘗試 `datetime`、`content`、`title` 屬性和文字，無法解析的提示文字不會遮住同一節點的有效日期。沒有時區的日期時間可用 `publishedAtUtcOffset`（預設 `+08:00`）；自帶時區的時間保留原時區語義，純 `YYYY-MM-DD` 按 UTC 零點讀。不完整的月份、產品版本號和不存在的日曆日期不作為釋出日期。
- `parseMode`：普通網頁預設 `html`；`markdown` 按 Markdown 連結讀；`docusaurus_changelog` 讀更新日誌標題；`intercom_changelog` 按 Intercom 幫助中心的日期章節讀取標題和正文，每節保留自己的網址錨點，預設按 UTC 日曆日讀取，也可指定 `publishedAtUtcOffset`。需要 Jina 時，顯式把 `url` 寫成 `https://r.jina.ai/https://目標站/路徑` 並配置 `JINA_API_KEY`，不是抓不到就自動切換。Jina 預設返回 Markdown；要繼續使用 CSS 選擇器，顯式設 `parseMode: "html"`。
- `detail`：列表缺日期、標題或摘要時抓詳情頁補齊（`publishedAtSelector`、`titleSelector`、`summarySelector` 等）。`maxFetches` 是每輪最多讀幾篇詳情頁，不設時為 0，即一篇都不讀：每讀一篇就多一次請求，所以要信源自己宣告。讀取失敗或本輪 `maxFetches` 用完的條目，後續抓取繼續補全；補後設資料時保留已確認的正文。已有真實標題不會因為列表仍寫“Read the Blog”而被換回按鈕文字，也不會僅因標題較長再次讀取詳情。需要強制使用詳情標題時設定 `titleAuthoritative: true`。詳情頁和正文提取讀到不帶時區的時間時，先用 `detail.publishedAtUtcOffset`，未設則繼承信源的 `publishedAtUtcOffset`，兩處都未設時預設 `+08:00`。RSS、JSON 列表也可以用 `detail`。
- Jina 列表的 `detail.titleRegex`、`publishedAtRegex` 匹配 Jina 文字，可共用同一次詳情響應；CSS 選擇器讀取原站 HTML。應按實際可讀取的頁面選擇規則。
- `allowUrlPrefixes` / `denyUrlPrefixes`：只收某些路徑下的文章。

### json_list

假設介面返回下面的結構，`itemsPath` 指向陣列，其他欄位路徑相對**每個陣列元素**填寫。路徑用點分隔，不是 JSONPath，不寫 `$` 或 `[*]`。

```json
{
  "data": {
    "items": [
      {
        "id": "first",
        "title": "第一條示例新聞",
        "url": "https://example.com/posts/first",
        "summary": "第一條新聞的摘要。",
        "published_at": "2026-10-01T09:00:00+08:00"
      }
    ]
  }
}
```

對應配置：

```json
{
  "url": "https://example.com/api/news",
  "mode": "json_api",
  "itemsPath": "data.items",
  "titlePaths": ["title"],
  "urlTemplate": "{raw:url}",
  "summaryPaths": ["summary"],
  "publishedAtPath": "published_at",
  "externalIdPath": "id"
}
```

- 介面本身返回陣列時，省略 `itemsPath`。`titlePaths`、`summaryPaths`、`authorPaths` 是候選路徑陣列，按順序取第一個非空值，例如 `["title", "name"]`。
- 已有完整網址時用 `{raw:url}`；只有 slug 時可用 `https://example.com/posts/{slug}`。`{欄位路徑}` 會編碼欄位值，`{raw:欄位路徑}` 原樣插入。JSON 列表不會自動把相對網址補成絕對網址，模板應產出完整的 HTTP(S) 地址。
- `summaryIsBody`：確認介面裡的摘要就是全文時設為 `true`，把 `summaryPaths` 取到的文字當正文，不再去抓原文頁。
- 日期建議返回帶時區的 ISO 字串；`2026-09-30 17:43:58` 這類不帶時區的時間，與網頁列表一樣按 `publishedAtUtcOffset` 讀（預設 `+08:00`）；數字時間戳分別設 `publishedAtUnit: "epoch_s"`（秒）或 `"epoch_ms"`（毫秒），`20261001` 這類日期設 `"yyyymmdd"`。
- 缺少標題或無法生成連結的條目會跳過。非空陣列全部對映失敗時，會報 `no items mapped (check title/url paths)`；路徑不是陣列時，會報 `items path did not resolve to an array`。

### 本地跑通 HTML/JSON 示例

倉庫提供兩份虛構示例：[news.html](examples/sources/news.html) 和 [news.json](examples/sources/news.json)，各有兩條新聞。它們用於核對選擇器和欄位對映，不是營運信源；示例文章連結不提供正文。

在倉庫根目錄、Node.js 24.11 以上執行以下命令。服務只監聽本機，只提供這兩份檔案；用 `Ctrl+C` 停止。

```bash
node --input-type=module -e '
import http from "node:http";
import { readFileSync } from "node:fs";
const files = {
  "/news.html": ["text/html; charset=utf-8", readFileSync("docs/examples/sources/news.html")],
  "/news.json": ["application/json", readFileSync("docs/examples/sources/news.json")]
};
http.createServer((req, res) => {
  const file = files[req.url];
  res.writeHead(file ? 200 : 404, { "content-type": file ? file[0] : "text/plain" });
  res.end(file ? file[1] : "Not found");
}).listen(8787, "127.0.0.1");'
```

在同一臺機器上，按[非 Docker 部署方式](deploy.md#不用-docker)準備好資料庫，用 `npm run dev:api`、`npm run dev:web` 執行開發 API 和網頁，保持採集、模型、飛書和 IndexNow 開關關閉，不啟動 worker。僅為此次本機示例，在開發 API 程序設定 `ALLOW_PRIVATE_NETWORK_FETCH=true` 後重啟；預設禁止抓內網地址，生產環境拒絕啟用此項，驗證後移除。若 API 在容器或另一臺伺服器，`127.0.0.1` 指向它自己，此命令的地址不能直接用於該部署。

分別選擇 `web_list`、`json_list`，貼上配置並點“預覽抓取”，無需建立信源：

```json
{
  "url": "http://127.0.0.1:8787/news.html",
  "parseMode": "html",
  "itemSelector": ".news-list > .news-item",
  "linkSelector": "h2 a",
  "titleSelector": "h2 a",
  "publishedAtSelector": "time",
  "allowUrlPrefixes": ["http://127.0.0.1:8787/posts/"]
}
```

```json
{
  "url": "http://127.0.0.1:8787/news.json",
  "mode": "json_api",
  "itemsPath": "data.items",
  "titlePaths": ["title"],
  "urlTemplate": "http://127.0.0.1:8787/posts/{id}",
  "summaryPaths": ["summary"],
  "publishedAtPath": "published_at",
  "externalIdPath": "id"
}
```

兩次都應顯示 **2 條**，依次為下表內容。JSON 示例還顯示對應摘要，HTML 示例沒有配置摘要提取。預覽 API 的日期是 UTC，後臺介面按 `+08:00` 顯示為 09:00 和 10:00。

| 標題 | 原文連結 | 預覽 API 的 publishedAt |
|---|---|---|
| 第一條示例新聞 | `http://127.0.0.1:8787/posts/first` | `2026-10-01T01:00:00.000Z` |
| 第二條示例新聞 | `http://127.0.0.1:8787/posts/second` | `2026-10-01T02:00:00.000Z` |

可以把 HTML 的 `itemSelector` 暫改成 `.news-list` 對照：只會返回第一條。改回 `.news-list > .news-item` 後恢復兩條，這就是“列表容器”和“每條新聞”的區別。

抓真實網頁時先看原始 HTTP 響應中有沒有新聞節點。普通 HTML 模式不執行 JavaScript；瀏覽器裡看得到、響應裡沒有的內容，不能靠換一個 CSS 選擇器生成。優先找 RSS 或 JSON 介面，或按需配置 Jina / 自己維護的外部採集。`no items matched (html)` 還可能是選擇器不匹配、沒有 `href` 或標題、連結被字首規則過濾；先核對響應與配置，不必先更換採集器。

### x_search

這類信源使用 SocialData 搜尋，不是把 X 個人主頁 URL 填入網頁列表。以 `https://x.com/SomeAccount` 為例，取使用者名稱 `SomeAccount`，不要包含 `@` 或整段 URL：

```json
{ "query": "from:SomeAccount -filter:replies", "searchType": "Latest" }
```

`SomeAccount` 是佔位使用者名稱，換成你要關注的真實賬號。`-filter:replies` 排除回覆；`Latest` 按最新內容查詢。

在後端執行環境的 `.env` 配置 `SOCIALDATA_API_KEY`，重啟 API（預覽）和 worker（定時採集）後生效；不要把 key 寫進信源 JSON 或提交到倉庫。先在後臺“設定 → 付費請求上限”檢查 SocialData 額度，再按需預覽。未配置 key 會報 `SOCIALDATA_API_KEY is not configured`；服務拒絕請求或預算熔斷時看後臺錯誤原因。預覽可能有付費請求，本文不要求用真實服務驗證，結果取決於賬號和服務當時的返回。

生產自動採集時，普通賬號會被自動合併成一次搜尋（每次最多二十幾個賬號），省請求數；單個信源的手動預覽不是合併採集。

### mp_account

```json
{ "ghid": "gh_xxxxxxxx", "nickname": "公眾號名稱" }
```

每個公眾號按它的抓取間隔檢查一次（查列表按次計費），新文章的正文一併取回。

需要在後端 `.env` 配置 `DAJIALA_KEY`，`ghid` 換成公眾號原始 ID。配置欄位用上面的 `ghid` / `nickname`，不要寫成 `biz` / `name`。當前 `mp_account` 不支援“預覽抓取”；`external` 也不支援主動試抓，按下方推送介面接入。

## 分級、參與方式與全文

- **分級** `tier`：`T1` 官方一手（官網、官方部落格、機構）、`T1_5` 官方賬號與準官方創作者、`T2` 媒體與個人、`EXCLUDE_MP` 不參與精選。入選門檻按分級不同（`industry/selection.ts`）。
- **信源類別**（可選）：日常內容主要寫給開發者或業內的官方信源，可以在後臺“信源”頁選一個類別（`industry/selection.ts` 的 `classes`），入選門檻抬到不低於類別的數，見 [精選與校準](selection.md#門檻industryselectionts)。`industry/sources.json` 不帶這一項，匯入後在後臺設。
- **參與方式** `participation_mode`：`editorial` 進精選和全部動態；`hot_signal` 不單獨展示，只作為“大家在討論什麼”的熱度證據；`isolated` 不進任何公開頁面。
- **一手**：只有 `T1` 算一手，不單獨設定。同一條新聞有幾篇報道時，代表報道優先選一手的，事件頁也優先展示一手報道。
- **釋出方**（可選，寫在 `config` 裡）：
  - `publisherUrlPrefixes`：`T1` 信源自己文章網址的字首，比如 `["https://example.com/blog/"]`。別的信源（聚合站、轉帖）帶來的這些網址的文章，只要能認定是唯一一個官方信源的，就改記到它名下。網頁列表信源不寫時，認它自己列表所在的路徑（這篇也要在它的列表裡出現過）。
  - `publisherRole`：`T1_5` 賬號的身份，`organization`（機構官方賬號）或 `person`（官方人員）。再填上信源的 `owner_entity_id`（`industry/taxonomy.ts` 的 `ENTITIES` id），這個賬號發的、主體正是這家公司的新聞，就能當代表報道（排在 `T1` 之後）。
- **全文**：`site_fulltext` 決定站內能不能顯示全文，`syndicate_fulltext` 決定全文 RSS 能不能帶正文。兩者**預設都關**，只顯示摘要和原文連結；來源明確允許時再開啟。公眾號、付費牆內容不會因為技術上抓得到就獲得全文展示。

## 抓取頻率

每個信源有自己的抓取間隔。每天 04:20 會按近 7 天的產出自動調整：產出多的抓得勤，最短 15 分鐘（經 Jina 讀的網頁列表最短 60 分鐘）；最長的，一般信源 60 分鐘，X 賬號和經 Jina 讀的網頁列表 120 分鐘，只作熱度證據的 180 分鐘。合併搜尋的 X 賬號跟著合併後的節奏：進精選的半小時一次，只作熱度證據的一小時一次。

抓取失敗不推進位置，下次從同一處繼續；連續失敗的信源在後臺標紅，每週一會在營運群發一份信源週報（配置了飛書告警時）。

「7 天沒有新內容」按**信源自己的節奏**判斷，而不是一個固定的視窗：日報和週報裡分兩類。**超出自身更新節奏**的排在前面，先對照原站（把最近 90 天的**產出日**去重到「天」，相鄰兩天的間隔取中位數當它的節奏；至少有 4 個這樣的日子才算有節奏，靜默時長要超過中位間隔的 4 倍才算超）。產出日取該條內容的釋出時間，頁面沒給時間就用我們發現它的那天；**一次首次匯入算一天**——它是一次交付，釋出時間往回鋪多遠都不算多次產出（否則一個從沒產出過的源會顯得很準時，跨月的首次匯入還會把中位間隔撐大，把一個已經安靜的源藏起來）。視窗只算這 90 天裡的產出日，更早的歷史說明不了它現在多久發一次；發現時間與釋出時間沒有固定先後，任一個落在視窗內就讀，產出日再按視窗夾一次。**判斷不了節奏的仍然列出**，但不當作故障，分兩種：視窗內沒有可比較的產出（它產出過，只是都在視窗外），以及從未收到過內容（那是採集問題）；在自身節奏內的不再列出。抓取間隔 `interval_minutes` 不參與判斷——它表示我們多久看一次，不是它多久發一次。

## 規則：舊文不刷屏

首次發現時原文已經發布超過 48 小時的資料、新信源第一次匯入的存量條目、標記為回灌的推送，都按原文時間歸檔：不進入“今天”，也不推送。沒有可信釋出時間的資料先不公開（不進公開列表、精選、報告、熱點和推送），從原信源或原文頁讀到日期後再判斷新舊。這條規則所有入口共用，防止一次性匯入歷史內容刷屏。

新信源第一次匯入時，只取列表裡前 `_aihot.initialBackfillLimit` 條（預設 30）、`_aihot.initialBackfillMonths` 個月以內（預設 12）的條目。之後的抓取只收釋出時間在信源第一次匯入前 48 小時以內或之後的條目，列表裡更早的存量不再進來，不會為整個訂閱存檔付費；第一次匯入以後釋出的條目，排在長列表第幾條都會收。列表上沒有釋出時間的條目照收，按上面的規則等讀到日期再判斷。X 賬號按抓取位置往後讀，不受這條限制。

如果只想從一個固定時間之後開始監控，可在 RSS、網頁列表、JSON 配置中設定 `publishedAfter`，例如 `"2026-10-01T00:00:00.000Z"`。必須是完整的 UTC 時間，可省略毫秒；預覽、首次和後續採集都只接受**嚴格晚於**它且釋出日期可信的條目，未知日期也會排除。起點當天的單頁更新章節若仍使用同一釋出日期，之後追加的內容也不會被納入；選擇起點時要把這個限制考慮進去。

## 外部推送介面

自己寫指令碼抓的內容，可以推進站裡，走和普通採集一樣的判重、精選和歸組。

```
POST /api/ingest/items
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

{
  "sourceId": "my-crawler",
  "sourceName": "我的抓取指令碼",
  "items": [
    { "title": "必填", "url": "必填", "publishedAt": "2026-10-01T08:00:00+08:00", "author": "可選" }
  ]
}
```

- `INGEST_TOKEN` 在 `.env` 裡設定，至少 16 位；不設定時介面一律返回 401。
- 每次最多 50 條，超過返回 413。每個客戶端每分鐘能推幾次由 `INGEST_RATE_LIMIT` 決定：`docker compose` 預設 10，超過返回 429（帶 `Retry-After: 60`）；不用 Docker 時預設不限，前面沒有反向代理限流的話在 `.env` 裡設上，設成 0 表示不限。
- 返回 `{"ok": true, "created": <新建條數>}`。不是 JSON 物件的條目、缺標題或網址的條目會被跳過，同一請求裡重複的網址只取第一條。
- `sourceId` 不存在時會自動建一個 `external` 信源，預設不進公開頁面：到後臺把它的參與方式改成 `editorial` 才會出現在站上。
- 在後臺暫停信源後，推送介面返回 409，不再接收新文章；恢復信源後可以繼續推送。
- 條目的 `raw._aihot.backfill` 為 `true` 時按歷史回灌處理（不進入“今天”、不推送）。
