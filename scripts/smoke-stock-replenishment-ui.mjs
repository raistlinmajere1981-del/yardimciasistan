import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const server = await createServer({
  root: resolve("apps/desktop-app"),
  configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
  server: {port:0,strictPort:false}
});
let browser;
try {
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({viewport:{width:1350,height:860},locale:"tr-TR"});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/stock-report-test", async route => route.fulfill({
    contentType:"text/html",
    body: await server.transformIndexHtml("/stock-report-test",
      '<html><body><div id="root"></div><script type="module" src="/@fs/'
      + resolve("scripts/fixtures/stock-replenishment.tsx") + '"></script></body></html>')
  }));
  await page.goto(server.resolvedUrls.local[0] + "stock-report-test");
  await expect(page.getByRole("button",{name:"İhtiyaç listesini aç"})).toBeVisible();
  assert.equal(await page.evaluate(() => window.stockUiTest.reads()),0,"Closed projection must not read 10,000 products");
  await page.getByRole("button",{name:"İhtiyaç listesini aç"}).click();
  const workspace = page.getByRole("dialog",{name:"İdeal Stok İhtiyaç Listesi"});
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole("status").first()).toContainText("540");
  const tableRows = workspace.locator(".stock-replenishment__table tbody tr");
  await expect(tableRows).toHaveCount(50);
  await expect(workspace.getByLabel("Sayfa numarası")).toContainText("1 / 11");
  await workspace.getByRole("button",{name:"Bu sayfayı seç"}).click();
  await expect(workspace.getByText("50 ürün seçili")).toBeVisible();
  await workspace.getByRole("button",{name:"Sonraki"}).click();
  await expect(workspace.getByLabel("Sayfa numarası")).toContainText("2 / 11");
  await workspace.getByRole("checkbox",{name:/Ürün \d+ seç/}).first().check();
  await expect(workspace.getByText("51 ürün seçili")).toBeVisible();
  await workspace.getByRole("button",{name:"Seçilenleri Yazdır"}).click();
  await expect(workspace).toContainText("yazıcı kuyruğuna gönderildi");
  assert.equal((await page.evaluate(() => window.stockUiTest.printCalls()))[0].productIds.length,51);
  await workspace.getByRole("button",{name:"Tümünü Yazdır"}).click();
  assert.deepEqual((await page.evaluate(() => window.stockUiTest.printCalls()))[1],{scope:"all"});
  await workspace.getByLabel("İhtiyaçlarda ara").fill("Ürün 540");
  await expect(tableRows).toHaveCount(1);
  await expect(workspace.getByLabel("Sayfa numarası")).toContainText("1 / 1");
  await expect(workspace.getByText("51 ürün seçili")).toBeVisible();
  await workspace.getByLabel("İhtiyaçlarda ara").fill("");
  await workspace.getByLabel("Sayfadaki ürün").selectOption("100");
  await expect(tableRows).toHaveCount(100);
  await expect(workspace.getByLabel("Sayfa numarası")).toContainText("1 / 6");
  await workspace.getByLabel("İhtiyaç kategorisi").selectOption("b");
  await expect(workspace.getByLabel("Sayfa numarası")).toContainText("1 / 3");
  await workspace.getByRole("button",{name:"Filtre sonucunu seç (270)"}).click();
  await expect(workspace.getByText(/ürün seçili/).last()).toBeVisible();
  const downloadStarted = page.waitForEvent("download");
  await workspace.getByRole("button",{name:"Filtreyi CSV"}).click();
  const file = await downloadStarted;
  assert.equal(file.suggestedFilename(),"filtreli-stok-ihtiyaclari.csv");
  await workspace.getByRole("button",{name:"Çalışma alanını kapat"}).click();
  await expect(workspace).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.stockUiTest.reads()),1);
  await page.setViewportSize({width:390,height:820});
  await page.getByRole("button",{name:"İhtiyaç listesini aç"}).click();
  await expect(workspace).toBeVisible();
  await expect(tableRows).toHaveCount(50);
  assert.equal(await page.evaluate(() => window.stockUiTest.reads()),2);
  const viewport = await workspace.evaluate(node => {
    const bounds=node.getBoundingClientRect();
    const scroll=node.querySelector(".stock-replenishment__table-scroll");
    return {left:bounds.left,right:bounds.right,width:innerWidth,inside:scroll.scrollWidth>scroll.clientWidth};
  });
  assert.ok(viewport.left >= -2 && viewport.right <= viewport.width + 2,"Dialog must stay inside mobile viewport");
  assert.equal(viewport.inside,true,"Dense table must scroll inside its own panel");
  assert.deepEqual(errors,[]);
  console.log("stock-replenishment-ui-ok: lazy read, 540 rows, pagination, multi-page selection, filters, CSV, centralized print, responsive");
} finally { await browser?.close(); await server.close(); }
