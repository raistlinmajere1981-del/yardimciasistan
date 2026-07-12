import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { createId, normalizePhone } from "@yardimci-asistan/shared";
import type { PublishedQrMenu, SyncedCustomerRequest } from "@yardimci-asistan/sync-core";

export interface DesktopDatabaseOptions {
  appPath: string;
  userDataPath: string;
}

export interface DashboardSummary {
  newRequests: number;
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
  menu: PublishedQrMenu;
  summary: DashboardSummary;
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
  aiEnabled: boolean;
  aiProvider: string;
  aiModel: string;
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
  aiEnabled: boolean;
  aiProvider: string;
  aiModel: string;
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

export interface UpdateReservationStatusInput {
  reservationId: string;
  status: string;
}

export interface UpdateDailyTaskStatusInput {
  taskId: string;
  status: string;
}

export interface RecordSyncEventInput {
  direction: string;
  entityType: string;
  ok: boolean;
  recordCount?: number;
  message?: string;
  status?: number;
}

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
  }

  getDashboardData(): DesktopDashboardData {
    const settings = this.db.prepare("SELECT web_module_url FROM settings LIMIT 1").get() as { web_module_url?: string } | undefined;

    return {
      databasePath: this.databasePath,
      backupPath: this.backupPath,
      webModuleUrl: settings?.web_module_url ?? "http://127.0.0.1:8080",
      requests: this.getRequests(),
      rooms: this.getRooms(),
      tables: this.getTables(),
      reservations: this.getReservations(),
      dailyTasks: this.getDailyTasks(),
      customers: this.getCustomers(),
      summary: {
        newRequests: this.getScalarCount("SELECT COUNT(*) as count FROM requests WHERE status = 'new' AND deleted_at = ''"),
        pendingDailyTasks: this.getScalarCount("SELECT COUNT(*) as count FROM daily_tasks WHERE status = 'pending' AND deleted_at = ''"),
        availableRooms: this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE status = 'available' AND is_active = 1 AND deleted_at = ''"),
        totalRooms: this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE is_active = 1 AND deleted_at = ''"),
        availableTables: this.getScalarCount("SELECT COUNT(*) as count FROM tables WHERE status = 'available' AND is_active = 1 AND deleted_at = ''"),
        pendingReservations: this.getScalarCount("SELECT COUNT(*) as count FROM reservations WHERE status = 'pending' AND deleted_at = ''"),
        preparedWhatsAppMessages: this.getScalarCount("SELECT COUNT(*) as count FROM whatsapp_messages WHERE status = 'prepared' AND deleted_at = ''"),
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

  updateReservationStatus(input: UpdateReservationStatusInput): DesktopStatusUpdateResult {
    const reservationId = input.reservationId.trim();
    const status = normalizeStatus(input.status, ["pending", "approved", "rejected", "cancelled", "completed"]);
    if (!reservationId || !status) {
      return {
        ok: false,
        message: "Rezervasyon durumu için geçerli kayıt ve durum seçilmeli."
      };
    }

    const reservation = this.db.prepare("SELECT * FROM reservations WHERE id = ? AND deleted_at = ''").get(reservationId) as Record<string, unknown> | undefined;
    if (!reservation) {
      return {
        ok: false,
        message: "Rezervasyon bulunamadı."
      };
    }

    const roomIds = this.parseStringArray(reservation.room_ids_json);
    const tableIds = this.parseStringArray(reservation.table_ids_json);
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
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
        message: "Yerel veritabanı yedeği oluşturuldu.",
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
      webModuleUrl: String(settings?.web_module_url ?? "http://127.0.0.1:8080"),
      syncSecret,
      aiEnabled: Number(settings?.ai_enabled ?? 0) === 1,
      aiProvider: String(settings?.ai_provider ?? "openai_compatible") || "openai_compatible",
      aiModel: String(settings?.ai_model ?? ""),
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

  saveInitialSetup(input: SaveInitialSetupInput): DesktopSetupSaveResult {
    const businessName = input.businessName.trim();
    const syncSecret = input.syncSecret.trim();
    const webModuleUrl = normalizeUrl(input.webModuleUrl);

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
        message: "Sync güvenlik anahtarı en az 12 karakter olmalı ve varsayılan değer olmamalı."
      };
    }

    const now = new Date().toISOString();
    const existingBusiness = this.db.prepare("SELECT id, created_at FROM business WHERE deleted_at = '' LIMIT 1").get() as { id?: string; created_at?: string } | undefined;
    const existingSettings = this.db.prepare("SELECT id, created_at FROM settings WHERE deleted_at = '' LIMIT 1").get() as { id?: string; created_at?: string } | undefined;
    const businessId = existingBusiness?.id || createId("business_");
    const settingsId = existingSettings?.id || "settings_primary";
    const createdAt = existingBusiness?.created_at || now;
    const settingsCreatedAt = existingSettings?.created_at || now;
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
            ai_enabled,
            ai_provider,
            ai_model,
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'webview', ?, ?, ?, ?, 1, ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            business_id = excluded.business_id,
            web_module_url = excluded.web_module_url,
            sync_secret = excluded.sync_secret,
            ai_enabled = excluded.ai_enabled,
            ai_provider = excluded.ai_provider,
            ai_model = excluded.ai_model,
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
          input.aiEnabled ? 1 : 0,
          input.aiProvider.trim() || "openai_compatible",
          input.aiModel.trim(),
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

  upsertRequests(requests: SyncedCustomerRequest[]) {
    if (requests.length === 0) {
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
          request.sync_status
        );
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
        ORDER BY created_at DESC
        LIMIT 20
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

  private insertEvent(input: {
    type: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
    now: string;
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
        ) VALUES (?, ?, 'desktop', '', ?, ?, ?, ?, ?, 'local_only')
      `)
      .run(createId("event_"), input.type, input.entityType, input.entityId, JSON.stringify(input.payload), input.now, input.now);
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

function normalizeInteger(value: number) {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function normalizePrice(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  return currency || "TRY";
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
