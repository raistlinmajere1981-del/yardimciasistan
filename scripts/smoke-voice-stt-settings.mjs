import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { exactFixtureReceipt } from "./test-helpers/publication-protocol.mjs";

const require = createRequire(import.meta.url);
// OS encryption is mocked with real authenticated encryption; no base64 plaintext fixture.
const cryptoKey = randomBytes(32);
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString(value) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", cryptoKey, iv);
    const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
  },
  decryptString(value) {
    const cipher = createDecipheriv("aes-256-gcm", cryptoKey, value.subarray(0, 12));
    cipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString("utf8");
  }
};
const originalLoad = Module._load;
Module._load = function (id, ...args) { return id === "electron" ? { safeStorage } : originalLoad.call(this, id, ...args); };
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { testAiConnection } = require("../apps/desktop-app/dist-electron/ai-connection-service.js");
const { publishSavedAiSettings } = require("../apps/desktop-app/dist-electron/ai-settings-publish-service.js");
const { createAiApiKeyUpdate, createAiProfileApiKeyUpdates } = require("../apps/desktop-app/dist-electron/ai-secret-service.js");
Module._load = originalLoad;
const shared = require("@yardimci-asistan/shared");

const tsCache = new Map();
function frontend(file) {
  if (tsCache.has(file)) return tsCache.get(file);
  const module = { exports: {} };
  tsCache.set(file, module.exports);
  const localRequire = createRequire(file);
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module, exports: module.exports, structuredClone, require: id => id.startsWith(".") ? frontend(resolve(dirname(file), `${id}.ts`)) : localRequire(id) });
  return module.exports;
}
const model = frontend(resolve("apps/desktop-app/src/app/setup-model.ts"));
const drafts = frontend(resolve("apps/desktop-app/src/app/settings-draft-model.ts"));
const root = mkdtempSync(join(tmpdir(), "voice-stt-settings-"));
const options = { appPath: resolve("apps/desktop-app"), userDataPath: root };
let db = new DesktopDatabase(options);
let raw;
const nativeFetch = globalThis.fetch;
try {
  db.initialize();
  const setup = createSmokeSetupInput({ businessName: "Voice settings fixture", phone: "", whatsapp: "", syncSecret: "voice-settings-sync-secret",
    servicePreferences: { whatsapp: false, android: false }, aiModel: "gpt-4.1", aiImageModel: "gpt-image-1" });
  assert.equal(db.saveInitialSetup(setup).ok, true);
  assert.equal(db.getSetupData().aiSttModel, "", "default disabled");
  assert.ok(db.getAiServiceProfiles().every(profile => profile.sttModel === ""));
  const baseline = model.toSetupForm(db.getSetupData());
  let form = { ...baseline, aiSttModel: "gpt-4o-mini-transcribe" };
  assert.equal(drafts.isCategoryDirty(form, baseline, "services"), true);
  assert.equal(drafts.isCategoryDirty(form, baseline, "business"), false);
  form = model.selectAiService(form, "gemini");
  assert.equal(form.aiSttModel, "");
  form = { ...form, aiSttModel: "gemini-2.5-flash", aiModel: "gemini-2.5-flash" };
  form = model.selectAiService(form, "openai");
  assert.equal(form.aiSttModel, "gpt-4o-mini-transcribe", "provider switching preserves draft");
  assert.equal(form.aiModel, "gpt-4.1");
  assert.equal(form.aiImageModel, "gpt-image-1");
  const discarded = drafts.copyCategory(form, baseline, "services");
  assert.equal(discarded.aiSttModel, "");
  assert.equal(discarded.aiServiceDrafts.gemini.sttModel, "");
  assert.equal(drafts.isCategoryDirty(discarded, baseline, "services"), false);
  const input = model.createSetupInput(form);
  assert.equal(db.saveInitialSetup(input).ok, true);
  db.close(); db = new DesktopDatabase(options); db.initialize();
  let snapshot = db.getSetupData();
  assert.equal(snapshot.aiSttModel, "gpt-4o-mini-transcribe");
  assert.equal(snapshot.aiProfiles.find(profile => profile.service === "gemini").sttModel, "gemini-2.5-flash");
  const save = patch => db.saveInitialSetup({ ...model.createSetupInput(model.toSetupForm(db.getSetupData())), ...patch });
  assert.equal(save({ aiSttModel: undefined, aiProfiles: undefined }).ok, true, "omission preserves canonical selection");
  for (const stt of ["gpt-4o", "gemini-3.5-transcribe", "../audio", null, ["whisper-1"]]) {
    assert.equal(save({ aiSttModel: stt }).ok, false, "authority rejects invalid models/types");
  }
  for (const aiBaseUrl of ["http://api.openai.com/v1", "https://127.0.0.1/v1", "https://api.openai.com/v1?evil", "file:///secret"]) {
    assert.equal(save({ aiBaseUrl }).ok, false, "authority rejects unsafe STT origin");
  }
  for (const service of ["openai", "gemini", "cloudflare", "custom", "groq", "openrouter"]) {
    assert.equal(save({ aiProfiles: [{ service, projectName: "", baseUrl: "https://api.openai.com/v1", model: "", sttModel: "gpt-4o", timeoutSeconds: 30, apiKey: "", clearApiKey: false }] }).ok, false,
      "active and inactive profile input is validated");
    const php = spawnSync("php", ["-r", 'require $argv[1]; echo json_encode(ya_stt_models($argv[2]));', resolve("firm-template/web-module/lib/audio-transcription.php"), service], { encoding: "utf8" });
    assert.equal(php.status, 0, php.stderr);
    assert.deepEqual(JSON.parse(php.stdout), shared.sttModelOptions(service), "Desktop/Hosting model policy parity");
  }
  assert.equal(save({ aiService: "gemini", aiBaseUrl: "https://generativelanguage.googleapis.com/v1beta", aiModel: "gemini-2.5-flash", aiImageModel: "", aiSttModel: "gemini-2.5-flash" }).ok, true);
  assert.equal(db.getSetupData().aiSttModel, "gemini-2.5-flash");
  assert.equal(save({ aiService: "openai", aiBaseUrl: "https://api.openai.com/v1", aiModel: "gpt-4.1", aiImageModel: "gpt-image-1", aiSttModel: "whisper-1" }).ok, true);
  const key = "voice-provider-fixture-key";
  const encrypted = createAiApiKeyUpdate({ aiApiKey: key, clearAiApiKey: false });
  assert.equal(encrypted.ok, true);
  const aiConfig = { provider: "openai_compatible", service: "openai", projectName: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1", imageModel: "gpt-image-1", apiKey: key, timeoutSeconds: 30 };
  db.recordServiceSettingsVerification("ai", aiConfig);
  assert.equal(db.saveInitialSetup({ ...model.createSetupInput(model.toSetupForm(db.getSetupData())), aiEnabled: true, aiApiKey: key },
    encrypted.update).ok, true, "STT static support does not falsely require/claim an audio recording test");
  const inactiveKey = "voice-google-fixture-key";
  const withSecrets = model.createSetupInput(model.toSetupForm(db.getSetupData()));
  withSecrets.aiProfiles = withSecrets.aiProfiles.map(profile => profile.service === "gemini" ? { ...profile, apiKey: inactiveKey } : profile);
  const profileSecrets = createAiProfileApiKeyUpdates(withSecrets);
  assert.equal(profileSecrets.ok, true);
  assert.equal(db.saveInitialSetup({ ...withSecrets, aiProfiles: profileSecrets.profiles }, { mode: "keep" }, profileSecrets.updates).ok, true);
  const storedKeys = [db.getEncryptedAiApiKey("openai"), db.getEncryptedAiApiKey("gemini")];
  assert.equal(JSON.stringify(db.getSetupData()).includes(key) || JSON.stringify(db.getSetupData()).includes(inactiveKey), false, "preload Setup projection never exposes keys");
  const config = { baseUrl: "https://hosting.example.test/module", syncSecret: setup.syncSecret };
  db.ensurePublicationTarget(config.baseUrl); db.savePublicationSourceEpoch(config.baseUrl, 1);
  let phase = "lost", onSend = null;
  const sent = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body); sent.push(body);
    assert.equal(body.action, "publish_ai_settings");
    assert.equal(body.payload_hash, createHash("sha256").update(body.publication_body).digest("hex"));
    assert.equal(JSON.parse(body.publication_body).stt_model, body.ai_settings.stt_model);
    onSend?.();
    if (phase === "lost") throw new Error("fixture lost response");
    return new Response(JSON.stringify({ ok: true, message: "Applied", ...exactFixtureReceipt(body,
      phase === "wrong" ? { payload_hash: "0".repeat(64) } : {}) }));
  };
  assert.equal((await publishSavedAiSettings(db, config)).ok, false);
  const first = sent[0];
  assert.equal(first.ai_settings.stt_model, "whisper-1");
  assert.equal(first.ai_settings.api_key, key);
  raw = new DatabaseSync(db.databasePath);
  assert.equal(JSON.stringify(raw.prepare("SELECT payload FROM sync_publication_payloads WHERE job_key='ai_settings'").all()).includes(key), false, "frozen secret is encrypted");
  raw.close(); raw = null;
  db.close(); db = new DesktopDatabase(options); db.initialize();
  phase = "wrong";
  assert.equal((await publishSavedAiSettings(db, config, true)).ok, false);
  assert.equal(db.getSetupData().aiLastPublishedAt, "");
  assert.equal(db.getPendingSyncJobs("9999").some(job => job.jobKey === "ai_settings"), true);
  phase = "ok";
  assert.equal((await publishSavedAiSettings(db, config, true)).ok, true);
  for (const retry of sent.slice(1)) assert.deepEqual(retry, first, "restart/ack retry preserves exact wire identity/body");
  assert.equal(db.getPendingSyncJobs("9999").some(job => job.jobKey === "ai_settings"), false);
  snapshot = db.getSetupData();
  assert.equal(snapshot.aiLastPublishedAt, "2026-10-06T00:00:00Z");
  db.recordServiceSettingsVerification("desktop_stt", { audio: "fixture verified configuration" });
  assert.equal(save({ aiSttModel: "gpt-4o-transcribe" }).ok, true);
  assert.equal(db.getSetupData().aiLastPublishedAt, "", "STT-only edits cannot reuse the previous publication timestamp");
  assert.equal(db.getServiceSettingsVerification("desktop_stt"), "", "STT edits withdraw saved audio test evidence atomically");
  const newer = db.getPendingSyncJobs("9999").find(job => job.jobKey === "ai_settings");
  assert.ok(newer.sourceRevision > first.source_revision, "STT-only mutation invalidates publication");
  const previousPublished = db.getSetupData().aiLastPublishedAt;
  onSend = () => { assert.equal(save({ aiSttModel: "gpt-4o-mini-transcribe" }).ok, true); };
  assert.equal((await publishSavedAiSettings(db, config, true)).ok, true);
  assert.equal(db.getSetupData().aiLastPublishedAt, previousPublished, "older receipt does not mark in-flight STT edit published");
  assert.ok(db.getPendingSyncJobs("9999").some(job => job.jobKey === "ai_settings" && job.sourceRevision > newer.sourceRevision));
  onSend = null;
  assert.equal((await publishSavedAiSettings(db, config, true)).ok, true);
  assert.equal(sent.at(-1).ai_settings.stt_model, "gpt-4o-mini-transcribe");
  const initialAutoSync = db.getSetupData().autoSyncEnabled;
  for (const patch of [{ autoSyncEnabled: !initialAutoSync }, { autoSyncEnabled: initialAutoSync }, { webModuleUrl: "https://changed-host.example/module" },
    { webModuleUrl: setup.webModuleUrl }, { syncSecret: "changed-web-fixture-secret" }, { syncSecret: setup.syncSecret }]) {
    const transport = { ...db.getSetupData(), ...patch };
    db.recordServiceSettingsVerification("web", { baseUrl: transport.webModuleUrl.replace(/\/+$/, ""), syncSecret: transport.syncSecret });
    db.recordServiceSettingsVerification("desktop_stt", { audio: "fixture verified configuration" });
    assert.equal(save(patch).ok, true);
    assert.notEqual(db.getServiceSettingsVerification("desktop_stt"), "", "Web changes preserve Desktop audio evidence");
  }
  assert.equal(save({ aiSttModel: "" }).ok, true);
  assert.equal((await publishSavedAiSettings(db, config, true)).ok, true);
  assert.equal(sent.at(-1).ai_settings.stt_model, "", "explicit OFF is published");
  assert.equal(db.getSetupData().aiModel, "gpt-4.1");
  assert.equal(db.getSetupData().aiImageModel, "gpt-image-1");
  assert.deepEqual([db.getEncryptedAiApiKey("openai"), db.getEncryptedAiApiKey("gemini")], storedKeys, "STT changes preserve all provider ciphertext");
  // Catalog fixture, not a production fallback list.
  const cfModels = {
    text: "@cf/zai-org/glm-4.7-flash", vision: "@cf/meta/llama-4-scout-17b-16e-instruct",
    image: "@cf/black-forest-labs/flux-1-schnell", stt: "@cf/openai/whisper-large-v3-turbo"
  };
  const cfCatalog = Object.entries(cfModels).map(([task, id]) => ({ id, label: id, task }));
  const beforeCloudflare = model.toSetupForm(db.getSetupData());
  let cfForm = model.selectAiService(beforeCloudflare, "cloudflare");
  cfForm = { ...cfForm, aiBaseUrl: shared.cloudflareAiBaseUrl("a".repeat(32)), aiModel: cfModels.text,
    aiModelOptions: cfCatalog, aiVisionModel: cfModels.vision, aiImageModel: cfModels.image, aiSttModel: cfModels.stt, aiApiKey: "voice-cloudflare-fixture-key" };
  assert.equal(drafts.isCategoryDirty(cfForm, model.selectAiService(beforeCloudflare, "cloudflare"), "services"), true);
  const switched = model.selectAiService(model.selectAiService(cfForm, "gemini"), "cloudflare");
  assert.equal(switched.aiVisionModel, cfModels.vision); assert.equal(switched.aiSttModel, cfModels.stt);
  assert.equal(switched.aiApiKey, "voice-cloudflare-fixture-key"); assert.equal(switched.aiBaseUrl, cfForm.aiBaseUrl);
  const publicationFetch = globalThis.fetch;
  const cfRequests = [];
  const cfConnection = { provider: "openai_compatible", service: "cloudflare", projectName: "", baseUrl: cfForm.aiBaseUrl,
    model: cfModels.text, visionModel: cfModels.vision, imageModel: "", apiKey: cfForm.aiApiKey, useStoredApiKey: false, timeoutSeconds: 30 };
  globalThis.fetch = async (url, init) => {
    if (url.includes("/models/search?")) return new Response(JSON.stringify({ success: true,
      result: cfCatalog.map(item => ({ name: item.id, task: { name: ({ text: "text-generation", vision: "image-to-text", image: "text-to-image", stt: "automatic-speech-recognition" })[item.task] } })) }));
    cfRequests.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ success: true, result: { response: "Cloudflare bağlantısı hazır." } }));
  };
  const cfConnectionResult = await testAiConnection(db, cfConnection);
  assert.equal(cfConnectionResult.ok, true);
  assert.equal(cfConnectionResult.models.some(model => model.id === cfModels.image && model.task === "image"), true, "catalog discovery retains task metadata without granting audio evidence");
  assert.equal(cfRequests.length, 2, "text and selected vision are actual separate requests");
  assert.equal(db.getServiceSettingsVerification("desktop_stt"), "", "text/vision never grants audio evidence");
  assert.ok(cfRequests[1].url.endsWith(`/run/${cfModels.vision}`));
  const unsafeConnection = await testAiConnection(db, { ...cfConnection, baseUrl: `${cfForm.aiBaseUrl}?evil` });
  assert.equal(unsafeConnection.ok, false); assert.equal(cfRequests.length, 2, "invalid account root never sends token");
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, errors: [{ code: 5018, message: cfForm.aiApiKey }] }), { status: 403 });
  const deniedConnection = await testAiConnection(db, cfConnection);
  assert.equal(deniedConnection.ok, false); assert.match(deniedConnection.message, /erişim izni|yetki/i);
  assert.equal(deniedConnection.message.includes(cfForm.aiApiKey), false);
  globalThis.fetch = publicationFetch;
  const cfInput = model.createSetupInput(cfForm), cfSecret = createAiApiKeyUpdate(cfInput);
  assert.equal(cfSecret.ok, true);
  assert.equal(db.saveInitialSetup(cfInput, cfSecret.update).ok, true);
  assert.equal(db.getSetupData().aiVisionModel, cfModels.vision);
  assert.equal(JSON.stringify(db.getSetupData()).includes(cfForm.aiApiKey), false, "Cloudflare projection has no token");
  assert.ok(!db.getEncryptedAiApiKey("cloudflare").includes(cfForm.aiApiKey), "Cloudflare uses OS encryption");
  const savedCfForm = model.toSetupForm(db.getSetupData());
  assert.equal(savedCfForm.aiVisionModel, cfModels.vision);
  assert.equal(savedCfForm.aiApiKey, "");
  assert.equal((await publishSavedAiSettings(db, config, true)).ok, true);
  assert.equal(sent.at(-1).ai_settings.service, "cloudflare"); assert.equal(sent.at(-1).ai_settings.stt_model, cfModels.stt);
  assert.equal(sent.at(-1).ai_settings.base_url, cfForm.aiBaseUrl);
  assert.equal(sent.at(-1).ai_settings.vision_model, cfModels.vision);
  assert.equal(save({ aiVisionModel: "" }).ok, true);
  assert.equal(db.getSetupData().aiLastPublishedAt, "", "vision edits invalidate publication");
  onSend = () => { assert.equal(save({ aiVisionModel: cfModels.vision }).ok, true); };
  assert.equal((await publishSavedAiSettings(db, config, true)).ok, true);
  assert.equal(db.getSetupData().aiLastPublishedAt, "", "older vision receipt cannot mark newer selection published");
  assert.ok(db.getPendingSyncJobs("9999").some(job => job.jobKey === "ai_settings"));
  onSend = null;
  assert.equal((await publishSavedAiSettings(db, config, true)).ok, true);
  assert.equal(sent.at(-1).ai_settings.vision_model, cfModels.vision);
  for (const patch of [{ aiBaseUrl: `${cfForm.aiBaseUrl}?evil` }, { aiVisionModel: cfModels.text }, { aiSttModel: "whisper-1" }, { aiSttModel: "@cf/vendor/unmapped-asr" }]) assert.equal(save(patch).ok, false);
  assert.equal(save({ aiVisionModel: undefined, aiProfiles: undefined }).ok, true, "vision omission preserves choice");
  assert.equal(db.getSetupData().aiVisionModel, cfModels.vision);
  const backToOpenai = model.selectAiService(model.toSetupForm(db.getSetupData()), "openai");
  assert.equal(db.saveInitialSetup(model.createSetupInput(backToOpenai)).ok, true);
  assert.deepEqual([db.getEncryptedAiApiKey("openai"), db.getEncryptedAiApiKey("gemini")], storedKeys, "Cloudflare never overwrites other keys");
  const cfProfile = db.getSetupData().aiProfiles.find(profile => profile.service === "cloudflare");
  assert.equal(cfProfile.visionModel, cfModels.vision); assert.equal(cfProfile.sttModel, cfModels.stt);
  // Real Setup transaction: STT evidence ignores chat/image/Web edits for every provider.
  for (const [service, baseUrl, sttModel, chatModel] of [
    ["openai", "https://api.openai.com/v1", "whisper-1", "gpt-4.1"],
    ["gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-3.6-flash", "gemini-3.6-flash"],
    ["cloudflare", shared.cloudflareAiBaseUrl("a".repeat(32)), cfModels.stt, cfModels.text]
  ]) {
    const switchedForm = model.selectAiService(model.toSetupForm(db.getSetupData()), service);
    const selected = model.createSetupInput({ ...switchedForm, aiBaseUrl: baseUrl, aiModel: chatModel, aiSttModel: sttModel, aiEnabled: true });
    db.recordServiceSettingsVerification("desktop_stt", { fixture: "before provider switch" });
    assert.equal(db.saveInitialSetup(selected).ok, true);
    assert.equal(db.getServiceSettingsVerification("desktop_stt"), "", "Provider/model switch withdraws evidence");
    for (const patch of [...(service === "cloudflare" ? [] : [{ aiModel: `${chatModel}-fixture` }]), { aiModel: chatModel },
      { aiImageModel: "" }, { aiProjectName: "Unrelated project label" },
      { webModuleUrl: "", syncSecret: "", autoSyncEnabled: false }, { autoSyncEnabled: true }]) {
      db.recordServiceSettingsVerification("desktop_stt", { fixture: "preserve audio" });
      const evidence = db.getServiceSettingsVerification("desktop_stt");
      assert.equal(save(patch).ok, true, `${service} unrelated ${JSON.stringify(patch)}`);
      assert.equal(db.getServiceSettingsVerification("desktop_stt"), evidence, `${service}: unrelated settings preserve evidence`);
    }
    for (const patch of [{ aiTimeoutSeconds: 31 }, { aiEnabled: false }, { aiEnabled: true }, { aiSttModel: "" }, { aiSttModel: sttModel }]) {
      db.recordServiceSettingsVerification("desktop_stt", { fixture: "invalidate audio" });
      assert.equal(save(patch).ok, true);
      assert.equal(db.getServiceSettingsVerification("desktop_stt"), "", `${service}: STT relevant settings invalidate evidence`);
    }
    db.recordServiceSettingsVerification("desktop_stt", { fixture: "old key" });
    const rotated = createAiApiKeyUpdate({ aiApiKey: `rotated-${service}-fixture`, clearAiApiKey: false });
    assert.equal(rotated.ok, true);
    const rotatedInput = { ...model.createSetupInput(model.toSetupForm(db.getSetupData())), aiApiKey: `rotated-${service}-fixture` };
    const rotationResult = db.saveInitialSetup(rotatedInput, rotated.update);
    assert.equal(rotationResult.ok, true, rotationResult.message);
    assert.equal(db.getServiceSettingsVerification("desktop_stt"), "", "Encrypted key rotation withdraws evidence");
  }
  console.log("voice-stt-settings-smoke-ok: drafts, persistence, provider policy, durable exact ack/retry, OFF and secret privacy");
} finally {
  Module._load = originalLoad; globalThis.fetch = nativeFetch; raw?.close(); db.close();
  rmSync(root, { recursive: true, force: true });
}
