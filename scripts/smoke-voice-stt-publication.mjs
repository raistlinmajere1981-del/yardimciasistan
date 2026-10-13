import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { publicationEnvelope } from "./test-helpers/publication-protocol.mjs";

const require = createRequire(import.meta.url);
const core = require("@yardimci-asistan/sync-core");
const root = mkdtempSync(join(tmpdir(), "voice-publication-"));
const hosting = join(root, "web");
const secret = "voice-publication-fixture-secret", key = "voice-publication-fixture-provider-key";
const runEndpoint = (file, payload, server = {}, files = {}) => {
  const inputFile = join(root, "request.json");
  writeFileSync(inputFile, JSON.stringify({ payload, files, server: { REQUEST_METHOD: "POST", HTTP_X_YA_SYNC_SECRET: secret, ...server } }), { mode: 0o600 });
  const result = spawnSync("php", ["-r", `
    $input = json_decode(file_get_contents($argv[2]), true, 32, JSON_THROW_ON_ERROR);
    $_POST = $input['payload']; $_FILES = $input['files']; $_GET = [];
    $_SERVER = $input['server'];
    register_shutdown_function(static function (): void { echo "\nSTATUS:" . (http_response_code() ?: 200); });
    require $argv[1];`, join(hosting, `api/${file}.php`), inputFile], {
    encoding: "utf8", timeout: 10000
  });
  assert.equal(result.status, 0, `PHP endpoint completed without fatal error (${result.error?.code ?? result.status})`);
  const status = Number(result.stdout.match(/\nSTATUS:(\d+)$/)?.[1]);
  assert.ok(status >= 200 && status <= 599, `endpoint status captured: ${result.stderr.replaceAll(key, '[redacted]').replaceAll(secret, '[redacted]')}`);
  assert.equal(result.stderr, "", "no PHP errors/credentials logged");
  return { status, body: JSON.parse(result.stdout.replace(/\nSTATUS:\d+$/, "")) };
};
const fetchImpl = async (_url, init) => {
  const result = runEndpoint("sync", JSON.parse(init.body));
  return new Response(JSON.stringify(result.body), { status: result.status });
};
const baseUrl = "https://voice-fixture.example.test/module", clientId = "voice-cli-desktop";
const config = { baseUrl, syncSecret: secret, fetchImpl };
let revision = 0;
const desired = { enabled: true, provider: "openai_compatible", service: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1",
  sttModel: "whisper-1", apiKey: key, timeoutSeconds: 30 };
const publish = (patch = {}, identity = {}) => core.pushAiSettings({ ...config, clientId, sourceEpoch: 1,
  sourceRevision: ++revision, idempotencyKey: `voice-cli-${revision}`, ...identity, aiSettings: { ...desired, ...patch } });
const inspect = () => {
  const result = spawnSync("php", ["-r", `require $argv[1]; $db = ya_storage_open();
    echo json_encode([ya_storage_private_config('ai_settings'),
    $db->query("SELECT * FROM publications WHERE name='ai_settings'")->fetchAll(),
    $db->query("SELECT * FROM publication_receipts WHERE publication_name='ai_settings'")->fetchAll()]);`,
  join(hosting, "lib/storage.php")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
};
try {
  cpSync(resolve("firm-template/web-module"), hosting, { recursive: true, filter: path => basename(path) !== "data" && !basename(path).endsWith(".local.php") });
  writeFileSync(join(hosting, "config/business.json"), JSON.stringify({ sync_secret: secret, allowed_origins: [] }));
  const activation = runEndpoint("sync", { action: "activate_publication_source", client_id: clientId, expected_epoch: 0, activation_key: "voice-cli-activate" });
  assert.equal(activation.status, 200, activation.body.message);
  const activated = await core.activatePublicationSource({ ...config, clientId, expectedEpoch: 0, activationKey: "voice-cli-activate" });
  assert.equal(activated.ok, true, activated.message);
  const publishCaps = enabled => {
    const result = runEndpoint("sync", publicationEnvelope({ action: "publish_android_snapshot", client_id: clientId, snapshot: {
      business: {}, business_capabilities: enabled ? ["service.ai"] : [], menu: { categories: [], items: [] },
      requests: [], reservations: [], rooms: [], tables: [], customers: [], dailyTasks: [], financeEntries: [], androidPermissions: {}, updatedAt: "2026-10-13T00:00:00Z"
    } }, clientId));
    assert.equal(result.status, 200, result.body.message);
  };
  publishCaps(true);
  const first = await publish();
  assert.equal(first.ok, true, first.message);
  assert.equal(first.stt_model, "whisper-1");
  const state = inspect();
  assert.equal(state[0].stt_model, "whisper-1");
  assert.equal(state[0].api_key, key);
  assert.equal(JSON.stringify(state.slice(1)).includes(key), false, "no secrets in public projections/receipts");
  writeFileSync(join(hosting, "config/ai.local.php"), "<?php return ['enabled' => false, 'stt_model' => '', 'api_key' => 'host-default'];");
  const loaded = spawnSync("php", ["-r", '$config = require $argv[1]; echo json_encode([$config["stt_model"], $config["api_key"] === $argv[2], $config["enabled"]]);',
    join(hosting, "config/ai.php"), key], { encoding: "utf8" });
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.deepEqual(JSON.parse(loaded.stdout), ["whisper-1", true, true], "applied private config overrides host defaults");
  const replay = await publish({}, { sourceRevision: first.source_revision, idempotencyKey: first.idempotency_key });
  assert.equal(replay.ok, true); assert.equal(replay.deduplicated, true);
  assert.equal(replay.published_at, first.published_at); assert.deepEqual(inspect(), state, "exact replay is a no-op");
  const conflict = await publish({ sttModel: "gpt-4o-transcribe" }, { sourceRevision: first.source_revision, idempotencyKey: first.idempotency_key });
  assert.equal(conflict.ok, false); assert.equal(conflict.status, 409); assert.deepEqual(inspect(), state);
  for (const patch of [{ sttModel: "gpt-4o" }, { sttModel: "gemini-3.5-transcribe" }, { sttModel: ["whisper-1"] },
    { service: "custom" }, { service: "groq" }, { baseUrl: "http://127.0.0.1/v1" }, { baseUrl: "https://api.openai.com/v1?secret" }]) {
    const rejected = await publish(patch);
    assert.equal(rejected.ok, false); assert.equal(rejected.status, 422); assert.deepEqual(inspect(), state, "rejected STT config never changes receipt/config");
  }
  const nullConfig = publicationEnvelope({ action: "publish_ai_settings", client_id: clientId, source_revision: ++revision,
    ai_settings: { enabled: true, provider: desired.provider, service: desired.service, base_url: desired.baseUrl, model: desired.model,
      api_key: key, timeout_seconds: 30, stt_model: null } }, clientId);
  assert.equal(runEndpoint("sync", nullConfig).status, 422, "explicit null is not silently disabled");
  const notUpload = join(root, "keep-user-file.wav"); writeFileSync(notUpload, "existing user data");
  const upload = { audio: { tmp_name: notUpload, error: 0, size: 18, name: "audio.wav", type: "audio/wav" } };
  const voice = (server = {}, post = { source: "desktop" }) => runEndpoint("audio-transcribe", post, server, upload);
  assert.equal(voice({ REQUEST_METHOD: "GET" }).status, 405);
  assert.equal(voice({ HTTP_X_YA_SYNC_SECRET: "wrong" }).status, 401);
  assert.equal(voice({ HTTP_X_YA_DEVICE_TOKEN: `yat_${"a".repeat(64)}` }).status, 403);
  assert.equal(voice({}, { source: "android" }).status, 401);
  publishCaps(false);
  assert.equal(voice().body.code, "ai_capability_disabled");
  publishCaps(true);
  assert.equal(voice({ CONTENT_LENGTH: 6 * 1024 * 1024 }, {}).status, 413);
  assert.equal(voice({}, { source: ["desktop"] }).status, 422);
  assert.equal(voice().body.code, "invalid_audio", "forged local temp path is never a PHP upload");
  assert.equal(existsSync(notUpload), true, "cleanup cannot delete an arbitrary existing file");
  assert.equal((await publish({ sttModel: "" })).ok, true);
  assert.equal(inspect()[0].stt_model, "");
  assert.equal((await publish({ service: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", sttModel: "gemini-2.5-flash" })).ok, true);
  assert.equal(inspect()[0].stt_model, "gemini-2.5-flash");
  const replacement = await core.activatePublicationSource({ ...config, clientId: "replacement-desktop", expectedEpoch: 1, activationKey: "replace-voice-source" });
  assert.equal(replacement.ok, true);
  assert.equal((await publish({}, { sourceRevision: first.source_revision, idempotencyKey: first.idempotency_key })).ok, false, "retired source receipt is fenced");
  console.log("voice-stt-publication-smoke-ok: real PHP/SQLite apply, config precedence, exact receipts, validation, fencing and endpoint gates (CLI, no HTTP upload claim)");
} finally { rmSync(root, { recursive: true, force: true }); }
