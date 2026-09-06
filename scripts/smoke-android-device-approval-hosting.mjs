import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-android-approval-hosting-"));
const webModuleRoot = join(tempRoot, "web-module");
const syncSecret = "android-approval-hosting-smoke-secret";
const deviceId = "android-approval-hosting-smoke";

cpSync(join(process.cwd(), "firm-template", "web-module"), webModuleRoot, { recursive: true });
for (const runtimeFile of [
  "yardimci-asistan.sqlite",
  "yardimci-asistan.sqlite-wal",
  "yardimci-asistan.sqlite-shm"
]) {
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

  await publishSnapshot(1, {});

  const pendingResponse = await syncApi({
    action: "android_summary",
    device_id: deviceId,
    device_name: "Onay Bekleyen Smoke Telefonu",
    app_version: "smoke"
  });
  assert.equal(pendingResponse.status, 200);
  const pending = await pendingResponse.json();
  assert.equal(pending.ok, true);
  assert.equal(pending.code, "device_approval_required");
  assert.equal(pending.approval_required, true);
  assert.equal(pending.androidPermissions[deviceId].is_active, false);
  assert.deepEqual(pending.androidPermissions[deviceId].permissions, []);
  assert.deepEqual(pending.requests, [], "Onaysız cihaz müşteri taleplerini görmemeli");
  assert.deepEqual(pending.daily_tasks, [], "Onaysız cihaz günlük işleri görmemeli");
  assert.deepEqual(pending.rooms, [], "Onaysız cihaz oda verisini görmemeli");
  assert.deepEqual(pending.tables, [], "Onaysız cihaz masa verisini görmemeli");
  assert.deepEqual(pending.menu.categories, [], "Onaysız cihaz menü snapshot'ını görmemeli");
  assert.deepEqual(pending.admin_menu.categories, [], "Onaysız cihaz yönetici menüsünü görmemeli");
  assert.deepEqual(pending.table_orders, [], "Onaysız cihaz adisyon verisini görmemeli");
  assert.deepEqual(pending.messages, [], "Onaysız cihaz hazır mesajları görmemeli");
  assert.deepEqual(pending.finance, [], "Onaysız cihaz finans verisini görmemeli");
  assert.deepEqual(pending.reports, [], "Onaysız cihaz rapor verisini görmemeli");
  assert.equal(pending.operations.total_rooms, 0);
  assert.equal(pending.summary.total_requests, 0);

  await publishSnapshot(2, {
    [deviceId]: {
      role: "staff",
      is_active: true,
      permissions: ["room.view", "table.view", "daily_task.view"]
    }
  });

  const approvedResponse = await syncApi({
    action: "android_summary",
    device_id: deviceId,
    device_name: "Onaylı Smoke Telefonu",
    app_version: "smoke"
  });
  assert.equal(approvedResponse.status, 200);
  const approved = await approvedResponse.json();
  assert.equal(approved.ok, true);
  assert.equal(approved.approval_required, false);
  assert.equal(approved.androidPermissions[deviceId].is_active, true);
  assert.equal(approved.requests.length, 1, "Onaylı cihaz normal operasyon snapshot'ını almalı");
  assert.equal(approved.daily_tasks.length, 1);
  assert.equal(approved.rooms.length, 1);
  assert.equal(approved.tables.length, 1);
  assert.equal(approved.operations.total_rooms, 1);
  assert.equal(approved.summary.total_requests, 1);

  console.log("android-device-approval-hosting-smoke-ok: inactive device sees no operational snapshot, approved device does");
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  server.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}

async function publishSnapshot(sourceRevision, androidPermissions) {
  const response = await syncApi({
    action: "publish_android_snapshot",
    client_id: "approval-smoke-desktop",
    source_revision: sourceRevision,
    idempotency_key: `approval-smoke-${sourceRevision}`,
    snapshot: {
      business_capabilities: [
        "core.customers",
        "core.tasks",
        "core.finance",
        "core.reports",
        "service.android",
        "accommodation.rooms",
        "food_service.tables",
        "food_service.menu"
      ],
      summary: {
        pending_daily_tasks: 1,
        today_tasks: 1,
        available_rooms: 1,
        total_rooms: 1,
        available_tables: 1,
        occupied_tables: 0,
        bill_waiting_tables: 0,
        active_table_orders: 0,
        pending_reservations: 0,
        prepared_whatsapp_messages: 0,
        waiting_responses: 1,
        active_menu_categories: 1,
        available_menu_items: 1,
        customer_count: 1
      },
      daily_tasks: [{
        id: "task_approval_smoke",
        title: "Gizli günlük iş",
        description: "Onaysız telefona çıkmamalı",
        task_type: "manual_pension",
        status: "pending",
        due_date: "2036-08-17",
        due_time: "12:00",
        related_type: "",
        related_id: "",
        updated_at: "2036-08-17T09:00:00Z"
      }],
      requests: [{
        id: "request_approval_smoke",
        customer_id: "customer_approval_smoke",
        request_type: "pension_reservation",
        status: "new",
        customer_name: "Gizli Müşteri",
        customer_phone: "+905550000001",
        date_text: "17 Ağustos",
        start_date: "2036-08-17",
        end_date: "2036-08-18",
        time: "",
        guest_count: 2,
        message: "Onaysız telefona çıkmamalı",
        priority: "normal",
        sync_status: "synced",
        created_at: "2036-08-17T09:00:00Z",
        updated_at: "2036-08-17T09:00:00Z"
      }],
      customers: [],
      customer_room_stays: [],
      room_folios: [],
      reservations: [],
      rooms: [{
        id: "room_approval_smoke",
        name: "Oda 1",
        number: "1",
        capacity: 2,
        status: "available",
        active_reservation_title: "",
        updated_at: "2036-08-17T09:00:00Z"
      }],
      tables: [{
        id: "table_approval_smoke",
        name: "Masa 1",
        area: "Bahçe",
        capacity: 4,
        status: "available",
        active_reservation_title: "",
        updated_at: "2036-08-17T09:00:00Z"
      }],
      menu: {
        categories: [{
          id: "category_approval_smoke",
          name: "İçecekler",
          description: "",
          is_active: true,
          sort_order: 1,
          created_at: "2036-08-17T09:00:00Z",
          updated_at: "2036-08-17T09:00:00Z"
        }],
        items: [{
          id: "item_approval_smoke",
          category_id: "category_approval_smoke",
          name: "Çay",
          description: "",
          price: 50,
          currency: "TRY",
          image_url: "",
          is_available: true,
          is_featured: false,
          allergens: [],
          tags: [],
          stock_quantity: 10,
          stock_min_quantity: 2,
          stock_unit: "piece",
          stock_consumption_quantity: 1,
          hide_when_out_of_stock: false,
          sort_order: 1,
          created_at: "2036-08-17T09:00:00Z",
          updated_at: "2036-08-17T09:00:00Z"
        }],
        updated_at: "2036-08-17T09:00:00Z"
      },
      admin_menu: {
        categories: [],
        items: [],
        updated_at: "2036-08-17T09:00:00Z"
      },
      deleted_request_ids: [],
      trackedStockItems: [],
      appliedStockImageHashes: [],
      table_orders: [],
      messages: [],
      androidPermissions,
      finance: {
        generated_at: "2036-08-17T09:00:00Z",
        currency: "TRY",
        today_income_minor: 10000,
        today_expense_minor: 0,
        today_net_minor: 10000,
        outstanding_pension_minor: 0,
        recent_entries: []
      },
      reports: {},
      updated_at: "2036-08-17T09:00:00Z"
    }
  });
  assert.equal(response.status, 200, `Snapshot yayını başarısız: ${await response.text()}`);
}

function syncApi(payload) {
  return fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": syncSecret
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
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // PHP server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PHP server did not become ready: ${url}`);
}
