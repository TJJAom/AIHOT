import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadItemDetail } from "@aihot/backend/publication/detail";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import "../scripts/luna-readings.ts";

const provider = await stub(() => ({ choices: [{ message: { content: JSON.stringify({ sections: [
  { heading: "事件內容", paragraphs: ["來源指出研究團隊公布了新的評測結果，尚未宣布產品正式推出。", "這次實驗只涵蓋指定樣本，來源沒有提供其他應用情境的結果。"] },
] }) } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
after(async () => { await provider.close(); await stopBoss(); await closeDb(); });

test("固定 Luna 補齊名單執行與恢復不重付費，不影響來源許可、人工欄位或背景佇列", async () => {
  const source = `reading-batch-${tag()}`;
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext,syndicate_fulltext,next_fetch_at)
    VALUES(${source},'來源','rss','T2','editorial',false,false,'2100-01-01')`;
  const ids = [];
  for (const n of [1, 2]) {
    const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.org/${source}/${n}`, title: `研究 ${n}`, bodyText: "A research team released benchmark results. No product launch was announced.", bodyStatus: "ok", via: "test", publishedAt: new Date() });
    await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,score,selected)
      VALUES(${articleId},1,'rule','pass','研究結果','既有導讀摘要。',20,false)`;
    await publishArticle(articleId); ids.push(articleId);
  }
  await getBoss();
  const dir = await mkdtemp(path.join(tmpdir(), "reading-batch-"));
  const preload = path.join(dir, "local-provider.mjs");
  // 只在隔離測試子程序把固定 OpenAI 地址轉向本地 stub，其餘網路一律拒絕。
  await writeFile(preload, `const fetchLocal=globalThis.fetch;globalThis.fetch=(url,init)=>{if(String(url)!=="https://api.openai.com/v1/chat/completions")throw Error("test network blocked");return fetchLocal(${JSON.stringify(provider.url + "/v1/chat/completions")},init);};`);
  const run = (mode: string) => promisify(execFile)(process.execPath, ["--import", preload, "scripts/luna-readings.ts", mode, "reading-test"], {
    env: { ...process.env, AIHOT_DATA_DIR: dir, OPENAI_API_KEY: "test-key", NODE_TEST_CONTEXT: "", NODE_OPTIONS: "" }, timeout: 30000,
  });
  await run("--prepare");
  assert.equal(provider.hits(), 0);
  await run("--run");
  assert.equal(provider.hits(), 2);
  await run("--run");
  assert.equal(provider.hits(), 2);
  await sql`DELETE FROM article_readings WHERE article_id=${ids[0]!}`;
  await run("--run");
  assert.equal(provider.hits(), 2, "即使正文投影遺失，也恢復已付費回執");
  const manifest = JSON.parse(await readFile(path.join(dir, "pilots/reading-test.json"), "utf8"));
  assert.equal(manifest.state, "completed");
  assert.equal(manifest.requests, 2);
  assert.equal(manifest.verification.unchanged, true);
  assert.deepEqual(manifest.verification.newJobs, []);
  for (const id of ids) {
    const detail = await loadItemDetail(id);
    assert.ok(detail.kind === "found" && detail.item.body?.zhKind === "reading");
  }
});
