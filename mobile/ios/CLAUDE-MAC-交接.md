# 給 Mac 端 Claude：日耕 iOS App 接手步驟

> 這份文件由 2026-11-04 的雲端 Claude 工作階段產出。程式碼在 Linux 環境撰寫、**尚未編譯**，Mac 端的首要工作是讓它在 Xcode 編譯通過、在模擬器與實機看過每個頁面，然後上 TestFlight。
> 一律用台灣繁體中文回覆使用者（Tom）。遇到多個問題時先列完整清單、標優先順序，再逐一處理。

## 0. 前提

- 分支：`ios/app`（`git fetch origin && git checkout ios/app`）。不要合併進 `main`、不要動 `apps/`、`packages/`、`database/`。
- 需要：Xcode 16+、`brew install xcodegen`、Apple Developer 帳戶（TestFlight 必要）。
- 網站 API 已正式運行，App 只讀 `https://aihot.dayacre.com`，不需要任何密鑰。

## 1. 產生專案並編譯（第一優先）

```bash
cd mobile/ios
xcodegen generate            # 產生 AIHot.xcodeproj（已在 .gitignore）
open AIHot.xcodeproj
```

或命令列：

```bash
xcodebuild -project AIHot.xcodeproj -scheme AIHot \
  -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -40
xcodebuild -project AIHot.xcodeproj -scheme AIHot \
  -destination 'platform=iOS Simulator,name=iPhone 16' test 2>&1 | tail -40
```

預期會有少量編譯錯誤（API 細節、型別推斷）。修正原則：

- 不改變檔案結構與命名；不引入第三方套件；不用 WebView 取代原生渲染。
- `AIHot/HTML/HTMLBlockParser.swift` 是文章頁核心；若要改，先跑 `AIHotTests` 的 `testItemDetailWithBody` 與 `testHTMLParserHandlesLists_Entities_Links`。
- 若 `@Observable` + `@Environment(Type.self)` 注入有問題，確認 `AIHotApp.swift` 的 `.environment(...)` 順序與型別一致。

## 1.5 這一版 UI 的設計依據（2026-11-04 晚間重做）

App 的三個主頁面是照網頁版「桌機版」的版面重做的，色票與字級取自 `apps/web/app/app.css` 與 `apps/web/app/features/`：

- 精選／全部：`CategoryTabs` 藥丸列 → 「當前熱點」卡 → 每天一條**時間軸**（左側 `HH:mm`、強調色節點與貫穿的軸線、右側白卡）。日期列貼頂可收合，第一天的日期列右側有「只看未讀」。卡片：來源 · 精選徽章 · AI 評分藥丸 · 書籤；標題 2 行、摘要 2 行、推薦理由 2 行——**不要再放寬行數**，這是使用者明確要求的「快速瀏覽」密度。
- 日報：`ReportPaper` 完整照 `features/report/ReportPaper.tsx`：日期行與出刊時間 → 報名（站上的 SVG 報頭拆成兩層模板圖 `NameplateDailyAccent/Ink`）＋報眼（期數、網點大日期；iPad 寬度才顯示本月出刊點陣）→ 指標帶 → 頭條（Kicker、特大標題、導語、來源／原文）→ 今日看點（1、2、3）→ 本期版面 → 各版 `01 行業動態` → 快訊 → 前後日 → （本期完）。右上角：目錄鈕與**日曆鈕**（`ReportCalendarSheet`：整月日曆，有刊的日子可點，可換月）。
- 文章頁：來源行 → 標題 → 原題 → 「AI 導讀」大字摘要 → 「文章內容 · AI 重點整理」分隔 → 內文 → 開啟原文 → AI 評分／主題／標籤。

驗收時請把 App 畫面與 <https://aihot.dayacre.com>、`/daily`、`/all` 的桌機版並排比對；若 Xcode 預覽與網頁差很多，先回頭對照上述 tsx 再調。

## 2. 在模擬器逐頁實看（第二優先）

請真的打開每一頁並截圖存到 `mobile/ios/.verification/`（此目錄已 gitignore，不要提交），再向使用者回報：

1. 精選：熱點橫條、分類切換、往下捲動自動翻頁、下拉更新。
2. 文章頁：用 `bjr6oufmll5t8sajno2m8hp9f`（4 節 7 段）確認小標、段落、目錄跳轉、字級倍率；用 `dstd0k6qa9j0izpx23jjfazow`（body 為 null）確認顯示「尚未備妥」且原文按鈕可用。
3. 全部動態：搜尋 debounce、相關度切換、空結果顯示主題建議。
4. 日報：最新一期；若當天尚未出刊（台灣 08:00 前後）顯示「還沒出刊」而非錯誤；往期列表與上一期／下一期。
5. 主題：分組清單與詳頁翻頁。
6. 我的：16 套主題逐一切換（特別看純黑、高對比在深淺色下的可讀性）、字級滑桿、收藏新增／刪除。
7. 錯誤路徑：關網路後開任一頁要看到「重試」；`aihot://items/abc`（Safari 輸入或 `xcrun simctl openurl booted 'aihot://items/bjr6oufmll5t8sajno2m8hp9f'`）要能開文章。

## 3. 簽章與 TestFlight（第三優先）

1. App Store Connect 建 App：名稱「日耕」、Bundle ID `com.dayacre.aihot`（若使用者要改，同步改 `project.yml` 與 `mobile/push-worker/wrangler.toml` 的 `APNS_TOPIC`）。
2. Xcode → Signing & Capabilities：選 Team；確認 **Push Notifications** 與 **Background Modes → Remote notifications** 已勾（entitlements 與 Info.plist 由 project.yml 產生，應已存在）。
3. `project.yml` 的 `DEVELOPMENT_TEAM` 填入 Team ID 後重新 `xcodegen generate`，避免每次產生後要重選。
4. Archive → Distribute → TestFlight。Release 建置的 `aps-environment` 需為 `production`：Xcode 於 Archive 時會自動改寫；若上傳後推播收不到，先查 entitlements。
5. 第一版 TestFlight 說明可寫：「文章閱讀、日報、主題、14 套主題、推播通知（需後續設定）」。

## 4. 推播（Cloudflare）

在任一台有 Node 的機器（Mac 即可）：

```bash
cd mobile/push-worker
npm install
npx wrangler login
npx wrangler kv namespace create PUSH_KV      # 把 id 填進 wrangler.toml
npx wrangler secret put APNS_KEY_P8            # Apple Developer → Keys → 建立 APNs key，貼 .p8 全文
npx wrangler secret put APNS_KEY_ID
npx wrangler secret put APNS_TEAM_ID
npx wrangler secret put ADMIN_TOKEN            # openssl rand -hex 24
npx wrangler deploy                            # 得到 https://aihot-push.<account>.workers.dev
```

然後：

1. 把 Worker 網址填進 `mobile/ios/project.yml` 的 `AIHotPushRegistrationURL`，重新 `xcodegen generate` 並建置。
2. 實機執行 App → 允許通知 → 「我的 → 通知」顯示「裝置已登錄」。
3. 驗證通道：`curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" https://aihot-push.<account>.workers.dev/admin/test`；手機應收到「日耕 測試通知」。
4. Debug 建置登錄為 `sandbox`、TestFlight／正式為 `production`，Worker 會自動分流到對應 APNs 主機。
5. 第一次 cron 只「記錄現狀」不推；之後每 5 分鐘有新精選才推。可用 `POST /admin/run?dry=1` 看會推什麼。

若 Workers 的 `fetch` 對 APNs 回 HTTP 錯誤且 reason 為空（HTTP/2 協商問題），改用 `@fivesheepco/cloudflare-apns2` 套件替換 `src/apns.ts` 的 `sendApns`；介面相同。

## 5. 收尾

- 把修正後的程式碼推回 `ios/app` 分支；提交訊息用繁體中文。
- 回報使用者：編譯結果、每頁截圖位置、TestFlight 建置號、推播測試結果、還沒做的項目。
- 不要提交：`AIHot.xcodeproj`（由 xcodegen 產生）、`.verification/`、任何 `.p8`、`.dev.vars`。
