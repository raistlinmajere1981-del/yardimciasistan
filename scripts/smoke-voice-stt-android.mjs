import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { publicationEnvelope } from "./test-helpers/publication-protocol.mjs";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("@yardimci-asistan/shared");
const core = require("@yardimci-asistan/sync-core");
const { createAndroidOperationsSnapshot } = require("../apps/desktop-app/dist-electron/android-operations-snapshot.js");
const { projectAndroidOperationsSnapshot } = require("../apps/desktop-app/dist-electron/android-capability-projection.js");
const { projectLocalAndroidSnapshotForDevice } = require("../apps/desktop-app/dist-electron/local-android-device-projection.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const fixture = createTemporaryDesktopDatabase("voice-android-desktop-");
const root = mkdtempSync(join(tmpdir(), "voice-android-hosting-")), hosting = join(root, "web");
const deviceId = "voice-android-staff", adminId = "voice-android-admin", source = "voice-android-desktop";
const secret = "voice-fixture-sync-secret", key = "voice-fixture-provider-key";
let raw, aiRevision = 0;

function php(code, input = {}) {
  const path = join(root, "input.json");
  writeFileSync(path, JSON.stringify(input), { mode: 0o600 });
  const result = spawnSync("php", ["-r", code, hosting, path], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, "PHP fixture completed");
  assert.equal(result.stderr, "", "PHP fixture emitted no diagnostics");
  return result.stdout;
}
function endpoint(name, payload, headers = {}) {
  return JSON.parse(php(`
    $input = json_decode(file_get_contents($argv[2]), true);
    $_POST = $input['payload']; $_GET = []; $_FILES = [];
    $_SERVER = ['REQUEST_METHOD' => 'POST', ...$input['headers']];
    ob_start(); register_shutdown_function(static function (): void {
      $body = ob_get_clean(); echo json_encode(['status' => http_response_code() ?: 200, 'body' => json_decode($body, true)]);
    });
    require $argv[1] . '/api/' . $input['name'] . '.php';`, { name, payload, headers }));
}
function audio(post, headers, file = "recording.m4a") {
  return JSON.parse(php(`
    $input = json_decode(file_get_contents($argv[2]), true);
    require $argv[1] . '/lib/audio-transcription.php';
    require $argv[1] . '/lib/android-device-auth.php';
    $calls = 0;
    $gate = ya_stt_request_gate(['REQUEST_METHOD' => 'POST', ...$input['headers']], $input['post'],
      ['sync_secret' => '${secret}'], static fn(): array => ya_android_auth_snapshot()['business_capabilities']);
    $result = $gate ?? ya_stt_transcribe(require $argv[1] . '/config/ai.php', dirname($argv[1]) . '/' . $input['file'],
      static function () use (&$calls): array { $calls++; return ['status' => 200, 'error' => 0, 'body' => json_encode(['text' => 'Düzenlenebilir metin'])]; });
    echo json_encode(['result' => $result, 'calls' => $calls]);`, { post, headers, file }));
}
const denied = (input, status, code) => {
  assert.equal(input.result.status, status); assert.equal(input.result.payload.code, code);
  assert.equal(input.calls, 0, "denial precedes provider transport");
};

try {
  cpSync(resolve("firm-template/web-module"), hosting, { recursive: true,
    filter: path => basename(path) !== "data" && !basename(path).endsWith(".local.php") });
  writeFileSync(join(hosting, "config/business.json"), JSON.stringify({ sync_secret: secret }));
  // CLI cannot supply php://input; only fixture input acquisition is replaced.
  const androidPath = join(hosting, "api/android.php");
  writeFileSync(androidPath, readFileSync(androidPath, "utf8").replace("file_get_contents('php://input') ?: ''", "json_encode($_POST)"));
  assert.equal(endpoint("sync", { action: "activate_publication_source", client_id: source, expected_epoch: 0,
    activation_key: "voice-android-activate" }, { HTTP_X_YA_SYNC_SECRET: secret }).status, 200);
  fixture.database.initialize();
  assert.equal(fixture.database.saveInitialSetup(createSmokeSetupInput({ businessName: "Voice fixture", phone: "", whatsapp: "",
    syncSecret: secret, aiSttModel: "whisper-1", servicePreferences: { android: true, whatsapp: false } })).ok, true);
  raw = new DatabaseSync(fixture.database.databasePath);
  setBusinessCapability(fixture.database.databasePath, { capability: C.AI, enabled: true });
  // Presence is sufficient for projection: no plaintext key or decrypt operation.
  raw.prepare("UPDATE ai_service_profiles SET api_key_encrypted=? WHERE service='openai'").run("fixture-encrypted-placeholder");
  for (const id of [deviceId, adminId]) {
    fixture.database.upsertAndroidDeviceSightings([{ device_id: id, device_name: "Fixture", app_version: "test",
      first_seen_at: "2026-10-13T00:00:00Z", last_seen_at: "2026-10-13T00:00:00Z" }]);
    assert.equal(fixture.database.setAndroidDeviceActive(id, true).ok, true);
  }
  assert.equal(fixture.database.setAndroidDeviceRole(adminId, "admin").ok, true);
  assert.equal(fixture.database.getAndroidPermissionSnapshot()[deviceId].permissions.includes("voice.dictation"), false);
  assert.equal(fixture.database.getAndroidPermissionSnapshot()[adminId].permissions.includes("voice.dictation"), true);
  assert.equal(fixture.database.setAndroidDevicePermissionGroups(deviceId,
    { ...core.ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS, voice_dictation: true }).ok, true);
  const snapshot = () => createAndroidOperationsSnapshot(fixture.database, fixture.database.getDashboardData());
  const current = snapshot();
  assert.deepEqual(current.voice, { stt_available: true });
  const publishSnapshot = body => {
    const result = endpoint("sync", publicationEnvelope({ action: "publish_android_snapshot", client_id: source, snapshot: body }, source),
      { HTTP_X_YA_SYNC_SECRET: secret });
    assert.equal(result.status, 200, result.body.message);
  };
  const token = php("require $argv[1] . '/lib/android-device-auth.php'; echo ya_android_auth_issue_token('voice-android-staff');");
  assert.ok(/^yat_[a-f0-9]{64}$/.test(token));
  const headers = { HTTP_X_YA_DEVICE_ID: deviceId, HTTP_X_YA_DEVICE_TOKEN: token }, post = { source: "android", device_id: deviceId };
  const parity = body => {
    publishSnapshot(body);
    const local = projectLocalAndroidSnapshotForDevice(body, deviceId);
    const remote = endpoint("android", { action: "android_summary", device_id: deviceId }, headers);
    assert.equal(remote.status, 200);
    assert.deepEqual(remote.body.voice, local.voice, "LAN/Hosting safe availability parity");
    assert.deepEqual(remote.body.androidPermissions[deviceId].permissions, local.androidPermissions[deviceId].permissions);
    assert.equal(JSON.stringify(remote.body).includes(token) || JSON.stringify(remote.body.voice).includes(key), false);
    return remote.body.voice.stt_available;
  };
  assert.equal(parity({ ...current, voice: { stt_available: true, api_key: key, secret_model: key } }), true);
  const publishAi = async patch => {
    const result = await core.pushAiSettings({ baseUrl: "https://fixture.example/module", syncSecret: secret, clientId: source,
      sourceEpoch: 1, sourceRevision: ++aiRevision, idempotencyKey: `voice-android-ai-${aiRevision}`,
      aiSettings: { enabled: true, provider: "openai_compatible", service: "openai", model: "gpt-4.1",
        sttModel: "whisper-1", baseUrl: "https://api.openai.com/v1", apiKey: key, timeoutSeconds: 30, ...patch },
      fetchImpl: async (_url, options) => {
        const result = endpoint("sync", JSON.parse(options.body), { HTTP_X_YA_SYNC_SECRET: secret });
        return new Response(JSON.stringify(result.body), { status: result.status });
      } });
    assert.equal(result.ok, true, result.message);
  };
  writeFileSync(join(root, "recording.m4a"), Buffer.from("00000018667479706d703432000000006d70343269736f6d000000086d646174", "hex"));
  denied(audio(post, headers), 422, "ai_disabled");
  await publishAi({ sttModel: "" }); denied(audio(post, headers), 422, "stt_not_configured");
  await publishAi({}); assert.equal(audio(post, headers).result.status, 200);
  denied(audio(post, { HTTP_X_YA_DEVICE_ID: deviceId, HTTP_X_YA_SYNC_SECRET: secret }), 401, "unauthorized");
  denied(audio(post, { HTTP_X_YA_DEVICE_TOKEN: token }), 401, "unauthorized");
  denied(audio(post, { ...headers, HTTP_X_YA_DEVICE_ID: adminId }), 401, "unauthorized");
  denied(audio({ ...post, device_id: adminId }, headers), 403, "device_identity_mismatch");
  denied(audio({ ...post, model: "whisper-1" }, headers), 422, "invalid_request");
  denied(audio(post, { ...headers, CONTENT_LENGTH: 6 * 1024 * 1024 }), 413, "audio_too_large");
  writeFileSync(join(root, "fake.m4a"), "not an audio file"); denied(audio(post, headers, "fake.m4a"), 415, "unsupported_audio_type");
  writeFileSync(join(root, "large.m4a"), Buffer.alloc(5 * 1024 * 1024 + 1)); denied(audio(post, headers, "large.m4a"), 413, "audio_too_large");
  for (const caps of [[C.AI], [C.ANDROID]]) {
    const projected = projectAndroidOperationsSnapshot(current, caps, "2026-10-13");
    assert.deepEqual(projected.voice, { stt_available: false }); publishSnapshot(projected);
    assert.equal(audio(post, headers).result.status, 403);
  }
  for (const profile of [{ role: "staff", is_active: false, permissions: ["voice.dictation"] },
    { role: "admin", is_active: true, permissions: ["customer.view", "settings.edit"] }]) {
    assert.equal(parity({ ...current, androidPermissions: { [deviceId]: profile } }), false);
    denied(audio(post, headers), 403, profile.is_active ? "voice_dictation_denied" : "device_approval_required");
  }
  assert.equal(parity({ ...current, androidPermissions: {} }), false); denied(audio(post, headers), 403, "device_approval_required");
  const legacy = { ...current }; delete legacy.voice; assert.equal(parity(legacy), false, "old snapshot hides microphone");
  parity(current);
  await publishAi({ enabled: false }); denied(audio(post, headers), 422, "ai_disabled"); await publishAi({});
  php("require $argv[1] . '/lib/android-device-auth.php'; ya_android_auth_revoke_token('voice-android-staff');");
  denied(audio(post, headers), 401, "unauthorized");
  assert.equal(audio({ source: "desktop" }, { HTTP_X_YA_SYNC_SECRET: secret }).result.status, 200);
  const revision = () => Number(raw.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='android_snapshot'").get().source_revision);
  let before = revision(); raw.exec("UPDATE ai_service_profiles SET stt_model='',updated_at='2026-10-13T00:01:00Z' WHERE service='openai'");
  assert.ok(revision() > before, "STT-only save atomically invalidates Android snapshot"); assert.deepEqual(snapshot().voice, { stt_available: false });
  before = revision(); raw.exec("UPDATE settings SET ai_service='gemini',updated_at='2026-10-13T00:02:00Z'");
  assert.ok(revision() > before, "provider switch invalidates saved availability");
  console.log("voice-stt-android-smoke-ok: SQLite/PHP token gates, finfo, saved projection, staff/admin defaults, LAN/Hosting parity and durable invalidation (CLI + mocked provider)");
} finally { raw?.close(); fixture.cleanup(); rmSync(root, { recursive: true, force: true }); }
