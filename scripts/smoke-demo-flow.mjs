import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { pullRequests, markRequestsSynced, pushAndroidSnapshot } = require("../packages/sync-core/dist");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");

const requestsFile = "firm-template/web-module/data/requests.json";
const syncStateFile = "firm-template/web-module/data/sync-state.json";
const androidSnapshotFile = "firm-template/web-module/data/android-snapshot.json";
const conversationsFile = "firm-template/web-module/data/ai-conversations.json";
const demoRequestsFile = "demo-data/web-module-requests.json";
const originalRequestsJson = readFileSync(requestsFile, "utf8");
const originalSyncStateJson = readFileSync(syncStateFile, "utf8");
const originalAndroidSnapshotJson = readFileSync(androidSnapshotFile, "utf8");
const originalConversationsJson = readFileSync(conversationsFile, "utf8");
const demoRequests = JSON.parse(readFileSync(demoRequestsFile, "utf8"));
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", "firm-template/web-module"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
let database;
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  writeJson(requestsFile, demoRequests);
  writeJson(syncStateFile, {
    demo_seeded_at: new Date().toISOString(),
    last_request_pull_at: "",
    last_request_mark_at: "",
    last_menu_publish_at: "",
    last_android_snapshot_at: "",
    updated_at: new Date().toISOString()
  });
  writeJson(androidSnapshotFile, emptyAndroidSnapshot());
  writeJson(conversationsFile, []);

  await waitForUrl(`${baseUrl}/api/menu.php`);
  const aiRequestResult = await createWebAiRequest(baseUrl);
  const expectedRequestCount = demoRequests.length + 1;

  const unauthorized = await pullRequests({
    baseUrl,
    syncSecret: "wrong-secret"
  });
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.status, 401);

  const androidSummaryResponse = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": "change-this-secret"
    },
    body: JSON.stringify({
      action: "android_summary",
      sync_secret: "change-this-secret",
      limit: 2
    })
  });
  assert.equal(androidSummaryResponse.ok, true);
  const androidSummary = await androidSummaryResponse.json();
  assert.equal(androidSummary.ok, true);
  assert.equal(androidSummary.summary.new_requests, expectedRequestCount);
  assert.equal(androidSummary.summary.request_count, 2);
  assert.equal(androidSummary.requests[0].id, "request_demo_web_001");

  const invalidStatusResponse = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": "change-this-secret"
    },
    body: JSON.stringify({
      action: "update_request_status",
      sync_secret: "change-this-secret",
      request_id: "request_demo_web_003",
      status: "done"
    })
  });
  assert.equal(invalidStatusResponse.status, 422);

  const answeredResponse = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": "change-this-secret"
    },
    body: JSON.stringify({
      action: "update_request_status",
      sync_secret: "change-this-secret",
      request_id: "request_demo_web_003",
      status: "answered"
    })
  });
  assert.equal(answeredResponse.ok, true);
  const answeredResult = await answeredResponse.json();
  assert.equal(answeredResult.ok, true);
  assert.equal(answeredResult.request.status, "answered");

  const updatedAndroidSummaryResponse = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": "change-this-secret"
    },
    body: JSON.stringify({
      action: "android_summary",
      sync_secret: "change-this-secret",
      limit: 3
    })
  });
  assert.equal(updatedAndroidSummaryResponse.ok, true);
  const updatedAndroidSummary = await updatedAndroidSummaryResponse.json();
  assert.equal(updatedAndroidSummary.summary.new_requests, expectedRequestCount - 1);
  assert.equal(updatedAndroidSummary.summary.pending_requests, expectedRequestCount - 1);
  assert.equal(updatedAndroidSummary.requests.find((request) => request.id === "request_demo_web_003").status, "answered");

  const pullResult = await pullRequests({
    baseUrl,
    syncSecret: "change-this-secret",
    limit: 10
  });
  assert.equal(pullResult.ok, true);
  assert.equal(pullResult.count, expectedRequestCount);
  assert.ok(pullResult.requests.some((request) => request.id === aiRequestResult.request_id && request.source === "web_ai"));

  const dataDir = join(process.cwd(), "artifacts", "desktop-demo-flow", String(Date.now()));
  mkdirSync(dataDir, { recursive: true });
  database = new DesktopDatabase({
    appPath: join(process.cwd(), "apps", "desktop-app"),
    userDataPath: dataDir
  });
  database.initialize();
  database.upsertRequests(pullResult.requests);

  const requestIds = pullResult.requests.map((request) => request.id);
  const markResult = await markRequestsSynced({
    baseUrl,
    syncSecret: "change-this-secret",
    requestIds
  });
  assert.equal(markResult.ok, true);
  assert.equal(markResult.updated_count, requestIds.length);
  database.markLocalRequestsSynced(requestIds);

  const dashboardData = database.getDashboardData();
  for (const requestId of requestIds) {
    const localRequest = dashboardData.requests.find((request) => request.id === requestId);
    assert.ok(localRequest, `${requestId} desktop dashboard listesinde bulunmali`);
    assert.equal(localRequest.sync_status, "synced");
  }
  const localAiRequest = dashboardData.requests.find((request) => request.id === aiRequestResult.request_id);
  assert.ok(localAiRequest, "web AI talebi desktop dashboard listesinde bulunmali");
  assert.equal(localAiRequest.source, "web_ai");
  assert.equal(localAiRequest.customer_name, "AI Demo Misafir");
  assert.equal(localAiRequest.customer_phone, "+905553339900");
  assert.equal(localAiRequest.date_text, "21 Temmuz");
  assert.equal(localAiRequest.time, "19:30");
  assert.equal(localAiRequest.guest_count, 2);
  assert.equal(localAiRequest.ai_summary, "Web AI sohbetinden oluşturuldu.");
  assert.ok(dashboardData.customers.some((customer) => customer.phone === "+905553339900" && customer.source === "web_ai"));

  const conversionResult = database.convertRequestToReservation(requestIds[0]);
  assert.equal(conversionResult.ok, true);
  assert.match(conversionResult.reservationId, /^reservation_/);
  assert.equal(conversionResult.dashboardData.summary.newRequests, dashboardData.summary.newRequests - 1);
  assert.ok(conversionResult.dashboardData.requests.some((request) => request.id === requestIds[0] && request.status === "converted_to_reservation"));

  const androidSnapshotResult = await pushAndroidSnapshot({
    baseUrl,
    syncSecret: "change-this-secret",
    snapshot: createAndroidSnapshot(conversionResult.dashboardData)
  });
  assert.equal(androidSnapshotResult.ok, true);
  assert.ok(androidSnapshotResult.task_count >= 1);

  const snapshotSummaryResponse = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": "change-this-secret"
    },
    body: JSON.stringify({
      action: "android_summary",
      sync_secret: "change-this-secret",
      limit: 3
    })
  });
  assert.equal(snapshotSummaryResponse.ok, true);
  const snapshotSummary = await snapshotSummaryResponse.json();
  assert.equal(snapshotSummary.operations.pending_daily_tasks, conversionResult.dashboardData.summary.pendingDailyTasks);
  assert.equal(snapshotSummary.operations.available_rooms, conversionResult.dashboardData.summary.availableRooms);
  assert.ok(snapshotSummary.daily_tasks.length >= 1);

  const secondPull = await pullRequests({
    baseUrl,
    syncSecret: "change-this-secret",
    limit: 10
  });
  assert.equal(secondPull.ok, true);
  assert.equal(secondPull.count, 0);

  console.log(`demo-flow-ok: ${requestIds.length} web requests pulled including web_ai, 1 converted to approved reservation`);
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  database?.close();
  writeFileSync(requestsFile, originalRequestsJson);
  writeFileSync(syncStateFile, originalSyncStateJson);
  writeFileSync(androidSnapshotFile, originalAndroidSnapshotJson);
  writeFileSync(conversationsFile, originalConversationsJson);
  server.kill();
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function emptyAndroidSnapshot() {
  return {
    summary: {
      pending_daily_tasks: 0,
      available_rooms: 0,
      total_rooms: 0,
      available_tables: 0,
      pending_reservations: 0,
      prepared_whatsapp_messages: 0,
      active_menu_categories: 0,
      available_menu_items: 0,
      customer_count: 0
    },
    daily_tasks: [],
    updated_at: ""
  };
}

async function createWebAiRequest(baseUrl) {
  const response = await fetch(`${baseUrl}/api/chat.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "21 Temmuz saat 19:30 icin 2 kisi bahcede masa bilgisi almak istiyorum.",
      customer_name: "AI Demo Misafir",
      customer_phone: "0555 333 99 00",
      request_type: "restaurant_reservation",
      date_text: "21 Temmuz",
      time: "19:30",
      guest_count: 2,
      create_request: true
    })
  });
  assert.equal(response.ok, true);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.request_created, true);
  assert.match(result.request_id, /^request_/);
  assert.match(result.conversation_id, /^ai_conv_/);
  assert.deepEqual(result.request_missing_fields, []);

  const conversations = JSON.parse(readFileSync(conversationsFile, "utf8"));
  assert.ok(conversations.some((conversation) => conversation.id === result.conversation_id && conversation.request_id === result.request_id));

  return result;
}

function createAndroidSnapshot(dashboardData) {
  return {
    summary: {
      pending_daily_tasks: dashboardData.summary.pendingDailyTasks,
      available_rooms: dashboardData.summary.availableRooms,
      total_rooms: dashboardData.summary.totalRooms,
      available_tables: dashboardData.summary.availableTables,
      pending_reservations: dashboardData.summary.pendingReservations,
      prepared_whatsapp_messages: dashboardData.summary.preparedWhatsAppMessages,
      active_menu_categories: dashboardData.summary.activeMenuCategories,
      available_menu_items: dashboardData.summary.availableMenuItems,
      customer_count: dashboardData.customers.length
    },
    daily_tasks: dashboardData.dailyTasks
      .filter((task) => task.status === "pending")
      .slice(0, 8)
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        task_type: task.taskType,
        status: task.status,
        due_date: task.dueDate,
        due_time: task.dueTime,
        related_type: task.relatedType,
        related_id: task.relatedId,
        updated_at: task.updatedAt
      })),
    updated_at: new Date().toISOString()
  };
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
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await delay(100);
  }

  throw new Error(`PHP server did not become ready: ${url}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
