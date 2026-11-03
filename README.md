<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.png">
    <img src="docs/assets/banner-light.png" alt="AIHOT：每個行業，都可以有自己的 AIHOT。很多條信源流進中間的精選，再分給法律、人力資源、金融等各個行業" width="100%">
  </picture>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-176b75?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/PostgreSQL-17-176b75?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
  <a href="https://aihot.news"><img src="https://img.shields.io/badge/%E7%BA%BF%E4%B8%8A%E5%8E%9F%E7%AB%99-aihot.news-202a30?style=flat-square" alt="線上原站 aihot.news"></a>
</p>

<p align="center">
  <b>一個自己找熱點、自己寫日報的網站框架。</b><br>
  把信源換成你的，把精選標準換成你的 KnowHow，它就是你的行業熱點站。
</p>

<p align="center">
  <b>簡體中文</b> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="#跑起來">跑起來</a> ·
  <a href="docs/customize.md">改成你的行業</a> ·
  <a href="#它是怎麼工作的">它是怎麼工作的</a> ·
  <a href="#文件">文件</a> ·
  <a href="https://github.com/KKKKhazix/AIHOT/discussions">社群交流</a>
</p>

<br>

## 這是什麼

[AIHOT](https://aihot.news) 是我做的一個 AI 熱點網站。它每天從一批信源裡收資料，用大模型先篩一遍、再獨立打兩次分，挑出真正值得看的，寫成中文標題和摘要；把不同來源說的同一件事聚成一個事件，按有多少人在說排出熱點；每天早上出一份日報。

這個倉庫是它的引擎和框架：網站、後臺、精選流程、聚簇和熱度演算法，**所有提示詞的原文和入選門檻**，都在這裡。

## 為什麼開源

這半年，很多做法律、做 HR、做金融、做貴金屬的朋友問我，能不能也給他們的行業做一個。

我做不了。我不懂你們的行業，不知道哪些信源有用，也不知道什麼樣的訊息，對你們來說才叫熱點。

但你們懂。

既然我沒辦法滿足所有人，那就把火種交到大家自己手上。

## 說在前面

- **我不是專業的開發者。** 我是設計師出身，半年前還看不太懂程式碼。這套程式碼是我和 AI 一起重寫的，比以前乾淨了很多，但一定還有寫得不好的地方。發現問題歡迎提 Issue，我不一定能很快回復，先說聲抱歉。
- **這是 AIHOT 的引擎。** 它和 AIHOT 線上跑的是同一份引擎程式碼，同步時直接從線上匯出，不是精心打磨的通用框架。以後 AIHOT 的更新，我會盡量同步過來，但沒法保證每一次都同步。模型榜、Codex 重置監控、主題頁的大事記這些只對 AI 行業有意義的功能，可安裝的 Agent Skill 檔案，以及 AIHOT 自己的營運工具，只留在 AIHOT 上；開源版給 Agent 的入口是 MCP 和站點上的 `/agent` 頁面。
- **裡面沒有 AIHOT 的信源名單和營運資料。** 倉庫帶了 18 個公開的海外 AI 資訊源做示範，夠你跑起來看效果；真正的信源，要換成你自己行業的。
- **請不要用 AIHOT 的名字和 Logo。** 換上你自己的名字，它就是你的站。

## 它是怎麼工作的

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-dark.png">
  <img src="docs/assets/how-light.png" alt="六步：採集、預篩、兩次評分、寫作、聚簇、熱點與成刊" width="100%">
</picture>

一條資料從信源進來，先判重，再預篩；可能重要的獨立打兩次分，寫好中文標題和摘要，和別的報道聚成事件，算進熱度。X 帖子沒有正文或只有連結時，保留原帖的連結和圖片，不呼叫寫作或翻譯模型。分數過了門檻、又不是精選裡已有新聞的重複，才進精選；日報按規則編出當天要聞，週報、月報再從日報裡彙編。每一步的提示詞都在 [`industry/prompts/`](industry/prompts/)，改標準不用改程式碼。詳見 [精選與校準](docs/selection.md)。

### 聚簇與熱點

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/cluster-dark.png">
  <img src="docs/assets/cluster-light.png" alt="五個來源的報道聚成一個事件，事件進入當前熱點榜" width="100%">
</picture>

同一件事，官網發一篇、媒體轉十篇、X 上吵一天，讀者只需要看到一次。AIHOT 把它們聚成一個**事件**：先用標題摘要的向量（沒配向量服務時比文字重合度）在最近兩週裡找候選，再讓模型判斷是同一件事、後續進展，還是兩件事；拿不準的合併，寫入前再讓模型複核一遍（複核可以單獨換一家模型，設 `GROUP_REVIEW_MODEL`）。

**熱度**按事件算，不按文章算：48 小時內，每個獨立來源只算一次，24 小時減半。重複抓取不會多算，一家媒體發十篇也只算一次，所以排在前面的，是真正有很多人在說的事。

### 速度

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/perf-dark.png">
  <img src="docs/assets/perf-light.png" alt="AIHOT 線上實測：頁面中位數 10 毫秒，95% 在 50 毫秒內；介面中位數 6 毫秒，95% 在 12 毫秒內；文章頁 95% 在 14 毫秒內" width="100%">
</picture>

## 你會得到什麼

| | |
|---|---|
| **六種信源** | RSS、網頁列表、JSON 介面、X 賬號、微信公眾號，以及你自己指令碼推送進來的內容。信源分三級（官方一手、官方賬號與準官方、媒體與個人），各級入選門檻不同；抓取頻率按產出自動調整 |
| **精選** | 預篩，同一份評分標準獨立打兩次分，再按信源分級的門檻決定入選；同一條新聞只佔一條，換個說法的重複不進。提示詞和門檻全部公開，全部可以改；用你自己標註的樣本在 SelectBench 裡校準 |
| **寫作** | 中文標題、答案先行的摘要、推薦理由，外文全文翻譯；分類、標籤和新聞事實單獨抽取；防止模型把原文沒提到的公司寫進標題 |
| **聚簇** | 不同來源報道的同一件事聚成一個事件，後續進展掛在同一個事件下，事件頁有綜述；進展和報道時間線可一起切換“最新在前”或“最早在前”；人工改過的歸屬不會被覆蓋 |
| **熱點** | 按事件算熱度：獨立來源越多越靠前，X 上的討論也算進來；和 6 小時前比，漲得快的標上升，新出現的標“新” |
| **日報、週報、月報** | 每天出日報（預設 08:00），按規則編出當天要聞：一件事一條，報過的事只在有新進展時跟進，不調模型。每週一出週報、每月 1 日出月報（預設 10:00、10:30），從日報裡彙編，模型只寫總述和欄目導讀。幾點出刊在 `site/site.ts` 的 `EDITION_TIMES` 裡改 |
| **主題與搜尋** | 公司、方向、內容形態三類主題頁；標題摘要搜尋和全文相關搜尋 |
| **閱讀設定** | 深淺色外觀、網站預設字型或瀏覽器預設字型；收藏和閱讀設定只儲存在本機，可以匯出、匯入備份 |
| **給 Agent 用** | RSS（精選、全部、全文、日報、週報、月報）、公開 API、MCP、Agent Markdown、`llms.txt`，同一份內容給人看也給 Agent 用 |
| **後臺** | 信源管理與試抓、內容診斷與人工評分更正、精選評測、每一步單獨換模型、付費服務的預算熔斷、執行記錄與告警 |

## 看一眼

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/shots-dark.png">
  <img src="docs/assets/shots-light.png" alt="首頁的每日精選，關於頁的信源河" width="100%">
</picture>

<p align="center"><sub>截圖來自用示範信源跑起來的本地站，站名是預設的 MyHOT。</sub></p>

## 跑起來

想建立自己的獨立站點，可以先點 [Use this template](https://github.com/KKKKhazix/AIHOT/generate)，再克隆你生成的倉庫。想持續合併上游更新或貢獻程式碼，建議先 Fork。下面的命令適合直接試用。

需要 [Docker](https://docs.docker.com/get-started/get-docker/)、[Node.js 24](https://nodejs.org/en/download)（執行 `init-env` 生成配置要用），和一個 OpenAI 相容的模型 API Key（DeepSeek、千問、智譜都可以）。

`init-env` 預設按 DeepSeek 配置。用千問、智譜等別家，照 `.env.example` 裡的例子改 `.env` 的 `LLM_BASE_URL`、`LLM_MODEL` 和 `LLM_EXTRA_JSON`；用推理模型（先想再答）時，還要設 `LLM_REASONING_TOKENS` 給推理留出輸出額度。

```bash
git clone https://github.com/KKKKhazix/AIHOT.git myhot
cd myhot
node scripts/init-env.ts --llm-key <你的模型 API Key>
docker compose up -d --build
```

開啟 <http://localhost:3000>。後臺在 `/admin`，管理員密碼在 `.env` 的 `ADMIN_PASSWORD` 裡。一兩分鐘後開始有內容，第一次匯入的資料大約半小時處理完。

機器上沒有 Node、伺服器在中國大陸、要配域名和 HTTPS，或者不用 Docker、直接在 Linux、macOS 上跑（Windows 用 WSL2），見 [部署](docs/deploy.md)。

站點跑起來後，開啟 `/agent` 可以複製 MCP、RSS 或 API 的接入方式；只能讀網頁的 Agent 從 `/api/v1/agent` 開始；介面說明在 `/openapi-v1.json`。

## 把它改成你的行業

最省事的辦法：開啟你的 Agent（Claude Code、Codex 都可以），把這個倉庫交給它，然後說：

```text
請讀 AGENTS.md 和 docs/customize.md，把這個站改成「XX 行業」的熱點站。
我關心的是：……（寫你想盯的信源、你覺得什麼訊息重要、什麼不重要，越具體越好）。
改完幫我跑 npm run typecheck、npm test 和 node scripts/smoke.ts，並告訴我還需要我自己決定哪些事。
```

要改的東西幾乎都在 [`site/`](site/) 和 [`industry/`](industry/) 這兩個資料夾裡，程式碼基本不用動：

| 檔案 | 改什麼 |
|---|---|
| `site/site.ts` | 站名、行業詞、出刊時間、首頁文案、關於頁、條目與日報週報月報上的說法、公開介面的分類 |
| `industry/taxonomy.ts`、`industry/topics.json` | 分類、標籤、主題 |
| `industry/sources.json` | 首次啟動時匯入的信源 |
| `industry/prompts/` | 精選標準和寫作要求。**你的行業 KnowHow，就寫在這裡** |
| `industry/selection.ts` | 入選門檻 |
| `site/models.ts` | 每一步預設用哪個模型（不改也行：都用 `.env` 裡配的那一個） |
| `site/brand/`、`site/pages/`、`site/public/`、`site/changelog.json` | 圖示與 Logo，使用規則和隱私說明，`robots.txt` 這類釋出在網站根目錄的檔案，更新日誌 |
| `modules/` | 框架裡沒有、只有你的站要的功能，做成模組放在這裡，見 [架構](docs/architecture.md#模組) 的“模組” |

最值得花時間的是評分標準（`industry/prompts/selection-score.md`）和門檻：拿一兩百條你自己標註過的資料，用 `scripts/eval-selection.ts` 跑一遍，看它選得準不準，再回去改。怎麼做寫在 [精選與校準](docs/selection.md) 裡。

## 文件

| 文件 | 內容 |
|---|---|
| [把它改成你的行業](docs/customize.md) | 站名、分類、主題、信源、提示詞、門檻、模型、品牌，一步一步來 |
| [信源](docs/sources.md) | 六種信源怎麼配，分級和全文，抓取頻率，舊文和存檔，固定起點 `publishedAfter`，外部推送介面 |
| [精選與校準](docs/selection.md) | 一條資料怎麼變成精選、怎麼編進日報週報月報，怎麼用自己的樣本校準 |
| [事件歸組與關係評測](docs/grouping.md) | 事件關係怎麼判斷，怎麼用自己標註的成對樣本評測 |
| [綜述評測](docs/story-digest-evaluation.md) | 改事件綜述提示詞前，怎麼在同一批事件上並排比較 |
| [部署](docs/deploy.md) | Docker、域名和 HTTPS、中國大陸、更新、備份、花多少錢，不用 Docker 時在 Linux、macOS（Windows 用 WSL2）上怎麼跑 |
| [架構](docs/architecture.md) | 三個程序、幾條不變的規則、目錄、模組、資料庫遷移、對外出口、測試 |

技術棧：Node.js 24 · TypeScript · React Router（服務端渲染）· Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose。

## 交流與貢獻

部署和使用問題到 [問答區](https://github.com/KKKKhazix/AIHOT/discussions/categories/q-a)，新想法到 [想法交流區](https://github.com/KKKKhazix/AIHOT/discussions/categories/ideas)，歡迎在 [作品展示區](https://github.com/KKKKhazix/AIHOT/discussions/categories/show-and-tell) 分享你做出的行業熱點站。

發現 Bug 或有明確的功能建議，可以 [提交 Issue](https://github.com/KKKKhazix/AIHOT/issues/new/choose)。準備改程式碼前，先看 [貢獻說明](CONTRIBUTING.md)；安全漏洞請走 [私密報告入口](SECURITY.md)。

## 最後

AIHOT 曾經只是我無數個深夜裡，一個很小、很小的念頭。

我不知道它會被改成什麼樣子，會走到多遠的地方。但這可能就是開源最浪漫的地方。

剩下的路，就交給你們了。

<p align="right">—— 數字生命卡茲克</p>

## 許可

程式碼使用 [MIT 許可證](LICENSE)。AIHOT 的名字和 Logo 不在許可範圍內。字型有自己的許可，見 [NOTICE](NOTICE)。
