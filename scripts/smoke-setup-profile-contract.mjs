import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import ts from "typescript";
import { runInNewContext } from "node:vm";
import { exactFixtureReceipt } from "./test-helpers/publication-protocol.mjs";

const require = createRequire(import.meta.url);
const { BUSINESS_PROFILES, getBusinessProfiles, normalizeBusinessType } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { readBusinessCapabilitySnapshot } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { SyncCoordinator } = require("../apps/desktop-app/dist-electron/sync-coordinator.js");
const { isUsableSyncConfig } = require("../apps/desktop-app/dist-electron/sync-network-policy.js");

const root = process.cwd();
const profileIds = getBusinessProfiles().map((profile) => profile.id);

assert.deepEqual(profileIds, ["pension_restaurant", "pension", "restaurant", "market"]);
assert.equal(Object.keys(BUSINESS_PROFILES).length, 4);
assert.equal(normalizeBusinessType("unknown"), "pension_restaurant");
assert.equal("other" in BUSINESS_PROFILES, false);

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-setup-profile-"));
const database = new DesktopDatabase({
  appPath: join(root, "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();
  // Clear initialization-only publications. Completing the online catalog can
  // correctly enqueue another Android snapshot because its pending state changed.
  for (let pass = 0; pass < 8 && database.getPendingSyncJobs().length > 0; pass += 1) {
    for (const job of database.getPendingSyncJobs()) {
      database.completeSyncJob(job.jobKey, job.sourceRevision);
    }
  }
  assert.equal(database.getPendingSyncJobs().length, 0, "initial publications must settle");

  const freshSetup = database.getSetupData();
  assert.equal(freshSetup.setupRequired, true);
  assert.equal(freshSetup.webModuleUrl, "");
  assert.equal(freshSetup.autoSyncEnabled, false);
  assert.equal(freshSetup.profileId, "pension_restaurant");
  assert.deepEqual(
    [...freshSetup.profileOptions].sort(),
    [...BUSINESS_PROFILES.pension_restaurant.defaultOptionalCapabilities].sort(),
    "fresh setup must expose the selected profile's default optional capabilities"
  );

  const baseSetupInput = {
    businessName: "Temiz Kurulum İşletmesi",
    profileId: "market",
    phone: "+905550000000",
    whatsapp: "",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "123456789012",
    autoSyncEnabled: true,
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
  };

  const missingWhatsAppResult = database.saveInitialSetup({
    ...baseSetupInput,
    servicePreferences: { whatsapp: true, android: false }
  });
  assert.equal(missingWhatsAppResult.ok, false);
  assert.equal(missingWhatsAppResult.message, "WhatsApp servisi açıkken WhatsApp numarası gerekli.");

  const whatsappDisabledResult = database.saveInitialSetup(baseSetupInput);
  assert.equal(whatsappDisabledResult.ok, true);

  const result = database.saveInitialSetup({
    ...baseSetupInput,
    whatsapp: "+905550000000",
    servicePreferences: { whatsapp: true, android: false }
  });

  assert.equal(result.ok, true);
  const setup = database.getSetupData();
  const capabilities = readBusinessCapabilitySnapshot(database.databasePath);
  assert.equal(setup.profileId, "market");
  assert.deepEqual(setup.servicePreferences, { whatsapp: true, android: false });
  assert.equal(capabilities.profileId, "market");
  assert.equal(capabilities.enabledCapabilities.includes("retail.barcode"), true);
  assert.equal(capabilities.enabledCapabilities.includes("customer.requests"), false);
  assert.equal(capabilities.enabledCapabilities.includes("food_service.tables"), false);
  assert.equal(capabilities.enabledCapabilities.includes("accommodation.rooms"), false);
  assert.equal(capabilities.enabledCapabilities.includes("service.android"), false);
  assert.equal(capabilities.enabledCapabilities.includes("service.whatsapp"), true);
  assert.equal(capabilities.enabledCapabilities.includes("service.ai"), false);
  assert.equal(
    database.getPendingSyncJobs().some((job) => job.jobType === "android_snapshot"),
    true,
    "setup must queue the capability manifest even when Android is disabled"
  );

  const localInput = { ...baseSetupInput, webModuleUrl: "", syncSecret: "", autoSyncEnabled: true };
  assert.equal(database.saveInitialSetup(localInput).ok, true, "empty transport permits local setup and normalizes passive sync OFF");
  const reopened = new DesktopDatabase({ appPath: join(root, "apps", "desktop-app"), userDataPath: dataDir });
  try {
    reopened.initialize();
    assert.equal(reopened.getSetupData().setupRequired, false, "local setup survives restart");
    assert.equal(reopened.getSetupData().autoSyncEnabled, false);
    assert.equal(reopened.getDashboardData().webModuleUrl, "");
    assert.equal(reopened.getEnabledBusinessCapabilities().includes("retail.barcode"), true);
  } finally { reopened.close(); }

  const pending = database.getPendingSyncJobs().map(job => [job.jobKey, job.sourceRevision, job.attemptCount]);
  const coordinator = new SyncCoordinator({ database, getSyncConfig: () => ({ baseUrl: "", syncSecret: "" }),
    createAndroidSnapshot: () => { throw Error("Local setup must not prepare a Web snapshot"); },
    onDashboardChanged() {}, onStatusChanged() {} });
  try {
    const cycle = await coordinator.runNow();
    assert.equal(cycle.ok, true);
    assert.equal(cycle.status.message, "Web kullanılmıyor.");
    assert.equal(database.getSyncRuntimeStatus().lastAttemptAt, "");
    assert.deepEqual(database.getPendingSyncJobs().map(job => [job.jobKey, job.sourceRevision, job.attemptCount]), pending,
      "no Web attempt or failure/backoff for an unused transport");
  } finally { coordinator.stop(); }

  // Execute the real main handler with local infrastructure and hosting promises
  // that never settle. A local commit must neither invoke nor await those publishers.
  const mainSource = readFileSync(join(root, "apps/desktop-app/electron/main.ts"), "utf8");
  const parsed = ts.createSourceFile("main.ts", mainSource, ts.ScriptTarget.Latest, true);
  const handler = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "saveInitialSetupFromRenderer");
  assert.ok(handler);
  const code = ts.transpileModule(`export ${handler.getText(parsed)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let hostingCalls = 0;
  const scheduled = [];
  const exports = {};
  const neverPublish = () => { hostingCalls++; return new Promise(() => {}); };
  runInNewContext(code, { exports,
    assertAppSessionUnlocked() {}, validateSetupServiceActivation: () => null,
    createAiApiKeyUpdate: () => ({ ok: true, update: { mode: "keep" } }),
    createAiProfileApiKeyUpdates: () => ({ ok: true, profiles: [], updates: {} }),
    createMarketingProviderSecretWrites: () => ({}), createMessagingSecretWrite: () => ({ mode: "keep" }),
    createShippingSecretWrite: () => ({ mode: "keep" }),
    getDatabase: () => database, BrowserWindow: { getAllWindows: () => [] },
    notifyBusinessMessagingChanged() {}, markLocalCompanionSnapshotDirty() {}, reconcileLocalCompanionRuntime() {}, reconcileOptionalBackgroundServices() {},
    scheduleAutomaticSyncSoon() {}, getSyncCoordinator: () => ({ restart() {}, scheduleSoon: (...args) => scheduled.push(args) }),
    isUsableSyncConfig, getWebSyncConfig: setup => ({ baseUrl: setup.webModuleUrl, syncSecret: setup.syncSecret }),
    publishSavedAiSettingsFromMain: neverPublish, publishBusinessAiContextFromMain: neverPublish
  });
  for (const connected of [false, true]) {
    const input = connected ? { ...baseSetupInput, autoSyncEnabled: false } : localInput;
    const saved = await Promise.race([
      exports.saveInitialSetupFromRenderer(input),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(Error("Local save waited for hosting")), 1000); timer.unref(); })
    ]);
    assert.equal(saved.ok, true);
    assert.equal(saved.setupData.setupRequired, false);
    assert.equal(hostingCalls, 0, "local response must not invoke a hosting publisher");
    assert.equal(database.getPendingSyncJobs().some(job => job.jobType === "business_context_publish"), true);
    assert.equal(database.getPendingSyncJobs().some(job => job.jobType === "ai_settings_publish"), true);
  }
  assert.deepEqual(scheduled, [[0, true]], "connected pilot retains explicit publication intent with passive sync OFF");

  // Exercise the real manual publisher with exact receipts, without sockets.
  // Passive sync OFF must retain its established publication semantics.
  const webActions = [];
  let hostingAvailable = true;
  const pilot = new SyncCoordinator({ database,
    getSyncConfig: () => ({ baseUrl: baseSetupInput.webModuleUrl, syncSecret: baseSetupInput.syncSecret,
      fetchImpl: async (_url, options) => {
        if (!hostingAvailable) throw Error("Fixture hosting unavailable");
        const body = JSON.parse(options.body);
        webActions.push(body.action);
        if (body.action === "activate_publication_source") return Response.json({ ok: true, message: "Fixture source",
          source_client_id: body.client_id, source_epoch: 1, activation_key: body.activation_key });
        assert.equal(body.action, "publish_menu");
        return Response.json({ ok: true, message: "Fixture publication", category_count: 0, item_count: 0, ...exactFixtureReceipt(body) });
      } }),
    createAndroidSnapshot: () => { throw Error("Manual menu publication must not prepare Android"); },
    onDashboardChanged() {}, onStatusChanged() {} });
  try {
    assert.equal(database.getSetupData().autoSyncEnabled, false);
    assert.equal((await pilot.publishMenuNow()).ok, true, "configured pilot can publish manually with passive sync OFF");
    assert.deepEqual(webActions, ["activate_publication_source", "publish_menu"]);
    hostingAvailable = false;
    assert.equal((await pilot.publishMenuNow()).ok, false);
    assert.equal(database.getPendingSyncJobs(new Date(Date.now() + 60_000).toISOString()).some(job => job.jobType === "menu_publish"), true,
      "unreachable hosting retains durable publication intent");
    assert.equal(database.getSetupData().setupRequired, false, "hosting failure cannot reopen setup");
  } finally { pilot.stop(); }
  console.log("setup-profile-contract-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
