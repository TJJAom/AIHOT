# RTX 本機使用方式

公開網站：<https://aihot.dayacre.com>；管理入口：<https://aihot.dayacre.com/admin>。
RTX 本機備用入口：<http://localhost:3100>。2026-11-03 已依本人核定公開閱讀，後台僅管理者使用；HTTPS、公開網站與後台驗證已通過。使用規則與隱私說明版本 1.0，自 2026-11-03 生效。

## 先開始使用

1. 開啟 <https://aihot.dayacre.com>，可切換精選、全部動態、熱點、日報與主題；其他裝置也能使用這個網址。
2. 開啟 <https://aihot.dayacre.com/admin>，使用 RTX 本機 `.env` 中的 `ADMIN_PASSWORD` 登入。後台可管理信源、內容與設定，公開訪客無法使用。
3. 目前模型與採集停用，資料庫尚無新聞，因此首頁與日報顯示空白狀態。先不要手動採集、重跑文章或啟動模型；待你明確允許恢復後，才續下載與驗證 Qwen3。
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
檢查輸出存 `.data/verification/`，不納入 Git。模型聊天品質、處理逾時與外網網域須以本次實測結果更新，不把「已設定」寫成「已驗證」。本輪真實模型推論與模型端到端測試未執行，原因是使用者要求暫停 GPU 模型；網站測試使用本機假服務。

官方依據：[Ollama 0.34.2](https://github.com/ollama/ollama/releases/tag/v0.34.2)、[Docker](https://docs.ollama.com/docker)、[設定與並行](https://docs.ollama.com/faq)。

## 繁體化範圍與相容例外

介面、操作文件、中文註解、提示詞與預設內容使用繁體；品牌為「日耕 AI 熱點」、語系 `zh-TW`，RSS 使用同一語系。網站優先選繁體系統字型，分享圖補入 Noto Sans TC，報頭 SVG 已重新產生繁體字形。

1. 來源日期解析、公司別名、標籤同義詞及供應商錯誤辨識保留必要簡體輸入；原始來源測試樣本保留原文，避免轉字後漏收或失去回歸價值。
2. `http-fetch` 的 `Accept-Language: zh-CN,zh;q=0.9,en;q=0.8` 保留來源抓取相容；它不決定本站介面與生成文字語系。網址、品牌專名、`zh` 資料欄位與其他程式識別碼維持契約。
3. 已發布資料庫遷移與代理規則未改寫；歷史 migration 的原始簡體字串及上游圖片範例不視為目前本站生成內容。正式資料庫的 18 個來源已核對，其中 9 個來源的簡體標籤已備份、以條件比對交易轉為繁體並讀回確認；沒有新聞資料被修改。seed 不會覆蓋既有資料。
4. 生成文字目前以提示詞要求台灣繁體中文，未加入輸出轉換器，也未執行真實模型驗證；不能保證模型每次都完全遵守。來源原文與逐字證據不翻譯，顯示原文時可能含簡體。

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
