# 事件歸組與關係評測

站點先用標題和摘要召回最近兩週的候選事實（配了向量服務時比向量，沒配時比文字重合度），再讓模型判斷報道之間的關係，同時判斷這篇報道相對精選裡已有的內容有沒有新資訊（分數夠了的報道要靠這一條才進精選，見 [精選與校準](selection.md)）。關係定義和站點實際使用的提示詞在 `industry/prompts/group-*.md`，程式碼入口在 `packages/backend/src/events/relate.ts` 和 `group.ts`。

四種關係是：

- `SAME_OCCURRENCE`：同一次真實發生，例如同一發布的官方原文和媒體報道。
- `SAME_STORY`：不是同一次發生，但屬於同一具體事件的直接進展，例如釋出後的上架、評測或回應。
- `UNRELATED`：不同的事，即使主體、產品或話題相同。
- `ROUNDUP`：其中一方是包含多個話題的彙總。

## 用自己的標註樣本評測兩兩關係判斷

`scripts/eval-relations.ts` 只評測模型對兩篇報道之間關係的判斷。它直接複用站點歸組時用的 `PAIR_SYSTEM`、`pairUser()`、`PairSchema` 和提示詞版本，因此提示詞變了，評測也跟著變。它不重新跑候選召回，也不把結果寫回事件歸組。

把自己的標註資料放在 `.data/` 下（該目錄不會提交到 Git）。`industry/relation-gold.example.jsonl` 給了四條虛構示例。每行一條：

```json
{"caseId":"release-001","a":{"title":"...","source":"...","firstParty":true,"publishedAt":"2026-09-01T09:00:00+08:00","summary":"..."},"b":{"title":"...","source":"...","firstParty":false,"publishedAt":"2026-09-01T09:20:00+08:00","summary":"..."},"samplingContext":{"benchmarkSplit":"development","samplingStratum":"same-release"},"gold":{"relation":"SAME_OCCURRENCE"}}
```

`a`、`b` 也可以帶和站點內部 `ReportView` 一致的可選 `frame`：

```json
{"subject":"Acme","action":"釋出","object":"Acme-2","occurredAt":"2026-09-01"}
```

建議把容易混淆的邊界樣本放進開發集，再留一部分 `benchmarkSplit: "holdout"` 最後檢查。`samplingStratum` 是可選的分組標籤，用來看錯在哪一類，不影響模型輸入。

### 執行

先按正常部署方式配置資料庫和模型，再執行：

```bash
node --env-file=.env scripts/eval-relations.ts \
  --gold .data/relation-gold.jsonl \
  --split development
```

預設使用“歸組複核”這一步當前的模型：後臺“模型與評測”頁切換過的優先，其次是環境變數 `GROUP_REVIEW_MODEL`，再其次是 `site/models.ts` 的 `DEFAULTS.groupReview`，都沒有就用預設模型。也可以顯式比較多個已配置的模型：

```bash
node --env-file=.env scripts/eval-relations.ts \
  --gold .data/relation-gold.jsonl \
  --models default,deepseek-flash \
  --split development \
  --n 200 \
  --seed 7 \
  --thresholds 0.75,0.8
```

可用引數：

| 引數 | 預設值 | 說明 |
|---|---:|---|
| `--gold` | `.data/relation-gold.jsonl` | 標註樣本檔案（JSONL） |
| `--models` | “歸組複核”當前的模型 | 逗號分隔的模型名 |
| `--split` | `all` | `development`、`holdout` 或自己定的分組 |
| `--n` | `200` | 最多評測多少條 |
| `--seed` | `7` | 抽樣用的隨機種子，種子相同，每次抽到的樣本相同 |
| `--concurrency` | `6` | 同時發出的模型請求數 |
| `--thresholds` | production 的 `STORY_REVIEW_MIN_CONFIDENCE,TIE_MIN_CONFIDENCE` | 判斷兩篇報道“連進同一事件”時用的置信度門檻；顯式傳參會覆蓋預設值 |

完整報告寫到 `.data/eval/relations-*.json`。每個模型會得到：

- 4 × 4 的對照表：每種標註關係被模型判成了哪種關係；
- 每種關係的查準率、查全率、F1 和樣本數（只統計成功得到結構化判斷的樣本）；
- `coverage`：成功得到結構化判斷的樣本佔全部金標樣本的比例；
- `accuracy` 與四類 macro-F1：只衡量成功得到結構化判斷後的判斷質量；`completeAccuracy` 則用全部金標樣本作分母，把呼叫失敗或回答不合格式也算作沒有正確完成；
- 把 `SAME_OCCURRENCE`、`SAME_STORY` 都算作“連進同一事件”時，各個置信度門檻下的查準率、查全率和 F1，同時給出同一批樣本的 `coverage` 與 `completeAccuracy`；
- 呼叫出錯的條數、token 用量、每次請求的平均耗時和整次評測的總耗時；
- 每條樣本的判斷、置信度、模型寫的差別說明（`difference`）和回執編號。

模型呼叫照常經過回執和預算熔斷。相同模型、提示詞和輸入的重複評測會複用已有回執；同一次執行中輸入相同的樣本共享一次請求結果，各自按自己的標註計分，失敗也共享，不在這次執行裡重複請求。報告裡的 `reused` 包括共享的成功或失敗結果，以及複用的已有成功回執。評測的回執用單獨的用途 `eval_relation_pair`，不計入站點歸組那幾步在後臺的統計。

token 用量和平均耗時按報告引用的回執對應的全部請求嘗試彙總，包括之前解析失敗的響應；同一張回執不會因為多條樣本重複計算。用已有結果重跑時仍顯示這些歷史用量，不代表這次新增的費用。

CI 檢查 JSONL 解析、固定種子的抽樣、各項指標，以及本地假模型服務下的併發複用和重試用量統計，不訪問外部模型服務。
