# RTX 本機使用方式

公開網站：<https://aihot.dayacre.com>；管理入口：<https://aihot.dayacre.com/admin>。
RTX 本機備用入口：<http://localhost:3100>。2026-11-03 已依本人核定公開閱讀，後台僅管理者使用；HTTPS、公開網站與後台驗證已通過。使用規則與隱私說明自 2026-11-03 生效，同日經本人核定更正為版本 1.1，揭露 Luna 十篇雲端試跑。

## 先開始使用

1. 開啟 <https://aihot.dayacre.com>，可切換精選、全部動態、熱點、日報與主題；其他裝置也能使用這個網址。
2. 開啟 <https://aihot.dayacre.com/admin>，使用 RTX 本機 `.env` 中的 `ADMIN_PASSWORD` 登入。後台可管理信源、內容與設定，公開訪客無法使用。
3. 2026-11-03 已依本人授權用 OpenAI GPT-6 Luna 完成一次 10 篇試跑。請從「全部 AI 動態」閱讀：9 篇符合列表門檻，另 1 篇低於 40 分，只能由搜尋或文章連結查看；本批沒有文章達到既有精選門檻，因此首頁精選仍為空。持續採集與本機模型仍停用，沒有啟動日報排程。
4. 有內容後，可在文章旁收藏、搜尋標題與摘要；「Agent 接入」頁提供 RSS、公開 API 與 MCP 的使用方式。

網站服務需 RTX 開機、Docker Desktop 與 Cloudflared 服務正在執行。Windows 應用程式埠仍只綁定 `127.0.0.1:3100`，公開流量由 Cloudflare Tunnel 轉入，不直接公開資料庫或模型埠。

部署來源：上游 `main` 的 `9059707e098b451539596d3a3bc7b47f43a068d9`。
本機追加設定在 `deploy/compose.rtx.yml`；應用程式已依本次需求進行台灣繁體中文與日耕品牌調整。

## 每次操作先設定 Compose 參數

在 PowerShell 執行；第一份 Compose 必須是根目錄的原始檔，避免相對路徑指到 `deploy/`。

```powershell
Set-Location D:/Projects/AIHOT
$compose = @('--project-directory', 'D:/Projects/AIHOT', '-f', 'docker-compose.yml', '-f', 'deploy/compose.rtx.yml')
docker compose @compose config --quiet
docker compose @compose ps -a
```

管理員密碼與隨機密鑰保存在根目錄 `.env`。需要登入時自行在本機編輯器查看 `ADMIN_PASSWORD`，不要貼到聊天、截圖、終端紀錄或 Git。
不要執行未過濾的 `docker compose config` 或完整 `docker inspect`，它們可能輸出秘密。

## 本機模型

使用者要求目前暫停 GPU 模型工作。Ollama 映像已下載，容器目前停止；Qwen3 模型下載因停止容器而中斷，尚無完整模型下載證據。下載與真實模型驗證待使用者允許恢復時完成，不執行真實推論或自動採集。
`ollama` 與 `worker` 均受 `local-ai` profile 保護，預設只啟動網站。未來須由使用者明確啟用後才執行下列模型命令；profile 不是權限控管，明確指定服務仍可啟動。

獨立使用 Ollama `0.34.2` 官方映像，固定 Linux amd64 digest：
`sha256:c715bebf769913db6c82d96f8a8dfee989c4bdfe19fa7d700e3d41ee0ceb5461`。
專用 Compose volume `ollama_models` 的實際名稱由專案前綴決定；不掛載 Windows 既有 Ollama 模型目錄。

```powershell
docker compose @compose --profile local-ai up -d ollama
docker compose @compose exec ollama ollama pull qwen3:8b
docker compose @compose exec ollama ollama list
docker compose @compose exec ollama ollama ps
```

Qwen3 8B 模型下載約 5.2 GB，另需 Ollama 映像與執行記憶體。下載流量與電力仍是本機成本；`OLLAMA_NO_CLOUD=1` 停用 Ollama 雲端功能，不使用付費模型 API。
模型服務只在 Docker 網路中提供 `http://ollama:11434`，不公開主機埠。`.env` 已預填相容 API 位址 `http://ollama:11434/v1`、模型 `qwen3:8b`，使用本地占位金鑰與 `LLM_EXTRA_JSON={"reasoning_effort":"none"}`。設定已隨正式網站載入，但模型服務停止、兩個安全閥仍為 `false`；實際聊天、JSON 與 AIHOT 處理測試通過前不要啟用自動處理。

模型預設 context 16384、Flash Attention、KV cache q8_0、閒置保留 1 分鐘；GPU 0 可用與實際 offload 必須由容器日誌及 `ollama ps` 確認，不能只憑設定宣稱已使用 GPU。

### 「同時一件」的限制

`OLLAMA_NUM_PARALLEL=1` 和 `OLLAMA_MAX_LOADED_MODELS=1` 限制同時只有一個模型、一次推論；其他請求仍可排隊。
上游 `content.analyze` 固定同時 6 篇、`events.digest` 固定 3 件、`events.group` 固定 1 件，沒有可直接使用的 worker 並行環境變數。
本次核定以「單次模型推論」為限制，其他文章可以排隊，不變更上游 worker。這不代表同時只有一篇文章處於處理中；不能虛構 `WORKER_CONCURRENCY` 等設定。
目前 `.env` 的 `COLLECT_ENABLED=false`、`MODEL_CALLS_ENABLED=false` 保持關閉，worker 尚未納入啟動步驟。

## 啟停與日誌

```powershell
# 啟動網站及其資料庫/API/setup 依賴；不會啟動 worker。
docker compose @compose up -d web
docker compose @compose logs --tail 100 api web

# 暫停本機模型；網站仍能讀已存在的內容。
docker compose @compose stop ollama

# 停止本專案服務，保留資料與模型 volume。
docker compose @compose stop
```

若日後 worker 已核定啟用，停止時保留上游 515 秒的正常排空時間。不要使用 `down -v`，會刪除資料庫、上傳檔、憑證與模型 volume。
頁面驗證可執行：

```powershell
docker compose @compose exec web node scripts/smoke.ts --base http://127.0.0.1:3000
```

容器內使用 3000；Windows 瀏覽器使用 `.env` 已設定的 3100。

## GitHub 同步與上游更新

`origin` 是自己的 `TJJAom/AIHOT`，`upstream` 是框架來源 `KKKKhazix/AIHOT`。先核對 `git remote -v`，不要把自己的改動推到框架來源。
平時同步自己的修改，先檢視差異，再指定要提交的檔案；下面檔名只是示例，須依實際變更列齊，不能一律 `git add .`。

```powershell
git status --short
git diff
git add site/site.ts site/pages/terms.md site/pages/privacy.md
git diff --cached --stat
git commit -m "更新日耕站點內容"
git push origin main
```

`.env`、`.data/`、密碼、金鑰與操作證據不提交。自己的部署設定可提交至 `origin`，不要誤推框架的 `upstream`。
取得上游更新時，`fetch` 不會覆蓋工作目錄；先審查，不自動合併。

```powershell
git fetch upstream
git log --oneline HEAD..upstream/main
git diff --stat HEAD..upstream/main
```

核對新版 `docs/deploy.md` 的遷移與相容性後，先保留本機變更與完整資料備份，再決定整合與發布方式。不要直接 reset、clean 或覆蓋 `.env`。

## 驗證與未完成事項

完整驗證依上游要求執行 `npm run typecheck`、獨立 `_test` 或 `_ci` 資料庫的 `npm test`、Web build、`npm run test:web` 與站點 smoke。
測試使用獨立 Docker 網路與 PostgreSQL，不連正式資料庫；Playwright 需要 Chromium 與 WebKit。
檢查輸出存 `.data/verification/`，不納入 Git。模型聊天品質、處理逾時與外網網域須以本次實測結果更新，不把「已設定」寫成「已驗證」。初次部署驗證未執行真實模型推論，原因是使用者要求暫停 GPU 模型；網站測試使用本機假服務。後續雲端端到端驗證見下方「Luna 十篇試跑」，本機 GPU 推論仍未驗證。

官方依據：[Ollama 0.34.2](https://github.com/ollama/ollama/releases/tag/v0.34.2)、[Docker](https://docs.ollama.com/docker)、[設定與並行](https://docs.ollama.com/faq)。

## 繁體化範圍與相容例外

介面、操作文件、中文註解、提示詞與預設內容使用繁體；品牌為「日耕 AI 熱點」、語系 `zh-TW`，RSS 使用同一語系。網站優先選繁體系統字型，分享圖補入 Noto Sans TC，報頭 SVG 已重新產生繁體字形。

1. 來源日期解析、公司別名、標籤同義詞及供應商錯誤辨識保留必要簡體輸入；原始來源測試樣本保留原文，避免轉字後漏收或失去回歸價值。
2. `http-fetch` 的 `Accept-Language: zh-CN,zh;q=0.9,en;q=0.8` 保留來源抓取相容；它不決定本站介面與生成文字語系。網址、品牌專名、`zh` 資料欄位與其他程式識別碼維持契約。
3. 已發布資料庫遷移與代理規則未改寫；歷史 migration 的原始簡體字串及上游圖片範例不視為目前本站生成內容。正式資料庫的 18 個來源已核對，其中 9 個來源的簡體標籤已備份、以條件比對交易轉為繁體並讀回確認；沒有新聞資料被修改。seed 不會覆蓋既有資料。
4. 生成文字以提示詞要求台灣繁體中文，未加入輸出轉換器。2026-11-03 的 Luna 十篇實測均產生繁體標題與摘要，另由編輯覆寫校正三處措辭；少量樣本不能保證模型每次都完全遵守。來源原文與逐字證據不翻譯，顯示原文時可能含簡體。

## 2026-11-03 驗證紀錄

1. 獨立測試容器限制 2 核與 4 GiB，使用獨立 PostgreSQL；型別檢查與 Web production build 通過，沒有修改本機依賴鎖檔。
2. 完整後端測試 1,021 項：1,019 通過、2 項依環境略過（root 下的不可讀目錄測試，以及已新增字型後不適用的「沒有額外字型」快取測試）。後續週報標題與模型回聲簡繁相容修正，連同分析與報告出口共 38 項回歸通過。
3. 最後一輪 Web 測試 60 項：59 通過、1 未通過。未通過項為 WebKit 深閱讀返回捲動錨點；同容器使用原始上游 `9059707e098b451539596d3a3bc7b47f43a068d9` 重新建置也重現，保留斷言與失敗紀錄，未納入本次繁體化修改。
4. 已檢視繁體分享圖、隔離瀏覽器手機條款截圖，以及 RTX Chrome 的正式本機首頁、日報與條款。正式映像建置成功，30 項網站 smoke 全通過；剛啟動時首頁曾因 API 尚未就緒回傳 503，API 就緒後重測通過，原始紀錄保留。
5. 正式本機與公開 HTTPS 驗證：未登入管理 API 為 401、登入後 200、缺少 CSRF 的寫入為 403、登出後恢復 401；公開登入 Cookie 具備 Secure、HttpOnly 與 SameSite=Lax。外部 HTTPS 的 30 項 smoke 全數通過，兩份正式條款日期與繁體語系讀回正確。真實模型仍未驗證，本機模型與測試容器停止，worker 未啟動。

## 公開路由與維護注意

`aihot.dayacre.com` 的 DNS 已代理至既有 `rtx-main` Tunnel，新增路由只指向 `http://127.0.0.1:3100`；原有 Multica／通知等 Access 規則未改。應用程式設定為 `SITE_URL=https://aihot.dayacre.com`、`TRUST_PROXY=true`。

本輪 Windows Cloudflared 重載時，連線與 metrics 已關閉，程序仍卡在 `Stop Pending`。核對服務名稱、程序 ID 與執行檔後，只終止該卡住程序，原重啟流程隨即完成，實際約 3 分鐘。漏測原因是事前只驗證 ingress 與服務狀態，未觸發真正的 Windows 停止流程；日後維護須預留停止等待時間並監看程序狀態，不以 `Running` 取代外部驗收，不重複送出 Restart-Service，也不要重跑本輪已完成的臨時修復指令碼。

重載後 Multica 的匿名回應為 302，Multica API／notify 為 403，與重載前一致；這只驗證既有存取保護回應，未登入其業務系統做完整操作測試。Cloudflared 為共用服務，未來重載仍須先取得服務中斷授權。

驗證工具的 Python 預設 User-Agent 曾收到 Cloudflare 1010；使用明確標示用途的 `AIHOT-Deployment-Check/1.0` 後通過，沒有關閉 Cloudflare 安全設定。若自行串接 API 遇到相同情形，請設定能識別應用程式的 User-Agent，參考 [Cloudflare 1010 官方說明](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/)。

## 公開網站安全驗證

1. 公網 HTTP 一律先以 308 轉至設定的 HTTPS 網域；已實測偽造 `X-Forwarded-Proto` 無法繞過 Cloudflare 的協定判定，也不會讓 HTTPS 產生轉址迴圈。RTX loopback 維護入口保留。
2. 回應含 HSTS（1 天，只限本網站）、防 MIME 嗅探、防跨站嵌入框架、Referrer-Policy，以及停用相機／麥克風／定位權限的標頭；圖片代理原有較強的 CSP sandbox 保留。
3. 公網 `.env`、`.git/config`、`docker-compose.yml` 實際 GET 均為 404；未登入的管理 API 為 401。資料庫、API 與模型沒有主機埠映射，網站只綁 `127.0.0.1:3100`。密碼與 `.data/` 不在 Git 中。
4. 2026-11-03 的正式依賴 `npm audit --omit=dev --package-lock-only` 回報 0 筆已知漏洞；沒有更新依賴。新增 HTTPS／標頭回歸先重現失敗，再修正；14 項相關伺服器測試、Web 型別檢查、映像建置及正式 HTTPS 30 項 smoke 通過，登入／登出與 CSRF 也在新映像重驗通過。
5. 根因是本次採用 Tunnel 直接進入 web，未經上游 Caddy 的 HTTPS 與標頭設定；最初 smoke 只驗 HTTPS，漏掉 HTTP 入口。防止再發的檢查已放進 `apps/web/tests/cache.test.ts`，發布時也要驗證兩種協定及偽造代理標頭，不能只確認 HTTPS 能開啟。

## Luna 十篇試跑（2026-11-03）

此次授權僅限 10 篇。`scripts/luna-pilot.ts` 分成準備名單與執行兩階段：從不同 RSS 信源選定十篇可確認正文的近期文章，再沿用正式分析、回執、歸組與發布流程。未使用 Jina、雲端向量或本機 GPU，未啟動 worker／排程，18 個來源的初始化游標保持不變。OpenAI News 的正文無法確認，在付費前改選其他來源。

執行於台灣時間 13:26:34 至 13:28:00，十篇完成、50 次模型回執全部完成，沒有重試或未知計費結果。輸入 303,614 token（其中 150,832 為快取），輸出 4,511 token。按 [OpenAI Luna Standard 單價](https://developers.openai.com/api/docs/models/gpt-6-luna)估算 US$0.01904202；這不是 OpenAI 帳單讀回值，亦不包含同一金鑰其他任務的用量。

已對照十篇來源，並透過既有編輯覆寫／稽核流程校正 Apple 傳聞的不確定性與美元幣別、Nemotron「開放模型」措辭，以及「川普」的台灣慣稱。原始模型回執保留。更正產生的兩個事件摘要待辦已僅針對本批取消，避免日後啟動 worker 時額外付費；沒有更動評分與入選門檻。

單批限制為最多 80 次模型請求、每次最多 196,608 bytes 請求本文與 16,384 輸出 token；僅允許 OpenAI Luna、非推理、文字模式，禁止重新導向。請求串行傳送，遇到網路／供應商錯誤即停止，不換文章、不自動重送；同一批已執行後禁止重跑。這些是次數與用量限制，不是美元帳單硬上限。本輪只驗證首次空資料庫情境，不能直接當成全量或持續採集方案。

`OPENAI_API_KEY` 由本機 `.env` 提供，未提交 Git；本次模型請求只由一次性試跑容器送出。正式 API 容器同樣載入該環境檔，但 `MODEL_CALLS_ENABLED=false`、`COLLECT_ENABLED=false` 與原有本機模型設定保持不變，試跑容器完成後已移除。

執行記錄在 Docker data volume 的 `/data/pilots/luna-10-20261103.json`，編輯修正另存同目錄的 `luna-10-20261103-corrections.json`；本機副本在 `.data/pilots/`。前置資料庫備份在 `.data/backups/luna-10-20261103/before-pilot.dump`，SHA-256 為 `327EEC0B7160B20DD850881EB92C351501CCFCF00A39A3FD93293A168880F7BF`。

型別檢查與 5 項單批安全測試通過；完整後端測試 1,027 項，1,025 通過、2 項略過；正式 HTTPS smoke 30 項通過。瀏覽器已確認「全部 AI 動態」與文章頁可讀。

### 已核定的公開說明更正

原公開條款寫「使用本機模型」，隱私說明寫「不將內容送往付費雲端模型 API」，已不符合本次明確授權的雲端試跑。本人已同意更正並發布版本 1.1：條款改為「使用 AI 模型產生台灣繁體中文摘要與精選；模型處理方式見隱私說明」，隱私第 4 節改為：

> 2026-11-03 的一次十篇試跑使用 OpenAI API，輸入為公開新聞文字與整理提示，未將訪客回饋、管理者登入資料或瀏覽紀錄送入模型。本機模型與持續採集目前仍停用。本站展示摘要與原文連結；點擊原文或載入第三方圖片與媒體時，相關提供者可能收到網路請求，適用其各自的隱私規則。

核定來源為本對話「同意更正並發布」的明確回覆，沒有因此啟動新的採集或模型工作。

## 完整摘要還原（2026-11-03）

本人核准修正摘要截短規則，還原這十篇既有模型摘要並公開、同步 GitHub，且禁止重跑模型或新增 API 費用。原規則會把超過 190 字的摘要截至約 80 字以上的完整句，造成 Import AI 的 223 字摘要只剩 93 字，遺漏標題提及的 Genie 4 等重點。初次驗收只確認來源正確與流程完成，未核對模型回覆後半段是否完整保留。

`finalizeCopy` 已移除機械截句，仍保留來源實體檢查；摘要長度繼續由既有提示詞引導，沒有加入額外改寫請求。回歸使用實際發布與閱讀資料介面，涵蓋理解、翻譯兩條路徑及未受來源支持的公司名稱攔截；先重現 223 字變 93 字，再確認修正後完整保留。來源全文展示設定與選稿門檻保持不變。

十篇逐一核對 7 份 JSON 與 3 份文字格式的既有回執，實際補回 5 篇被截短的摘要，另外 5 篇原本完整；Apple 保留完整人工校正版，川普用名與 Nemotron「開放模型」修正亦保留。資料透過既有編輯覆寫、版本比對與稽核流程發布；標題、分數、分類、入選結果與可見性讀回不變。僅取消本次產生的 3 個事件摘要待辦，最後待處理工作為 0。

還原前完整資料庫備份：`.data/backups/summary-restore-20261103/before-restore.dump`，SHA-256 `F2741E9FEFE8869EE31AD865F41A7396B992B8C46FBDC3366D7484B86C181E06`，已讀回備份目錄。逐篇前後值、既有回執編號與取消工作紀錄在 `/data/pilots/luna-10-20261103-summary-restore.json`，本機副本在 `.data/pilots/`；均不提交 Git。

還原前檢核曾因資料庫查詢陣列的型別與 JSON 陣列不同而停止；讀回確認零筆寫入後，將查詢結果轉為一般陣列，再比對全部內容後執行。沒有放寬資料值、版本或回執檢查。

型別檢查、16 項分析回歸與完整後端測試通過：共 1,028 項，1,026 通過、2 項依原環境略過。正式資料的 50 筆回執（含狀態、用量與費用欄位）及 18 個來源游標前後完全一致；本機模型與持續採集保持關閉。

正式映像 `rtx-summary-20261103` 已建置並部署至 API／Web，未重啟資料庫、共用 Tunnel 或本機模型。部署後 30 項 HTTPS smoke 通過，十篇公開 API 摘要逐字符合還原紀錄；瀏覽器確認 Import AI 顯示完整 223 字及 Genie 4／Metis 段落。測試容器已停止，Git 僅同步程式、回歸測試與本文件。

## Luna 今日完整批次（2026-11-03）

本人後續明確授權「用 Luna 把所有今日的都爬完，不用管價格」，並要求實際確認網頁。此授權新增一次雲端批次；本機 GPU 模型與持續採集仍停用。範圍為既有 18 個 RSS 信源在台灣時間 2026-11-03 00:00 後、執行截止前提供的文章，不含未來當日晚間新增內容或 RSS 未提供的歷史資料。

`scripts/luna-today.ts` 先準備當日名單及完整正文，再串行執行正式分析、歸組、發布及事件摘要；沒有每來源一篇或總計十篇的限制。台灣日界與截止時刻有回歸測試，批次保存逐篇進度、模型回執與來源游標，已執行批次禁止盲目重跑。既有十篇試跑的預設 80 次限制保留；新批次明確指定依候選數計算的請求上限，仍限制為 Luna 文字模式，沒有美元預算上限，也不代表無限重試。

1. 台灣時間 14:44:13 準備名單：18 個信源提供 32 篇今日文章，8 篇重用既有結果，24 篇新處理；其中 23 篇通過 AI 關聯性篩選，1 篇一般 OSINT 文章排除。14:54:45 收尾重掃仍為同一批 32 篇，18 個來源成功，沒有漏項或未知日期。
2. OpenAI News 兩篇原文的直接 HTTP 讀取收到 403；改從官方公開頁面的網頁閱讀工具取得可確認正文與來源記錄，未使用登入、付費正文服務或 Jina。其餘候選均在付費分析前備妥正文。
3. 主批次台灣時間 14:49:30 至 14:54:15 完成，產生 141 筆 Luna 回執；內容核對後以既有編輯覆寫修正三篇措辭，重新整理受影響事件另用 3 次，合計 **144 次、全部完成**。輸入 587,292 token（含快取 342,270），輸出 14,923；按前述 Luna Standard 單價估算 **US$0.0353864**，不是帳單讀回值，也不含先前十篇試跑。
4. 已核對文章與事件內容，校正漏洞獎金中點／倍數、營收增至 12 倍、美元單位與 Grok 成本描述，並修正三個事件標題／文字。事件修正使用版本比對、交易、歷史版本與稽核記錄；沒有改變評分、入選門檻或來源原文。所有 23 個有效事件的摘要輸入雜湊與目前公開文章相符。
5. 全站資料庫為 34 篇，其中 33 篇符合公開資格、5 篇精選。`/all` 原有 40 分門檻會省略 5 篇低分文章，但搜尋仍可找到；加上 1 篇非 AI 篩除後，列表共 28 篇。列表按本站時間軸分日，顯示 11/3 共 27 篇及 10/31 共 1 篇，與「來源日期為今日的 32 篇」是不同統計口徑，並非漏抓。

這次只處理文章及事件摘要，沒有生成日報、週報或月報。AI 日報以每日 08:00 為期別截點；本批文章在 08:00 後才收錄，沒有回填成當日早報。`/daily` 目前顯示尚未釋出；worker 停用，因此不承諾翌日自動生成。

前置完整資料庫備份為 `.data/backups/luna-today-20261103/before-today.dump`，SHA-256 `BA0D97F8CDBFF0380AD6B6D1E9F08341498C2F87E0BE82B8C92E5113458139C0`，備份目錄讀回正常。執行與修正記錄在 `/data/pilots/luna-today-20261103*.json`，本機副本及最後公開 API 比對在 `.data/pilots/`，均不提交 Git。原先七份人工覆寫與全部來源游標讀回不變；本批衍生待辦處理後為零。

隱私說明更新為 1.2，如實記載此次雲端文章整理。正式映像 `rtx-today-20261103` 已建置並部署至 API／Web，未重啟資料庫、共用 Tunnel 或本機模型；映像不包含 `.env` 與 `.data`。一次性模型容器已移除，測試容器已停止，正式設定保持 `MODEL_CALLS_ENABLED=false`、`COLLECT_ENABLED=false`。

驗證結果：8 項獨立批次測試、型別檢查、Web production build 通過；完整後端測試 1,031 項，1,029 通過、2 項依原環境略過。正式 HTTPS smoke 30 項全數通過，逐篇公開 API 標題／摘要與資料庫一致。實際瀏覽器確認首頁 5 篇精選、全部動態、完整文章摘要及原文連結、熱點榜 1 件事件、修正後事件頁、隱私 1.2 與日報空狀態；沒有把既有未通過的 WebKit 捲動測試宣稱為已修復。

## 每篇文章的繁體中文內文（2026-11-03）

本人明確選擇「多段繁體中文重點整理，包含背景與細節」，並要求每篇文章都要有內文。前次只驗收短摘要完整，未確認閱讀頁具有正文，是驗收範圍漏項；當時 18 個來源皆為 `site_fulltext=false`，正文雖已保存，公開頁面只收到摘要。此次新增自撰閱讀內文，沒有把來源原文或全文翻譯的授權開關打開。

列表維持短摘要，文章頁新增「文章內容 · AI 重點整理」，以小標、段落與目錄呈現事件、來源提供的背景、細節及限制，並標明不是原作者全文或逐字翻譯。適用所有符合公開資格的文章，包括非精選與低分文章；被判為非 AI 的一篇不生成正文，既有列表的 40 分門檻不變。短公告只整理實際公開資訊，不以模型常識補造篇幅。

新遷移 `0124_article_readings.sql` 將整理段落獨立存入 `article_readings`，記錄原文版本、分析編號、人工覆寫版本、輸入雜湊、提示詞版本與付費回執。產生時使用完整保存原文及既有人工校正；超長輸入明確停止，不截去後半。至少需兩個不同的實質中文段落，不能直接重述導讀。公開讀取層會核對資格、可見性與資料版本，僅將經跳脫的純文字組成 HTML；摘要限定、撤回與過期整理不會漏出正文。網頁與 Markdown 共用整理內容，讀者開頁不觸發模型。

`scripts/luna-readings.ts` 提供固定名單的 `--prepare 批次名稱` 與 `--run 批次名稱`。準備階段不付費，核對完整材料大小、既有回執、人工覆寫及來源游標；執行串行使用 Luna，每批最多名單篇數次請求。相同批次可續接或重驗，已完成／已收到的回執可恢復，未核對的失敗或未知回執會停止；不能換批次名稱來規避未確認的計費狀態。正式資料操作前仍要備份，命令須在既有 Compose 環境的一次性容器執行，不可直接拿主機 `.env` 的 localhost 連線代替容器內資料庫設定。

未來的十篇試跑與當日批次指令，也會實際補齊該批所有可公開文章的整理，核對正文存在後才完成。若日後明確啟用 worker 與 `MODEL_CALLS_ENABLED=true`，每 5 分鐘的閱讀整理工作會補齊缺少或已過期的正文；單篇失敗會繼續其他文章，最後明確回報整輪錯誤。本次沒有啟用 worker、持續採集或本機 GPU 模型。

正式補寫於台灣時間 21:28:14 至 21:33:18 完成，33 篇、33 次 `gpt-6-luna` 請求全部完成。輸入 103,089 token、輸出 23,050 token，快取輸入為 0；依前述 Standard 單價估算 US$0.0218339，並非帳單讀回值。逐篇對照保存來源後，另外以交易、預期值核對與稽核記錄校正四篇正文：補足 Anthropic 財報核心內容、補明 MIT Insights 客製內容部門歸屬、明示 AWS 850 條軌跡是來源記載，以及 Grok 正文沿用來源正文的 SpaceX 名稱。沒有為校正再呼叫模型，也沒有修改先前的標題、摘要、評分、精選結果、人工覆寫或來源游標。完成批次再次執行全部回報 `current`，請求總數維持 33。

前置完整資料庫備份為 `.data/backups/reading-body-20261103/before-body.dump`，SHA-256 `69984CCEA5CA455D1E452513603FA844A0CD15D0316CD2B81C21892C8F8D3DF5`，已讀回備份目錄。名單、原始完成紀錄、四篇校正前後值及公開核對結果保存在 `/data/pilots/reading-body*.json`，本機副本在 `.data/pilots/`，不提交 Git。

驗證包括完整後端 1,038 項（1,036 通過、2 項依原環境略過），最後 worker 錯誤隔離修正後的 8 項受影響回歸、型別檢查及 Web build 均通過。新增瀏覽器測試先在舊版重現缺正文，再於新版通過。Web 全套 63 項最初 61 通過、2 失敗；其中正式條款測試仍誤認為「尚未生效」，已改為精確核對核定日期及 AI 整理說明，該檔 4 項重驗通過。唯一保留失敗為先前已在上游重現的 WebKit 捲動恢復，不宣稱已修復。

正式映像 `rtx-reading-20261103` 已部署 API／Web，未重啟資料庫、共用 Tunnel 或本機模型。公開 HTTPS smoke 30 項通過，33 篇公開 API 與 Markdown 均逐篇符合資料庫正文；先前 194 筆回執、全部既有公開欄位、10 份人工覆寫及 18 個來源設定／游標讀回不變，待處理工作為 0。首次核對工具誤把 Markdown 路徑加上 `/api/site` 而收到 404；依實際路由改為 `/items/:id/markdown` 後重驗通過，網站程式無需修正，原錯誤紀錄保留。

實際瀏覽器確認 Brave 同一頁已出現 4 個小標、8 段主文及可操作目錄，並確認財報校正文、低分短公告及長篇 Legora 訪談均可閱讀，長文沒有橫向溢出。驗收截圖在 `.data/verification/article-reading-brave.jpg`。使用規則 1.2 與隱私說明 1.3 如實補入 AI 文章整理；一次性模型容器已移除，測試容器停止，正式 `MODEL_CALLS_ENABLED=false`、`COLLECT_ENABLED=false` 維持不變。
