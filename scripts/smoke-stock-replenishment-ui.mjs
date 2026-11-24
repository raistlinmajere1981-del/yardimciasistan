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
  const launcher = page.getByRole("button",{name:"İhtiyaç listesini aç"});
  await expect(launcher).toBeVisible();
  await expect(page.locator(".market-inventory-heading-row").getByRole("heading",{name:"Fiziksel Sayım"})).toBeVisible();
  await expect(page.locator(".market-two-column > .market-panel")).toHaveCount(1);
  const headingAlignment = await page.locator(".market-inventory-heading-row").evaluate(row => {
    const heading = row.querySelector("h2").getBoundingClientRect();
    const button = row.querySelector("button").getBoundingClientRect();
    return {sameLine: Math.abs(heading.top - button.top) < 20, adjacent: button.left >= heading.right, fits: button.right <= row.getBoundingClientRect().right + 1};
  });
  assert.ok(headingAlignment.sameLine && headingAlignment.adjacent && headingAlignment.fits,"Launcher must sit beside physical count title");
  assert.equal(await page.evaluate(() => window.stockUiTest.reads()),0,"Closed projection must not read 10,000 products");
  await page.getByRole("button",{name:"İhtiyaç listesini aç"}).click();
  const workspace = page.getByRole("dialog",{name:"İdeal Stok İhtiyaç Listesi"});
  await expect(workspace).toBeVisible();
  await expect(workspace).not.toContainText("Önerilen miktar =");
  await expect(workspace).not.toContainText("Yazıcı ve yazdırma onayı:");
  const compactFilters = await workspace.locator(".stock-replenishment__toolbar").evaluate(toolbar => {
    const controls = [...toolbar.querySelectorAll("input, select")].map(node => node.getBoundingClientRect());
    const refresh = toolbar.parentElement.querySelector(".stock-replenishment__selection > .icon-button").getBoundingClientRect();
    return {widths: controls.map(rect => Math.round(rect.width)), refreshBelow: refresh.top > Math.max(...controls.map(rect => rect.bottom)), refreshWidth: refresh.width};
  });
  assert.ok(compactFilters.widths[0] <= 396 && compactFilters.widths[1] <= 186 &&
    compactFilters.widths[2] <= 154, JSON.stringify(compactFilters));
  const categoryList = workspace.getByRole("navigation",{name:"İhtiyaç kategorileri"});
  await expect(categoryList.getByRole("button")).toHaveCount(3);
  await expect(categoryList.getByRole("button",{name:/^Tüm kategoriler/})).toHaveAttribute("aria-pressed","true");
  const paneGeometry = await workspace.locator(".stock-replenishment__layout").evaluate(layout => {
    const rail=layout.querySelector(".detail-workspace-layout__rail").getBoundingClientRect();
    const content=layout.querySelector(".detail-workspace-layout__content").getBoundingClientRect();
    const list=layout.querySelector(".stock-replenishment__category-list");
    return {categoryLeft:rail.left,categoryRight:rail.right,contentLeft:content.left,sameRow:Math.abs(rail.top-content.top)<2,
      scrollOwner:getComputedStyle(list).overflowY};
  });
  assert.ok(paneGeometry.sameRow && paneGeometry.categoryRight < paneGeometry.contentLeft &&
    paneGeometry.scrollOwner === "auto", JSON.stringify(paneGeometry));
  assert.ok(compactFilters.refreshBelow && compactFilters.refreshWidth <= 52, "Refresh icon must occupy the selection row");
  await expect(workspace.getByRole("button",{name:"İhtiyaç listesini yenile"})).toBeVisible();
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
  await categoryList.getByRole("button",{name:/^İçecekler/}).click();
  await expect(categoryList.getByRole("button",{name:/^İçecekler/})).toHaveAttribute("aria-pressed","true");
  await expect(workspace.locator(".stock-replenishment__results-heading h3")).toHaveText("İçecekler");
  await expect(workspace.getByLabel("Sayfa numarası")).toContainText("1 / 3");
  await expect(workspace.getByText("51 ürün seçili")).toBeVisible();
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
  const stacked = await workspace.locator(".stock-replenishment__layout").evaluate(layout => {
    const rail=layout.querySelector(".detail-workspace-layout__rail").getBoundingClientRect();
    const content=layout.querySelector(".detail-workspace-layout__content").getBoundingClientRect();
    const categories=layout.querySelector(".stock-replenishment__category-list");
    return {railAboveResults:rail.bottom <= content.top + 1,
      panelFits:rail.right <= innerWidth+2 && content.right <= innerWidth+2,
      categoryScroll:getComputedStyle(categories).overflowY};
  });
  assert.ok(stacked.railAboveResults && stacked.panelFits && stacked.categoryScroll === "auto",
    "Narrow workspace keeps independently scrollable categories above products: " + JSON.stringify(stacked));
  await workspace.getByRole("button",{name:"İhtiyaç listesini yenile"}).click();
  await expect.poll(() => page.evaluate(() => window.stockUiTest.reads())).toBe(3);
  await page.setViewportSize({width:1350,height:860});
  await page.evaluate(() => window.stockUiTest.setCategoryCount(42));
  await workspace.getByRole("button",{name:"İhtiyaç listesini yenile"}).click();
  await expect.poll(() => page.evaluate(() => window.stockUiTest.reads())).toBe(4);
  await expect(categoryList.getByRole("button")).toHaveCount(43);
  const categoryScroll = await categoryList.evaluate(list => {
    const results=list.closest(".stock-replenishment__layout").querySelector(".stock-replenishment__results-panel").getBoundingClientRect();
    const startTop=results.top;
    const scrollable=list.scrollHeight>list.clientHeight;
    list.scrollTop=list.scrollHeight;
    return {scrollable,scrollTop:list.scrollTop,contentStayed:Math.abs(startTop-results.top)<1};
  });
  assert.ok(categoryScroll.scrollable && categoryScroll.scrollTop>0 && categoryScroll.contentStayed, JSON.stringify(categoryScroll));
  await categoryList.getByRole("button",{name:/^Kategori 39/}).click();
  await expect(workspace.locator(".stock-replenishment__results-heading h3")).toHaveText("Kategori 39");
  await expect(tableRows.first()).toContainText("Kategori 39");
  assert.deepEqual(errors,[]);
  console.log("stock-replenishment-ui-ok: lazy read, category rail with independent scroll, 540 rows, selection, filters, CSV, print, responsive");
} finally { await browser?.close(); await server.close(); }
