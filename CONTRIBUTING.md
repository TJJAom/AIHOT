# 參與貢獻

歡迎提交可復現的問題、文件修正，以及對其他行業也有用的改進。中文或英文都可以。

## 去哪裡交流

- [Issues](https://github.com/KKKKhazix/AIHOT/issues/new/choose)：可復現的 Bug 和有明確場景的功能建議。
- [部署與使用問答](https://github.com/KKKKhazix/AIHOT/discussions/categories/q-a)：安裝、配置、部署和使用問題；問題解決後可以標記答案。
- [想法交流](https://github.com/KKKKhazix/AIHOT/discussions/categories/ideas)：先討論方向和使用場景。
- [作品展示](https://github.com/KKKKhazix/AIHOT/discussions/categories/show-and-tell)：分享你搭建的行業熱點站和實踐經驗。
- 安全漏洞請按 [安全報告說明](SECURITY.md) 私密提交。

## 貢獻範圍

優先歡迎部署體驗、通用採集能力、處理流程、公開介面、可訪問性、文件和可復現故障的改進。大幅調整架構或產品行為前，先在 Issue 或討論區說明場景和方案，避免投入後才發現方向不合適。

只適合你所在行業的信源和精選標準，在自己的倉庫裡改 `industry/`；站名、品牌和頁面改 `site/`；只有你的站需要的功能做成模組放進 `modules/`（見 [架構](docs/architecture.md#模組)）。步驟參考 [定製文件](docs/customize.md)。出於合規和風險考慮，完整營運信源名單暫不分享；本倉庫也不持續維護微博、小紅書等平台的專用採集適配，可以按 [信源文件](docs/sources.md) 接入你自行維護的外部採集結果。

## 提交改動

1. Fork 本倉庫，從最新的 `main` 建立自己的分支。若只是搭建一個獨立站點，可以用 [Use this template](https://github.com/KKKKhazix/AIHOT/generate)；模板生成的專案沒有共享提交歷史，後續貢獻程式碼或合併上游更新更適合用 Fork。
2. 閱讀 [AGENTS.md](AGENTS.md) 和改動對應的文件。保持一次 PR 解決一個清楚的問題，不夾帶無關重構，也不夾帶重灌依賴帶來的 `package-lock.json` 改動。依賴升級、Agent 規則檔案（`AGENTS.md`、`CLAUDE.md`、`.agents/`、`.claude/`）和二進位制檔案不接受外部 PR 修改，需要時先開 Issue，由維護者來改。
3. 按 [部署文件](docs/deploy.md) 配置本地環境。使用獨立測試庫，開發時關閉採集、模型呼叫和外部推送；不使用生產資料庫或真實付費服務做測試。
4. 驗證改動涉及的行為，在 PR 中寫明執行結果；來自 Fork 的 CI 要維護者批准後才執行，不能代替本地檢查。程式碼改動執行 `npm run typecheck`、`npm test`、網頁構建與網頁測試；後端測試庫名必須以 `_test` 或 `_ci` 結尾（沒有會自動建立並遷移），每個測試檔案在它的副本上並行執行，所以測試資料庫賬號要有 `CREATEDB` 許可權。執行中的站點可用 `node scripts/smoke.ts --base http://localhost:3000` 檢查。純文件或模板改動核對連結、語法和實際展示即可，不需要為了湊數量新增測試。
   改資料庫時，已經發布的遷移不改，修正放進新檔案；新檔案只放一條允許線上執行的語句，PR 會自動檢查，本地可以先跑 `node scripts/check-migrations.ts --base main`。規則見 [遷移約定](docs/architecture.md#資料庫遷移)。
   備份恢復測試還需要 `tar` 和與服務端版本相容的 `pg_dump`/`pg_restore`；測試會建立並清理獨立的臨時恢復庫和檔案目錄，不訪問真實物件儲存。
5. 向本倉庫 `main` 提交 PR，關聯相關 Issue，並勾選 “Allow edits by maintainers”：小問題維護者可以直接在你的分支上改好再合併，不用你再跑一趟。還在改就開草稿，改好再標為就緒。頁面改動附截圖；涉及配置或升級步驟時同步更新文件，已部署的站點升級時要做的事寫進 [部署文件](docs/deploy.md) 的“更新”一節。

`main` 透過 PR 合併。準備合併時，請把 PR 分支整理成一個提交，保留正確的作者署名；更新已經推送的分支用 `git push --force-with-lease`。分支要包含最新的 `main`，GitHub 的 `check` 和 `docker` 在這個提交上透過後，維護者用 rebase 方式合併，保留你的作者資訊。

請勿提交 `.env`、金鑰、管理員密碼、Cookie、生產資料或未獲授權的素材；日誌和截圖也要先移除敏感資訊。程式碼沿用 [MIT 許可證](LICENSE)，品牌和第三方素材說明見 [NOTICE](NOTICE)。
