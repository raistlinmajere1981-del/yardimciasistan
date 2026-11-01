import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import { EventEmitter } from "node:events";
import ts from "typescript";
import { installDictationMock } from "./test-helpers/dictation-fixtures.mjs";

const require = createRequire(import.meta.url);
const shared = require("../packages/shared/dist/index.js");
const handlers = new Map();
const transport = { responses: [], calls: [] };
const fakeHttps = { Agent: class { constructor(options) { this.options = options; } }, request(url, options, onResponse) {
  const req = new EventEmitter(), body = [];
  req.write = chunk => body.push(chunk);
  req.end = chunk => {
    if (chunk) body.push(chunk);
    transport.calls.push({ url, options, body: Buffer.concat(body) });
    queueMicrotask(() => {
      const spec = transport.responses.shift() ?? { status: 200, body: '{"ok":true,"text":"Test metni"}' };
      const response = new EventEmitter(); response.statusCode = spec.status;
      response.destroy = () => response.emit("error", new Error("limit-secret"));
      onResponse(response);
      response.emit("data", (Buffer.isBuffer(spec.body) ? spec.body : Buffer.from(spec.body))); response.emit("end");
    });
  };
  req.destroy = error => req.emit("error", error);
  options.signal.addEventListener("abort", () => req.destroy(new Error("abort-secret")), { once: true });
  return req;
} };
const deadlines = new Map();
const context = createContext({ Buffer, URL, AbortController, setInterval, clearInterval,
  setTimeout: (callback, delay) => { const handle = setTimeout(callback, delay); deadlines.set(handle, { callback, delay }); return handle; },
  clearTimeout: handle => { deadlines.delete(handle); clearTimeout(handle); }, process: { env: {} } });
function triggerDeadline(delay) {
  const timer = [...deadlines].find(([, value]) => value.delay === delay);
  assert.ok(timer, `Active ${delay}ms deadline`);
  const [handle, { callback }] = timer;
  clearTimeout(handle); deadlines.delete(handle); callback();
}
const modules = new Map();
let failPreferenceWrite = false;
function load(file) {
  const filename = resolve(file);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {}; modules.set(filename, exports);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInContext(`(function(exports, require) { ${code}\n})`, context)(exports, name => {
    if (name === "electron") return { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      safeStorage: { isEncryptionAvailable: () => true, decryptString: bytes => bytes.toString("utf8") } };
    if (name === "node:https") return fakeHttps;
    if (name === "node:fs") return { ...require(name), writeFileSync: (...args) => {
      if (failPreferenceWrite) throw new Error("fixture blocked preference write");
      return require(name).writeFileSync(...args);
    } };
    if (name === "@yardimci-asistan/shared") return shared;
    if (name.startsWith("node:")) return require(name);
    return load(resolve(dirname(filename), `${name}.ts`));
  });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const { createDesktopDictationService: createService } = load("apps/desktop-app/electron/desktop-dictation-service.ts");
const { registerDesktopDictationIpcHandlers } = load("apps/desktop-app/electron/ipc/desktop-dictation-ipc.ts");
const { transcribeDesktopStt } = load("apps/desktop-app/electron/desktop-stt-direct.ts");
const preferenceRoot = mkdtempSync(resolve(tmpdir(), "desktop-dictation-"));
process.on("exit", () => rmSync(preferenceRoot, { recursive: true, force: true }));
let setup = { aiEnabled: true, aiProvider: "openai_compatible", aiModel: "gpt-4.1", aiTimeoutSeconds: 30,
  aiLastPublishedAt: "2026-10-13T00:00:00Z", autoSyncEnabled: true, aiApiKeyConfigured: true, aiService: "openai", aiBaseUrl: "https://api.openai.com/v1", aiSttModel: "whisper-1", webModuleUrl: "https://hosting.example/module/", syncSecret: "fixture-private-sync-secret" };
let credential = "fixture-private-provider-key";
const verifications = new Map();
const verificationTimes = new Map();
const { serviceConfigFingerprint } = load("apps/desktop-app/electron/service-settings-validation.ts");
const database = { databasePath: resolve(preferenceRoot, "fixture.sqlite"),
  getSetupData: () => { gates.push("setup"); return setup; },
  getEncryptedAiApiKey: () => `safe-storage:v1:${Buffer.from(credential).toString("base64")}`,
  getServiceSettingsVerification: service => verifications.get(service) ?? "",
  getServiceSettingsVerificationTime: service => verificationTimes.get(service) ?? "",
  clearServiceSettingsVerification: service => { verifications.delete(service); verificationTimes.delete(service); },
  recordServiceSettingsVerification: (service, config) => { verifications.set(service, serviceConfigFingerprint(config)); verificationTimes.set(service, String(Date.now())); } };
let locked = false, ai = true, behavior = "success", pending, uploadCount = 0;
const gates = [];
const service = createService({
  getDatabase: () => database,
  assertUnlocked: () => { gates.push("unlocked"); if (locked) throw new Error("locked-raw-secret"); },
  assertCapability: capability => { gates.push(capability); assert.equal(capability, "service.ai"); if (!ai) throw new Error("capability-raw-secret"); },
  transport: async (url, headers, body, signal) => {
    uploadCount++;
    assert.notEqual(url.hostname, "hosting.example", "Desktop never contacts Hosting");
    assert.equal(url.origin, setup.aiService === "openai" ? "https://api.openai.com" : setup.aiService === "gemini" ? "https://generativelanguage.googleapis.com" : "https://api.cloudflare.com");
    assert.equal(headers[setup.aiService === "gemini" ? "x-goog-api-key" : "Authorization"], setup.aiService === "gemini" ? credential : `Bearer ${credential}`);
    const multipart = headers["Content-Type"].startsWith("multipart/");
    const json = multipart ? null : JSON.parse(body);
    const sentAudio = multipart ? body.subarray(body.indexOf('Content-Type: audio/') + body.subarray(body.indexOf('Content-Type: audio/')).indexOf('\r\n\r\n') + 4, body.lastIndexOf('\r\n--'))
      : Buffer.from(setup.aiService === "gemini" ? json.contents[0].parts[0].inline_data.data : json.audio, "base64");
    assert.ok(sentAudio.length <= 5 * 1024 * 1024);
    if (sentAudio.subarray(0, 4).toString() === "RIFF") {
      assert.equal(sentAudio.readUInt32LE(28), 32000); assert.equal(sentAudio.length, 8044, "Explicit test is one 250ms PCM WAV");
    }
    if (behavior === "throw") throw new Error("raw-provider-auth-secret");
    if (behavior === "wait") return new Promise(resolve => { pending = { resolve, signal }; });
    if (behavior === "oversize") return { status: 200, body: "x".repeat(128 * 1024 + 1) };
    if (behavior === "error") return { status: 502, body: '{"error":"raw-provider-auth-secret"}' };
    if (behavior.startsWith("status:")) return { status: Number(behavior.slice(7)), body: '{"error":"raw-provider-auth-secret"}' };
    if (behavior === "bad-json") return { status: 200, body: "not-json-raw-secret" };
    if (behavior === "legacy") return { status: 200, body: '{"ok":true}' };
    if (behavior === "wrong-shape") return { status: 200, body: '{"text":42,"success":false}' };
    const text = behavior === "long" ? "a".repeat(16001) : behavior === "secret" ? credential
      : behavior === "invalid" ? "<b>Temiz</b>\u0000" : "Düzenlenebilir metin";
    return { status: 200, body: JSON.stringify(setup.aiService === "gemini"
      ? { candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }] }
      : setup.aiService === "cloudflare" ? { success: true, errors: [], result: { text } } : { text }) };
  }
});
registerDesktopDictationIpcHandlers(service);
const sender = new EventEmitter(); sender.id = 11;
const otherSender = new EventEmitter(); otherSender.id = 12;
const invoke = (channel, input, target = sender) => handlers.get(channel)({ sender: target }, input);
const getStatus = () => invoke("dictation:getStatus");
const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 1, 2, 3]);
let sequence = 0;
const input = patch => ({ id: `dictation_test_${String(++sequence).padStart(8, "0")}`, revision: getStatus().revision, mimeType: "audio/webm", audioBase64: audio.toString("base64"), ...patch });
assert.equal(getStatus().available, false); assert.equal(getStatus().canTest, true);
assert.equal(invoke("dictation:saveEnabled", true).ok, false, "Support/configuration alone never enables dictation");
verifications.set("ai", "successful-text-and-image-test");
assert.equal(getStatus().ready, false, "Text/image test cannot verify audio");
const tested = await invoke("dictation:testConnection");
assert.equal(tested.ok, true); assert.equal(tested.status.ready, true); assert.equal(tested.status.enabled, false);
assert.equal(invoke("dictation:saveEnabled", true).ok, true); assert.equal(getStatus().available, true);
assert.deepEqual(Object.keys(getStatus()).sort(), ["available", "canTest", "enabled", "message", "ready", "revision"]);
for (const mode of ["error", "throw", "bad-json", "legacy", "wrong-shape"]) {
  behavior = mode; const result = await invoke("dictation:testConnection");
  assert.equal(result.ok, false, mode); assert.equal(getStatus().available, false, mode);
  assert.equal(verifications.has("desktop_stt"), false, mode);
  assert.ok(!JSON.stringify(result).includes(credential));
}
behavior = "success"; assert.equal((await invoke("dictation:testConnection")).ok, true);
assert.equal(invoke("dictation:saveEnabled", false).ok, true); assert.equal(getStatus().available, false);
assert.equal(setup.aiSttModel, "whisper-1", "OFF preserves the model");
assert.equal(invoke("dictation:saveEnabled", true).ok, true);
const reopened = createService({ getDatabase: () => database, assertUnlocked: () => {}, assertCapability: () => {} });
assert.equal(reopened.getStatus().available, true, "New service instance reads the persisted opt-in/evidence");
failPreferenceWrite = true;
assert.equal(invoke("dictation:saveEnabled", false).ok, false, "Failed persistence cannot claim OFF was saved");
failPreferenceWrite = false; assert.equal(getStatus().available, true);
const oldCredential = credential; credential = "changed-fixture-key";
assert.equal(getStatus().ready, false, "Same key-presence flag does not hide credential rotation");
credential = oldCredential; assert.equal(getStatus().ready, false, "Restoring an old key cannot restore withdrawn evidence");
assert.equal((await invoke("dictation:testConnection")).ok, true);
assert.equal(invoke("dictation:saveEnabled", true).ok, true);
behavior = "wait";
const staleTest = invoke("dictation:testConnection");
setup = { ...setup, aiSttModel: "gpt-4o-transcribe" };
getStatus(); assert.equal(pending.signal.aborted, true, "Saved model change aborts in-flight audio verification");
pending.resolve({ status: 200, body: '{"ok":true,"text":"","stt_configuration":"late"}' });
assert.equal((await staleTest).ok, false); assert.equal(verifications.has("desktop_stt"), false);
setup = { ...setup, aiSttModel: "whisper-1" }; behavior = "success";
assert.equal((await invoke("dictation:testConnection")).ok, true);
assert.equal(getStatus().enabled, false, "New evidence cannot reactivate an old opt-in, even for the same model");
assert.equal(invoke("dictation:saveEnabled", true).ok, true);
assert.ok(!JSON.stringify(getStatus()).includes(setup.syncSecret));
const valid = input(); gates.length = 0;
assert.equal((await invoke("dictation:transcribe", valid)).text, "Düzenlenebilir metin");
assert.deepEqual(gates.slice(0, 3), ["unlocked", "service.ai", "setup"]);
for (const deny of ["lock", "capability", "model", "disabled", "key", "provider", "provider-url"]) {
  const previous = { ...setup }, count = uploadCount;
  if (deny === "lock") locked = true;
  if (deny === "capability") ai = false;
  if (deny === "model") setup.aiSttModel = "";
  if (deny === "disabled") setup.aiEnabled = false;
  if (deny === "key") setup.aiApiKeyConfigured = false;
  if (deny === "http") setup.webModuleUrl = "http://hosting.example";
  if (deny === "userinfo") setup.webModuleUrl = "https://user:pass@hosting.example";
  if (deny === "query") setup.webModuleUrl = "https://hosting.example?secret=query";
  if (deny === "no-secret") setup.syncSecret = "";
  if (deny === "provider") setup.aiService = "custom";
  if (deny === "provider-url") setup.aiBaseUrl = "https://proxy.example/v1";
  if (deny === "web-off") setup.autoSyncEnabled = false;
  if (deny === "unpublished") setup.aiLastPublishedAt = "";
  assert.equal(getStatus().available, false, deny);
  const result = await invoke("dictation:transcribe", valid);
  assert.equal(result.ok, false, deny); assert.equal(uploadCount, count, deny);
  assert.ok(!JSON.stringify(result).includes("raw-secret"));
  locked = false; ai = true; setup = previous;
  if (!getStatus().ready) {
    assert.equal((await invoke("dictation:testConnection")).ok, true);
    assert.equal(invoke("dictation:saveEnabled", true).ok, true);
  }
}
for (const patch of [{ audioBase64: "" }, { audioBase64: "____" }, { audioBase64: "AAAA====" }, { audioBase64: "AQ==", mimeType: "audio/webm" }, { mimeType: "image/png" }, { mimeType: "audio/webm;codecs=opus" }, { id: "short" }, { audioBase64: "a".repeat(4 * Math.ceil((5 * 1024 * 1024 + 5) / 3)) }]) {
  const count = uploadCount; assert.equal((await invoke("dictation:transcribe", input(patch))).ok, false); assert.equal(uploadCount, count);
}
const boundary = Buffer.alloc(5 * 1024 * 1024); audio.copy(boundary);
assert.equal((await invoke("dictation:transcribe", input({ audioBase64: boundary.toString("base64") }))).ok, true);
const tooBig = Buffer.concat([boundary, Buffer.from([1])]);
assert.equal((await invoke("dictation:transcribe", input({ audioBase64: tooBig.toString("base64") }))).ok, false);
for (const mode of ["throw", "error", "bad-json", "oversize", "long", "wrong-shape"]) {
  behavior = mode;
  const result = await invoke("dictation:transcribe", input());
  assert.equal(result.ok, false, mode); assert.ok(!JSON.stringify(result).includes("raw-provider")); assert.ok(!JSON.stringify(result).includes(setup.syncSecret));
}
behavior = "wait";
let waitingInput = input(), waiting = invoke("dictation:transcribe", waitingInput);
assert.equal(invoke("dictation:cancel", waitingInput.id, otherSender), true);
assert.equal(pending.signal.aborted, false, "Sender cannot cancel another sender's job");
invoke("dictation:cancel", waitingInput.id);
assert.equal(pending.signal.aborted, true);
pending.resolve({ status: 200, body: '{"ok":true,"text":"late"}' });
assert.equal((await waiting).ok, false);
waiting = invoke("dictation:transcribe", input());
triggerDeadline(70000); assert.equal(pending.signal.aborted, true, "Total HTTP deadline aborts");
pending.resolve({ status: 200, body: '{"ok":true,"text":"late"}' });
assert.equal((await waiting).ok, false);
const cancelledBeforeStart = input(), countBeforeCancel = uploadCount;
invoke("dictation:cancel", cancelledBeforeStart.id);
assert.equal((await invoke("dictation:transcribe", cancelledBeforeStart)).ok, false);
assert.equal(uploadCount, countBeforeCancel);
waitingInput = input(); waiting = invoke("dictation:transcribe", waitingInput);
service.invalidate(); // Settings Save / lock hook, including OFF→ON between polls.
assert.equal(pending.signal.aborted, true);
pending.resolve({ status: 200, body: '{"ok":true,"text":"late"}' });
assert.equal((await waiting).ok, false);
assert.equal((await invoke("dictation:transcribe", waitingInput)).ok, false);
waiting = invoke("dictation:transcribe", input());
locked = true;
pending.resolve({ status: 200, body: '{"ok":true,"text":"late"}' });
assert.equal((await waiting).ok, false); locked = false;
waiting = invoke("dictation:transcribe", input());
sender.emit("destroyed"); assert.equal(pending.signal.aborted, true);
pending.resolve({ status: 200, body: '{"ok":true,"text":"late"}' });
assert.equal((await waiting).ok, false);

// All supported providers use saved private STT, independently of every Web setting.
const previousProvider = { ...setup };
for (const [provider, baseUrl, model] of [
  ["openai", "https://api.openai.com/v1", "gpt-4o-mini-transcribe"],
  ["gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-3.6-flash"],
  ["cloudflare", `https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/ai`, "@cf/openai/whisper-large-v3-turbo"]
]) {
  setup = { ...setup, aiService: provider, aiBaseUrl: baseUrl, aiSttModel: model,
    webModuleUrl: "", syncSecret: "", autoSyncEnabled: false, aiLastPublishedAt: "" };
  behavior = "success";
  assert.equal(getStatus().canTest, true); assert.equal(getStatus().ready, false);
  assert.equal((await invoke("dictation:testConnection")).ok, true);
  assert.equal(invoke("dictation:saveEnabled", true).ok, true);
  assert.equal((await invoke("dictation:transcribe", input())).ok, true);
  const stableRevision = getStatus().revision, stableEvidence = verifications.get("desktop_stt");
  for (const patch of [{ aiModel: "unrelated-chat" }, { aiImageModel: "unrelated-image" }, { autoSyncEnabled: true },
    { webModuleUrl: "http://unused.example", syncSecret: "unused" }, { aiLastPublishedAt: "unrelated" }]) {
    setup = { ...setup, ...patch };
    assert.equal(getStatus().ready, true); assert.equal(getStatus().revision, stableRevision);
    assert.equal(verifications.get("desktop_stt"), stableEvidence);
    assert.equal((await invoke("dictation:transcribe", input())).ok, true);
  }
  for (const mode of ["status:302", "status:401", "status:403", "status:404", "status:429", "status:503", "error", "bad-json", "wrong-shape", "oversize", "long"]) {
    behavior = mode;
    const failed = await invoke("dictation:transcribe", input());
    assert.equal(failed.ok, false, `${provider} ${mode}`);
    assert.equal(JSON.stringify(failed).includes("raw-provider"), false);
    assert.equal(getStatus().enabled, true, "Runtime failure preserves saved activation");
  }
  for (const mode of ["secret", "invalid"]) {
    behavior = mode;
    const cleaned = await invoke("dictation:transcribe", input());
    assert.equal(cleaned.ok, true); assert.equal(cleaned.text.includes(credential), false);
    assert.doesNotMatch(cleaned.text, /[<>\u0000]/);
  }
  behavior = "error";
  assert.equal((await invoke("dictation:testConnection")).ok, false);
  assert.equal(getStatus().ready, false, "Failed explicit audio test withdraws evidence");
}
setup = previousProvider; behavior = "success";

// Actual native HTTPS transport with fake streams: request format, allowlist, response bounds.
const signal = new AbortController().signal;
const config = { provider: "openai_compatible", service: "openai", model: "whisper-1", baseUrl: "https://api.openai.com/v1", apiKey: credential, timeoutSeconds: 30 };
const successResponse = service => JSON.stringify(service === "gemini"
  ? { candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "private-thought" }, { text: "Test metni" }] } }] }
  : service === "cloudflare" ? { success: true, errors: [], result: { text: "Test metni" } } : { text: "Test metni" });
for (const [provider, root, model] of [["openai", config.baseUrl, "whisper-1"], ["gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-3.6-flash"],
  ["cloudflare", `https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/ai`, "@cf/openai/whisper-large-v3-turbo"]]) {
  const providerConfig = { ...config, service: provider, baseUrl: root, model };
  transport.responses.push({ status: 200, body: successResponse(provider) });
  assert.equal((await transcribeDesktopStt(providerConfig, "audio/webm", audio, signal)).text, "Test metni");
  const sent = transport.calls.at(-1);
  assert.equal(sent.options.method, "POST"); assert.equal(sent.options.rejectUnauthorized, true);
  assert.deepEqual(plain(sent.options.agent.options.proxyEnv), {});
  assert.equal(sent.options.headers["Content-Length"], sent.body.length);
  assert.equal(sent.url.search, ""); assert.equal(sent.url.username, "");
  assert.equal(sent.options.headers["X-YA-Sync-Secret"], undefined);
  if (provider === "openai") {
    assert.equal(sent.url.href, "https://api.openai.com/v1/audio/transcriptions");
    assert.match(sent.body.toString("latin1"), /name="file"; filename="audio-[a-f0-9]+\.webm"/);
    assert.match(sent.body.toString("latin1"), /name="model"\r\n\r\nwhisper-1/);
    assert.match(sent.body.toString("latin1"), /name="response_format"\r\n\r\njson/);
  } else {
    const json = JSON.parse(sent.body);
    if (provider === "gemini") {
      assert.equal(sent.url.href, `${root}/models/${model}:generateContent`);
      assert.equal(json.generationConfig.temperature, 0); assert.equal(json.generationConfig.thinkingConfig.thinkingBudget, 0);
      assert.match(json.systemInstruction.parts[0].text, /Transcribe only/);
      assert.equal(json.contents[0].parts[0].inline_data.data, audio.toString("base64"));
    } else {
      assert.equal(sent.url.href, `${root}/run/${model}`);
      assert.equal(json.audio, audio.toString("base64")); assert.equal(json.task, "transcribe"); assert.equal(json.language, "tr");
    }
  }
  for (const body of [Buffer.from([0xff, 0xfe]), JSON.stringify({ text: "\ud800", success: true, result: { text: "\ud800" } }),
    JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "truncated" }] } }] }),
    JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ functionCall: { name: "unsafe" }, text: "tool" }] } }] }),
    "a".repeat(128 * 1024 + 1), '{"text":null}', '{"success":false,"errors":[{"message":"raw-secret"}]}']) {
    transport.responses.push({ status: 200, body });
    assert.equal((await transcribeDesktopStt(providerConfig, "audio/webm", audio, signal)).ok, false);
  }
  for (const baseUrl of [root.replace("https:", "http:"), root + "?key=secret", root + "#fragment", root.replace("https://", "https://user:pass@"), root.replace(".com/", ".com:443/"), "https://proxy.example/v1"]) {
    const count = transport.calls.length;
    assert.equal((await transcribeDesktopStt({ ...providerConfig, baseUrl }, "audio/webm", audio, signal)).ok, false);
    assert.equal(transport.calls.length, count, "Rejected URL sends no credentials");
  }
  const controller = new AbortController(); controller.abort(); const count = transport.calls.length;
  assert.equal((await transcribeDesktopStt(providerConfig, "audio/webm", audio, controller.signal)).ok, false);
  assert.equal(transport.calls.length, count);
  const timed = transcribeDesktopStt({ ...providerConfig, timeoutSeconds: 120 }, "audio/webm", audio, signal, async () => new Promise(() => {}));
  triggerDeadline(60000); assert.equal((await timed).ok, false, "60s hard cap bounds even an uncooperative transport");
}

// Actual Settings presentation without a browser listener: only STT-relevant drafts block tests.
const presentation = {};
const presentationCode = ts.transpileModule(readFileSync("apps/desktop-app/src/components/settings/DesktopDictationSetup.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
runInContext(`(function(exports, require) { ${presentationCode}\n})`, context)(presentation, name => {
  if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (name.endsWith("/ActionButton")) return { ActionButton: "button" };
  if (name.endsWith("/ServiceSettingsCard")) return { ServiceSettingsCard: "card" };
  throw new Error(`Unexpected presentation dependency: ${name}`);
});
for (const service of ["openai", "gemini", "cloudflare"]) {
  const canonical = { aiEnabled: true, aiProvider: "openai_compatible", aiService: service, aiBaseUrl: "official-root",
    aiSttModel: "saved-stt", aiTimeoutSeconds: "30", aiApiKey: "", aiGoogleCurl: "", clearAiApiKey: false };
  const controller = { status: { ready: true, canTest: true, enabled: false, message: "ready" }, enabled: false, busy: false };
  for (const patch of [{}, { aiModel: "chat-draft" }, { aiImageModel: "image-draft" }, { webModuleUrl: "" }, { syncSecret: "" }, { autoSyncEnabled: false }]) {
    const view = presentation.DesktopDictationSetup({ controller, canonical, form: { ...canonical, ...patch }, aiCapability: true });
    assert.equal(view.props.toggleDisabled, false, `${service}: unrelated draft preserves STT readiness`);
    assert.ok(view.props.prerequisiteActions, "Explicit test remains available");
  }
  for (const patch of [{ aiSttModel: "other-stt" }, { aiService: "custom" }, { aiProvider: "other" }, { aiBaseUrl: "draft-root" },
    { aiTimeoutSeconds: "40" }, { aiApiKey: "draft-secret" }, { clearAiApiKey: true }, { aiEnabled: false }]) {
    const view = presentation.DesktopDictationSetup({ controller, canonical, form: { ...canonical, ...patch }, aiCapability: true });
    assert.equal(view.props.toggleDisabled, true, `${service}: STT draft cannot enable capture`);
    assert.equal(view.props.prerequisiteActions, false);
  }
}

// Actual capture coordinator, fake media device/runtime; no real microphone/network.
context.window = context; context.isSecureContext = true; context.navigator = {};
Object.assign(context, { Blob, Uint8Array, DOMException, queueMicrotask, btoa, crypto: require("node:crypto").webcrypto });
runInContext(`(${installDictationMock.toString()})()`, context);
const { createDesktopDictationSession: createSession, supportedRecordingMime } = load("apps/desktop-app/src/app/desktop-dictation-session.ts");
const media = context.__dictationMock;
const rendererStatus = { available: true, enabled: true, ready: true, canTest: true, revision: 1, message: "fixture ready" };
const rendererUploads = [], cancelledIds = [];
let rendererPending;
let rendererBehavior = "success", snapshot;
const session = createSession({
  getStatus: async () => ({ ...rendererStatus }),
  transcribe: async value => { rendererUploads.push(value); if (rendererBehavior === "wait") return new Promise(resolve => { rendererPending = resolve; }); if (rendererBehavior === "error") return { ok: false, message: "Fixture ses hatası" }; return { ok: true, text: "Önizleme", revision: value.revision }; },
  cancelRemote: async id => { cancelledIds.push(id); return true; }, onChange: value => { snapshot = value; }
});
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
assert.equal(supportedRecordingMime(), "audio/webm;codecs=opus");
media.supported = ["audio/ogg;codecs=opus"]; assert.equal(supportedRecordingMime(), "audio/ogg;codecs=opus");
media.supported = []; await session.start(); assert.match(snapshot.message, /desteklenmiyor/); assert.equal(media.requests, 0);
media.supported = ["audio/webm;codecs=opus"];
await session.start(); assert.equal(snapshot.phase, "recording"); assert.equal(rendererUploads.length, 0);
session.cancel(); await settle(); assert.equal(rendererUploads.length, 0); assert.ok(media.tracks.every(track => track.stopped));
await session.start(); session.stop(); await settle();
assert.equal(rendererUploads.length, 1); assert.equal(rendererUploads[0].mimeType, "audio/webm");
assert.equal(snapshot.phase, "review"); assert.ok(media.tracks.every(track => track.stopped));
assert.equal(snapshot.transcript, "Önizleme");
let applied = "untouched"; session.editTranscript("Düzenlenen"); assert.equal(applied, "untouched");
await session.apply(text => { applied = text; }); assert.equal(applied, "Düzenlenen"); assert.equal(snapshot.phase, "idle");
media.denied = true; await session.start(); assert.match(snapshot.message, /izni|izin/); media.denied = false;
media.failRecorder = true; await session.start(); assert.match(snapshot.message, /başlatılamadı/); assert.ok(media.tracks.every(track => track.stopped)); media.failRecorder = false;
media.delayPermission = true;
const permission = session.start(); await settle(); session.cancel(); media.resolvePermission(); await permission;
assert.ok(media.tracks.every(track => track.stopped)); media.delayPermission = false;
const count = rendererUploads.length;
media.bytes = 5 * 1024 * 1024 + 1; await session.start(); media.recordings.at(-1).emit(); await settle();
assert.match(snapshot.message, /5 MiB/); assert.equal(rendererUploads.length, count);
media.bytes = 0; await session.start(); session.stop(); await settle(); assert.match(snapshot.message, /boş/); assert.equal(rendererUploads.length, count);
media.bytes = 20; rendererBehavior = "wait";
await session.start(); const countAtDeadline = rendererUploads.length;
triggerDeadline(120000); await settle();
assert.match(snapshot.message, /süresi doldu/); assert.equal(rendererUploads.length, countAtDeadline);
assert.ok(media.tracks.every(track => track.stopped));
await session.start(); session.stop(); await settle(); const stale = rendererPending; session.cancel();
rendererBehavior = "success"; await session.start(); stale({ ok: true, text: "late result", revision: 1 }); await settle();
assert.equal(snapshot.phase, "recording", "Late result cannot replace new capture"); session.cancel();
rendererBehavior = "error"; await session.start(); session.stop(); await settle(); assert.match(snapshot.message, /Fixture ses hatası/);
rendererBehavior = "success"; await session.start(); rendererStatus.revision++; session.stop(); await settle(); assert.match(snapshot.message, /ayarları/);
await session.start(); session.stop(); await settle(); rendererStatus.revision++;
await session.apply(text => { applied = text; }); assert.equal(applied, "Düzenlenen", "Changed settings block insertion");
await session.start(); session.stop(); session.cancel(); await settle();
assert.ok(media.tracks.every(track => track.stopped)); assert.ok(cancelledIds.length > 0);
rendererStatus.available = false; const requests = media.requests; await session.start(); assert.equal(media.requests, requests);
assert.deepEqual(plain(session.getSnapshot()).phase, "idle");

// Actual Electron session permission configuration, with platform callbacks mocked.
let checkPermission, requestPermission, cameraLogs = 0, captureAllowed = false;
const runtimeExports = {};
const runtimeCode = ts.transpileModule(readFileSync("apps/desktop-app/electron/desktop-runtime.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
runInContext(`(function(exports, require) { ${runtimeCode}\n})`, context)(runtimeExports, name => {
  if (name === "electron") return { session: { fromPartition: () => ({ setUserAgent() {} }), defaultSession: {
    setPermissionCheckHandler: handler => { checkPermission = handler; },
    setPermissionRequestHandler: handler => { requestPermission = handler; }
  } }, systemPreferences: { getMediaAccessStatus: () => "granted" } };
  if (name === "./desktop-context-menu") return { installDesktopContextMenu() {} };
  if (name === "./desktop-logger") return { desktopLog: { info() { cameraLogs++; }, warn() { cameraLogs++; } } };
  return require(name);
});
context.process.platform = "linux"; context.process.versions = { chrome: "144.0" };
runtimeExports.configureDesktopSessionRuntime({ whatsappPartition: "fixture-w", kbsPartition: "fixture-k",
  isTrustedRendererUrl: url => url === "file:///trusted", canCaptureAudio: () => captureAllowed });
const trusted = { getType: () => "window", getURL: () => "file:///trusted" };
const untrusted = { getType: () => "window", getURL: () => "https://untrusted.example" };
function requestMedia(contents, types) { let granted; requestPermission(contents, "media", value => { granted = value; }, { mediaTypes: types }); return granted; }
assert.equal(checkPermission(trusted, "media", "", { mediaType: "audio" }), false);
assert.equal(requestMedia(trusted, ["audio"]), false);
captureAllowed = true;
assert.equal(checkPermission(trusted, "media", "", { mediaType: "audio" }), true);
assert.equal(requestMedia(trusted, ["audio"]), true);
assert.equal(requestMedia(trusted, ["audio", "video"]), false);
assert.equal(requestMedia(untrusted, ["audio"]), false);
assert.equal(checkPermission(untrusted, "media", "", { mediaType: "audio" }), false);
assert.equal(cameraLogs, 0, "Microphone permissions must not be logged");
assert.equal(checkPermission(trusted, "media", "", { mediaType: "video" }), true);
assert.equal(requestMedia(trusted, ["video"]), true);
assert.equal(requestMedia(trusted, []), true, "Existing omitted camera mediaTypes behavior is preserved");
captureAllowed = false; assert.equal(requestMedia(trusted, ["audio"]), false);
console.log("voice-stt-desktop-smoke-ok: direct OpenAI/Gemini/Cloudflare, Web OFF, saved STT gates/evidence, draft UI, HTTPS/bounds/sanitization/abort/timeout, capture/preview/stale insertion");
