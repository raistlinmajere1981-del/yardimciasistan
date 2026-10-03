import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");

const appPath = join(process.cwd(), "apps", "desktop-app");
const dataDir = mkdtempSync(join(tmpdir(), "yardimci-wholesale-ui-"));
const artifacts = join(process.cwd(), "artifacts", "screenshots", "wholesale-customer");
const database = new DesktopDatabase({ appPath, userDataPath: dataDir });

let raw;
let server;
let browser;
let page;

try {
  database.initialize();
  const setup = database.saveInitialSetup({
    businessName: "Wholesale UI Smoke",
    profileId: "market",
    profileOptions: [C.WHOLESALE],
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "wholesale-ui-smoke-secret",
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
    servicePreferences: { whatsapp: false, android: false },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });
  assert.equal(setup.ok, true, setup.ok ? "" : setup.message);
  assert.ok(database.getEnabledBusinessCapabilities().includes(C.WHOLESALE));

  raw = new DatabaseSync(database.databasePath);
  const calls = [];

  server = await createServer({
    root: appPath,
    configFile: join(appPath, "vite.renderer.config.ts"),
    logLevel: "error",
    server: { port: 0, host: "127.0.0.1", strictPort: false },
    plugins: [{
      name: "wholesale-customer-ui-smoke",
      configureServer(instance) {
        instance.middlewares.use("/wholesale-customer-ui-smoke", async (_request, response) => {
          response.setHeader("Content-Type", "text/html");
          response.end(await instance.transformIndexHtml(
            "/wholesale-customer-ui-smoke",
            `<!doctype html>
              <html lang="tr" data-color-scheme="light" data-density="compact" data-accent="coral" data-font="plex" data-motion="system">
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>Wholesale customer UI smoke</title>
                  <style>.smoke-shell { max-width: 1440px; margin: 0 auto; padding: 24px; }</style>
                </head>
                <body>
                  <div id="root"></div>
                  <script type="module" src="/@fs/${join(process.cwd(), "scripts/fixtures/wholesale-customer-ui.tsx")}"></script>
                </body>
              </html>`
          ));
        });
      }
    }]
  });
  await server.listen();

  browser = await launchChromiumForSmoke(chromium);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "tr-TR" });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
    console.error(error.message);
  });

  await page.exposeFunction("__whCall", async (method, args) => {
    calls.push({ method, args: structuredClone(args) });
    if (method === "saveCustomer") return database.saveCustomer(args[0]);
    if (method === "deleteCustomer") return database.deleteCustomer(args[0]);
    throw new Error(`Unexpected wholesale UI bridge call: ${method}`);
  });

  await page.addInitScript((dashboard) => {
    window.__whInitial = dashboard;
  }, database.getDashboardData());

  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/wholesale-customer-ui-smoke`, { timeout: 60000 });

  await expect(page.getByTestId("wholesale-state")).toHaveText("wholesale-on");
  await expect(page.getByRole("button", { name: "Bayiler", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Yeni Müşteri", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "Yeni müşteri ekle", exact: true });
  await expect(createDialog).toBeVisible();
  await expect(createDialog.getByText("Ticari bilgiler", { exact: true })).toBeVisible();
  await expect(createDialog.getByLabel("Firma / unvan", { exact: true })).toHaveCount(0);

  await createDialog.getByLabel("Ad soyad", { exact: true }).fill("Ada Bayi");
  await createDialog.getByLabel("Telefon", { exact: true }).fill("05550002001");
  await createDialog.getByRole("checkbox", { name: "Ticari / bayi müşterisi", exact: true }).check();

  await expect(createDialog.getByLabel("Firma / unvan", { exact: true })).toHaveValue("Ada Bayi");
  await expect(createDialog.getByLabel("Yetkili kişi", { exact: true })).toHaveValue("Ada Bayi");

  await createDialog.getByLabel("Firma / unvan", { exact: true }).fill("Ada Gıda Ltd. Şti.");
  await createDialog.getByLabel("Yetkili kişi", { exact: true }).fill("Ada Bayi");
  await createDialog.getByLabel("Vergi dairesi", { exact: true }).fill("Cide");
  await createDialog.getByLabel("Vergi no", { exact: true }).fill("9876543210");
  await createDialog.getByLabel("Bayi durumu", { exact: true }).selectOption("active");
  await createDialog.getByLabel("Fiyat grubu", { exact: true }).selectOption("dealer_a");
  await createDialog.getByLabel("Ödeme vadesi (gün)", { exact: true }).fill("30");
  await createDialog.getByLabel("Ticari not", { exact: true }).fill("İlk bayi profili.");
  await createDialog.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(createDialog).toHaveCount(0);

  let workspace = page.locator("dialog.customer-workspace-frame");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole("heading", { name: "Ada Bayi", exact: true })).toBeVisible();
  await expect(workspace.getByRole("checkbox", { name: "Ticari / bayi müşterisi", exact: true })).toBeChecked();
  await expect(workspace.getByLabel("Firma / unvan", { exact: true })).toHaveValue("Ada Gıda Ltd. Şti.");
  await expect(workspace.getByLabel("Vergi no", { exact: true })).toHaveValue("9876543210");
  await expect(workspace.getByLabel("Bayi durumu", { exact: true })).toHaveValue("active");
  await expect(workspace.getByLabel("Fiyat grubu", { exact: true })).toHaveValue("dealer_a");
  await expect(workspace.getByLabel("Ödeme vadesi (gün)", { exact: true })).toHaveValue("30");

  const firstSave = calls.find((call) => call.method === "saveCustomer");
  assert.ok(firstSave);
  assert.deepEqual(firstSave.args[0].commercialProfile, {
    companyName: "Ada Gıda Ltd. Şti.",
    taxOffice: "Cide",
    taxNumber: "9876543210",
    authorizedPerson: "Ada Bayi",
    dealerStatus: "active",
    priceGroup: "dealer_a",
    paymentTermDays: 30,
    notes: "İlk bayi profili."
  });

  const createdRow = raw.prepare(`
    SELECT customer_id, company_name, dealer_status, price_group, payment_term_days, tax_number
    FROM customer_commercial_profiles
    WHERE tax_number = '9876543210'
  `).get();
  assert.ok(createdRow?.customer_id);
  const customerId = createdRow.customer_id;
  assert.equal(createdRow.company_name, "Ada Gıda Ltd. Şti.");
  assert.equal(createdRow.dealer_status, "active");
  assert.equal(createdRow.price_group, "dealer_a");
  assert.equal(Number(createdRow.payment_term_days), 30);

  await workspace.getByLabel("Ödeme vadesi (gün)", { exact: true }).fill("45");
  await workspace.getByLabel("Ticari not", { exact: true }).fill("Vade güncellendi.");
  await workspace.getByRole("button", { name: "Müşteri Kartını Kaydet", exact: true }).click();
  await expect(workspace.getByLabel("Ödeme vadesi (gün)", { exact: true })).toHaveValue("45");

  const updatedRow = raw.prepare(`
    SELECT payment_term_days, notes
    FROM customer_commercial_profiles
    WHERE customer_id = ?
  `).get(customerId);
  assert.equal(Number(updatedRow.payment_term_days), 45);
  assert.equal(updatedRow.notes, "Vade güncellendi.");

  await workspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await expect(workspace).toHaveCount(0);

  const customerList = page.getByRole("region", { name: "Müşteri yönetimi", exact: true });
  const customerRow = customerList.locator(".customer-record-row").filter({ hasText: "Ada Bayi" });
  await expect(customerRow).toContainText("Ada Gıda Ltd. Şti.");
  await expect(customerRow).toContainText("Aktif bayi");
  await expect(page.getByRole("button", { name: "Bayiler", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Bayiler", exact: true }).click();
  await expect(customerList.locator(".customer-record-row")).toHaveCount(1);

  await page.evaluate(() => window.__whToggle?.(false));
  await expect(page.getByTestId("wholesale-state")).toHaveText("wholesale-off");
  await expect(page.getByRole("button", { name: "Bayiler", exact: true })).toHaveCount(0);
  await expect(customerList.locator(".customer-record-row")).toHaveCount(1);
  await expect(customerRow).not.toContainText("Ada Gıda Ltd. Şti.");
  await expect(customerRow).not.toContainText("Aktif bayi");

  await customerRow.locator(".customer-record-row__open").click();
  workspace = page.locator("dialog.customer-workspace-frame");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByText("Ticari bilgiler", { exact: true })).toHaveCount(0);

  await workspace.getByLabel("Ad soyad", { exact: true }).fill("Ada Bayi Güncel");
  const saveCallCountBeforeBasicEdit = calls.filter((call) => call.method === "saveCustomer").length;
  await workspace.getByRole("button", { name: "Müşteri Kartını Kaydet", exact: true }).click();
  await expect(workspace.getByRole("heading", { name: "Ada Bayi Güncel", exact: true })).toBeVisible();

  const basicEditCall = calls.filter((call) => call.method === "saveCustomer").at(-1);
  assert.ok(calls.filter((call) => call.method === "saveCustomer").length > saveCallCountBeforeBasicEdit);
  assert.equal(
    Object.prototype.hasOwnProperty.call(basicEditCall.args[0], "commercialProfile"),
    false,
    "Wholesale-disabled customer edit must not own hidden commercial fields."
  );

  const preserved = raw.prepare(`
    SELECT company_name, dealer_status, payment_term_days, notes
    FROM customer_commercial_profiles
    WHERE customer_id = ?
  `).get(customerId);
  assert.equal(preserved.company_name, "Ada Gıda Ltd. Şti.");
  assert.equal(preserved.dealer_status, "active");
  assert.equal(Number(preserved.payment_term_days), 45);
  assert.equal(preserved.notes, "Vade güncellendi.");

  await workspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await expect(workspace).toHaveCount(0);

  await page.evaluate(() => window.__whToggle?.(true));
  await expect(page.getByTestId("wholesale-state")).toHaveText("wholesale-on");
  await expect(page.getByRole("button", { name: "Bayiler", exact: true })).toBeVisible();

  await customerList.locator(".customer-record-row__open", { hasText: "Ada Bayi Güncel" }).click();
  workspace = page.locator("dialog.customer-workspace-frame");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByLabel("Firma / unvan", { exact: true })).toHaveValue("Ada Gıda Ltd. Şti.");
  await expect(workspace.getByLabel("Ödeme vadesi (gün)", { exact: true })).toHaveValue("45");
  await expect(workspace.getByLabel("Ticari not", { exact: true })).toHaveValue("Vade güncellendi.");

  await page.setViewportSize({ width: 900, height: 1000 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    "Wholesale customer UI must not create page-level horizontal overflow."
  );
  mkdirSync(artifacts, { recursive: true });
  await workspace.screenshot({ path: join(artifacts, "commercial-profile-narrow.png") });

  assert.deepEqual(pageErrors, []);
  console.log("commerce-wholesale-customer-ui-smoke-ok");
} catch (error) {
  if (page) {
    try {
      console.error("UI at failure:", await page.locator("body").innerText());
    } catch {}
  }
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  raw?.close();
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
