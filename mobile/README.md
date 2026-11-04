# 日耕 iOS App 與推播 Worker

分支 `ios/app`，不動正式 `main` 與後端。兩個部分：

| 目錄 | 內容 | 在哪裡跑 |
|---|---|---|
| `mobile/ios/` | SwiftUI 原生閱讀 App「日耕」（XcodeGen 專案） | Mac + Xcode |
| `mobile/push-worker/` | Cloudflare Worker：輪詢網站公開 API，對新文章發 APNs 推播 | Cloudflare（任一台有 Node 的機器部署） |

Mac 端接手請直接讀 **`mobile/ios/CLAUDE-MAC-交接.md`**，裡面是逐步指令。

## App 做了什麼

- 五個分頁：精選（含熱點橫條、分類篩選、同事件分組）、全部動態（搜尋、相關度排序、主題建議）、日報（最新一期＋往期）、主題（分組／主題詳頁）、我的（收藏、主題、字級、通知、關於）。
- 文章頁：`/api/site/items/{id}` 的 `body.zh` 以原生 SwiftUI 渲染（自寫 HTML 區塊解析，不用 WebView），支援小標目錄、清單、引文、程式碼、表格、圖片、連結、Dynamic Type 與字級倍率；`body` 為 null 或 `summary-only` 時明確顯示狀態並仍提供原文連結。
- 事件頁 `/api/site/stories/{publicId}`、同事件報導 `/api/site/groups/{factId}/reports`。
- 16 套主題（`AIHot/Theme/AppTheme.swift`）：預設「日耕原色」即網站的淺色＋深色色票，另有固定淺色、固定深色、碳纖螢綠、宣紙、純黑等。
- 收藏與已讀只存本機。
- 推播：第一次開啟詢問授權，device token 送到 Worker 的 `POST /devices`；可選「只推精選／全部動態」與類別。點通知直接開文章（`itemId`）。URL scheme `aihot://items/<id>`、`aihot://story/<id>`、`aihot://daily/<yyyy-mm-dd>`，也接受網站 https 連結。
- 網路層：單一 `APIClient` actor，ETag／304、503 `Retry-After`、404、離線都有對應錯誤文字；相對媒體 URL 以網站基底解析。
- `AIHotTests/`：用 2026-11-04 抓下的真實回應（`Fixtures/`）驗證 Codable 契約與 HTML 解析。

## Worker 做了什麼

- `*/5 * * * *` 讀 `/api/site/timeline?limit=40`（精選）與 `/api/site/pool?tab=time&page=1`（全部），與 KV 內已見過的文章 ID 比對；新文章（6 小時內進站、分數 ≥ `MIN_SCORE`）才推。
- 第一次執行只記錄現狀、不推送，避免一次推出幾十篇。
- 每台裝置依自己的範圍／類別取候選：≤ `MAX_INDIVIDUAL_PER_RUN` 則逐篇推（點開即文章），否則合併成一則摘要。
- APNs provider token（ES256 JWT）用 WebCrypto 簽，50 分鐘快取；410／BadDeviceToken 自動刪除裝置。
- `/admin/*` 需 `Authorization: Bearer <ADMIN_TOKEN>`：`GET /admin/stats`、`POST /admin/run?dry=1`、`POST /admin/test`、`POST /admin/reset-seen`。

## 尚未核定／未驗證

- 本分支在 Linux 環境撰寫，**尚未在 Xcode 編譯**；Mac 端第一步就是 `xcodegen generate` 後 Build，修掉編譯器指出的問題（預期為少量語法／API 細節）。
- Apple Team ID、簽章、App Store Connect 的 App 記錄與 TestFlight 群組需在 Mac 上用你的帳戶完成。
- APNs `.p8` 金鑰、Key ID、Team ID 只放進 `wrangler secret`，不進 Git、不進 App。
- 帳號同步收藏、付費牆、管理功能：未做，也未假設後端支援。
