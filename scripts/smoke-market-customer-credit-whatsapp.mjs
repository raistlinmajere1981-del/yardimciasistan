import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import process from "node:process";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { createServer } from "vite";
import { buildCustomerCreditWhatsAppMessage, customerCreditWhatsAppFingerprint, prepareWhatsAppAction } from "@yardimci-asistan/whatsapp-bridge";

const appPath = join(process.cwd(), "apps/desktop-app");
const require = createRequire(import.meta.url);
// Keep testing compiled artifacts; the VM's relative imports resolve beside commerce-ipc.js.
const commerceRequire = createRequire(join(appPath, "dist-electron/commerce-ipc.js"));
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const runtime = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { applyBusinessProfileCapabilities, readBusinessCapabilitySnapshot, setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const dataDir = mkdtempSync(join(tmpdir(), "yardimci-m83-"));
const database = new DesktopDatabase({ appPath, userDataPath: dataDir });
const artifacts = join(process.cwd(), "artifacts/screenshots/m83-credit-whatsapp");
let raw, server, browser, page;

try {
  database.initialize();
  const setupResult = database.saveInitialSetup({
    businessName: "Veresiye WhatsApp Test İşletmesi",
    profileId: "market",
    phone: "+905550002014",
    whatsapp: "+905550002014",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "credit-whatsapp-secret",
    autoSyncEnabled: false,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiModel: "",
    aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1",
    aiTimeoutSeconds: 30,
    aiApiKey: "",
    clearAiApiKey: false,
    servicePreferences: { whatsapp: true, android: true },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  const path = database.databasePath;
  applyBusinessProfileCapabilities(path, "cafe", { preserveUserOverrides: false });
  for (const capability of ["commerce.customer_credit", "retail.barcode", "service.whatsapp"]) setBusinessCapability(path, { capability, enabled: true });
  setBusinessCapability(path, { capability: "service.android", enabled: false });
  raw = new DatabaseSync(path);
  // A preexisting, unrelated request exercises the original source after credit handoff.
  assert.equal(database.createManualRequest({ requestType: "general_info", customerName: "Talep Müşterisi", customerPhone: "05329876543", dateText: "", startDate: "", endDate: "", time: "", guestCount: 1, adultCount: 1, childCount: 0, message: "Bilgi almak istiyorum.", priority: "normal" }).ok, true);
  const customerId = database.saveCustomer({ fullName: "Ahmet Paylaşım", phone: "05321234567" }).savedId;
  const product = runtime.saveRuntimeCatalogProduct(path, { name: "Paylaşım Test Ürünü", salePrice: 10, trackInventory: false });
  const addDebt = (amountMinor, currency = "TRY") => runtime.addCustomerCreditAdjustment(path, { customerId, currency, amountMinor, entryType: "adjustment_debit", note: "Önceki borç", source: "smoke" });
  const pay = (amountMinor, currency = "TRY") => runtime.recordCustomerCreditPayment(path, { customerId, amountMinor, currency, paymentMethod: "cash" });
  addDebt(50000); addDebt(2000, "EUR");
  const account = () => runtime.getCustomerCreditAccount(path, customerId);
  const fingerprint = () => customerCreditWhatsAppFingerprint({ customerName: account().customer.fullName, phone: account().customer.phone, balances: account().balances });
  const mode = (value) => raw.prepare("UPDATE settings SET whatsapp_mode = ?").run(value);
  const tables = ["customer_credit_entries", "finance_entries", "commerce_sales", "commerce_sale_items", "inventory_balances", "inventory_movements", "customers", "requests", "whatsapp_messages", "events"];
  const financialState = () => JSON.stringify(tables.map((table) => raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  const handlers = new Map();
  const exports = {};
  let locked = false, mutationNotifications = 0;
  runInNewContext(readFileSync(join(appPath, "dist-electron/commerce-ipc.js"), "utf8"), {
    exports, require: (id) => id === "electron" ? { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } } : commerceRequire(id)
  });
  exports.registerCommerceIpcHandlers({ databasePath: () => path, assertUnlocked: () => { if (locked) throw new Error("Uygulama kilitli."); }, onMutation: () => { mutationNotifications += 1; } });
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
  const prepare = (message = "Düzenlenmiş mesaj", expectedFingerprint = fingerprint()) => invoke("commerce:customerCredit:prepareWhatsApp", { customerId, message, expectedFingerprint });
  const beforeModes = financialState();
  for (const preferredMode of ["webview", "wa_link", "manual_copy", "official_api"]) {
    mode(preferredMode);
    const result = prepare();
    assert.equal(result.status, "ready");
    assert.deepEqual(result.action, prepareWhatsAppAction({ phone: account().customer.phone, message: "Düzenlenmiş mesaj", preferredMode }));
  }
  assert.equal(financialState(), beforeModes);
  assert.equal(mutationNotifications, 0, "Preparation must use the read IPC wrapper.");
  locked = true; assert.throws(() => prepare(), /kilitli/); locked = false;
  for (const capability of ["service.whatsapp", "commerce.customer_credit"]) {
    const previousFingerprint = fingerprint();
    setBusinessCapability(path, { capability, enabled: false });
    assert.throws(() => prepare("Mesaj", previousFingerprint), /etkin değil/);
    setBusinessCapability(path, { capability, enabled: true });
  }
  mode("webview");
  assert.throws(() => prepare("  "), /boş/);
  const sample = buildCustomerCreditWhatsAppMessage({ customerName: "Ahmet", balances: [{ currency: "TRY", amountMinor: 48000 }] });
  assert.match(sample, /Merhaba Ahmet,/); assert.match(sample, /₺480,00/);
  assert.equal(sample, buildCustomerCreditWhatsAppMessage({ customerName: "Ahmet", balances: [{ currency: "TRY", amountMinor: 48000 }] }));
  assert.equal(buildCustomerCreditWhatsAppMessage({ customerName: "", balances: [] }), "");

  server = await createServer({ root: appPath, configFile: join(appPath, "vite.renderer.config.ts"), logLevel: "error", server: { port: 0, host: "127.0.0.1", strictPort: false },
    plugins: [{ name: "m83-smoke-page", configureServer(instance) {
      instance.middlewares.use("/m83-smoke", async (_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(await instance.transformIndexHtml("/m83-smoke", `<!doctype html><html lang="tr" data-color-scheme="light" data-density="compact" data-accent="coral" data-font="plex" data-motion="system"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Veresiye paylaşımı</title><style>.smoke-shell {max-width:1400px;margin:auto;padding:24px}.smoke-shell > nav {display:flex;gap:12px;margin-bottom:16px}</style></head><body><div id="root"></div><script type="module" src="/@fs/${join(process.cwd(), "scripts/fixtures/customer-credit-whatsapp.tsx")}"></script></body></html>`));
      });
    } }] });
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, permissions: ["clipboard-read", "clipboard-write"] });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  const pageErrors = [], calls = [], external = [];
  let failExternal = false, holdPreparation = false, releasePreparation;
  page.on("pageerror", (error) => { pageErrors.push(error.message); console.error(error.message); });
  const channels = {
    getCustomerCreditAccount: "commerce:customerCredit:get", listCustomerCreditEntries: "commerce:customerCredit:entries",
    prepareCustomerCreditWhatsApp: "commerce:customerCredit:prepareWhatsApp", recordCustomerCreditPayment: "commerce:customerCredit:payment",
    addCustomerCreditAdjustment: "commerce:customerCredit:adjustment", createCustomerCreditSale: "commerce:customerCredit:sale",
    listProducts: "commerce:product:list", listCategories: "commerce:category:list", createPaidSale: "commerce:sale:createPaid"
  };
  const scannerMethods = ["setBarcodeScanMode", "consumePendingBarcodeScans"];
  await page.exposeFunction("__m83Call", async (method, args) => {
    calls.push({ method, args });
    if (method === "toggle") return setBusinessCapability(path, { capability: args[0], enabled: args[1] });
    if (method === "openExternal") {
      assert.ok(readBusinessCapabilitySnapshot(path).enabledCapabilities.includes("service.whatsapp"));
      if (failExternal) throw new Error("WhatsApp açılamadı. Mesajı kopyalayıp elle paylaşabilirsiniz.");
      external.push(args[0]); return true;
    }
    if (method === "setBarcodeScanMode") {
      return { active: args[0] === true, intervalMs: 1500, transport: "hosting" };
    }
    if (method === "consumePendingBarcodeScans") {
      return [];
    }
    assert.ok(channels[method], `Unexpected bridge method: ${method}`);
    const result = invoke(channels[method], ...args);
    if (method === "prepareCustomerCreditWhatsApp" && holdPreparation) await new Promise((resolve) => { releasePreparation = resolve; });
    return result;
  });
  await page.addInitScript(({ dashboard, snapshot, methods }) => {
    window.__m83Initial = { dashboard, snapshot };
    const invoke = (method) => (...args) => window.__m83Call(method, args);
    window.yardimciDesktop = { commerce: Object.fromEntries(methods.map((method) => [method, invoke(method)])), openExternal: invoke("openExternal") };
  }, { dashboard: database.getDashboardData(), snapshot: readBusinessCapabilitySnapshot(path), methods: [...Object.keys(channels), ...scannerMethods] });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/m83-smoke`, { timeout: 60000 });
  const topbarStatus = page.getByTestId("topbar-status");
  const panel = page.getByRole("region", { name: "Veresiye hesabı", exact: true });
  const compose = page.getByRole("region", { name: "Borç durumunu paylaş", exact: true });
  const editor = compose.getByRole("textbox", { name: "Veresiye paylaşım mesajı" });
  const share = () => panel.getByRole("button", { name: "WhatsApp'ta Paylaş", exact: true }).click();
  const preparedCount = () => calls.filter((call) => call.method === "prepareCustomerCreditWhatsApp").length;
  const toggle = (capability, enabled) => page.evaluate(([capability, enabled]) => window.__m83Toggle(capability, enabled), [capability, enabled]);
  const customerWorkspace = () => page.getByRole("dialog").filter({ has: page.getByRole("tablist", { name: "Müşteri çalışma alanı" }) });
  const closeCustomerWorkspace = async () => {
    const workspace = customerWorkspace();
    if (!await workspace.count()) return;
    await workspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
    await expect(workspace).toHaveCount(0);
  };
  const navigate = async (name) => {
    await closeCustomerWorkspace();
    await page.getByRole("navigation", { name: "Çalışma alanı" }).getByRole("button", { name, exact: true }).click();
  };
  const ensureCustomerWorkspace = async () => {
    let workspace = customerWorkspace();
    if (!await workspace.count()) {
      await page.getByRole("button", { name: /Ahmet Paylaşım/ }).click();
      workspace = customerWorkspace();
      await expect(workspace).toBeVisible();
    }
    return workspace;
  };
  const openAccount = async () => {
    const workspace = await ensureCustomerWorkspace();
    const accountTab = workspace.getByRole("tab", { name: "Hesap", exact: true });
    await expect(accountTab).toBeVisible();
    await accountTab.click();
    await expect(panel.locator(".customer-credit-balances")).toBeVisible();
    const expand = panel.getByRole("button", { name: "Hesabı Aç", exact: true });
    if (await expand.count()) await expand.click();
  };
  await openAccount();
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺500,00");
  assert.equal(preparedCount(), 0); assert.equal(external.length, 0);
  await context.setOffline(true);

  // Cached 500 is stale: a different runtime path collects 200 before share.
  pay(20000);
  const beforeShare = financialState();
  const beforeRead = calls.filter((call) => call.method === "getCustomerCreditAccount").length;
  await share();
  await expect(editor).toHaveValue(/₺300,00/);
  await expect(editor).toHaveValue(/€20,00/);
  await expect(editor).not.toHaveValue(/₺500,00/);
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺300,00");
  assert.ok(calls.filter((call) => call.method === "getCustomerCreditAccount").length > beforeRead);
  assert.equal(financialState(), beforeShare);
  assert.equal(preparedCount(), 0); assert.equal(external.length, 0);
  await editor.fill(""); await expect(compose.getByRole("button", { name: "WhatsApp'a Hazırla" })).toBeDisabled();
  const edited = "Merhaba Ahmet, sizin için düzenlenmiş açıklama. ₺300,00 ve €20,00.";
  await editor.fill(edited);
  await compose.getByRole("button", { name: "Kopyala", exact: true }).click();
  await expect(topbarStatus).toContainText("Mesaj kopyalandı.");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), edited);
  mkdirSync(artifacts, { recursive: true });
  await compose.screenshot({ path: join(artifacts, "compose-desktop.png") });
  await page.setViewportSize({ width: 900, height: 1000 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await compose.screenshot({ path: join(artifacts, "compose-narrow.png") });
  await page.setViewportSize({ width: 1440, height: 1100 });

  await compose.getByRole("button", { name: "WhatsApp'a Hazırla" }).click();
  await expect(page.getByRole("textbox", { name: "Hazır WhatsApp mesajı" })).toHaveValue(edited);
  assert.equal(calls.filter((call) => call.method === "prepareCustomerCreditWhatsApp").at(-1).args[0].message, edited);
  assert.equal(financialState(), beforeShare);
  assert.equal(external.length, 0, "WebView handoff must not force an external link.");
  await expect(page.getByRole("button", { name: "Mesajı Sil", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("src", "https://web.whatsapp.com/");
  await expect(page.getByRole("button", { name: "Onayla ve Gönder", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Müşteri Numarasına Git" }).click();
  const target = new URL(await page.locator(".whatsapp-webview").getAttribute("src"));
  assert.equal(target.searchParams.get("phone"), "905321234567");
  assert.equal(target.searchParams.get("text"), edited);
  assert.equal(financialState(), beforeShare);

  // Existing request source remains selectable; request send control stays available.
  await page.locator(".message-mode-content:not(.is-hidden) .whatsapp-request-list .message-request-row").first().click();
  await expect(page.getByRole("button", { name: "Onayla ve Gönder", exact: true })).toHaveCount(1);
  await navigate("Müşteriler"); await openAccount();
  await share(); await editor.fill("Kullanıcı düzenledi.");
  pay(10000);
  const beforeChanged = financialState();
  await compose.getByRole("button", { name: "WhatsApp'a Hazırla" }).click();
  await expect(topbarStatus).toContainText("Mesaj yenilendi; lütfen tekrar kontrol edin.");
  await expect(editor).toHaveValue(/₺200,00/);
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺200,00");
  assert.equal(external.length, 0); assert.equal(financialState(), beforeChanged);
  await editor.fill("Yeni bakiye kontrol edildi: ₺200,00 ve €20,00.");
  mode("manual_copy");
  await compose.getByRole("button", { name: "WhatsApp'a Hazırla" }).click();
  await expect(topbarStatus).toContainText("Mesaj kopyalandı.");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Yeni bakiye kontrol edildi: ₺200,00 ve €20,00.");
  assert.equal(external.length, 0);
  mode("official_api");
  await compose.getByRole("button", { name: "WhatsApp'a Hazırla" }).click();
  await expect(topbarStatus).toContainText("henüz kullanılamıyor");
  mode("wa_link"); failExternal = true;
  await compose.getByRole("button", { name: "WhatsApp'a Hazırla" }).click();
  await expect(topbarStatus).toContainText("Mesajı kopyalayıp elle paylaşabilirsiniz.");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await compose.getByRole("button", { name: "Kopyala", exact: true }).click();
  failExternal = false;
  await compose.getByRole("button", { name: "WhatsApp'a Hazırla" }).click();
  assert.equal(new URL(external.at(-1)).hostname, "wa.me");
  assert.equal(new URL(external.at(-1)).searchParams.get("text"), await editor.inputValue());
  assert.equal(financialState(), beforeChanged);
  await editor.press("Escape"); await expect(compose).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "WhatsApp'ta Paylaş" })).toBeFocused();

  for (const phone of ["", "123"]) {
    raw.prepare("UPDATE customers SET phone = ? WHERE id = ?").run(phone, customerId);
    const count = preparedCount(); await share();
    await expect(topbarStatus).toContainText("Bu müşterinin geçerli bir telefon numarası yok.");
    await expect(compose).toHaveCount(0); assert.equal(preparedCount(), count);
    assert.throws(() => prepare(), /geçerli bir telefon/);
  }
  raw.prepare("UPDATE customers SET phone = '05321234567' WHERE id = ?").run(customerId);
  // Full payment after the old positive panel was rendered: no message is prepared.
  pay(20000); pay(2000, "EUR");
  const beforeZero = preparedCount(), beforeZeroExternal = external.length;
  await share();
  await expect(topbarStatus).toContainText("Bu müşterinin açık veresiye borcu kalmamış.");
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺0,00");
  assert.equal(preparedCount(), beforeZero); assert.equal(external.length, beforeZeroExternal);
  await expect(compose).toHaveCount(0);

  addDebt(10000);
  await toggle("commerce.customer_credit", false); await toggle("commerce.customer_credit", true); await openAccount();
  await share();
  // A fully settled account also closes an already-open compose at final preparation.
  pay(10000);
  await compose.getByRole("button", { name: "WhatsApp'a Hazırla" }).click();
  await expect(topbarStatus).toContainText("Bu müşterinin açık veresiye borcu kalmamış.");
  await expect(compose).toHaveCount(0);
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺0,00");
  assert.equal(external.length, beforeZeroExternal);
  addDebt(10000);
  await toggle("commerce.customer_credit", false); await toggle("commerce.customer_credit", true); await openAccount();
  await share();
  holdPreparation = true;
  await compose.getByRole("button", { name: "WhatsApp'a Hazırla" }).click();
  await expect.poll(() => typeof releasePreparation).toBe("function");
  await toggle("service.whatsapp", false);
  await expect(compose).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "WhatsApp'ta Paylaş" })).toHaveCount(0);
  releasePreparation(); holdPreparation = false;
  // Draining the held transport must not hand off/open after capability unmount.
  await expect(panel.getByRole("button", { name: "Tahsilat Al", exact: true })).toBeEnabled();
  assert.equal(external.length, beforeZeroExternal);
  const noAutoStart = preparedCount(), noAutoExternal = external.length;
  // Credit functions still work without WhatsApp; reenabling does not auto-share.
  await panel.getByRole("button", { name: "Tahsilat Al", exact: true }).click();
  await panel.getByLabel("Tutar", { exact: true }).fill("10");
  await panel.getByRole("button", { name: "Tahsilatı Kaydet" }).click();
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺90,00");
  await toggle("service.whatsapp", true);
  await panel.getByRole("button", { name: "Düzeltme", exact: true }).click();
  await panel.getByLabel("Tutar", { exact: true }).fill("10");
  await panel.getByLabel("Açıklama / neden (zorunlu)").fill("Düzeltme denemesi");
  await panel.getByRole("button", { name: "Düzeltmeyi Kaydet" }).click();
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺100,00");
  await panel.getByRole("button", { name: "Tahsilat Al", exact: true }).click();
  await panel.getByLabel("Tutar", { exact: true }).fill("1");
  await panel.getByRole("button", { name: "Tahsilatı Kaydet" }).click();
  await expect(panel.locator(".customer-credit-balances")).toContainText("₺99,00");
  assert.equal(preparedCount(), noAutoStart); assert.equal(external.length, noAutoExternal);
  await toggle("commerce.customer_credit", false);
  await expect(panel).toHaveCount(0);
  const activeCustomerWorkspace = customerWorkspace();
  if (await activeCustomerWorkspace.count()) {
    await expect(activeCustomerWorkspace.getByRole("tab", { name: "Hesap", exact: true })).toHaveCount(0);
  }
  const hiddenReads = calls.filter((call) => call.method === "getCustomerCreditAccount").length;
  await navigate("Market"); await navigate("Müşteriler");
  assert.equal(calls.filter((call) => call.method === "getCustomerCreditAccount").length, hiddenReads);
  await expect(page.getByRole("region", { name: "Veresiye WhatsApp paylaşımı" })).toHaveCount(0);
  await toggle("commerce.customer_credit", true); await navigate("Market");
  await page.locator(".market-sale-product").filter({ hasText: product.name }).click();
  const quick = page.locator(".market-sale-cart");
  await quick.getByLabel("Ödeme yöntemi").selectOption("credit");
  await quick.getByLabel("Müşteri", { exact: true }).selectOption(customerId);
  await quick.getByRole("button", { name: "Satışı Veresiye Kaydet" }).click();
  await expect(quick.locator(".market-sale-receipt")).toContainText("Veresiye satış kaydedildi.");
  assert.equal(preparedCount(), noAutoStart); assert.equal(external.length, noAutoExternal);
  await navigate("Müşteriler"); await openAccount(); await share();
  assert.ok(account().entries.some((entry) => entry.saleDetail?.items.some((item) => item.productName === product.name)));
  await expect(editor).toHaveValue(buildCustomerCreditWhatsAppMessage({ customerName: account().customer.fullName, balances: account().balances }));
  await expect(editor).not.toHaveValue(/Paylaşım Test Ürünü|birim|Satış kalemleri/);
  assert.equal(preparedCount(), noAutoStart); assert.equal(external.length, noAutoExternal);
  assert.deepEqual(pageErrors, []);
  assert.ok(calls.every((call) => !/markWhatsAppMessageSent|createManualRequest|saveAiWorkspaceResult|finance/i.test(call.method)));
  const shareSource = readFileSync(join(appPath, "src/components/customers/CustomerCreditWhatsAppShare.tsx"), "utf8");
  assert.doesNotMatch(shareSource, /wa\.me|window\.open|executeJavaScript|requestId/);
  assert.doesNotMatch(shareSource, /role="alert"|setNotice\(|setError\(/);
  const preload = readFileSync(join(appPath, "electron/preload.ts"), "utf8");
  assert.match(preload, /prepareCustomerCreditWhatsApp:.*invokeWhenUnlocked\("commerce:customerCredit:prepareWhatsApp"/);
  const main = readFileSync(join(appPath, "electron/main.ts"), "utf8");
  assert.match(main, /ipcMain.handle\("shell:openExternal"[\s\S]*?isWhatsAppUrl\(url\)[\s\S]*?assertDesktopCapability\(C.WHATSAPP/);
  console.log("market-customer-credit-whatsapp-smoke-ok: fresh balances, zero race, editable handoff, topbar-only notices, existing modes, offline copy, capability/lock guards and read-only sharing");
} catch (error) {
  if (page) console.error("UI at failure:", await page.locator("body").innerText());
  throw error;
} finally {
  await browser?.close(); await server?.close(); raw?.close(); database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
