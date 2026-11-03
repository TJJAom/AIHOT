// The judging and writing steps (editorial/analyze.ts): the prefilter decides relevance, two scores
// against the source's threshold (its tier's, raised by its class) decide 精選, selected and near-selected items are written by the content
// understanding and the rest by the title/summary translation, a structure step gives the category,
// subjects and fact. Material with only a feed summary has its page fetched first.
import { pointModels, Reply, stub, tag } from "./setup.ts";
import { analysisStep, type AnalysisStep } from "./analysis-steps.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { analyzeArticle, buildMaterial, loadAnalyzeInput, normalizeStructure, selectionThreshold, StructureSchema, UNDERSTAND_FLOOR } from "@aihot/backend/editorial/analyze";
import { createSource, updateSource } from "@aihot/backend/admin/sources";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { QUEUES, stopBoss } from "@aihot/backend/jobs/queue";
import { finalizeCopy, MAX_BODY_CHARS, parseTranslateOutput, stripEcho } from "@aihot/backend/editorial/writing";
import { READER_WORDING } from "@aihot/industry/wording";
import { SELECTION } from "@aihot/industry/selection";
import { ITEM_TYPES } from "@aihot/industry/taxonomy";
import { normalizeTags } from "@aihot/backend/editorial/vocabulary";
import { promptText } from "@aihot/backend/editorial/prompts";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadItemDetail } from "@aihot/backend/publication/detail";

test("Simplified model tags become the site's Traditional tags without losing classification", () => {
  assert.deepEqual(normalizeTags(["模型发布", "视频", "数据/训练"]), ["模型釋出", "影片", "資料/訓練"]);
});

test("the rendered translation prompt requests Taiwan Traditional Chinese while preserving evidence", () => {
  const prompt = promptText("translate-post");
  assert.match(prompt, /台灣繁體中文/);
  assert.match(prompt, /逐字引用的原文證據維持原樣/);
  assert.doesNotMatch(prompt, /翻譯成簡體中文/);
});

test("echoed prompt lines are removed in both Chinese scripts", () => {
  for (const line of ["來源：官方", "来源：官方", "【已核驗身份上下文】", "【已核验身份上下文】", "這些事實只用於防止張冠李戴", "这些事实只用于防止张冠李戴", "原始標題：測試", "原始标题：测试", "【時間錨點】", "【时间锚点】"]) {
    assert.equal(stripEcho(`保留的摘要。\n${line}`), "保留的摘要。", line);
  }
});

const T = tag();
const SOURCE = `test-analyze-${T}`;
const X_SOURCE = `test-analyze-x-${T}`;
const CLASSED_SOURCE = `test-analyze-classed-${T}`;

interface Req { step: AnalysisStep; marker: string; user: string }
const requests: Req[] = [];
const MARKERS = ["CLEAR", "RESCUE", "LOW", "OFFTOPIC", "BARE", "VAGUE", "THIN", "SENSITIVE", "推文", "WORDY", "REFUSAL", "RENUMBER", "UNMENDED", "ECOSYS", "FULLCOPY", "SHORTROUTE"];
const COMPLETE_SUMMARY = "Import AI 479 介紹 Realtime-Bench 的測試結果：在即時互動任務中，GPT-6 Astra（high）於 wall clock 條件下的通過率最高，為 36%。基準包含 50 項遊戲與網頁任務，並以 wall clock、paused clock 和 token clock 三種條件測試模型。本文也介紹 Google DeepMind 的 Genie 4 研究預覽，以及 Metis 提出的神經與符號推理架構研究方向。";
// The scores sit a few points around the pack's T1 threshold and understand floor, so each case means
// the same after a site recalibrates them: selected when the two add up to 2 × T1, written like a
// selected item when they add up to more than 2 × FLOOR, translated otherwise.
const T1 = selectionThreshold({ tier: "T1" })!;
const T2 = selectionThreshold({ tier: "T2" })!;
const FLOOR = UNDERSTAND_FLOOR;
// A pack class whose floor lies between the official and the media threshold: it raises the first, not the second.
const [CLASS, CLASS_FLOOR] = Object.entries(SELECTION.classes).map(([key, c]) => [key, c.threshold] as const).find(([, t]) => t > T1 && t < T2) ?? [undefined, NaN];
const scoreAnswers: Record<string, number[]> = {
  CLEAR: [T1 + 3, T1 - 1], RESCUE: [FLOOR + 1, FLOOR], LOW: [FLOOR, FLOOR - 1], THIN: [T1, T1], SENSITIVE: [T1, T1], 推文: [FLOOR, FLOOR],
  BARE: [FLOOR - 2, FLOOR - 4], VAGUE: [T1, T1 + 2], WORDY: [T1, T1], REFUSAL: [T1, T1], RENUMBER: [T1, T1], UNMENDED: [T1, T1],
  ECOSYS: [CLASS_FLOOR, CLASS_FLOOR - 1],
  FULLCOPY: [T1, T1], SHORTROUTE: [FLOOR, FLOOR - 1],
};

const WORDY = ["WORDY", "REFUSAL", "RENUMBER", "UNMENDED"];

// One stub stands in for DashScope (prefilter, structure), Zhipu (score, understand) and DeepSeek (summarize).
const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body) as { messages: Array<{ role: string; content: unknown }> };
  const last = body.messages[body.messages.length - 1]!.content;
  const user = typeof last === "string" ? last : JSON.stringify(last);
  const step = analysisStep(req.body);
  const marker = MARKERS.find((m) => user.includes(m)) ?? "";
  requests.push({ step, marker, user });
  const answer = (content: unknown) => ({ id: `stub-${requests.length}`, model: "stub", choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  if (step === "prefilter") return answer({ label: marker === "OFFTOPIC" || marker === "BARE" ? "BLOCK" : marker === "VAGUE" ? "UNKNOWN" : "PASS", reason: "測試" });
  if (step === "score") return answer({ attentionScore: scoreAnswers[marker]!.shift() });
  if (step === "understand" && marker === "FULLCOPY") return answer({ itemType: "tutorial_explainer", authorRole: "relayer", tags: [], editorialJudgment: "介紹即時互動評測與世界模型。", titleZh: "Import AI 479 的即時評測與世界模型", summaryZh: COMPLETE_SUMMARY });
  if (step === "summarize" && marker === "SHORTROUTE") return answer(`title_zh: Import AI 479 的即時評測與世界模型\nsummary_zh: ${COMPLETE_SUMMARY}`);
  // Copy with a word a site keeps from readers (added to the pack's list below), and its mended form: whole (WORDY),
  // refused by the provider, with a number changed, or with as many such words as before.
  if (step === "understand" && WORDY.includes(marker)) return answer({ itemType: ITEM_TYPES[0], authorRole: "principal", tags: [], editorialJudgment: `理由裡有禁用詞 ${marker}`, titleZh: `標題裡有禁用詞 ${marker}`, summaryZh: `${marker} 的摘要。第二句補充 3 個數字。` });
  // A refusal in a provider's own words: each provider words its own, and the same request would meet it again.
  if (step === "wording" && marker === "REFUSAL") return new Reply(400, { error: { message: "request refused", type: "invalid_request_error" } });
  if (step === "wording") {
    const unmended = marker === "UNMENDED" ? "有禁用詞" : "換了說法";
    return answer({ titleZh: `標題裡${unmended} ${marker}`, summaryZh: `${marker} 的摘要。第二句補充 ${marker === "RENUMBER" ? 4 : 3} 個數字。`, reasonZh: `理由裡${unmended} ${marker}` });
  }
  if (step === "understand") {
    if (marker === "SENSITIVE") return new Reply(400, { contentFilter: [{ level: 1, role: "user" }], error: { code: "1301", message: "系統檢測到輸入或生成內容可能包含不安全或敏感內容" } });
    return answer({ itemType: "model_release", authorRole: "principal", tags: ["模型釋出", "開源", "Agent", "不存在的標籤"], editorialJudgment: `理由 ${marker}`, titleZh: `理解標題 ${marker}`, summaryZh: `理解摘要 ${marker}。第二句補充一個關鍵數字。` });
  }
  if (step === "structure") return answer({ category: "ai-models", tags: ["模型釋出", "推理"], subjects: ["anthropic", "unknown-co"], scope: "single", fact: { title: `事實 ${marker}`, subject: "某公司", action: "釋出", object: "模型", occurredAt: null, evidence: "a lab released a model", conditions: [] } });
  return answer(`title_zh: 翻譯標題 ${marker}\nsummary_zh: 翻譯摘要 ${marker}。第二句補充影響。`);
});
pointModels(provider.url);

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES
    (${SOURCE}, 'Test analyze source', 'rss', 'T1', 'editorial', '2100-01-01'),
    (${X_SOURCE}, 'Test X account', 'x_search', 'T1', 'editorial', '2100-01-01'),
    (${CLASSED_SOURCE}, 'Test official source that gets a class', 'rss', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await provider.close();
  await stopBoss();
  await closeDb();
});

// The tag keeps each material unique: identical input would reuse an earlier run's paid answers.
const LONG = "a lab released a model with a benchmark table and pricing details. ".repeat(8);
const article = async (marker: string, extra: Record<string, unknown> = {}) =>
  (await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${marker}-${T}`, title: `${marker} model release ${T}`, bodyText: `${marker}: ${LONG} (${T})`,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date("2026-09-28T01:02:03Z"), ...extra,
  } as never)).articleId;
const calls = (marker: string) => requests.filter((r) => r.marker === marker).map((r) => r.step);
const row = async (id: string) =>
  (await sql<{ selected: boolean; relevance: string; score: string | null; title_zh: string; reason_zh: string | null; category: string | null; tags: string[]; subjects: string[]; receipt_ids: string[]; output: Record<string, any> }[]>`
    SELECT selected, relevance, score, title_zh, reason_zh, category, tags, subjects, receipt_ids, output FROM analyses WHERE article_id = ${id} ORDER BY id DESC LIMIT 1`)[0]!;

test("a selected item: prefilter, two scores, the content understanding and the structure", async () => {
  assert.ok(FLOOR >= 4 && FLOOR < T1 && T1 <= 97, "the cases need the understand floor below the T1 threshold, and a few points either side");
  const id = await article("CLEAR");
  const res = await analyzeArticle(id);
  assert.deepEqual([res!.output!.selected, res!.output!.score], [true, T1 + 1], `${T1 + 3} + ${T1 - 1} >= 2 × ${T1}; the mean is shown`);
  assert.deepEqual(calls("CLEAR").sort(), ["prefilter", "score", "score", "structure", "understand"]);
  const r = await row(id);
  assert.deepEqual([r.title_zh, r.reason_zh, r.category, r.receipt_ids.length], ["理解標題 CLEAR", "理由 CLEAR", "ai-models", 5]);
  // Failure case: the writer's independent labels contradict the structural category.
  assert.deepEqual(r.tags, ["模型釋出", "推理", "Anthropic"], "category and tags come from the same structural judgement, plus the verified subject tag");
  assert.deepEqual(r.subjects, ["anthropic"]);
  assert.deepEqual([r.output.writer, r.output.itemType, r.output.prefilter.label, r.output.fact.title], ["understand", "model_release", "PASS", "事實 CLEAR"]);
  assert.equal(r.output.scope, "single");
  assert.equal(r.output.fact.evidence, "a lab released a model");
  const score = requests.find((q) => q.marker === "CLEAR" && q.step === "score")!;
  assert.match(score.user, /【標題】\nCLEAR model release/, "the score reads the original title, before any writing");
});

test("完整摘要在理解與翻譯流程發布後仍保留後半段重點，不增加改寫請求", async () => {
  for (const [marker, writer] of [["FULLCOPY", "understand"], ["SHORTROUTE", "summarize"]] as const) {
    const id = await article(marker, { bodyText: `${marker}: ${LONG} Google DeepMind Genie 4, Metis, GPT-6 Astra, Import AI 479 and Realtime-Bench compare 50 tasks and a 36% pass rate. (${T})` });
    await analyzeArticle(id);
    await publishArticle(id);
    const detail = await loadItemDetail(id);
    assert.equal(detail.kind, "found");
    if (detail.kind !== "found") throw new Error("已發布文章沒有閱讀頁");
    assert.equal(detail.item.summary, COMPLETE_SUMMARY, "閱讀頁須保留模型摘要中的測試條件、Genie 4 與 Metis");
    assert.deepEqual(calls(marker).sort(), ["prefilter", "score", "score", "structure", writer].sort(), "不能為摘要長度新增模型請求");
  }
});

test("a word the site keeps from readers goes back once to be changed; copy without one is not sent", async () => {
  // A word only this test bans: the pack's list is the site's own (empty in the template).
  (READER_WORDING as Array<readonly [RegExp, string]>).push([/禁用詞/u, "換一個說法"]);
  try {
    const id = await article("WORDY");
    await analyzeArticle(id);
    assert.equal(calls("WORDY").filter((s) => s === "wording").length, 1);
    const r = await row(id);
    assert.deepEqual([r.title_zh, r.reason_zh], ["標題裡換了說法 WORDY", "理由裡換了說法 WORDY"], "the mended copy is stored");
    const sent = requests.find((q) => q.marker === "WORDY" && q.step === "wording")!;
    assert.ok(sent.user.includes("標題用了“禁用詞”") && sent.user.includes("推薦理由用了“禁用詞”"), "each use named");
    assert.ok(!requests.some((q) => q.step === "wording" && q.marker !== "WORDY"), "the other items' copy uses none");
  } finally {
    (READER_WORDING as Array<readonly [RegExp, string]>).pop();
  }
});

test("the first copy stands when the provider refuses the mend, the mend changes a number or leaves as many such words", async () => {
  (READER_WORDING as Array<readonly [RegExp, string]>).push([/禁用詞/u, "換一個說法"]);
  try {
    for (const marker of ["REFUSAL", "RENUMBER", "UNMENDED"]) {
      const id = await article(marker);
      await analyzeArticle(id);
      const r = await row(id);
      assert.deepEqual([r.title_zh, r.reason_zh], [`標題裡有禁用詞 ${marker}`, `理由裡有禁用詞 ${marker}`], `${marker}: the first copy is stored`);
      assert.equal(calls(marker).filter((s) => s === "wording").length, 1, `${marker}: mended once`);
      const [receipt] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'mend_wording' AND subject LIKE ${`article:${id}@%`}`;
      assert.equal(receipt!.status, marker === "REFUSAL" ? "failed" : "completed", `${marker}: the mend's receipt`);
    }
  } finally {
    (READER_WORDING as Array<readonly [RegExp, string]>).pop();
  }
});

test("structure retains grounded conditions, rejects invented or unseen quotes, and does not infer missing scope", async () => {
  const input = (await loadAnalyzeInput(await article("CONDITIONS", {
    bodyText: "Preview is free for Pro users until October 10.\n" + "x".repeat(11000) + "\nOnly available in the US. " + "x".repeat(MAX_BODY_CHARS) + "This late detail was not sent.",
  })))!;
  input.translationZh = "僅中文譯文中出現的限制";
  const frame = { title: "預覽上線", evidence: "Preview is free for Pro users until October 10.", conditions: [
    { text: "僅Pro使用者，免費至10月10日", quote: "Preview is free for Pro users until October 10." },
    { text: "僅限美國", quote: "Only available in the US." },
    { text: "無限免費", quote: "Unlimited free access for everyone." },
    { text: "不在模型輸入裡的句子", quote: "This late detail was not sent." },
  ] };
  const base = { category: "ai-models", tags: [], subjects: [], fact: frame };
  const out = normalizeStructure(StructureSchema.parse(base), input);
  assert.ok(buildMaterial(input).includes("Only available in the US."), "a condition after the old 7000-character cutoff reaches the model");
  assert.ok(buildMaterial(input).includes("後文未提供"));
  assert.equal(out.scope, "unknown", "an older result with a fact is not proof of single scope");
  assert.deepEqual(out.fact?.conditions, frame.conditions.slice(0, 2));
  assert.equal(out.fact?.evidence, frame.evidence);
  const partial = normalizeStructure(StructureSchema.parse({ ...base, fact: { ...frame, conditions: [
    { quote: "x".repeat(401) },
    { quote: "Preview is free... until October 10." },
    { quote: "Only available in the US." },
  ] } }), input);
  assert.deepEqual(partial.fact?.conditions, [{ text: "Only available in the US.", quote: "Only available in the US." }],
    "an invalid sibling cannot discard a valid original condition; spliced quotes remain rejected");
  const invented = normalizeStructure(StructureSchema.parse({ ...base, fact: { ...frame, evidence: input.source.name, conditions: [{ text: "翻譯限制", quote: input.translationZh }] } }), input);
  assert.equal(invented.fact?.evidence, null, "source metadata is not original evidence");
  assert.deepEqual(invented.fact?.conditions, [], "a translation does not count as an original quote");
  assert.equal(normalizeStructure(StructureSchema.parse({ ...base, scope: "composite" }), input).fact, null, "composite output cannot also claim one fact");
  const titleOnly = normalizeStructure(StructureSchema.parse({ ...base, scope: "single" }), { ...input, bodyText: null, excerpt: null });
  assert.equal(titleOnly.scope, "unknown", "a confident model cannot supply the missing original material");
  assert.equal(titleOnly.fact, null);
});

test("a near-selected item is written like a selected one; below the floor it is translated", async () => {
  const near = await analyzeArticle(await article("RESCUE"));
  assert.deepEqual([near!.output!.selected, near!.output!.reasonZh], [false, "理由 RESCUE"], `${FLOOR + 1} + ${FLOOR} > 2 × ${FLOOR}`);
  const lowId = await article("LOW");
  const low = await analyzeArticle(lowId);
  assert.deepEqual([low!.output!.selected, low!.output!.titleZh, low!.output!.reasonZh], [false, "翻譯標題 LOW", null]);
  assert.deepEqual(calls("LOW").sort(), ["prefilter", "score", "score", "structure", "summarize"]);
  assert.deepEqual((await row(lowId)).tags, ["模型釋出", "推理", "Anthropic"], "structure tags");
});

test("the prefilter's BLOCK stops everything; UNKNOWN with material goes on like PASS", async () => {
  const off = await analyzeArticle(await article("OFFTOPIC"));
  assert.deepEqual([off!.output!.relevance, off!.output!.selected], ["block", false]);
  assert.deepEqual(calls("OFFTOPIC"), ["prefilter"]);
  // An UNKNOWN with material is judged and written like a PASS, up to 精選 (T1 + T1 + 2 ≥ 2 × T1).
  const vagueId = await article("VAGUE");
  const vague = await analyzeArticle(vagueId);
  assert.deepEqual([vague!.output!.relevance, vague!.output!.selected, vague!.output!.titleZh], ["pass", true, "理解標題 VAGUE"]);
  assert.equal((await row(vagueId)).output.prefilter.label, "UNKNOWN", "the prefilter's own answer stays on record");
  // Nothing but a title and no page to fetch: it waits for material without a model call.
  const bare = await analyzeArticle(await article("BARE", { bodyText: null, excerpt: null, bodyStatus: "none" }));
  assert.deepEqual([bare!.output!.relevance, bare!.output!.selected, bare!.output!.score], ["unknown", false, null]);
  assert.deepEqual(calls("BARE"), []);
});

test("a feed summary alone: the article page is fetched first, then the whole article is judged", async () => {
  const id = await article("THIN", { bodyText: null, bodyStatus: "pending", excerpt: `THIN: a short feed summary (${T}).` });
  // The queue sends it to extraction although its source does not ask for full text (the sweep does
  // the same after a failed fetch, so extraction failures add up to "unconfirmed" and end).
  await queueProcessing(id);
  const [job] = await sql<{ name: string }[]>`SELECT name FROM pgboss.job WHERE data->>'articleId' = ${id}`;
  assert.equal(job?.name, QUEUES.extractBody);
  const first = await analyzeArticle(id);
  assert.deepEqual([first!.needsBody, first!.output], [true, null]);
  assert.deepEqual(calls("THIN"), [], "no model call before the page");
  assert.equal((await sql`SELECT 1 FROM analyses WHERE article_id = ${id}`).length, 0, "nothing committed");
  // What extraction does: the body lands as a new revision.
  await sql`UPDATE articles SET body_text = ${`THIN: ${LONG} (${T}) full page`}, body_status = 'ok', revision = revision + 1 WHERE id = ${id}`;
  const second = await analyzeArticle(id);
  assert.deepEqual([second!.needsBody ?? false, second!.output!.selected], [false, true]);
});

test("a short post in Chinese is its own copy; a content-filter refusal is translated instead", async () => {
  // The tag rides as a hashtag, which the language check strips.
  const text = `推文：今天把智慧體接進了工作流，效果不錯。#t${T}`;
  const { articleId } = await upsertMaterial({
    sourceId: X_SOURCE, url: `https://x.com/test/status/1${Date.now()}`, title: text, via: "fetch", publishedAt: new Date(),
    xPost: { tweetId: `1${Date.now()}`, authorName: "測試", handle: "test", text },
  });
  const post = await analyzeArticle(articleId);
  assert.deepEqual([post!.output!.titleZh, post!.output!.summaryZh], [text, text]);
  assert.ok(!calls("推文").includes("summarize"), "no translation call");
  const sensitive = await analyzeArticle(await article("SENSITIVE"));
  assert.deepEqual([sensitive!.output!.selected, sensitive!.output!.titleZh], [true, "翻譯標題 SENSITIVE"]);
  assert.deepEqual(calls("SENSITIVE").filter((s) => s === "understand" || s === "summarize"), ["understand", "summarize"]);
});

test("完整摘要保留句子、列舉與段落，仍拒絕來源未提及的公司", () => {
  const input = { title: "某實驗室釋出新模型", text: "某實驗室釋出了一個新模型，引數規模和價格都有說明。", sourceKind: "rss" };
  const guarded = finalizeCopy(input, { titleZh: "OpenAI 釋出新模型", summaryZh: "某實驗室釋出新模型。" });
  assert.deepEqual([guarded.titleZh, guarded.summaryZh, guarded.identityGuard.outcome], ["某實驗室釋出新模型", "某實驗室釋出新模型。", "fallback"]);
  // The identity lexicon: a Chinese rendering of a company the input names in English is no invention.
  const alibaba = { title: "Alibaba ships a new coding model", text: "Alibaba released a coding model with pricing details.", sourceKind: "rss" };
  assert.equal(finalizeCopy(alibaba, { titleZh: "阿里巴巴釋出程式設計模型", summaryZh: "阿里巴巴釋出了程式設計模型並公佈價格。" }).identityGuard.outcome, "pass");
  const long = "第一句交代了誰做了什麼以及關鍵結果，這一句本身已經足夠說明核心事件的來龍去脈。".repeat(3) + "第二句補充數字。".repeat(20);
  assert.equal(finalizeCopy(input, { titleZh: input.title, summaryZh: long }).summaryZh, long);
  assert.equal(finalizeCopy(input, { titleZh: input.title, summaryZh: `${long}\n\nOpenAI 另行發布模型。` }).summaryZh, "", "後半段未受來源支持的公司仍須攔下");
  // A short first sentence and a long second one: the card once ended "…可連線 Google Ads 和 Meta 賬號在 Google。".
  const lovable = "Lovable 推出增長工具，在原有建應用聊天視窗中提供增長計劃、廣告投放和 SEO 能力。使用者設定目標後，Lovable 依據應用上下文生成可執行計劃；可連線 Google Ads 和 Meta 賬號在 Google、YouTube、Facebook、Instagram 投放廣告，廣告上線前需使用者審批，計費直接走 Google Ads 和 Meta 賬號，Lovable 不加收服務費；SEO 方面覆蓋索引基礎、內建 Semrush 關鍵詞機會分析和站外社群推廣建議。功能現已在 Free、Pro 和 Business 計劃可用。";
  assert.equal(finalizeCopy({ ...input, text: lovable }, { titleZh: input.title, summaryZh: lovable }).summaryZh, lovable, "完整保留廣告平台、費用與方案資訊");
  // 長句與段落也不能因字數門檻被截掉。
  const runOn = "某實驗室釋出新模型，支援" + "甲乙丙、".repeat(39) + "甲乙丙，" + "補充說明".repeat(20) + "。";
  const paragraphs = `${runOn}\n\n第二段補充條件。`;
  assert.equal(finalizeCopy(input, { titleZh: input.title, summaryZh: paragraphs }).summaryZh, paragraphs);
  assert.deepEqual(parseTranslateOutput("title_zh: 標題\nsummary_zh: 第一句。\n第二句。"), { titleZh: "標題", summaryZh: "第一句。\n第二句。", bodyZh: "" });
  assert.equal(parseTranslateOutput("title_zh: 標題\nbody_zh: 我們懂你。\n\n來源：X：PixVerse (@PixVerse)").bodyZh, "我們懂你。", "a repeated prompt line is dropped");
});

test("a source class raises its tier's threshold to the class floor and never lowers one", () => {
  assert.ok(CLASS && CLASS_FLOOR - 1 >= T1, "the cases need a pack class whose floor lies above the official threshold and below the media one");
  assert.equal(selectionThreshold({ tier: "T1", selectionClass: null }), T1);
  assert.equal(selectionThreshold({ tier: "T1", selectionClass: CLASS }), CLASS_FLOOR);
  assert.equal(selectionThreshold({ tier: "T2", selectionClass: CLASS }), T2, "a media source keeps its own, higher threshold");
  assert.equal(selectionThreshold({ tier: "EXCLUDE_MP", selectionClass: CLASS }), null, "a tier without a threshold stays out of 精選");
});

test("after the admin gives a source a class, analysing again holds the paid scores against the class floor", async () => {
  // Scores that select from an ordinary official source and stay under the class floor.
  const id = await article("ECOSYS", { sourceId: CLASSED_SOURCE });
  const first = await analyzeArticle(id);
  assert.deepEqual([first!.output!.selected, (await row(id)).output.threshold], [true, T1]);
  const version = async () => (await sql<{ updated_at: Date }[]>`SELECT updated_at FROM sources WHERE id = ${CLASSED_SOURCE}`)[0]!.updated_at.toISOString();
  await assert.rejects(updateSource(CLASSED_SOURCE, { patch: { selection_class: "not-a-class" }, version: await version() }, "test"), "only the pack's classes");
  await updateSource(CLASSED_SOURCE, { patch: { selection_class: CLASS }, version: await version(), reason: "test" }, "test");
  const hits = provider.hits();
  const again = await analyzeArticle(id);
  assert.equal(provider.hits(), hits, "the same paid answers: the class is not part of any model input");
  assert.deepEqual([again!.output!.selected, again!.output!.score, (await row(id)).output.threshold], [false, CLASS_FLOOR - 1, CLASS_FLOOR]);
  const created = await createSource({ id: `test-classed-new-${T}`, name: "Created with a class", kind: "rss", config: { feedUrl: `https://example.com/feed-${T}.xml` }, tier: "T1", selection_class: CLASS }, "test");
  assert.equal(created.created && created.source.selection_class, CLASS, "a new source can start with a class");
});

test("analysing the same revision again reuses every paid answer", async () => {
  scoreAnswers.CLEAR = [T1 + 2, T1];
  const id = await article("CLEAR", { url: `https://example.com/CLEAR-again-${T}`, title: `CLEAR model release again ${T}` });
  const first = await analyzeArticle(id);
  assert.equal(first!.reused, false);
  const hits = provider.hits();
  const again = await analyzeArticle(id);
  assert.equal(provider.hits(), hits, "no new requests");
  assert.deepEqual([again!.reused, again!.receiptIds], [true, first!.receiptIds]);
});
