// Failure mode: WeChat's in-app browser cannot save downloads, so the article offers "複製 Markdown" there
// instead; it copied with the async clipboard, which that browser does not have, and always failed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";
import { fakeApi, itemDetail, startWebServer, visit, type WebServer } from "./web-server.ts";

const markdown = "# 複製檢查\n\n固定正文";

test("文章整理是獨立多段主文，與導讀分開且不冒充原文或翻譯", async () => {
  const api = fakeApi(url => url.pathname === "/api/site/items/reading" ? itemDetail({
    id: "reading", title: "Brave 訴訟報導", summary: "這是保留的簡短導讀。", selected: false, hasTranslation: false,
    body: { zh: "<h2>訴訟主張</h2><p>出版商指控內容遭未經許可使用，這些主張尚未經法院裁定。</p><h2>各方回應</h2><p>部分公司尚未回應，另有公司否認指控。</p>", original: null, zhKind: "reading", complete: true },
  }) : undefined);
  const browser = await chromium.launch({ channel: "chromium" });
  let web: WebServer | undefined;
  try {
    web = await startWebServer(api);
    const page = await browser.newPage();
    await visit(page, web.origin + "/items/reading");
    await expect(page.getByText("文章內容 · AI 重點整理", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "訴訟主張" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "各方回應" })).toBeVisible();
    await expect(page.getByText("這是保留的簡短導讀。", { exact: true })).toBeVisible();
    await expect(page.getByText("正文 · AI 翻譯", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/並非原文全文或逐字翻譯/)).toBeVisible();
  } finally { await browser.close(); await web?.stop(); }
});

test("in WeChat, 複製 Markdown copies the article without the async clipboard", async () => {
  const api = fakeApi((url, res) => {
    if (url.pathname === "/api/site/items/wechat-copy") return itemDetail({ id: "wechat-copy", title: "複製檢查" });
    if (url.pathname === "/items/wechat-copy/markdown") {
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      return res.end(markdown);
    }
  });
  const browser = await chromium.launch({ channel: "chromium" });
  let web: WebServer | undefined;
  try {
    web = await startWebServer(api);
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50",
    });
    // As in WeChat: no async clipboard; a selection copy works, and what it copied is kept for the test.
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "clipboard", { get: () => undefined });
      document.execCommand = (command: string) => {
        if (command !== "copy") return false;
        (window as { copied?: string }).copied = (document.activeElement as HTMLTextAreaElement | null)?.value;
        return true;
      };
    });
    const page = await context.newPage();
    await visit(page, web.origin + "/items/wechat-copy");
    await page.getByRole("button", { name: "更多操作" }).filter({ visible: true }).click();
    await page.getByRole("menuitem", { name: "複製 Markdown" }).click();
    await expect(page.getByRole("status")).toHaveText("Markdown 已複製");
    assert.equal(await page.evaluate(() => (window as { copied?: string }).copied), markdown);
  } finally {
    await browser.close();
    await web?.stop();
  }
});
