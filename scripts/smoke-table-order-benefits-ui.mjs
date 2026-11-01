import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { chooseSearchSelect } from "./test-helpers/search-select.mjs";
import { tableFixture, tableOrder, tables, benefits, load, mockedTableModules, databaseState } from "./test-helpers/table-order-benefits-fixture.mjs";
import { capabilities } from "./test-helpers/commerce-benefits-fixture.mjs";

const f = tableFixture(), root = mkdtempSync(join(tmpdir(), "table-benefits-ui-"));
const rules = load("commerce-benefits-rules"), tableStore = load("database/table-store"), orderStore = load("database/table-order-store");
const dashboard = () => load("desktop-dashboard-service").createDesktopDashboardData(f.db, f.path, "");
const handlers = new Map(), commands = [], previews = [], errors = [], consoleMessages = [];
let server, browser, page, bridge, keyReads = 0, probeCalls = 0, delayPreview = false, releasePreview;
let responseMode = "normal", projectionFailure = false, failNextProjection = false;
const n = name => Number(f.db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n);
const configure = families => rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.configureCommerceBenefits(tx, "b1", families));
const allFamilies = { coupon: true, points: true, payment_modifier: true };
try {
  // This fixture exercises both restaurant checkout and accommodation transfer.
  // The Market-only profile would correctly hide folios despite seeded capabilities.
  f.db.prepare("UPDATE business SET profile_id = 'pension_restaurant' WHERE id = 'b1'").run();
  for (const id of capabilities.expandBusinessCapabilities(["accommodation.folio"])) {
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(id);
  }
  f.db.exec(`INSERT INTO rooms(id,name,created_at,updated_at) VALUES ('room','Room','fixture','fixture');
    INSERT INTO customer_room_stays(id,customer_id,room_id,check_in_date,check_out_date,guest_count,status,created_at,updated_at)
      VALUES ('stay','c1','room','2035-01-01','2035-01-02',1,'checked_in','fixture','fixture');
    INSERT INTO room_folios(id,stay_id,room_id,customer_id,check_in_date,opened_at,currency,status,created_at,updated_at)
      VALUES ('folio','stay','room','c1','2035-01-01','fixture','TRY','open','fixture','fixture')`);
  const orders = Object.fromEntries(["coupon", "legacy", "plain", "manual", "zero", "anonymous", "invalidCustomer", "folio", "projection"].map(name =>
    [name, tableOrder(f, { customerId: ["anonymous", "folio"].includes(name) ? "" : "c1" })]));
  tables.updateTableOrderDiscount(f.db, { orderId: orders.manual.id, discountTotal: 5 });
  tables.updateTableOrderDiscount(f.db, { orderId: orders.zero.id, discountTotal: 1000 });
  f.db.prepare("UPDATE customers SET deleted_at='fixture' WHERE id='c3'").run();
  f.db.prepare("UPDATE tables SET current_customer_id='c3' WHERE id=?").run(orders.invalidCustomer.tableId);
  const electron = { app: { getPath: () => root }, ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    safeStorage: { isEncryptionAvailable() { keyReads++; return true; }, getSelectedStorageBackend: () => "gnome_libsecret",
      encryptString: text => Buffer.from(text).map(byte => byte ^ 0xa5), decryptString: bytes => Buffer.from(bytes).map(byte => byte ^ 0xa5).toString() },
    contextBridge: { exposeInMainWorld(_name, value) { bridge = value; } } };
  const modules = mockedTableModules(electron);
  const project = result => result.ok ? { ...result, dashboardData: dashboard() } : result;
  const facade = {
    getTableOrderBenefitsState: () => benefits.getTableOrderBenefitsState(f.db),
    previewTableOrderBenefits: (input, owner) => benefits.previewTableOrderBenefits(f.db, input, owner),
    settleTableOrderBenefits: (input, owner) => benefits.settleTableOrderBenefits(f.db, input, owner),
    getActiveTableOrder: id => orderStore.getActiveTableOrder(f.db, id), listTableOrders: () => orderStore.listTableOrders(f.db),
    assignTableCustomer: input => project(tableStore.assignTableCustomer(f.db, input)),
    updateTableStatus: input => project(tableStore.updateTableStatus(f.db, input)),
    ...Object.fromEntries(["openTableOrder", "addTableOrderItem", "updateTableOrderItemQuantity", "updateTableOrderItemNote", "updateTableOrderDiscount",
      "removeTableOrderItem", "updateTableOrderStatus", "closeTableOrder"].map(method => [method, input => project(tables[method](f.db, input))]))
  };
  const assertCapability = id => assert(f.db.prepare("SELECT 1 FROM business_capabilities WHERE capability_id=? AND business_id='b1' AND is_enabled=1").get(id));
  const options = { getDatabase: () => facade, assertUnlocked() {}, assertCapability, isTrustedRendererUrl: url => url === "file:///trusted/index.html" };
  modules.ipc.registerTableOrderIpcHandlers(options);
  modules.roomTableIpc.registerRoomTableIpcHandlers(options);
  modules.folioIpc.registerRoomFolioIpcHandlers({ databasePath: () => f.path, assertUnlocked() {}, assertCapability() {} });
  handlers.set("dashboard:getData", () => { if (projectionFailure) { projectionFailure = false; throw new Error("projection_unavailable"); } return dashboard(); });
  const frame = { url: "file:///trusted/index.html" }, sender = { getType: () => "window", mainFrame: frame }, event = { sender, senderFrame: frame };
  electron.ipcRenderer = { invoke: async (channel, ...args) => {
    if (channel === "appLock:getStatus") return { locked: false };
    const result = handlers.get(channel)(event, ...args);
    if (channel === "tableOrder:close" && args[0]?.benefits) {
      if (failNextProjection) { failNextProjection = false; projectionFailure = true; }
      if (responseMode === "throw") { responseMode = "normal"; throw new Error("lost_after_commit"); }
      if (responseMode === "ambiguous") { responseMode = "normal"; return { ok: true, value: { orderId: args[0].orderId } }; }
    }
    return result;
  } };
  modules.preload();
  const key = new (load("commerce-benefits-key").CommerceBenefitsKey)(root, electron.safeStorage).load();
  const coupon = rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.issueCommerceBenefitCoupon(tx, "b1", key,
    { ruleId: "coupon100", maxUses: 1, maxUsesPerCustomer: 1, expiresAt: Date.now() + 600000 }));
  const baselineKeyReads = keyReads;
  server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }); page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message)); page.on("console", message => consoleMessages.push(message.text()));
  await page.exposeFunction("__tableBenefitsCall", async (method, ...args) => {
    if (method === "getTableOrderBenefitsState") probeCalls++;
    if (method === "previewTableOrderBenefits") {
      previews.push(args[0]); const result = await bridge[method](...args);
      if (delayPreview) await new Promise(done => { releasePreview = done; });
      return result;
    }
    if (method === "settleTableOrderBenefits" || method === "closeTableOrder") commands.push(args);
    return bridge[method](...args);
  });
  await page.addInitScript(initial => {
    window.__tableBenefitsDashboard = initial;
    window.yardimciDesktop = Object.fromEntries(["getTableOrderBenefitsState", "previewTableOrderBenefits", "settleTableOrderBenefits", "getActiveTableOrder",
      "listTableOrders", "getDashboardData", "assignTableCustomer", "updateTableStatus", "getRoomFolioData", "addRoomFolioManualItem", "openTableOrder",
      "addTableOrderItem", "updateTableOrderItemQuantity", "updateTableOrderItemNote", "updateTableOrderDiscount", "removeTableOrderItem", "updateTableOrderStatus",
      "closeTableOrder"].map(method => [method, (...args) => window.__tableBenefitsCall(method, ...args)]));
  }, dashboard());
  await page.route("**/table-benefits-test", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/table-benefits-test",
    `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/table-order-benefits.tsx")}"></script></body></html>`) }));
  await page.goto(`${server.resolvedUrls.local[0]}table-benefits-test`);
  const optIn = page.getByRole("checkbox", { name: "İndirim ve Puan", exact: true });
  const button = name => page.getByRole("button", { name, exact: true });
  const calculate = button("Tutarı Hesapla"), pay = button("İndirim ve Puan ile Kapat"), retry = button("Adisyon Sonucunu Doğrula");
  const quote = page.getByLabel("İndirim ve Puan önizlemesi", { exact: true });
  const method = page.getByLabel("Adisyon ödeme yöntemi", { exact: true }), points = page.getByLabel("Kullanılacak Puan", { exact: true });
  const refresh = () => page.evaluate(() => window.__tableBenefitsControls.refresh());
  const open = async order => {
    await button(`${order.tableName} aç`).click();
    await expect(page.getByLabel("Masa hesabı", { exact: true })).toBeVisible();
    await expect(button("Ödendi / Kapat")).toBeEnabled();
  };
  const confirmPay = async () => { await pay.click(); await button("Tahsilatı Onayla ve Kapat").click(); };
  const closed = () => expect(page.locator(".workspace-page-frame")).toHaveCount(0);
  const assertLocked = async () => {
    await expect(method).toBeDisabled(); await expect(points).toBeDisabled();
    await expect(button("Düzenle")).toBeDisabled(); await expect(button("Adisyonu İptal Et")).toBeDisabled();
    await expect(button("Odaya Aktar")).toBeDisabled(); await expect(page.getByLabel("Müşteri seç", { exact: true })).toBeDisabled();
    await expect(button("Fixture product adetini artır")).toBeDisabled();
    await expect(button("Masa çalışma alanını kapat")).toBeDisabled();
    assert.equal(await page.evaluate(() => window.__tableBenefitsControls.attemptClose()), false);
    assert.equal(await page.evaluate(id => window.__tableBenefitsControls.open(id), orders.legacy.tableId), false);
  };
  // Manual/zero/disabled/no-family paths do not access the key or preview. Legacy is the default.
  for (const order of [orders.manual, orders.zero]) { await open(order); await expect(optIn).toHaveCount(0); }
  await open(orders.legacy); await expect(optIn).not.toBeChecked(); await expect(method).toHaveCount(0);
  const probesBeforeDisabled = probeCalls;
  f.db.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='commerce.benefits'"); await refresh();
  await expect.poll(() => probeCalls).toBeGreaterThan(probesBeforeDisabled); await expect(optIn).toHaveCount(0);
  f.db.exec("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id='commerce.benefits'");
  configure({ coupon: false, points: false, payment_modifier: false }); await refresh(); await expect(optIn).toHaveCount(0);
  configure(allFamilies); await refresh(); await expect(optIn).toBeVisible();
  assert.equal(keyReads, baselineKeyReads); assert.equal(previews.length, 0);
  await button("Düzenle").click(); await expect(optIn).toBeDisabled(); await button("Vazgeç").click();
  for (const order of [orders.anonymous, orders.invalidCustomer]) {
    await open(order); await optIn.check(); await expect(points).toHaveCount(0); await optIn.uncheck();
  }
  // Canonical relation picker and item controller both invalidate a real quote.
  await open(orders.coupon); await optIn.check(); await points.fill(""); await expect(calculate).toBeDisabled(); await expect(pay).toBeDisabled();
  await points.fill("999999999999999999999999"); await expect(calculate).toBeDisabled(); await expect(points).toHaveAttribute("aria-invalid", "true");
  await points.fill("100"); await method.selectOption("bank");
  await page.getByLabel("Kupon kodu", { exact: true }).fill(coupon.secret);
  const stockBefore = f.db.prepare("SELECT * FROM inventory_movements").all();
  await calculate.click(); await expect(pay).toBeEnabled();
  await expect(quote).toContainText("755,00"); await expect(quote).toContainText("100,00"); await expect(quote).toContainText("18,88");
  assert.equal(n("table_order_settlements"), 0); assert.equal(n("commerce_benefit_reservations"), 0);
  assert.deepEqual(f.db.prepare("SELECT * FROM inventory_movements").all(), stockBefore);
  await method.selectOption("card"); await expect(pay).toBeDisabled(); await expect(quote).toHaveCount(0);
  await method.selectOption("bank"); await calculate.click(); await expect(pay).toBeEnabled();
  await chooseSearchSelect(page, "Müşteri seç", { value: "c2" }); await expect(pay).toBeDisabled(); await expect(quote).toHaveCount(0);
  await chooseSearchSelect(page, "Müşteri seç", { value: "c1" });
  await expect(calculate).toBeEnabled();
  await expect(points).toHaveValue("0"); await points.fill("100");
  // Revision reloads intentionally clear transient coupon inputs; enter the code for the new context.
  await page.getByLabel("Kupon kodu", { exact: true }).fill(coupon.secret);
  await calculate.click(); await expect(pay).toBeEnabled();
  await button("Fixture product adetini artır").click(); await expect(pay).toBeDisabled(); await expect(quote).toHaveCount(0);
  await button("Fixture product adetini azalt").click(); await expect(calculate).toBeEnabled();
  await points.fill("100"); await page.getByLabel("Kupon kodu", { exact: true }).fill(coupon.secret);
  // A delayed preview locks mutations/close. Remote reassignment during the read makes its response unusable.
  delayPreview = true; await calculate.click(); await expect.poll(() => typeof releasePreview).toBe("function"); await assertLocked();
  f.db.prepare("UPDATE tables SET current_customer_id='c2' WHERE id=?").run(orders.coupon.tableId); await refresh();
  releasePreview(); delayPreview = false; releasePreview = undefined;
  await expect(calculate).toBeEnabled(); await expect(pay).toBeDisabled(); await expect(quote).toHaveCount(0);
  await chooseSearchSelect(page, "Müşteri seç", { value: "c1" }); await expect(calculate).toBeEnabled();
  await points.fill("100"); await page.getByLabel("Kupon kodu", { exact: true }).fill(coupon.secret); await calculate.click(); await expect(pay).toBeEnabled();
  // Rules can change without a renderer projection. Main rejects the old signed quote and no payment is invented.
  const earn = JSON.parse(f.db.prepare("SELECT canonical_json FROM commerce_benefit_rules WHERE id='earn'").get().canonical_json);
  rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.saveCommerceBenefitsRule(tx, "b1", { ...earn, version: 2, percentBps: 300 }));
  await confirmPay(); await expect(page.getByRole("alert")).toContainText("Yeniden hesaplayın"); await expect(pay).toBeDisabled();
  assert.equal(n("table_order_settlements"), 0);
  rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.saveCommerceBenefitsRule(tx, "b1", { ...earn, version: 3 }));
  await calculate.click(); await expect(pay).toBeEnabled();
  await pay.click(); const confirmation = page.getByRole("dialog");
  await expect(confirmation).toContainText("755,00"); await expect(confirmation).toContainText("100,00"); await expect(confirmation).toContainText("18,88");
  await expect(confirmation).toContainText("Banka"); await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
  const beforePayStock = f.db.prepare("SELECT * FROM inventory_movements").all();
  const callsBefore = commands.length; responseMode = "throw";
  await button("Tahsilatı Onayla ve Kapat").dblclick(); await expect(retry).toBeEnabled(); await assertLocked();
  assert.equal(commands.length, callsBefore + 1); assert.equal(n("table_order_settlements"), 1);
  const exact = structuredClone(commands.at(-1));
  await button("Görünümü değiştir").click(); await refresh();
  await page.evaluate(() => window.__tableBenefitsControls.remountAccount());
  await page.evaluate(() => window.__tableBenefitsControls.remountAccount());
  configure({ coupon: false, points: false, payment_modifier: false });
  f.db.prepare("UPDATE tables SET current_customer_id='c2' WHERE id=?").run(orders.coupon.tableId);
  await button("Görünümü değiştir").click(); await expect(retry).toBeEnabled();
  await expect(page.getByLabel("Kupon kodu", { exact: true })).toHaveValue(coupon.secret);
  // A rejection after an uncertain commit cannot release its immutable command or close guard.
  f.db.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='commerce.benefits'");
  await retry.click(); await expect(retry).toBeEnabled(); await assertLocked(); assert.deepEqual(commands.at(-1), exact);
  f.db.exec("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id='commerce.benefits'");
  await retry.click(); await closed(); assert.deepEqual(commands.at(-1), exact);
  assert.equal(n("table_order_settlements"), 1); assert.equal(n("commerce_benefit_snapshots"), 1);
  assert.deepEqual(f.db.prepare("SELECT * FROM inventory_movements").all(), beforePayStock);
  const tender = f.db.prepare("SELECT * FROM table_order_settlements WHERE order_id=?").get(orders.coupon.id);
  assert.equal(tender.cash_received_minor, 75500); assert.equal(tender.points_tender_minor, 10000); assert.equal(tender.discount_minor, 14500);
  assert.equal(tender.customer_id, "c1"); assert.equal(tender.payment_method, "bank");
  const finance = f.db.prepare("SELECT * FROM finance_entries WHERE source_id=?").get(orders.coupon.id);
  assert.equal(finance.amount_minor, 75500); assert.equal(finance.payment_method, "bank"); assert.equal(n("commerce_sales"), 0);
  configure(allFamilies);
  await open(orders.legacy); await optIn.check(); await expect(page.getByLabel("Kupon kodu", { exact: true })).toHaveValue("");
  await points.fill("0"); await calculate.click(); await expect(pay).toBeEnabled(); responseMode = "ambiguous";
  await confirmPay(); await expect(retry).toBeEnabled(); const ambiguous = structuredClone(commands.at(-1));
  await retry.click(); await closed(); assert.deepEqual(commands.at(-1), ambiguous); assert.equal(n("table_order_settlements"), 2);
  // A confirmed success stays committed when refreshing the dashboard throws.
  await open(orders.projection); await optIn.check(); await calculate.click(); await expect(pay).toBeEnabled();
  failNextProjection = true; const beforeProjection = commands.length; await confirmPay(); await closed();
  assert.equal(commands.length, beforeProjection + 1); await expect(page.getByTestId("table-status")).toContainText("ödendi");
  // Manual-discount legacy close and room-folio transfer keep the original path, without key access or benefits.
  const legacyReads = keyReads, snapshots = n("commerce_benefit_snapshots");
  await open(orders.plain); await expect(optIn).not.toBeChecked(); await expect(method).toHaveCount(0);
  await button("Ödendi / Kapat").click();
  await page.getByRole("dialog").getByRole("button", { name: "Ödendi / Kapat", exact: true }).click(); await closed();
  assert.deepEqual(commands.at(-1), [orders.plain.id, "paid"]);
  await open(orders.manual); await expect(optIn).toHaveCount(0); await button("Ödendi / Kapat").click();
  await page.getByRole("dialog").getByRole("button", { name: "Ödendi / Kapat", exact: true }).click(); await closed();
  assert.equal(f.db.prepare("SELECT discount_total FROM table_orders WHERE id=?").get(orders.manual.id).discount_total, 5);
  assert.equal(f.db.prepare("SELECT payment_method FROM finance_entries WHERE source_id=?").get(orders.manual.id).payment_method, "unspecified");
  await open(orders.folio); await expect(button("Odaya Aktar")).toBeEnabled(); await optIn.check(); await expect(button("Odaya Aktar")).toBeDisabled();
  await optIn.uncheck(); await button("Odaya Aktar").click(); await button("Aktar").click(); await closed();
  assert.equal(n("commerce_benefit_snapshots"), snapshots); assert.equal(keyReads, legacyReads);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM finance_entries WHERE source_id=?").get(orders.folio.id).n, 0);
  assert(!JSON.stringify(databaseState(f.db)).includes(coupon.secret));
  assert(!JSON.stringify(await page.evaluate(() => [Object.entries(localStorage), Object.entries(sessionStorage)])).includes(coupon.secret));
  assert(!consoleMessages.some(message => message.includes(coupon.secret))); assert.deepEqual(errors, []);
  console.log("table-order-benefits-ui-smoke-ok: canonical TableWorkspace, actual preload/main/SQLite, coupon+bank+points, stale customer/quantity/rules, exact uncertain replay, secret clearing, legacy/folio");
} finally {
  releasePreview?.(); await browser?.close(); await server?.close(); f.close(); rmSync(root, { recursive: true, force: true });
}
