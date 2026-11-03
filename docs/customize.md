# 把它改成你的行業

這份倉庫預設是一個“AI 行業”的示例站：示範信源是一批公開的 AI 資訊源，精選口味是 AIHOT 在 AI 領域調了很久的那一套。要把它變成“法律熱點”“HR 熱點”“黃金熱點”，要改的東西幾乎都在 [`site/`](../site/)（這個站自己的名字、文案、品牌和頁面）和 [`industry/`](../industry/)（行業的分類、信源、提示詞和門檻）這兩個資料夾裡，程式碼基本不用動。

如果你用 Claude Code、Codex 這類 Agent，可以把下面這段直接發給它，然後回答它的問題：

```text
請讀 AGENTS.md 和 docs/customize.md，把這個站改成「XX 行業」的熱點站。
我關心的是：……（寫你想盯的信源、你覺得什麼訊息重要、什麼不重要，越具體越好）。
改完幫我跑 npm run typecheck、npm test 和 node scripts/smoke.ts，並告訴我還需要我自己決定哪些事。
```

下面是它（或者你）要做的事，按順序。

## 1. 站名和文案：`site/site.ts`

[`site/site.ts`](../site/site.ts) 的每個匯出項和欄位旁邊都寫了直接註釋（用在哪裡、能不能留空、預設值什麼意思），從上往下按註釋改即可；改完重新構建（`docker compose up -d --build`）前後端一起生效。跨檔案或上線後要注意的只有這幾條：

- **站點地址不在 `site.ts` 裡**：部署時用環境變數 `SITE_URL` 設定（`SITE.defaultUrl` 只是沒設 `SITE_URL` 時的本地兜底）。
- **一起改的名字**：改 `SITE.name` 時順手把 `SITE.organization.name`（給搜尋引擎看的結構化資料）一起改掉；`SITE.crawlerName` 寫你自己的抓取標識，別冒用別人的站名。
- **上線或有人接入後不要再改的標識**：`SITE.mcpPrefix`（MCP 工具名字首）、`PUBLIC_CATEGORIES`（公開介面與訂閱源的類別合併和改名）、`ABOUT.termsAnchor`（外部寫死過的錨點）；`SITE.interfaceVersion` 只升不降，改了已有公開欄位或含義時升主版本。
- **出刊時間寫整點或半點**：`EDITION_TIMES`（北京時間 `HH:mm`）由每半小時一次的排程檢查，日報視窗、缺期告警和各處時間文案都讀它。
- **導航隱藏的範圍**：`NAV.hidden` 目前只開放 `"/hot"` 和 `"/topics"`（一併處理側欄、底欄、“我的”頁、返回連結、麵包屑，以及隱藏 `"/hot"` 時的首頁熱點條和事件頁名次；直接開啟地址仍能訪問）。
- **限流說明與實際一致**：前面的反向代理真的按 IP 限流了，再填 `ACCESS.ratePerMinute`。

## 2. 分類、標籤和主題：`industry/taxonomy.ts`、`industry/topics.json`

[`industry/taxonomy.ts`](../industry/taxonomy.ts) 定義類別（`CATEGORIES`）、報頭重點發布計數（`RELEASE`）、總述免核對通用詞（`PLAIN_TERMS`）、內容型別（`ITEM_TYPES`）、標籤詞表與近義詞（`CATEGORY_TAGS`、`TOPIC_TAGS`、`ENTITY_TAGS`、`TAG_SYNONYMS`），以及公司名錄和防張冠李戴詞典（`ENTITIES`、`IDENTITY_LEXICON`、`PUBLISHER_DOMAINS`、`IDENTITY_CONTEXT_ALIASES`）。各欄位含義直接看檔案內註釋，改動時注意這幾處聯動：

- **網址裡的 `key` 上線後不改**：`CATEGORIES` 的 `key` 會進網址和訂閱地址（`/all?category=`、`/feed/category/<key>.xml`）。要讓某一類在公開介面、RSS 和 MCP 裡並進另一類釋出（網頁上仍分開），在 `site/site.ts` 的 `PUBLIC_CATEGORIES` 裡配。
- **和提示詞同步**：改了 `CATEGORIES`、標籤詞表或 `ITEM_TYPES`，要同步改 `industry/prompts/structure.md`（歸類原則與標籤規則）、`content-understanding.md`（內容型別列舉）和 `selection-score.md`（各內容型別的五維權重表）。
- **不需要防張冠李戴時可清空**：`IDENTITY_LEXICON`、`PUBLISHER_DOMAINS`、`IDENTITY_CONTEXT_ALIASES` 用來保證標題摘要裡提到的公司在原文裡出現過；你的行業不需要這項檢查時設為空陣列 `[]`。
- **`industry/topics.json`**（主題目錄 `/topics`）：站點啟動時讀取，改完重新構建（`docker compose up -d --build`）生效。分 `company`（公司與機構）、`field`（方向）、`genre`（內容形態）三組，`slug` 上線後不要改：
  - `company` 主題用 `entityId`（`ENTITIES` 的 id）收以這家公司為主體的報道；一篇報道的主體有幾家公司時，標題裡點了它的名才算。可選 `aliases`：搜尋框裡只搜這個詞，也能找出這家公司的報道。
  - `field` 和 `genre` 主題用 `tags` 收打了這些標籤的報道。

## 3. 信源：`industry/sources.json`

這是首次啟動時匯入的示範信源，已經存在的不會被覆蓋；之後每次啟動只補上檔案裡有、庫裡還沒有的，從檔案裡刪掉的不會從庫裡刪（不要的在後臺暫停）。上線後更常用的是後臺“信源”頁：能新建、試抓、調頻率、暫停、看失敗原因。

每個信源的關鍵欄位：

| 欄位 | 含義 |
|---|---|
| `kind` | `rss`、`web_list`（網頁列表，配選擇器）、`json_list`（JSON 介面）、`x_search`（X 賬號，需要 SocialData）、`mp_account`（公眾號，需要極致了）、`external`（外部推送） |
| `config` | 每種信源的配置，見 [信源](sources.md) |
| `tier` | 信源分級：`T1` 官方一手、`T1_5` 官方賬號與準官方、`T2` 媒體與個人、`EXCLUDE_MP` 不參與精選。不同分級的入選門檻不同。`T1` 就是“一手”，不用另外標 |
| `owner_entity_id` | 可選，這個信源屬於哪家公司（`ENTITIES` 的 id）。同一家公司的幾個信源在熱度裡只算一個參與方；`T1_5` 的官方賬號要當代表報道，也要填它（見 [信源](sources.md)） |
| `participation_mode` | `editorial` 進精選和全部動態；`hot_signal` 只作熱度證據；`isolated` 不進任何公開頁面 |
| `site_fulltext` | 站內能不能展示全文。**預設關**：只展示摘要和原文連結。只有來源明確允許時才開啟 |
| `syndicate_fulltext` | 全文 RSS 能不能帶正文。**預設關**；只在站內也展示全文時生效，來源明確允許轉載時才開啟 |

中國大陸的很多行業，一手資訊在公眾號上。公眾號信源需要極致了（Dajiala）的 key，按請求計費，有預算熔斷。

## 4. 精選標準：`industry/prompts/`

這是最值得花時間的一步：你對這個行業的判斷經驗就寫在這裡。

| 檔案 | 作用 |
|---|---|
| `prefilter.md` | 預篩：這條資料是不是這個行業的事。寬召回，只攔明顯無關的 |
| `selection-score.md` | **評分標準**：給 0–100 分。裡面有內容型別、五個維度、各型別的權重、必須正常評價的價值、必須壓住的噪聲 |
| `content-understanding.md` | 入選和接近入選內容的寫法：中文標題、答案先行的摘要、推薦理由（它也會給標籤，但頁面上的分類和標籤來自 `structure.md`） |
| `rules-domain.md` | 行業術語的翻譯與保留規則（示例是 AI 術語：LLM 譯作大語言模型、Token 保留英文……） |
| `mend-wording.md` | 改用詞：標題、摘要、推薦理由用了 `industry/wording.ts` 裡列出的詞時，讓模型只改這些詞 |
| `summarize-*.md` | 其他內容的標題摘要寫法 |
| `structure.md` | 分類、標籤、主體公司，判斷是一條具體新聞還是講多件事的綜合稿，抽出新聞的事實（誰、做了什麼、對什麼，附原文出處和前提條件）。頁面上的分類和標籤、主題頁、事件歸組和日報都靠它 |
| `group-*.md` | 事件歸組：兩篇報道是同一次發生、同一事件的後續，還是兩件事；同時判斷報道相對精選裡已有的內容有沒有新資訊，沒有的不進精選 |
| `story-digest.md` | 事件頁的綜述（改之前用 [綜述評測](story-digest-evaluation.md) 並排比較） |
| `report-period.md`、`report-period-sections.md` | 週報月報的總述和欄目導讀（日報按規則編排，不用提示詞） |
| `translate-*.md` | 全文翻譯 |

你的站有讀者文字裡不用的詞（誇張的說法、方言詞、讀者看不懂的行話），寫進 `industry/wording.ts`：每項是一個正則和改法。寫完標題、摘要和推薦理由後逐個查，用了就讓模型只改這些詞一次（模型步驟“改用詞”，環境變數 `WORDING_MODEL` 可以單獨選模型）；改完數字有變、標題摘要變空，或模型服務拒絕改寫，就保留原文字。詞表空著就不查，也不多呼叫，模型服務拒絕服務時的告警裡也不列這一步。

提示詞裡用 `{{siteName}}` 指代站名，`{{> 檔名}}` 引用另一份提示詞。改提示詞不用改程式碼。

**建議的做法**：先保留結構（五個維度加權、噪聲壓制規則、安全邊界），只把“什麼算重要”“什麼算噪聲”的例子換成你的行業。比如法律行業，“新法規正式公佈、重要判決、監管處罰”應該正常評價，“律所營銷軟文、課程廣告”要壓住。

## 5. 門檻與校準：`industry/selection.ts`

兩次評分之和 ≥ 2 × 門檻才夠分（夠分的還要過歸組時的去重，見 [精選與校準](selection.md)）。預設門檻（T1 60、T1_5 65、T2 76）是 AIHOT 在 AI 領域校準出來的。`classes` 是抬高門檻的信源類別（示例是 AI 行業的“生態與基礎設施”“評測榜單”，換行業時換成你的類別或刪空），`browseFloor` 是瀏覽“全部動態”的最低分（預設 40）。換了行業和提示詞，需要重新校準：

1. 從你的信源裡挑 100–200 條資料，自己標“該選 / 不該選”，存成 `.data/gold.jsonl`（格式見 [精選與校準](selection.md)，`industry/gold.example.jsonl` 有兩條示例）。
2. 執行 `node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl`，看準確率、查準率、查全率，和不同門檻下的結果。
3. 在後臺 SelectBench 裡逐條看判錯的資料，回去改評分提示詞或門檻，再跑一遍。

這一步決定了你的站“選得準不準”。

## 6. 品牌：`site/brand/`

- `logo.svg`、`icon.png`（512）、`icon-192.png`、`apple-icon.png`（180）、`favicon.ico`：站點圖示。
- `Logo.tsx`：網頁左上角的站名標誌，預設用站名文字排出來；有自己的 Logo，把 `Wordmark` 換成你的 SVG，引數保持不變。
- `wordmark.svg`、`wordmark-dark.svg`（可選）：分享圖和海報上的字標，深色版用在深色的分享圖上；沒有就用站名文字。
- 分享圖的字型放在 `assets/og-fonts/`：本地版本保留上游 Noto Sans SC 子集，並加入 Noto Sans TC 400/700 補足繁體字形。其他語言可加入 `<名字>-400.ttf` 和 `<名字>-700.ttf`，缺字依檔名排序取用；換字型後重啟服務，分享圖快取隨之換新。字型授權與來源保存在同目錄。
- `nameplates/`：日報、週報、月報頁頂部的報頭字（比如“AI日報”）。換了行業詞以後重新生成：
  ```bash
  node scripts/nameplates.ts assets/og-fonts/noto-sans-tc-700.ttf
  ```
- 關於頁的二維碼：先在 `site.ts` 的 `ABOUT.maker` 寫好作者塊，並寫上 `wechat`、`feishu` 卡片（標題和說明）；再在後臺“設定 → 關於頁二維碼”上傳圖片，或者把圖片放進 `site/brand/contact/`，檔名以 `qr-wechat`、`qr-feishu` 開頭，格式是 png、jpg 或 webp。作者塊、卡片或圖片缺一樣，那張二維碼就不顯示。

請不要使用 AIHOT 的名字和 Logo。

讀者可以在“我的”頁將字型從“預設字型”改為“瀏覽器預設字型”。後一項使用讀者在瀏覽器中設定的標準字型，覆蓋普通正文、表單和動態圖表文字；程式碼仍用等寬字型，Logo、報頭字和分享圖片仍按站點品牌顯示。字型選擇只在當前瀏覽器儲存，不轉換簡繁體。收藏頁的版本 1 備份增加了可選的 `font` 欄位，舊備份仍可匯入；匯入不會覆蓋讀者已經選擇的瀏覽器字型。

## 7. 頁面文案：`site/pages/`、`site/public/`、`site/changelog.json`

- `pages/terms.md`、`pages/privacy.md`：使用規則和隱私說明。**現在是模板**，上線前按你的實際情況改寫，必要時請專業人士看一下。
- `public/`：網站根目錄上的四個固定檔案，替換佔位符後釋出：`robots.txt`、`manifest.webmanifest`（裝到手機桌面時的名字和圖示）、`openapi-v1.json`（公開 API 的說明），以及可選的 `.well-known/security.txt`（安全問題的聯絡方式）。只發布這四個檔案，放進去的其他檔案不會出現在網站上；沒有的檔案訪問時是 404。檔案裡可以寫這些佔位符：`{{siteName}}`、`{{siteUrl}}`、`{{description}}`、`{{tagline}}`、`{{locale}}`，出刊時間 `{{dailyTime}}`、`{{weeklyTime}}`、`{{monthlyTime}}`，公開介面版本 `{{version}}`，逗號分隔的公開分類 `{{categoryList}}`；JSON 檔案裡 `enum` 或 `examples` 列表中的 `"{{categories}}"` 會換成公開分類的 key 列表。
- `changelog.json`：更新日誌。自帶一條“網站上線”示例，上線前把它的 `date`、`time` 和 `latestVersion` 改成你的上線時間；示例正文裡的框架署名（“用 AIHOT 開源框架搭起了這個站”）同樣可留可刪。新條目寫在最前面，把 `latestVersion` 改成它的日期和時間。`kind` 是“更新”“最佳化”“公告”“下線”之一；要讀者一定看到的加 `"urgent": true`（紅色，標“重要”）。

## 8. 模型和部署

- 模型：`.env` 裡的 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`，任何 OpenAI 相容介面都行，所有步驟預設都用它。`site/models.ts` 列出具名的模型（各用自己的地址和金鑰環境變數）和每一步預設用哪個；部署時還可以用環境變數（見 `.env.example`）或後臺“模型與評測”頁逐步改選。用推理模型（先想再答）時給它留出推理的額度：預設模型設 `LLM_REASONING_TOKENS`，具名模型在 `site/models.ts` 裡寫 `reasoningTokens`；不留的話推理會把每一步的輸出額度用光，答案為空，每次呼叫都失敗。 評分預設還可寫 `scoreCall: { temperature, maxTokens, timeoutMs }`，分別控制溫度、輸出額度和超時毫秒；示例評分預設已明確配置這些值。備用模型的 `fallbackFor` 按能力名指定它接替的主模型，須先用自己的資料評測這組組合；示例站預設沒有備用組合。
- 部署：見 [部署](deploy.md)。

## 改完以後檢查

```bash
npm run typecheck
DATABASE_URL=postgres://…/myhot_test npm test     # 庫名必須以 _test 或 _ci 結尾，資料庫賬號要能建庫
npm run build -w @aihot/web && npm run test:web
node scripts/smoke.ts --base http://localhost:3000   # 站點跑起來以後
```

改寫提示詞、重新校準門檻不會讓測試失敗：測試按每一步實際渲染出的提示詞認請求，門檻從 `industry/selection.ts` 讀。`tests/` 裡有些測試用的是示例行業的分類、標籤和公司（比如 `ai-models`、“模型釋出”、Anthropic）。改了 `industry/taxonomy.ts` 以後這些測試會失敗，把例子換成你行業裡的對應項即可，測的規則本身不用改。

然後開啟網站看一眼首頁、全部動態、日報、主題頁和關於頁，再去後臺“信源”頁看信源是不是都抓成功了。
