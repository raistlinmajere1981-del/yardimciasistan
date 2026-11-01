import ts from "typescript";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fixtureHttp, fixtureSecretService, fixtureShippingService, testCredentials } from "./test-helpers/aras-provider-fixtures.mjs";

function publishedMap(value) {
  const code='require $argv[1]."/core/bootstrap.php"; echo json_encode(\\YaSite\\contact_projection(json_decode(stream_get_contents(STDIN),true)));';
  const result=spawnSync('php',['-r',code,resolve('web-site-template')],{input:JSON.stringify(value),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
}
function assertPublishedMapSelection() {
  const embed='https://www.google.com/maps/embed?pb=!fixture';
  assert.match(publishedMap({latitude:39,longitude:32,mapDisplayMode:'manual',googleMapsEmbedUrl:embed}).embed,/^https:\/\/www.openstreetmap.org\//);
  assert.equal(publishedMap({latitude:39,longitude:32,mapDisplayMode:'google_maps_embed',googleMapsEmbedUrl:embed}).embed,embed);
  assert.equal(publishedMap({latitude:39,longitude:32,mapDisplayMode:'google_maps_embed',googleMapsEmbedUrl:'https://invalid.test'}).embed,'','Google selection never falls back to manual coordinates');
}
if(process.argv.includes('--map-contract-only')) { assertPublishedMapSelection(); console.log('settings-public-map-contract-ok'); process.exit(0); }

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { BUSINESS_CAPABILITIES: C, COMMERCE_SHIPPING_PROVIDERS, ARAS_SHIPPING_PROVIDER, compareVersions } = require("../packages/shared/dist");
const { createCurrentBusinessWebContext } = require("../apps/desktop-app/dist-electron/business-ai-context-service.js");
const { getBusinessPublicProfile, saveBusinessPublicProfile } = require("../apps/desktop-app/dist-electron/business-public-profile.js");
const root = mkdtempSync(join(tmpdir(), "settings-correctness-"));
const db = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: root });
const secrets = fixtureSecretService();
const activationExports = {};
const compiledRequire = createRequire(resolve("apps/desktop-app/dist-electron/setup-service-activation.js"));
runInNewContext(readFileSync(resolve("apps/desktop-app/dist-electron/setup-service-activation.js"), "utf8"), {
  exports: activationExports,
  require: name => name === "./shipping-secret-service" ? secrets
    : name === "./ai-secret-service" ? { getEffectiveAiApiKey: () => "" }
    : name === "./business-messaging/secret-service" ? { decryptMessagingSecret: () => "" } : compiledRequire(name)
});
const validate = (input, database = db) => activationExports.validateSetupServiceActivation(database, input);
function loadProvider(filename, overrides, globals = {}) {
  const exports = {}, file = resolve(`apps/desktop-app/dist-electron/${filename}.js`);
  const providerRequire = createRequire(file);
  runInNewContext(readFileSync(file, "utf8"), { exports, Buffer, URL, Error, AbortController, setTimeout, clearTimeout,
    ...globals, require: name => overrides[name] ?? providerRequire(name) });
  return exports;
}
const setup = { businessName: "Settings fixture", profileId: "market", profileOptions: [C.ONLINE_SALES, C.WHOLESALE, C.MESSAGING_CAMPAIGNS],
  phone: "", whatsapp: "", email: "", address: "Draft-safe address", webModuleUrl: "https://example.test/module", syncSecret: "fixture-sync-secret", autoSyncEnabled: false,
  onlineSalesDeliveryEnabled: true, onlineSalesDelivery: { pickupEnabled: true, shippingEnabled: false },
  aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiBaseUrl: "https://api.openai.com/v1", aiModel: "", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
  servicePreferences: { whatsapp: false, android: false } };
let raw;
try {
  db.initialize();
  db.recordServiceSettingsVerification("web", { baseUrl: setup.webModuleUrl, syncSecret: setup.syncSecret });
  // Each service merge carries only its fields, preserving every other owner and draft.
  const fieldCode = ts.transpileModule(readFileSync(resolve("apps/desktop-app/src/app/settings-service-fields.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const fields = {};
  runInNewContext(fieldCode, { exports: fields });
  const canonicalForm = Object.fromEntries(Object.values(fields.serviceSettingsFields).flat().map(key => [key, `saved:${key}`]));
  canonicalForm.businessName = "Saved business";
  const dirtyForm = Object.fromEntries(Object.keys(canonicalForm).map(key => [key, `dirty:${key}`]));
  const owned = new Set();
  for (const [id, keys] of Object.entries(fields.serviceSettingsFields)) {
    const merged = fields.copySettingsFields(canonicalForm, dirtyForm, keys);
    for (const key of Object.keys(canonicalForm)) assert.equal(merged[key], keys.includes(key) ? dirtyForm[key] : canonicalForm[key], `${id}: isolated save ${key}`);
    const discarded = fields.copySettingsFields(dirtyForm, canonicalForm, keys);
    for (const key of Object.keys(dirtyForm)) assert.equal(discarded[key], keys.includes(key) ? canonicalForm[key] : dirtyForm[key], `${id}: isolated discard ${key}`);
    assert.equal(fields.settingsFieldsDirty(dirtyForm, canonicalForm, keys), true);
    assert.equal(fields.settingsFieldsDirty(discarded, canonicalForm, keys), false);
    for (const key of keys) { assert.equal(owned.has(key), false, `${key}: only one service writer`); owned.add(key); }
  }

  for (const online of [false, true]) {
    const initial = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: join(root, online ? "online-first-run" : "offline-first-run") });
    try {
      initial.initialize();
      const input = { ...setup, businessName: "", autoSyncEnabled: online, syncSecret: online ? setup.syncSecret : "", webModuleUrl: online ? setup.webModuleUrl : "" };
      assert.equal(initial.getSetupData().setupRequired, true);
      if (online) {
        assert.match(validate(input, initial), /test edin/, "initial online setup requires real main-process test evidence");
        initial.recordServiceSettingsVerification("web", { baseUrl: input.webModuleUrl, syncSecret: input.syncSecret });
        assert.match(validate({ ...input, syncSecret: "another-tested-secret" }, initial), /test edin/, "proof binds to exact effective transport");
      }
      assert.equal(validate(input, initial), null, "offline setup needs no web proof or secret");
      assert.equal(initial.saveInitialSetup(input).ok, true, "company name and phone are optional without WhatsApp");
      assert.equal(initial.getSetupData().businessName, "", "persist non-null empty company name");
      assert.equal(initial.getSetupData().setupRequired, false);
      assert.match(validate({ ...input, autoSyncEnabled: true, webModuleUrl: setup.webModuleUrl, syncSecret: "new-transport-secret" }, initial), /test edin/, "existing activation checks remain enforced");
    } finally { initial.close(); }
  }
  const empty = { enabled: false, environment: "test", customerCode: "", username: "", password: "" };
  const shippingMethods = { pickupEnabled: false, shippingEnabled: true };
  const shippingSetup = { ...setup, onlineSalesDelivery: shippingMethods };
  assert.equal(COMMERCE_SHIPPING_PROVIDERS.aras, ARAS_SHIPPING_PROVIDER);
  for (const [id, provider] of Object.entries(COMMERCE_SHIPPING_PROVIDERS)) assert.equal(provider.id, id);
  assert.equal(validate({ ...setup, arasShipping: empty }), null);
  assert.equal(db.saveInitialSetup({ ...setup, arasShipping: empty }).ok, true, "disabled empty config saves");
  assert.equal(validate({ ...setup, arasShipping: { ...empty, enabled: true } }), null, "legacy provider flag cannot require configuration when shipping is off");
  assert.equal(db.saveInitialSetup({ ...setup, arasShipping: { ...empty, enabled: true } }).ok, true);
  assert.equal(db.getSetupData().arasShipping.enabled, false, "legacy enabled is derived from the delivery method");
  assert.match(validate({ ...shippingSetup, arasShipping: empty }), /yapılandırma/);
  assert.equal(db.saveInitialSetup({ ...shippingSetup, arasShipping: empty }).ok, false, "shipping requires credentials even if legacy flag is false");
  const shipping = { ...testCredentials, enabled: false };
  assert.equal(validate({ ...setup, arasShipping: shipping }), null, "shipping off permits untested configuration");
  assert.match(validate({ ...shippingSetup, arasShipping: shipping }), /test edin/);
  const http = fixtureHttp(), service = fixtureShippingService(() => db, http, secrets);
  http.state.failQuery = true;
  assert.equal((await service.testConnection(shipping)).ok, false);
  assert.match(validate({ ...shippingSetup, arasShipping: shipping }), /test edin/, "failed first test cannot authorize shipping");
  http.state.failQuery = false;
  assert.equal((await service.testConnection(shipping)).ok, true);
  assert.equal(validate({ ...shippingSetup, arasShipping: shipping }), null, "successful draft test authorizes same config without independent provider activation");
  for (const patch of [{ username: "another" }, { customerCode: "another" }, { password: "another" }, { environment: "production" }]) {
    assert.match(validate({ ...shippingSetup, arasShipping: { ...shipping, ...patch } }), /test edin/);
  }
  const write = secrets.createShippingSecretWrite(shipping);
  const save = (patch = {}) => db.saveInitialSetup({ ...shippingSetup, arasShipping: { ...shipping, password: "" }, ...patch }, undefined, undefined, write);
  assert.equal(save().ok, true);
  assert.equal(validate({ ...shippingSetup, arasShipping: { ...shipping, password: "" } }), null, "persisted secret matches successful draft proof");
  assert.equal(service.getConfiguration().verified, true, "main reports stored test evidence");
  http.state.failQuery = true;
  assert.equal((await service.testConnection()).ok, false);
  assert.equal(db.getSetupData().arasShipping.enabled, true, "connection failure cannot disable persisted service");
  assert.equal(validate({ ...shippingSetup, arasShipping: { ...shipping, password: "" } }), null, "transient failure preserves prior evidence");
  assert.equal(save({ onlineSalesDelivery: { pickupEnabled: false, shippingEnabled: false } }).ok, false);
  assert.equal(save({ onlineSalesDelivery: { pickupEnabled: true, shippingEnabled: false } }).ok, true);
  assert.equal(db.getSetupData().arasShipping.enabled, false);
  assert.equal(db.getSetupData().arasShipping.hasSecret, true, "shipping off preserves configuration");
  assert.equal(service.getConfiguration().configured, false, "stored configuration is not active usage while shipping is off");
  assert.equal(service.getConfiguration().verified, true, "shipping off preserves matching test evidence");
  const legacyFlags = new DatabaseSync(db.databasePath);
  try {
    legacyFlags.prepare("UPDATE commerce_shipping_provider_config SET enabled = 1").run();
    assert.equal(service.getConfiguration().enabled, false, "a legacy provider flag cannot activate shipping on reads");
  } finally { legacyFlags.close(); }
  assert.equal(validate({ ...setup, arasShipping: { ...shipping, username: "not-yet-tested" } }), null);
  assert.equal(db.saveInitialSetup({ ...setup, arasShipping: empty, onlineSalesDelivery: { pickupEnabled: false, shippingEnabled: true } }).ok, false);
  assert.equal(save({ onlineSalesDelivery: { pickupEnabled: false, shippingEnabled: true } }).ok, true);
  assert.deepEqual(db.createCommerceOnlineCatalog().deliveryMethods, ["shipping"]);
  assert.equal(save({ onlineSalesDeliveryEnabled: false, onlineSalesDelivery: { pickupEnabled: false, shippingEnabled: false } }).ok, true);
  assert.equal(db.getSetupData().arasShipping.enabled, false);
  assert.equal(db.createCommerceOnlineCatalog().enabled, true, "disabled delivery preserves online channel visibility");
  assert.deepEqual(db.createCommerceOnlineCatalog().deliveryMethods, [], "disabled delivery closes new ordering");

  const ai = { ...setup, aiEnabled: true, aiModel: "gpt-4.1", aiApiKey: "fixture-ai-key", aiImageModel: "" };
  assert.match(validate(ai), /test edin/);
  const aiConfig = { provider: ai.aiProvider, service: ai.aiService, projectName: "", baseUrl: ai.aiBaseUrl,
    model: ai.aiModel, imageModel: "", apiKey: ai.aiApiKey, timeoutSeconds: 30 };
  let aiSucceeds = true;
  const aiProvider = loadProvider("ai-connection-service", {
    "@yardimci-asistan/ai-core": { generateConfiguredChat: async config => aiSucceeds
      ? { ok: true, model: config.model, answer: "Fixture" } : { ok: false, message: "Fixture failure" } },
    "./ai-secret-service": { getEffectiveAiApiKey: () => "" },
    "./desktop-logger": { createDiagnosticOperationId: () => "fixture-ai", desktopLog: {} },
    "./ai-diagnostics": { logAiOperationStarted() {}, logAiOperationCompleted() {} }
  });
  assert.equal((await aiProvider.testAiConnection(db, { ...aiConfig, useStoredApiKey: false })).ok, true);
  assert.equal(validate(ai), null);
  aiSucceeds = false;
  assert.equal((await aiProvider.testAiConnection(db, { ...aiConfig, useStoredApiKey: false })).ok, false);
  assert.equal(validate(ai), null, "runtime AI failure does not revoke valid activation evidence");
  for (const patch of [{ aiModel: "gpt-4.2" }, { aiBaseUrl: "https://other.test/v1" }, { aiApiKey: "other" }, { aiImageModel: "gpt-image-1" }, { aiService: "custom" }]) assert.match(validate({ ...ai, ...patch }), /test edin/);

  // Cloudflare connection proof includes the selected vision model.
  // Save policy must compare exactly the same fingerprint as the successful test.
  const cloudflare = {
    ...ai, aiService: "cloudflare", aiProjectName: "", aiBaseUrl: "https://api.cloudflare.com/client/v4/accounts/" + "a".repeat(32) + "/ai",
    aiModel: "@cf/zai-org/glm-4.7-flash", aiVisionModel: "@cf/meta/llama-4-scout-17b-16e-instruct",
    aiImageModel: "@cf/black-forest-labs/flux-1-schnell"
  };
  const verifiedCloudflare = {
    provider: cloudflare.aiProvider, service: cloudflare.aiService, projectName: cloudflare.aiProjectName,
    baseUrl: cloudflare.aiBaseUrl, model: cloudflare.aiModel, visionModel: cloudflare.aiVisionModel,
    imageModel: cloudflare.aiImageModel, apiKey: cloudflare.aiApiKey, timeoutSeconds: cloudflare.aiTimeoutSeconds
  };
  assert.match(validate(cloudflare), /test edin/, "Cloudflare requires a real saved test proof");
  db.recordServiceSettingsVerification("ai", verifiedCloudflare);
  assert.equal(validate(cloudflare), null, "Cloudflare text + vision + image test authorizes the exact same Save draft");
  assert.match(validate({ ...cloudflare, aiVisionModel: "" }), /test edin/, "changing vision invalidates Cloudflare proof");
  assert.match(validate({ ...cloudflare, aiImageModel: "" }), /test edin/, "changing generated-image model invalidates proof");

  for (const [field, serviceId, configuration, credentials, change] of [
    ["sms", "sms", { enabled: true, senderId: "FIXTURE", iysList: "BIREYSEL", apiKey: "fixture-key", apiHash: "fixture-hash" }, { senderId: "FIXTURE", iysList: "BIREYSEL", apiKey: "fixture-key", apiHash: "fixture-hash" }, { senderId: "OTHER" }],
    ["whatsappCloud", "whatsapp_cloud", { enabled: true, wabaId: "123", phoneNumberId: "456", accessToken: "fixture-token" }, { wabaId: "123", phoneNumberId: "456", accessToken: "fixture-token" }, { phoneNumberId: "789" }]
  ]) {
    assert.equal(validate({ ...setup, [field]: { ...configuration, enabled: false } }), null);
    assert.match(validate({ ...setup, [field]: configuration }), /test edin/);
    db.recordServiceSettingsVerification(serviceId, credentials);
    assert.equal(validate({ ...setup, [field]: configuration }), null);
    assert.match(validate({ ...setup, [field]: { ...configuration, ...change } }), /test edin/);
  }
  const beforeProfileValidation = db.getSetupData();
  assert.equal(validate({ ...setup, profileId: "pension", aiEnabled: true,
    onlineSalesDeliveryEnabled: true, onlineSalesDelivery: { pickupEnabled: false, shippingEnabled: true },
    whatsappCloud: { enabled: true, wabaId: "", phoneNumberId: "", accessToken: "" } }), null,
  "profile transition validates effective OFF activations, not inherited usage or stale activation evidence");
  assert.deepEqual(db.getSetupData(), beforeProfileValidation, "validation/preview cannot persist a transition");
  const aiRuntime = {};
  const aiRequire = createRequire(resolve("apps/desktop-app/dist-electron/marketing/ai-service.js"));
  runInNewContext(readFileSync(resolve("apps/desktop-app/dist-electron/marketing/ai-service.js"), "utf8"), { exports: aiRuntime, require: name =>
    name === "../ai-secret-service" ? { getEffectiveAiApiKey: () => "runtime-fixture-key" } : aiRequire(name) });
  let selectedImage = "";
  const aiDb = { getEnabledBusinessCapabilities: () => [C.AI], getSetupData: () => ({ aiService: "openai", aiProfiles: [{
    service: "openai", model: "gpt-4.1", imageModel: selectedImage, modelOptions: [], baseUrl: "https://api.openai.com/v1", apiKeyConfigured: true, timeoutSeconds: 30 }] }) };
  assert.equal(aiRuntime.resolveMarketingAi(aiDb, "image_generation").model, "gpt-image-1");
  selectedImage = "gpt-image-1.5";
  assert.equal(aiRuntime.resolveMarketingAi(aiDb, "image_generation").model, "gpt-image-1.5");
  assert.equal(aiRuntime.resolveMarketingAi(aiDb, "text_generation").model, "gpt-4.1");
  assert.equal(save({ aiModel: "gpt-4.1", aiImageModel: "gpt-image-1.5" }).ok, true);
  assert.equal(db.getSetupData().aiModel, "gpt-4.1");
  assert.equal(db.getSetupData().aiImageModel, "gpt-image-1.5");
  const reopened = new DesktopDatabase({ appPath: resolve("apps/desktop-app"), userDataPath: root });
  try {
    reopened.initialize();
    assert.equal(reopened.getServiceSettingsVerification("aras"), db.getServiceSettingsVerification("aras"));
    assert.equal(reopened.getSetupData().arasShipping.enabled, true);
  } finally { reopened.close(); }
  const autoSync = { ...setup, autoSyncEnabled: true };
  db.clearServiceSettingsVerification("web");
  assert.equal(validate(autoSync), null, "passive sync preference needs no new connection test");
  db.recordServiceSettingsVerification("web", { baseUrl: setup.webModuleUrl, syncSecret: setup.syncSecret });
  assert.equal(validate(autoSync), null);
  assert.match(validate({ ...autoSync, webModuleUrl: "https://another.test/module" }), /test edin/);
  assert.match(validate({ ...autoSync, syncSecret: "different-fixture-secret" }), /test edin/);
  assert.equal(save({ autoSyncEnabled: true }).ok, true);
  assert.equal(validate(autoSync), null, "unchanged active transport retains matching evidence");
  db.recordServiceSettingsVerification("web", { baseUrl: "https://other.test", syncSecret: setup.syncSecret });
  assert.equal(validate({ ...autoSync, address: "Offline local edit" }), null, "unchanged active transport permits unrelated local saves without matching evidence");
  db.clearServiceSettingsVerification("web");
  assert.equal(validate({ ...autoSync, businessName: "Local offline name" }), null, "missing proof cannot block unrelated local saves");
  assert.equal(validate({ ...autoSync, webModuleUrl: setup.webModuleUrl + "/" }), null, "trailing slash is the same effective transport");
  assert.match(validate({ ...autoSync, syncSecret: "new-untested-secret" }), /test edin/);
  assert.match(validate({ ...autoSync, webModuleUrl: "https://new.test" }), /test edin/);
  assert.match(validate({ ...setup, syncSecret: "new-offline-secret" }), /test edin/, "transport changes still require evidence with passive sync OFF");
  assert.equal(db.saveInitialSetup(setup).ok, true);
  assert.equal(validate(autoSync), null, "reenabling unchanged transport saves locally without a new test");
  assert.equal(validate({ ...setup, webModuleUrl: "", syncSecret: "", autoSyncEnabled: false }), null, "disconnecting is a local choice without test evidence");
  assert.match(validate({ ...setup, arasShipping: { ...shipping, username: null } }), /geçersiz/);

  assert.equal(db.saveInitialSetup({ ...setup, profileId: "pension" }).ok, true);
  const electron = { safeStorage: { isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(value), decryptString: value => value.toString() } };
  const kbs = loadProvider("kbs-settings", { electron });
  const kbsInput = { enabled: true, provider: "egm", facilityCode: "", username: "fixture",
    authorizedIdentityNumber: "10000000146", password: "fixture-password", clearPassword: false };
  assert.equal(kbs.saveKbsSettings(db.databasePath, { ...kbsInput, enabled: false, username: "", password: "" }).ok, true);
  assert.match(kbs.saveKbsSettings(db.databasePath, kbsInput).message, /test edin/);
  const kbsResult = await kbs.testKbsConnection(db.databasePath, kbsInput);
  assert.equal(kbsResult.ok, true);
  assert.equal(kbsResult.credentialsVerified, false, "EGM readiness must not claim authenticated login");
  assert.equal(kbs.saveKbsSettings(db.databasePath, kbsInput).ok, true);
  assert.match(kbs.saveKbsSettings(db.databasePath, { ...kbsInput, username: "changed" }).message, /test edin/);

  let reviewsSucceeds = true;
  const reviews = loadProvider("google-reviews-settings", { electron }, { fetch: async () =>
    new Response(JSON.stringify({ ok: reviewsSucceeds, name: "Fixture place" })) });
  const reviewsInput = { enabled: true, placeId: "fixture-place", apiKey: "fixture-places-key", clearApiKey: false };
  assert.equal(reviews.saveGoogleReviewsSettings(db.databasePath, { ...reviewsInput, enabled: false, placeId: "", apiKey: "" }).ok, true);
  assert.match(reviews.saveGoogleReviewsSettings(db.databasePath, reviewsInput).message, /test edin/);
  assert.equal((await reviews.testGoogleReviewsConnection(db.databasePath, reviewsInput,
    { baseUrl: setup.webModuleUrl, syncSecret: setup.syncSecret }, "fixture-client")).ok, true);
  assert.equal(reviews.saveGoogleReviewsSettings(db.databasePath, reviewsInput).ok, true);
  assert.match(reviews.saveGoogleReviewsSettings(db.databasePath, { ...reviewsInput, placeId: "changed" }).message, /test edin/);
  reviewsSucceeds = false;
  assert.equal((await reviews.testGoogleReviewsConnection(db.databasePath, reviewsInput,
    { baseUrl: setup.webModuleUrl, syncSecret: setup.syncSecret }, "fixture-client")).ok, false);
  assert.equal(reviews.getGoogleReviewsSettings(db.databasePath).enabled, true);

  assert.equal(db.saveInitialSetup({ ...setup, profileId: "market" }).ok, true);
  assert.match(kbs.saveKbsSettings(db.databasePath, kbsInput).message, /konaklama yönetimi gerekli/);
  assert.match(reviews.saveGoogleReviewsSettings(db.databasePath, reviewsInput).message, /konaklama yönetimi gerekli/);
  assert.equal(kbs.getKbsSettings(db.databasePath).enabled, false);
  assert.equal(reviews.getGoogleReviewsSettings(db.databasePath).enabled, false);

  // Canonical coordinates remain persisted, but Web receives only the selected source.
  const embed = "https://www.google.com/maps/embed?pb=!fixture";
  assert.equal(saveBusinessPublicProfile(db.databasePath, { ...getBusinessPublicProfile(db.databasePath), mapDisplayMode: "google_maps_embed", googleMapsEmbedUrl: embed,
    latitude: 39, longitude: 32 }).ok, true);
  assert.equal(saveBusinessPublicProfile(db.databasePath, {
    ...getBusinessPublicProfile(db.databasePath),
    aboutText: "Bizim hikâyemiz.\nİkinci bölüm."
  }).ok, true);
  assert.equal(getBusinessPublicProfile(db.databasePath).aboutText, "Bizim hikâyemiz.\nİkinci bölüm.");
  let web = createCurrentBusinessWebContext(db);
  assert.equal(web.aboutText, "Bizim hikâyemiz.\nİkinci bölüm.");
  assert.deepEqual(web.gallery, []);
  assert.equal(web.mapDisplayMode, "google_maps_embed");
  assert.equal(web.latitude, null);
  assert.equal(web.googleMapsEmbedUrl, embed);
  assert.equal(saveBusinessPublicProfile(db.databasePath, { ...getBusinessPublicProfile(db.databasePath), mapDisplayMode: "manual", googleMapsEmbedUrl: embed, latitude: 39, longitude: 32 }).ok, true);
  web = createCurrentBusinessWebContext(db);
  assert.equal(web.latitude, 39);
  assert.equal(web.googleMapsEmbedUrl, "");
  assertPublishedMapSelection();
  assert.match(publishedMap(web).embed,/^https:\/\/www.openstreetmap.org\//,'Actual Desktop web context reaches the canonical map projection');
  raw = new DatabaseSync(db.databasePath);
  assert.equal(raw.prepare("SELECT latitude FROM business_public_profile").get().latitude, 39);
  for (const [remote, expected] of [["2.0.1", -1], ["2.0.2", 0], ["2.0.3", 1]]) assert.equal(compareVersions(remote, "2.0.2"), expected);
  assert.equal(compareVersions("2.0.2-rc.2", "2.0.2-rc.10"), -1);
  console.log("settings-correctness-smoke-ok: activation evidence, invalidation, delivery, runtime failure, publication and versions");
} finally { raw?.close(); db.close(); rmSync(root, { recursive: true, force: true }); }
