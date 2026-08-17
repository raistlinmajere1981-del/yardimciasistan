import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import process from "node:process";

const require = createRequire(import.meta.url);
const {
  markAndroidActionResult,
  markRequestsSynced,
  pullAndroidActions,
  pullRequests,
  pushAndroidSnapshot
} = require("../packages/sync-core/dist");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");

const syncSecret = "change-this-secret";
const deviceId = "android-demo-flow-v2";
const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-demo-flow-v2-"));
const webRoot = join(tempRoot, "web-module");
cpSync(join(process.cwd(), "firm-template", "web-module"), webRoot, { recursive: true });
for (const name of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) {
  rmSync(join(webRoot, "data", name), { force: true });
}

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const php = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", webRoot], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});
let serverOutput = "";
php.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
php.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

let database;
try {
  await waitForUrl(`${baseUrl}/api/menu.php`);

  const publicResponse = await fetch(`${baseUrl}/api/request.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request_type: "pension_reservation",
      customer_name: "Pilot Demo Misafir",
      customer_phone: "0555 444 22 11",
      date_text: "Yarın",
      guest_count: 2,
      message: "Sessiz bir oda için bilgi rica ederiz.",
      source: "web_form"
    })
  });
  assert.equal(publicResponse.status, 201);
  const publicResult = await publicResponse.json();
  assert.equal(publicResult.ok, true);

  const pull = await pullRequests({ baseUrl, syncSecret, limit: 20 });
  assert.equal(pull.ok, true, pull.message);
  assert.equal(pull.requests.some((request) => request.id === publicResult.request_id), true);

  const dataDir = join(process.cwd(), "artifacts", "desktop-demo-flow-v2", String(Date.now()));
  mkdirSync(dataDir, { recursive: true });
  database = new DesktopDatabase({
    appPath: join(process.cwd(), "apps", "desktop-app"),
    userDataPath: dataDir
  });
  database.initialize();
  database.upsertRequests(pull.requests);

  const requestIds = pull.requests.map((request) => request.id);
  const marked = await markRequestsSynced({ baseUrl, syncSecret, requestIds });
  assert.equal(marked.ok, true, marked.message);
  database.markLocalRequestsSynced(requestIds);
  assert.equal(database.getDashboardData().requests.some((request) => request.id === publicResult.request_id), true);

  const now = new Date().toISOString();
  database.upsertAndroidDeviceSightings([{
    device_id: deviceId,
    device_name: "Demo Flow v2 Telefon",
    app_version: "0.1.2-smoke",
    first_seen_at: now,
    last_seen_at: now
  }]);
  assert.equal(database.getAndroidDevices().find((device) => device.deviceId === deviceId)?.isActive, false);
  const approval = database.setAndroidDeviceActive(deviceId, true);
  assert.equal(approval.ok, true, approval.message);

  let dashboard = database.getDashboardData();
  const initialSnapshot = snapshotFromDashboard(database, dashboard);
  const initialPublish = await pushAndroidSnapshot({ baseUrl, syncSecret, snapshot: initialSnapshot });
  assert.equal(initialPublish.ok, true, initialPublish.message);

  const initialSummary = await androidSummary(baseUrl, deviceId);
  assert.equal(initialSummary.response.status, 200);
  assert.equal(initialSummary.json.ok, true);
  assert.equal(initialSummary.json.approval_required, false);
  assert.ok(initialSummary.json.rooms.length > 0);
  assert.ok(initialSummary.json.requests.some((request) => request.id === publicResult.request_id));

  const targetRoom = dashboard.rooms.find((room) => room.isActive);
  assert.ok(targetRoom);
  const nextStatus = targetRoom.status === "maintenance" ? "cleaning" : "maintenance";
  const actionId = "android_demo_flow_v2_room_001";
  const enqueue = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": syncSecret
    },
    body: JSON.stringify({
      action: "enqueue_android_action",
      action_id: actionId,
      action_type: "room_status_update",
      device_id: deviceId,
      device_name: "Demo Flow v2 Telefon",
      app_version: "0.1.2-smoke",
      payload: {
        room_id: targetRoom.id,
        status: nextStatus,
        expected_updated_at: targetRoom.updatedAt
      }
    })
  });
  assert.equal(enqueue.status, 201);
  const enqueueJson = await enqueue.json();
  assert.equal(enqueueJson.ok, true);

  const actions = await pullAndroidActions({ baseUrl, syncSecret, limit: 20 });
  assert.equal(actions.ok, true, actions.message);
  assert.equal(actions.count, 1);
  assert.equal(actions.actions[0].id, actionId);

  const applied = database.applyAndroidAction(actions.actions[0]);
  assert.equal(applied.ok, true, applied.message);
  assert.equal(applied.alreadyApplied, false);
  const duplicateApply = database.applyAndroidAction(actions.actions[0]);
  assert.equal(duplicateApply.ok, true);
  assert.equal(duplicateApply.alreadyApplied, true);

  const markedAction = await markAndroidActionResult({
    baseUrl,
    syncSecret,
    actionId,
    status: "applied"
  });
  assert.equal(markedAction.ok, true, markedAction.message);

  dashboard = database.getDashboardData();
  assert.equal(dashboard.rooms.find((room) => room.id === targetRoom.id)?.status, nextStatus);
  const republish = await pushAndroidSnapshot({
    baseUrl,
    syncSecret,
    snapshot: snapshotFromDashboard(database, dashboard)
  });
  assert.equal(republish.ok, true, republish.message);

  const finalSummary = await androidSummary(baseUrl, deviceId);
  assert.equal(finalSummary.response.status, 200);
  assert.equal(finalSummary.json.approval_required, false);
  assert.equal(finalSummary.json.rooms.find((room) => room.id === targetRoom.id)?.status, nextStatus);
  assert.equal(finalSummary.json.actions.find((action) => action.id === actionId)?.status, "applied");

  const emptyPull = await pullAndroidActions({ baseUrl, syncSecret, limit: 20 });
  assert.equal(emptyPull.ok, true);
  assert.equal(emptyPull.count, 0);

  console.log("demo-flow-v2-ok: public request → desktop import → explicit Android approval → action → republished snapshot verified");
} catch (error) {
  if (serverOutput.trim()) console.error(serverOutput.trim());
  throw error;
} finally {
  database?.close();
  php.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}

function snapshotFromDashboard(databaseInstance, dashboard) {
  const rooms = dashboard.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    number: room.number,
    capacity: room.capacity,
    status: room.status,
    active_reservation_title: room.activeReservationTitle,
    updated_at: room.updatedAt
  }));
  const tables = dashboard.tables.map((table) => ({
    id: table.id,
    name: table.name,
    area: table.area,
    capacity: table.capacity,
    status: table.status,
    active_reservation_title: table.activeReservationTitle,
    updated_at: table.updatedAt
  }));

  return {
    summary: {
      pending_daily_tasks: dashboard.summary.pendingDailyTasks,
      today_tasks: 0,
      available_rooms: dashboard.summary.availableRooms,
      total_rooms: dashboard.summary.totalRooms,
      available_tables: dashboard.summary.availableTables,
      occupied_tables: tables.filter((table) => table.status === "occupied").length,
      bill_waiting_tables: tables.filter((table) => table.status === "bill_waiting").length,
      active_table_orders: databaseInstance.listTableOrders().filter((order) => !["paid", "cancelled"].includes(order.status)).length,
      pending_reservations: dashboard.summary.pendingReservations,
      prepared_whatsapp_messages: dashboard.summary.preparedWhatsAppMessages,
      waiting_responses: dashboard.summary.waitingRequests,
      active_menu_categories: dashboard.summary.activeMenuCategories,
      available_menu_items: dashboard.summary.availableMenuItems,
      customer_count: dashboard.customers.length
    },
    daily_tasks: [],
    requests: dashboard.requests,
    customers: [],
    customer_room_stays: [],
    room_folios: [],
    reservations: [],
    rooms,
    tables,
    menu: dashboard.menu,
    admin_menu: dashboard.menu,
    deleted_request_ids: databaseInstance.getDeletedRequestIds(),
    trackedStockItems: [],
    appliedStockImageHashes: [],
    table_orders: [],
    messages: [],
    androidPermissions: databaseInstance.getAndroidPermissionSnapshot(),
    finance: {
      generated_at: new Date().toISOString(),
      currency: "TRY",
      today_income_minor: 0,
      today_expense_minor: 0,
      today_net_minor: 0,
      outstanding_pension_minor: 0,
      recent_entries: []
    },
    reports: {},
    updated_at: new Date().toISOString()
  };
}

async function androidSummary(baseUrl, currentDeviceId) {
  const response = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": syncSecret
    },
    body: JSON.stringify({
      action: "android_summary",
      device_id: currentDeviceId,
      device_name: "Demo Flow v2 Telefon",
      app_version: "0.1.2-smoke",
      limit: 20
    })
  });
  return { response, json: await response.json() };
}

async function waitForUrl(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PHP server did not become ready: ${url}`);
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}
