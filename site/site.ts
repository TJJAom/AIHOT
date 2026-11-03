// 站點身份和讀者看得到的文案。換成你的行業時，先改這個檔案。
// 網頁和後端都讀它；改完重新構建（docker compose up --build）即可生效。
// 域名不在這裡：部署時用環境變數 SITE_URL 設定。

import type { Founder } from "@aihot/contracts/site-config";

/**
 * 日報、週報、月報什麼時候出（台灣時間，HH:mm）：日報收這個時間之前的 24 小時，週報在每個自然周之後的週一出，
 * 月報在每月 1 日出。排程、成刊時間視窗、缺期告警和所有提到時間的文案都讀它（public/ 裡的檔案寫佔位
 * {{dailyTime}}、{{weeklyTime}}、{{monthlyTime}}）；排程每半小時檢查一次，所以寫整點或半點。
 */
export const EDITION_TIMES = { daily: "08:00", weekly: "10:00", monthly: "10:30" };

/** “每天 08:00”“每週一 10:00”“每月 1 日 10:30”：寫進句子裡的出刊時間。 */
export const EDITION_WHEN = {
  daily: `每天 ${EDITION_TIMES.daily}`,
  weekly: `每週一 ${EDITION_TIMES.weekly}`,
  monthly: `每月 1 日 ${EDITION_TIMES.monthly}`,
};

export const SITE = {
  /** 站名：導航、頁面標題、分享圖、RSS、MCP、後臺都用它。 */
  name: "日耕 AI 熱點",
  /**
   * 行業詞：拼進預設說法裡，比如“AI 日報”“AI 動態”。
   * 改成“法律”“HR”“黃金”之類，頁面上就會變成“法律日報”“法律動態”。
   */
  subject: "AI",
  /** 首頁的完整標題（瀏覽器標籤、搜尋結果）。 */
  homeTitle: "日耕 AI 熱點 — AI 產業動態 · 每日精選與日報",
  /** 主題目錄頁（/topics）的標題。 */
  topicsTitle: "AI 主題：公司與模型、技術方向、內容形態的最新動態",
  /** 回饋表單輸入框裡的示例。 */
  feedbackExample: "例如：我在搜尋某個關鍵詞時遇到……我原本想……",
  /** 回饋頁標題下面的一句話。 */
  feedbackLead: "發現 bug、想要的功能、看不順眼的地方，都可以告訴我們。",
  /** 回饋表單電子郵件框裡的提示。 */
  feedbackEmailHint: "留下電子郵件，我們可以回信聯絡你",
  /** 一句話介紹：搜尋引擎、分享卡片、RSS、llms.txt 會用。 */
  description: `從一批 AI 信源裡挑出值得看的動態，把同一件事的多篇報道歸到一起，${EDITION_WHEN.daily} 出一份日報。`,
  /** llms.txt 裡一句話介紹下面的一段詳細介紹（選填）。 */
  llmsIntro: null as string | null,
  /** 一行小字：分享圖、海報下方。 */
  tagline: "值得關注的 AI 動態",
  /** 搜尋引擎讀到的關鍵詞（首頁結構化資料）。 */
  keywords: ["AI 資訊", "AI 新聞", "AI 日報", "AI 行業動態"] as string[],
  /** 網站開始收錄的年份（結構化資料的時間範圍，選填）。 */
  since: null as string | null,
  /** 介面語言（HTML lang、og:locale）。 */
  locale: "zh-TW",
  /** 預設域名，只在沒設定 SITE_URL 時使用。 */
  defaultUrl: "https://aihot.dayacre.com",
  /** 標準圖示（favicon.ico、icon.png、icon-192.png、apple-icon.png、logo.svg）以外也放在網站根目錄的圖示，site/brand/ 裡的檔名（選填）；manifest.webmanifest 或外站引用了它們時用。 */
  rootIcons: [] as string[],
  /**
   * MCP 工具名的字首（小寫字母、數字、下劃線），工具會叫 dayacre_hot_get_latest、dayacre_hot_search……
   * 已經有人接入後就不要再改。
   */
  mcpPrefix: "dayacre_hot",
  /**
   * 公開介面（MCP、OpenAPI、llms.txt）的版本號，只升不降。
   * 改了介面裡已有的欄位或含義時升主版本，並在部署說明裡寫清。
   */
  interfaceVersion: "4.0.0",
  /** 對外聯絡電子郵件（選填）：llms.txt 和給 Agent 的使用說明裡會寫。 */
  contactEmail: null as string | null,
  /** 關於頁底部的一行小字（選填）。 */
  footerNote: "由 AIHOT 開源框架驅動",
  /** 中國大陸網站的 ICP 備案號（選填），填了就顯示在側欄底部和“我的”頁底部，並連結到工信部備案系統。 */
  icp: null as string | null,
  /** 中國大陸網站的公安備案資訊（選填），填了顯示在側欄底部和“我的”頁底部。 */
  psb: null as string | null,
  /** 原始碼的 GitHub 倉庫地址（選填），填了就在側欄底部和“我的”頁底部顯示“GitHub 開源”。 */
  github: "https://github.com/TJJAom/AIHOT" as string | null,
  /** 結構化資料裡的網站營運者（搜尋引擎用）。 */
  organization: {
    name: "日耕工作室",
    /** 創始人（選填）。 */
    founder: null as Founder | null,
  },
  /** 抓取信源時報上的名字和版本（User-Agent 裡用），不要冒用別的站。 */
  crawlerName: "DayacreHotBot/1.0",
} as const;

/** 使用規則和隱私說明兩頁（正文在 pages/ 裡）。 */
export const POLICY = {
  terms: {
    /** 頁面名：導航、頁尾、頁面標題都用它。 */
    name: "使用規則",
    description: "本站網頁、RSS、公開 API 與 MCP 的使用規則。",
    /** llms.txt 裡對這一頁的一句說明（選填）。 */
    covers: null as string | null,
    /** Agent 接入頁的 RSS、API 兩欄各自提醒的使用規則（選填）。 */
    notes: null as null | { rss: string; api: string },
    /**
     * 講清哪些用途要先取得授權的話（選填）：llms 接在 llms.txt“使用說明”的版權說明後面，
     * agent 寫在給 Agent 的使用說明“使用規則”一節的開頭。
     */
    license: null as null | { llms: string; agent: string },
    /**
     * 公開 API、RSS 和 OpenAPI 檔案宣告使用規則的響應頭（選填）：原樣附上，再加一個指向這一頁的
     * Link 頭（rel="terms-of-service"）；瀏覽器裡的呼叫方也讀得到它們。
     */
    headers: null as null | Record<string, string>,
  },
  privacy: {
    description: "本站如何處理瀏覽器本地資料、回饋資料與訪問日誌。",
    /** llms.txt 裡對這一頁的一句說明（選填）。 */
    covers: null as string | null,
  },
  /**
   * X 帖子本身的文字和圖片算不算全文：算的話，只在這篇允許站內全文時顯示（信源允許全文、正文也取到了）；
   * 不算的話總是顯示，和標題、摘要一樣。
   */
  xPostIsFullText: true,
} as const;

/** 導航（電腦側欄、手機底欄、“我的”頁）。 */
export const NAV = {
  /**
   * 不放進導航的引擎入口，目前只支援熱點榜（"/hot"）和主題（"/topics"）。頁面照樣能開啟；原來回到它的返回按鈕和連結改回精選，
   * 寫 "/hot" 時首頁也不放當前熱點。
   */
  hidden: [] as Array<"/hot" | "/topics">,
};

/** 條目卡片和詳情頁上的幾處說法和顯示。 */
export const ITEM_COPY = {
  /** 模型寫的那句理由叫什麼：卡片、詳情頁、Markdown 匯出、給 Agent 的回答和群推送都用它。 */
  reasonLabel: "推薦理由",
  /** 讀者在網頁和分享圖上看不看得到 AI 評分。只管顯示：公開 API 和 MCP 的資料照樣帶 score，後臺照常顯示。 */
  showScore: true,
};

/** 關於頁的一張二維碼卡片。 */
interface ContactCard {
  kind: string;
  title: string;
  note: string;
  /** 站外連結過的根目錄檔名（選填），比如 qr-wechat.jpg：這個地址總是跳到現在的二維碼。 */
  alias?: string;
}

/** 關於頁的文案。數字（信源數、收錄數、精選數、日報期數）來自站內實時統計，不用寫在這裡。 */
export const ABOUT = {
  kicker: `關於 ${SITE.name}`,
  /** 頁面描述（搜尋結果、分享卡片）。 */
  description: `關於 ${SITE.name}：${SITE.description}`,
  /** 大標題：第一行正常顏色，第二行強調色。 */
  headline: ["AI 圈每天都有新動靜，", "值得看的，只有幾條。"] as [string, string],
  /** 標題下面的一段話。{sources} 會換成實時的信源數（兩邊自動加空格，所以 {sources} 兩邊不寫空格）；統計沒取到時換成 sourcesFallback。 */
  lead: `${SITE.name} 替你盯著{sources}個信源：抓取、歸併、打分、精選，${EDITION_WHEN.daily} 出一份日報。免費，不用註冊。`,
  sourcesFallback: "十幾",
  /** 信源河動畫下面的四個環節。 */
  steps: {
    collect: "官方部落格、媒體和個人的訂閱源都在看；更新越勤的源看得越勤，最快 15 分鐘看一次。",
    store: "抓到的都存下來，同一件事的報道歸到一起，熱點榜就是從這裡算出來的。",
    select: `模型先看是不是這個行業的事、有沒有實際資訊，再寫中文標題、摘要和${ITEM_COPY.reasonLabel}；營銷稿和重複轉發進不來。`,
    publish: `${EDITION_WHEN.daily} 出日報，${EDITION_WHEN.weekly} 出週報，${EDITION_WHEN.monthly} 出月報。`,
  },
  /**
   * 作者塊（選填），null 就不顯示。
   * avatarSourceId：一個 X 賬號信源的 id，頭像取它的（選填）。
   * 二維碼在後臺“設定”裡上傳，或者放進 site/brand/contact/；沒有二維碼就不顯示那張卡片。
   */
  maker: null as null | {
    name: string;
    avatarSourceId?: string | null;
    greeting: string[];
    wechat?: ContactCard;
    feishu?: ContactCard;
  },
  /** 頁面底部的版權與下架說明，中間接“回饋頁”的連結。 */
  copyright: [`${SITE.name} 是聚合摘要和閱讀索引，原文版權歸各來源所有。如果你是來源方，希望更正、下架或調整展示方式，可以透過`, "聯絡我們。"] as [string, string],
  /** 頁面底部“使用規則”連結的錨點 id（選填）：外部文件寫死過這個錨點就填上，以後不要改。 */
  termsAnchor: null as string | null,
} as const;

/** 後臺頁面上給管理員的提示（選填）。 */
export const ADMIN = {
  /** “回饋”頁標題下的一行。 */
  feedbackNote: null as string | null,
  /** 確認框裡補的一句本站規定：封禁回饋來源時。 */
  banNote: null as string | null,
  /** 確認框裡補的一句本站規定：調整付費服務的請求上限時。 */
  budgetNote: null as string | null,
};

/** Agent 接入頁的示例。 */
export const AGENT = {
  /** MCP 工具表裡“搜尋”一行：能搜什麼、可以怎麼問。 */
  search: { scope: "按公司、產品、人物或話題搜最近 7 天", ask: "這家公司最近發了什麼？" },
};

/** 日報、週報、月報版面上的說法。 */
export const REPORTS = {
  /** 報頭下面的出版者一行。 */
  imprint: SITE.name.toUpperCase(),
  /** 報頭旁邊的一個詞。 */
  motto: SITE.subject as string,
  /** 每種報告頁面的描述（搜尋結果、分享卡片），不帶句號；llms.txt 介紹週報、月報時也用它。 */
  descriptions: {
    daily: `${SITE.name} ${subjectAfter(`${EDITION_WHEN.daily}（台灣時間）釋出的`, "行業精編日報")}`,
    weekly: subjectAfter("每週", "行業綜合回顧"),
    monthly: subjectAfter("每月", "行業盤點"),
  },
  /**
   * 一期裡的一條怎麼稱呼（“4 件大事”）：沒有頭條時的標題（“這一天的 4 件 AI 大事”）、報頭和往期目錄的條數、
   * 週報月報沒有總述時的那句話，以及訂閱說明裡的“按欄目分好的大事”都用它。
   */
  entry: { measure: "件", noun: "大事" },
  /** 報頭上其餘幾個數字後面的說法；精選數和日報期數在關於頁、主題頁也這樣寫。 */
  metricUnits: { sourcesCount: "個來源", firstPartyEvents: "件一手釋出", selectedCount: "條精選", reportsCovered: "期日報" },
  /** 報告分享圖上“共幾條”的說法。 */
  shareUnit: "件大事",
  /** 日報時段內有資料經過評判、但沒有新大事時的標題與導語。 */
  quiet: { title: "今日安靜，無大事發生", paragraph: `${subjectAfter("台灣時間 {start} 至 {end}，沒有新的", "大事")}。` },
};

/** 運維告警（只發給站長）裡隨部署而變的幾處說法。 */
export const ALERTS = {
  /** 多少分鐘沒有收錄新文章就告警“網站停止收錄新內容”（最多一天）；環境變數 ALERT_QUIET_MINUTES 優先。 */
  quietMinutes: 360,
  /** 編輯信源一直抓取成功、只是沒有新文章時，多少分鐘才告警（最多一天）。 */
  quietWhileFetchingMinutes: 720,
  /** 同一條告警裡，“沒有”後面補一句平時的收錄量；null 就不寫。 */
  usualFlow: null as string | null,
  /** worker 停了的告警裡，怎麼看它的日誌。 */
  workerLogs: "看 worker 的日誌（docker compose logs worker）",
};

/** 後臺新建信源時的預設設定。 */
export const SOURCE_DEFAULTS = {
  /** 站內展示全文；false 時只顯示摘要和原文連結。 */
  siteFulltext: false,
};

/**
 * 社群站的信源（填信源 id）：算熱度時按發帖的賬號計，一個賬號算一個獨立來源，而不是整個信源只算一個。
 * dev 是 dev.to 的文章流，hn 是 Hacker News 的帖子流。
 */
export const COMMUNITY_FEEDS: { dev: string[]; hn: string[] } = {
  dev: [],
  hn: [],
};

/** 各頁分享圖（/og/pages/*.png）上的文字。主題目錄頁的那張按主題數自動生成。 */
export const CARDS: Record<string, { kicker: string; title: string; subtitle: string; accent?: "hot" | "amber" }> = {
  site: { kicker: subjectAfter("每日", "精選"), title: SITE.tagline, subtitle: SITE.description },
  all: { kicker: subjectAfter("全部", "動態"), title: "所有信源的最新動態，一站看完", subtitle: "按時間彙總各信源的最新動態，可按類別與標籤篩選。" },
  hot: { kicker: "熱點榜", title: "過去 48 小時，大家在討論什麼", subtitle: "熱度指數、趨勢與組成熱度的公開來源。", accent: "hot" },
  daily: { kicker: withSubject("日報"), title: subjectAfter(`每天 ${spokenTime(EDITION_TIMES.daily)}，一份讀得完的`, "日報"), subtitle: `${subjectAfter("前一天值得關注的", "動態")}。` },
  weekly: { kicker: withSubject("週報"), title: `一週${REPORTS.entry.noun}，一次看清`, subtitle: "本週的主線、重要釋出與值得回看的討論。" },
  monthly: { kicker: withSubject("月報"), title: "一個月的變化", subtitle: "月度主線與關鍵事件回顧。" },
  about: { kicker: "關於", title: `關於 ${SITE.name}`, subtitle: SITE.description },
  terms: { kicker: "使用規則", title: `${SITE.name} 使用規則`, subtitle: "網頁、API、RSS 與 MCP 的使用範圍。" },
  privacy: { kicker: "隱私說明", title: `${SITE.name} 隱私說明`, subtitle: "訪問日誌、瀏覽器本地資料與回饋資料的處理方式。" },
  changelog: { kicker: "更新日誌", title: `${SITE.name} 更新日誌`, subtitle: "功能更新、最佳化、公告與下線記錄。" },
  feedback: { kicker: "回饋", title: "告訴我們哪裡可以更好", subtitle: "內容、功能、接入，或來源方的更正與下架請求。" },
  agent: { kicker: "Agent 接入", title: `把 ${SITE.name} 接進你的 Agent`, subtitle: "MCP、RSS、API 三種方式，匿名只讀，無需 API Key。" },
};

/** 公開介面的訪問約定裡隨部署而變的幾處：給 Agent 的使用說明、llms.txt 會寫。 */
export const ACCESS = {
  /** 同一 IP 每分鐘大約能請求多少次，超過會收到 429 並帶 Retry-After（選填，由部署的反向代理限流）；null 表示不限流，說明裡不提。 */
  ratePerMinute: null as number | null,
  /** 請寫程式同步資料的人報上的 User-Agent（選填），寫在 JSON 介面的說明後面。 */
  userAgent: null as string | null,
};

/** 這個部署自己的幾處安排（選填）。 */
export const DEPLOYMENT = {
  /** 憑據分組檔案（models.env、collectors.env……）預設放在哪個目錄，相對倉庫根目錄；環境變數 AIHOT_CREDENTIALS_DIR 優先，都沒有就只讀環境變數。 */
  credentialsDir: null as string | null,
  /** 憑據分組的檔名（放在憑據目錄下，選填）：沒寫的分組用“分組名.env”，比如 models.env。 */
  credentialFiles: {} as Partial<Record<string, string>>,
  /** 這個部署額外要求的憑據（[分組, 環境變數名]）；生產 API 啟動時檢查，預設沒有額外要求。 */
  requiredSecrets: [] as const,
  /** 線上 api 收到的 Host（CDN 回源用的域名，選填）；本地開發時，網頁開發伺服器轉給 api 的請求也換成它，和線上一致。 */
  originHost: null as string | null,
  /** 反向代理把沒登入的後臺訪問轉去登入時，用哪個請求頭帶上原來的地址（選填，登入後回到那裡）。 */
  loginReturnHeader: null as string | null,
  /**
   * 圖片代理從原站取圖的流量上限：超過後沒快取的圖先返回 503，等這一分鐘或這一天過去，當天額度用完會進營運日報；
   * null 就不設上限。環境變數 IMGPROXY_UPSTREAM_MB_PER_MINUTE、IMGPROXY_UPSTREAM_GB_PER_DAY 優先。
   */
  imageUpstreamBudget: null as null | { mbPerMinute: number; gbPerDay: number },
  /**
   * 已實測應由伺服器直接連線、不走出網代理（EGRESS_PROXY_URL）的域名，採集和圖片共用（選填）。
   * 每次重定向重新按目標域名選路，直連仍檢查實際連線地址。
   */
  directFetchHosts: [] as string[],
  /**
   * 精選評測（scripts/eval-selection.ts）不帶引數時用的金標集：檔案（相對倉庫根目錄）、抽樣條數、只抽哪一份、門檻掃描範圍。
   * null 就用 .data/gold.jsonl 的全部樣本（最多 200 條），在 40–90 之間掃描。
   */
  selectionGold: null as null | { file: string; sample: number; split: string; sweep: [number, number] },
};

/** RSS 訂閱源的說明裡隨站點而變的說法。 */
export const FEED_COPY = {
  /** “全部動態”源的說明裡，除了未審內容、低相關條目、低分條目和已合併重複條目，還寫明不含的內容（選填）。 */
  allLeavesOut: [] as string[],
};

/**
 * 公開介面（API、RSS、MCP）裡和網頁不同的類別（選填）。上線後不要改：介面引數和訂閱地址裡有類別的 key。
 * merge：並進另一類釋出的類別，key 是行業包裡的類別，值是它並進的類別（公開介面比網頁少一類時用）；
 * feedLabels：分類 RSS 標題裡的名字，替換行業包裡的 feedLabel（並進了別的類別時，名字常常也要跟著改）。
 */
export const PUBLIC_CATEGORIES = {
  merge: {},
  feedLabels: {},
} as const;

/** “AI 日報”這類說法：行業詞和名詞之間，英文詞加空格，中文詞不加。 */
export function withSubject(noun: string): string {
  return /[A-Za-z0-9]$/.test(SITE.subject) ? `${SITE.subject} ${noun}` : `${SITE.subject}${noun}`;
}

/** “按主題看 AI”“往期 AI 日報”這類說法：行業詞接在中文後面，英文詞前加空格，中文詞不加；noun 照 withSubject 接上。 */
export function subjectAfter(text: string, noun?: string): string {
  const gap = /^[A-Za-z0-9]/.test(SITE.subject) ? " " : "";
  return `${text}${gap}${noun ? withSubject(noun) : SITE.subject}`;
}

/** “8 點”“10 點 30 分”：口語裡的 HH:mm。 */
function spokenTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return `${hour} 點${minute ? ` ${minute} 分` : ""}`;
}
