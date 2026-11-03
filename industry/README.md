# 行業包

這個行業的知識都在這裡：分類、主題、信源、精選標準和門檻。換一個行業，主要就是改這個資料夾和 [`site/`](../site/)（站名、文案、品牌和頁面），步驟見 [把它改成你的行業](../docs/customize.md)。

| 檔案 | 內容 |
|---|---|
| `taxonomy.ts` | 分類、標籤、公司與機構、防止模型寫錯公司的詞表，這個行業最受關注的那類釋出（`RELEASE`） |
| `topics.json` | 主題目錄（`/topics`），站點啟動時讀取 |
| `sources.json` | 首次啟動時匯入的示範信源 |
| `prompts/` | 每一步的提示詞：預篩、評分、寫作、結構化、歸組、事件綜述、週報月報、翻譯 |
| `selection.ts` | 入選門檻 |
| `gold.example.jsonl` | 精選評測樣本的格式示例 |
| `relation-gold.example.jsonl` | 事件關係評測樣本的格式示例 |
| `story-digest-eval.example.jsonl` | 事件綜述評測案例的格式示例 |
