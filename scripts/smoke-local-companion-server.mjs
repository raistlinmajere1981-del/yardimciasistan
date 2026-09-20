import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  LocalCompanionServer
} from "../apps/desktop-app/dist-electron/local-companion-server.js";
import {
  projectLocalAndroidSnapshotForDevice
} from "../apps/desktop-app/dist-electron/local-android-device-projection.js";
import {
  emptyAndroidMarketSnapshot
} from "../apps/desktop-app/dist-electron/market-android-snapshot.js";
import {
  LocalCompanionPairingService
} from "../apps/desktop-app/dist-electron/local-companion-pairing-service.js";
import {
  DesktopDatabase
} from "../apps/desktop-app/dist-electron/database.js";
import {
  buildLocalCompanionMdnsResponse
} from "../apps/desktop-app/dist-electron/local-companion-mdns.js";

const TOKEN = "yal_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function baseSnapshot() {
  return {
    business_capabilities: ["service.android", "core.reports", "core.finance"],
    local_network_enabled: true,
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
      customer_count: 1
    },
    daily_tasks: [],
    requests: [],
    customers: [{ id: "customer-1", full_name: "Test Customer" }],
    customer_room_stays: [{ id: "stay-1" }],
    room_folios: [{ id: "folio-1" }],
    reservations: [],
    rooms: [],
    tables: [],
    menu: { categories: [], items: [], updated_at: "" },
    admin_menu: { categories: [], items: [], updated_at: "" },
    deleted_request_ids: [],
    trackedStockItems: [],
    appliedStockImageHashes: [],
    table_orders: [],
    messages: [],
    androidPermissions: {
      "device-admin": {
        role: "admin",
        is_active: true,
        permissions: [
          "customer.manage",
          "finance.view",
          "room_folio.view",
          "market.product.view"
        ]
      },
      "device-staff": {
        role: "staff",
        is_active: true,
        permissions: []
      },
      "device-other": {
        role: "admin",
        is_active: true,
        permissions: ["finance.view"]
      },
      "device-test": {
        role: "staff",
        is_active: true,
        permissions: []
      }
    },
    finance: {
      generated_at: "2026-09-20T00:00:00Z",
      currency: "TRY",
      today_income_minor: 1000,
      today_expense_minor: 100,
      today_net_minor: 900,
      outstanding_pension_minor: 300,
      recent_entries: []
    },
    reports: {},
    market: {
      ...emptyAndroidMarketSnapshot(),
      products: []
    },
    updated_at: "2026-09-20T00:00:00Z"
  };
}

function assertProjection() {
  const source = baseSnapshot();

  const staff = projectLocalAndroidSnapshotForDevice(source, "device-staff");
  assert.equal(Object.keys(staff.androidPermissions).length, 1);
  assert.equal(staff.androidPermissions["device-staff"].role, "staff");
  assert.deepEqual(staff.customers, []);
  assert.deepEqual(staff.customer_room_stays, []);
  assert.deepEqual(staff.room_folios, []);
  assert.equal(staff.finance.today_income_minor, 0);
  assert.deepEqual(staff.reports, {});
  assert.deepEqual(staff.market.products, []);

  const admin = projectLocalAndroidSnapshotForDevice(source, "device-admin");
  assert.equal(Object.keys(admin.androidPermissions).length, 1);
  assert.equal(admin.androidPermissions["device-other"], undefined);
  assert.equal(admin.customers.length, 1);
  assert.equal(admin.customer_room_stays.length, 1);
  assert.equal(admin.room_folios.length, 1);
  assert.equal(admin.finance.today_income_minor, 1000);

  const unknown = projectLocalAndroidSnapshotForDevice(source, "device-unknown");
  assert.equal(unknown.androidPermissions["device-unknown"].is_active, false);
  assert.deepEqual(unknown.requests, []);
  assert.deepEqual(unknown.rooms, []);
  assert.deepEqual(unknown.market.products, []);
}

function createPairingTicket({
  syncSecret,
  desktopId,
  deviceId,
  nonce = "0123456789abcdef0123456789abcdef",
  issuedAt = Math.floor(Date.now() / 1000)
}) {
  const payload = {
    v: 1,
    desktop_id: desktopId,
    device_id: deviceId,
    iat: issuedAt,
    exp: issuedAt + 120,
    nonce
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", syncSecret).update(encoded, "utf8").digest("hex");
  return `yalp1.${encoded}.${signature}`;
}

function assertPairingStore() {
  const root = mkdtempSync(join(tmpdir(), "yardimci-local-companion-"));
  const database = new DesktopDatabase({
    appPath: join(process.cwd(), "apps", "desktop-app"),
    userDataPath: root,
    backupPath: join(root, "backups")
  });

  try {
    database.initialize();
    const syncSecret = "ya-local-smoke-secret-123456";
    const desktopId = database.getSyncRuntimeStatus().clientId;
    const pairing = new LocalCompanionPairingService(database, {
      desktopId: () => desktopId,
      syncSecret: () => syncSecret,
      localNetworkEnabled: () => true
    });
    const ticket = createPairingTicket({
      syncSecret,
      desktopId,
      deviceId: "device-local-test"
    });
    const first = pairing.pair({
      pairingTicket: ticket,
      deviceId: "device-local-test",
      deviceName: "Local Test Telefonu",
      appVersion: "0.1.1"
    });
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error(first.message);
    assert.match(first.token, /^yal_[a-f0-9]{64}$/);
    assert.equal(first.approvalRequired, true);
    assert.equal(database.authorizeAndroidLocalCredential("device-local-test", first.token), true);

    const activated = database.setAndroidDeviceActive("device-local-test", true);
    assert.equal(activated.ok, true);
    assert.equal(database.authorizeAndroidLocalCredential("device-local-test", first.token), true);
    assert.equal(database.authorizeAndroidLocalCredential("device-local-test", TOKEN), false);

    const replay = pairing.pair({
      pairingTicket: ticket,
      deviceId: "device-local-test",
      deviceName: "Local Test Telefonu",
      appVersion: "0.1.1"
    });
    assert.equal(replay.ok, false);
    if (replay.ok) throw new Error("Pairing ticket replay unexpectedly succeeded.");
    assert.equal(replay.code, "local_pairing_ticket_replayed");

    const revoked = database.revokeAndroidDevice("device-local-test");
    assert.equal(revoked.ok, true);
    assert.equal(database.authorizeAndroidLocalCredential("device-local-test", first.token), false);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
}

async function assertServer() {
  let appliedAction = null;
  const server = new LocalCompanionServer({
    desktopId: () => "desktop-test-123",
    businessInfo: () => ({
      displayName: "Local Test İşletmesi",
      phone: "05550000000",
      whatsapp: "05550000000"
    }),
    createSummary: (deviceId) => projectLocalAndroidSnapshotForDevice(baseSnapshot(), deviceId),
    applyAction: (action) => {
      appliedAction = action;
      return { ok: true, message: "Applied.", alreadyApplied: false };
    },
    authorize: ({ deviceId, token }) => deviceId === "device-test" && token === TOKEN,
    enabled: () => true,
    pair: ({ pairingTicket, deviceId }) => pairingTicket === "pair-ticket" && deviceId === "device-pair"
      ? {
          ok: true,
          token: TOKEN,
          approvalRequired: true,
          message: "Paired."
        }
      : {
          ok: false,
          code: "local_pairing_ticket_invalid",
          message: "Invalid.",
          statusCode: 401
        }
  });

  const address = await server.start("127.0.0.1", 0);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const status = await fetch(`${base}/local/v1/status`);
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(statusBody.ok, true);
    assert.equal(statusBody.desktop_id, "desktop-test-123");
    assert.equal(statusBody.pairing_required, true);
    assert.equal(statusBody.local_network_enabled, true);

    const denied = await fetch(`${base}/local/v1/summary`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ya-device-id": "device-test",
        "x-ya-local-token": "wrong"
      },
      body: "{}"
    });
    assert.equal(denied.status, 401);

    const summary = await fetch(`${base}/local/v1/summary`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ya-device-id": "device-test",
        "x-ya-local-token": TOKEN
      },
      body: "{}"
    });
    assert.equal(summary.status, 200);
    const summaryBody = await summary.json();
    assert.equal(summaryBody.business.display_name, "Local Test İşletmesi");
    assert.equal(summaryBody.approval_required, false);
    assert.equal(summaryBody.business_capabilities.includes("service.android"), true);
    assert.equal(summaryBody.androidPermissions["device-test"].is_active, true);

    const beforeRevision = summaryBody.server_revision;
    const unchanged = await fetch(`${base}/local/v1/summary`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ya-device-id": "device-test",
        "x-ya-local-token": TOKEN
      },
      body: JSON.stringify({ known_server_revision: beforeRevision })
    });
    assert.equal(unchanged.status, 200);
    const unchangedBody = await unchanged.json();
    assert.equal(unchangedBody.not_modified, true);
    assert.equal(unchangedBody.server_revision, beforeRevision);
    const action = await fetch(`${base}/local/v1/action`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ya-device-id": "device-test",
        "x-ya-local-token": TOKEN
      },
      body: JSON.stringify({
        id: "android_action_local_smoke",
        action_type: "room_update_status",
        payload: { room_id: "room-1", status: "available" }
      })
    });
    assert.equal(action.status, 200);
    const actionBody = await action.json();
    assert.equal(actionBody.status, "applied");
    assert.ok(actionBody.source_revision > beforeRevision);
    assert.equal(appliedAction.device_id, "device-test");

    const pair = await fetch(`${base}/local/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairing_ticket: "pair-ticket",
        device_id: "device-pair",
        device_name: "Pair Telefonu",
        app_version: "0.1.1"
      })
    });
    assert.equal(pair.status, 200);
    const pairBody = await pair.json();
    assert.equal(pairBody.ok, true);
    assert.equal(pairBody.local_token, TOKEN);
    assert.equal(pairBody.approval_required, true);
  } finally {
    await server.stop();
  }
}

function assertMdnsPacket() {
  const packet = buildLocalCompanionMdnsResponse({
    desktopId: "desktop-test-123",
    protocolVersion: 1,
    serviceType: "_yardimciasistan._tcp",
    port: 47831,
    addresses: ["192.168.1.20"]
  });
  const text = packet.toString("latin1");
  assert.ok(text.includes("_yardimciasistan"));
  assert.ok(text.includes("protocol=1"));
  assert.ok(text.includes("desktop_id=desktop-test-123"));
  assert.ok(packet.includes(Buffer.from([192, 168, 1, 20])));
}

assertProjection();
assertPairingStore();
assertMdnsPacket();
await assertServer();
console.log("Local companion server + pairing + mDNS smoke passed.");
