import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { saleFixture, databaseState, load, marketSaleIpcModules } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { exampleRules, installRules, adjust, balance, capabilities } from "./test-helpers/commerce-benefits-fixture.mjs";

const { createCommerceOrder, updateCommerceOrderStatus } = load("commerce-order-store");
const rules = load("commerce-benefits-rules");
const f = saleFixture(), root = mkdtempSync(join(tmpdir(), "order-benefits-ui-"));
let server, browser, page, delayPreview = false, releasePreview, loseResponse = false;
let secureReads = 0, stateCalls = 0;
const calls = [], previews = [], receipts = [], errors = [], consoleMessages = [], handlers = new Map();
const count = table => Number(f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n);
try {
  for (const capability of capabilities.expandBusinessCapabilities(["commerce.orders", "commerce.customer_credit", "commerce.wholesale"])) {
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(capability);
  }
  installRules(f, exampleRules().map(rule => ({ ...rule, startsAt: 0 })));
  adjust(f); adjust(f, 10000, { customerId: "c2", operationKey: "opening-c2" });
  f.db.prepare("INSERT INTO customer_commercial_profiles(customer_id,business_id,company_name,dealer_status,price_group,created_at,updated_at) VALUES ('c2','b1','Fixture','active','dealer_a','fixture','fixture')").run();
  const seed = (note, extra = {}, confirmed = true) => {
    const detail = createCommerceOrder(f.path, { customerId: "c1", source: "desktop", items: [{ productId: "p1", quantity: 1 }], note, ...extra }, { wholesaleEnabled: true });
    if (confirmed) updateCommerceOrderStatus(f.path, { orderId: detail.order.id, status: "confirmed" });
    return detail.order.id;
  };
  const ids = {
    plain: seed("points-only"), coupon: seed("accepted-discount", { discountTotal: 145 }),
    mismatch: seed("mismatching-discount", { discountTotal: 1 }),
    anonymous: seed("anonymous", { customerId: "" }), remote: seed("remote", { source: "web-online-sales", deliverySnapshot: { method: "pickup" } }),
    remoteDealer: seed("remote-dealer"), wholesale: seed("local-wholesale", { customerId: "c2", source: "desktop-wholesale" }),
    zero: seed("zero", { discountTotal: 1000 }), credit: seed("credit"), legacy: seed("legacy", { discountTotal: 5 }),
    disabled: seed("disabled"), placed: seed("placed", {}, false)
  };
  f.db.prepare("UPDATE commerce_orders SET source = 'web-dealer' WHERE id = ?").run(ids.remoteDealer);
  const electron = { ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, app: { getPath: () => root },
    safeStorage: { isEncryptionAvailable: () => { secureReads++; return true; }, getSelectedStorageBackend: () => "gnome_libsecret",
      encryptString: text => Buffer.from(text).map(byte => byte ^ 0xa5), decryptString: bytes => Buffer.from(bytes).map(byte => byte ^ 0xa5).toString() } };
  const modules = marketSaleIpcModules(electron);
  modules.ipc.registerCommerceIpcHandlers({ databasePath: () => f.path, assertUnlocked() {}, onMutation() {
    // The actual handler must keep post-commit errors uncertain even when they resemble a domain rejection.
    if (loseResponse) { loseResponse = false; throw new (load("commerce-benefits-engine").CommerceBenefitsError)("BENEFITS_QUOTE_CHANGED"); }
  } });
  const frame = { url: "file:///trusted/index.html" }, sender = { getType: () => "window", mainFrame: frame }, event = { sender, senderFrame: frame };
  let bridge;
  electron.contextBridge = { exposeInMainWorld(_name, value) { bridge = value.commerce; } };
  electron.ipcRenderer = { invoke: async (channel, ...args) => channel === "appLock:getStatus" ? { locked: false } : handlers.get(channel)(event, ...args) };
  modules.preload();
  const key = new (load("commerce-benefits-key").CommerceBenefitsKey)(root, electron.safeStorage).load();
  const coupon = rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.issueCommerceBenefitCoupon(tx, "b1", key,
    { ruleId: "coupon100", maxUses: 1, maxUsesPerCustomer: 1, expiresAt: Date.now() + 600000 }));
  const configure = families => rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.configureCommerceBenefits(tx, "b1", families));
  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => consoleMessages.push(message.text()));
  await page.exposeFunction("__orderBenefitsCall", async (method, input) => {
    if (method === "getMarketSaleBenefitsState") stateCalls++;
    if (method === "previewOrderBenefits") {
      previews.push(input);
      const result = await bridge[method](input);
      if (delayPreview) await new Promise(done => { releasePreview = done; });
      return result;
    }
    if (method === "fulfillOrder" || method === "tryFulfillOrder") {
      calls.push(input);
      try {
        const result = await bridge[method](input);
        if (result.ok) receipts.push(result.value);
        return result;
      } finally { await page.evaluate(() => window.dispatchEvent(new Event("orders-changed"))); }
    }
    return bridge[method](input);
  });
  await page.addInitScript(() => {
    const methods = ["listOrders", "getOrder", "updateOrderStatus", "getMarketSaleBenefitsState", "previewOrderBenefits", "tryFulfillOrder", "fulfillOrder"];
    window.yardimciDesktop = { commerce: Object.fromEntries(methods.map(method => [method, input => window.__orderBenefitsCall(method, input)])) };
    window.yardimciDesktop.commerce.onOrdersChanged = callback => {
      window.addEventListener("orders-changed", callback);
      return () => window.removeEventListener("orders-changed", callback);
    };
  });
  await page.route("**/order-benefits-test", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/order-benefits-test",
    `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/commerce-order-benefits.tsx")}"></script></body></html>`) }));
  await page.goto(`${server.resolvedUrls.local[0]}order-benefits-test`);
  const select = async (id, note) => {
    await page.getByRole("textbox", { name: "Sipariş ara", exact: true }).fill(id);
    await page.locator(".market-order-card").click();
    await expect(page.locator(".market-order-note")).toHaveText(note);
  };
  const optIn = page.getByRole("checkbox", { name: "İndirim ve Puan", exact: true });
  const fulfill = page.getByRole("button", { name: "Siparişi Tamamla", exact: true });
  const calculate = page.getByRole("button", { name: "Tutarı Hesapla", exact: true });
  const payment = page.getByRole("combobox", { name: "Sipariş ödeme tercihi", exact: true });
  const quote = page.getByLabel("İndirim ve Puan önizlemesi", { exact: true });
  const status = page.getByTestId("topbar-status");
  const refreshAvailability = () => page.evaluate(() => window.__orderBenefitsControls.refreshAvailability());
  const noGrants = () => {
    assert.equal(count("commerce_sales"), 0); assert.equal(count("commerce_benefit_reservations"), 0);
    assert.equal(count("commerce_benefit_snapshots"), 0); assert.equal(balance(f).availableMinor, 10000);
  };
  // Source, status, customer, capability and family gates use only the key-free probe.
  const keyReads = secureReads;
  for (const [id, note] of [[ids.remote, "remote"], [ids.remoteDealer, "remote-dealer"], [ids.placed, "placed"], [ids.zero, "zero"], [ids.anonymous, "anonymous"]]) {
    await select(id, note); await expect(optIn).toHaveCount(0);
  }
  assert.equal(secureReads, keyReads); assert.equal(previews.length, 0); noGrants();
  await select(ids.plain, "points-only"); await expect(optIn).toBeVisible();
  await payment.selectOption("credit"); await expect(optIn).toBeDisabled(); await expect(fulfill).toBeEnabled();
  await payment.selectOption("cash");
  configure({ coupon: true, points: false, payment_modifier: true }); await refreshAvailability();
  await expect(optIn).toHaveCount(0); await expect(page.getByText(/Siparişe yeni indirim eklenemez/)).toBeVisible();
  configure({ coupon: false, points: false, payment_modifier: false }); await refreshAvailability(); await expect(optIn).toHaveCount(0);
  configure({ coupon: true, points: true, payment_modifier: true }); await refreshAvailability(); await expect(optIn).toBeVisible();
  // Drain the preceding family-refresh effect before measuring the disabled capability gate.
  await page.waitForTimeout(180);
  const probes = stateCalls;
  await page.evaluate(() => window.__orderBenefitsControls.enabled(false)); await expect(optIn).toHaveCount(0);
  assert.equal(stateCalls, probes); assert.equal(secureReads, keyReads);
  await page.evaluate(() => window.__orderBenefitsControls.enabled(true)); await expect(optIn).toBeVisible();
  await optIn.check(); await expect(fulfill).toBeDisabled();
  await expect(page.getByLabel("Kupon kodu", { exact: true })).toHaveCount(0);
  await page.getByLabel("Kullanılacak Puan", { exact: true }).fill("100");
  const beforePreview = databaseState(f.db);
  await calculate.click(); await expect(fulfill).toBeEnabled();
  assert.deepEqual(databaseState(f.db), beforePreview); noGrants();
  await expect(quote).toContainText("900,00"); await expect(quote).toContainText("22,50");
  // Changed inputs and late previews cannot authorize completion, including across selection changes.
  await page.getByLabel("Kullanılacak Puan", { exact: true }).fill("50"); await expect(fulfill).toBeDisabled();
  delayPreview = true; releasePreview = undefined; const previewCount = previews.length;
  await calculate.click(); await expect.poll(() => previews.length).toBe(previewCount + 1);
  await expect.poll(() => typeof releasePreview).toBe("function");
  await payment.selectOption("card"); releasePreview(); delayPreview = false;
  await expect(calculate).toBeEnabled(); await expect(fulfill).toBeDisabled(); await expect(quote).toHaveCount(0);
  await calculate.click(); await expect(fulfill).toBeEnabled();
  f.db.prepare("UPDATE commerce_orders SET customer_id = 'c2',customer_name = 'c2' WHERE id = ?").run(ids.plain);
  await page.getByRole("button", { name: "Siparişleri yeniden oku" }).click(); await expect(fulfill).toBeDisabled();
  await calculate.click(); await expect(fulfill).toBeEnabled();
  delayPreview = true; releasePreview = undefined; const selectedPreview = previews.length;
  await calculate.click(); await expect.poll(() => previews.length).toBe(selectedPreview + 1);
  await expect.poll(() => typeof releasePreview).toBe("function");
  await select(ids.mismatch, "mismatching-discount"); releasePreview(); delayPreview = false;
  await expect(optIn).not.toBeChecked(); await expect(quote).toHaveCount(0);
  await optIn.check(); await calculate.click(); await expect(status).toContainText("İndirim siparişle eşleşmiyor");
  await expect(fulfill).toBeDisabled(); noGrants();
  // New payment discounts on undiscounted orders fail closed and preserve the immutable total.
  await select(ids.plain, "points-only"); await optIn.check(); await payment.selectOption("bank");
  await calculate.click(); await expect(status).toContainText("sipariş toplamı değişmez"); await expect(fulfill).toBeDisabled();
  assert.equal(f.db.prepare("SELECT total FROM commerce_orders WHERE id = ?").get(ids.plain).total, 1000);
  await payment.selectOption("cash"); await page.getByLabel("Kullanılacak Puan", { exact: true }).fill("100");
  await calculate.click(); await expect(fulfill).toBeEnabled();
  const earn = exampleRules().find(rule => rule.id === "earn");
  rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.saveCommerceBenefitsRule(tx, "b1", { ...earn, startsAt: 0, version: 2, percentBps: 500 }));
  await fulfill.click(); await expect(status).toContainText("Yeniden hesaplayın"); await expect(fulfill).toBeDisabled(); noGrants();
  rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.saveCommerceBenefitsRule(tx, "b1", { ...earn, startsAt: 0, version: 3 }));
  await calculate.click(); await expect(fulfill).toBeEnabled(); await fulfill.click();
  await expect(status).toContainText("Sipariş tamamlandı"); assert.equal(count("commerce_sales"), 1);
  assert.equal(count("commerce_benefit_snapshots"), 1); assert.equal(balance(f, "c2").availableMinor, 2250);
  // Actual accepted discount + coupon + bank + points; preview alone still grants/reserves nothing.
  await select(ids.coupon, "accepted-discount"); await optIn.check(); await payment.selectOption("bank");
  await page.getByLabel("Kupon kodu", { exact: true }).fill(coupon.secret);
  await page.getByLabel("Kullanılacak Puan", { exact: true }).fill("100"); await calculate.click(); await expect(fulfill).toBeEnabled();
  await expect(quote).toContainText("755,00"); await expect(quote).toContainText("100,00"); await expect(quote).toContainText("18,88");
  assert.equal(balance(f).availableMinor, 10000); assert.equal(count("commerce_benefit_reservations"), 1);
  // A lost response after COMMIT keeps the exact secret-bearing command and selected order across unmounts/events.
  const beforeLostCalls = calls.length;
  loseResponse = true; await fulfill.dblclick();
  const retry = page.getByRole("button", { name: "Sipariş Sonucunu Doğrula", exact: true });
  await expect(retry).toBeEnabled(); await expect(payment).toBeDisabled(); await expect(page.getByLabel("Kupon kodu", { exact: true })).toBeDisabled();
  assert.equal(calls.length, beforeLostCalls + 1, "Double click must submit only once");
  assert.equal(count("commerce_sales"), 2); assert.equal(count("commerce_benefit_snapshots"), 2);
  const callsBeforeRetry = calls.length;
  await page.getByRole("button", { name: "Görünümü değiştir" }).click();
  await page.evaluate(id => window.__orderBenefitsControls.attemptChanges(id), ids.legacy);
  await page.getByRole("button", { name: "Siparişleri yeniden oku" }).click();
  configure({ coupon: false, points: false, payment_modifier: false });
  await page.getByRole("button", { name: "Görünümü değiştir" }).click();
  await expect(page.locator(".market-order-note")).toHaveText("accepted-discount"); await expect(retry).toBeEnabled();
  assert.equal(await page.evaluate(() => window.__orderBenefitsControls.hasSecret()), true);
  await expect(page.getByRole("button", { name: "Siparişi İptal Et", exact: true })).toBeDisabled();
  await retry.click(); await expect(status).toContainText("755,00"); await expect(status).toContainText("18,88");
  assert.equal(await page.evaluate(() => window.__orderBenefitsControls.hasSecret()), false);
  assert.equal(await page.evaluate(() => window.__orderBenefitsControls.hasPending()), false);
  assert.equal(calls.length, callsBeforeRetry + 1);
  assert(JSON.stringify(calls.at(-1)) === JSON.stringify(calls.at(-2)), "Replay must use the exact immutable command and operationKey");
  assert.equal(count("commerce_sales"), 2); assert.equal(count("commerce_benefit_snapshots"), 2);
  assert.equal(balance(f).availableMinor, 1888);
  const receipt = receipts.at(-1), tender = f.db.prepare("SELECT * FROM commerce_sale_settlements WHERE sale_id = ?").get(receipt.sale.id);
  assert.equal(receipt.sale.total, 855); assert.equal(receipt.order.order.total, 855);
  assert.equal(tender.cash_received_minor, 75500); assert.equal(tender.points_tender_minor, 10000);
  assert.equal(f.db.prepare("SELECT amount_minor FROM finance_entries WHERE source_id = ?").get(receipt.sale.id).amount_minor, 75500);
  assert(!JSON.stringify(receipts).includes(coupon.secret)); assert(!JSON.stringify(databaseState(f.db)).includes(coupon.secret));
  configure({ coupon: true, points: true, payment_modifier: true });
  await select(ids.mismatch, "mismatching-discount"); await optIn.check();
  assert((await page.getByLabel("Kupon kodu", { exact: true }).inputValue()) === "", "Coupon input must be cleared");
  await optIn.uncheck();
  // Local wholesale uses the real accepted dealer price, with earning only after confirmed payment.
  await select(ids.wholesale, "local-wholesale"); await optIn.check(); await calculate.click(); await expect(fulfill).toBeEnabled();
  await expect(quote).toContainText("800,00"); await fulfill.click(); await expect(status).toContainText("20,00");
  // Legacy fulfillment remains usable without opt-in or protected-key access, including credit/no-payment/disabled root.
  const legacyKeyReads = secureReads, snapshots = count("commerce_benefit_snapshots");
  for (const [id, note, choice] of [[ids.legacy, "legacy", "cash"], [ids.credit, "credit", "credit"], [ids.zero, "zero", null]]) {
    await select(id, note); if (choice) await payment.selectOption(choice);
    await fulfill.click(); await expect(page.locator(".market-order-detail")).toContainText("tarihinde tamamlandı");
    assert.equal(calls.at(-1).benefits, undefined);
  }
  f.db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.benefits'").run();
  await select(ids.disabled, "disabled"); await expect(optIn).toHaveCount(0); await fulfill.click();
  await expect(page.locator(".market-order-detail")).toContainText("tarihinde tamamlandı");
  assert.equal(calls.at(-1).benefits, undefined); assert.equal(secureReads, legacyKeyReads); assert.equal(count("commerce_benefit_snapshots"), snapshots);
  assert(!JSON.stringify(await page.evaluate(() => [Object.entries(localStorage), Object.entries(sessionStorage)])).includes(coupon.secret));
  assert(!consoleMessages.some(message => message.includes(coupon.secret))); assert.deepEqual(errors, []);
  console.log("commerce-order-benefits-ui-smoke-ok: real Vite/preload/main/SQLite, gates, immutable totals, previews, stale quote, exact replay, secret clearing and legacy fulfillment");
} finally {
  releasePreview?.(); await browser?.close(); await server?.close(); f.close(); rmSync(root, { recursive: true, force: true });
}
