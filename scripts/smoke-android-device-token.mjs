import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const syncSecret = "android-device-token-smoke-secret-12345";
const deviceId = "android-token-smoke-device";
const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-android-token-"));
const webModuleRoot = join(tempRoot, "web-module");
cpSync(join(process.cwd(), "firm-template", "web-module"), webModuleRoot, { recursive: true });
for (const runtimeFile of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) {
  rmSync(join(webModuleRoot, "data", runtimeFile), { force: true });
}
const businessFile = join(webModuleRoot, "config", "business.json");
const business = JSON.parse(readFileSync(businessFile, "utf8"));
business.sync_secret = syncSecret;
writeFileSync(businessFile, `${JSON.stringify(business, null, 2)}\n`);

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", webModuleRoot], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

try {
  await waitForUrl(`${baseUrl}/api/menu.php`);

  const disabledPublication = await postJson(`${baseUrl}/api/sync.php`, {
    action: "publish_android_snapshot",
    client_id: "android-token-smoke-desktop",
    source_revision: 1,
    idempotency_key: "android-token-smoke-snapshot-disabled",
    snapshot: createSnapshot(false, false)
  }, {
    "X-YA-Sync-Secret": syncSecret
  });
  assert.equal(disabledPublication.status, 200);

  const disabledClaim = await claimToken();
  assert.equal(disabledClaim.status, 403, "Android capability olmadan cihaz token alamamalı.");
  assert.equal((await disabledClaim.json()).code, "android_capability_disabled");

  const inactivePublication = await postJson(`${baseUrl}/api/sync.php`, {
    action: "publish_android_snapshot",
    client_id: "android-token-smoke-desktop",
    source_revision: 2,
    idempotency_key: "android-token-smoke-snapshot-2",
    snapshot: createSnapshot(false)
  }, {
    "X-YA-Sync-Secret": syncSecret
  });
  assert.equal(inactivePublication.status, 200);

  const pendingClaim = await claimToken();
  assert.equal(pendingClaim.status, 403, "Onaysız cihaz token alamamalı.");
  assert.equal((await pendingClaim.json()).code, "device_approval_required");

  const publication = await postJson(`${baseUrl}/api/sync.php`, {
    action: "publish_android_snapshot",
    client_id: "android-token-smoke-desktop",
    source_revision: 3,
    idempotency_key: "android-token-smoke-snapshot-3",
    snapshot: createSnapshot(true)
  }, {
    "X-YA-Sync-Secret": syncSecret
  });
  assert.equal(publication.status, 200);

  const legacySummary = await postAndroid({
    action: "android_summary",
    device_id: deviceId,
    device_name: "Token Smoke Telefon",
    app_version: "0.1.1-smoke"
  }, { "X-YA-Sync-Secret": syncSecret });
  assert.equal(legacySummary.status, 200, "Token üretilmeden Android kapısı bootstrap secret kabul etmeli.");
  assert.equal((await legacySummary.json()).approval_required, false);

  const firstClaim = await claimToken();
  assert.equal(firstClaim.status, 201);
  const firstClaimBody = await firstClaim.json();
  const firstToken = String(firstClaimBody.device_token ?? "");
  assert.match(firstToken, /^yat_[a-f0-9]{64}$/);

  const database = new DatabaseSync(join(webModuleRoot, "data", "yardimci-asistan.sqlite"));
  try {
    const tokenRow = database.prepare(`
      SELECT token_hash, issued_at, last_used_at, revoked_at
      FROM android_device_tokens
      WHERE device_id = ?
    `).get(deviceId);
    assert.ok(tokenRow);
    assert.match(String(tokenRow.token_hash), /^[a-f0-9]{64}$/);
    assert.notEqual(tokenRow.token_hash, firstToken, "Hosting ham cihaz tokenını saklamamalı.");
    assert.equal(tokenRow.revoked_at, "");
  } finally {
    database.close();
  }

  const sharedSecretAfterClaim = await postAndroid({
    action: "android_summary",
    device_id: deviceId
  }, { "X-YA-Sync-Secret": syncSecret });
  assert.equal(sharedSecretAfterClaim.status, 401, "Token verilen cihaz Android kapısında ortak anahtara dönememeli.");

  const tokenSummary = await postAndroid({
    action: "android_summary",
    device_id: deviceId
  }, { "X-YA-Device-Token": firstToken });
  assert.equal(tokenSummary.status, 200);
  assert.equal((await tokenSummary.json()).approval_required, false);

  const mismatchedDevice = await postAndroid({
    action: "android_summary",
    device_id: "android-token-other-device"
  }, { "X-YA-Device-Token": firstToken });
  assert.equal(mismatchedDevice.status, 403);
  assert.equal((await mismatchedDevice.json()).code, "device_identity_mismatch");

  const forbiddenDesktopAction = await postAndroid({
    action: "pull_requests",
    device_id: deviceId,
    after_seq: 0
  }, { "X-YA-Device-Token": firstToken });
  assert.equal(forbiddenDesktopAction.status, 403);
  assert.equal((await forbiddenDesktopAction.json()).code, "android_action_scope_denied");

  const wrongToken = await postAndroid({
    action: "android_summary",
    device_id: deviceId
  }, { "X-YA-Device-Token": `yat_${"0".repeat(64)}` });
  assert.equal(wrongToken.status, 401);

  const secondClaim = await claimToken();
  assert.equal(secondClaim.status, 201, "Bootstrap anahtarı biliniyorsa işletme sahibi cihaz tokenını döndürebilmeli.");
  const secondToken = String((await secondClaim.json()).device_token ?? "");
  assert.match(secondToken, /^yat_[a-f0-9]{64}$/);
  assert.notEqual(secondToken, firstToken);

  const staleToken = await postAndroid({ action: "android_summary", device_id: deviceId }, {
    "X-YA-Device-Token": firstToken
  });
  assert.equal(staleToken.status, 401, "Token rotasyonundan sonra eski token çalışmamalı.");
  const rotatedToken = await postAndroid({ action: "android_summary", device_id: deviceId }, {
    "X-YA-Device-Token": secondToken
  });
  assert.equal(rotatedToken.status, 200);

  const deactivationPublication = await postJson(`${baseUrl}/api/sync.php`, {
    action: "publish_android_snapshot",
    client_id: "android-token-smoke-desktop",
    source_revision: 4,
    idempotency_key: "android-token-smoke-snapshot-4",
    snapshot: createSnapshot(false)
  }, { "X-YA-Sync-Secret": syncSecret });
  assert.equal(deactivationPublication.status, 200);

  const inactiveSummary = await postAndroid({ action: "android_summary", device_id: deviceId }, {
    "X-YA-Device-Token": secondToken
  });
  assert.equal(inactiveSummary.status, 200);
  const inactiveBody = await inactiveSummary.json();
  assert.equal(inactiveBody.approval_required, true);
  assert.deepEqual(inactiveBody.requests, []);
  assert.deepEqual(inactiveBody.rooms, []);
  assert.deepEqual(inactiveBody.tables, []);

  const inactiveAction = await postAndroid({
    action: "enqueue_android_action",
    action_id: "android_token_inactive_action_0001",
    action_type: "room_status_update",
    device_id: deviceId,
    payload: {
      room_id: "room_token_smoke",
      status: "cleaning"
    }
  }, { "X-YA-Device-Token": secondToken });
  assert.equal(inactiveAction.status, 403, "Pasif cihaz action kuyruğunu dolduramamalı.");
  assert.equal((await inactiveAction.json()).code, "device_approval_required");

  console.log("android-device-token-smoke-ok");
} catch (error) {
  if (serverOutput.trim()) console.error(serverOutput.trim());
  throw error;
} finally {
  server.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}

function createSnapshot(isActive, androidEnabled = true) {
  return {
    business_capabilities: [
      "core.customers",
      ...(androidEnabled ? ["service.android"] : []),
      "accommodation.rooms",
      "food_service.tables",
      "food_service.menu"
    ],
    summary: {},
    daily_tasks: [],
    requests: [{
      id: "request_token_smoke",
      customer_name: "Token Misafiri",
      customer_phone: "+905000000001",
      request_type: "general_info",
      status: "new",
      guest_count: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }],
    customers: [],
    customer_room_stays: [],
    room_folios: [],
    reservations: [],
    rooms: [{ id: "room_token_smoke", name: "Oda 1", number: "1", capacity: 2, status: "available", updated_at: new Date().toISOString() }],
    tables: [{ id: "table_token_smoke", name: "Masa 1", area: "Bahçe", capacity: 4, status: "available", updated_at: new Date().toISOString() }],
    menu: { categories: [], items: [], updated_at: new Date().toISOString() },
    admin_menu: { categories: [], items: [], updated_at: new Date().toISOString() },
    deleted_request_ids: [],
    trackedStockItems: [],
    appliedStockImageHashes: [],
    table_orders: [],
    messages: [],
    androidPermissions: {
      [deviceId]: {
        role: "staff",
        is_active: isActive,
        permissions: ["room.view", "room.update_status", "table.view", "table_order.view"]
      }
    },
    finance: [],
    reports: [],
    updated_at: new Date().toISOString()
  };
}

function claimToken() {
  return fetch(`${baseUrl}/api/android-device-token.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": syncSecret,
      "X-YA-Device-Id": deviceId
    },
    body: "{}"
  });
}

function postAndroid(payload, authorizationHeaders) {
  return postJson(`${baseUrl}/api/android.php`, payload, {
    ...authorizationHeaders,
    "X-YA-Device-Id": deviceId
  });
}

function postJson(url, payload, extraHeaders = {}) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const freePort = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(freePort));
    });
  });
}

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // PHP server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PHP server did not become ready: ${url}`);
}
