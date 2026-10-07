import assert from "node:assert/strict";
import { exactFixtureReceipt } from "./test-helpers/publication-protocol.mjs";
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
  mapDisplayMode: "manual",
  googleMapsEmbedUrl: "",
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
  languages: [],
  socialLinks: []
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
    languages: ["Türkçe", "English", "türkçe", "  Deutsch  "],
    socialLinks: [
      { platform: "facebook", url: "facebook.com/profiltest" },
      { platform: "instagram", url: "https://instagram.com/profiltest" }
    ]
  });
  assert.equal(saved.ok, true, saved.ok ? "" : saved.message);
  assert.deepEqual(saved.profile.features, ["wifi", "parking"]);
  assert.deepEqual(saved.profile.languages, ["Türkçe", "English", "Deutsch"]);
  assert.equal(saved.profile.description, "Sahile yakın, sakin aile işletmesi.");
  assert.deepEqual(saved.profile.socialLinks, [
    { platform: "facebook", url: "https://facebook.com/profiltest" },
    { platform: "instagram", url: "https://instagram.com/profiltest" }
  ]);

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
    const socialRow = raw.prepare("SELECT links_json, sync_status FROM business_public_social_links").get();
    assert.deepEqual(JSON.parse(String(socialRow.links_json)), saved.profile.socialLinks);
    assert.equal(socialRow.sync_status, "local_only");
    assert.equal(String(raw.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
    assert.deepEqual(raw.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    raw.close();
  }

  const beforeMapSwitch = getBusinessPublicProfile(database.databasePath);
  const embedUrl = "https://www.google.com/maps/embed?pb=!1m18!2m3";
  const google = saveBusinessPublicProfile(database.databasePath, { ...beforeMapSwitch, mapDisplayMode: "google_maps_embed", googleMapsEmbedUrl: embedUrl });
  assert.equal(google.ok, true);
  assert.equal(google.profile.latitude, beforeMapSwitch.latitude);
  assert.equal(google.profile.longitude, beforeMapSwitch.longitude);
  assert.equal(getBusinessPublicProfile(database.databasePath).googleMapsEmbedUrl, embedUrl);
  for (const url of ["", "https://evil.test/maps/embed?pb=x", "http://www.google.com/maps/embed?pb=x", "javascript:alert(1)", '<iframe src="https://www.google.com/maps/embed?pb=x"></iframe>', "https://user:pass@www.google.com/maps/embed?pb=x", "https://www.google.com/maps/search?pb=x", "https://www.google.com/maps/embed?pb=" + "x".repeat(4096)]) {
    assert.equal(saveBusinessPublicProfile(database.databasePath, { ...beforeMapSwitch, mapDisplayMode: "google_maps_embed", googleMapsEmbedUrl: url }).ok, false, url);
  }
  const manual = saveBusinessPublicProfile(database.databasePath, { ...beforeMapSwitch, mapDisplayMode: "manual", googleMapsEmbedUrl: embedUrl });
  assert.equal(manual.ok, true);
  assert.equal(manual.profile.googleMapsEmbedUrl, embedUrl);
  assert.equal(manual.profile.latitude, beforeMapSwitch.latitude);
  assert.equal(manual.profile.longitude, beforeMapSwitch.longitude);
  assert.equal(saveBusinessPublicProfile(database.databasePath, { ...beforeMapSwitch, mapDisplayMode: "invalid" }).ok, false);
  assert.deepEqual(getBusinessPublicProfile(database.databasePath), manual.profile);
  const { createCurrentBusinessAiContext, publishBusinessAiContext } = require("../apps/desktop-app/dist-electron/business-ai-context-service.js");
  const aiContext = createCurrentBusinessAiContext(database);
  assert.equal("mapDisplayMode" in aiContext, false);
  assert.equal("googleMapsEmbedUrl" in aiContext, false);
  const originalFetch = globalThis.fetch;
  const published = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "activate_publication_source") return Response.json({ ok: true,
      source_client_id: body.client_id, source_epoch: body.expected_epoch + 1, activation_key: body.activation_key });
    published.push(body.business_context);
    return Response.json({ ok: true, ...exactFixtureReceipt(body), message: "ok", profile_id: "pension_restaurant" });
  };
  try {
    for (const mode of ["manual", "google_maps_embed"]) {
      assert.equal(saveBusinessPublicProfile(database.databasePath, { ...beforeMapSwitch, mapDisplayMode: mode, googleMapsEmbedUrl: embedUrl }).ok, true);
      assert.equal((await publishBusinessAiContext(database, { baseUrl: "https://example.test/yardimci-asistan", syncSecret: "test" })).ok, true);
      assert.equal(published.at(-1).mapDisplayMode, mode);
      assert.equal(published.at(-1).googleMapsEmbedUrl, mode === "google_maps_embed" ? embedUrl : "");
      assert.equal(published.at(-1).latitude, mode === "manual" ? beforeMapSwitch.latitude : null);
      assert.equal(published.at(-1).longitude, mode === "manual" ? beforeMapSwitch.longitude : null);
      assert.equal(getBusinessPublicProfile(database.databasePath).latitude, beforeMapSwitch.latitude);
      assert.equal(getBusinessPublicProfile(database.databasePath).googleMapsEmbedUrl, embedUrl);
    }
  } finally { globalThis.fetch = originalFetch; }
  console.log("business-public-profile-smoke-ok: default/manual/google persistence, URL validation, coordinate preservation and website publication verified");

} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}
