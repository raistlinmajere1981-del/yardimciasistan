import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
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
  const call = "ya_stt_transcribe(is_array($config) ? $config : [], $upload['tmp_name'])";
  assert.equal(endpoint.split(call).length, 2);
  writeFileSync(endpointPath, endpoint.replace(call, "ya_stt_transcribe(is_array($config) ? $config : [], $upload['tmp_name'], require __DIR__ . '/../stt-provider-fixture.php')"));
  writeFileSync(join(hosting, "stt-provider-fixture.php"), `<?php
return static function (string $url, array $options): array {
    $mode = $_SERVER['HTTP_X_FIXTURE_RESPONSE'] ?? 'success';
    if ($mode === 'timeout') return ['status' => 0, 'error' => CURLE_OPERATION_TIMEDOUT, 'body' => ''];
    if ($mode === 'error') return ['status' => 401, 'error' => 0, 'body' => json_encode(['error' => ['message' => '${key}']])];
    if ($mode === 'oversize') return ['status' => 200, 'error' => 0, 'body' => str_repeat('x', YA_STT_MAX_RESPONSE_BYTES + 1)];
    if ($mode === 'malformed') return ['status' => 200, 'error' => 0, 'body' => '{bad ${key}'];
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
  const publishCaps = async enabled => {
    const result = await post(publicationEnvelope({ action: "publish_android_snapshot", client_id: clientId, snapshot: {
      business: {}, business_capabilities: enabled ? ["service.ai"] : [], menu: { categories: [], items: [] },
      requests: [], reservations: [], rooms: [], tables: [], customers: [], dailyTasks: [], financeEntries: [], androidPermissions: {}, updatedAt: new Date().toISOString()
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
  assert.equal((await request({ source: "android", headers: { "X-YA-Device-Token": `yat_${"a".repeat(64)}`, "X-YA-Device-Id": "android-fixture" } })).response.status, 403);
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
  console.log("voice-stt-hosting-smoke-ok: genuine HTTP upload, gates, cleanup, private config, publication rejection and mocked adapters");
} finally {
  if (listener.listening) await new Promise(done => listener.close(done));
  if (server && server.exitCode === null) { const exited = new Promise(done => server.once("exit", done)); server.kill(); await exited; }
  rmSync(root, { recursive: true, force: true });
}
