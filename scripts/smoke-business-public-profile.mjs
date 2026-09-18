import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  getBusinessPublicProfile,
  saveBusinessPublicProfile
} = require("../apps/desktop-app/dist-electron/business-public-profile.js");

const expectedEmptyProfile = {
  description: "",
  latitude: null,
  longitude: null,
  directionsNote: "",
  checkInTime: "",
  checkOutTime: "",
  breakfastStartTime: "",
  breakfastEndTime: "",
  features: [],
  policyNote: "",
  paymentNote: "",
  languages: []
};

const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-business-public-profile-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});

try {
  database.initialize();

  const sqlite = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'business_public_profile'").all();
    assert.equal(tables.length, 1, "Current baseline must contain business_public_profile.");
  } finally {
    sqlite.close();
  }

  assert.deepEqual(
    getBusinessPublicProfile(database.databasePath),
    expectedEmptyProfile
  );
  const setupResult = database.saveInitialSetup({
    businessName: "Profil Test İşletmesi",
    profileId: "pension_restaurant",
    phone: "+905550002018",
    whatsapp: "+905550002018",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "public-profile-secret",
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

  const saved = saveBusinessPublicProfile(database.databasePath, {
    description: "  Sahile yakın, sakin aile işletmesi.  ",
    latitude: 36.8123,
    longitude: 28.6321,
    directionsNote: "  Merkezden sahil yolunu takip edin.  ",
    checkInTime: "14:00",
    checkOutTime: "11:00",
    breakfastStartTime: "08:00",
    breakfastEndTime: "10:30",
    features: ["wifi", "parking", "internal_only", "wifi"],
    policyNote: "  Sessizlik saatleri 23:00 sonrasıdır.  ",
    paymentNote: "  Nakit ve kart kabul edilir.  ",
    languages: ["Türkçe", "English", "türkçe", "  Deutsch  "]
  });
  assert.equal(saved.ok, true, saved.ok ? "" : saved.message);
  assert.deepEqual(saved.profile.features, ["wifi", "parking"]);
  assert.deepEqual(saved.profile.languages, ["Türkçe", "English", "Deutsch"]);
  assert.equal(saved.profile.description, "Sahile yakın, sakin aile işletmesi.");

  const persisted = getBusinessPublicProfile(database.databasePath);
  assert.deepEqual(persisted, saved.profile);

  const partialMap = saveBusinessPublicProfile(database.databasePath, {
    ...persisted,
    latitude: 36.8,
    longitude: null
  });
  assert.equal(partialMap.ok, false);
  assert.match(partialMap.message, /enlem.*boylam|boylam.*enlem/i);

  const invalidTime = saveBusinessPublicProfile(database.databasePath, {
    ...persisted,
    checkInTime: "25:10"
  });
  assert.equal(invalidTime.ok, false);
  assert.match(invalidTime.message, /HH:MM/i);

  const raw = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const row = raw.prepare(`
      SELECT business_id, features_json, languages_json, sync_status
      FROM business_public_profile
    `).get();
    assert.ok(row?.business_id);
    assert.deepEqual(JSON.parse(String(row.features_json)), ["wifi", "parking"]);
    assert.deepEqual(JSON.parse(String(row.languages_json)), ["Türkçe", "English", "Deutsch"]);
    assert.equal(row.sync_status, "local_only");
    assert.equal(String(raw.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
    assert.deepEqual(raw.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    raw.close();
  }

  console.log("business-public-profile-smoke-ok: baseline table, safe normalization, map/time validation and persistence verified");
} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}
