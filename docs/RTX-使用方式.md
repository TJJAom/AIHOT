# RTX 本機使用方式

本機網站：<http://localhost:3100>；管理入口：<http://localhost:3100/admin>。
已核定公開閱讀、後台僅本人使用。公開網域待設定，HTTPS 與外網驗收尚未完成，不以本機可開啟視為已發布。

## 先開始使用

1. 在 RTX 開啟 <http://localhost:3100>，可切換精選、全部動態、熱點、日報與主題。
2. 開啟 <http://localhost:3100/admin>，使用本機 `.env` 中的 `ADMIN_PASSWORD` 登入。後台可管理信源、內容與設定，公開訪客無法使用。
3. 目前模型與採集停用，資料庫尚無新聞，因此首頁與日報顯示空白狀態。先不要手動採集、重跑文章或啟動模型；待你明確允許恢復後，才續下載與驗證 Qwen3。
4. 有內容後，可在文章旁收藏、搜尋標題與摘要；「Agent 接入」頁提供 RSS、公開 API 與 MCP 的使用方式。

網站服務需 Docker Desktop 正在執行。Windows 目前只綁定本機連線，其他裝置須等待公開網域完成後才能開啟。

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
模型服務只在 Docker 網路中提供 `http://ollama:11434`，不公開主機埠。`.env` 已預填相容 API 位址 `http://ollama:11434/v1`、模型 `qwen3:8b`，使用本地占位金鑰與 `LLM_EXTRA_JSON={"reasoning_effort":"none"}`。兩個安全閥仍為 `false`；預填不代表已重新載入或驗證，實際聊天、JSON 與 AIHOT 處理測試通過前不要啟用自動處理。

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
5. 正式本機驗證：未登入管理 API 為 401、登入後 200、缺少 CSRF 的寫入為 403、登出後恢復 401。本機模型容器與測試容器都已停止；worker 未啟動。公開 HTTPS、Cloudflare 路由與真實模型仍未驗證。
