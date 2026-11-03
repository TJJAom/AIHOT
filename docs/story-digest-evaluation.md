# 事件綜述提示詞評測

事件頁的綜述由 `industry/prompts/story-digest.md` 生成。改這份提示詞之前，先在同一批事件上把現有提示詞和候選提示詞並排跑一遍，人工比較，不憑頁面印象判斷。

## 1. 準備案例

```bash
node --env-file=.env scripts/eval-story-digests.ts --stories <事件id>,<事件id> --out .data/story-digest-cases.jsonl
```

事件 id 是事件頁地址 `/story/<id>` 裡的那一段。匯出只讀資料庫，不呼叫模型，不改動任何事件。報道按站點生成綜述時的同一套規則取，只是順帶提及的、綜合稿、撤下的和尚未公開的報道不算。已經有綜述的事件按“更正後重寫”組裝（不帶上一版綜述），還沒有綜述的按首次撰寫。找不到、已被合併或沒有可用報道的事件會直接報錯。

匯出的檔案每行一個事件，可以先審閱。想測有新報道時的增量更新，把 `inputMode` 改為 `incremental`，填上 `story.previousDigest` 和 `knownArticleIds`（上一版已包含的報道 id）。也可以手寫案例，格式見 `industry/story-digest-eval.example.jsonl`（虛構示例）。

## 2. 並排對比

```bash
node --env-file=.env scripts/eval-story-digests.ts --cases .data/story-digest-cases.jsonl --system my-candidate.md
```

- 每個案例用現有提示詞和候選提示詞各跑一次：同一個模型（預設是“事件綜述”這一步當前用的模型，`--models` 可指定），同一份輸入。發給模型的系統提示詞、輸入和取樣引數與站點生成綜述時完全相同。
- 候選檔案的寫法與 `industry/prompts/` 相同：`{{siteName}}` 換成站名，`{{> 檔名}}` 插入共用規則，缺值會報錯。候選與現有提示詞渲染後完全相同時拒絕執行。不傳 `--system` 時只跑現有提示詞。
- 開始前列印呼叫次數（案例數 × 模型數 × 提示詞數），超過 `--max-calls`（預設 18）一次都不發。每次呼叫和站點其他模型請求一樣記錄、計入預算；原樣重跑複用已收到的結果，不再付費，所以改一版候選再跑，現有提示詞那一半不花錢。

結果寫到 `.data/eval/`（`--out-dir` 可改），一份 JSON、一份 Markdown：兩邊的標題和綜述並排，附每次呼叫的 token 用量和記錄編號，失敗的呼叫寫明原因。

## 3. 人工看什麼

沒有可靠的自動分數，這個工具也不讓模型給模型打分。逐條看：

- 是否先講清核心變化和當前結論，而不是按日期複述下方的時間線；
- 有沒有空泛的宣傳腔和套話；
- 條件、適用物件、收費與額度、地域等限制是否仍綁在對應物件上；
- 有沒有報道和事實證據裡沒有的內容，有沒有評論報道本身（“報道未披露……”）或把寫作要求寫進正文；
- 更正後重寫時，失效的舊說法是否清掉了。

## 4. 改完提示詞之後

提示詞換版本本身不會重寫已有事件的綜述。一個事件只在它的報道變化時才重新生成，有新報道時以舊綜述為上一版增量改寫，所以新提示詞隨新報道逐步生效，不會一次性產生大量模型呼叫。

想讓某幾個事件立即用新提示詞重寫，在倉庫根目錄呼叫 `rewriteStoryDigest`（每個事件一次模型呼叫，記進後臺審計）：

```bash
node --env-file=.env --input-type=module -e '
const { rewriteStoryDigest } = await import("@aihot/backend/events/corrections");
const { sql } = await import("@aihot/backend/db");
const [s] = await sql`SELECT id FROM stories WHERE public_id = ${"<事件id>"}`;
if (!s) throw new Error("沒有這個事件 id");
console.log(await rewriteStoryDigest(s.id, "綜述提示詞已更新", "ops-script"));
await sql.end();'
```
