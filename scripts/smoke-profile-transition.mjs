import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C, CORE_BUSINESS_CAPABILITIES, getBusinessProfiles,
  getBusinessProfileSelectionCapabilities, validateBusinessCapabilitySet } = require("../packages/shared/dist");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { applyBusinessProfileCapabilities, readBusinessCapabilitySnapshot, setBusinessCapability,
  clearBusinessCapabilityOverride } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const profiles = getBusinessProfiles();
const sorted = values => [...values].sort();

function scenario(run) {
  const fixture = createTemporaryDesktopDatabase("profile-transition-");
  let raw;
  try {
    fixture.database.initialize();
    raw = new DatabaseSync(fixture.database.databasePath);
    const save = (patch = {}) => {
      const current = fixture.database.getSetupData();
      const input = createSmokeSetupInput({ ...current, businessName: current.businessName || "Profile matrix",
        phone: "", whatsapp: "", syncSecret: "profile-matrix-secret",
        servicePreferences: current.servicePreferences, ...patch });
      const result = fixture.database.saveInitialSetup(input);
      assert.equal(result.ok, true, result.message);
      return readBusinessCapabilitySnapshot(fixture.database.databasePath);
    };
    run({ database: fixture.database, raw, save });
  } finally { raw?.close(); fixture.cleanup(); }
}

function assertDefaults(snapshot, profile) {
  assert.equal(snapshot.profileId, profile.id);
  assert.deepEqual(sorted(snapshot.enabledCapabilities), sorted(profile.defaultCapabilities));
  assert.deepEqual(validateBusinessCapabilitySet(snapshot.enabledCapabilities), []);
  for (const capability of [...CORE_BUSINESS_CAPABILITIES, ...profile.requiredCapabilities, ...profile.defaultOptionalCapabilities]) {
    assert.ok(snapshot.enabledCapabilities.includes(capability), `${profile.id}: ${capability}`);
  }
  for (const entry of snapshot.capabilities) {
    assert.equal(entry.source, CORE_BUSINESS_CAPABILITIES.includes(entry.capability) ? "system" : "profile");
  }
}

function readAfterRestart(database) {
  const reopened = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: dirname(database.databasePath) });
  try {
    reopened.initialize();
    return readBusinessCapabilitySnapshot(reopened.databasePath);
  } finally { reopened.close(); }
}

for (const target of profiles) {
  await test(`registry/default/dependency matrix: ${target.id}`, () => {
    assert.ok(target.defaultOptionalCapabilities.every(capability => target.optionalCapabilities.includes(capability)));
    assert.deepEqual(sorted(getBusinessProfileSelectionCapabilities(target.id, target.defaultOptionalCapabilities)), sorted(target.defaultCapabilities));
    assert.deepEqual(validateBusinessCapabilitySet(getBusinessProfileSelectionCapabilities(target.id, target.optionalCapabilities)), []);
    // Every allowed option goes through the same dependency owner, including purchasing -> inventory.
    for (const option of target.optionalCapabilities) {
      assert.deepEqual(validateBusinessCapabilitySet(getBusinessProfileSelectionCapabilities(target.id, [option])), []);
    }
  });
  for (const origin of profiles.filter(profile => profile.id !== target.id)) {
    for (const path of ["setup", "apply"]) {
      await test(`${path}: ${origin.id} -> ${target.id} -> ${origin.id}, no remembered overrides`, () => scenario(({ database, raw, save }) => {
        save({ profileId: origin.id, profileOptions: origin.defaultOptionalCapabilities });
        // Invert ALL optional choices: no hard-coded profile/capability allowlist in this matrix.
        save({ profileOptions: origin.optionalCapabilities.filter(capability => !origin.defaultOptionalCapabilities.includes(capability)) });
        setBusinessCapability(database.databasePath, { capability: C.ANDROID, enabled: true });
        raw.exec("UPDATE settings SET product_data_enabled=1, birthday_enabled=1, dealer_portal_enabled=1");
        const infrastructure = raw.prepare("SELECT web_module_url,sync_secret,auto_sync_enabled,local_network_enabled FROM settings").get();
        const transition = profile => path === "setup"
          ? save({ profileId: profile.id, profileOptions: profile.optionalCapabilities,
            servicePreferences: { whatsapp: false, android: true }, productData: { ...database.getSetupData().productData, enabled: true } })
          : applyBusinessProfileCapabilities(database.databasePath, profile.id, { preserveUserOverrides: true });
        assertDefaults(transition(target), target);
        assert.deepEqual(raw.prepare("SELECT web_module_url,sync_secret,auto_sync_enabled,local_network_enabled FROM settings").get(), infrastructure);
        const setup = database.getSetupData();
        assert.deepEqual(setup.servicePreferences, { whatsapp: false, android: false });
        for (const active of [setup.aiEnabled, setup.productData.enabled, setup.birthdaySettings.enabled,
          setup.dealerPortalEnabled, setup.onlineSalesDeliveryEnabled, setup.arasShipping.enabled,
          setup.whatsappCloud.enabled, setup.sms.enabled, setup.instagram.enabled]) assert.equal(active, false);
        // Customize B after save: ON and OFF remain genuine current-profile overrides.
        const option = target.optionalCapabilities[0];
        const baseline = target.defaultOptionalCapabilities.includes(option);
        setBusinessCapability(database.databasePath, { capability: option, enabled: !baseline });
        let entry = readBusinessCapabilitySnapshot(database.databasePath).capabilities.find(row => row.capability === option);
        assert.deepEqual([entry.enabled, entry.source], [!baseline, "user"]);
        save();
        entry = readBusinessCapabilitySnapshot(database.databasePath).capabilities.find(row => row.capability === option);
        assert.equal(entry.source, "user", "no-op preserves explicit authority");
        assert.deepEqual(readAfterRestart(database), readBusinessCapabilitySnapshot(database.databasePath),
          "restart retains current-profile explicit overrides without loading another preference package");
        clearBusinessCapabilityOverride(database.databasePath, option);
        assertDefaults(readBusinessCapabilitySnapshot(database.databasePath), target);
        assertDefaults(transition(origin), origin);
        assertDefaults(save(), origin);
        assertDefaults(readAfterRestart(database), origin);
        const jobs = database.getPendingSyncJobs().map(job => job.jobType);
        for (const job of ["android_snapshot", "menu_publish", "online_catalog_publish"]) assert.ok(jobs.includes(job));
      }));
    }
  }
}

const stateTables = ["business", "business_capabilities", "settings", "ai_service_profiles", "commerce_shipping_provider_config",
  "business_messaging_provider_config", "marketing_provider_config", "kbs_service_settings", "sync_outbox", "sync_outbox_revisions",
  "sync_publication_payloads", "commerce_dealer_web_access"];
const snapshotRows = raw => Object.fromEntries(stateTables.map(table => [table, raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));

for (const [stage, table, when] of [
  ["profile", "business", "NEW.profile_id != OLD.profile_id"],
  ["capability", "business_capabilities", "NEW.capability_id = 'retail.purchasing'"],
  ["service", "kbs_service_settings", "NEW.enabled = 0"],
  ["publication", "sync_outbox", "NEW.job_type = 'android_snapshot'"]
]) {
  for (const path of ["setup", "apply"]) {
    await test(`${path} failure injection ${stage}: full state + publication rollback`, () => scenario(({ database, raw, save }) => {
      save({ profileId: "pension", profileOptions: [] });
      raw.exec("INSERT INTO kbs_service_settings(id,enabled,created_at,updated_at) VALUES('primary',1,'fixture','fixture')");
      setBusinessCapability(database.databasePath, { capability: C.ANDROID, enabled: true });
      const before = snapshotRows(raw);
      raw.exec(`CREATE TRIGGER fail_transition BEFORE UPDATE ON ${table} WHEN ${when} BEGIN SELECT RAISE(ABORT,'injected transition failure'); END`);
      assert.throws(() => path === "setup" ? save({ profileId: "market", profileOptions: [] })
        : applyBusinessProfileCapabilities(database.databasePath, "market"), /injected transition failure/);
      assert.deepEqual(snapshotRows(raw), before);
      raw.exec("DROP TRIGGER fail_transition");
      assertDefaults(save({ profileId: "market", profileOptions: [] }), profiles.find(profile => profile.id === "market"));
    }));
  }
}

for (const path of ["setup", "apply"]) {
  await test(`${path} preserves provider credentials and feature configuration, disables only activation`, () => scenario(({ database, raw, save }) => {
    save({ profileId: "market" });
    const businessId = readBusinessCapabilitySnapshot(database.databasePath).businessId;
    raw.prepare("UPDATE business_messaging_provider_config SET enabled=1,waba_id='123',phone_number_id='456',access_token_encrypted='safe-storage:v1:fixture' WHERE business_id=?").run(businessId);
    raw.prepare("UPDATE marketing_provider_config SET enabled=1,sender_id='FIXTURE',secret_one_encrypted='safe-storage:v1:key',secret_two_encrypted='safe-storage:v1:hash' WHERE business_id=? AND provider_id='iletimerkezi'").run(businessId);
    raw.prepare("UPDATE commerce_shipping_provider_config SET enabled=1,customer_code='code',username='user',password_encrypted='safe-storage:v1:password'").run();
    raw.exec("UPDATE ai_service_profiles SET api_key_encrypted='safe-storage:v1:ai' WHERE service='openai'; INSERT INTO kbs_service_settings(id,enabled,password_encrypted,created_at,updated_at) VALUES('primary',1,'safe-storage:v1:kbs','fixture','fixture')");
    raw.exec("UPDATE settings SET online_sales_shipping_enabled=1,product_data_enabled=1");
    setBusinessCapability(database.databasePath, { capability: C.AI, enabled: true });
    setBusinessCapability(database.databasePath, { capability: C.ANDROID, enabled: true });
    const configuration = () => stateTables.slice(3, 8).map(table => raw.prepare(`SELECT * FROM ${table}`).all()
      .map(({ enabled, updated_at, ...config }) => config));
    const before = configuration();
    if (path === "setup") save({ profileId: "pension" });
    else applyBusinessProfileCapabilities(database.databasePath, "pension");
    assert.deepEqual(configuration(), before);
    assert.equal(database.getSetupData().onlineSalesDelivery.shippingEnabled, true, "delivery configuration survives disabled activation");
    assert.equal(raw.prepare("SELECT enabled FROM kbs_service_settings").get().enabled, 0);
    for (const active of [database.getSetupData().aiEnabled, database.getSetupData().servicePreferences.android,
      database.getSetupData().whatsappCloud.enabled, database.getSetupData().sms.enabled]) assert.equal(active, false);
  }));
}
