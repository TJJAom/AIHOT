// Production SSR with a local health stub. Failure case: machine entry points for weekly and monthly
// reports exist but cannot be found from the access page.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as cheerio from 'cheerio';
import { MCP_TOOL_NAMES } from '@aihot/contracts/mcp';
import { fakeApi, startWebServer, type WebServer } from './web-server.ts';

let web: WebServer;
const api = fakeApi((url) => (url.pathname === '/api/health' ? { ok: true } : undefined));
before(async () => { web = await startWebServer(api); });
after(() => web.stop());

test('the public agent page uses the Taiwan locale and approved site identity', async () => {
  const response = await fetch(`${web.origin}/agent`);
  assert.equal(response.status, 200, web.logs());
  const $ = cheerio.load(await response.text());
  assert.equal($('html').attr('lang'), 'zh-TW');
  assert.match($('title').text(), /日耕 AI 熱點/);
  assert.ok($('a[href="https://github.com/TJJAom/AIHOT"]').length > 0);
  assert.match($('body').text(), /全部 AI 動態/);
  const terms = await fetch(`${web.origin}/terms`);
  assert.equal(terms.status, 200, web.logs());
  const termsText = cheerio.load(await terms.text())('body').text();
  assert.match(termsText, /生效日期2026-11-05/);
  assert.match(termsText, /版本1\.4/);
  assert.match(termsText, /每日台灣時間 08:00/);
  assert.match(termsText, /AI 文章整理依來源材料撰寫重點、背景與細節/);
  assert.match(termsText, /並非原作者全文或逐字翻譯/);
  assert.doesNotMatch(termsText, /尚未生效/);
  const privacy = await fetch(`${web.origin}/privacy`);
  assert.equal(privacy.status, 200);
  const privacyText = cheerio.load(await privacy.text())('body').text();
  assert.match(privacyText, /版本1\.4/);
  assert.match(privacyText, /持續採集與文章整理使用 OpenAI GPT-6 Luna API/);
  assert.match(privacyText, /本機 GPU 模型維持停用/);
});

for (const [tab, names] of [
  ['rss', ['/feed/daily.xml', '/feed/weekly.xml', '/feed/monthly.xml']],
  ['api', ['/api/v1/dailies/latest', '/api/v1/weeklies/latest', '/api/v1/monthlies/latest']],
  ['mcp', [MCP_TOOL_NAMES.daily, MCP_TOOL_NAMES.weekly, MCP_TOOL_NAMES.monthly]],
] as const) {
  test(`the ${tab} panel exposes all report entry points`, async () => {
    const response = await fetch(`${web.origin}/agent?tab=${tab}`);
    assert.equal(response.status, 200, web.logs());
    const panel = cheerio.load(await response.text())('#agent-panel').text();
    for (const name of names) assert.ok(panel.includes(name), `${tab} panel omits ${name}`);
  });
}
