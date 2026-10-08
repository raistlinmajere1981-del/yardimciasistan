import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C, getBusinessProfile } = require("../packages/shared/dist/index.js");
const { applyBusinessProfileCapabilities, clearBusinessCapabilityOverride, readBusinessCapabilitySnapshot, setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");

function scenario(run) {
  const { database, cleanup } = createTemporaryDesktopDatabase("capability-settings-source-");
  try {
    database.initialize();
    const input = createSmokeSetupInput({ businessName: "Capability source", profileId: "pension", phone: "", whatsapp: "", syncSecret: "capability-source-smoke", servicePreferences: { whatsapp: false, android: false } });
    const save = (patch = {}) => {
      const result = database.saveInitialSetup({ ...input, ...database.getSetupData(), ...patch });
      assert.equal(result.ok, true, result.message);
      return readBusinessCapabilitySnapshot(database.databasePath);
    };
    // First setup must apply the preset, not initialization's placeholder profileOptions.
    assert.equal(database.saveInitialSetup(input).ok, true);
    const entry = (capability) => readBusinessCapabilitySnapshot(database.databasePath).capabilities.find(item => item.capability === capability);
    const expectEntry = (capability, enabled, source) => {
      const actual = entry(capability);
      assert.deepEqual({ enabled: actual.enabled, source: actual.source }, { enabled, source }, capability);
    };
    run({ database, save, expectEntry });
  } finally { cleanup(); }
}

await test("profile default remains profile-owned after unrelated/no-op Settings saves and does not travel to Market", () => scenario(({ database, save, expectEntry }) => {
  expectEntry(C.REQUESTS, true, "profile");
  save();
  save({ businessName: "Renamed business" });
  expectEntry(C.REQUESTS, true, "profile");
  applyBusinessProfileCapabilities(database.databasePath, "market");
  expectEntry(C.REQUESTS, false, "profile");
  expectEntry(C.ACCOMMODATION_RESERVATIONS, false, "profile");
}));

await test("explicit ON equal to the current default survives no-op save, never a profile change", () => scenario(({ database, save, expectEntry }) => {
  setBusinessCapability(database.databasePath, { capability: C.REQUESTS, enabled: true });
  save();
  expectEntry(C.REQUESTS, true, "user");
  save({ profileId: "market", profileOptions: getBusinessProfile("market").defaultOptionalCapabilities });
  expectEntry(C.REQUESTS, false, "profile");
  applyBusinessProfileCapabilities(database.databasePath, "restaurant");
  expectEntry(C.REQUESTS, true, "profile");
  save();
  expectEntry(C.REQUESTS, true, "profile");
}));

await test("explicit OFF survives a no-op save, never a profile change", () => scenario(({ database, save, expectEntry }) => {
  setBusinessCapability(database.databasePath, { capability: C.REQUESTS, enabled: false });
  save();
  expectEntry(C.REQUESTS, false, "user");
  applyBusinessProfileCapabilities(database.databasePath, "market");
  save();
  expectEntry(C.REQUESTS, false, "profile");
  applyBusinessProfileCapabilities(database.databasePath, "restaurant");
  expectEntry(C.REQUESTS, true, "profile");
}));

await test("Settings checkbox changes create ON/OFF overrides, including a change back to the default", () => scenario(({ database, save, expectEntry }) => {
  save({ profileOptions: [C.ACCOMMODATION_RESERVATIONS] });
  expectEntry(C.REQUESTS, false, "user");
  save({ profileOptions: [C.REQUESTS, C.ACCOMMODATION_RESERVATIONS] });
  expectEntry(C.REQUESTS, true, "user");
  applyBusinessProfileCapabilities(database.databasePath, "market");
  expectEntry(C.REQUESTS, false, "profile");
  clearBusinessCapabilityOverride(database.databasePath, C.REQUESTS);
  expectEntry(C.REQUESTS, false, "profile");
  save({ profileOptions: [...database.getSetupData().profileOptions, C.REQUESTS] });
  expectEntry(C.REQUESTS, true, "user");
}));

await test("clear override restores profile authority through later Settings saves and profile switches", () => scenario(({ database, save, expectEntry }) => {
  setBusinessCapability(database.databasePath, { capability: C.REQUESTS, enabled: false });
  clearBusinessCapabilityOverride(database.databasePath, C.REQUESTS);
  save();
  expectEntry(C.REQUESTS, true, "profile");
  applyBusinessProfileCapabilities(database.databasePath, "market");
  expectEntry(C.REQUESTS, false, "profile");
  setBusinessCapability(database.databasePath, { capability: C.REQUESTS, enabled: true });
  clearBusinessCapabilityOverride(database.databasePath, C.REQUESTS);
  save();
  expectEntry(C.REQUESTS, false, "profile");
}));

await test("Settings profile switch removes old defaults without manufacturing OFF overrides", () => scenario(({ save, expectEntry }) => {
  save({ profileId: "market", profileOptions: getBusinessProfile("market").defaultOptionalCapabilities });
  expectEntry(C.REQUESTS, false, "profile");
  expectEntry(C.ACCOMMODATION_STAYS, false, "profile");
  save({ profileId: "pension", profileOptions: getBusinessProfile("pension").defaultOptionalCapabilities });
  expectEntry(C.REQUESTS, true, "profile");
  expectEntry(C.RETAIL_PURCHASING, false, "profile");
}));

await test("out-of-profile overrides are rejected and cannot survive Settings saves", () => scenario(({ database, save, expectEntry }) => {
  applyBusinessProfileCapabilities(database.databasePath, "market", { preserveUserOverrides: false });
  assert.throws(() => setBusinessCapability(database.databasePath, { capability: C.ACCOMMODATION_ROOMS, enabled: true }), /profilinde/);
  save();
  expectEntry(C.ACCOMMODATION_ROOMS, false, "profile");
}));

await test("service OFF is an explicit override and is not erased by a later no-op save", () => scenario(({ save, expectEntry }) => {
  save({ servicePreferences: { whatsapp: false, android: true } });
  expectEntry(C.ANDROID, true, "user");
  save({ servicePreferences: { whatsapp: false, android: false } });
  expectEntry(C.ANDROID, false, "user");
  save();
  expectEntry(C.ANDROID, false, "user");
}));

await test("lock notification count excludes closed request/reservation/table domains but retains generic work", () => scenario(({ database }) => {
  const db = new DatabaseSync(database.databasePath);
  try {
    db.exec(`
      INSERT INTO requests (id, request_type, customer_name, customer_phone, created_at, updated_at) VALUES ('old-request', 'general', 'Old request', '', '', '');
      INSERT INTO reservations (id, reservation_type, title, start_date, created_at, updated_at) VALUES ('old-room-booking', 'room', 'Room booking', '2030-01-01', '', ''), ('old-table-booking', 'table', 'Table booking', '2030-01-01', '', '');
      INSERT INTO tables (id, name, status, created_at, updated_at) VALUES ('old-table', 'Old table', 'bill_waiting', '', '');
      INSERT INTO daily_tasks (id, title, task_type, created_at, updated_at) VALUES ('generic-task', 'Generic task', 'note', '', ''), ('room-task', 'Room task', 'manual_pension', '', '');
    `);
    assert.equal(database.getAppLockNotificationCount(), 4, "Pension must exclude table reservation/payment");
    setBusinessCapability(database.databasePath, { capability: C.REQUESTS, enabled: false });
    assert.equal(database.getAppLockNotificationCount(), 3, "closed requests must not raise the lock badge");
    setBusinessCapability(database.databasePath, { capability: C.ACCOMMODATION_RESERVATIONS, enabled: false });
    assert.equal(database.getAppLockNotificationCount(), 2, "closed room reservations must not raise the lock badge");
    applyBusinessProfileCapabilities(database.databasePath, "restaurant", { preserveUserOverrides: false });
    assert.equal(database.getAppLockNotificationCount(), 4, "Restaurant must exclude room reservation/tasks");
    applyBusinessProfileCapabilities(database.databasePath, "market", { preserveUserOverrides: false });
    assert.equal(database.getAppLockNotificationCount(), 1, "only capability-enabled generic work remains");
    const raw = database.getDashboardData();
    assert.equal(raw.requests.length, 1, "the historical raw projection is not deleted to fix visibility");
    assert.equal(raw.reservations.length, 2);
  } finally { db.close(); }
}));
