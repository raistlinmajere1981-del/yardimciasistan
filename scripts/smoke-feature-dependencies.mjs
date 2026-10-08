import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C, getBusinessProfiles, getBusinessProfileSelectionCapabilities,
  toggleBusinessProfileOption, validateBusinessCapabilitySet, businessProfileSupportsCapability } = require("../packages/shared/dist");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { setBusinessCapability, readBusinessCapabilitySnapshot } = require("../apps/desktop-app/dist-electron/business-capability-store.js");

function scenario(run) {
  const fixture = createTemporaryDesktopDatabase("feature-dependencies-");
  let raw;
  try {
    fixture.database.initialize();
    raw = new DatabaseSync(fixture.database.databasePath);
    const save = patch => {
      const current = fixture.database.getSetupData();
      const result = fixture.database.saveInitialSetup(createSmokeSetupInput({ ...current,
        businessName: "Dependency fixture", phone: "", whatsapp: "", syncSecret: "dependency-fixture-secret", ...patch }));
      assert.equal(result.ok, true, result.message);
      const snapshot = readBusinessCapabilitySnapshot(fixture.database.databasePath);
      assert.deepEqual(validateBusinessCapabilitySet(snapshot.enabledCapabilities), []);
      assert.ok(snapshot.enabledCapabilities.every(capability => businessProfileSupportsCapability(snapshot.profileId, capability)));
      return snapshot;
    };
    run({ database: fixture.database, raw, save });
  } finally { raw?.close(); fixture.cleanup(); }
}

for (const profile of getBusinessProfiles()) {
  await test(`${profile.id}: option roots, derived sources, OFF cascade, no-op and restart`, () => scenario(({ database, raw, save }) => {
    save({ profileId: profile.id });
    for (const feature of profile.optionalCapabilities) {
      const roots = toggleBusinessProfileOption(profile.id, [], feature, true);
      const snapshot = save({ profileOptions: roots });
      assert.deepEqual(snapshot.enabledCapabilities.sort(), getBusinessProfileSelectionCapabilities(profile.id, roots).sort());
      assert.deepEqual(database.getSetupData().profileOptions, roots);
      for (const row of snapshot.capabilities.filter(row => row.enabled && !roots.includes(row.capability))) {
        assert.notEqual(row.source, "user", `derived ${row.capability}`);
      }
      save({});
      assert.deepEqual(database.getSetupData().profileOptions, roots);
      const reopened = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: dirname(database.databasePath) });
      try {
        reopened.initialize();
        assert.deepEqual(reopened.getSetupData().profileOptions, roots);
        assert.deepEqual(readBusinessCapabilitySnapshot(reopened.databasePath), readBusinessCapabilitySnapshot(database.databasePath));
      } finally { reopened.close(); }
      const off = toggleBusinessProfileOption(profile.id, database.getSetupData().profileOptions, feature, false);
      assert.deepEqual(save({ profileOptions: off }).enabledCapabilities.sort(), getBusinessProfileSelectionCapabilities(profile.id, []).sort());
    }
    // Renderer sends both out-of-profile and internal options: Setup normalizes roots.
    const all = Object.values(C);
    const normalized = save({ profileOptions: all });
    assert.deepEqual(normalized.enabledCapabilities.sort(), getBusinessProfileSelectionCapabilities(profile.id, profile.optionalCapabilities).sort());
    const forbidden = all.filter(capability => !businessProfileSupportsCapability(profile.id, capability));
    for (const capability of forbidden) assert.throws(() => setBusinessCapability(database.databasePath, { capability, enabled: true }), /profilinde|yalnızca Market/);
    const selected = raw.prepare("SELECT capability_id FROM business_capabilities WHERE is_selected = 1").all().map(row => row.capability_id);
    assert.deepEqual(selected.sort(), profile.optionalCapabilities.slice().sort());
  }));
}

await test("diamond, root provenance and explicit feature reactivation never enable delivery", () => scenario(({ database, save }) => {
  save({ profileId: "market" });
  let roots = [C.ONLINE_SALES, C.WHOLESALE];
  save({ profileOptions: roots });
  assert.equal(database.getSetupData().onlineSalesDeliveryEnabled, false);
  roots = toggleBusinessProfileOption("market", roots, C.ONLINE_SALES, false);
  assert.ok(save({ profileOptions: roots }).enabledCapabilities.includes(C.ORDERS));
  roots = toggleBusinessProfileOption("market", roots, C.WHOLESALE, false);
  assert.equal(save({ profileOptions: roots }).enabledCapabilities.includes(C.ORDERS), false);
  save({ profileOptions: [C.RETAIL_SUPPLIERS] });
  assert.deepEqual(database.getSetupData().profileOptions, [C.RETAIL_SUPPLIERS]);
  assert.equal(save({ profileOptions: [] }).enabledCapabilities.includes(C.RETAIL_PURCHASING), false);
  save({ profileOptions: [C.RETAIL_PURCHASING, C.RETAIL_SUPPLIERS] });
  assert.ok(save({ profileOptions: [C.RETAIL_PURCHASING] }).enabledCapabilities.includes(C.RETAIL_PURCHASING));
}));

await test("renderer capability IPC cannot activate services or edit internal foundations", () => scenario(({ database, save }) => {
  save({ profileId: "restaurant", profileOptions: [] });
  const filename = resolve("apps/desktop-app/dist-electron/business-capability-ipc.js");
  const localRequire = createRequire(filename), handlers = new Map(), exports = {};
  runInNewContext(readFileSync(filename, "utf8"), { exports, require: name => name === "electron"
    ? { ipcMain: { handle: (channel, action) => handlers.set(channel, action) } }
    : name === "./business-location-geocode-ipc" ? { registerBusinessLocationGeocodeIpcHandlers() {} } : localRequire(name) });
  exports.registerBusinessCapabilityIpcHandlers({ databasePath: () => database.databasePath, assertUnlocked() {} });
  const before = readBusinessCapabilitySnapshot(database.databasePath);
  for (const capability of [C.AI, C.ANDROID, C.WHATSAPP, C.CATALOG, C.SALES, C.ORDERS, C.CUSTOMER_CREDIT]) {
    assert.throws(() => handlers.get("capability:set")({}, capability, true), /ilgili işletme veya servis/);
    assert.throws(() => handlers.get("capability:clearOverride")({}, capability), /ilgili işletme veya servis/);
  }
  assert.deepEqual(readBusinessCapabilitySnapshot(database.databasePath), before);
  assert.throws(() => handlers.get("capability:set")({}, C.ONLINE_SALES, true), /commerce.orders/);
  assert.deepEqual(readBusinessCapabilitySnapshot(database.databasePath), before, "invalid dependent ON rolls back");
}));

await test("owning feature OFF disables activation, preserves credentials/configuration and queues withdrawal", () => scenario(({ database, raw, save }) => {
  save({ profileId: "market", profileOptions: [C.MESSAGING_CAMPAIGNS, C.ONLINE_SALES, C.WHOLESALE],
    onlineSalesDeliveryEnabled: true, onlineSalesDelivery: { pickupEnabled: true, shippingEnabled: false },
    whatsappCloud: { enabled: false, wabaId: "123", phoneNumberId: "456", accessToken: "" } });
  const content = database.saveMarketingContent({ title: "Dependency publication", purpose: "announcement",
    masterText: "Fixture", status: "ready", variants: [], mediaAssetIds: [] });
  database.saveMarketingPublication({ contentId: content.content.id, channel: "website", placement: "homepage_feature",
    title: "Fixture", text: "Fixture", mediaAssetIds: [] });
  raw.exec(`UPDATE marketing_provider_config SET enabled=1,
    secret_one_encrypted='safe-storage:v1:key', secret_two_encrypted='safe-storage:v1:hash';
    UPDATE marketing_provider_config SET sender_id='FIXTURE' WHERE provider_id='iletimerkezi';
    UPDATE marketing_provider_config SET account_id='123' WHERE provider_id='instagram_api';
    UPDATE business_messaging_provider_config SET enabled=1,access_token_encrypted='safe-storage:v1:cloud';
    UPDATE commerce_shipping_provider_config SET enabled=1,customer_code='code',username='user',password_encrypted='safe-storage:v1:shipping';
    UPDATE settings SET dealer_portal_enabled=1, online_sales_shipping_enabled=1;`);
  const configuration = () => ["marketing_provider_config", "business_messaging_provider_config", "commerce_shipping_provider_config"]
    .map(table => raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(({ enabled, updated_at, ...config }) => config));
  const before = configuration();
  save({ profileOptions: [] });
  assert.deepEqual(configuration(), before);
  const setup = database.getSetupData();
  for (const enabled of [setup.sms.enabled, setup.instagram.enabled, setup.arasShipping.enabled,
    setup.onlineSalesDeliveryEnabled, setup.dealerPortalEnabled]) assert.equal(enabled, false);
  assert.equal(setup.whatsappCloud.enabled, true, "Customer operational messages own Cloud independently of campaigns");
  assert.equal(setup.onlineSalesDelivery.shippingEnabled, true, "method configuration survives");
  const jobs = database.getPendingSyncJobs().map(job => job.jobType);
  assert.ok(jobs.includes("online_catalog_publish"));
  assert.ok(jobs.includes("marketing_website_publish"));
  save({ profileOptions: [C.MESSAGING_CAMPAIGNS, C.ONLINE_SALES, C.WHOLESALE] });
  for (const active of [database.getSetupData().sms.enabled, database.getSetupData().instagram.enabled,
    database.getSetupData().arasShipping.enabled, database.getSetupData().onlineSalesDeliveryEnabled,
    database.getSetupData().dealerPortalEnabled]) assert.equal(active, false);
  assert.deepEqual(configuration(), before);
}));

await test("Restaurant Online Sales retains Menu and foundations, delivery OFF keeps catalog visible", () => scenario(({ database, save }) => {
  save({ profileId: "restaurant" });
  const enabled = save({ profileOptions: [C.ONLINE_SALES] }).enabledCapabilities;
  for (const capability of [C.FOOD_MENU, C.CATALOG, C.ORDERS, C.ONLINE_SALES]) assert.ok(enabled.includes(capability));
  for (const retail of [C.WHOLESALE, C.RETAIL_BARCODE, C.RETAIL_PURCHASING, C.RETAIL_SUPPLIERS, C.CUSTOMER_CREDIT]) assert.equal(enabled.includes(retail), false);
  assert.equal(database.getSetupData().onlineSalesDeliveryEnabled, false);
  const payload = database.createCommerceOnlineCatalog();
  assert.equal(payload.enabled, true);
  assert.deepEqual(payload.deliveryMethods, []);
  save({ profileOptions: [] });
  assert.equal(database.createCommerceOnlineCatalog().enabled, false);
}));

await test("delivery activation survives one owner and closes with the final owner", () => scenario(({ database, save }) => {
  save({ profileId: "market", profileOptions: [C.ONLINE_SALES, C.WHOLESALE],
    onlineSalesDeliveryEnabled: true, onlineSalesDelivery: { pickupEnabled: true, shippingEnabled: false } });
  save({ profileOptions: [C.WHOLESALE] });
  assert.equal(database.getSetupData().onlineSalesDeliveryEnabled, true);
  save({ profileOptions: [] });
  assert.equal(database.getSetupData().onlineSalesDeliveryEnabled, false);
  save({ profileOptions: [C.WHOLESALE] });
  assert.equal(database.getSetupData().onlineSalesDeliveryEnabled, false);
}));

await test("feature OFF, provider deactivation and publication intent roll back together", () => scenario(({ database, raw, save }) => {
  save({ profileId: "market", profileOptions: [C.MESSAGING_CAMPAIGNS] });
  raw.exec(`UPDATE marketing_provider_config SET enabled=1, sender_id='FIXTURE',
    secret_one_encrypted='safe-storage:v1:key', secret_two_encrypted='safe-storage:v1:hash'
    WHERE provider_id='iletimerkezi'`);
  const tables = ["business_capabilities", "settings", "marketing_provider_config", "sync_outbox", "sync_outbox_revisions"];
  const rows = () => tables.map(table => raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const before = rows();
  raw.exec(`CREATE TRIGGER reject_service_off BEFORE UPDATE ON marketing_provider_config
    WHEN OLD.enabled=1 AND NEW.enabled=0 BEGIN SELECT RAISE(ABORT,'feature off rollback'); END`);
  assert.throws(() => save({ profileOptions: [] }), /feature off rollback/);
  assert.deepEqual(rows(), before);
  raw.exec("DROP TRIGGER reject_service_off");
  save({ profileOptions: [] });
  assert.equal(database.getSetupData().sms.enabled, false);
}));

await test("hospitality resource services withdraw with their owner and retain configuration", () => scenario(({ raw, save }) => {
  save({ profileId: "pension" });
  raw.exec(`UPDATE settings SET google_reviews_enabled=1, google_place_id='fixture-place',
    google_places_api_key_encrypted='safe-storage:v1:reviews';
    INSERT INTO kbs_service_settings(id,enabled,provider,facility_code,username,password_encrypted,created_at,updated_at)
    VALUES('primary',1,'egm','facility','fixture-user','safe-storage:v1:kbs','fixture','fixture')`);
  const configuration = () => [raw.prepare("SELECT google_place_id, google_places_api_key_encrypted FROM settings").get(),
    raw.prepare("SELECT provider, facility_code, username, password_encrypted FROM kbs_service_settings").get()];
  const before = configuration();
  save({ profileId: "market" });
  assert.equal(raw.prepare("SELECT google_reviews_enabled FROM settings").get().google_reviews_enabled, 0);
  assert.equal(raw.prepare("SELECT enabled FROM kbs_service_settings").get().enabled, 0);
  assert.ok(raw.prepare("SELECT 1 FROM sync_outbox WHERE job_type='google_reviews_settings_publish'").get());
  assert.deepEqual(configuration(), before);
  save({ profileId: "pension" });
  assert.equal(raw.prepare("SELECT google_reviews_enabled FROM settings").get().google_reviews_enabled, 0);
  assert.equal(raw.prepare("SELECT enabled FROM kbs_service_settings").get().enabled, 0);
  assert.deepEqual(configuration(), before);
}));
