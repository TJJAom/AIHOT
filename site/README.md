# 站點

這個站自己的東西：名字、文案、品牌、頁面，以及啟用哪些模組。步驟見 [把它改成你的行業](../docs/customize.md)。

| 檔案 | 內容 |
|---|---|
| `site.ts` | 站名、行業詞、出刊時間、首頁和關於頁文案、分享圖文字、條目與日報週報月報上的說法、公開介面的分類、備案號 |
| `models.ts` | 具名的模型和每一步預設用哪個（沒寫的步驟用 `.env` 裡配的那一個） |
| `brand/` | 圖示、Logo（`Logo.tsx`）、分享圖和海報上的字標（`wordmark.svg`、`wordmark-dark.svg`，可選）、日報週報月報的報頭字（`nameplates/`）、關於頁的二維碼（`contact/`，可選） |
| `pages/` | 使用規則、隱私說明（模板，上線前按實際情況改寫） |
| `public/` | 釋出在網站根目錄的固定檔案（站名、地址等佔位符替換後釋出）：`robots.txt`、`manifest.webmanifest`、`openapi-v1.json`，以及可選的 `.well-known/security.txt` |
| `changelog.json` | 更新日誌 |
| `modules/` | 啟用哪些模組：`index.ts`、`server.ts`、`web.ts` 三份清單，列出倉庫根目錄 `modules/<名字>/` 裡要用的模組，預設都為空，見 [架構](../docs/architecture.md#模組) 的“模組” |
