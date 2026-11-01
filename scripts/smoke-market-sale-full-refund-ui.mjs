import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { saleFixture, databaseState, load, marketSaleIpcModules, completeMarketSaleInTransaction, withCommerceBenefitsTransaction } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { exampleRules, installRules, adjust, balance } from "./test-helpers/commerce-benefits-fixture.mjs";

const f = saleFixture(), root = mkdtempSync(join(tmpdir(), "market-refund-ui-")), handlers = new Map();
let server, browser, bridge, loseResponse = false, malformedResponse = false, failRefresh = false;
let financeReads = 0, secureReads = 0;
let holdPreview = false, releasePreview, changeScope = false, lockHistory = false;
const calls = [], errors = [];
const finance = new (load("finance").DesktopFinanceService)(f.path);
const count = table => Number(f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n);
try {
  f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','core.finance','fixture','fixture')").run();
  // This refund fixture uses the generic Companion cash path; protected Companion earn
  // is tested separately with a real authenticated TLS context and protected key.
  installRules(f, exampleRules().map(rule => ({ ...rule, startsAt: 0,
    scope: rule.id === "earn" ? { ...rule.scope, channels: rule.scope.channels.filter(channel => channel !== "companion") } : rule.scope }))); adjust(f);
  const electron = { ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, app: { getPath: () => root },
    safeStorage: { isEncryptionAvailable: () => { secureReads++; return true; }, getSelectedStorageBackend: () => "gnome_libsecret",
      encryptString: text => Buffer.from(text).map(byte => byte ^ 0xa5), decryptString: bytes => Buffer.from(bytes).map(byte => byte ^ 0xa5).toString() } };
  const modules = marketSaleIpcModules(electron);
  modules.ipc.registerCommerceIpcHandlers({ databasePath: () => f.path, assertUnlocked() {}, onMutation() {
    if (loseResponse) { loseResponse = false; throw new Error("simulated_post_commit_lost_reply"); }
  } });
  const frame = { url: "file:///trusted/index.html" }, sender = { getType: () => "window", mainFrame: frame }, event = { sender, senderFrame: frame };
  electron.contextBridge = { exposeInMainWorld: (_name, value) => { bridge = value.commerce; } };
  electron.ipcRenderer = { invoke: async (channel, ...args) => channel === "appLock:getStatus" ? { locked: false } : handlers.get(channel)(event, ...args) };
  modules.preload();
  new (load("commerce-benefits-key").CommerceBenefitsKey)(root, electron.safeStorage).load();
  const seed = async (operationId, mixed = false) => {
    const input = { operationId, paymentMethod: mixed ? "bank" : "cash", items: [{ productId: "p1", quantity: 1 }], locationId: "loc" };
    if (!mixed) return (await bridge.completeMarketSale({ ...input, settlement: "paid" })).sale;
    const request = { operationId, paymentMethod: "bank", items: input.items, customerId: "c1", requestedPointsMinor: 10000 };
    const preview = await bridge.previewMarketSaleBenefits(request); assert.equal(preview.ok, true, JSON.stringify(preview));
    return (await bridge.completeMarketSale({ ...input, customerId: "c1", settlement: "paid", paymentAmountMinor: preview.value.quote.payableMinor,
      benefits: { requestedPointsMinor: 10000, expectedQuote: preview.value.quote } })).sale;
  };
  const deniedOrder = withCommerceBenefitsTransaction(f.db, Date.now(), tx => completeMarketSaleInTransaction(f.db, {
    operationId: "order_original", paymentMethod: "cash", items: [{ productId: "p1", quantity: 1 }], locationId: "loc", settlement: "paid", source: "commerce-order"
  }, new Date(tx.now).toISOString()).sale);
  const ids = { cash: (await seed("cash_original")).id, mixed: (await seed("mixed_original", true)).id,
    deniedOrder: deniedOrder.id, deniedCredit: (await seed("credit_original")).id,
    refunded: (await seed("refunded_original")).id, malformed: (await seed("malformed_original")).id };
  f.db.prepare("UPDATE commerce_sales SET status = 'credit' WHERE id = ?").run(ids.deniedCredit);
  await bridge.fullRefundMarketSale({ saleId: ids.refunded, operationId: "prior_refund", kind: "full" });
  const initialRefunds = count("commerce_sale_full_refunds");
  finance.getData(); // category owner initializes before measuring read-only previews
  const beforePreview = databaseState(f.db), keyReads = secureReads;
  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }); page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  await page.exposeFunction("__refundCall", async (method, input) => {
    if (method === "finance") { financeReads++; if (failRefresh) throw new Error("simulated_refresh_failure"); return finance.getData(100); }
    if (method === "tryFullRefundMarketSale") {
      calls.push(input);
      const result = await bridge[method](input);
      if (malformedResponse) { malformedResponse = false; return { ok: true, value: {} }; }
      return result;
    }
    if (method === "getFullRefundMarketSalePreview" && holdPreview) {
      holdPreview = false;
      const result = await bridge[method](input);
      await new Promise(resolve => { releasePreview = resolve; });
      return result;
    }
    if (method === "listMarketSaleHistory" && lockHistory) throw new Error("locked");
    if (method === "listMarketSaleHistory" && changeScope) {
      changeScope = false;
      return { ...(await bridge[method](input)), businessId: "b2" };
    }
    return bridge[method](input);
  });
  const snapshot = load("business-capability-store").readBusinessCapabilitySnapshot(f.path);
  await page.addInitScript(snapshot => {
    window.__financeInitial = { snapshot };
    window.yardimciDesktop = { getFinanceData: () => window.__refundCall("finance"), commerce: Object.fromEntries(
      ["getFullRefundMarketSalePreview", "tryFullRefundMarketSale", "listMarketSaleHistory"].map(method => [method, input => window.__refundCall(method, input)])) };
  }, snapshot);
  await page.route("**/refund-test", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/refund-test",
    `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/finance-workspace.tsx")}"></script></body></html>`) }));
  await page.goto(`${server.resolvedUrls.local[0]}refund-test`);
  const saleRow = id => page.locator(`.finance-entry-item[data-source-type="commerce_sale"][data-source-id="${id}"]`);
  await expect(page.getByRole("button", { name: "Tam İade", exact: true })).toHaveCount(3);
  for (const id of [ids.deniedOrder, ids.deniedCredit, ids.refunded]) await expect(saleRow(id).getByRole("button")).toHaveCount(0);
  assert.deepEqual(databaseState(f.db), beforePreview); assert.equal(secureReads, keyReads);
  const dialog = () => page.getByRole("dialog", { name: "Tam iade kaydedilsin mi?", exact: true });
  const confirm = () => dialog().getByRole("button", { name: "Tam İadeyi Kaydet", exact: true });
  await saleRow(ids.cash).getByRole("button", { name: "Tam İade" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(1); await expect(dialog()).toContainText("Kasa iadesi kaydı: ₺1.000,00");
  await dialog().getByRole("button", { name: "Vazgeç", exact: true }).click(); assert.equal(calls.length, 0);
  // A real expected rejection rolls back and allows cancel/reselection with a fresh preview.
  await saleRow(ids.cash).getByRole("button", { name: "Tam İade" }).click();
  f.db.prepare("UPDATE inventory_locations SET is_active = 0 WHERE id = 'loc'").run();
  await confirm().click(); await expect(dialog()).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("güvenli iadeye uygun değil"); assert.equal(count("commerce_sale_full_refunds"), initialRefunds);
  f.db.prepare("UPDATE inventory_locations SET is_active = 1 WHERE id = 'loc'").run();
  await page.evaluate(() => window.__financeHarness.controller.refreshFinanceData());
  await expect(saleRow(ids.cash).getByRole("button", { name: "Tam İade" })).toBeVisible();
  const readsBefore = financeReads;
  await saleRow(ids.cash).getByRole("button", { name: "Tam İade" }).click(); await confirm().click();
  await expect(dialog()).toHaveCount(0); await expect(page.getByRole("status")).toContainText("Kasa iadesi kaydı tamamlandı");
  await expect(saleRow(ids.cash).getByRole("button")).toHaveCount(0);
  await expect(page.locator('.finance-entry-item[data-source-type="commerce_sale_refund"]')).toHaveCount(initialRefunds + 1);
  assert(financeReads > readsBefore);
  // Real post-commit notification failure: remount keeps the exact immutable command.
  await saleRow(ids.mixed).getByRole("button", { name: "Tam İade" }).click();
  await expect(dialog()).toContainText("Kasa iadesi kaydı: ₺850,00"); await expect(dialog()).toContainText("Geri yüklenecek Puan: ₺100,00");
  loseResponse = true;
  await confirm().evaluate(button => { button.click(); button.click(); });
  const retry = () => page.getByRole("button", { name: "İade Sonucunu Doğrula", exact: true });
  await expect(retry()).toBeEnabled(); const attempts = calls.length;
  await expect(page.getByRole("button", { name: "Gelir Ekle", exact: true })).toBeDisabled();
  await dialog().getByRole("button", { name: "Sonuç doğrulanmalı" }).click(); await expect(dialog()).toBeVisible();
  await page.evaluate(() => window.__financeHarness.setPage("other")); await expect(dialog()).toHaveCount(0);
  await page.evaluate(() => window.__financeHarness.setPage("finance")); await expect(retry()).toBeEnabled();
  assert.equal(calls.length, attempts); await retry().click(); await expect(dialog()).toHaveCount(0);
  assert.deepEqual(calls.at(-1), calls.at(-2)); assert.equal(count("commerce_sale_full_refunds"), initialRefunds + 2);
  await expect(page.locator('.finance-entry-item[data-source-type="commerce_sale_refund"]')).toHaveCount(initialRefunds + 2);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM finance_entries WHERE source_type = 'commerce_sale' AND deleted_at = ''").get().n, 6);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM finance_entries WHERE source_type = 'commerce_sale_refund'").get().n, initialRefunds + 2);
  // Malformed committed reply also retains exact intent; refresh failure must not suggest rollback.
  await saleRow(ids.malformed).getByRole("button", { name: "Tam İade" }).click(); malformedResponse = true;
  await confirm().click(); await expect(retry()).toBeEnabled(); failRefresh = true;
  await retry().click(); await expect(dialog()).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Kasa iadesi kaydı tamamlandı");
  assert.deepEqual(calls.at(-1), calls.at(-2)); assert.equal(count("commerce_sale_full_refunds"), initialRefunds + 3);
  await expect(page.getByRole("button", { name: "Gelir Ekle", exact: true })).toBeEnabled();
  failRefresh = false; await page.evaluate(() => window.__financeHarness.controller.refreshFinanceData());
  await expect(page.getByRole("button", { name: "Tam İade", exact: true })).toHaveCount(0);
  const old = await seed("history_old");
  const otherBusiness = await seed("history_other_business");
  f.db.prepare("UPDATE commerce_sales SET business_id = 'b2' WHERE id = ?").run(otherBusiness.id);
  f.db.prepare("UPDATE commerce_sales SET opened_at = '2020-01-01' WHERE id = ?").run(old.id);
  for (let i = 0; i < 30; i++) await seed(`history_filler_${i}`);
  adjust(f, 100000, { operationKey: "history_opening" });
  const pointsInput = { operationId: "history_all_points", paymentMethod: "cash", items: [{ productId: "p1", quantity: 1 }], customerId: "c1", requestedPointsMinor: 100000 };
  const pointQuote = await bridge.previewMarketSaleBenefits(pointsInput);
  const pointSale = (await bridge.completeMarketSale({ ...pointsInput, locationId: "loc", settlement: "paid", paymentAmountMinor: pointQuote.value.quote.payableMinor,
    benefits: { requestedPointsMinor: 100000, expectedQuote: pointQuote.value.quote } })).sale;
  for (const cap of ["service.android", "commerce.customer_credit", "retail.barcode"])
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  f.db.exec("INSERT INTO android_devices (id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin','fixture','fixture','fixture','fixture'); UPDATE android_devices SET is_active=1 WHERE id='d1'");
  const mobileAction = { id: "history_mobile_01", action_type: "market_sale_complete", device_id: "device-one", created_at: "2026-10-29T00:00:00.000Z", payload: {
    lines: [{ product_id: "p1", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" }],
    location_id: "loc", settlement: "paid", customer_id: "c1", payment_method: "cash", external_payment_confirmed: false } };
  const mobileResult = load("android-action-application-service").applyAndroidActionTransaction(f.db, mobileAction, load("business-capability-store").readEnabledBusinessCapabilities(f.db));
  assert.equal(mobileResult.ok, true, mobileResult.message);
  const mobileId = f.db.prepare("SELECT sale_id FROM commerce_market_sale_receipts WHERE operation_id='history_mobile_01'").get().sale_id;
  assert.equal(f.db.prepare("SELECT 1 FROM finance_entries WHERE source_type = 'commerce_sale' AND source_id = ?").get(pointSale.id), undefined);
  await page.getByRole("button", { name: "Satış Geçmişi", exact: true }).click();
  const history = page.getByRole("region", { name: "Satış Geçmişi" });
  const historyRow = id => history.locator(`[data-sale-id="${id}"]`);
  await expect(historyRow(mobileId)).toContainText("Telefon");
  await historyRow(mobileId).getByRole("button", { name: "İncele" }).click();
  await expect(dialog()).toContainText("Kasa iadesi kaydı: ₺1.000,00");
  await dialog().getByRole("button", { name: "Vazgeç", exact: true }).click();
  await page.getByRole("button", { name: "Satış Geçmişi", exact: true }).click();
  await expect(historyRow(pointSale.id)).toBeVisible();
  await expect(historyRow(ids.deniedOrder)).toHaveCount(0); await expect(historyRow(ids.deniedCredit)).toHaveCount(0);
  await expect(historyRow(otherBusiness.id)).toHaveCount(0); await expect(saleRow(old.id)).toHaveCount(0);
  holdPreview = true;
  await historyRow(pointSale.id).getByRole("button", { name: "İncele" }).click();
  await expect.poll(() => typeof releasePreview).toBe("function");
  await history.getByRole("button", { name: "Kapat" }).click(); releasePreview();
  await expect(dialog()).toHaveCount(0);
  await page.getByRole("button", { name: "Satış Geçmişi", exact: true }).click();
  await expect(historyRow(pointSale.id)).toBeVisible();
  changeScope = true;
  await historyRow(pointSale.id).getByRole("button", { name: "İncele" }).click();
  await expect(history).toHaveCount(0); await expect(dialog()).toHaveCount(0);
  await page.getByRole("button", { name: "Satış Geçmişi", exact: true }).click();
  await expect(historyRow(pointSale.id)).toBeVisible();
  lockHistory = true;
  await historyRow(pointSale.id).getByRole("button", { name: "İncele" }).click();
  await expect(history.getByRole("status")).toContainText("Satış doğrulanamadı");
  await expect(dialog()).toHaveCount(0); lockHistory = false;
  const stockBefore = f.db.prepare("SELECT quantity FROM inventory_balances WHERE product_id = 'p1' AND location_id = 'loc'").get().quantity;
  const pointsBefore = balance(f).availableMinor;
  await historyRow(pointSale.id).getByRole("button", { name: "İncele" }).click();
  await expect(dialog()).toContainText("Geri yüklenecek Puan: ₺1.000,00"); loseResponse = true; await confirm().click();
  await expect(retry()).toBeEnabled();
  await page.evaluate(() => window.__financeHarness.setPage("other"));
  await page.evaluate(() => window.__financeHarness.setPage("finance"));
  await expect(retry()).toBeEnabled(); await retry().click();
  assert.deepEqual(calls.at(-1), calls.at(-2));
  await expect(dialog()).toHaveCount(0);
  assert.equal(f.db.prepare("SELECT quantity FROM inventory_balances WHERE product_id = 'p1' AND location_id = 'loc'").get().quantity, stockBefore + 1);
  assert.equal(balance(f).availableMinor, pointsBefore + 100000);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_sale_full_refunds WHERE sale_id = ?").get(pointSale.id).n, 1);
  await page.getByRole("button", { name: "Satış Geçmişi", exact: true }).click();
  await expect(historyRow(pointSale.id)).toContainText("İade edildi");
  await expect(historyRow(pointSale.id).getByRole("button", { name: "İncele" })).toHaveCount(0);
  while (await historyRow(old.id).count() === 0) await history.getByRole("button", { name: "Daha eski satışlar" }).click();
  await historyRow(old.id).getByRole("button", { name: "İncele" }).click(); await expect(dialog()).toBeVisible();
  await confirm().click(); await expect(dialog()).toHaveCount(0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_sale_full_refunds WHERE sale_id = ?").get(old.id).n, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.equal(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('"kind":"full"'))), false);
  assert.deepEqual(errors, []); console.log("market-sale-full-refund-ui-smoke-ok");
} finally {
  await browser?.close(); await server?.close(); f.close(); rmSync(root, { recursive: true, force: true });
}
