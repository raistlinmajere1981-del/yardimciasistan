import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-android-permission-matrix-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

const deviceId = "android-permission-smoke";

try {
  database.initialize();

  const setupResult = database.saveInitialSetup({
    businessName: "Permission Matrix Test İşletmesi",
    profileId: "pension_restaurant",
    phone: "+905550009900",
    whatsapp: "+905550009900",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "permission-matrix-secret-123",
    autoSyncEnabled: false,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiModel: "",
    aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1",
    aiTimeoutSeconds: 30,
    aiApiKey: "",
    clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: true },
  });
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  seedSmokeBusinessLayout(database.databasePath, { roomCount: 1 });

  const room = database.getDashboardData().rooms.find((item) => item.isActive);
  assert.ok(room, "Permission smoke needs an active room.");

  const firstAction = database.applyAndroidAction(action(
    "android_permission_pending_001",
    "room_status_update",
    { room_id: room.id, status: room.status === "maintenance" ? "cleaning" : "maintenance" }
  ));
  assert.equal(firstAction.ok, false, "A newly discovered Android device must not be operational before approval.");
  assert.match(firstAction.message, /pasifleştirilmiş|onay/i);

  let device = database.getAndroidDevices().find((item) => item.deviceId === deviceId);
  assert.ok(device);
  assert.equal(device.role, "staff");
  assert.equal(device.isActive, false);
  assert.equal(device.permissions.includes("room.update_status"), true, "Default staff permissions remain stored while device awaits approval.");

  const approval = database.setAndroidDeviceActive(deviceId, true);
  assert.equal(approval.ok, true, approval.message);
  device = approval.devices.find((item) => item.deviceId === deviceId);
  assert.equal(device?.isActive, true);

  const currentRoom = database.getDashboardData().rooms.find((item) => item.id === room.id);
  const nextRoomStatus = currentRoom.status === "maintenance" ? "cleaning" : "maintenance";
  const allowedStaffRoomUpdate = database.applyAndroidAction(action(
    "android_permission_staff_room_001",
    "room_status_update",
    { room_id: room.id, status: nextRoomStatus, expected_updated_at: currentRoom.updatedAt }
  ));
  assert.equal(allowedStaffRoomUpdate.ok, true, allowedStaffRoomUpdate.message);

  const request = database.createManualRequest({
    requestType: "general_info",
    customerName: "Permission Smoke Misafir",
    customerPhone: "+905550009901",
    dateText: "",
    startDate: "",
    endDate: "",
    time: "",
    guestCount: 1,
    adultCount: 0,
    childCount: 0,
    message: "Android izin smoke talebi",
    priority: "normal"
  });
  assert.equal(request.ok, true);

  const deniedStaffDelete = database.applyAndroidAction(action(
    "android_permission_staff_delete_001",
    "customer_request_delete",
    { request_id: request.savedId }
  ));
  assert.equal(deniedStaffDelete.ok, false);
  assert.match(deniedStaffDelete.message, /yalnız yönetici|yetkisi yok/i);
  assert.equal(database.getDashboardData().requests.some((item) => item.id === request.savedId), true);

  const admin = database.setAndroidDeviceRole(deviceId, "admin");
  assert.equal(admin.ok, true, admin.message);
  device = admin.devices.find((item) => item.deviceId === deviceId);
  assert.equal(device?.isActive, true);
  assert.equal(device?.role, "admin");
  assert.equal(device?.permissions.includes("request.delete"), true);

  const allowedAdminDelete = database.applyAndroidAction(action(
    "android_permission_admin_delete_001",
    "customer_request_delete",
    { request_id: request.savedId }
  ));
  assert.equal(allowedAdminDelete.ok, true, allowedAdminDelete.message);
  assert.equal(database.getDashboardData().requests.some((item) => item.id === request.savedId), false);

  const revoked = database.revokeAndroidDevice(deviceId);
  assert.equal(revoked.ok, true, revoked.message);
  device = revoked.devices.find((item) => item.deviceId === deviceId);
  assert.equal(device?.isActive, false);
  assert.ok(device?.revokedAt);

  const roomAfterAdmin = database.getDashboardData().rooms.find((item) => item.id === room.id);
  const deniedRevoked = database.applyAndroidAction(action(
    "android_permission_revoked_001",
    "room_status_update",
    { room_id: room.id, status: roomAfterAdmin.status === "maintenance" ? "cleaning" : "maintenance" }
  ));
  assert.equal(deniedRevoked.ok, false);
  assert.match(deniedRevoked.message, /pasifleştirilmiş|onay/i);

  console.log("android-permission-matrix-smoke-ok: pending → approved staff → admin → revoked boundaries verified");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}

function action(id, actionType, payload) {
  const now = new Date().toISOString();
  return {
    id,
    action_type: actionType,
    payload,
    created_at: now,
    device_id: deviceId,
    device_name: "Permission Matrix Smoke",
    app_version: "0.1.2-smoke",
    last_seen_at: now,
    status: "pending",
    error_message: "",
    processed_at: ""
  };
}
