import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { saveRuntimeCatalogProduct } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const root = mkdtempSync(join(tmpdir(), "ya-online-catalog-ui-"));
const appPath = join(process.cwd(), "apps/desktop-app");
const database = new DesktopDatabase({ appPath, userDataPath: root });
let server, browser;
try {
  database.initialize();
  assert.equal(database.saveInitialSetup({
    businessName: "Catalog UI", profileId: "market", profileOptions: ["channel.online_sales"], phone: "", whatsapp: "", email: "", address: "",
    webModuleUrl: "https://catalog.example.test", syncSecret: "online-catalog-ui-secret", autoSyncEnabled: false,
    aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "", aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: []
  }).ok, true);
  const product = saveRuntimeCatalogProduct(database.databasePath, { name: "Publication UI product", salePrice: 25, currency: "TRY", unit: "piece", trackInventory: false, isActive: true });
  server = await createServer({ root: appPath, configFile: join(appPath, "vite.renderer.config.ts"), logLevel: "error",
    server: { host: "127.0.0.1", port: 0 }, plugins: [{ name: "online-catalog-ui-smoke", configureServer(instance) {
      instance.middlewares.use("/online-catalog-ui-smoke", async (_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(await instance.transformIndexHtml("/online-catalog-ui-smoke", `<!doctype html><html lang="tr"><body><div id="root"></div><script type="module" src="/@fs/${join(process.cwd(), "scripts/fixtures/online-catalog-ui.tsx")}"></script></body></html>`));
      });
    }}] });
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let saves = 0;
  let failSave = false;
  await page.exposeFunction("__publicationCall", (method, input) => {
    if (method === "get") return database.getCommerceProductPublication(input);
    if (method === "save") {
      saves++;
      if (failSave) throw new Error("Fixture publication failure");
      return database.saveCommerceProductPublication(input);
    }
    throw new Error("Unexpected fixture bridge call");
  });
  await page.addInitScript((product) => {
    window.__product = product;
    window.yardimciDesktop = { commerce: {
      getProductPublication: (id) => window.__publicationCall("get", id),
      saveProductPublication: (input) => window.__publicationCall("save", input)
    } };
  }, product);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/online-catalog-ui-smoke`);
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: "Web satışında yayınla", exact: true });
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect.poll(() => database.getCommerceProductPublication(product.id)?.isPublished).toBe(true);
  await page.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await expect(checkbox).toHaveCount(0);
  await page.getByRole("button", { name: "Ürünü Aç", exact: true }).click();
  await expect(checkbox).toBeChecked();
  failSave = true;
  await checkbox.click();
  await expect(page.getByRole("status").filter({ hasText: "Web yayın tercihi kaydedilemedi" })).toBeVisible();
  await expect(checkbox).toBeChecked();
  assert.equal(database.getCommerceProductPublication(product.id).isPublished, true);
  failSave = false;
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  await expect.poll(() => database.getCommerceProductPublication(product.id).isPublished).toBe(false);
  const beforeToggleSaves = saves;
  setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: false });
  await page.evaluate(() => window.__onlineToggle(false));
  await expect(checkbox).toHaveCount(0);
  assert.equal(saves, beforeToggleSaves, "hiding control must not rewrite the preference");
  setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: true });
  await page.evaluate(() => window.__onlineToggle(true));
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
  assert.deepEqual(errors, []);
  console.log("commerce-online-catalog-ui-smoke-ok");
} finally { await browser?.close(); await server?.close(); database.close(); rmSync(root, { recursive: true, force: true }); }
