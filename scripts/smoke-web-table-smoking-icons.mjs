import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const script = readFileSync(resolve("test-site/landing/assets/js/tables.js"), "utf8");
const languageScript = readFileSync(resolve("test-site/landing/assets/js/language.js"), "utf8");
let policy = "smoking_allowed";
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname.endsWith("/api/tables.php")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, enabled: true, tables: [{
      id: "t1", name: "Salon 1", area: "Salon", capacity: 4,
      features: [], smoking_policy: policy, media: []
    }] }));
    return;
  }
  if (url.pathname === "/assets/js/language.js") {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.end(languageScript);
    return;
  }
  if (url.pathname === "/assets/js/tables.js") {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.end(script);
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end('<!doctype html><html lang="tr"><head><title>Masa</title></head><body>' +
    '<section data-table-detail><div data-table-detail-loading></div>' +
    '<div data-table-detail-content hidden><div data-table-name></div><div data-table-area></div>' +
    '<div data-table-capacity></div><p data-table-smoking></p><p data-table-description></p>' +
    '<div data-table-feature-list></div><img data-table-cover hidden>' +
    '<div data-table-cover-placeholder></div><div data-table-media-section hidden></div>' +
    '</div></section><script src="/assets/js/language.js"></script><script src="/assets/js/tables.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage();
  for (const [p, label, count] of [
    ["smoking_allowed", "Sigara içilebilir", 1],
    ["outdoor_only", "Yalnız açık alanda sigara içilebilir", 1],
    ["unspecified", "", 0],
    ["non_smoking", "", 0]
  ]) {
    policy = p;
    await page.goto("http://127.0.0.1:" + port + "/restoran/masa/?id=t1");
    await expect(page.locator("[data-table-detail-content]")).toBeVisible();
    const icons = page.locator("[data-table-feature-list] .amenity-item");
    await expect(icons).toHaveCount(count);
    if (count) {
      await expect(icons.first()).toContainText(label);
      await expect(icons.first().locator(".amenity-icon")).toHaveText("🚬");
    }
    const smokingText = page.locator("[data-table-smoking]");
    if (p === "non_smoking") {
      await expect(smokingText).toBeVisible();
      await expect(smokingText).toHaveText("Sigara içilmez");
    } else {
      await expect(smokingText).toBeHidden();
    }
  }
  console.log("web-table-smoking-icons-smoke-ok");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
