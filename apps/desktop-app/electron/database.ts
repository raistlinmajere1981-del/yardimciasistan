import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createId, normalizePhone } from "@yardimci-asistan/shared";
import {
  ANDROID_ADMIN_PERMISSIONS,
  ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS,
  ANDROID_PERMISSION_GROUP_IDS,
  ANDROID_PERMISSIONS,
  ANDROID_STAFF_PERMISSIONS,
  androidPermissionsForGroups,
  resolveAndroidActionPermission
} from "@yardimci-asistan/sync-core";
import type {
  AndroidDeviceRole,
  AndroidDeviceSighting,
  AndroidPermission,
  AndroidPermissionGroups,
  AndroidSnapshotPermissionProfile,
  AndroidSyncAction,
  PublishedQrMenu,
  PushAiSettingsResult,
  SyncedCustomerRequest
} from "@yardimci-asistan/sync-core";

export interface DesktopDatabaseOptions {
  appPath: string;
  userDataPath: string;
}

export interface DashboardSummary {
  newRequests: number;
  waitingRequests: number;
  pendingDailyTasks: number;
  availableRooms: number;
  totalRooms: number;
  availableTables: number;
  pendingReservations: number;
  preparedWhatsAppMessages: number;
  activeMenuCategories: number;
  availableMenuItems: number;
}

export interface DesktopRoom {
  id: string;
  name: string;
  number: string;
  capacity: number;
  bedInfo: string;
  floor: string;
  status: string;
  features: string[];
  description: string;
  priceNote: string;
  isActive: boolean;
  sortOrder: number;
  activeReservationTitle: string;
  updatedAt: string;
}

export interface DesktopTable {
  id: string;
  name: string;
  area: string;
  capacity: number;
  status: string;
  currentCustomerId: string;
  currentReservationId: string;
  activeReservationTitle: string;
  notes: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface DesktopReservation {
  id: string;
  requestId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  reservationType: string;
  status: string;
  title: string;
  startDate: string;
  endDate: string;
  time: string;
  guestCount: number;
  adultCount: number;
  childCount: number;
  roomIds: string[];
  tableIds: string[];
  notes: string;
  priceNote: string;
  paymentStatus: string;
  updatedAt: string;
}

export interface DesktopDailyTask {
  id: string;
  title: string;
  description: string;
  taskType: string;
  status: string;
  dueDate: string;
  dueTime: string;
  relatedType: string;
  relatedId: string;
  updatedAt: string;
}

export interface DesktopCustomer {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  source: string;
  notes: string;
  tags: string[];
  lastContactAt: string;
  requestCount: number;
  reservationCount: number;
  updatedAt: string;
}

export interface DesktopPreparedMessage {
  id: string;
  requestId: string;
  customerName: string;
  customerPhone: string;
  message: string;
  status: string;
  updatedAt: string;
}

export interface DesktopAndroidDevice {
  id: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  role: AndroidDeviceRole;
  isActive: boolean;
  permissionGroups: AndroidPermissionGroups;
  permissions: AndroidPermission[];
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  revokedAt: string;
}

export type DesktopAndroidDeviceMutationResult =
  | { ok: true; message: string; devices: DesktopAndroidDevice[] }
  | { ok: false; message: string; devices: DesktopAndroidDevice[] };

export interface DesktopDashboardData {
  databasePath: string;
  backupPath: string;
  webModuleUrl: string;
  requests: SyncedCustomerRequest[];
  rooms: DesktopRoom[];
  tables: DesktopTable[];
  reservations: DesktopReservation[];
  dailyTasks: DesktopDailyTask[];
  customers: DesktopCustomer[];
  androidDevices: DesktopAndroidDevice[];
  menu: PublishedQrMenu;
  summary: DashboardSummary;
}

export type DesktopAiService = "openai" | "openrouter" | "groq" | "gemini" | "custom";

export interface AiApiKeyWrite {
  mode: "keep" | "replace" | "clear";
  encryptedValue?: string;
}

export interface DesktopSetupData {
  setupRequired: boolean;
  businessName: string;
  businessType: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  webModuleUrl: string;
  syncSecret: string;
  autoSyncEnabled: boolean;
  aiEnabled: boolean;
  aiProvider: string;
  aiService: DesktopAiService;
  aiProjectName: string;
  aiModel: string;
  aiBaseUrl: string;
  aiTimeoutSeconds: number;
  aiApiKeyConfigured: boolean;
  aiLastPublishedAt: string;
  modules: {
    rooms: boolean;
    tables: boolean;
    qrMenu: boolean;
    whatsapp: boolean;
    android: boolean;
  };
  initialCounts: {
    rooms: number;
    tables: number;
  };
}

export interface SaveInitialSetupInput {
  businessName: string;
  businessType: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  webModuleUrl: string;
  syncSecret: string;
  autoSyncEnabled?: boolean;
  aiEnabled: boolean;
  aiProvider: string;
  aiService: string;
  aiProjectName: string;
  aiModel: string;
  aiBaseUrl: string;
  aiTimeoutSeconds: number;
  aiApiKey: string;
  clearAiApiKey: boolean;
  modules: {
    rooms: boolean;
    tables: boolean;
    qrMenu: boolean;
    whatsapp: boolean;
    android: boolean;
  };
  initialCounts: {
    rooms: number;
    tables: number;
  };
}

export type DesktopSetupSaveResult =
  | {
      ok: true;
      message: string;
      setupData: DesktopSetupData;
      dashboardData: DesktopDashboardData;
      aiWebSync?: PushAiSettingsResult;
    }
  | {
      ok: false;
      message: string;
    };

export interface SaveMenuCategoryInput {
  id?: string;
  name: string;
  description: string;
  is_active: boolean;
  sort_order: number;
}

export interface SaveMenuItemInput {
  id?: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image_url: string;
  is_available: boolean;
  is_featured: boolean;
  allergens: string[];
  tags: string[];
  sort_order: number;
}

export type DesktopMenuSaveResult =
  | {
      ok: true;
      message: string;
      savedId: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export type RequestReservationConversionResult =
  | {
      ok: true;
      message: string;
      reservationId: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface CreateManualRequestInput {
  requestType: string;
  customerName: string;
  customerPhone: string;
  dateText: string;
  startDate: string;
  endDate: string;
  time: string;
  guestCount: number;
  adultCount: number;
  childCount: number;
  message: string;
  priority: string;
}

export type CreateManualRequestResult =
  | {
      ok: true;
      message: string;
      savedId: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface SaveRequestAiSuggestionInput {
  requestId: string;
  summary: string;
  suggestedReply: string;
  missingFields: string[];
}

export type RequestAiSuggestionResult =
  | {
      ok: true;
      message: string;
      requestId: string;
      summary: string;
      suggestedReply: string;
      missingFields: string[];
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export type AiWorkspaceMode = "reply" | "summary" | "daily";

export interface AiWorkspaceHistoryEntry {
  id: string;
  mode: AiWorkspaceMode;
  requestId: string;
  requestLabel: string;
  instructions: string;
  content: string;
  summary: string;
  missingFields: string[];
  provider: string;
  model: string;
  fallback: boolean;
  createdAt: string;
}

export interface GenerateAiWorkspaceInput {
  mode: AiWorkspaceMode;
  requestId: string;
  instructions: string;
}

export type GenerateAiWorkspaceResult =
  | {
      ok: true;
      message: string;
      entry: AiWorkspaceHistoryEntry;
    }
  | {
      ok: false;
      message: string;
    };

export interface SaveAiWorkspaceResultInput {
  mode: AiWorkspaceMode;
  requestId: string;
  content: string;
  summary: string;
  missingFields: string[];
}

export type SaveAiWorkspaceResult =
  | {
      ok: true;
      message: string;
      requestId: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export type DesktopBackupResult =
  | {
      ok: true;
      message: string;
      backupDirectory: string;
      backupFileName: string;
      backupFilePath: string;
      createdAt: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export type DesktopStatusUpdateResult =
  | {
      ok: true;
      message: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface UpdateRequestStatusInput {
  requestId: string;
  status: string;
}

export interface UpdateRoomStatusInput {
  roomId: string;
  status: string;
}

export interface UpdateTableStatusInput {
  tableId: string;
  status: string;
}

export type TableOrderStatus = "open" | "preparing" | "served" | "payment" | "paid" | "cancelled";
export type TableOrderItemStatus = "open" | "preparing" | "served" | "cancelled";

export interface DesktopTableOrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  productName: string;
  unitPrice: number;
  currency: string;
  quantity: number;
  lineTotal: number;
  note: string;
  status: TableOrderItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DesktopTableOrder {
  id: string;
  tableId: string;
  tableName: string;
  status: TableOrderStatus;
  openedAt: string;
  closedAt: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  note: string;
  itemCount: number;
  items: DesktopTableOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AddTableOrderItemInput {
  orderId: string;
  menuItemId: string;
  quantity: number;
  note: string;
}

export interface UpdateTableOrderItemQuantityInput {
  itemId: string;
  quantity: number;
}

export interface UpdateTableOrderItemNoteInput {
  itemId: string;
  note: string;
}

export interface UpdateTableOrderStatusInput {
  orderId: string;
  status: string;
}

export type DesktopTableOrderResult =
  | {
      ok: true;
      message: string;
      order: DesktopTableOrder;
      dashboardData?: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface UpdateReservationStatusInput {
  reservationId: string;
  status: string;
}

export interface UpdateDailyTaskStatusInput {
  taskId: string;
  status: string;
}

export interface MarkWhatsAppMessageSentInput {
  requestId: string;
  message: string;
}

export interface RecordSyncEventInput {
  direction: string;
  entityType: string;
  ok: boolean;
  recordCount?: number;
  message?: string;
  status?: number;
}

export type DesktopSyncJobType = "menu_publish" | "android_snapshot";

export interface DesktopSyncJob {
  jobKey: string;
  jobType: DesktopSyncJobType;
  sourceRevision: number;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string;
  updatedAt: string;
}

export interface DesktopSyncRuntimeStatus {
  enabled: boolean;
  clientId: string;
  requestCursor: number;
  acknowledgedCursor: number;
  lastAttemptAt: string;
  lastSuccessAt: string;
  lastError: string;
  consecutiveFailures: number;
  pendingJobs: number;
  nextRetryAt: string;
}

export type ApplyAndroidActionResult =
  | {
      ok: true;
      message: string;
      alreadyApplied: boolean;
    }
  | {
      ok: false;
      message: string;
    };

type AndroidActionMutationResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export class DesktopDatabase {
  private readonly db: DatabaseSync;
  readonly databasePath: string;
  readonly userDataPath: string;
  readonly backupPath: string;

  constructor(private readonly options: DesktopDatabaseOptions) {
    fs.mkdirSync(options.userDataPath, { recursive: true });
    this.userDataPath = options.userDataPath;
    this.backupPath = path.join(options.userDataPath, "backups");
    fs.mkdirSync(this.backupPath, { recursive: true });
    this.databasePath = path.join(options.userDataPath, "yardimci-asistan.sqlite");
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
  }

  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    for (const migration of this.readSqlFiles("db/migrations")) {
      const alreadyApplied = this.db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(migration.name);
      if (alreadyApplied) {
        continue;
      }

      this.db.exec("BEGIN");
      try {
        this.db.exec(migration.sql);
        this.db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migration.name, new Date().toISOString());
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }

    const needsDemoSeed = this.getCount("business") === 0 || this.getCount("menu_categories") === 0 || this.getCount("menu_items") === 0;
    if (needsDemoSeed) {
      for (const seed of this.readSqlFiles("db/seeds")) {
        this.db.exec(seed.sql);
      }
    }

    this.ensureSyncClientId();
  }

  getDashboardData(): DesktopDashboardData {
    const settings = this.db.prepare("SELECT web_module_url FROM settings LIMIT 1").get() as { web_module_url?: string } | undefined;

    return {
      databasePath: this.databasePath,
      backupPath: this.backupPath,
      webModuleUrl: settings?.web_module_url ?? "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
      requests: this.getRequests(),
      rooms: this.getRooms(),
      tables: this.getTables(),
      reservations: this.getReservations(),
      dailyTasks: this.getDailyTasks(),
      customers: this.getCustomers(),
      androidDevices: this.getAndroidDevices(),
      summary: {
        newRequests: this.getScalarCount("SELECT COUNT(*) as count FROM requests WHERE status = 'new' AND deleted_at = ''"),
        waitingRequests: this.getScalarCount("SELECT COUNT(*) as count FROM requests WHERE status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress') AND deleted_at = ''"),
        pendingDailyTasks: this.getScalarCount("SELECT COUNT(*) as count FROM daily_tasks WHERE status = 'pending' AND deleted_at = ''"),
        availableRooms: this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE status = 'available' AND is_active = 1 AND deleted_at = ''"),
        totalRooms: this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE is_active = 1 AND deleted_at = ''"),
        availableTables: this.getScalarCount("SELECT COUNT(*) as count FROM tables WHERE status = 'available' AND is_active = 1 AND deleted_at = ''"),
        pendingReservations: this.getScalarCount("SELECT COUNT(*) as count FROM reservations WHERE status = 'pending' AND deleted_at = ''"),
        preparedWhatsAppMessages: this.getScalarCount(`
          SELECT COUNT(*) as count
          FROM whatsapp_messages
          LEFT JOIN requests ON requests.id = whatsapp_messages.request_id AND requests.deleted_at = ''
          WHERE whatsapp_messages.direction = 'outgoing'
            AND whatsapp_messages.status = 'prepared'
            AND whatsapp_messages.deleted_at = ''
            AND (
              requests.id IS NULL
              OR requests.status NOT IN ('answered', 'rejected', 'cancelled', 'archived', 'converted_to_reservation')
            )
        `),
        activeMenuCategories: this.getScalarCount("SELECT COUNT(*) as count FROM menu_categories WHERE is_active = 1 AND deleted_at = ''"),
        availableMenuItems: this.getScalarCount(`
          SELECT COUNT(*) as count
          FROM menu_items
          INNER JOIN menu_categories ON menu_categories.id = menu_items.category_id
          WHERE menu_items.is_available = 1
            AND menu_items.deleted_at = ''
            AND menu_categories.is_active = 1
            AND menu_categories.deleted_at = ''
        `)
      },
      menu: this.getPublishedMenu()
    };
  }

  getAndroidDevices(): DesktopAndroidDevice[] {
    const rows = this.db
      .prepare(`
        SELECT *
        FROM android_devices
        ORDER BY is_active DESC, last_seen_at DESC, device_name ASC, device_id ASC
      `)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const role = normalizeAndroidDeviceRole(row.role);
      return {
        id: String(row.id ?? ""),
        deviceId: String(row.device_id ?? ""),
        deviceName: String(row.device_name ?? ""),
        appVersion: String(row.app_version ?? ""),
        role,
        isActive: Number(row.is_active ?? 0) === 1 && !String(row.revoked_at ?? "").trim(),
        permissionGroups: parseStoredAndroidPermissionGroups(row.permission_groups_json),
        permissions: effectiveAndroidPermissions(role, row.permissions_json),
        firstSeenAt: String(row.first_seen_at ?? ""),
        lastSeenAt: String(row.last_seen_at ?? ""),
        createdAt: String(row.created_at ?? ""),
        updatedAt: String(row.updated_at ?? ""),
        revokedAt: String(row.revoked_at ?? "")
      };
    });
  }

  getAndroidPermissionSnapshot(): Record<string, AndroidSnapshotPermissionProfile> {
    return Object.fromEntries(this.getAndroidDevices().map((device) => [
      device.deviceId,
      {
        role: device.role,
        is_active: device.isActive,
        permissions: device.permissions
      }
    ]));
  }

  upsertAndroidDeviceSightings(sightings: AndroidDeviceSighting[]): number {
    if (!Array.isArray(sightings) || sightings.length === 0) {
      return 0;
    }
    const now = new Date().toISOString();
    const statement = this.db.prepare(`
      INSERT INTO android_devices (
        id, device_id, device_name, app_version, role, is_active, permissions_json, permission_groups_json,
        first_seen_at, last_seen_at, created_at, updated_at, revoked_at
      ) VALUES (?, ?, ?, ?, 'staff', 1, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(device_id) DO UPDATE SET
        device_name = CASE WHEN excluded.device_name != '' THEN excluded.device_name ELSE android_devices.device_name END,
        app_version = CASE WHEN excluded.app_version != '' THEN excluded.app_version ELSE android_devices.app_version END,
        last_seen_at = CASE
          WHEN excluded.last_seen_at > android_devices.last_seen_at THEN excluded.last_seen_at
          ELSE android_devices.last_seen_at
        END,
        updated_at = CASE
          WHEN (excluded.device_name != '' AND excluded.device_name != android_devices.device_name)
            OR (excluded.app_version != '' AND excluded.app_version != android_devices.app_version)
            OR excluded.last_seen_at > android_devices.last_seen_at
          THEN excluded.updated_at
          ELSE android_devices.updated_at
        END
    `);
    let changed = 0;
    this.db.exec("BEGIN");
    try {
      for (const sighting of sightings) {
        const deviceId = normalizeAndroidDeviceId(sighting?.device_id);
        if (!deviceId) {
          continue;
        }
        const firstSeenAt = normalizeAndroidTimestamp(sighting.first_seen_at, now);
        const lastSeenAt = normalizeAndroidTimestamp(sighting.last_seen_at, firstSeenAt);
        const result = statement.run(
          createId("android_device_"),
          deviceId,
          String(sighting.device_name ?? "").trim().slice(0, 160),
          String(sighting.app_version ?? "").trim().slice(0, 80),
          JSON.stringify(ANDROID_STAFF_PERMISSIONS),
          JSON.stringify(ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS),
          firstSeenAt,
          lastSeenAt,
          firstSeenAt,
          now
        );
        changed += Number(result.changes ?? 0);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return changed;
  }

  setAndroidDeviceRole(deviceIdInput: string, roleInput: string): DesktopAndroidDeviceMutationResult {
    const deviceId = normalizeAndroidDeviceId(deviceIdInput);
    const role = normalizeAndroidDeviceRoleInput(roleInput);
    if (!deviceId || !role) {
      return { ok: false, message: "Telefon rolü için geçerli bir cihaz ve profil seçin.", devices: this.getAndroidDevices() };
    }
    const row = this.db
      .prepare("SELECT permission_groups_json FROM android_devices WHERE device_id = ?")
      .get(deviceId) as { permission_groups_json?: unknown } | undefined;
    if (!row) {
      return { ok: false, message: "Telefon kaydı bulunamadı.", devices: this.getAndroidDevices() };
    }
    const groups = parseStoredAndroidPermissionGroups(row.permission_groups_json);
    const permissions = role === "admin"
      ? androidPermissionsForRole("admin")
      : androidPermissionsForGroups(groups);
    const now = new Date().toISOString();
    const result = this.db
      .prepare(`
        UPDATE android_devices
        SET role = ?, permissions_json = ?, updated_at = ?
        WHERE device_id = ?
      `)
      .run(role, JSON.stringify(permissions), now, deviceId);
    return Number(result.changes) === 1
      ? { ok: true, message: role === "admin" ? "Telefon yönetici yapıldı." : "Telefon personel yapıldı.", devices: this.getAndroidDevices() }
      : { ok: false, message: "Telefon kaydı bulunamadı.", devices: this.getAndroidDevices() };
  }

  setAndroidDevicePermissionGroups(deviceIdInput: string, groupsInput: unknown): DesktopAndroidDeviceMutationResult {
    const deviceId = normalizeAndroidDeviceId(deviceIdInput);
    const groups = normalizeAndroidPermissionGroupsInput(groupsInput);
    if (!deviceId || !groups) {
      return { ok: false, message: "Telefon görev alanları için geçerli seçimler yapın.", devices: this.getAndroidDevices() };
    }
    const row = this.db
      .prepare("SELECT role FROM android_devices WHERE device_id = ?")
      .get(deviceId) as { role?: unknown } | undefined;
    if (!row) {
      return { ok: false, message: "Telefon kaydı bulunamadı.", devices: this.getAndroidDevices() };
    }
    if (normalizeAndroidDeviceRole(row.role) === "admin") {
      return { ok: false, message: "Yönetici cihazlarda tüm yetkiler açıktır.", devices: this.getAndroidDevices() };
    }
    const result = this.db
      .prepare(`
        UPDATE android_devices
        SET permission_groups_json = ?, permissions_json = ?, updated_at = ?
        WHERE device_id = ?
      `)
      .run(
        JSON.stringify(groups),
        JSON.stringify(androidPermissionsForGroups(groups)),
        new Date().toISOString(),
        deviceId
      );
    return Number(result.changes) === 1
      ? { ok: true, message: "Telefon görev alanları güncellendi.", devices: this.getAndroidDevices() }
      : { ok: false, message: "Telefon kaydı bulunamadı.", devices: this.getAndroidDevices() };
  }

  setAndroidDeviceActive(deviceIdInput: string, active: boolean): DesktopAndroidDeviceMutationResult {
    const deviceId = normalizeAndroidDeviceId(deviceIdInput);
    if (!deviceId) {
      return { ok: false, message: "Geçerli bir telefon seçin.", devices: this.getAndroidDevices() };
    }
    const now = new Date().toISOString();
    const result = this.db
      .prepare(`
        UPDATE android_devices
        SET is_active = ?, revoked_at = CASE WHEN ? = 1 THEN NULL ELSE revoked_at END, updated_at = ?
        WHERE device_id = ?
      `)
      .run(active ? 1 : 0, active ? 1 : 0, now, deviceId);
    return Number(result.changes) === 1
      ? { ok: true, message: active ? "Telefon yeniden aktif edildi." : "Telefon pasifleştirildi.", devices: this.getAndroidDevices() }
      : { ok: false, message: "Telefon kaydı bulunamadı.", devices: this.getAndroidDevices() };
  }

  resetAndroidDevicePermissions(deviceIdInput: string): DesktopAndroidDeviceMutationResult {
    const deviceId = normalizeAndroidDeviceId(deviceIdInput);
    const row = deviceId
      ? this.db.prepare("SELECT role FROM android_devices WHERE device_id = ?").get(deviceId) as { role?: unknown } | undefined
      : undefined;
    if (!deviceId || !row) {
      return { ok: false, message: "Telefon kaydı bulunamadı.", devices: this.getAndroidDevices() };
    }
    const role = normalizeAndroidDeviceRole(row.role);
    const groups = { ...ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS };
    this.db
      .prepare("UPDATE android_devices SET permission_groups_json = ?, permissions_json = ?, updated_at = ? WHERE device_id = ?")
      .run(
        JSON.stringify(groups),
        JSON.stringify(role === "admin" ? androidPermissionsForRole("admin") : androidPermissionsForGroups(groups)),
        new Date().toISOString(),
        deviceId
      );
    return { ok: true, message: "Telefon görev alanları varsayılana döndürüldü.", devices: this.getAndroidDevices() };
  }

  revokeAndroidDevice(deviceIdInput: string): DesktopAndroidDeviceMutationResult {
    const deviceId = normalizeAndroidDeviceId(deviceIdInput);
    if (!deviceId) {
      return { ok: false, message: "Geçerli bir telefon seçin.", devices: this.getAndroidDevices() };
    }
    const now = new Date().toISOString();
    const result = this.db
      .prepare("UPDATE android_devices SET is_active = 0, revoked_at = ?, updated_at = ? WHERE device_id = ?")
      .run(now, now, deviceId);
    return Number(result.changes) === 1
      ? { ok: true, message: "Telefon kaldırıldı ve erişimi kapatıldı.", devices: this.getAndroidDevices() }
      : { ok: false, message: "Telefon kaydı bulunamadı.", devices: this.getAndroidDevices() };
  }

  getAndroidPreparedMessages(): DesktopPreparedMessage[] {
    const rows = this.db
      .prepare(`
        SELECT
          whatsapp_messages.id,
          whatsapp_messages.request_id,
          COALESCE(NULLIF(customers.full_name, ''), NULLIF(requests.customer_name, ''), 'Misafir') AS customer_name,
          COALESCE(NULLIF(whatsapp_messages.phone, ''), NULLIF(customers.phone, ''), requests.customer_phone, '') AS customer_phone,
          whatsapp_messages.message,
          whatsapp_messages.status,
          whatsapp_messages.updated_at
        FROM whatsapp_messages
        LEFT JOIN requests ON requests.id = whatsapp_messages.request_id AND requests.deleted_at = ''
        LEFT JOIN customers ON customers.id = whatsapp_messages.customer_id AND customers.deleted_at = ''
        WHERE whatsapp_messages.direction = 'outgoing'
          AND whatsapp_messages.status = 'prepared'
          AND whatsapp_messages.deleted_at = ''
          AND (
            requests.id IS NULL
            OR requests.status NOT IN ('answered', 'rejected', 'cancelled', 'archived', 'converted_to_reservation')
          )
        ORDER BY whatsapp_messages.updated_at DESC, whatsapp_messages.created_at DESC
        LIMIT 300
      `)
      .all() as Array<Record<string, unknown>>;
    const messages: DesktopPreparedMessage[] = rows.map((row) => ({
      id: String(row.id ?? ""),
      requestId: String(row.request_id ?? ""),
      customerName: String(row.customer_name ?? "Misafir"),
      customerPhone: String(row.customer_phone ?? ""),
      message: String(row.message ?? ""),
      status: String(row.status ?? "prepared"),
      updatedAt: String(row.updated_at ?? "")
    }));

    const requestIdsWithMessage = new Set(
      (this.db
        .prepare("SELECT request_id FROM whatsapp_messages WHERE direction = 'outgoing' AND request_id != '' AND deleted_at = ''")
        .all() as Array<{ request_id?: string }>)
        .map((row) => String(row.request_id ?? ""))
    );
    for (const request of this.getRequests()) {
      if (messages.length >= 300 || requestIdsWithMessage.has(request.id)
          || ["answered", "rejected", "cancelled", "archived", "converted_to_reservation"].includes(request.status)) {
        continue;
      }
      const message = String(request.ai_suggested_reply || request.whatsapp_message || "").trim();
      if (!message) {
        continue;
      }
      messages.push({
        id: `message_${request.id}`,
        requestId: request.id,
        customerName: request.customer_name,
        customerPhone: request.customer_phone,
        message,
        status: "prepared",
        updatedAt: request.updated_at
      });
    }
    return messages;
  }

  applyAndroidAction(action: AndroidSyncAction): ApplyAndroidActionResult {
    const actionId = String(action.id ?? "").trim();
    const actionType = String(action.action_type ?? "").trim();
    const deviceId = String(action.device_id ?? "").trim();
    if (!actionId || !actionType || !deviceId || !action.payload || typeof action.payload !== "object" || Array.isArray(action.payload)) {
      return { ok: false, message: "Telefon işlemi eksik veya geçersiz." };
    }

    try {
      this.upsertAndroidDeviceSightings([{
        device_id: deviceId,
        device_name: String(action.device_name ?? ""),
        app_version: String(action.app_version ?? ""),
        first_seen_at: action.created_at,
        last_seen_at: action.last_seen_at || new Date().toISOString()
      }]);
    } catch {
      return { ok: false, message: "Telefon kaydı masaüstünde hazırlanamadı." };
    }

    const existingReceipt = this.db.prepare("SELECT id FROM android_action_receipts WHERE id = ?").get(actionId);
    if (existingReceipt) {
      return {
        ok: true,
        message: "Telefon işlemi daha önce uygulanmış.",
        alreadyApplied: true
      };
    }

    const now = new Date().toISOString();
    let transactionStarted = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      transactionStarted = true;
      const concurrentReceipt = this.db.prepare("SELECT id FROM android_action_receipts WHERE id = ?").get(actionId);
      if (concurrentReceipt) {
        this.db.exec("COMMIT");
        transactionStarted = false;
        return {
          ok: true,
          message: "Telefon işlemi daha önce uygulanmış.",
          alreadyApplied: true
        };
      }

      const authorization = this.authorizeAndroidActionInTransaction(action);
      if (!authorization.ok) {
        this.db.exec("ROLLBACK");
        transactionStarted = false;
        return authorization;
      }

      const result = this.applyAndroidActionInTransaction(action, now);
      if (!result.ok) {
        this.db.exec("ROLLBACK");
        transactionStarted = false;
        return result;
      }

      this.db
        .prepare("INSERT INTO android_action_receipts (id, action_type, device_id, applied_at) VALUES (?, ?, ?, ?)")
        .run(actionId, actionType, deviceId, now);
      this.db.exec("COMMIT");
      transactionStarted = false;
      return {
        ok: true,
        message: result.message,
        alreadyApplied: false
      };
    } catch {
      if (transactionStarted) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          // Preserve the action failure result even if SQLite already ended the transaction.
        }
      }
      return {
        ok: false,
        message: "Telefon işlemi yerel kayıtlara uygulanamadı. Masaüstünde kayıtları kontrol edip tekrar deneyin."
      };
    }
  }

  updateDailyTaskStatus(input: UpdateDailyTaskStatusInput): DesktopStatusUpdateResult {
    const taskId = input.taskId.trim();
    const status = normalizeStatus(input.status, ["pending", "done", "cancelled", "archived"]);
    if (!taskId || !status) {
      return {
        ok: false,
        message: "Günlük iş için geçerli kayıt ve durum seçilmeli."
      };
    }

    const task = this.db.prepare("SELECT status FROM daily_tasks WHERE id = ? AND deleted_at = ''").get(taskId) as { status?: string } | undefined;
    if (!task) {
      return {
        ok: false,
        message: "Günlük iş bulunamadı."
      };
    }

    const now = new Date().toISOString();
    const eventType = status === "done" ? "task.completed" : status === "cancelled" ? "task.cancelled" : "task.status_changed";
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE daily_tasks SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, taskId);
      this.insertEvent({
        type: eventType,
        entityType: "daily_task",
        entityId: taskId,
        payload: {
          previous_status: String(task.status ?? ""),
          status
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Günlük iş durumu güncellendi.",
      dashboardData: this.getDashboardData()
    };
  }

  updateRequestStatus(input: UpdateRequestStatusInput): DesktopStatusUpdateResult {
    const requestId = input.requestId.trim();
    const status = normalizeStatus(input.status, ["new", "seen", "waiting_owner", "waiting_customer", "approved", "rejected", "answered", "cancelled", "archived"]);
    if (!requestId || !status) {
      return {
        ok: false,
        message: "Talep durumu için geçerli kayıt ve durum seçilmeli."
      };
    }

    const request = this.db.prepare("SELECT status FROM requests WHERE id = ? AND deleted_at = ''").get(requestId) as { status?: string } | undefined;
    if (!request) {
      return {
        ok: false,
        message: "Talep bulunamadı."
      };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE requests SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, requestId);
      if (status === "answered") {
        this.markPreparedWhatsAppMessagesSentInTransaction(requestId, now);
      }
      this.insertEvent({
        type: "request.status_changed",
        entityType: "request",
        entityId: requestId,
        payload: {
          previous_status: String(request.status ?? ""),
          status
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Talep durumu güncellendi.",
      dashboardData: this.getDashboardData()
    };
  }

  markWhatsAppMessageSent(input: MarkWhatsAppMessageSentInput): DesktopStatusUpdateResult {
    const requestId = input.requestId.trim();
    const message = input.message.trim();
    if (!requestId || !message) {
      return {
        ok: false,
        message: "Gönderilen WhatsApp mesajı için talep ve metin bilgisi gerekli."
      };
    }

    const preparedMessage = this.db
      .prepare(`
        SELECT id, message, status
        FROM whatsapp_messages
        WHERE request_id = ?
          AND direction = 'outgoing'
          AND deleted_at = ''
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      .get(requestId) as { id?: string; message?: string; status?: string } | undefined;

    if (!preparedMessage?.id) {
      return {
        ok: false,
        message: "Talebe ait hazır WhatsApp mesajı bulunamadı."
      };
    }

    if (String(preparedMessage.message ?? "").trim() !== message) {
      return {
        ok: false,
        message: "Gönderilen metin yerel AI taslağıyla eşleşmediği için kayıt güncellenmedi."
      };
    }

    if (preparedMessage.status === "sent") {
      return {
        ok: true,
        message: "WhatsApp mesajı daha önce gönderildi olarak kaydedilmiş.",
        dashboardData: this.getDashboardData()
      };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`
          UPDATE whatsapp_messages
          SET mode = 'webview',
              status = 'sent',
              sent_at = ?,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
        .run(now, now, preparedMessage.id);

      this.insertEvent({
        type: "whatsapp.message_sent",
        entityType: "whatsapp_message",
        entityId: preparedMessage.id,
        payload: {
          request_id: requestId,
          mode: "webview",
          user_approved: true
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "WhatsApp mesajı gönderildi olarak kaydedildi.",
      dashboardData: this.getDashboardData()
    };
  }

  updateRoomStatus(input: UpdateRoomStatusInput): DesktopStatusUpdateResult {
    const roomId = input.roomId.trim();
    const status = normalizeStatus(input.status, ["available", "reserved", "occupied", "cleaning", "maintenance"]);
    if (!roomId || !status) {
      return {
        ok: false,
        message: "Oda durumu için geçerli kayıt ve durum seçilmeli."
      };
    }

    const room = this.db.prepare("SELECT status FROM rooms WHERE id = ? AND deleted_at = ''").get(roomId) as { status?: string } | undefined;
    if (!room) {
      return {
        ok: false,
        message: "Oda bulunamadı."
      };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, roomId);
      this.insertEvent({
        type: "room.status_changed",
        entityType: "room",
        entityId: roomId,
        payload: {
          old_status: String(room.status ?? ""),
          new_status: status
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Oda durumu güncellendi.",
      dashboardData: this.getDashboardData()
    };
  }

  updateTableStatus(input: UpdateTableStatusInput): DesktopStatusUpdateResult {
    const tableId = input.tableId.trim();
    const status = normalizeStatus(input.status, ["available", "reserved", "occupied", "bill_waiting", "cleaning"]);
    if (!tableId || !status) {
      return {
        ok: false,
        message: "Masa durumu için geçerli kayıt ve durum seçilmeli."
      };
    }

    const table = this.db.prepare("SELECT status FROM tables WHERE id = ? AND deleted_at = ''").get(tableId) as { status?: string } | undefined;
    if (!table) {
      return {
        ok: false,
        message: "Masa bulunamadı."
      };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE tables SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, tableId);
      this.insertEvent({
        type: "table.status_changed",
        entityType: "table",
        entityId: tableId,
        payload: {
          old_status: String(table.status ?? ""),
          new_status: status
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Masa durumu güncellendi.",
      dashboardData: this.getDashboardData()
    };
  }

  listTableOrders(): DesktopTableOrder[] {
    const rows = this.db
      .prepare(`
        SELECT
          table_orders.*,
          tables.name AS table_name,
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.quantity
              ELSE 0
            END
          ), 0) AS item_count
        FROM table_orders
        INNER JOIN tables ON tables.id = table_orders.table_id
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        GROUP BY table_orders.id
        ORDER BY table_orders.opened_at DESC, table_orders.created_at DESC
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapTableOrderRow(row));
  }

  getActiveTableOrder(tableId: string): DesktopTableOrder | null {
    const normalizedTableId = tableId.trim();
    if (!normalizedTableId) {
      return null;
    }

    const row = this.db
      .prepare(`
        SELECT
          table_orders.*,
          tables.name AS table_name,
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.quantity
              ELSE 0
            END
          ), 0) AS item_count
        FROM table_orders
        INNER JOIN tables ON tables.id = table_orders.table_id
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        WHERE table_orders.table_id = ?
          AND table_orders.status IN ('open', 'preparing', 'served', 'payment')
        GROUP BY table_orders.id
        LIMIT 1
      `)
      .get(normalizedTableId) as Record<string, unknown> | undefined;

    return row ? this.mapTableOrderRow(row) : null;
  }

  openTableOrder(tableId: string): DesktopTableOrderResult {
    const normalizedTableId = tableId.trim();
    if (!normalizedTableId) {
      return { ok: false, message: "Sipariş açmak için geçerli bir masa seçin." };
    }

    const id = createTableOrderId("table_order_");
    const now = new Date().toISOString();
    let tableName = "Masa";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const table = this.db
        .prepare("SELECT id, name, status FROM tables WHERE id = ? AND is_active = 1 AND deleted_at = ''")
        .get(normalizedTableId) as { id?: string; name?: string; status?: string } | undefined;
      if (!table?.id) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Sipariş açılacak aktif masa bulunamadı." };
      }
      tableName = String(table.name ?? "Masa");

      const activeOrder = this.getActiveTableOrder(normalizedTableId);
      if (activeOrder) {
        this.updateTableStatusForOrderInTransaction(
          normalizedTableId,
          activeOrder.status === "payment" ? "bill_waiting" : "occupied",
          activeOrder.id,
          now
        );
        this.db.exec("COMMIT");
        return {
          ok: true,
          message: `${tableName} için açık adisyon gösteriliyor.`,
          order: activeOrder,
          dashboardData: this.getDashboardData()
        };
      }

      this.db
        .prepare(`
          INSERT INTO table_orders (
            id,
            table_id,
            status,
            opened_at,
            closed_at,
            subtotal,
            discount_total,
            total,
            note,
            created_at,
            updated_at
          ) VALUES (?, ?, 'open', ?, '', 0, 0, 0, '', ?, ?)
        `)
        .run(id, normalizedTableId, now, now, now);
      this.updateTableStatusForOrderInTransaction(normalizedTableId, "occupied", id, now);
      this.insertEvent({
        type: "table_order.opened",
        entityType: "table_order",
        entityId: id,
        payload: { table_id: normalizedTableId },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const order = this.getTableOrderById(id);
    if (!order) {
      return { ok: false, message: "Adisyon açıldı ancak yeniden yüklenemedi." };
    }

    return {
      ok: true,
      message: `${tableName} için adisyon açıldı.`,
      order,
      dashboardData: this.getDashboardData()
    };
  }

  addTableOrderItem(input: AddTableOrderItemInput): DesktopTableOrderResult {
    const orderId = input.orderId.trim();
    const menuItemId = input.menuItemId.trim();
    const quantity = normalizeOrderQuantity(input.quantity);
    const note = String(input.note ?? "").trim().slice(0, 500);
    if (!orderId || !menuItemId || !quantity) {
      return { ok: false, message: "Ürün, aktif adisyon ve geçerli adet bilgisi gerekli." };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (!this.isActiveTableOrder(orderId)) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Ürün yalnızca aktif bir adisyona eklenebilir." };
      }

      const menuItem = this.db
        .prepare(`
          SELECT menu_items.id, menu_items.name, menu_items.price, menu_items.currency
          FROM menu_items
          INNER JOIN menu_categories ON menu_categories.id = menu_items.category_id
          WHERE menu_items.id = ?
            AND menu_items.is_available = 1
            AND menu_items.deleted_at = ''
            AND menu_categories.is_active = 1
            AND menu_categories.deleted_at = ''
          LIMIT 1
        `)
        .get(menuItemId) as { id?: string; name?: string; price?: number; currency?: string } | undefined;
      if (!menuItem?.id) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Yalnızca aktif ve mevcut menü ürünleri siparişe eklenebilir." };
      }

      const productName = String(menuItem.name ?? "Ürün").trim() || "Ürün";
      const unitPrice = roundMoney(Number(menuItem.price ?? 0));
      const currency = normalizeTableOrderCurrency(menuItem.currency);
      const orderCurrency = this.db
        .prepare(`
          SELECT currency
          FROM table_order_items
          WHERE order_id = ?
            AND status != 'cancelled'
          ORDER BY created_at ASC
          LIMIT 1
        `)
        .get(orderId) as { currency?: string } | undefined;
      if (orderCurrency?.currency && normalizeTableOrderCurrency(orderCurrency.currency) !== currency) {
        this.db.exec("ROLLBACK");
        return {
          ok: false,
          message: `Bu adisyon ${normalizeTableOrderCurrency(orderCurrency.currency)} para birimiyle açık; ${currency} ürün eklenemez.`
        };
      }

      const existingItem = this.db
        .prepare(`
          SELECT id, quantity
          FROM table_order_items
          WHERE order_id = ?
            AND menu_item_id = ?
            AND product_name = ?
            AND unit_price = ?
            AND currency = ?
            AND note = ?
            AND status = 'open'
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(orderId, menuItemId, productName, unitPrice, currency, note) as { id?: string; quantity?: number } | undefined;

      let itemId: string;
      if (existingItem?.id) {
        itemId = existingItem.id;
        const nextQuantity = Number(existingItem.quantity ?? 0) + quantity;
        if (nextQuantity > 999) {
          this.db.exec("ROLLBACK");
          return { ok: false, message: "Bir sipariş satırındaki ürün adedi 999'u aşamaz." };
        }
        this.db
          .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
          .run(nextQuantity, roundMoney(unitPrice * nextQuantity), now, itemId);
      } else {
        itemId = createTableOrderId("table_order_item_");
        this.db
          .prepare(`
            INSERT INTO table_order_items (
              id,
              order_id,
              menu_item_id,
              product_name,
              unit_price,
              currency,
              quantity,
              line_total,
              note,
              status,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
          `)
          .run(
            itemId,
            orderId,
            menuItemId,
            productName,
            unitPrice,
            currency,
            quantity,
            roundMoney(unitPrice * quantity),
            note,
            now,
            now
          );
      }
      this.recalculateTableOrderTotalInTransaction(orderId, now);
      this.insertEvent({
        type: "table_order.item_added",
        entityType: "table_order",
        entityId: orderId,
        payload: { item_id: itemId, menu_item_id: menuItemId, product_name: productName, quantity, unit_price: unitPrice, currency },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getTableOrderMutationResult(orderId, "Ürün adisyona eklendi.");
  }

  updateTableOrderItemQuantity(input: UpdateTableOrderItemQuantityInput): DesktopTableOrderResult {
    const itemId = input.itemId.trim();
    const quantity = normalizeOrderQuantity(input.quantity);
    if (!itemId || !quantity) {
      return { ok: false, message: "Sipariş satırı için 1 ile 999 arasında bir adet girin." };
    }

    const now = new Date().toISOString();
    let orderId = "";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const item = this.getMutableTableOrderItem(itemId);
      if (!item) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Güncellenecek aktif sipariş satırı bulunamadı." };
      }
      orderId = String(item.order_id);
      const lineTotal = roundMoney(Number(item.unit_price ?? 0) * quantity);
      const updatedAt = nextMutationTimestamp(item.updated_at, now);
      this.db
        .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
        .run(quantity, lineTotal, updatedAt, itemId);
      this.recalculateTableOrderTotalInTransaction(orderId, now);
      this.insertEvent({
        type: "table_order.item_quantity_changed",
        entityType: "table_order",
        entityId: orderId,
        payload: { item_id: itemId, quantity },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getTableOrderMutationResult(orderId, "Ürün adedi güncellendi.");
  }

  updateTableOrderItemNote(input: UpdateTableOrderItemNoteInput): DesktopTableOrderResult {
    const itemId = input.itemId.trim();
    const note = String(input.note ?? "").trim().slice(0, 500);
    const now = new Date().toISOString();
    let orderId = "";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const item = this.getMutableTableOrderItem(itemId);
      if (!item) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Not eklenecek aktif sipariş satırı bulunamadı." };
      }
      orderId = String(item.order_id);
      const updatedAt = nextMutationTimestamp(item.updated_at, now);
      this.db.prepare("UPDATE table_order_items SET note = ?, updated_at = ? WHERE id = ?").run(note, updatedAt, itemId);
      this.db.prepare("UPDATE table_orders SET updated_at = ? WHERE id = ?").run(now, orderId);
      this.insertEvent({
        type: "table_order.item_note_changed",
        entityType: "table_order",
        entityId: orderId,
        payload: { item_id: itemId, has_note: Boolean(note) },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getTableOrderMutationResult(orderId, "Ürün notu kaydedildi.");
  }

  removeTableOrderItem(itemId: string): DesktopTableOrderResult {
    const normalizedItemId = itemId.trim();
    const now = new Date().toISOString();
    let orderId = "";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const item = this.getMutableTableOrderItem(normalizedItemId);
      if (!item) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Silinecek aktif sipariş satırı bulunamadı." };
      }
      orderId = String(item.order_id);
      const updatedAt = nextMutationTimestamp(item.updated_at, now);
      this.db.prepare("UPDATE table_order_items SET status = 'cancelled', updated_at = ? WHERE id = ?").run(updatedAt, normalizedItemId);
      this.recalculateTableOrderTotalInTransaction(orderId, now);
      this.insertEvent({
        type: "table_order.item_removed",
        entityType: "table_order",
        entityId: orderId,
        payload: { item_id: normalizedItemId },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getTableOrderMutationResult(orderId, "Ürün adisyondan kaldırıldı.");
  }

  updateTableOrderStatus(input: UpdateTableOrderStatusInput): DesktopTableOrderResult {
    const orderId = input.orderId.trim();
    const status = normalizeStatus(input.status, TABLE_ORDER_STATUSES) as TableOrderStatus;
    if (!orderId || !status) {
      return { ok: false, message: "Adisyon için geçerli bir durum seçin." };
    }

    if (status === "paid" || status === "cancelled") {
      return this.closeTableOrder({ orderId, status });
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare("SELECT status, table_id FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
        .get(orderId) as { status?: string; table_id?: string } | undefined;
      if (!current) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Durumu güncellenecek aktif adisyon bulunamadı." };
      }

      const updateResult = this.db
        .prepare("UPDATE table_orders SET status = ?, updated_at = ? WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
        .run(status, now, orderId);
      if (Number(updateResult.changes) !== 1) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Adisyon başka bir işlem tarafından güncellendi; yeniden yükleyin." };
      }
      if (status === "preparing") {
        this.db
          .prepare("UPDATE table_order_items SET status = 'preparing', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
          .run(now, orderId);
      } else if (status === "served") {
        this.db
          .prepare("UPDATE table_order_items SET status = 'served', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
          .run(now, orderId);
      }
      this.updateTableStatusForOrderInTransaction(
        String(current.table_id ?? ""),
        status === "payment" ? "bill_waiting" : "occupied",
        orderId,
        now
      );
      this.insertEvent({
        type: "table_order.status_changed",
        entityType: "table_order",
        entityId: orderId,
        payload: { old_status: String(current.status ?? ""), new_status: status },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getTableOrderMutationResult(orderId, "Adisyon durumu güncellendi.", true);
  }

  closeTableOrder(input: UpdateTableOrderStatusInput): DesktopTableOrderResult {
    const orderId = input.orderId.trim();
    const status = normalizeStatus(input.status, ["paid", "cancelled"]) as "paid" | "cancelled";
    if (!orderId || !status) {
      return { ok: false, message: "Adisyon yalnızca ödendi veya iptal durumuyla kapatılabilir." };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare("SELECT status, table_id FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
        .get(orderId) as { status?: string; table_id?: string } | undefined;
      if (!current) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Kapatılacak aktif adisyon bulunamadı." };
      }
      this.recalculateTableOrderTotalInTransaction(orderId, now);
      const updateResult = this.db
        .prepare(`
          UPDATE table_orders
          SET status = ?, closed_at = ?, updated_at = ?
          WHERE id = ?
            AND status IN ('open', 'preparing', 'served', 'payment')
        `)
        .run(status, now, now, orderId);
      if (Number(updateResult.changes) !== 1) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Adisyon başka bir işlem tarafından kapatıldı; yeniden yükleyin." };
      }
      this.updateTableStatusForOrderInTransaction(String(current.table_id ?? ""), "available", orderId, now);
      this.insertEvent({
        type: status === "paid" ? "table_order.paid" : "table_order.cancelled",
        entityType: "table_order",
        entityId: orderId,
        payload: { old_status: String(current.status ?? ""), status },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getTableOrderMutationResult(
      orderId,
      status === "paid" ? "Adisyon ödendi olarak kapatıldı." : "Adisyon iptal edildi.",
      true
    );
  }

  recalculateTableOrderTotal(orderId: string): DesktopTableOrderResult {
    const normalizedOrderId = orderId.trim();
    if (!normalizedOrderId) {
      return { ok: false, message: "Toplamı hesaplanacak adisyon bulunamadı." };
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const exists = this.db.prepare("SELECT id FROM table_orders WHERE id = ?").get(normalizedOrderId);
      if (!exists) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Toplamı hesaplanacak adisyon bulunamadı." };
      }
      this.recalculateTableOrderTotalInTransaction(normalizedOrderId, new Date().toISOString());
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getTableOrderMutationResult(normalizedOrderId, "Adisyon toplamı güncellendi.");
  }

  updateReservationStatus(input: UpdateReservationStatusInput): DesktopStatusUpdateResult {
    const reservationId = input.reservationId.trim();
    const status = normalizeStatus(input.status, ["pending", "approved", "rejected", "cancelled", "completed"]);
    if (!reservationId || !status) {
      return {
        ok: false,
        message: "Rezervasyon durumu için geçerli kayıt ve durum seçilmeli."
      };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const reservation = this.db
        .prepare("SELECT * FROM reservations WHERE id = ? AND deleted_at = ''")
        .get(reservationId) as Record<string, unknown> | undefined;
      if (!reservation) {
        this.db.exec("ROLLBACK");
        return {
          ok: false,
          message: "Rezervasyon bulunamadı."
        };
      }

      const roomIds = this.parseStringArray(reservation.room_ids_json);
      const tableIds = this.parseStringArray(reservation.table_ids_json);
      if (this.findActiveOrderForTables(tableIds)) {
        this.db.exec("ROLLBACK");
        return {
          ok: false,
          message: "Aktif adisyonu olan masaya bağlı rezervasyon değiştirilemez. Önce adisyonu kapatın."
        };
      }

      this.db.prepare("UPDATE reservations SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, reservationId);

      if (status === "approved") {
        for (const roomId of roomIds) {
          this.db.prepare("UPDATE rooms SET status = 'reserved', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''").run(now, roomId);
        }
        for (const tableId of tableIds) {
          this.db
            .prepare("UPDATE tables SET status = 'reserved', current_reservation_id = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
            .run(reservationId, now, tableId);
        }
      }

      if (["rejected", "cancelled", "completed"].includes(status)) {
        for (const roomId of roomIds) {
          this.db.prepare("UPDATE rooms SET status = 'available', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND status = 'reserved' AND deleted_at = ''").run(now, roomId);
        }
        for (const tableId of tableIds) {
          this.db
            .prepare(`
              UPDATE tables
              SET status = 'available',
                  current_reservation_id = '',
                  updated_at = ?,
                  sync_status = 'local_only'
              WHERE id = ?
                AND current_reservation_id = ?
                AND deleted_at = ''
            `)
            .run(now, tableId, reservationId);
        }
      }

      this.insertEvent({
        type: "reservation.status_changed",
        entityType: "reservation",
        entityId: reservationId,
        payload: {
          previous_status: String(reservation.status ?? ""),
          status,
          room_ids: roomIds,
          table_ids: tableIds
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Rezervasyon durumu güncellendi.",
      dashboardData: this.getDashboardData()
    };
  }

  createManualBackup(): DesktopBackupResult {
    const createdAt = new Date().toISOString();
    const backupFileName = `yardimci-asistan-${createdAt.replace(/[:.]/g, "-")}.sqlite`;
    const backupFilePath = path.join(this.backupPath, backupFileName);

    try {
      fs.mkdirSync(this.backupPath, { recursive: true });
      this.db.exec("PRAGMA wal_checkpoint(FULL);");
      fs.copyFileSync(this.databasePath, backupFilePath);
      this.insertEvent({
        type: "system.backup_created",
        entityType: "backup",
        entityId: backupFileName,
        payload: {
          backup_file_name: backupFileName,
          backup_path: backupFilePath
        },
        now: createdAt
      });

      return {
        ok: true,
      message: "Yerel kayıtların yedeği oluşturuldu.",
        backupDirectory: this.backupPath,
        backupFileName,
        backupFilePath,
        createdAt,
        dashboardData: this.getDashboardData()
      };
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Bilinmeyen hata";
      return {
        ok: false,
        message: `Yedek oluşturulamadı: ${message}`
      };
    }
  }

  getSetupData(): DesktopSetupData {
    const business = this.db.prepare("SELECT * FROM business WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
    const settings = this.db.prepare("SELECT * FROM settings WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
    const modules = this.parseModulesJson(String(business?.modules_json ?? "{}"));
    const syncSecret = String(settings?.sync_secret ?? "");
    const businessName = String(business?.display_name ?? "");
    const setupCompleted = Number(settings?.setup_completed ?? 0) === 1;
    const setupRequired =
      !setupCompleted ||
      !businessName.trim() ||
      syncSecret.length < 12 ||
      syncSecret === "change-this-secret";

    return {
      setupRequired,
      businessName,
      businessType: String(business?.business_type ?? "pension_restaurant"),
      phone: String(business?.phone ?? ""),
      whatsapp: String(business?.whatsapp ?? ""),
      email: String(business?.email ?? ""),
      address: String(business?.address ?? ""),
      webModuleUrl: String(settings?.web_module_url ?? "https://yardimciasistan.alwaysdata.net/yardimci-asistan"),
      syncSecret,
      autoSyncEnabled: Number(settings?.auto_sync_enabled ?? 1) === 1,
      aiEnabled: Number(settings?.ai_enabled ?? 0) === 1,
      aiProvider: String(settings?.ai_provider ?? "openai_compatible") || "openai_compatible",
      aiService: normalizeStoredAiService(settings?.ai_service),
      aiProjectName: String(settings?.ai_project_name ?? ""),
      aiModel: String(settings?.ai_model ?? ""),
      aiBaseUrl: normalizeStoredAiBaseUrl(settings?.ai_base_url),
      aiTimeoutSeconds: normalizeStoredAiTimeout(settings?.ai_timeout_seconds),
      aiApiKeyConfigured: Boolean(String(settings?.ai_api_key_encrypted ?? "").trim()),
      aiLastPublishedAt: normalizeStoredTimestamp(settings?.ai_last_published_at),
      modules: {
        rooms: modules.rooms,
        tables: modules.tables,
        qrMenu: modules.qr_menu,
        whatsapp: Number(settings?.whatsapp_enabled ?? (modules.whatsapp ? 1 : 0)) === 1,
        android: Number(settings?.android_enabled ?? (modules.android ? 1 : 0)) === 1
      },
      initialCounts: {
        rooms: this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE deleted_at = ''"),
        tables: this.getScalarCount("SELECT COUNT(*) as count FROM tables WHERE deleted_at = ''")
      }
    };
  }

  setAutoSyncEnabled(enabled: boolean): DesktopSyncRuntimeStatus {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE settings SET auto_sync_enabled = ?, updated_at = ? WHERE deleted_at = ''")
      .run(enabled ? 1 : 0, now);
    return this.getSyncRuntimeStatus();
  }

  getSyncRuntimeStatus(): DesktopSyncRuntimeStatus {
    const settings = this.db
      .prepare("SELECT auto_sync_enabled, sync_client_id FROM settings WHERE deleted_at = '' LIMIT 1")
      .get() as { auto_sync_enabled?: number; sync_client_id?: string } | undefined;
    const runtime = this.db
      .prepare("SELECT * FROM sync_runtime WHERE id = 'primary'")
      .get() as Record<string, unknown> | undefined;
    const pending = this.db
      .prepare("SELECT COUNT(*) AS count, MIN(NULLIF(next_attempt_at, '')) AS next_retry_at FROM sync_outbox")
      .get() as { count?: number; next_retry_at?: string } | undefined;
    return {
      enabled: Number(settings?.auto_sync_enabled ?? 1) === 1,
      clientId: String(settings?.sync_client_id ?? ""),
      requestCursor: Number(runtime?.request_cursor ?? 0),
      acknowledgedCursor: Number(runtime?.acknowledged_cursor ?? 0),
      lastAttemptAt: String(runtime?.last_attempt_at ?? ""),
      lastSuccessAt: String(runtime?.last_success_at ?? ""),
      lastError: String(runtime?.last_error ?? ""),
      consecutiveFailures: Number(runtime?.consecutive_failures ?? 0),
      pendingJobs: Number(pending?.count ?? 0),
      nextRetryAt: String(pending?.next_retry_at ?? "")
    };
  }

  getPendingSyncJobs(now = new Date().toISOString()): DesktopSyncJob[] {
    const rows = this.db
      .prepare(`
        SELECT job_key, job_type, source_revision, attempt_count, next_attempt_at, last_error, updated_at
        FROM sync_outbox
        WHERE next_attempt_at = '' OR next_attempt_at <= ?
        ORDER BY CASE job_type WHEN 'menu_publish' THEN 0 ELSE 1 END, updated_at ASC
      `)
      .all(now) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      jobKey: String(row.job_key ?? ""),
      jobType: String(row.job_type ?? "") as DesktopSyncJobType,
      sourceRevision: Number(row.source_revision ?? 0),
      attemptCount: Number(row.attempt_count ?? 0),
      nextAttemptAt: String(row.next_attempt_at ?? ""),
      lastError: String(row.last_error ?? ""),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  queueSyncJob(jobType: DesktopSyncJobType, timestamp = new Date().toISOString()) {
    const jobKey = jobType === "menu_publish" ? "menu" : "android_snapshot";
    this.db
      .prepare(`
        INSERT INTO sync_outbox (
          job_key, job_type, source_revision, attempt_count, next_attempt_at,
          last_error, created_at, updated_at
        ) VALUES (?, ?, 1, 0, '', '', ?, ?)
        ON CONFLICT(job_key) DO UPDATE SET
          source_revision = sync_outbox.source_revision + 1,
          attempt_count = 0,
          next_attempt_at = '',
          last_error = '',
          updated_at = excluded.updated_at
      `)
      .run(jobKey, jobType, timestamp, timestamp);
  }

  completeSyncJob(jobKey: string, sourceRevision: number) {
    this.db
      .prepare("DELETE FROM sync_outbox WHERE job_key = ? AND source_revision = ?")
      .run(jobKey, sourceRevision);
  }

  failSyncJob(jobKey: string, sourceRevision: number, errorMessage: string, nextAttemptAt: string) {
    this.db
      .prepare(`
        UPDATE sync_outbox
        SET attempt_count = attempt_count + 1,
            next_attempt_at = ?,
            last_error = ?,
            updated_at = ?
        WHERE job_key = ? AND source_revision = ?
      `)
      .run(nextAttemptAt, errorMessage.slice(0, 1000), new Date().toISOString(), jobKey, sourceRevision);
  }

  recordSyncAttempt(timestamp = new Date().toISOString()) {
    this.db
      .prepare("UPDATE sync_runtime SET last_attempt_at = ?, updated_at = ? WHERE id = 'primary'")
      .run(timestamp, timestamp);
  }

  recordAutomaticSyncSuccess(timestamp = new Date().toISOString()) {
    this.db
      .prepare(`
        UPDATE sync_runtime
        SET last_success_at = ?, last_error = '', consecutive_failures = 0, updated_at = ?
        WHERE id = 'primary'
      `)
      .run(timestamp, timestamp);
  }

  recordAutomaticSyncFailure(message: string, timestamp = new Date().toISOString()) {
    this.db
      .prepare(`
        UPDATE sync_runtime
        SET last_error = ?, consecutive_failures = consecutive_failures + 1, updated_at = ?
        WHERE id = 'primary'
      `)
      .run(message.slice(0, 1000), timestamp);
  }

  acknowledgeRequestCursor(cursor: number, timestamp = new Date().toISOString()) {
    this.db
      .prepare(`
        UPDATE sync_runtime
        SET acknowledged_cursor = MAX(acknowledged_cursor, ?), updated_at = ?
        WHERE id = 'primary'
      `)
      .run(Math.max(0, Math.trunc(cursor)), timestamp);
  }

  getEncryptedAiApiKey(): string {
    const settings = this.db
      .prepare("SELECT ai_api_key_encrypted FROM settings WHERE deleted_at = '' LIMIT 1")
      .get() as { ai_api_key_encrypted?: string } | undefined;

    return String(settings?.ai_api_key_encrypted ?? "").trim();
  }

  markAiSettingsPublished(timestamp: string): DesktopSetupData {
    const publishedAt = normalizePublishedTimestamp(timestamp);
    if (!publishedAt) {
      throw new Error("AI ayarları için geçerli yayın zamanı gerekli.");
    }

    const result = this.db
      .prepare(`
        UPDATE settings
        SET ai_last_published_at = ?,
            updated_at = ?
        WHERE deleted_at = ''
      `)
      .run(publishedAt, new Date().toISOString());

    if (Number(result.changes) === 0) {
      throw new Error("Yayınlandı olarak işaretlenecek AI ayarı bulunamadı.");
    }

    return this.getSetupData();
  }

  saveInitialSetup(input: SaveInitialSetupInput, aiApiKeyWrite: AiApiKeyWrite = { mode: "keep" }): DesktopSetupSaveResult {
    const businessName = input.businessName.trim();
    const syncSecret = input.syncSecret.trim();
    const webModuleUrl = normalizeUrl(input.webModuleUrl);
    const aiProvider = input.aiProvider.trim() || "openai_compatible";
    const aiService = normalizeAiService(input.aiService);
    const aiProjectName = String(input.aiProjectName ?? "").trim();
    const aiModel = input.aiModel.trim();
    const aiBaseUrl = normalizeAiBaseUrl(input.aiBaseUrl);
    const aiTimeoutSeconds = normalizeAiTimeout(input.aiTimeoutSeconds);
    const rawAiApiKeyProvided = Boolean(String(input.aiApiKey ?? "").trim());
    const existingSettings = this.db.prepare("SELECT * FROM settings WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
    const existingEncryptedAiApiKey = String(existingSettings?.ai_api_key_encrypted ?? "").trim();
    const aiApiKeyResolution = resolveEncryptedAiApiKey({
      rawKeyProvided: rawAiApiKeyProvided,
      clearRequested: Boolean(input.clearAiApiKey),
      write: aiApiKeyWrite,
      existingEncryptedValue: existingEncryptedAiApiKey
    });

    if (!businessName) {
      return {
        ok: false,
        message: "Firma adı gerekli."
      };
    }

    if (!input.whatsapp.trim()) {
      return {
        ok: false,
        message: "WhatsApp numarası gerekli."
      };
    }

    if (!webModuleUrl) {
      return {
        ok: false,
        message: "Web modül adresi http veya https ile başlamalı."
      };
    }

    if (syncSecret.length < 12 || syncSecret === "change-this-secret") {
      return {
        ok: false,
        message: "Web güvenlik anahtarı en az 12 karakter olmalı ve varsayılan değer olmamalı."
      };
    }

    if (!aiApiKeyResolution.ok) {
      return aiApiKeyResolution;
    }

    if (input.aiEnabled && aiProvider !== "openai_compatible") {
      return {
        ok: false,
        message: "AI servis sağlayıcı ayarı geçerli değil."
      };
    }

    if (input.aiEnabled && !aiService) {
      return {
        ok: false,
        message: "AI servisi desteklenmiyor."
      };
    }

    if (aiProjectName.length > 120 || /[\x00-\x1F\x7F]/.test(aiProjectName)) {
      return {
        ok: false,
        message: "Google AI Studio proje adı geçersiz."
      };
    }

    if (input.aiEnabled && !aiBaseUrl) {
      return {
        ok: false,
        message: "AI bağlantı adresi http veya https ile başlamalı ve kullanıcı bilgisi içermemeli."
      };
    }

    if (input.aiEnabled && aiService === "gemini" && aiBaseUrl !== GOOGLE_AI_STUDIO_BASE_URL) {
      return {
        ok: false,
        message: "Google AI Studio için resmi Gemini bağlantı adresi kullanılmalı."
      };
    }

    if (input.aiEnabled && !aiModel) {
      return {
        ok: false,
        message: "AI model adı gerekli."
      };
    }

    if (input.aiEnabled && !aiApiKeyResolution.encryptedValue) {
      return {
        ok: false,
        message: "AI güvenlik anahtarı gerekli."
      };
    }

    if (input.aiEnabled && aiTimeoutSeconds === null) {
      return {
        ok: false,
        message: "AI zaman aşımı 5 ile 120 saniye arasında olmalı."
      };
    }

    const now = new Date().toISOString();
    const existingBusiness = this.db.prepare("SELECT id, created_at FROM business WHERE deleted_at = '' LIMIT 1").get() as { id?: string; created_at?: string } | undefined;
    const businessId = existingBusiness?.id || createId("business_");
    const settingsId = String(existingSettings?.id ?? "") || "settings_primary";
    const createdAt = existingBusiness?.created_at || now;
    const settingsCreatedAt = String(existingSettings?.created_at ?? "") || now;
    const storedAiProvider = aiProvider === "openai_compatible" ? aiProvider : "openai_compatible";
    const storedAiService = aiService ?? "openai";
    const storedAiBaseUrl = aiBaseUrl || DEFAULT_AI_BASE_URL;
    const storedAiTimeoutSeconds = aiTimeoutSeconds ?? DEFAULT_AI_TIMEOUT_SECONDS;
    const storedEncryptedAiApiKey = aiApiKeyResolution.encryptedValue;
    const aiSettingsChanged =
      !existingSettings ||
      Number(existingSettings.ai_enabled ?? 0) !== (input.aiEnabled ? 1 : 0) ||
      String(existingSettings.ai_provider ?? "") !== storedAiProvider ||
      String(existingSettings.ai_service ?? "") !== storedAiService ||
      String(existingSettings.ai_project_name ?? "") !== aiProjectName ||
      String(existingSettings.ai_model ?? "") !== aiModel ||
      normalizeStoredAiBaseUrl(existingSettings.ai_base_url) !== storedAiBaseUrl ||
      normalizeStoredAiTimeout(existingSettings.ai_timeout_seconds) !== storedAiTimeoutSeconds ||
      existingEncryptedAiApiKey !== storedEncryptedAiApiKey;
    const aiLastPublishedAt = aiSettingsChanged ? "" : normalizeStoredTimestamp(existingSettings?.ai_last_published_at);
    const modules = {
      rooms: input.modules.rooms,
      tables: input.modules.tables,
      qr_menu: input.modules.qrMenu,
      ai: input.aiEnabled,
      whatsapp: input.modules.whatsapp,
      android: input.modules.android
    };

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`
          INSERT INTO business (
            id,
            name,
            display_name,
            business_type,
            phone,
            whatsapp,
            email,
            address,
            modules_json,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            display_name = excluded.display_name,
            business_type = excluded.business_type,
            phone = excluded.phone,
            whatsapp = excluded.whatsapp,
            email = excluded.email,
            address = excluded.address,
            modules_json = excluded.modules_json,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'local_only'
        `)
        .run(
          businessId,
          slugifyBusinessName(businessName),
          businessName,
          normalizeBusinessType(input.businessType),
          input.phone.trim(),
          input.whatsapp.trim(),
          input.email.trim(),
          input.address.trim(),
          JSON.stringify(modules),
          createdAt,
          now
        );

      this.db
        .prepare(`
          INSERT INTO settings (
            id,
            business_id,
            web_module_url,
            sync_secret,
            auto_sync_enabled,
            ai_enabled,
            ai_provider,
            ai_model,
            ai_service,
            ai_project_name,
            ai_base_url,
            ai_timeout_seconds,
            ai_api_key_encrypted,
            ai_last_published_at,
            whatsapp_enabled,
            whatsapp_mode,
            android_enabled,
            rooms_enabled,
            tables_enabled,
            qr_menu_enabled,
            setup_completed,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'webview', ?, ?, ?, ?, 1, ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            business_id = excluded.business_id,
            web_module_url = excluded.web_module_url,
            sync_secret = excluded.sync_secret,
            auto_sync_enabled = excluded.auto_sync_enabled,
            ai_enabled = excluded.ai_enabled,
            ai_provider = excluded.ai_provider,
            ai_model = excluded.ai_model,
            ai_service = excluded.ai_service,
            ai_project_name = excluded.ai_project_name,
            ai_base_url = excluded.ai_base_url,
            ai_timeout_seconds = excluded.ai_timeout_seconds,
            ai_api_key_encrypted = excluded.ai_api_key_encrypted,
            ai_last_published_at = excluded.ai_last_published_at,
            whatsapp_enabled = excluded.whatsapp_enabled,
            android_enabled = excluded.android_enabled,
            rooms_enabled = excluded.rooms_enabled,
            tables_enabled = excluded.tables_enabled,
            qr_menu_enabled = excluded.qr_menu_enabled,
            setup_completed = 1,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'local_only'
        `)
        .run(
          settingsId,
          businessId,
          webModuleUrl,
          syncSecret,
          input.autoSyncEnabled === false ? 0 : 1,
          input.aiEnabled ? 1 : 0,
          storedAiProvider,
          aiModel,
          storedAiService,
          aiProjectName,
          storedAiBaseUrl,
          storedAiTimeoutSeconds,
          storedEncryptedAiApiKey,
          aiLastPublishedAt,
          input.modules.whatsapp ? 1 : 0,
          input.modules.android ? 1 : 0,
          input.modules.rooms ? 1 : 0,
          input.modules.tables ? 1 : 0,
          input.modules.qrMenu ? 1 : 0,
          settingsCreatedAt,
          now
        );

      this.ensureInitialRooms(normalizeInteger(input.initialCounts.rooms), now);
      this.ensureInitialTables(normalizeInteger(input.initialCounts.tables), now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    if (input.modules.qrMenu) {
      this.queueSyncJob("menu_publish", now);
    }
    if (input.modules.android) {
      this.queueSyncJob("android_snapshot", now);
    }

    return {
      ok: true,
      message: "İlk kurulum ayarları kaydedildi.",
      setupData: this.getSetupData(),
      dashboardData: this.getDashboardData()
    };
  }

  getPublishedMenu(): PublishedQrMenu {
    const categories = this.db
      .prepare(`
        SELECT id, name, description, is_active, sort_order, created_at, updated_at
        FROM menu_categories
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, name ASC
      `)
      .all() as Array<Record<string, unknown>>;

    const items = this.db
      .prepare(`
        SELECT
          id,
          category_id,
          name,
          description,
          price,
          currency,
          image_url,
          is_available,
          is_featured,
          allergens_json,
          tags_json,
          sort_order,
          created_at,
          updated_at
        FROM menu_items
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, name ASC
      `)
      .all() as Array<Record<string, unknown>>;

    const updatedAtRows = [...categories, ...items].map((row) => String(row.updated_at ?? "")).filter(Boolean);
    const updatedAt = updatedAtRows.sort().at(-1) ?? new Date().toISOString();

    return {
      categories: categories.map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        description: String(row.description ?? ""),
        is_active: Number(row.is_active ?? 0) === 1,
        sort_order: Number(row.sort_order ?? 0),
        created_at: String(row.created_at ?? ""),
        updated_at: String(row.updated_at ?? "")
      })),
      items: items.map((row) => ({
        id: String(row.id ?? ""),
        category_id: String(row.category_id ?? ""),
        name: String(row.name ?? ""),
        description: String(row.description ?? ""),
        price: Number(row.price ?? 0),
        currency: String(row.currency ?? "TRY"),
        image_url: String(row.image_url ?? ""),
        is_available: Number(row.is_available ?? 0) === 1,
        is_featured: Number(row.is_featured ?? 0) === 1,
        allergens: this.parseStringArray(row.allergens_json),
        tags: this.parseStringArray(row.tags_json),
        sort_order: Number(row.sort_order ?? 0),
        created_at: String(row.created_at ?? ""),
        updated_at: String(row.updated_at ?? "")
      })),
      updated_at: updatedAt
    };
  }

  upsertRequests(requests: SyncedCustomerRequest[], nextCursor?: number) {
    if (requests.length === 0 && nextCursor === undefined) {
      return;
    }

    const statement = this.db.prepare(`
      INSERT INTO requests (
        id,
        customer_id,
        source,
        request_type,
        status,
        customer_name,
        customer_phone,
        date_text,
        start_date,
        end_date,
        time,
        guest_count,
        adult_count,
        child_count,
        message,
        ai_summary,
        ai_suggested_reply,
        whatsapp_message,
        assigned_to,
        priority,
        created_at,
        updated_at,
        sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        customer_id = excluded.customer_id,
        source = excluded.source,
        request_type = excluded.request_type,
        status = excluded.status,
        customer_name = excluded.customer_name,
        customer_phone = excluded.customer_phone,
        date_text = excluded.date_text,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        time = excluded.time,
        guest_count = excluded.guest_count,
        adult_count = excluded.adult_count,
        child_count = excluded.child_count,
        message = excluded.message,
        ai_summary = excluded.ai_summary,
        ai_suggested_reply = excluded.ai_suggested_reply,
        whatsapp_message = excluded.whatsapp_message,
        assigned_to = excluded.assigned_to,
        priority = excluded.priority,
        updated_at = excluded.updated_at,
        sync_status = excluded.sync_status
    `);

    this.db.exec("BEGIN");
    try {
      for (const request of requests) {
        const customerId = this.ensureCustomerForRequest(request as unknown as Record<string, unknown>, new Date().toISOString());
        statement.run(
          request.id,
          customerId,
          request.source,
          request.request_type,
          request.status,
          request.customer_name,
          request.customer_phone,
          request.date_text,
          request.start_date,
          request.end_date,
          request.time,
          request.guest_count,
          request.adult_count,
          request.child_count,
          request.message,
          request.ai_summary,
          request.ai_suggested_reply,
          request.whatsapp_message,
          request.assigned_to,
          request.priority,
          request.created_at,
          request.updated_at,
          "synced"
        );
      }
      if (nextCursor !== undefined) {
        const now = new Date().toISOString();
        this.db
          .prepare(`
            UPDATE sync_runtime
            SET request_cursor = MAX(request_cursor, ?), updated_at = ?
            WHERE id = 'primary'
          `)
          .run(Math.max(0, Math.trunc(nextCursor)), now);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  markLocalRequestsSynced(requestIds: string[]) {
    if (requestIds.length === 0) {
      return;
    }

    const statement = this.db.prepare("UPDATE requests SET sync_status = 'synced', updated_at = ? WHERE id = ?");
    const now = new Date().toISOString();

    this.db.exec("BEGIN");
    try {
      for (const id of requestIds) {
        statement.run(now, id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  createManualRequest(input: CreateManualRequestInput): CreateManualRequestResult {
    const customerName = input.customerName.trim();
    if (!customerName) {
      return {
        ok: false,
        message: "Müşteri adı gerekli."
      };
    }

    const phone = normalizePhone(input.customerPhone);
    if (!phone.ok) {
      return {
        ok: false,
        message: phone.error
      };
    }

    const dateText = input.dateText.trim();
    const startDate = normalizeDateInput(input.startDate);
    const endDate = normalizeDateInput(input.endDate);
    const time = normalizeTimeInput(input.time);
    const message = input.message.trim();
    const guestCount = normalizeInteger(input.guestCount);
    const adultCount = Math.max(0, normalizeInteger(input.adultCount));
    const childCount = Math.max(0, normalizeInteger(input.childCount));

    if (input.startDate.trim() && !startDate) {
      return {
        ok: false,
        message: "Giriş tarihi YYYY-AA-GG formatında olmalı."
      };
    }

    if (input.endDate.trim() && !endDate) {
      return {
        ok: false,
        message: "Çıkış tarihi YYYY-AA-GG formatında olmalı."
      };
    }

    if (startDate && endDate && endDate < startDate) {
      return {
        ok: false,
        message: "Çıkış tarihi giriş tarihinden önce olamaz."
      };
    }

    if (input.time.trim() && !time) {
      return {
        ok: false,
        message: "Saat HH:DD formatında olmalı."
      };
    }

    if (guestCount < 1) {
      return {
        ok: false,
        message: "Kişi sayısı en az 1 olmalı."
      };
    }

    if (!dateText && !startDate && !message) {
      return {
        ok: false,
        message: "Talep için tarih notu, giriş tarihi veya not girin."
      };
    }

    const now = new Date().toISOString();
    const request: SyncedCustomerRequest = {
      id: createId("request_"),
      customer_id: "",
      source: "manual",
      request_type: normalizeRequestType(input.requestType) as SyncedCustomerRequest["request_type"],
      status: "new",
      customer_name: customerName,
      customer_phone: phone.e164,
      date_text: dateText,
      start_date: startDate,
      end_date: endDate,
      time,
      guest_count: guestCount,
      adult_count: adultCount,
      child_count: childCount,
      message,
      ai_summary: "",
      ai_suggested_reply: "",
      whatsapp_message: buildManualRequestReply(customerName),
      assigned_to: "",
      priority: normalizePriority(input.priority) as SyncedCustomerRequest["priority"],
      sync_status: "local_only",
      created_at: now,
      updated_at: now
    };

    this.db.exec("BEGIN");
    try {
      const customerId = this.ensureCustomerForRequest(request as unknown as Record<string, unknown>, now);
      request.customer_id = customerId;

      this.db
        .prepare(`
          INSERT INTO requests (
            id,
            customer_id,
            source,
            request_type,
            status,
            customer_name,
            customer_phone,
            date_text,
            start_date,
            end_date,
            time,
            guest_count,
            adult_count,
            child_count,
            message,
            ai_summary,
            ai_suggested_reply,
            whatsapp_message,
            assigned_to,
            priority,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          request.id,
          request.customer_id,
          request.source,
          request.request_type,
          request.status,
          request.customer_name,
          request.customer_phone,
          request.date_text,
          request.start_date,
          request.end_date,
          request.time,
          request.guest_count,
          request.adult_count,
          request.child_count,
          request.message,
          request.ai_summary,
          request.ai_suggested_reply,
          request.whatsapp_message,
          request.assigned_to,
          request.priority,
          request.created_at,
          request.updated_at,
          request.sync_status
        );

      this.insertEvent({
        type: "request.created",
        entityType: "request",
        entityId: request.id,
        payload: {
          source: request.source,
          request_type: request.request_type,
          customer_id: customerId
        },
        now
      });

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Manuel talep kaydedildi.",
      savedId: request.id,
      dashboardData: this.getDashboardData()
    };
  }

  getRequestById(requestId: string): SyncedCustomerRequest | null {
    const id = requestId.trim();
    if (!id) {
      return null;
    }

    const row = this.db
      .prepare(`
        SELECT
          id,
          customer_id,
          source,
          request_type,
          status,
          customer_name,
          customer_phone,
          date_text,
          start_date,
          end_date,
          time,
          guest_count,
          adult_count,
          child_count,
          message,
          ai_summary,
          ai_suggested_reply,
          whatsapp_message,
          assigned_to,
          priority,
          sync_status,
          created_at,
          updated_at
        FROM requests
        WHERE id = ? AND deleted_at = ''
        LIMIT 1
      `)
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.mapRequestRow(row) : null;
  }

  saveRequestAiSuggestion(input: SaveRequestAiSuggestionInput): RequestAiSuggestionResult {
    const requestId = input.requestId.trim();
    const summary = input.summary.trim();
    const suggestedReply = input.suggestedReply.trim();

    if (!requestId) {
      return {
        ok: false,
        message: "AI taslağı için talep seçilmeli."
      };
    }

    if (!suggestedReply) {
      return {
        ok: false,
        message: "AI cevap taslağı boş olamaz."
      };
    }

    const request = this.db.prepare("SELECT * FROM requests WHERE id = ? AND deleted_at = ''").get(requestId) as Record<string, unknown> | undefined;
    if (!request) {
      return {
        ok: false,
        message: "Talep bulunamadı."
      };
    }

    const now = new Date().toISOString();
    const existingMessage = this.db
      .prepare("SELECT id FROM whatsapp_messages WHERE request_id = ? AND direction = 'outgoing' AND deleted_at = '' LIMIT 1")
      .get(requestId) as { id?: string } | undefined;
    const messageId = existingMessage?.id || createId("wa_msg_");
    const missingFields = input.missingFields.map((field) => field.trim()).filter(Boolean);

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`
          UPDATE requests
          SET ai_summary = ?,
              ai_suggested_reply = ?,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
        .run(summary, suggestedReply, now, requestId);

      this.db
        .prepare(`
          INSERT INTO whatsapp_messages (
            id,
            request_id,
            customer_id,
            phone,
            direction,
            mode,
            status,
            message,
            prepared_by_ai,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, 'outgoing', 'manual_copy', 'prepared', ?, 1, ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            customer_id = excluded.customer_id,
            phone = excluded.phone,
            status = 'prepared',
            message = excluded.message,
            prepared_by_ai = 1,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'local_only'
        `)
        .run(
          messageId,
          requestId,
          String(request.customer_id ?? ""),
          String(request.customer_phone ?? ""),
          suggestedReply,
          now,
          now
        );

      this.insertEvent({
        type: "ai.reply_suggested",
        entityType: "request",
        entityId: requestId,
        payload: {
          summary,
          missing_fields: missingFields,
          whatsapp_message_id: messageId
        },
        now
      });

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "AI cevap taslağı yenilendi.",
      requestId,
      summary,
      suggestedReply,
      missingFields,
      dashboardData: this.getDashboardData()
    };
  }

  saveAiWorkspaceHistory(input: Omit<AiWorkspaceHistoryEntry, "id" | "createdAt">): AiWorkspaceHistoryEntry {
    const id = createId("ai_conv_");
    const createdAt = new Date().toISOString();
    const entry: AiWorkspaceHistoryEntry = {
      ...input,
      id,
      createdAt,
      instructions: input.instructions.trim().slice(0, 800),
      content: input.content.trim().slice(0, 6000),
      summary: input.summary.trim().slice(0, 1600),
      missingFields: input.missingFields.map((field) => field.trim()).filter(Boolean).slice(0, 8)
    };

    this.db
      .prepare(`
        INSERT INTO ai_conversations (
          id, source, request_id, status, messages_json, summary,
          created_at, updated_at, sync_status
        ) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, 'local_only')
      `)
      .run(
        entry.id,
        `desktop_workspace:${entry.mode}`,
        entry.requestId,
        JSON.stringify({
          instructions: entry.instructions,
          content: entry.content,
          missing_fields: entry.missingFields,
          provider: entry.provider,
          model: entry.model,
          fallback: entry.fallback,
          request_label: entry.requestLabel
        }),
        entry.summary,
        entry.createdAt,
        entry.createdAt
      );

    return entry;
  }

  getAiWorkspaceHistory(limit = 12): AiWorkspaceHistoryEntry[] {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 12));
    const rows = this.db
      .prepare(`
        SELECT id, source, request_id, messages_json, summary, created_at
        FROM ai_conversations
        WHERE source LIKE 'desktop_workspace:%' AND deleted_at = ''
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(safeLimit) as Record<string, unknown>[];

    return rows.map((row) => {
      const payload = parseAiWorkspacePayload(row.messages_json);
      const modeCandidate = String(row.source ?? "").replace("desktop_workspace:", "");
      const mode: AiWorkspaceMode = modeCandidate === "summary" || modeCandidate === "daily" ? modeCandidate : "reply";
      return {
        id: String(row.id ?? ""),
        mode,
        requestId: String(row.request_id ?? ""),
        requestLabel: String(payload.request_label ?? ""),
        instructions: String(payload.instructions ?? ""),
        content: String(payload.content ?? ""),
        summary: String(row.summary ?? ""),
        missingFields: Array.isArray(payload.missing_fields) ? payload.missing_fields.map(String).filter(Boolean) : [],
        provider: String(payload.provider ?? "disabled"),
        model: String(payload.model ?? ""),
        fallback: Boolean(payload.fallback),
        createdAt: String(row.created_at ?? "")
      };
    });
  }

  saveAiWorkspaceResult(input: SaveAiWorkspaceResultInput): SaveAiWorkspaceResult {
    const requestId = input.requestId.trim();
    const content = input.content.trim();
    const summary = input.summary.trim();
    if (input.mode === "daily") {
      return { ok: false, message: "Günlük değerlendirme belirli bir talebe kaydedilemez." };
    }
    if (!requestId) {
      return { ok: false, message: "Sonucu kaydetmek için talep seçin." };
    }
    if (!content) {
      return { ok: false, message: "Kaydedilecek AI sonucu boş olamaz." };
    }

    if (input.mode === "reply") {
      const result = this.saveRequestAiSuggestion({
        requestId,
        summary,
        suggestedReply: content,
        missingFields: input.missingFields
      });
      return result.ok
        ? { ok: true, message: "AI cevap taslağı talebe kaydedildi.", requestId, dashboardData: result.dashboardData }
        : result;
    }

    const request = this.db.prepare("SELECT id FROM requests WHERE id = ? AND deleted_at = ''").get(requestId);
    if (!request) {
      return { ok: false, message: "Talep bulunamadı." };
    }
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE requests SET ai_summary = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(content.slice(0, 1600), now, requestId);
    this.insertEvent({
      type: "ai.request_summarized",
      entityType: "request",
      entityId: requestId,
      payload: { summary: content.slice(0, 1600) },
      now
    });
    return {
      ok: true,
      message: "AI özeti talebe kaydedildi.",
      requestId,
      dashboardData: this.getDashboardData()
    };
  }

  convertRequestToReservation(requestId: string): RequestReservationConversionResult {
    const id = requestId.trim();
    if (!id) {
      return {
        ok: false,
        message: "Rezervasyona çevrilecek talep seçilmeli."
      };
    }

    const request = this.db.prepare("SELECT * FROM requests WHERE id = ? AND deleted_at = ''").get(id) as Record<string, unknown> | undefined;
    if (!request) {
      return {
        ok: false,
        message: "Talep bulunamadı."
      };
    }

    const existingReservation = this.db.prepare("SELECT id FROM reservations WHERE request_id = ? AND deleted_at = '' LIMIT 1").get(id) as { id?: string } | undefined;
    const now = new Date().toISOString();
    const reservationId = existingReservation?.id || createId("reservation_");
    const reservationType = getReservationTypeForRequest(String(request.request_type ?? ""));
    const title = buildReservationTitle(request, reservationType);
    let customerId = "";

    this.db.exec("BEGIN");
    try {
      customerId = this.ensureCustomerForRequest(request, now);
      this.db
        .prepare(`
          INSERT INTO reservations (
            id,
            request_id,
            customer_id,
            reservation_type,
            status,
            title,
            start_date,
            end_date,
            time,
            guest_count,
            adult_count,
            child_count,
            room_ids_json,
            table_ids_json,
            notes,
            price_note,
            payment_status,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, 'not_required', ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            customer_id = excluded.customer_id,
            reservation_type = excluded.reservation_type,
            status = 'approved',
            title = excluded.title,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            time = excluded.time,
            guest_count = excluded.guest_count,
            adult_count = excluded.adult_count,
            child_count = excluded.child_count,
            notes = excluded.notes,
            price_note = excluded.price_note,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'local_only'
        `)
        .run(
          reservationId,
          id,
          customerId,
          reservationType,
          title,
          String(request.start_date ?? ""),
          String(request.end_date ?? ""),
          String(request.time ?? ""),
          Number(request.guest_count ?? 1),
          Number(request.adult_count ?? 0),
          Number(request.child_count ?? 0),
          buildReservationNotes(request),
          "Fiyat ve kaynak ataması işletme sahibi tarafından netleştirilecek.",
          now,
          now
        );

      this.db
        .prepare(`
          UPDATE requests
          SET status = 'converted_to_reservation',
              customer_id = ?,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
        .run(customerId, now, id);

      this.insertEvent({
        type: "request.converted_to_reservation",
        entityType: "request",
        entityId: id,
        payload: {
          reservation_id: reservationId,
          customer_id: customerId,
          previous_status: String(request.status ?? "")
        },
        now
      });
      this.insertEvent({
        type: "reservation.approved",
        entityType: "reservation",
        entityId: reservationId,
        payload: {
          request_id: id,
          customer_id: customerId,
          reservation_type: reservationType
        },
        now
      });

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: existingReservation ? "Mevcut rezervasyon onaylandı." : "Talep rezervasyona çevrildi ve onaylandı.",
      reservationId,
      dashboardData: this.getDashboardData()
    };
  }

  markMenuPublished() {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE menu_categories SET sync_status = 'synced', updated_at = ? WHERE deleted_at = ''").run(now);
    this.db.prepare("UPDATE menu_items SET sync_status = 'synced', updated_at = ? WHERE deleted_at = ''").run(now);
    this.insertEvent({
      type: "menu.published",
      entityType: "menu",
      entityId: "qr_menu",
      payload: {
        category_count: this.getScalarCount("SELECT COUNT(*) as count FROM menu_categories WHERE deleted_at = ''"),
        item_count: this.getScalarCount("SELECT COUNT(*) as count FROM menu_items WHERE deleted_at = ''")
      },
      now
    });
  }

  recordSyncEvent(input: RecordSyncEventInput) {
    const now = new Date().toISOString();
    this.insertEvent({
      type: input.ok ? "sync.completed" : "sync.failed",
      entityType: "sync",
      entityId: `${input.direction}:${input.entityType}`,
      payload: input.ok
        ? {
            direction: input.direction,
            entity_type: input.entityType,
            record_count: input.recordCount ?? 0
          }
        : {
            direction: input.direction,
            entity_type: input.entityType,
            error_message: input.message ?? "Senkronizasyon başarısız oldu.",
            status: input.status ?? 0
          },
      now
    });
  }

  countEventsByType(type: string) {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM events WHERE type = ? AND deleted_at = ''").get(type.trim()) as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  saveMenuCategory(input: SaveMenuCategoryInput): DesktopMenuSaveResult {
    const name = input.name.trim();
    if (!name) {
      return {
        ok: false,
        message: "Kategori adı gerekli."
      };
    }

    const id = input.id?.trim() || createId("cat_");
    const now = new Date().toISOString();
    const existing = this.db.prepare("SELECT created_at FROM menu_categories WHERE id = ?").get(id) as { created_at?: string } | undefined;
    const createdAt = existing?.created_at || now;

    this.db
      .prepare(`
        INSERT INTO menu_categories (
          id,
          name,
          description,
          is_active,
          sort_order,
          created_at,
          updated_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          is_active = excluded.is_active,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at,
          deleted_at = '',
          sync_status = 'pending'
      `)
      .run(id, name, input.description.trim(), input.is_active ? 1 : 0, normalizeInteger(input.sort_order), createdAt, now);

    return {
      ok: true,
      message: "Kategori kaydedildi.",
      savedId: id,
      dashboardData: this.getDashboardData()
    };
  }

  saveMenuItem(input: SaveMenuItemInput): DesktopMenuSaveResult {
    const name = input.name.trim();
    const categoryId = input.category_id.trim();
    if (!name) {
      return {
        ok: false,
        message: "Ürün adı gerekli."
      };
    }

    const categoryExists = this.db.prepare("SELECT id FROM menu_categories WHERE id = ? AND deleted_at = ''").get(categoryId);
    if (!categoryExists) {
      return {
        ok: false,
        message: "Ürün için kategori seçilmeli."
      };
    }

    const id = input.id?.trim() || createId("item_");
    const now = new Date().toISOString();
    const existing = this.db.prepare("SELECT created_at FROM menu_items WHERE id = ?").get(id) as { created_at?: string } | undefined;
    const createdAt = existing?.created_at || now;

    this.db
      .prepare(`
        INSERT INTO menu_items (
          id,
          category_id,
          name,
          description,
          price,
          currency,
          image_url,
          is_available,
          is_featured,
          allergens_json,
          tags_json,
          sort_order,
          created_at,
          updated_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ON CONFLICT(id) DO UPDATE SET
          category_id = excluded.category_id,
          name = excluded.name,
          description = excluded.description,
          price = excluded.price,
          currency = excluded.currency,
          image_url = excluded.image_url,
          is_available = excluded.is_available,
          is_featured = excluded.is_featured,
          allergens_json = excluded.allergens_json,
          tags_json = excluded.tags_json,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at,
          deleted_at = '',
          sync_status = 'pending'
      `)
      .run(
        id,
        categoryId,
        name,
        input.description.trim(),
        normalizePrice(input.price),
        normalizeCurrency(input.currency),
        input.image_url.trim(),
        input.is_available ? 1 : 0,
        input.is_featured ? 1 : 0,
        JSON.stringify(normalizeStringArray(input.allergens)),
        JSON.stringify(normalizeStringArray(input.tags)),
        normalizeInteger(input.sort_order),
        createdAt,
        now
      );

    return {
      ok: true,
      message: "Ürün kaydedildi.",
      savedId: id,
      dashboardData: this.getDashboardData()
    };
  }

  close() {
    this.db.close();
  }

  private getDailyTasks(): DesktopDailyTask[] {
    const rows = this.db
      .prepare(`
        SELECT
          id,
          title,
          description,
          task_type,
          status,
          due_date,
          due_time,
          related_type,
          related_id,
          updated_at
        FROM daily_tasks
        WHERE deleted_at = ''
        ORDER BY
          CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END ASC,
          due_date ASC,
          due_time ASC,
          created_at DESC
        LIMIT 80
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      taskType: String(row.task_type ?? "note"),
      status: String(row.status ?? "pending"),
      dueDate: String(row.due_date ?? ""),
      dueTime: String(row.due_time ?? ""),
      relatedType: String(row.related_type ?? ""),
      relatedId: String(row.related_id ?? ""),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getCustomers(): DesktopCustomer[] {
    const rows = this.db
      .prepare(`
        SELECT
          customers.id,
          customers.full_name,
          customers.phone,
          customers.email,
          customers.source,
          customers.notes,
          customers.tags_json,
          customers.last_contact_at,
          customers.updated_at,
          COUNT(DISTINCT requests.id) AS request_count,
          COUNT(DISTINCT reservations.id) AS reservation_count
        FROM customers
        LEFT JOIN requests ON requests.customer_id = customers.id AND requests.deleted_at = ''
        LEFT JOIN reservations ON reservations.customer_id = customers.id AND reservations.deleted_at = ''
        WHERE customers.deleted_at = ''
        GROUP BY customers.id
        ORDER BY
          COALESCE(NULLIF(customers.last_contact_at, ''), customers.updated_at) DESC,
          customers.full_name ASC
        LIMIT 100
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      fullName: String(row.full_name ?? ""),
      phone: String(row.phone ?? ""),
      email: String(row.email ?? ""),
      source: String(row.source ?? "manual"),
      notes: String(row.notes ?? ""),
      tags: this.parseStringArray(row.tags_json),
      lastContactAt: String(row.last_contact_at ?? ""),
      requestCount: Number(row.request_count ?? 0),
      reservationCount: Number(row.reservation_count ?? 0),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getRooms(): DesktopRoom[] {
    const reservationTitles = this.getActiveResourceReservationTitles("room");
    const rows = this.db
      .prepare(`
        SELECT
          id,
          name,
          number,
          capacity,
          bed_info,
          floor,
          status,
          features_json,
          description,
          price_note,
          is_active,
          sort_order,
          updated_at
        FROM rooms
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, number ASC, name ASC
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      number: String(row.number ?? ""),
      capacity: Number(row.capacity ?? 0),
      bedInfo: String(row.bed_info ?? ""),
      floor: String(row.floor ?? ""),
      status: String(row.status ?? "available"),
      features: this.parseStringArray(row.features_json),
      description: String(row.description ?? ""),
      priceNote: String(row.price_note ?? ""),
      isActive: Number(row.is_active ?? 0) === 1,
      sortOrder: Number(row.sort_order ?? 0),
      activeReservationTitle: reservationTitles.get(String(row.id ?? "")) ?? "",
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getTables(): DesktopTable[] {
    const reservationTitles = this.getActiveResourceReservationTitles("table");
    const rows = this.db
      .prepare(`
        SELECT
          id,
          name,
          area,
          capacity,
          status,
          current_customer_id,
          current_reservation_id,
          notes,
          is_active,
          sort_order,
          updated_at
        FROM tables
        WHERE deleted_at = ''
        ORDER BY area ASC, sort_order ASC, name ASC
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      area: String(row.area ?? ""),
      capacity: Number(row.capacity ?? 0),
      status: String(row.status ?? "available"),
      currentCustomerId: String(row.current_customer_id ?? ""),
      currentReservationId: String(row.current_reservation_id ?? ""),
      activeReservationTitle: reservationTitles.get(String(row.id ?? "")) ?? "",
      notes: String(row.notes ?? ""),
      isActive: Number(row.is_active ?? 0) === 1,
      sortOrder: Number(row.sort_order ?? 0),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getReservations(): DesktopReservation[] {
    const rows = this.db
      .prepare(`
        SELECT
          reservations.id,
          reservations.request_id,
          reservations.customer_id,
          customers.full_name AS customer_name,
          customers.phone AS customer_phone,
          reservations.reservation_type,
          reservations.status,
          reservations.title,
          reservations.start_date,
          reservations.end_date,
          reservations.time,
          reservations.guest_count,
          reservations.adult_count,
          reservations.child_count,
          reservations.room_ids_json,
          reservations.table_ids_json,
          reservations.notes,
          reservations.price_note,
          reservations.payment_status,
          reservations.updated_at
        FROM reservations
        LEFT JOIN customers ON customers.id = reservations.customer_id AND customers.deleted_at = ''
        WHERE reservations.deleted_at = ''
        ORDER BY reservations.start_date ASC, reservations.time ASC, reservations.created_at DESC
        LIMIT 80
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      requestId: String(row.request_id ?? ""),
      customerId: String(row.customer_id ?? ""),
      customerName: String(row.customer_name ?? ""),
      customerPhone: String(row.customer_phone ?? ""),
      reservationType: String(row.reservation_type ?? ""),
      status: String(row.status ?? "pending"),
      title: String(row.title ?? ""),
      startDate: String(row.start_date ?? ""),
      endDate: String(row.end_date ?? ""),
      time: String(row.time ?? ""),
      guestCount: Number(row.guest_count ?? 0),
      adultCount: Number(row.adult_count ?? 0),
      childCount: Number(row.child_count ?? 0),
      roomIds: this.parseStringArray(row.room_ids_json),
      tableIds: this.parseStringArray(row.table_ids_json),
      notes: String(row.notes ?? ""),
      priceNote: String(row.price_note ?? ""),
      paymentStatus: String(row.payment_status ?? "not_required"),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getActiveResourceReservationTitles(resourceType: "room" | "table") {
    const map = new Map<string, string>();
    const rows = this.db
      .prepare(`
        SELECT id, title, room_ids_json, table_ids_json
        FROM reservations
        WHERE deleted_at = ''
          AND status IN ('pending', 'approved')
        ORDER BY start_date ASC, time ASC, created_at DESC
      `)
      .all() as Array<Record<string, unknown>>;

    for (const row of rows) {
      const ids = this.parseStringArray(resourceType === "room" ? row.room_ids_json : row.table_ids_json);
      for (const id of ids) {
        if (!map.has(id)) {
          map.set(id, String(row.title ?? ""));
        }
      }
    }

    return map;
  }

  private getRequests(): SyncedCustomerRequest[] {
    const rows = this.db
      .prepare(`
        SELECT
          id,
          customer_id,
          source,
          request_type,
          status,
          customer_name,
          customer_phone,
          date_text,
          start_date,
          end_date,
          time,
          guest_count,
          adult_count,
          child_count,
          message,
          ai_summary,
          ai_suggested_reply,
          whatsapp_message,
          assigned_to,
          priority,
          sync_status,
          created_at,
          updated_at
        FROM requests
        WHERE deleted_at = ''
        ORDER BY
          CASE
            WHEN status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress') AND priority = 'urgent' THEN 0
            WHEN status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress') AND priority = 'high' THEN 1
            WHEN status = 'new' THEN 2
            WHEN status IN ('seen', 'waiting_owner', 'pending', 'in_progress') AND priority <> 'low' THEN 3
            WHEN status IN ('seen', 'waiting_owner', 'pending', 'in_progress') THEN 4
            ELSE 5
          END,
          created_at DESC
        LIMIT 80
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapRequestRow(row));
  }

  private mapRequestRow(row: Record<string, unknown>): SyncedCustomerRequest {
    return {
      id: String(row.id ?? ""),
      customer_id: String(row.customer_id ?? ""),
      source: row.source as SyncedCustomerRequest["source"],
      request_type: row.request_type as SyncedCustomerRequest["request_type"],
      status: row.status as SyncedCustomerRequest["status"],
      customer_name: String(row.customer_name ?? ""),
      customer_phone: String(row.customer_phone ?? ""),
      date_text: String(row.date_text ?? ""),
      start_date: String(row.start_date ?? ""),
      end_date: String(row.end_date ?? ""),
      time: String(row.time ?? ""),
      guest_count: Number(row.guest_count ?? 0),
      adult_count: Number(row.adult_count ?? 0),
      child_count: Number(row.child_count ?? 0),
      message: String(row.message ?? ""),
      ai_summary: String(row.ai_summary ?? ""),
      ai_suggested_reply: String(row.ai_suggested_reply ?? ""),
      whatsapp_message: String(row.whatsapp_message ?? ""),
      assigned_to: String(row.assigned_to ?? ""),
      priority: row.priority as SyncedCustomerRequest["priority"],
      sync_status: row.sync_status as SyncedCustomerRequest["sync_status"],
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? "")
    };
  }

  private getCount(table: string): number {
    return this.getScalarCount(`SELECT COUNT(*) as count FROM ${table}`);
  }

  private getScalarCount(sql: string): number {
    const row = this.db.prepare(sql).get() as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  private parseStringArray(value: unknown): string[] {
    try {
      const parsed = JSON.parse(String(value ?? "[]")) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  private parseModulesJson(value: string) {
    try {
      const parsed = JSON.parse(value) as Partial<Record<string, boolean>>;
      return {
        rooms: parsed.rooms !== false,
        tables: parsed.tables !== false,
        qr_menu: parsed.qr_menu !== false,
        ai: parsed.ai === true,
        whatsapp: parsed.whatsapp !== false,
        android: parsed.android !== false
      };
    } catch {
      return {
        rooms: true,
        tables: true,
        qr_menu: true,
        ai: false,
        whatsapp: true,
        android: true
      };
    }
  }

  private ensureInitialRooms(targetCount: number, now: string) {
    const count = this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE deleted_at = ''");
    const missing = Math.max(0, targetCount - count);
    const statement = this.db.prepare(`
      INSERT INTO rooms (
        id,
        name,
        number,
        capacity,
        bed_info,
        status,
        features_json,
        description,
        sort_order,
        created_at,
        updated_at,
        sync_status
      ) VALUES (?, ?, ?, 2, '1 çift kişilik yatak', 'available', '[]', '', ?, ?, ?, 'local_only')
    `);

    for (let index = 0; index < missing; index += 1) {
      const order = count + index + 1;
      const number = String(100 + order);
      statement.run(createId("room_"), `Oda ${number}`, number, order, now, now);
    }
  }

  private ensureInitialTables(targetCount: number, now: string) {
    const count = this.getScalarCount("SELECT COUNT(*) as count FROM tables WHERE deleted_at = ''");
    const missing = Math.max(0, targetCount - count);
    const statement = this.db.prepare(`
      INSERT INTO tables (
        id,
        name,
        area,
        capacity,
        status,
        sort_order,
        created_at,
        updated_at,
        sync_status
      ) VALUES (?, ?, 'Genel', 4, 'available', ?, ?, ?, 'local_only')
    `);

    for (let index = 0; index < missing; index += 1) {
      const order = count + index + 1;
      statement.run(createId("table_"), `Masa ${order}`, order, now, now);
    }
  }

  private ensureCustomerForRequest(request: Record<string, unknown>, now: string) {
    const requestCustomerId = String(request.customer_id ?? "").trim();
    if (requestCustomerId) {
      const existing = this.db.prepare("SELECT id FROM customers WHERE id = ? AND deleted_at = ''").get(requestCustomerId);
      if (existing) {
        return requestCustomerId;
      }
    }

    const phone = String(request.customer_phone ?? "").trim();
    const existingByPhone = phone
      ? (this.db.prepare("SELECT id FROM customers WHERE phone = ? AND deleted_at = '' LIMIT 1").get(phone) as { id?: string } | undefined)
      : undefined;
    const customerId = existingByPhone?.id || requestCustomerId || createId("customer_");
    const source = String(request.source ?? "web_form").trim() || "web_form";

    this.db
      .prepare(`
        INSERT INTO customers (
          id,
          full_name,
          phone,
          source,
          notes,
          tags_json,
          last_contact_at,
          created_at,
          updated_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
        ON CONFLICT(id) DO UPDATE SET
          full_name = excluded.full_name,
          phone = excluded.phone,
          source = excluded.source,
          notes = excluded.notes,
          tags_json = excluded.tags_json,
          last_contact_at = excluded.last_contact_at,
          updated_at = excluded.updated_at,
          deleted_at = '',
          sync_status = 'local_only'
      `)
      .run(
        customerId,
        String(request.customer_name ?? "Misafir").trim() || "Misafir",
        phone,
        source,
        String(request.message ?? ""),
        JSON.stringify(getCustomerTagsForSource(source)),
        now,
        now,
        now
      );

    return customerId;
  }

  private authorizeAndroidActionInTransaction(action: AndroidSyncAction): AndroidActionMutationResult {
    const deviceId = String(action.device_id ?? "").trim();
    const device = this.db
      .prepare(`
        SELECT role, is_active, permissions_json, revoked_at
        FROM android_devices
        WHERE device_id = ?
        LIMIT 1
      `)
      .get(deviceId) as Record<string, unknown> | undefined;
    if (!device) {
      return { ok: false, message: "Telefon masaüstü cihaz listesine kaydedilemedi." };
    }
    if (Number(device.is_active ?? 0) !== 1 || String(device.revoked_at ?? "").trim()) {
      return { ok: false, message: "Cihaz masaüstünde pasifleştirilmiş." };
    }
    const requiredPermission = resolveAndroidActionPermission(action.action_type, action.payload);
    if (!requiredPermission) {
      return { ok: false, message: "Telefon işlem türü bu masaüstü sürümünde desteklenmiyor." };
    }
    const role = normalizeAndroidDeviceRole(device.role);
    const permissions = effectiveAndroidPermissions(role, device.permissions_json);
    if (!permissions.includes(requiredPermission)) {
      return {
        ok: false,
        message: requiredPermission === "table_order.close_paid"
          ? "Bu cihazın hesap kapatma yetkisi yok."
          : "Bu cihazın bu işlem için yetkisi yok."
      };
    }
    return { ok: true, message: "Telefon işlemi yetkilendirildi." };
  }

  private applyAndroidActionInTransaction(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    switch (action.action_type) {
      case "customer_request_mark_answered":
        return this.applyAndroidRequestStatus(action, "answered", now);
      case "customer_request_reopen":
        return this.applyAndroidRequestStatus(action, "new", now);
      case "customer_request_approve":
        return this.applyAndroidRequestStatus(action, "approved", now);
      case "customer_request_reject":
        return this.applyAndroidRequestStatus(action, "rejected", now);
      case "customer_request_convert_to_reservation":
        return this.applyAndroidRequestConversion(action, now);
      case "reservation_approve":
        return this.applyAndroidReservationStatus(action, "approved", now);
      case "reservation_reject":
        return this.applyAndroidReservationStatus(action, "rejected", now);
      case "reservation_cancel":
        return this.applyAndroidReservationStatus(action, "cancelled", now);
      case "room_status_update":
        return this.applyAndroidRoomStatus(action, now);
      case "daily_task_complete":
        return this.applyAndroidDailyTaskStatus(action, "done", now);
      case "daily_task_reopen":
        return this.applyAndroidDailyTaskStatus(action, "pending", now);
      case "daily_task_cancel":
        return this.applyAndroidDailyTaskStatus(action, "cancelled", now);
      case "table_status_update":
        return this.applyAndroidTableStatus(action, now);
      case "table_order_open":
        return this.applyAndroidTableOrderOpen(action, now);
      case "table_order_add_item":
        return this.applyAndroidTableOrderAddItem(action, now);
      case "table_order_update_item_quantity":
        return this.applyAndroidTableOrderItemQuantity(action, now);
      case "table_order_remove_item":
        return this.applyAndroidTableOrderRemoveItem(action, now);
      case "table_order_set_preparing":
        return this.applyAndroidTableOrderStatus(action, now, "preparing");
      case "table_order_set_served":
        return this.applyAndroidTableOrderStatus(action, now, "served");
      case "table_order_set_payment_waiting":
        return this.applyAndroidTableOrderStatus(action, now, "payment");
      case "table_order_close_paid":
        return this.applyAndroidTableOrderClose(action, now, "paid");
      case "table_order_cancel":
        return this.applyAndroidTableOrderClose(action, now, "cancelled");
      case "table_order_set_status":
        return this.applyAndroidTableOrderStatus(action, now);
      case "table_order_close":
        return this.applyAndroidTableOrderClose(action, now);
      default:
        return { ok: false, message: "Telefon işlem türü bu masaüstü sürümünde desteklenmiyor." };
    }
  }

  private applyAndroidRequestStatus(action: AndroidSyncAction, status: string, now: string): AndroidActionMutationResult {
    const requestId = androidPayloadString(action.payload, "request_id");
    if (!requestId) {
      return { ok: false, message: "Güncellenecek talep seçilmemiş." };
    }
    const request = this.db
      .prepare("SELECT status, updated_at FROM requests WHERE id = ? AND deleted_at = ''")
      .get(requestId) as { status?: string; updated_at?: string } | undefined;
    if (!request) {
      return { ok: false, message: "Talep masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", request.updated_at, "Talep");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(request.updated_at, now);

    this.db
      .prepare("UPDATE requests SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status, updatedAt, requestId);
    if (status === "answered") {
      this.markPreparedWhatsAppMessagesSentInTransaction(requestId, updatedAt);
    }
    this.insertAndroidActionEvent(action, "request.status_changed", "request", requestId, {
      previous_status: String(request.status ?? ""),
      status
    }, now);
    return { ok: true, message: "Talep durumu telefondan güncellendi." };
  }

  private applyAndroidRequestConversion(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const requestId = androidPayloadString(action.payload, "request_id");
    if (!requestId) {
      return { ok: false, message: "Rezervasyona çevrilecek talep seçilmemiş." };
    }
    const request = this.db
      .prepare("SELECT * FROM requests WHERE id = ? AND deleted_at = ''")
      .get(requestId) as Record<string, unknown> | undefined;
    if (!request) {
      return { ok: false, message: "Talep masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", request.updated_at, "Talep");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(request.updated_at, now);

    const existingReservation = this.db
      .prepare("SELECT id FROM reservations WHERE request_id = ? AND deleted_at = '' LIMIT 1")
      .get(requestId) as { id?: string } | undefined;
    const reservationId = existingReservation?.id || createAndroidEntityId("reservation_", action.id);
    const reservationType = getReservationTypeForRequest(String(request.request_type ?? ""));
    const customerId = this.ensureCustomerForRequest(request, now);
    this.db
      .prepare(`
        INSERT INTO reservations (
          id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
          guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
          payment_status, created_at, updated_at, sync_status
        ) VALUES (?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, 'not_required', ?, ?, 'local_only')
        ON CONFLICT(id) DO UPDATE SET
          customer_id = excluded.customer_id,
          reservation_type = excluded.reservation_type,
          status = 'approved',
          title = excluded.title,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          time = excluded.time,
          guest_count = excluded.guest_count,
          adult_count = excluded.adult_count,
          child_count = excluded.child_count,
          notes = excluded.notes,
          price_note = excluded.price_note,
          updated_at = excluded.updated_at,
          deleted_at = '',
          sync_status = 'local_only'
      `)
      .run(
        reservationId,
        requestId,
        customerId,
        reservationType,
        buildReservationTitle(request, reservationType),
        String(request.start_date ?? ""),
        String(request.end_date ?? ""),
        String(request.time ?? ""),
        Number(request.guest_count ?? 1),
        Number(request.adult_count ?? 0),
        Number(request.child_count ?? 0),
        buildReservationNotes(request),
        "Fiyat ve kaynak ataması işletme sahibi tarafından netleştirilecek.",
        updatedAt,
        updatedAt
      );
    this.db
      .prepare("UPDATE requests SET status = 'converted_to_reservation', customer_id = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(customerId, updatedAt, requestId);
    this.insertAndroidActionEvent(action, "request.converted_to_reservation", "request", requestId, {
      reservation_id: reservationId,
      customer_id: customerId,
      previous_status: String(request.status ?? "")
    }, now);
    this.insertAndroidActionEvent(action, "reservation.approved", "reservation", reservationId, {
      request_id: requestId,
      customer_id: customerId,
      reservation_type: reservationType
    }, now);
    return {
      ok: true,
      message: existingReservation ? "Mevcut rezervasyon telefondan onaylandı." : "Talep telefondan rezervasyona çevrildi."
    };
  }

  private applyAndroidReservationStatus(action: AndroidSyncAction, status: "approved" | "rejected" | "cancelled", now: string): AndroidActionMutationResult {
    const reservationId = androidPayloadString(action.payload, "reservation_id");
    if (!reservationId) {
      return { ok: false, message: "Güncellenecek rezervasyon seçilmemiş." };
    }
    const reservation = this.db
      .prepare("SELECT * FROM reservations WHERE id = ? AND deleted_at = ''")
      .get(reservationId) as Record<string, unknown> | undefined;
    if (!reservation) {
      return { ok: false, message: "Rezervasyon masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", reservation.updated_at, "Rezervasyon");
    if (versionConflict) {
      return versionConflict;
    }

    const roomIds = this.parseStringArray(reservation.room_ids_json);
    const tableIds = this.parseStringArray(reservation.table_ids_json);
    const activeOrder = this.findActiveOrderForTables(tableIds);
    if (activeOrder) {
      return { ok: false, message: "Aktif adisyonu olan masaya bağlı rezervasyon değiştirilemez. Önce adisyonu kapatın." };
    }
    const updatedAt = nextMutationTimestamp(reservation.updated_at, now);
    this.db
      .prepare("UPDATE reservations SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status, updatedAt, reservationId);
    if (status === "approved") {
      for (const roomId of roomIds) {
        this.db
          .prepare("UPDATE rooms SET status = 'reserved', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
          .run(updatedAt, roomId);
      }
      for (const tableId of tableIds) {
        this.db
          .prepare("UPDATE tables SET status = 'reserved', current_reservation_id = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
          .run(reservationId, updatedAt, tableId);
      }
    } else {
      for (const roomId of roomIds) {
        this.db
          .prepare("UPDATE rooms SET status = 'available', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND status = 'reserved' AND deleted_at = ''")
          .run(updatedAt, roomId);
      }
      for (const tableId of tableIds) {
        this.db
          .prepare(`
            UPDATE tables
            SET status = 'available', current_reservation_id = '', updated_at = ?, sync_status = 'local_only'
            WHERE id = ? AND current_reservation_id = ? AND deleted_at = ''
          `)
          .run(updatedAt, tableId, reservationId);
      }
    }
    this.insertAndroidActionEvent(action, "reservation.status_changed", "reservation", reservationId, {
      previous_status: String(reservation.status ?? ""),
      status,
      room_ids: roomIds,
      table_ids: tableIds
    }, now);
    return { ok: true, message: "Rezervasyon durumu telefondan güncellendi." };
  }

  private applyAndroidRoomStatus(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const roomId = androidPayloadString(action.payload, "room_id");
    const status = normalizeStatus(androidPayloadString(action.payload, "status"), ["available", "reserved", "occupied", "cleaning", "maintenance"]);
    if (!roomId || !status) {
      return { ok: false, message: "Oda veya yeni oda durumu geçersiz." };
    }
    const room = this.db
      .prepare("SELECT status, updated_at FROM rooms WHERE id = ? AND is_active = 1 AND deleted_at = ''")
      .get(roomId) as { status?: string; updated_at?: string } | undefined;
    if (!room) {
      return { ok: false, message: "Oda masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", room.updated_at, "Oda");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(room.updated_at, now);
    this.db
      .prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status, updatedAt, roomId);
    this.insertAndroidActionEvent(action, "room.status_changed", "room", roomId, {
      old_status: String(room.status ?? ""),
      new_status: status
    }, now);
    return { ok: true, message: "Oda durumu telefondan güncellendi." };
  }

  private applyAndroidDailyTaskStatus(action: AndroidSyncAction, status: "done" | "pending" | "cancelled", now: string): AndroidActionMutationResult {
    const taskId = androidPayloadString(action.payload, "task_id");
    if (!taskId) {
      return { ok: false, message: "Güncellenecek günlük iş seçilmemiş." };
    }
    const task = this.db
      .prepare("SELECT status, updated_at FROM daily_tasks WHERE id = ? AND deleted_at = ''")
      .get(taskId) as { status?: string; updated_at?: string } | undefined;
    if (!task) {
      return { ok: false, message: "Günlük iş masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", task.updated_at, "Günlük iş");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(task.updated_at, now);
    this.db
      .prepare("UPDATE daily_tasks SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status, updatedAt, taskId);
    this.insertAndroidActionEvent(action, status === "done" ? "task.completed" : "task.status_changed", "daily_task", taskId, {
      previous_status: String(task.status ?? ""),
      status
    }, now);
    return { ok: true, message: "Günlük iş telefondan güncellendi." };
  }

  private applyAndroidTableStatus(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const tableId = androidPayloadString(action.payload, "table_id");
    const status = normalizeStatus(androidPayloadString(action.payload, "status"), ["available", "reserved", "occupied", "bill_waiting", "cleaning"]);
    if (!tableId || !status) {
      return { ok: false, message: "Masa veya yeni masa durumu geçersiz." };
    }
    const table = this.db
      .prepare("SELECT status, updated_at FROM tables WHERE id = ? AND is_active = 1 AND deleted_at = ''")
      .get(tableId) as { status?: string; updated_at?: string } | undefined;
    if (!table) {
      return { ok: false, message: "Masa masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", table.updated_at, "Masa");
    if (versionConflict) {
      return versionConflict;
    }
    const activeOrder = this.db
      .prepare("SELECT id, status FROM table_orders WHERE table_id = ? AND status IN ('open', 'preparing', 'served', 'payment') LIMIT 1")
      .get(tableId) as { id?: string; status?: string } | undefined;
    if (activeOrder) {
      return { ok: false, message: "Aktif adisyonu olan masanın durumu adisyon üzerinden değiştirilmelidir." };
    }
    const updatedAt = nextMutationTimestamp(table.updated_at, now);
    this.db
      .prepare("UPDATE tables SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status, updatedAt, tableId);
    this.insertAndroidActionEvent(action, "table.status_changed", "table", tableId, {
      old_status: String(table.status ?? ""),
      new_status: status
    }, now);
    return { ok: true, message: "Masa durumu telefondan güncellendi." };
  }

  private applyAndroidTableOrderOpen(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const tableId = androidPayloadString(action.payload, "table_id");
    if (!tableId) {
      return { ok: false, message: "Sipariş açılacak masa seçilmemiş." };
    }
    const table = this.db
      .prepare("SELECT id, updated_at FROM tables WHERE id = ? AND is_active = 1 AND deleted_at = ''")
      .get(tableId) as { id?: string; updated_at?: string } | undefined;
    if (!table) {
      return { ok: false, message: "Sipariş açılacak masa bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_table_updated_at", table.updated_at, "Masa");
    if (versionConflict) {
      return versionConflict;
    }
    const activeOrder = this.db
      .prepare("SELECT id, status FROM table_orders WHERE table_id = ? AND status IN ('open', 'preparing', 'served', 'payment') LIMIT 1")
      .get(tableId) as { id?: string; status?: string } | undefined;
    if (activeOrder?.id) {
      this.updateTableStatusForOrderInTransaction(tableId, activeOrder.status === "payment" ? "bill_waiting" : "occupied", activeOrder.id, now, action);
      return { ok: true, message: "Masada zaten açık bir adisyon var." };
    }

    const orderId = createAndroidEntityId("table_order_", action.id);
    this.db
      .prepare(`
        INSERT INTO table_orders (
          id, table_id, status, opened_at, closed_at, subtotal, discount_total, total, note, created_at, updated_at
        ) VALUES (?, ?, 'open', ?, '', 0, 0, 0, '', ?, ?)
      `)
      .run(orderId, tableId, now, now, now);
    this.updateTableStatusForOrderInTransaction(tableId, "occupied", orderId, now, action);
    this.insertAndroidActionEvent(action, "table_order.opened", "table_order", orderId, { table_id: tableId }, now);
    return { ok: true, message: "Masa adisyonu telefondan açıldı." };
  }

  private applyAndroidTableOrderAddItem(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const explicitOrderId = androidPayloadString(action.payload, "order_id");
    const dependencyActionId = androidPayloadString(action.payload, "depends_on_action_id");
    let orderId = "";
    if (explicitOrderId) {
      orderId = this.resolveAndroidActiveOrderId(action.payload);
    } else if (dependencyActionId) {
      const dependencyReceipt = this.db
        .prepare("SELECT action_type FROM android_action_receipts WHERE id = ?")
        .get(dependencyActionId) as { action_type?: string } | undefined;
      const dependentOrderId = createAndroidEntityId("table_order_", dependencyActionId);
      if (dependencyReceipt?.action_type !== "table_order_open" || !this.isActiveTableOrder(dependentOrderId)) {
        return { ok: false, message: "Ürün eklenemedi çünkü bağlı adisyon açma işlemi uygulanmadı." };
      }
      orderId = dependentOrderId;
    } else {
      return { ok: false, message: "Ürün eklemek için açık adisyon veya uygulanmış adisyon açma işlemi gerekli." };
    }
    const menuItemId = androidPayloadString(action.payload, "menu_item_id");
    const quantity = normalizeOrderQuantity(androidPayloadNumber(action.payload, "quantity", 1));
    if (!orderId || !menuItemId || !quantity) {
      return { ok: false, message: "Ürün, adisyon veya adet bilgisi geçersiz." };
    }
    const order = this.db
      .prepare("SELECT table_id, updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
      .get(orderId) as { table_id?: string; updated_at?: string } | undefined;
    if (!order) {
      return { ok: false, message: "Ürün eklenecek aktif adisyon bulunamadı." };
    }
    const payloadTableId = androidPayloadString(action.payload, "table_id");
    if (payloadTableId && payloadTableId !== String(order.table_id ?? "")) {
      return { ok: false, message: "Ürün ile adisyonun masa bilgisi eşleşmiyor." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_order_updated_at", order.updated_at, "Adisyon");
    if (versionConflict) {
      return versionConflict;
    }
    const menuItem = this.db
      .prepare(`
        SELECT menu_items.id, menu_items.name, menu_items.price, menu_items.currency
        FROM menu_items
        INNER JOIN menu_categories ON menu_categories.id = menu_items.category_id
        WHERE menu_items.id = ?
          AND menu_items.is_available = 1
          AND menu_items.deleted_at = ''
          AND menu_categories.is_active = 1
          AND menu_categories.deleted_at = ''
        LIMIT 1
      `)
      .get(menuItemId) as { id?: string; name?: string; price?: number; currency?: string } | undefined;
    if (!menuItem?.id) {
      return { ok: false, message: "Menü ürünü artık satışta değil veya bulunamadı." };
    }
    const productName = String(menuItem.name ?? "Ürün").trim() || "Ürün";
    const unitPrice = roundMoney(Number(menuItem.price ?? 0));
    const currency = normalizeTableOrderCurrency(menuItem.currency);
    const orderCurrency = this.db
      .prepare("SELECT currency FROM table_order_items WHERE order_id = ? AND status != 'cancelled' ORDER BY created_at ASC LIMIT 1")
      .get(orderId) as { currency?: string } | undefined;
    if (orderCurrency?.currency && normalizeTableOrderCurrency(orderCurrency.currency) !== currency) {
      return { ok: false, message: "Farklı para birimindeki ürün aynı adisyona eklenemez." };
    }
    const existingItem = this.db
      .prepare(`
        SELECT id, quantity, updated_at FROM table_order_items
        WHERE order_id = ? AND menu_item_id = ? AND product_name = ? AND unit_price = ? AND currency = ? AND note = '' AND status = 'open'
        ORDER BY created_at DESC LIMIT 1
      `)
      .get(orderId, menuItemId, productName, unitPrice, currency) as { id?: string; quantity?: number; updated_at?: string } | undefined;
    let itemId = existingItem?.id || createAndroidEntityId("table_order_item_", action.id);
    if (existingItem?.id) {
      const nextQuantity = Number(existingItem.quantity ?? 0) + quantity;
      if (nextQuantity > 999) {
        return { ok: false, message: "Bir sipariş satırındaki ürün adedi 999'u aşamaz." };
      }
      const itemUpdatedAt = nextMutationTimestamp(existingItem.updated_at, now);
      this.db
        .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
        .run(nextQuantity, roundMoney(unitPrice * nextQuantity), itemUpdatedAt, itemId);
    } else {
      this.db
        .prepare(`
          INSERT INTO table_order_items (
            id, order_id, menu_item_id, product_name, unit_price, currency, quantity, line_total, note, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 'open', ?, ?)
        `)
        .run(itemId, orderId, menuItemId, productName, unitPrice, currency, quantity, roundMoney(unitPrice * quantity), now, now);
    }
    this.recalculateTableOrderTotalInTransaction(orderId, now);
    this.insertAndroidActionEvent(action, "table_order.item_added", "table_order", orderId, {
      item_id: itemId,
      menu_item_id: menuItemId,
      quantity,
      unit_price: unitPrice,
      currency
    }, now);
    return { ok: true, message: "Ürün telefondan adisyona eklendi." };
  }

  private applyAndroidTableOrderItemQuantity(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const itemId = androidPayloadString(action.payload, "item_id");
    const quantity = normalizeOrderQuantity(androidPayloadNumber(action.payload, "quantity", 0));
    if (!itemId || !quantity) {
      return { ok: false, message: "Sipariş satırı veya adet bilgisi geçersiz." };
    }
    const item = this.getMutableTableOrderItem(itemId);
    if (!item) {
      return { ok: false, message: "Güncellenecek aktif sipariş satırı bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_item_updated_at", item.updated_at, "Sipariş satırı");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(item.updated_at, now);
    const orderId = String(item.order_id ?? "");
    this.db
      .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
      .run(quantity, roundMoney(Number(item.unit_price ?? 0) * quantity), updatedAt, itemId);
    this.recalculateTableOrderTotalInTransaction(orderId, now);
    this.insertAndroidActionEvent(action, "table_order.item_quantity_changed", "table_order", orderId, {
      item_id: itemId,
      quantity
    }, now);
    return { ok: true, message: "Ürün adedi telefondan güncellendi." };
  }

  private applyAndroidTableOrderRemoveItem(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const itemId = androidPayloadString(action.payload, "item_id");
    const item = this.getMutableTableOrderItem(itemId);
    if (!item) {
      return { ok: false, message: "Silinecek aktif sipariş satırı bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_item_updated_at", item.updated_at, "Sipariş satırı");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(item.updated_at, now);
    const orderId = String(item.order_id ?? "");
    this.db
      .prepare("UPDATE table_order_items SET status = 'cancelled', updated_at = ? WHERE id = ?")
      .run(updatedAt, itemId);
    this.recalculateTableOrderTotalInTransaction(orderId, now);
    this.insertAndroidActionEvent(action, "table_order.item_removed", "table_order", orderId, { item_id: itemId }, now);
    return { ok: true, message: "Ürün telefondan adisyondan kaldırıldı." };
  }

  private applyAndroidTableOrderStatus(
    action: AndroidSyncAction,
    now: string,
    forcedStatus?: "preparing" | "served" | "payment"
  ): AndroidActionMutationResult {
    const orderId = this.resolveAndroidActiveOrderId(action.payload);
    const status = forcedStatus ?? normalizeStatus(androidPayloadString(action.payload, "status"), ["open", "preparing", "served", "payment"]);
    if (!orderId || !status) {
      return { ok: false, message: "Adisyon veya yeni durum bilgisi geçersiz." };
    }
    const current = this.db
      .prepare("SELECT status, table_id, updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
      .get(orderId) as { status?: string; table_id?: string; updated_at?: string } | undefined;
    if (!current) {
      return { ok: false, message: "Güncellenecek aktif adisyon bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", current.updated_at, "Adisyon");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(current.updated_at, now);
    this.db.prepare("UPDATE table_orders SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, orderId);
    if (status === "preparing") {
      this.db
        .prepare("UPDATE table_order_items SET status = 'preparing', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
        .run(updatedAt, orderId);
    } else if (status === "served") {
      this.db
        .prepare("UPDATE table_order_items SET status = 'served', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
        .run(updatedAt, orderId);
    }
    this.updateTableStatusForOrderInTransaction(String(current.table_id ?? ""), status === "payment" ? "bill_waiting" : "occupied", orderId, now, action);
    this.insertAndroidActionEvent(action, "table_order.status_changed", "table_order", orderId, {
      old_status: String(current.status ?? ""),
      new_status: status
    }, now);
    return { ok: true, message: "Adisyon durumu telefondan güncellendi." };
  }

  private applyAndroidTableOrderClose(
    action: AndroidSyncAction,
    now: string,
    forcedStatus?: "paid" | "cancelled"
  ): AndroidActionMutationResult {
    const orderId = this.resolveAndroidActiveOrderId(action.payload);
    const status = forcedStatus ?? normalizeStatus(androidPayloadString(action.payload, "status"), ["paid", "cancelled"]);
    if (!orderId || !status) {
      return { ok: false, message: "Kapatılacak adisyon veya kapanış durumu geçersiz." };
    }
    const current = this.db
      .prepare("SELECT status, table_id, updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
      .get(orderId) as { status?: string; table_id?: string; updated_at?: string } | undefined;
    if (!current) {
      return { ok: false, message: "Kapatılacak aktif adisyon bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", current.updated_at, "Adisyon");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(current.updated_at, now);
    this.recalculateTableOrderTotalInTransaction(orderId, now);
    this.db
      .prepare("UPDATE table_orders SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?")
      .run(status, now, updatedAt, orderId);
    this.updateTableStatusForOrderInTransaction(String(current.table_id ?? ""), "available", orderId, now, action);
    this.insertAndroidActionEvent(action, status === "paid" ? "table_order.paid" : "table_order.cancelled", "table_order", orderId, {
      old_status: String(current.status ?? ""),
      status
    }, now);
    return { ok: true, message: status === "paid" ? "Adisyon telefondan ödendi olarak kapatıldı." : "Adisyon telefondan iptal edildi." };
  }

  private resolveAndroidActiveOrderId(payload: Record<string, unknown>): string {
    const orderId = androidPayloadString(payload, "order_id");
    if (orderId) {
      return this.isActiveTableOrder(orderId) ? orderId : "";
    }
    const tableId = androidPayloadString(payload, "table_id");
    if (!tableId) {
      return "";
    }
    const order = this.db
      .prepare("SELECT id FROM table_orders WHERE table_id = ? AND status IN ('open', 'preparing', 'served', 'payment') LIMIT 1")
      .get(tableId) as { id?: string } | undefined;
    return String(order?.id ?? "");
  }

  private insertAndroidActionEvent(
    action: AndroidSyncAction,
    type: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
    now: string
  ) {
    this.insertEvent({
      type,
      entityType,
      entityId,
      payload: { ...payload, android_action_id: action.id },
      now,
      actorType: "android",
      actorId: action.device_id
    });
  }

  private getTableOrderById(orderId: string): DesktopTableOrder | null {
    const row = this.db
      .prepare(`
        SELECT
          table_orders.*,
          tables.name AS table_name,
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.quantity
              ELSE 0
            END
          ), 0) AS item_count
        FROM table_orders
        INNER JOIN tables ON tables.id = table_orders.table_id
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        WHERE table_orders.id = ?
        GROUP BY table_orders.id
        LIMIT 1
      `)
      .get(orderId) as Record<string, unknown> | undefined;

    return row ? this.mapTableOrderRow(row) : null;
  }

  private mapTableOrderRow(row: Record<string, unknown>): DesktopTableOrder {
    const id = String(row.id ?? "");
    return {
      id,
      tableId: String(row.table_id ?? ""),
      tableName: String(row.table_name ?? "Masa"),
      status: String(row.status ?? "open") as TableOrderStatus,
      openedAt: String(row.opened_at ?? ""),
      closedAt: String(row.closed_at ?? ""),
      subtotal: roundMoney(Number(row.subtotal ?? 0)),
      discountTotal: roundMoney(Number(row.discount_total ?? 0)),
      total: roundMoney(Number(row.total ?? 0)),
      note: String(row.note ?? ""),
      itemCount: Number(row.item_count ?? 0),
      items: this.getTableOrderItems(id),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? "")
    };
  }

  private getTableOrderItems(orderId: string): DesktopTableOrderItem[] {
    const rows = this.db
      .prepare(`
        SELECT *
        FROM table_order_items
        WHERE order_id = ?
          AND status != 'cancelled'
        ORDER BY created_at ASC, id ASC
      `)
      .all(orderId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      orderId: String(row.order_id ?? ""),
      menuItemId: String(row.menu_item_id ?? ""),
      productName: String(row.product_name ?? "Ürün"),
      unitPrice: roundMoney(Number(row.unit_price ?? 0)),
      currency: normalizeTableOrderCurrency(row.currency),
      quantity: Number(row.quantity ?? 0),
      lineTotal: roundMoney(Number(row.line_total ?? 0)),
      note: String(row.note ?? ""),
      status: String(row.status ?? "open") as TableOrderItemStatus,
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getMutableTableOrderItem(itemId: string): Record<string, unknown> | null {
    if (!itemId) {
      return null;
    }

    const row = this.db
      .prepare(`
        SELECT table_order_items.order_id, table_order_items.unit_price, table_order_items.updated_at
        FROM table_order_items
        INNER JOIN table_orders ON table_orders.id = table_order_items.order_id
        WHERE table_order_items.id = ?
          AND table_order_items.status != 'cancelled'
          AND table_orders.status IN ('open', 'preparing', 'served', 'payment')
        LIMIT 1
      `)
      .get(itemId) as Record<string, unknown> | undefined;

    return row ?? null;
  }

  private findActiveOrderForTables(tableIds: string[]): { id: string; tableId: string } | null {
    const statement = this.db.prepare(`
      SELECT id, table_id
      FROM table_orders
      WHERE table_id = ?
        AND status IN ('open', 'preparing', 'served', 'payment')
      LIMIT 1
    `);
    for (const tableId of tableIds) {
      const row = statement.get(tableId) as { id?: string; table_id?: string } | undefined;
      if (row?.id) {
        return { id: row.id, tableId: String(row.table_id ?? tableId) };
      }
    }
    return null;
  }

  private markPreparedWhatsAppMessagesSentInTransaction(requestId: string, now: string) {
    this.db
      .prepare(`
        UPDATE whatsapp_messages
        SET mode = 'manual_copy',
            status = 'sent',
            sent_at = CASE WHEN sent_at = '' THEN ? ELSE sent_at END,
            updated_at = ?,
            sync_status = 'local_only'
        WHERE request_id = ?
          AND direction = 'outgoing'
          AND status = 'prepared'
          AND deleted_at = ''
      `)
      .run(now, now, requestId);
  }

  private isActiveTableOrder(orderId: string): boolean {
    return Boolean(
      this.db
        .prepare("SELECT id FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
        .get(orderId)
    );
  }

  private updateTableStatusForOrderInTransaction(
    tableId: string,
    status: "available" | "occupied" | "bill_waiting",
    orderId: string,
    now: string,
    androidAction?: AndroidSyncAction
  ) {
    if (!tableId) {
      return;
    }

    const table = this.db
      .prepare("SELECT status, current_customer_id, current_reservation_id, updated_at FROM tables WHERE id = ? AND deleted_at = ''")
      .get(tableId) as { status?: string; current_customer_id?: string; current_reservation_id?: string; updated_at?: string } | undefined;
    const shouldClearAssignment = status === "available"
      && (Boolean(String(table?.current_customer_id ?? "")) || Boolean(String(table?.current_reservation_id ?? "")));
    if (!table || (table.status === status && !shouldClearAssignment)) {
      return;
    }
    const updatedAt = nextMutationTimestamp(table.updated_at, now);

    const updateResult = this.db
      .prepare(`
        UPDATE tables
        SET status = ?,
            current_customer_id = CASE WHEN ? = 'available' THEN '' ELSE current_customer_id END,
            current_reservation_id = CASE WHEN ? = 'available' THEN '' ELSE current_reservation_id END,
            updated_at = ?,
            sync_status = 'local_only'
        WHERE id = ? AND deleted_at = ''
      `)
      .run(status, status, status, updatedAt, tableId);
    if (Number(updateResult.changes) !== 1) {
      throw new Error("Table status could not be synchronized with the active order.");
    }
    const payload = {
      old_status: String(table.status ?? ""),
      new_status: status,
      source: "table_order",
      order_id: orderId
    };
    if (androidAction) {
      this.insertAndroidActionEvent(androidAction, "table.status_changed", "table", tableId, payload, now);
    } else {
      this.insertEvent({
        type: "table.status_changed",
        entityType: "table",
        entityId: tableId,
        payload,
        now
      });
    }
  }

  private recalculateTableOrderTotalInTransaction(orderId: string, now: string) {
    const row = this.db
      .prepare(`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.line_total
              ELSE 0
            END
          ), 0) AS subtotal,
          table_orders.discount_total AS discount_total,
          table_orders.updated_at AS updated_at
        FROM table_orders
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        WHERE table_orders.id = ?
        GROUP BY table_orders.id
      `)
      .get(orderId) as { subtotal?: number; discount_total?: number; updated_at?: string } | undefined;
    if (!row) {
      throw new Error("Table order not found while recalculating totals.");
    }

    const subtotal = roundMoney(Number(row.subtotal ?? 0));
    const discountTotal = roundMoney(Number(row.discount_total ?? 0));
    const total = roundMoney(Math.max(0, subtotal - discountTotal));
    const updatedAt = nextMutationTimestamp(row.updated_at, now);
    this.db
      .prepare("UPDATE table_orders SET subtotal = ?, total = ?, updated_at = ? WHERE id = ?")
      .run(subtotal, total, updatedAt, orderId);
  }

  private getTableOrderMutationResult(orderId: string, message: string, includeDashboardData = false): DesktopTableOrderResult {
    const order = this.getTableOrderById(orderId);
    return order
      ? {
          ok: true,
          message,
          order,
          ...(includeDashboardData ? { dashboardData: this.getDashboardData() } : {})
        }
      : { ok: false, message: "Adisyon güncellendi ancak yeniden yüklenemedi." };
  }

  private insertEvent(input: {
    type: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
    now: string;
    actorType?: "desktop" | "android";
    actorId?: string;
  }) {
    this.db
      .prepare(`
        INSERT INTO events (
          id,
          type,
          actor_type,
          actor_id,
          entity_type,
          entity_id,
          payload_json,
          created_at,
          updated_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
      `)
      .run(
        createId("event_"),
        input.type,
        input.actorType ?? "desktop",
        input.actorId ?? "",
        input.entityType,
        input.entityId,
        JSON.stringify(input.payload),
        input.now,
        input.now
      );
  }

  private ensureSyncClientId() {
    const settings = this.db
      .prepare("SELECT id, sync_client_id FROM settings WHERE deleted_at = '' LIMIT 1")
      .get() as { id?: string; sync_client_id?: string } | undefined;
    if (!settings?.id || String(settings.sync_client_id ?? "").trim()) {
      return;
    }
    const clientId = `desktop-${randomUUID()}`;
    this.db
      .prepare("UPDATE settings SET sync_client_id = ?, updated_at = ? WHERE id = ?")
      .run(clientId, new Date().toISOString(), settings.id);
  }

  private readSqlFiles(relativeDir: string) {
    const directory = path.join(this.options.appPath, relativeDir);
    if (!fs.existsSync(directory)) {
      return [];
    }

    return fs
      .readdirSync(directory)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => ({
        name: file,
        sql: fs.readFileSync(path.join(directory, file), "utf8")
      }));
  }
}

const ANDROID_PERMISSION_SET = new Set<string>(ANDROID_PERMISSIONS);
const SUPPORTED_AI_SERVICES = new Set<DesktopAiService>(["openai", "openrouter", "groq", "gemini", "custom"]);
const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";
const GOOGLE_AI_STUDIO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_AI_TIMEOUT_SECONDS = 30;
const TABLE_ORDER_STATUSES = ["open", "preparing", "served", "payment", "paid", "cancelled"];

function normalizeAndroidDeviceId(value: unknown): string {
  const deviceId = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{6,120}$/.test(deviceId) ? deviceId : "";
}

function normalizeAndroidDeviceRole(value: unknown): AndroidDeviceRole {
  return String(value ?? "").trim() === "admin" ? "admin" : "staff";
}

function normalizeAndroidDeviceRoleInput(value: unknown): AndroidDeviceRole | null {
  const role = String(value ?? "").trim();
  return role === "admin" || role === "staff" ? role : null;
}

function androidPermissionsForRole(role: AndroidDeviceRole): AndroidPermission[] {
  return [...(role === "admin" ? ANDROID_ADMIN_PERMISSIONS : ANDROID_STAFF_PERMISSIONS)];
}

function emptyAndroidPermissionGroups(): AndroidPermissionGroups {
  return {
    service_orders: false,
    cashier: false,
    rooms_tasks: false,
    customer_reservation: false
  };
}

function parseStoredAndroidPermissionGroups(value: unknown): AndroidPermissionGroups {
  try {
    const parsed = JSON.parse(String(value ?? "{}")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyAndroidPermissionGroups();
    }
    const record = parsed as Record<string, unknown>;
    const groups = emptyAndroidPermissionGroups();
    for (const groupId of ANDROID_PERMISSION_GROUP_IDS) {
      groups[groupId] = record[groupId] === true;
    }
    return groups;
  } catch {
    return emptyAndroidPermissionGroups();
  }
}

function normalizeAndroidPermissionGroupsInput(value: unknown): AndroidPermissionGroups | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (ANDROID_PERMISSION_GROUP_IDS.some((groupId) => typeof record[groupId] !== "boolean")) {
    return null;
  }
  return Object.fromEntries(ANDROID_PERMISSION_GROUP_IDS.map((groupId) => [groupId, record[groupId]])) as AndroidPermissionGroups;
}

function effectiveAndroidPermissions(role: AndroidDeviceRole, value: unknown): AndroidPermission[] {
  if (role === "admin") {
    return androidPermissionsForRole("admin");
  }
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return [...new Set(parsed
      .map((permission) => String(permission).trim())
      .filter((permission): permission is AndroidPermission => ANDROID_PERMISSION_SET.has(permission)))];
  } catch {
    return [];
  }
}

function normalizeAndroidTimestamp(value: unknown, fallback: string): string {
  const timestamp = String(value ?? "").trim();
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function normalizeAiService(value: unknown): DesktopAiService | null {
  const service = String(value ?? "").trim().toLowerCase();
  return SUPPORTED_AI_SERVICES.has(service as DesktopAiService) ? service as DesktopAiService : null;
}

function normalizeStoredAiService(value: unknown): DesktopAiService {
  return normalizeAiService(value) ?? "openai";
}

function normalizeAiBaseUrl(value: unknown): string {
  const candidate = String(value ?? "").trim();
  if (!candidate) {
    return "";
  }

  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) {
      return "";
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function normalizeStoredAiBaseUrl(value: unknown): string {
  return normalizeAiBaseUrl(value) || DEFAULT_AI_BASE_URL;
}

function normalizeAiTimeout(value: unknown): number | null {
  const timeout = Number(value);
  return Number.isInteger(timeout) && timeout >= 5 && timeout <= 120 ? timeout : null;
}

function normalizeStoredAiTimeout(value: unknown): number {
  return normalizeAiTimeout(value) ?? DEFAULT_AI_TIMEOUT_SECONDS;
}

function normalizeStoredTimestamp(value: unknown): string {
  const timestamp = String(value ?? "").trim();
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : "";
}

function normalizePublishedTimestamp(value: string): string {
  return normalizeStoredTimestamp(value);
}

function resolveEncryptedAiApiKey(input: {
  rawKeyProvided: boolean;
  clearRequested: boolean;
  write: AiApiKeyWrite;
  existingEncryptedValue: string;
}): { ok: true; encryptedValue: string } | { ok: false; message: string } {
  const encryptedValue = String(input.write.encryptedValue ?? "").trim();

  if (input.clearRequested) {
    if (input.rawKeyProvided || input.write.mode !== "clear" || encryptedValue) {
      return {
        ok: false,
        message: "AI güvenlik anahtarını silme isteği güvenli depolama işlemiyle eşleşmiyor."
      };
    }

    return { ok: true, encryptedValue: "" };
  }

  if (input.rawKeyProvided) {
    if (input.write.mode !== "replace" || !encryptedValue) {
      return {
        ok: false,
        message: "Yeni AI güvenlik anahtarı şifrelenmeden kaydedilemez."
      };
    }

    return { ok: true, encryptedValue };
  }

  if (input.write.mode !== "keep" || encryptedValue) {
    return {
      ok: false,
      message: "Boş AI güvenlik anahtarı mevcut kayıt korunarak kaydedilmeli."
    };
  }

  return { ok: true, encryptedValue: input.existingEncryptedValue };
}

function normalizeInteger(value: number) {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function normalizePrice(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeOrderQuantity(value: number): number | null {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 999 ? quantity : null;
}

function createTableOrderId(prefix: "table_order_" | "table_order_item_"): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "") || "000000";
  return `${prefix}${timestamp}_${randomPart}`;
}

function createAndroidEntityId(prefix: "reservation_" | "table_order_" | "table_order_item_", actionId: string): string {
  const digest = createHash("sha256").update(actionId).digest("hex").slice(0, 48);
  return `${prefix}android_${digest}`;
}

function androidPayloadString(payload: Record<string, unknown>, field: string): string {
  return typeof payload[field] === "string" ? payload[field].trim() : "";
}

function getAndroidVersionConflict(
  payload: Record<string, unknown>,
  field: string,
  actualUpdatedAt: unknown,
  entityLabel: string
): AndroidActionMutationResult | null {
  const expectedUpdatedAt = androidPayloadString(payload, field);
  if (!expectedUpdatedAt || expectedUpdatedAt === String(actualUpdatedAt ?? "")) {
    return null;
  }
  return {
    ok: false,
    message: `${entityLabel} masaüstünde değişmiş. Telefonda canlı veriyi yenileyip tekrar deneyin.`
  };
}

function nextMutationTimestamp(previousUpdatedAt: unknown, candidate: string): string {
  const previous = String(previousUpdatedAt ?? "").trim();
  const previousTime = Date.parse(previous);
  const candidateTime = Date.parse(candidate);
  if (!Number.isFinite(previousTime) || !Number.isFinite(candidateTime) || candidateTime > previousTime) {
    return candidate;
  }
  return new Date(previousTime + 1).toISOString();
}

function androidPayloadNumber(payload: Record<string, unknown>, field: string, fallback: number): number {
  const value = Number(payload[field]);
  return Number.isFinite(value) ? value : fallback;
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  return currency || "TRY";
}

function normalizeTableOrderCurrency(value: unknown): string {
  const currency = String(value ?? "TRY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "TRY";
}

function parseAiWorkspacePayload(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? "{}")) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeStringArray(value: string[]) {
  return value.map((item) => item.trim()).filter(Boolean);
}

function normalizeRequestType(value: string) {
  const allowed = new Set([
    "general_info",
    "pension_reservation",
    "restaurant_reservation",
    "breakfast_request",
    "qr_menu_question",
    "location_question",
    "price_question",
    "other"
  ]);
  const requestType = value.trim();
  return allowed.has(requestType) ? requestType : "general_info";
}

function normalizePriority(value: string) {
  const allowed = new Set(["low", "normal", "high", "urgent"]);
  const priority = value.trim();
  return allowed.has(priority) ? priority : "normal";
}

function normalizeDateInput(value: string) {
  const date = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizeTimeInput(value: string) {
  const time = value.trim();
  return /^\d{2}:\d{2}$/.test(time) ? time : "";
}

function getCustomerTagsForSource(source: string) {
  if (source === "manual") {
    return ["manuel", "talep"];
  }

  if (source === "web_ai") {
    return ["web", "ai", "talep"];
  }

  if (source === "whatsapp") {
    return ["whatsapp", "talep"];
  }

  return ["web", "talep"];
}

function buildManualRequestReply(customerName: string) {
  return `Merhaba ${customerName}, talebinizi aldık. Detayları kontrol edip size dönüş yapacağız.`;
}

function normalizeStatus(value: string, allowed: string[]) {
  const status = value.trim();
  return allowed.includes(status) ? status : "";
}

function normalizeUrl(value: string) {
  const url = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(url) ? url : "";
}

function normalizeBusinessType(value: string) {
  const supported = new Set(["pension", "restaurant", "pension_restaurant", "cafe", "other"]);
  return supported.has(value) ? value : "pension_restaurant";
}

function slugifyBusinessName(value: string) {
  return (
    value
      .trim()
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "firma"
  );
}

function getReservationTypeForRequest(requestType: string) {
  if (requestType === "pension_reservation") {
    return "room";
  }

  if (requestType === "restaurant_reservation" || requestType === "breakfast_request") {
    return "table";
  }

  return "other";
}

function buildReservationTitle(request: Record<string, unknown>, reservationType: string) {
  const name = String(request.customer_name ?? "Misafir").trim() || "Misafir";
  const labels: Record<string, string> = {
    room: "oda rezervasyonu",
    table: "masa rezervasyonu",
    other: "rezervasyon"
  };

  return `${name} - ${labels[reservationType] ?? "rezervasyon"}`;
}

function buildReservationNotes(request: Record<string, unknown>) {
  const message = String(request.message ?? "").trim();
  const summary = String(request.ai_summary ?? "").trim();
  const parts = [message, summary ? `AI özet: ${summary}` : ""].filter(Boolean);

  return parts.join("\n");
}
