import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import http from "node:http";
import { createRequire } from "node:module";
import { activateFixtureSource, publicationEnvelope } from "./test-helpers/publication-protocol.mjs";

const require = createRequire(import.meta.url);
const core = require("@yardimci-asistan/sync-core");
const root = mkdtempSync(join(tmpdir(), "voice-stt-hosting-"));
const hosting = join(root, "web"), uploads = join(root, "uploads");
const secret = "voice-hosting-fixture-sync-secret", key = "voice-hosting-fixture-provider-key";
const transcript = "VOICE_PRIVATE_TRANSCRIPT_SENTINEL Türkçe metin.";
let server;
let serverOutput = "";
const listener = http.createServer();
try {
  cpSync(resolve("firm-template/web-module"), hosting, { recursive: true, filter: path => basename(path) !== "data" && !basename(path).endsWith(".local.php") });
  mkdirSync(uploads);
  writeFileSync(join(hosting, "config/business.json"), JSON.stringify({ sync_secret: secret, allowed_origins: [] }));
  // Only the provider transport is mocked in the isolated copy. HTTP upload, finfo,
  // authorization, config loader, cleanup and durable publication all run unchanged.
  const endpointPath = join(hosting, "api/audio-transcribe.php");
  const endpoint = readFileSync(endpointPath, "utf8");
  const call = "ya_stt_transcribe(is_array($config) ? $config : [], $upload['tmp_name'], null, $expectedConfiguration)";
  assert.equal(endpoint.split(call).length, 2);
  writeFileSync(endpointPath, endpoint.replace(call, "ya_stt_transcribe(is_array($config) ? $config : [], $upload['tmp_name'], require __DIR__ . '/../stt-provider-fixture.php', $expectedConfiguration)"));
  writeFileSync(join(hosting, "stt-provider-fixture.php"), `<?php
return static function (string $url, array $options): array {
    $count = __DIR__ . '/provider-call-count';
    file_put_contents($count, (string) ((int) @file_get_contents($count) + 1));
    $mode = $_SERVER['HTTP_X_FIXTURE_RESPONSE'] ?? 'success';
    if ($mode === 'timeout') return ['status' => 0, 'error' => CURLE_OPERATION_TIMEDOUT, 'body' => ''];
    if ($mode === 'error') return ['status' => 401, 'error' => 0, 'body' => json_encode(['error' => ['message' => '${key}']])];
    if ($mode === 'oversize') return ['status' => 200, 'error' => 0, 'body' => str_repeat('x', YA_STT_MAX_RESPONSE_BYTES + 1)];
    if ($mode === 'malformed') return ['status' => 200, 'error' => 0, 'body' => '{bad ${key}'];
    if (str_contains($url, 'api.cloudflare.com')) {
        if ($mode === 'quota') return ['status' => 429, 'error' => 0, 'body' => json_encode(['success' => false, 'errors' => [['code' => 3036, 'message' => '${key}']]])];
        return ['status' => 200, 'error' => 0, 'body' => json_encode(['success' => true, 'result' => ['text' => '${transcript}']])];
    }
    $text = $mode === 'leak' ? '${key}' : '${transcript}';
    $body = str_contains($url, ':generateContent')
        ? ['candidates' => [['finishReason' => 'STOP', 'content' => ['parts' => [['text' => $text]]]]]]
        : ['text' => $text, 'api_key' => '${key}'];
    return ['status' => 200, 'error' => 0, 'body' => json_encode($body)];
};
`);
  await new Promise((done, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", done); });
  const port = listener.address().port;
  await new Promise(done => listener.close(done));
  const baseUrl = `http://127.0.0.1:${port}`;
  server = spawn("php", ["-d", `upload_tmp_dir=${uploads}`, "-d", "upload_max_filesize=6M", "-d", "post_max_size=7M", "-S", `127.0.0.1:${port}`, "-t", hosting], { stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", chunk => { serverOutput += chunk; });
  server.stderr.on("data", chunk => { serverOutput += chunk; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${baseUrl}/api/menu.php`)).ok) { ready = true; break; } } catch { /* startup */ }
    await new Promise(done => setTimeout(done, 30));
  }
  assert.equal(ready, true, "PHP fixture started");
  const clientId = "voice-hosting-desktop";
  await activateFixtureSource(baseUrl, secret, clientId);
  const post = body => fetch(`${baseUrl}/api/sync.php`, { method: "POST", headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": secret }, body: JSON.stringify(body) });
  const publishCaps = async (enabled, patch = {}) => {
    const result = await post(publicationEnvelope({ action: "publish_android_snapshot", client_id: clientId, snapshot: {
      business: {}, business_capabilities: enabled ? ["service.ai"] : [], menu: { categories: [], items: [] },
      requests: [], reservations: [], rooms: [], tables: [], customers: [], dailyTasks: [], financeEntries: [], androidPermissions: {}, updatedAt: new Date().toISOString(), ...patch
    } }, clientId));
    assert.equal(result.status, 200, await result.text());
  };
  await publishCaps(true);
  let revision = 0;
  const settings = { enabled: true, provider: "openai_compatible", service: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1",
    sttModel: "gpt-4o-mini-transcribe", apiKey: key, timeoutSeconds: 30 };
  const publish = patch => core.pushAiSettings({ baseUrl, syncSecret: secret, clientId, sourceEpoch: 1, sourceRevision: ++revision,
    idempotencyKey: `voice-ai-${revision}`, aiSettings: { ...settings, ...patch } });
  const wave = (size = 1644) => {
    const audio = Buffer.alloc(size);
    audio.write("RIFF", 0); audio.writeUInt32LE(size - 8, 4); audio.write("WAVEfmt ", 8);
    audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
    audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
    audio.write("data", 36); audio.writeUInt32LE(size - 44, 40);
    return audio;
  };
  const request = async ({ method = "POST", auth = secret, source = "desktop", audio = wave(), type = "audio/wav", filename = "recording.wav", extra = {}, headers = {}, query = "" } = {}) => {
    const form = new FormData(); form.set("source", source);
    if (audio !== null) form.set("audio", new Blob([audio], { type }), filename);
    for (const [name, value] of Object.entries(extra)) form.set(name, value);
    const response = await fetch(`${baseUrl}/api/audio-transcribe.php${query}`, { method,
      headers: { ...(auth === null ? {} : { "X-YA-Sync-Secret": auth }), ...headers }, ...(method === "GET" || method === "HEAD" ? {} : { body: form }) });
    const body = await response.json();
    assert.equal(JSON.stringify(body).includes(key), false, "provider credential never returned");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(readdirSync(uploads), [], "all HTTP upload temps cleaned on every path");
    return { response, body };
  };
  assert.equal((await request({ method: "GET" })).response.status, 405);
  assert.equal((await request({ method: "OPTIONS" })).response.status, 405);
  assert.equal((await request({ auth: null })).response.status, 401);
  assert.equal((await request({ auth: "wrong" })).response.status, 401);
  assert.equal((await request({ source: "android", headers: { "X-YA-Device-Token": `yat_${"a".repeat(64)}`, "X-YA-Device-Id": "android-fixture" } })).response.status, 401);
  assert.equal((await request({ headers: { "X-YA-Device-Id": "android-fixture" } })).response.status, 403);
  await publishCaps(false);
  assert.equal((await request()).body.code, "ai_capability_disabled");
  await publishCaps(true);
  // Host defaults stay disabled; there is no chat model fallback.
  assert.equal((await request()).body.code, "ai_disabled");
  assert.equal((await publish({ sttModel: "" })).ok, true);
  assert.equal((await request()).body.code, "stt_not_configured");
  const applied = await publish({});
  assert.equal(applied.ok, true, applied.message);
  assert.equal(applied.stt_model, settings.sttModel);
  const binding = createHash("sha256").update(JSON.stringify([settings.provider, settings.service, settings.baseUrl,
    settings.sttModel, settings.apiKey, settings.timeoutSeconds])).digest("hex");
  const verified = await request({ headers: { "X-YA-STT-Configuration": binding } });
  assert.equal(verified.response.status, 200); assert.equal(verified.body.stt_configuration, binding);
  const callsBeforeMismatch = readFileSync(join(hosting, "provider-call-count"), "utf8");
  assert.equal((await request({ headers: { "X-YA-STT-Configuration": "a".repeat(64) } })).response.status, 409);
  assert.equal(readFileSync(join(hosting, "provider-call-count"), "utf8"), callsBeforeMismatch, "stale audio test never calls provider");
  const deviceId = "android-voice-fixture";
  const issueToken = () => {
    const issued = spawnSync("php", ["-r", "require $argv[1]; echo ya_android_auth_issue_token($argv[2]);",
      join(hosting, "lib/android-device-auth.php"), deviceId], { encoding: "utf8" });
    assert.equal(issued.status, 0, "fixture token issued without error");
    assert.equal(issued.stderr, "");
    assert.ok(/^yat_[a-f0-9]{64}$/.test(issued.stdout));
    return issued.stdout;
  };
  let token = issueToken();
  const androidSnapshot = (permissions = ["voice.dictation"], active = true, caps = ["service.android", "service.ai"]) => ({
    business_capabilities: caps, voice: { stt_available: true, api_key: key, model_secret: key },
    androidPermissions: { [deviceId]: { role: "staff", is_active: active, permissions } }
  });
  const androidRequest = (patch = {}) => request({ auth: null, source: "android", extra: { device_id: deviceId },
    headers: { "X-YA-Device-Id": deviceId, "X-YA-Device-Token": token }, ...patch });
  await publishCaps(true, androidSnapshot());
  assert.deepEqual((await androidRequest()).body, { ok: true, text: transcript });
  // MPEG_4/AAC MediaRecorder's ISO-BMFF container is content-detected as MP4/M4A.
  const mp4 = Buffer.from("00000018667479706d703432000000006d70343269736f6d000000086d646174", "hex");
  assert.equal((await androidRequest({ audio: mp4, type: "text/plain", filename: "ignored.aac" })).response.status, 200);
  const summary = async (personal = true) => {
    const response = await fetch(`${baseUrl}/api/${personal ? "android" : "sync"}.php`, { method: "POST",
      headers: { "Content-Type": "application/json", ...(personal ? { "X-YA-Device-Id": deviceId, "X-YA-Device-Token": token } : { "X-YA-Sync-Secret": secret }) },
      body: JSON.stringify({ action: "android_summary", device_id: deviceId }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(JSON.stringify(body).includes(key) || JSON.stringify(body).includes(token), false);
    return body;
  };
  assert.deepEqual((await summary()).voice, { stt_available: true });
  assert.deepEqual((await summary(false)).voice, { stt_available: false });
  const callsBeforeDenials = readFileSync(join(hosting, "provider-call-count"), "utf8");
  assert.equal((await androidRequest({ headers: { "X-YA-Device-Id": deviceId, "X-YA-Sync-Secret": secret } })).response.status, 401);
  assert.equal((await androidRequest({ headers: { "X-YA-Device-Token": token } })).response.status, 401);
  assert.equal((await androidRequest({ headers: { "X-YA-Device-Id": "different-device", "X-YA-Device-Token": token } })).response.status, 401);
  assert.equal((await androidRequest({ extra: { device_id: "different-device" } })).body.code, "device_identity_mismatch");
  assert.equal((await androidRequest({ extra: { device_id: deviceId, model: "whisper-1" } })).response.status, 422);
  assert.equal((await androidRequest({ query: "?secret=ignored" })).response.status, 422);
  assert.equal((await androidRequest({ audio: wave(5 * 1024 * 1024 + 1) })).response.status, 413);
  assert.equal((await androidRequest({ audio: Buffer.from("fake AAC"), type: "audio/mp4" })).response.status, 415);
  await publishCaps(true, androidSnapshot(["customer.view", "settings.edit"]));
  assert.equal((await androidRequest()).body.code, "voice_dictation_denied");
  assert.deepEqual((await summary()).voice, { stt_available: false });
  await publishCaps(true, androidSnapshot(["voice.dictation"], false));
  assert.equal((await androidRequest()).body.code, "device_approval_required");
  assert.deepEqual((await summary()).voice, { stt_available: false });
  await publishCaps(true, { ...androidSnapshot(), androidPermissions: {} });
  assert.equal((await androidRequest()).body.code, "device_approval_required");
  for (const caps of [["service.ai"], ["service.android"]]) {
    await publishCaps(true, androidSnapshot(["voice.dictation"], true, caps));
    assert.equal((await androidRequest()).response.status, 403);
  }
  await publishCaps(true, androidSnapshot());
  assert.equal((await publish({ sttModel: "" })).ok, true);
  assert.equal((await androidRequest()).body.code, "stt_not_configured");
  assert.equal((await publish({ enabled: false })).ok, true);
  assert.equal((await androidRequest()).body.code, "ai_disabled");
  assert.equal(readFileSync(join(hosting, "provider-call-count"), "utf8"), callsBeforeDenials, "all device/input/config denials stop before provider");
  assert.equal((await publish({})).ok, true);
  const revoked = spawnSync("php", ["-r", "require $argv[1]; ya_android_auth_revoke_token($argv[2]);",
    join(hosting, "lib/android-device-auth.php"), deviceId], { encoding: "utf8" });
  assert.equal(revoked.status, 0); assert.equal(revoked.stdout + revoked.stderr, "");
  assert.equal((await androidRequest()).response.status, 401);
  assert.equal((await androidRequest({ auth: secret, headers: { "X-YA-Device-Id": deviceId } })).response.status, 401, "revoked token cannot fall back to shared secret");
  const oldToken = token; token = issueToken();
  assert.equal((await androidRequest({ headers: { "X-YA-Device-Id": deviceId, "X-YA-Device-Token": oldToken } })).response.status, 401);
  assert.equal((await androidRequest()).response.status, 200);
  assert.equal(serverOutput.includes(token) || serverOutput.includes(oldToken), false, "no device credentials logged");
  writeFileSync(join(hosting, "config/ai.local.php"), "<?php return ['stt_model' => '', 'enabled' => false];");
  assert.deepEqual((await request({ type: "text/plain", filename: "../private-key.txt" })).body, { ok: true, text: transcript }, "published config overrides host-local defaults; detected MIME and safe filename");
  assert.equal((await request({ audio: null })).body.code, "invalid_audio");
  assert.equal((await request({ audio: Buffer.from("not an audio file"), type: "audio/wav" })).response.status, 415);
  assert.equal((await request({ audio: Buffer.alloc(0) })).response.status, 422);
  assert.equal((await request({ audio: wave(5 * 1024 * 1024 + 1) })).response.status, 413);
  assert.equal((await request({ audio: wave(5 * 1024 * 1024) })).response.status, 200, "exact 5 MiB boundary");
  assert.equal((await request({ extra: { model: "whisper-1" } })).response.status, 422);
  assert.equal((await request({ query: "?transcript=private" })).response.status, 422);
  for (const mode of ["error", "malformed", "oversize"]) assert.equal((await request({ headers: { "X-Fixture-Response": mode } })).response.status, 502);
  assert.equal((await request({ headers: { "X-Fixture-Response": "timeout" } })).response.status, 504);
  assert.equal((await request({ headers: { "X-Fixture-Response": "leak" } })).body.text, "[gizlendi]");
  for (const patch of [{ sttModel: "gpt-4o" }, { sttModel: "gemini-3.5-transcribe" }, { sttModel: ["whisper-1"] },
    { service: "custom" }, { service: "groq" }, { baseUrl: "http://127.0.0.1/v1" }, { baseUrl: "https://api.openai.com/v1?private" }]) {
    const invalid = await publish(patch);
    assert.equal(invalid.ok, false); assert.equal(invalid.status, 422);
    assert.deepEqual((await request()).body, { ok: true, text: transcript }, "rejected publication cannot replace configuration");
  }
  assert.equal((await publish({ service: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", sttModel: "gemini-2.5-flash" })).ok, true);
  assert.deepEqual((await request()).body, { ok: true, text: transcript });
  assert.equal((await publish({ enabled: false })).ok, true);
  assert.equal((await request()).body.code, "ai_disabled");
  const cfSettings = { service: "cloudflare", baseUrl: `https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/ai`,
    model: "@cf/zai-org/glm-4.7-flash", visionModel: "@cf/meta/llama-4-scout-17b-16e-instruct", sttModel: "@cf/openai/whisper-large-v3-turbo" };
  assert.equal((await publish(cfSettings)).ok, true, "Cloudflare uses canonical private publication");
  assert.deepEqual((await request()).body, { ok: true, text: transcript });
  assert.deepEqual((await androidRequest()).body, { ok: true, text: transcript }, "existing phone authorization remains unchanged");
  const cfBinding = createHash("sha256").update(JSON.stringify([settings.provider, cfSettings.service, cfSettings.baseUrl,
    cfSettings.sttModel, key, settings.timeoutSeconds])).digest("hex");
  assert.equal((await request({ headers: { "X-YA-STT-Configuration": cfBinding } })).body.stt_configuration, cfBinding);
  assert.equal((await request({ headers: { "X-YA-STT-Configuration": binding } })).response.status, 409, "old OpenAI binding cannot verify Cloudflare");
  assert.equal((await request({ headers: { "X-Fixture-Response": "quota" } })).body.code, "provider_quota_exhausted");
  assert.equal((await publish({ ...cfSettings, baseUrl: cfSettings.baseUrl + "?evil" })).ok, false);
  const inspect = spawnSync("php", ["-r", `require $argv[1]; $db = ya_storage_open(); echo json_encode([
    $db->query('SELECT name, payload_json FROM publications')->fetchAll(),
    $db->query('SELECT * FROM publication_receipts')->fetchAll()
  ]);`, join(hosting, "lib/storage.php")], { encoding: "utf8" });
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.equal(inspect.stdout.includes(key), false, "secrets absent from public projections/receipts");
  assert.equal(inspect.stdout.includes(transcript), false);
  for (const name of readdirSync(join(hosting, "data"))) {
    const bytes = readFileSync(join(hosting, "data", name));
    assert.equal(bytes.includes(Buffer.from("VOICE_PRIVATE_TRANSCRIPT_SENTINEL")), false, "no persistent transcript");
  }
  assert.equal(serverOutput.includes(key) || serverOutput.includes(transcript) || serverOutput.includes(secret), false, "no credential/transcript logs");
  console.log("voice-stt-hosting-smoke-ok: Desktop + personal Android HTTP upload, approval/permission/config gates, MP4 finfo, cleanup and mocked adapters");
} finally {
  if (listener.listening) await new Promise(done => listener.close(done));
  if (server && server.exitCode === null) { const exited = new Promise(done => server.once("exit", done)); server.kill(); await exited; }
  rmSync(root, { recursive: true, force: true });
}
