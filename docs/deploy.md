# 部署

## 用 Docker（推薦）

需要一臺裝了 Docker（帶 Compose）的機器。雲伺服器建議至少 2 核、4 GB 記憶體，構建映象時要用到。

```bash
git clone https://github.com/KKKKhazix/AIHOT.git myhot
cd myhot
node scripts/init-env.ts --llm-key <你的模型 API Key>
```

`init-env.ts` 會生成 `.env`，填好隨機金鑰和管理員密碼，並把密碼列印一次。機器上沒有 Node 的話，把 `.env.example` 複製成 `.env`，自己填 `ADMIN_PASSWORD`（至少 12 位）、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD`（各用 `openssl rand -hex 32` 生成）和 `LLM_API_KEY`。

啟動前檢查 `.env` 的 `SITE_URL`：本機試用保留 `http://localhost:3000`；部署到伺服器時改成讀者實際訪問的地址。例如透過伺服器 IP 訪問時（把示例 IP 換成自己的）：

```dotenv
SITE_URL=http://192.0.2.10:3000
```

RSS、分享連結、站點地圖和 Agent Markdown 中的絕對連結都使用這個值，不會隨瀏覽器訪問的地址自動改變。使用域名和 HTTPS 時按下方「配域名和 HTTPS」設定。

配置完成後啟動：

```bash
docker compose up -d --build
```

啟動後開啟 `http://伺服器地址:3000`，後臺在 `/admin`，用管理員密碼登入。第一次啟動會匯入示範信源，一兩分鐘後開始出現內容；第一次匯入的一百多條資料大約半小時處理完（每條都要預篩、評分、結構化、寫標題摘要，再歸組）。

`docker compose` 會起五個容器：`db`（PostgreSQL 17）、`setup`（每次啟動先跑資料庫遷移和種子資料，然後退出）、`api`、`worker`（抓取、模型處理、定時任務）、`web`（網頁）。`web` 只接收網站地址、API 地址等網頁配置，透過 HTTP 讀取 API；資料庫、模型和管理員金鑰，以及資料卷，只交給後端容器。

### 在中國大陸的伺服器上

- 構建時 npm 走國內映象：`docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com`，然後 `docker compose up -d`。
- 拉取 Docker 映象慢，先給 Docker 配置映象加速。
- 海外信源抓不到時，在 `.env` 裡設定 `EGRESS_PROXY_URL`：抓信源和圖片時走這個代理，呼叫模型介面不走。
- 對外提供網站服務需要先完成 ICP 備案，備案號填在 `site/site.ts` 的 `icp`。

### 配域名和 HTTPS

先把域名解析到伺服器，然後在 `.env` 裡設定：

```bash
SITE_URL=https://example.com
SITE_DOMAIN=example.com
PORT=127.0.0.1:3000        # 3000 埠只給本機的 Caddy 用，不直接對外
TRUST_PROXY=true           # 訪客地址從 Caddy 轉來的請求頭裡讀
```

再用帶 HTTPS 的方式啟動，Caddy 會自動申請和續期證書：

```bash
docker compose --profile https up -d --build
```

已經有 Nginx 的話，不用 Caddy，把站點反向代理到 `http://127.0.0.1:3000`，帶上 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` 和 `proxy_set_header X-Forwarded-Proto $scheme;`（後臺登入按它判斷訪問是不是 HTTPS，少了它登入 cookie 會丟掉 Secure），並在 `.env` 裡設 `TRUST_PROXY=true`。`SITE_URL` 一定要寫成讀者實際訪問的地址：生成的連結、RSS、分享圖和 MCP 都用它。

MCP 預設接受 `SITE_URL` 的主機以及 `localhost`、`127.0.0.1`、`[::1]`。額外主機用 `MCP_ALLOWED_HOSTS` 配置，以逗號分隔，例如 `extra.example:8443,[2001:db8::1]`。主機名不區分大小寫，IPv6 必須加方括號；可帶 0–65535 的十進位制埠，匹配時忽略埠。包含路徑、使用者資訊或非法埠的配置不會生效。`127.1` 等別名需要明確列入；此配置隻影響 Host 校驗，不擴大瀏覽器 Origin 許可。

前面有 Nginx、CDN 這類快取時，要遵循應用返回的快取期限（`Cache-Control`）：公開網頁、導航資料、API、RSS、條目 Markdown、報告分享圖、站點地圖，以及接入說明 `/api/v1/agent` 和 `/openapi-v1.json`（五分鐘到期後也要重新驗證），都不要另加更長的快取期，不要在到期後離線返回舊內容，也不要在轉發舊響應時重新起算它的壽命；不要讓代理和 CDN 疊加快取動態內容。框架不代管自建站的 CDN，也不替它清快取。

### 更新

**2026 年 10 月 31 日的引擎同步**有三個資料庫遷移（`0090`–`0092`），照下面的命令更新時 setup 會跑它們：信源多一列可選的類別 `selection_class`，回饋多了 `kind`（型別）和 `idea`（歸入的建議）兩列，都可以為空，舊資料不用改。沒有必填的新環境變數。要注意的變化：

- **`industry/selection.ts` 多了 `classes` 和 `browseFloor`**，見 [精選與校準](selection.md#門檻industryselectionts)；自己改過這個檔案的，合併時補上這兩項，不補通不過型別檢查。
  - `classes`：信源類別和它的門檻下限。後臺“信源”頁可以給官方信源選一個類別，門檻抬到不低於類別的數，只抬不降；不選類別的信源和原來一樣。
  - `browseFloor`（預設 40）：瀏覽“全部動態”（網頁列表，`/api/v1/items` 和 `/api/v1/agent/latest` 的 `mode=all`，MCP 最新列表的 `all`，“全部動態”RSS）只出平均分不低於它的資料，沒評上分的照常出；帶搜尋詞時仍搜全部。想和原來一樣全部列出，設成 `0`。
- **告警**：
  - 新增“大量信源抓取失敗”：開著採集時，最近一次抓取失敗的信源不少於 50 個、且佔最近抓取過的信源 15% 以上，按“讀者受影響”一級告警，多半是伺服器連外網的線路或代理斷了。
  - 選填的 `WEBHOOK_HUB_URL`、`WEBHOOK_HUB_KEY`（協議見 `.env.example`）：配好後（還要 `FEISHU_INTERNAL_ENABLED=true`），“讀者受影響”和“今天要處理”兩級的告警先交給你自己的自動處理服務，交出去 1 小時（讀者受影響）或 3 小時（今天要處理）後還沒恢復，或者同一個問題一天裡第三次交出去，才發給你；只有你能處理的（比如模型服務拒絕呼叫、要核對賬號或額度）照常立刻發。09:00 的系統日報被它收下就不再發給你。發給你本人的訊息也先交給它的 `/tell`，沒收下再走飛書。超過 30 分鐘送不出去，會告警“自動處理暫時接不到任務”，這期間告警直接發給你。不配置就和原來一樣。以前程式碼裡讀過、沒寫進文件的 `AGENT_WEBHOOK_URL`、`AGENT_WEBHOOK_KEY` 不再讀取，請求格式也換了，用過的照 `.env.example` 改。
  - 告警群機器人（`FEISHU_ALERT_WEBHOOK_URL`）一次只發一條，等上一條有答覆或失敗後再隔 600 毫秒發下一條，不會超過飛書自定義機器人的頻率限制。
- **模型服務拒絕呼叫後的暫停**：拒絕之前已經發出的請求後來成功了，不再解除暫停（它可能用掉了最後的額度），只有拒絕之後發出的請求成功才解除。拒絕時也不再順手刪掉其他模型一天前已經過期的暫停記錄：兩個模型同時被拒會互相等對方的行鎖，死鎖後丟掉那次拒絕；過期的暫停本就不再生效，留在 `settings` 裡，等那個模型下一次呼叫成功時刪掉。
- **圖片**：網頁上的圖片先給 AVIF（`<picture>`，不支援的瀏覽器照舊用原來的格式）。AVIF 版本由 worker 在後臺按需生成，比原來的格式小一成以上才保留，生成好之前先返回原來的格式；圖片快取會多佔一些空間。源站拒絕或已刪除（401、403、404、410）的圖片，失敗結果快取 6 小時，不再每分鐘回源。
- **備份**：每個檔案只上傳一次，放在一個字首下（見下方 [備份](#備份)）；原來每天都傳一份到 `daily/`、週日和每月 1 日再各多傳一份。按字首設過過期規則的，核對一下。沒有附件時只傳 `.dump`，不再生成空的檔案包。
- **回饋後臺**：回饋可以標型別（BUG、建議、提問、其他）；建議可以歸入一個建議名，同一個需求用同一個名字，“建議池”按提出人數排序。

新增選填的 `PRIVATE_FEED_HOSTS`：信源訂閱或列表地址用自建在內網的服務（比如 RSSHub）時，把它的主機名寫進去，不必再開啟整站的 `ALLOW_PRIVATE_NETWORK_FETCH`，用法見 [信源](sources.md)。不設定時行為不變；無需資料庫遷移。

週報、月報的週期內，應有日報齊全且原始正文條目全部為空時，自動跳過該期，避免每半小時重複報錯；歸檔裡不會新增空週報或月報。首個週期從全站最早日報開始檢查；沒有可彙總條目時，若缺失日報、原有條目後來無法公開或正在人工更正，仍保留原有錯誤。無需資料庫遷移或配置修改，升級後下次定時檢查生效。

正文原生影片修復會為已有可用影片補播放控制元件，並去掉空播放器，不寫回文章、不呼叫模型。舊版清洗時已經丟棄的媒體地址無法從存檔恢復；升級不批次重新抽取，已有成功正文會跳過抽取，內容雜湊相同時重新抽取也可能保留原 HTML。後續新正文按[信源說明](sources.md)保留原生影片，檔案繼續由瀏覽器直連原站，簽名地址可能過期。

正文插圖裡的內嵌 SVG 圖改為保留原站寫的文字說明（見[信源說明](sources.md)），只作用於之後抽取的正文；已存的正文不變，升級不批次重新抽取。

先按下方 [備份](#備份) 一節備份。構建完成後停止舊服務，再執行遷移和新版服務：

```bash
git pull
docker compose build
docker compose stop api worker web
docker compose run --rm setup && docker compose up -d
```

遷移成功後再啟動服務；遷移失敗時先檢視錯誤，不要繼續啟動。使用 HTTPS 配置的站點繼續保留 `--profile https`。舊的 API 和 worker 要在遷移前停下：遷移可能刪表刪列，舊程式碼還在跑會出錯；正常關閉 worker 會等進行中的付費呼叫收尾（最長三分多鐘）。非 Docker 部署也按“備份、構建、停止 API/worker/web、遷移（`scripts/migrate.ts`）、種子資料（`scripts/seed.ts`）、啟動”的順序更新。

新遷移遇到長期佔鎖會報出檔名和等待超時，先處理佔鎖事務，再重跑 setup，不要跳過遷移或改寫遷移賬本。併發索引建立中斷可能留下無效索引：核實報錯中的物件後，用 `DROP INDEX CONCURRENTLY <索引名>` 清理該失敗索引再重跑；有效但定義不同的同名索引須先核對差異。這些保護不改變上述 Docker 更新順序，跨舊版本升級仍可能執行歷史上的破壞性遷移。

下面按時間從新到舊列出每次更新要注意的事。

日報缺期告警按北京時間的具體日期跟蹤，跨午夜不會自動恢復；只有對應日報存在才發恢復通知。新缺期檢查最近 7 個日曆日（含今天），不早於最早的日報或 reports.compose 執行記錄；沒有歷史記錄時只檢查今天。已告警的日期在這 7 天裡一直跟蹤，關閉採集/模型或 worker 啟動寬限期也不會把缺期當成恢復；超出 7 天仍沒有日報的，發一條“沒能補出、停止提醒”後不再提醒。舊的 report.daily 狀態自動按首次告警時間遷移，保留提醒間隔。出刊後兩小時告警、每小時提醒及飛書開關保持不變；無需資料庫遷移。自定義 responder 若按舊 `report.daily` 精確匹配，需改為識別 `report.daily:YYYY-MM-DD` 日期鍵。

#### 讀者文字的改用詞（2026 年 10 月 9 日）

沒有遷移，沒有必填的新環境變數。行業包多了 `industry/wording.ts`（讀者文字裡不用的詞，模板裡是空的）和提示詞 `mend-wording.md`；合併時這兩個檔案隨更新帶進來，自己的行業包沒有衝突。詞表空著就不查、不多呼叫模型；寫了詞以後，用了這些詞的標題、摘要、推薦理由會多一次模型呼叫（模型步驟“改用詞”，可用選填的 `WORDING_MODEL` 單獨選模型）。說明見 [把它改成你的行業](customize.md)。

#### 導航裡可以不放某些入口

沒有遷移，沒有新環境變數。`site/site.ts` 多了 `NAV.hidden`（目前只支援熱點榜 `"/hot"` 和主題 `"/topics"`，見 [把它改成你的行業](customize.md)）；框架從 `@aihot/site` 讀它，**自己維護 `site/site.ts` 的站，合併時照模板加上 `NAV`**，不加通不過型別檢查。模板裡是空的，導航和原來一樣；隱藏入口不會關閉頁面或公開介面。

#### 原帖展示與引擎同步（2026 年 10 月 6 日）

沒有新增必填環境變數或資料庫遷移。自己維護 `site/site.ts` 的站點需補上 `REPORTS.quiet`，可對照示範配置：日報時段內有資料經過評判、但沒有新大事時照常出刊，用這兩句做標題與導語；導語的 `{start}`、`{end}` 是時段起止。沒有任何資料經過評判仍算採集或判斷失敗，不偽裝成平靜的一天。

空正文、純連結的 X 帖子保留原來的連結、圖片和引用，不呼叫寫作或翻譯模型；來源允許展示全文時，純圖片帖子也可以顯示，現有展示與再分發許可繼續生效。已取得實際正文的 X 長文照常處理。舊譯文也不會再出現在這些原帖的公開頁面裡。已生成過錯誤標題摘要的帖子，可在更新後用 `packages/backend/src/publication/publish.ts` 的 `publishArticle(id)` 重建公開內容，不需要重新呼叫模型。

MCP 的 `subscriptions/listen` 現在立即返回 HTTP 404 和 JSON-RPC `-32601 Method not found`。服務從不推送變更，普通工具呼叫照常使用；客戶端收到這個回答後不應重試建立常駐訂閱。

無需資料庫的測試改為 `*.standalone.test.ts`；`npm test` 仍執行全部後端測試，只給需要資料庫的檔案建副本。可用 `npm run test:standalone` 單獨執行這些測試。

#### 社群修復、時間規則與讀取最佳化（2026 年 10 月 4 日）

公開介面版本仍是 4.0.0。沒有必填的新環境變數；新增一個選填的 `LLM_REASONING_TOKENS`，見下面 `site/models.ts` 一條。

**開關只認 `true`**：`.env` 裡所有 `*_ENABLED` 開關（`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED`、`FEISHU_*_ENABLED`、`INDEXNOW_SUBMIT_ENABLED` 等）只有寫成小寫的 `true` 才開啟。以前寫 `1` 或 `TRUE` 也算開啟，現在都當作關閉；升級前檢查 `.env`，改成 `true`。

**遷移**：新增七個遷移，按上面的步驟等 setup 跑完即可。它們都不刪資料，不重寫文章或已有向量，也不呼叫模型；遷移按完整檔名記賬，編號相同的不同檔案各自執行。

- `0055_publication_selected_published_idx.sql`、`0056_analyses_composite_id_idx.sql`、`0056_publications_pool_category_timeline_idx.sql`、`0057_publications_pool_channel_timeline_idx.sql`：併發建立查詢索引，不阻塞正常讀寫。
- `0056_publication_release_selection_stats.sql`、`0057_analyze_publication_release_selection.sql`：為公開列表建立並收集查詢統計。
- `0083_publications_selected_source_idx.sql`：併發建立按信源統計精選的覆蓋索引，減少後臺統計時的讀取。

這次連同這些索引一起減少了公開讀取與事件召回的資料庫開銷，介面內容、搜尋權重和事件候選範圍不變。

**自己改過這些檔案的站，合併時對照新檔案**：

- `site/site.ts` 多了幾項：
  - `EDITION_TIMES`、`EDITION_WHEN`：日報、週報、月報的出刊時間，原來寫死在程式碼裡；排程、日報的時間視窗、缺期告警和提到時間的文案都讀它。`public/` 裡的檔案用佔位 `{{dailyTime}}`、`{{weeklyTime}}`、`{{monthlyTime}}`。
  - `ITEM_COPY`：推薦理由叫什麼，網頁和分享圖上顯示不顯示評分。
  - `REPORTS.descriptions`、`entry`、`metricUnits`、`shareUnit`：報告頁面的描述和版面上的說法。
  - `ABOUT`、`CARDS` 裡提到出刊時間和推薦理由的文案改成引用上面幾項。
  - `DEPLOYMENT.directImageHosts` 改名為 `directFetchHosts`，採集和圖片共用這份直連名單。
  - `SITE.feedbackLead`、`SITE.feedbackEmailHint`：回饋頁標題下的一句話和電子郵件框提示，原來寫死在程式碼裡。
  - `SITE.psb`：可選的公安備案號，未辦理或不適用時填 `null`。
  - `ABOUT.lead` 裡 `{sources}` 兩邊不再寫空格，頁面會自動加。
- `site/models.ts`：評分呼叫引數現在由具名預設的 `scoreCall` 配置；保留 `glm-5.3-flash-selection` 時同步示例中的溫度、輸出額度和超時。已有自定義模型沒寫這一項時沿用引擎預設值。
- `site/models.ts` 的 `ModelPreset` 和 `site/site.ts` 的 `Founder` 型別統一從 `@aihot/contracts/site-config` 匯入，原有站點配置值保留；自定義過這兩個檔案時同步型別匯入，避免漏掉引擎新增的可選欄位。
- 資料庫遷移遇到正在匯出的 `pg_dump` 會先等待，最長與 worker 排空時間相同；超時後在執行這條遷移前退出，等匯出結束後重跑更新命令。其他佔鎖仍快速報錯。
- 遷移會刪除已停用的 `translation_attempts.request_tag` 列；翻譯正文、嘗試記錄和付費回執保留。來源釋出時間的原始精度另行儲存，舊資料無法確定的精度保持未知，不把零點自動當作來源只寫了日期。
- `site/models.ts`：推理模型的額度改成明確配置。預設模型設 `LLM_REASONING_TOKENS`，具名模型寫 `reasoningTokens`。原來只有名字以 `-think` 結尾的具名模型會多給 4000，這個做法去掉了；自己加過這類模型的，補上 `reasoningTokens: 4000` 才保持原來的額度。推理模型把額度用光時，報錯會寫明 `finish_reason=length` 和該改哪一項。
- `industry/prompts/story-digest.md`：事件概覽換了寫法，第一句講清核心變化和目前的結論，再補必要背景，分成短段，不按日期複述下方的時間線，不評論報道本身，也不再寫死行業。已有綜述不會被批次重寫，隨新報道逐步換成新寫法；想讓某幾個事件立即重寫，見 [綜述評測](story-digest-evaluation.md) 的最後一節（`rewriteStoryDigest`，每個事件一次模型呼叫）。
- 自己維護的 Compose 檔案可以刪去 `LOCAL_ROUTER_URL`：分享圖預熱現在直接複用後端渲染器，不再請求固定的本機埠，沒有程式碼再讀這一項，自帶的 `docker-compose.yml` 已經去掉。分享圖地址、格式和快取約定不變。

**採集與釋出時間**：

- **首次匯入之後不再收信源的存檔**：以前新信源首次匯入後，第二次抓取會把訂閱裡剩下的舊條目全部當歷史內容收進來，逐條付費分析（示範源一次就有上千條）。現在之後的抓取只收釋出時間在信源第一次匯入前 48 小時以內或之後的條目；沒有日期的照收，X 賬號不受影響，見 [信源](sources.md#規則舊文不刷屏) 的“舊文不刷屏”。升級前已經收進來的舊條目按原文時間歸檔，不進“今天”和日報，分析也早已跑完，不用處理。
- **沒有可信釋出時間的新資料先不公開**：先不進公開列表、精選、報告、熱點和推送，從原信源或原文頁讀到日期後再判斷新舊。日期未知時，文章頁、結構化資料和 Agent Markdown 標“收錄時間”，RSS 不寫 `pubDate`；OpenAPI 註明事件時間線和日報快訊的 `publishedAt` 這時是收錄時間。
- **JSON 介面裡不帶時區的時間**（如 `2026-09-30 17:43:58`）按信源的 `publishedAtUtcOffset` 讀，預設 `+08:00`。以前按伺服器時區讀，Docker 裡是 UTC，所以已有這類信源的新條目時間會提前 8 小時，變成正確值。
- **文章頁日期使用同一來源時區**：詳情頁補日期與正文提取先用 `detail.publishedAtUtcOffset`，未設則繼承信源的 `publishedAtUtcOffset`，再預設 `+08:00`。只作用於之後的採集和補日期，不批次重寫已有釋出時間。
- **詳情補全**：失敗或超出本輪次數限制的日期、標題、摘要會在後續採集中補齊，已確認的正文保持原樣；信源請求成功卻漏掉日期、標題或正文時也會補全，並記進信源健康。Jina 詳情規則要與實際返回格式匹配；固定採集起點、Intercom 日期章節及影片描述的配置見 [信源](sources.md)。
- **影片播放頁不當正文**：對所有信源生效，YouTube、Vimeo 播放頁不再作為文章正文抓取，YouTube 影片頁也不再被當成圖片。RSS 的影片描述只作摘要，訂閱直接提供的真實文字保留。升級不會批次刪除或重新分析已有正文；舊影片記錄混入播放器導航的，先逐條核實，可在後臺“內容診斷”的詳情頁設為僅摘要，停止展示錯誤正文。
- **RSS**：確認摘要就是全文的文字訂閱可以設 `summaryIsBody`（Atom 的 `summary` 也算）。沒有網頁的播客單集，原文連結改為音訊或影片檔案，不再去抓網頁。
- **預覽和正式採集用同一組過濾**：後臺“預覽抓取”也套用地址字首、分類、噪聲詞、地址改寫和 `publishedAfter`，預覽裡看到的條目就是正式採集會存下的。
- **關掉採集後不再取信源圖示**：`COLLECT_ENABLED` 不是 `true` 時，每天 04:40 取信源圖示的任務也停下，不再訪問信源網站。
- **已核實的歷史日期可以糾正**：運維指令碼先呼叫 `admin/content.ts` 的 `previewPublicationDateCorrection`，再按預覽給出的版本和校驗值呼叫 `correctPublicationDate`，並記錄操作者與理由。只接受新舊日期都早於七天視窗的明確更正；保留材料修訂、選稿與歸組，不重跑模型。材料或日期已變化，或這次糾正會改變其他公開決定時，會拒絕操作並要求重新核對；沒有批次回填，也沒有新增公開介面。
- **公開評分可以人工更正或撤銷**：後臺內容詳情支援“按模型”“撤銷評分”“人工評分”。人工評分接受 0–100，撤銷評分使公開值為 `null`；清除評分覆蓋後恢復已儲存的模型分數。更正要填寫理由並核對版本，保留原始分析和審計記錄，同步更新網頁、API、RSS、Agent Markdown 與 MCP，不重跑模型。既有文章不會因升級而批次改分或重新入選。

**公開出口**：

- **按類別篩選按 `PUBLIC_CATEGORIES` 走**：API、RSS 和 MCP 的 `category` 取所有在公開介面裡算作這一類的類別。不合並分類的站（預設就是），按 `tip` 查不再帶出觀點；沒有 `tip` 類別的行業也能透過型別檢查。
- **往期報告仍需重新驗證**：日期、周和月份確定的是哪一期，不代表內容永久不變。報告保留出刊時寫下的標題和摘要，來源名和引用時間跟隨當前公開資料；已撤回的引用及依賴它的導讀、封面不再分發。保留報告副本的客戶端在 `Cache-Control` 到期後帶 `If-None-Match` 重新請求。
- **自行配置過 Nginx 或 CDN 快取的站點要檢查規則**：按 [配域名和 HTTPS](#配域名和-https) 末尾的要求核對，並在更新時清理這些路徑已有的代理和 CDN 快取，包括接入說明 `/api/v1/agent` 和 `/openapi-v1.json`。
- **站點地圖重建失敗時不再無限沿用舊檔案**：程序、磁碟副本和 HTTP 響應共用原來的五分鐘期限，過期且無法重建時返回 `503` 和 `Retry-After`。MCP 繼續使用 `no-store`；API 和 Agent 內容到期後重新驗證。

**工具與修復**：

- **綜述評測**：`scripts/eval-story-digests.ts` 從庫裡匯出真實事件，在同一批事件上把現有提示詞和候選提示詞並排跑，見 [綜述評測](story-digest-evaluation.md)。三個評測指令碼共用 `scripts/eval-tools.ts`；`eval-selection.ts` 的 `--n`、`--concurrency` 和模型名寫錯時直接報錯。
- **遷移不阻塞讀寫**：新遷移每個檔案只放一條允許線上執行的語句，不整表回填或重寫，建索引用 `CREATE INDEX CONCURRENTLY IF NOT EXISTS`；CI 用 `scripts/check-migrations.ts` 檢查。統計維護只針對明確的表和列，規則見 [架構](architecture.md#資料庫遷移)。
- MCP 請求有大小上限，錯誤日誌去掉憑據。
- 桌面側欄放大後顯示細捲軸。
- 測試按每一步實際的提示詞認請求、從 `industry/selection.ts` 讀門檻，換行業改寫提示詞和門檻後不再誤報；架構測試不再受路徑分隔符影響。

#### 站點檔案搬進 `site/`（2026 年 10 月 4 日）

公開介面沒有變化，版本仍是 4.0.0。

- **站點自己的檔案從 `industry/` 搬到了 `site/`**：`site.ts`、`models.ts`、`brand/`、`pages/`、`public/`、`changelog.json`。`industry/` 只留行業知識：`taxonomy.ts`、`topics.json`、`sources.json`、`prompts/`、`selection.ts`。自己改過這些檔案的，合併時把改動挪到 `site/` 下的同名檔案。
- **`site.ts` 多了幾項**，都可以不填：`SITE.github`、`SITE.llmsIntro`、`SITE.rootIcons`，`POLICY.terms.license`、`POLICY.terms.headers`，`ABOUT.termsAnchor`（二維碼卡片可以寫 `alias`），以及 `ACCESS`、`ADMIN`、`DEPLOYMENT`、`FEED_COPY`、`PUBLIC_CATEGORIES`，說明見 [把它改成你的行業](customize.md)。`PUBLIC_CATEGORIES` 取代了 4.0.0 時的 `publicAs`：原來在類別上寫 `publicAs: "tip"` 的，改在 `PUBLIC_CATEGORIES.merge` 裡寫（鍵是這個類別的 key，值是 `"tip"`）。
- **`DEPLOYMENT.requiredSecrets`** 是生產 API 啟動時額外檢查的憑據清單，預設空；基本會話、圖片簽名和管理員登入校驗仍然生效。只有你的部署要求某個可選整合必須配置時才填寫。
- **只屬於你這個站的功能可以做成模組**：放進 `modules/<名字>/`，在 `site/modules/` 的清單裡啟用，見 [架構](architecture.md) 的“模組”。框架本身不帶模組。
- **Agent 接入頁預設開啟 MCP**，頁面列出 MCP、RSS 和 API 三種接入方式。Agent Markdown 介面仍在 `/api/v1/agent`，可從頁面下方“Agent 使用說明”進入。
- **圖片代理可以設流量上限**：`IMGPROXY_UPSTREAM_MB_PER_MINUTE`、`IMGPROXY_UPSTREAM_GB_PER_DAY`（或 `site.ts` 的 `DEPLOYMENT.imageUpstreamBudget`），預設不設。
- **修復**：同樣的資料每次給出同樣的位元組（排序遇到並列時補上唯一的次序，API 和 RSS 的 ETag 不再無故變化）；網頁轉給 api 的請求不再帶上逐跳頭，`Connection: close` 不再讓下一個 POST 失敗；`llms.txt` 的接入方式按實際數，不再寫成四種。

#### 升級到公開介面 4.0.0（2026 年 10 月 3 日）

- **模型榜、Codex 重置監控和主題頁的大事記不再是框架的一部分**，只留在 AIHOT 上。頁面（`/leaderboard`、`/codex-reset`）、介面（`/api/v1/codex-resets`、`/api/v1/codex-resets/recent`、`/api/v1/agent/codex-resets`）和 MCP 工具 `<字首>_get_codex_resets` 都去掉了，MCP 和 `/openapi-v1.json` 的版本號升到 4.0.0。遷移 `0053` 刪掉它們的表（`lb_*`、`monitor_*`、`fx_rates`）和設定，定時任務及其執行佇列在 worker 啟動時自動撤掉，後臺執行記錄繼續保留；要留這些資料的，升級前先備份。公司主題頁的標誌改成公司名的首字母。
- **行業包有幾處變化**，自己改過 `industry/` 的站，合併時對照新檔案補上：
  - `site.ts` 多了 `topicsTitle`、`feedbackExample`、`keywords`、`since`、`interfaceVersion`、`POLICY`（使用規則和隱私說明兩頁的名字與簡介、X 帖子算不算全文）、`ABOUT.description`、`ABOUT.sourcesFallback`、`AGENT`、`REPORTS`、`ALERTS`、`SOURCE_DEFAULTS`、`COMMUNITY_FEEDS`、`CARDS`；作者塊的兩張二維碼卡片加了 `kind`，`ABOUT.copyright` 改成回饋頁連結前後的兩段。
  - 新增 `models.ts`：具名的模型和每一步預設用哪個，原來寫在程式碼裡。
  - 網頁左上角的標誌從 `apps/web/app/components/Logo.tsx` 搬到 `industry/brand/Logo.tsx`（後來搬到 `site/` 下，見上方）。
  - 新增 `public/`：`robots.txt`、`manifest.webmanifest` 原來在程式碼裡生成，OpenAPI 說明原來在 `reference/`，現在都是這裡的檔案。原來填了 `contactEmail` 就會生成的 `/.well-known/security.txt`，現在要自己放一份 `public/.well-known/security.txt`（後來搬到 `site/` 下，見上方）。
  - 刪掉了 `features.ts`、`chronicle.ts` 和 `chronicles/`；`topics.json` 裡的 `orgNames`、`leaderboardProvider`、`chronicleTerms` 不再使用，可以刪掉。
  - `taxonomy.ts` 的類別可以寫 `feedLabel`（分類 RSS 標題裡的名字，示例站用“AI 模型”這樣的說法）；`ENTITIES` 加了幾家公司。當時類別上還可以寫 `publicAs`，讓它在公開介面裡並進另一類；這個欄位後來刪掉了，改成 `site/site.ts` 的 `PUBLIC_CATEGORIES.merge`（見上方），再寫 `publicAs` 通不過型別檢查。
- **推送介面的限流可以設定**：`/api/ingest/items` 每個客戶端每分鐘最多推幾次由 `INGEST_RATE_LIMIT` 決定，`docker compose` 預設 10，和以前一樣；不用 Docker 時預設不限，前面沒有代理限流的話在 `.env` 裡設上。
- **不再使用的環境變數**：`ARTIFICIAL_ANALYSIS_API_KEY`、`MONITOR_MODEL`，可以從 `.env` 刪掉。

#### 升級到公開介面 3.0.0（2026 年 10 月 3 日）

- **安全閥預設關**：`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 只有寫成 `true` 才開啟，沒寫就是關。用 `scripts/init-env.ts` 生成的 `.env` 已經有這兩行；自己寫的 `.env` 沒有的話要補上，否則升級後不再採集、不再呼叫模型。
- **週報月報介面換了形狀**：`/api/v1/weeklies`、`/api/v1/monthlies` 的列表和每一期都帶 `periodStart`、`periodEnd`，正文改成 `sections[]`（每欄 `label`、`summary`、`items`），不再有 `title`、`themes`，列表的 `limit` 最多 60。讀這兩個介面的程式要跟著改；MCP 和 `/openapi-v1.json` 的版本號隨之升到 3.0.0。
- **精選的機器出口每條新聞一條**：API 的 `mode=selected`、同步介面和精選 RSS 裡，同一條新聞只留代表報道，其他報道以 `remove` 出現在同步的變更裡（`mode=all` 裡還在）。升級前已經入選的舊報道不會被重新整理，等這條新聞再有報道釋出時才歸併。
- **精選要等去重確認**：分數夠了的資料，要等歸組確認它不是精選裡已有新聞的重複、帶來了新資訊，才進精選；確認之前只在“全部動態”。歸組用的模型回答不合格式時會停在那裡，後臺“執行”頁能看到。
- **一手只看分級**：`T1` 就是一手，`first_party` 不再單獨設定；以前單獨標成一手的 `T1_5`、`T2` 信源不再算一手，要算就改成 `T1`。
- **行業包多了幾項**：`taxonomy.ts` 新增 `RELEASE`、`PLAIN_TERMS`，評論類的類別標 `commentary: true`，`ENTITIES` 可以寫 `otherNames`，`CATEGORY_BY_ITEM_TYPE` 不再使用。已經換成別的行業的站，合併時對照 [把它改成你的行業](customize.md) 補上。
- **主題只讀 `industry/topics.json`**：遷移會刪掉資料庫裡的 `topics` 表。只改過資料庫、沒改檔案的主題，升級前先寫進檔案。公司主題只看 `entityId`，`related` 不再使用。
- **日報不再呼叫模型**：日報按規則編排，週報月報從日報彙編，模型只寫總述和欄目導讀；已經出過的各期不重寫。
- **提示詞有改動**：`industry/prompts/` 裡的 `structure.md`、`group-*.md`、`story-digest.md`、`report-period.md` 換成了新的寫法，`report-daily-lead.md` 刪掉了，新加了 `report-period-sections.md`。改過這些提示詞的，對照著把自己的改動搬過去。
- **刪掉的指令碼**：`scripts/delete-sources.ts`、`scripts/regroup-events.ts`、`scripts/enqueue-analysis.ts`。不要的信源在後臺暫停；單篇的重新評估、重新歸組在後臺“內容診斷”裡開啟這一篇操作。
- **管理員會話繫結登入方式**（遷移 `0041`）：從還沒有會話繫結的版本升級後，未繫結的舊會話需要重新登入。此前已試用會話繫結遷移的資料庫可直接升級，已有列和繫結會被保留，無需手動修改遷移記錄。之後的規則見下方“管理員會話與配置變更”。
- **3.x 的 `/agent` 預設開啟 Agent Markdown**，MCP 的接入說明在 `/agent?tab=mcp`；當前接入頁見上方“站點檔案搬進 `site/`”。
- **飛書內容群只推 `T1`、`T1_5` 信源的精選。**

### 備份

在 `.env` 裡配置 `DB_BACKUP_STORE_*`（任何 S3 相容的物件儲存），每天 04:10 自動備份到那裡。`DB_BACKUP_STORE_SECRET_ID`、`DB_BACKUP_STORE_SECRET_KEY`、`DB_BACKUP_STORE_BUCKET`、`DB_BACKUP_STORE_REGION` 四項都要填；不填 `DB_BACKUP_STORE_DOMAIN` 時按騰訊雲 COS 拼地址（`<桶名>.cos.<地域>.myqcloud.com`），用其他 S3 相容儲存時，把這個儲存桶的訪問域名（含桶名，例如 AWS S3 的 `<桶名>.s3.<地域>.amazonaws.com`）填進 `DB_BACKUP_STORE_DOMAIN`。

一次完整備份包含同一時間戳的資料庫 `.dump` 和檔案包 `.tar.gz`，檔名取自資料庫名：Docker 裡資料庫叫 `aihot`，所以是 `aihot-<時間>.dump` 和 `aihot-files-<時間>.tar.gz`。檔案包保留 `uploads/` 以及仍存本地的 `feedback-screenshots/`，不包含圖片快取或本地備份目錄；這些目錄裡沒有檔案時只有 `.dump`。已經轉發到飛書的圖片只保留資料庫中的外部引用，檔案包不儲存飛書上的圖片。

每個檔案只上傳一次，放在一個字首下：每月 1 日放 `monthly/`，週日放 `weekly/`，其他日子放 `daily/`。可以在物件儲存裡按字首設不同的過期時間。

恢復時同時取回這一對檔案（只有 `.dump` 的就只恢復資料庫）：使用與資料庫版本相容的 `pg_restore` 將 `.dump` 恢復到空資料庫，再把檔案包解壓到資料目錄根目錄（Docker 中為 `/data`，非 Docker 使用 `AIHOT_DATA_DIR`，預設 `.data`），保留包內的子目錄結構，並確保執行程序可讀取這些檔案。只恢復資料庫不能找回仍由 `local:` 引用的回饋截圖；舊備份中沒有包含的檔案也無法憑資料庫引用恢復。

下面的手動匯出只包含資料庫，不包含上述附件目錄：

```bash
docker compose exec -T db pg_dump -U aihot aihot | gzip > myhot-$(date +%F).sql.gz
```

資料都在三個 Docker 卷裡：`db`（資料庫）、`data`（上傳的圖片、圖片快取、本地備份）、`caddy`（證書）。`docker compose down` 不會刪除它們；`docker compose down -v` 會。

### 看日誌

```bash
docker compose logs -f --tail 100 api worker web
```

後臺的“執行”頁能看到每個定時任務最近的結果，“信源”頁能看到每個信源的抓取狀況。

### 管理員會話與配置變更

會話繫結登入方式、登入時的管理員憑據或飛書身份。修改管理員密碼、飛書管理員名單或會話金鑰後，應重啟所有 API 程序，使它們載入相同的新配置；只編輯配置檔案不代表正在執行的程序已生效，混用舊程式碼或舊配置的程序不能提供統一撤權。

有效配置改變後，密碼會話不再接受舊密碼的授權，飛書會話按登入時實際取得的 union ID 或電子郵件檢查當前名單（兩者任一仍獲授權即可）。停用飛書登入應用或更換應用 ID 會使飛書會話失效；只輪換同一應用的 secret 不會使仍獲授權的飛書會話退出。輪換或移除 `SESSION_SECRET` 會使兩種會話都失效。

鑑權時確認失效的會話會被刪除，恢復舊配置也不會讓它復活。系統不記錄全域性憑據變更歷史：某次配置變化若從未被程序載入，或在恢復前從未被會話檢查觀察到，不能據此追溯撤銷會話。

## 花多少錢

- **模型**：每條新資料先預篩一次；過了預篩的再評兩次分、做一次結構化、寫一次標題摘要，然後歸組（有相近的報道時才呼叫），另外還有事件綜述、週報月報的總述和精選的全文翻譯。空正文、純連結的 X 帖子不呼叫寫作或翻譯模型。日報按規則編排，不呼叫模型。我們用示範信源在本地試跑，第一次匯入的 152 條資料一共用了大約 930 次模型呼叫。之後每天用多少，取決於你的信源每天更新多少條。後臺“模型與評測”頁能看到每一步的呼叫次數和輸入輸出 token 數。
- **付費採集**（X、公眾號、Jina）：按請求計費，預設不啟用，填了 key 才會用。
- 所有付費服務都有每分鐘、每小時、每天的呼叫上限（後臺“設定 → 付費請求上限”），超過就暫停，不會一夜之間刷爆賬單。填 0 表示立即停用這個服務。

想省錢，按這個順序來：

1. 先看後臺“模型與評測”頁，每一步的呼叫次數和輸入輸出 token 都在那裡，找出大頭再動手。
2. 確認關了思考模式：思考過程按輸出 token 計費，`.env.example` 裡的 `LLM_EXTRA_JSON` 寫了怎麼關。
3. 量大的步驟換便宜的模型：`.env` 裡可以每一步單獨選（`PREFILTER_MODEL`、`SCORE_MODEL`、`STRUCTURE_MODEL`……），也能在“模型與評測”頁改。換評分模型之前，用 `scripts/eval-selection.ts` 在同一批樣本上比一比，別省了錢卻選不準。
4. 少放進無關的資料：花費基本跟每天進來的條數成正比。綜合新聞站儘量只訂和你方向相關的欄目，在“信源”頁調低更新頻率，暫停量大卻很少入選的信源。

## 不用 Docker

需要 Node.js 24.11 以上和 PostgreSQL 16 或 17，系統用 Linux 或 macOS；Windows 上請在 WSL2 裡執行，或者用上面的 Docker 方式。

```bash
npm ci
node scripts/init-env.ts --llm-key <你的模型 API Key>
createdb myhot
```

在 `.env` 里加上：

```bash
DATABASE_URL=postgres://你的使用者名稱@127.0.0.1:5432/myhot
API_BASE_URL=http://127.0.0.1:3001
```

然後：

```bash
node --env-file=.env scripts/migrate.ts
node --env-file=.env scripts/seed.ts
npm run build -w @aihot/web

NODE_ENV=production node --env-file=.env apps/api/src/main.ts          # 介面，3001 埠
NODE_ENV=production node --env-file=.env apps/worker/src/main.ts       # 後臺任務
cd apps/web && NODE_ENV=production node --env-file=../../.env server.ts   # 網頁，3000 埠
```

三個程序都要帶 `NODE_ENV=production`。api 和 worker 不帶它就按開發環境執行：啟動時不檢查生產金鑰和管理員密碼，`DEV_AUTH_ROLE` 免登入也會生效。

三個程序要一直執行，生產環境用 systemd 或 pm2 守護（守護配置裡同樣設 `NODE_ENV=production`）。停止 worker 時給它 515 秒（systemd 的 `TimeoutStopSec=515`、pm2 的 `kill_timeout: 515000` 和 `treekill: false`），覆蓋佇列的 470 秒排空和資料庫清理；systemd 還需設 `KillMode=mixed`，只先通知主程序停止接任務，讓正在備份的 `pg_dump`、`tar` 自然完成。被提前殺掉的呼叫結果不明，要等至少半小時自動放行後才會重試。

開發時用帶熱更新的方式：`npm run dev:api`、`npm run dev:worker`、`npm run dev:web`。開發時想免登入進後臺，在 `.env` 裡設 `DEV_AUTH_ROLE=admin`（生產環境會拒絕啟動）。
