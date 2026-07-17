import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
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

const requestsFile = "firm-template/web-module/data/requests.json";
const syncStateFile = "firm-template/web-module/data/sync-state.json";
const androidSnapshotFile = "firm-template/web-module/data/android-snapshot.json";
const androidActionsFile = "firm-template/web-module/data/android-actions.json";
const conversationsFile = "firm-template/web-module/data/ai-conversations.json";
const demoRequestsFile = "demo-data/web-module-requests.json";
const originalRequestsJson = readFileSync(requestsFile, "utf8");
const originalSyncStateJson = readFileSync(syncStateFile, "utf8");
const originalAndroidSnapshotJson = readFileSync(androidSnapshotFile, "utf8");
const originalAndroidActionsJson = readFileSync(androidActionsFile, "utf8");
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
  writeJson(androidActionsFile, []);
  writeJson(conversationsFile, []);

  await waitForUrl(`${baseUrl}/api/menu.php`);
  const formRequestResult = await createWebFormRequest(baseUrl);
  const aiRequestResult = await createWebAiRequest(baseUrl);
  const expectedRequestCount = demoRequests.length + 2;

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
  assert.equal(androidSummary.requests.length, 2);
  assert.ok(androidSummary.requests.every((request) => request.id.startsWith("request_")));

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
  assert.ok(pullResult.requests.some((request) => request.id === formRequestResult.request_id && request.source === "web_form"));
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

  const localFormRequest = dashboardData.requests.find((request) => request.id === formRequestResult.request_id);
  assert.ok(localFormRequest, "web form talebi desktop dashboard listesinde bulunmali");
  assert.equal(localFormRequest.source, "web_form");
  assert.equal(localFormRequest.customer_name, "Widget Demo Misafir");
  assert.equal(localFormRequest.customer_phone, "+905553338800");
  assert.equal(localFormRequest.date_text, "22 Temmuz");
  assert.equal(localFormRequest.guest_count, 3);
  assert.ok(localFormRequest.whatsapp_message.includes("Pansiyon rezervasyonu"));
  assert.ok(dashboardData.customers.some((customer) => customer.phone === "+905553338800" && customer.source === "web_form"));

  const conversionResult = database.convertRequestToReservation(requestIds[0]);
  assert.equal(conversionResult.ok, true);
  assert.match(conversionResult.reservationId, /^reservation_/);
  assert.equal(conversionResult.dashboardData.summary.newRequests, dashboardData.summary.newRequests - 1);
  assert.ok(conversionResult.dashboardData.requests.some((request) => request.id === requestIds[0] && request.status === "converted_to_reservation"));

  const actionDeviceId = "android-demo-flow-device";
  const roomActionId = "android_action_demo_flow_room_001";
  const roomActionResponse = await enqueueAndroidAction(baseUrl, {
    id: roomActionId,
    type: "room_status_update",
    deviceId: actionDeviceId,
    payload: { room_id: "room_101", status: "maintenance" }
  });
  assert.equal(roomActionResponse.status, 201);
  assert.equal(roomActionResponse.json.action.status, "pending");

  const duplicateRoomActionResponse = await enqueueAndroidAction(baseUrl, {
    id: roomActionId,
    type: "room_status_update",
    deviceId: actionDeviceId,
    payload: { room_id: "room_101", status: "maintenance" }
  });
  assert.equal(duplicateRoomActionResponse.status, 200);
  assert.equal(duplicateRoomActionResponse.json.deduplicated, true);

  await enqueueAndroidAction(baseUrl, {
    id: "android_action_demo_flow_missing_001",
    type: "room_status_update",
    deviceId: actionDeviceId,
    payload: { room_id: "room_missing", status: "cleaning" }
  });

  const actionPull = await pullAndroidActions({ baseUrl, syncSecret: "change-this-secret", limit: 20 });
  assert.equal(actionPull.ok, true);
  assert.equal(actionPull.count, 2);
  const roomEventCount = database.countEventsByType("room.status_changed");
  for (const action of actionPull.actions) {
    const applyResult = database.applyAndroidAction(action);
    if (action.id === roomActionId) {
      assert.equal(applyResult.ok, true);
      const duplicateApply = database.applyAndroidAction(action);
      assert.equal(duplicateApply.ok, true);
      assert.equal(duplicateApply.alreadyApplied, true);
      assert.equal(database.countEventsByType("room.status_changed"), roomEventCount + 1);
    } else {
      assert.equal(applyResult.ok, false);
    }
    const markActionResult = await markAndroidActionResult({
      baseUrl,
      syncSecret: "change-this-secret",
      actionId: action.id,
      status: applyResult.ok ? "applied" : "failed",
      errorMessage: applyResult.ok ? "" : applyResult.message
    });
    assert.equal(markActionResult.ok, true);
  }
  assert.equal(database.getDashboardData().rooms.find((room) => room.id === "room_101")?.status, "maintenance");
  const emptyActionPull = await pullAndroidActions({ baseUrl, syncSecret: "change-this-secret" });
  assert.equal(emptyActionPull.ok, true);
  assert.equal(emptyActionPull.count, 0);

  const postActionDashboard = database.getDashboardData();

  const androidSnapshotResult = await pushAndroidSnapshot({
    baseUrl,
    syncSecret: "change-this-secret",
    snapshot: createAndroidSnapshot(postActionDashboard, database.listTableOrders())
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
      device_id: actionDeviceId,
      limit: 3
    })
  });
  assert.equal(snapshotSummaryResponse.ok, true);
  const snapshotSummary = await snapshotSummaryResponse.json();
  assert.equal(snapshotSummary.operations.pending_daily_tasks, postActionDashboard.summary.pendingDailyTasks);
  assert.equal(snapshotSummary.operations.available_rooms, postActionDashboard.summary.availableRooms);
  assert.ok(snapshotSummary.daily_tasks.length >= 1);
  assert.ok(snapshotSummary.rooms.some((room) => room.id === "room_101" && room.status === "maintenance"));
  assert.ok(snapshotSummary.menu.items.length >= 1);
  assert.equal(snapshotSummary.actions.find((action) => action.id === roomActionId)?.status, "applied");
  assert.equal(snapshotSummary.actions.find((action) => action.id === "android_action_demo_flow_missing_001")?.status, "failed");

  const secondPull = await pullRequests({
    baseUrl,
    syncSecret: "change-this-secret",
    limit: 10
  });
  assert.equal(secondPull.ok, true);
  assert.equal(secondPull.count, 0);

  console.log(`demo-flow-ok: ${requestIds.length} web requests pulled, Android actions applied idempotently, failed result retained`);
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
  writeFileSync(androidActionsFile, originalAndroidActionsJson);
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
      today_tasks: 0,
      available_rooms: 0,
      total_rooms: 0,
      available_tables: 0,
      occupied_tables: 0,
      bill_waiting_tables: 0,
      active_table_orders: 0,
      pending_reservations: 0,
      prepared_whatsapp_messages: 0,
      waiting_responses: 0,
      active_menu_categories: 0,
      available_menu_items: 0,
      customer_count: 0
    },
    daily_tasks: [],
    requests: [],
    customers: [],
    reservations: [],
    rooms: [],
    tables: [],
    menu: { categories: [], items: [], updated_at: "" },
    table_orders: [],
    messages: [],
    updated_at: ""
  };
}

async function createWebFormRequest(baseUrl) {
  const response = await fetch(`${baseUrl}/api/request.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      request_type: "pension_reservation",
      customer_name: "Widget Demo Misafir",
      customer_phone: "0555 333 88 00",
      date_text: "22 Temmuz",
      guest_count: 3,
      message: "Deniz manzarali oda icin bilgi almak istiyoruz.",
      source: "web_form"
    })
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.match(result.request_id, /^request_/);
  assert.equal(result.whatsapp_phone, "905553338800");
  assert.match(result.whatsapp_message, /Pansiyon rezervasyonu/);

  const requests = JSON.parse(readFileSync(requestsFile, "utf8"));
  const request = requests.find((record) => record.id === result.request_id);
  assert.ok(request, "request.php ile olusan web form talebi requests.json icinde bulunmali");
  assert.equal(request.source, "web_form");
  assert.equal(request.request_type, "pension_reservation");
  assert.equal(request.customer_name, "Widget Demo Misafir");
  assert.equal(request.customer_phone, "+905553338800");
  assert.equal(request.date_text, "22 Temmuz");
  assert.equal(request.guest_count, 3);
  assert.equal(request.sync_status, "pending");

  return result;
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

function createAndroidSnapshot(dashboardData, tableOrders) {
  return {
    summary: {
      pending_daily_tasks: dashboardData.summary.pendingDailyTasks,
      today_tasks: dashboardData.dailyTasks.filter((task) => task.status === "pending").length,
      available_rooms: dashboardData.summary.availableRooms,
      total_rooms: dashboardData.summary.totalRooms,
      available_tables: dashboardData.summary.availableTables,
      occupied_tables: dashboardData.tables.filter((table) => table.status === "occupied").length,
      bill_waiting_tables: dashboardData.tables.filter((table) => table.status === "bill_waiting").length,
      active_table_orders: tableOrders.filter((order) => ["open", "preparing", "served", "payment"].includes(order.status)).length,
      pending_reservations: dashboardData.summary.pendingReservations,
      prepared_whatsapp_messages: dashboardData.summary.preparedWhatsAppMessages,
      waiting_responses: dashboardData.requests.filter((request) => ["new", "seen", "waiting_owner"].includes(request.status)).length,
      active_menu_categories: dashboardData.summary.activeMenuCategories,
      available_menu_items: dashboardData.summary.availableMenuItems,
      customer_count: dashboardData.customers.length
    },
    daily_tasks: dashboardData.dailyTasks
      .filter((task) => task.status === "pending")
      .slice(0, 200)
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
    requests: dashboardData.requests.map((request) => ({
      id: request.id,
      customer_id: request.customer_id,
      request_type: request.request_type,
      status: request.status,
      customer_name: request.customer_name,
      customer_phone: request.customer_phone,
      date_text: request.date_text,
      start_date: request.start_date,
      end_date: request.end_date,
      time: request.time,
      guest_count: request.guest_count,
      message: request.message,
      ai_summary: request.ai_summary,
      ai_suggested_reply: request.ai_suggested_reply,
      whatsapp_message: request.whatsapp_message,
      priority: request.priority,
      created_at: request.created_at,
      updated_at: request.updated_at
    })),
    customers: dashboardData.customers.map((customer) => ({
      id: customer.id,
      full_name: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes,
      tags: customer.tags,
      request_count: customer.requestCount,
      reservation_count: customer.reservationCount,
      updated_at: customer.updatedAt
    })),
    reservations: dashboardData.reservations.map((reservation) => ({
      id: reservation.id,
      request_id: reservation.requestId,
      customer_id: reservation.customerId,
      customer_name: reservation.customerName,
      customer_phone: reservation.customerPhone,
      reservation_type: reservation.reservationType,
      status: reservation.status,
      title: reservation.title,
      start_date: reservation.startDate,
      end_date: reservation.endDate,
      time: reservation.time,
      guest_count: reservation.guestCount,
      room_ids: reservation.roomIds,
      table_ids: reservation.tableIds,
      notes: reservation.notes,
      payment_status: reservation.paymentStatus,
      updated_at: reservation.updatedAt
    })),
    rooms: dashboardData.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      number: room.number,
      capacity: room.capacity,
      status: room.status,
      active_reservation_title: room.activeReservationTitle,
      updated_at: room.updatedAt
    })),
    tables: dashboardData.tables.map((table) => ({
      id: table.id,
      name: table.name,
      area: table.area,
      capacity: table.capacity,
      status: table.status,
      active_reservation_title: table.activeReservationTitle,
      updated_at: table.updatedAt
    })),
    menu: dashboardData.menu,
    table_orders: tableOrders.filter((order) => ["open", "preparing", "served", "payment"].includes(order.status)).map((order) => ({
      id: order.id,
      table_id: order.tableId,
      table_name: order.tableName,
      status: order.status,
      opened_at: order.openedAt,
      total: order.total,
      item_count: order.itemCount,
      items: order.items.map((item) => ({
        id: item.id,
        order_id: item.orderId,
        menu_item_id: item.menuItemId,
        product_name: item.productName,
        unit_price: item.unitPrice,
        currency: item.currency,
        quantity: item.quantity,
        line_total: item.lineTotal,
        status: item.status,
        updated_at: item.updatedAt
      })),
      updated_at: order.updatedAt
    })),
    messages: dashboardData.requests.filter((request) => request.ai_suggested_reply || request.whatsapp_message).map((request) => ({
      id: `message_${request.id}`,
      request_id: request.id,
      customer_name: request.customer_name,
      customer_phone: request.customer_phone,
      message: request.ai_suggested_reply || request.whatsapp_message,
      status: "prepared",
      updated_at: request.updated_at
    })),
    updated_at: new Date().toISOString()
  };
}

async function enqueueAndroidAction(baseUrl, input) {
  const response = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": "change-this-secret"
    },
    body: JSON.stringify({
      action: "enqueue_android_action",
      sync_secret: "change-this-secret",
      action_id: input.id,
      action_type: input.type,
      device_id: input.deviceId,
      payload: input.payload
    })
  });
  return { status: response.status, json: await response.json() };
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
