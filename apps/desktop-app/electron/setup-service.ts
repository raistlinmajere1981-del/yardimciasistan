import type { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES,
  createId,
  getBusinessProfile,
  normalizeBirthdaySettings,
  normalizeBusinessType,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { DesktopSetupData } from "./database-types.js";
import { getAiServiceProfiles as getStoredAiServiceProfiles } from "./database/ai-profile-store.js";
import { getTableCategories as getStoredTableCategories } from "./database/table-store.js";
import {
  normalizeStoredAiService,
  normalizeStoredTimestamp
} from "./database/ai-settings-utils.js";
import { normalizeBoolean } from "./database/request-utils.js";
import {
  normalizeTableCategoryName,
  reconcileTableName,
  tableCategoryKey,
  type NormalizedTableCategoryInput
} from "./database/table-category-utils.js";

export function getSetupData(db: DatabaseSync, enabledCapabilities: ReadonlySet<BusinessCapability>): DesktopSetupData {
  const business = db.prepare("SELECT * FROM business WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
  const settings = db.prepare("SELECT * FROM settings WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
  const syncSecret = String(settings?.sync_secret ?? "");
  const businessName = String(business?.display_name ?? "");
  const aiService = normalizeStoredAiService(settings?.ai_service);
  const aiProfiles = getStoredAiServiceProfiles(db);
  const activeAiProfile = aiProfiles.find((profile) => profile.service === aiService);
  const profileId = normalizeBusinessType(String(business?.profile_id ?? ""));
  const profile = getBusinessProfile(profileId);
  const setupCompleted = Number(settings?.setup_completed ?? 0) === 1;
  const setupRequired =
    !setupCompleted ||
    !businessName.trim() ||
    syncSecret.length < 12 ||
    syncSecret === "change-this-secret";

  return {
    setupRequired,
    appPasswordConfigured: Boolean(String(settings?.app_password_verifier ?? "").trim()),
    businessName,
    profileId,
    profileOptions: setupCompleted
      ? profile.optionalCapabilities.filter((capability) => enabledCapabilities.has(capability))
      : [...profile.defaultOptionalCapabilities],
    phone: String(business?.phone ?? ""),
    whatsapp: String(business?.whatsapp ?? ""),
    email: String(business?.email ?? ""),
    address: String(business?.address ?? ""),
    webModuleUrl: String(settings?.web_module_url ?? "https://yardimciasistan.alwaysdata.net/yardimci-asistan"),
    syncSecret,
    autoSyncEnabled: Number(settings?.auto_sync_enabled ?? 1) === 1,
    localNetworkEnabled: Number(settings?.local_network_enabled ?? 1) === 1,
    aiEnabled: enabledCapabilities.has(BUSINESS_CAPABILITIES.AI),
    aiProvider: String(settings?.ai_provider ?? "openai_compatible") || "openai_compatible",
    aiService,
    aiProjectName: activeAiProfile?.projectName ?? "",
    aiModel: activeAiProfile?.model ?? "",
    aiBaseUrl: activeAiProfile?.baseUrl ?? "",
    aiTimeoutSeconds: activeAiProfile?.timeoutSeconds ?? 30,
    aiApiKeyConfigured: activeAiProfile?.apiKeyConfigured ?? false,
    aiLastPublishedAt: normalizeStoredTimestamp(settings?.ai_last_published_at),
    aiProfiles,
    productData: {
      enabled: Number(settings?.product_data_enabled ?? 0) === 1,
      provider: "open_food_facts",
      autoSearchUnknownBarcode: Number(settings?.product_data_auto_search ?? 1) === 1,
      includeImages: Number(settings?.product_data_include_images ?? 1) === 1
    },
    servicePreferences: {
      whatsapp: enabledCapabilities.has(BUSINESS_CAPABILITIES.WHATSAPP),
      android: enabledCapabilities.has(BUSINESS_CAPABILITIES.ANDROID)
    },
    initialCounts: {
      rooms: getScalarCount(db, "SELECT COUNT(*) as count FROM rooms WHERE deleted_at = ''"),
      tables: getScalarCount(db, "SELECT COUNT(*) as count FROM tables WHERE deleted_at = ''")
    },
    tableCategories: getStoredTableCategories(db),
    birthdaySettings: normalizeBirthdaySettings({
      enabled: normalizeBoolean(settings?.birthday_enabled, true),
      mode: settings?.birthday_mode === "automatic" ? "automatic" : "manual",
      sendTime: String(settings?.birthday_send_time ?? "10:00"),
      messageTemplate: String(settings?.birthday_message_template ?? "")
    })
  };
}

export function ensureInitialRooms(db: DatabaseSync, targetCount: number, now: string) {
  const count = getScalarCount(db, "SELECT COUNT(*) as count FROM rooms WHERE deleted_at = ''");
  const missing = Math.max(0, targetCount - count);
  const statement = db.prepare(`
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

export function ensureInitialTables(db: DatabaseSync, targetCount: number, now: string) {
  const count = getScalarCount(db, "SELECT COUNT(*) as count FROM tables WHERE deleted_at = ''");
  const missing = Math.max(0, targetCount - count);
  const statement = db.prepare(`
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

export function reconcileTableCategories(
  db: DatabaseSync,
  categories: NormalizedTableCategoryInput[],
  now: string,
  protectedIds: Set<string>
) {
  const tables = db
    .prepare(`
        SELECT id, name, area, capacity, status, is_active, sort_order
        FROM tables
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, name ASC
      `)
    .all() as Array<Record<string, unknown>>;
  const remaining = [...tables];
  const assignments = categories.map((category) => ({
    category,
    tables: [] as Array<Record<string, unknown>>
  }));

  const takeFromRemaining = (
    assignment: (typeof assignments)[number],
    predicate: (table: Record<string, unknown>) => boolean
  ) => {
    for (let index = 0; index < remaining.length && assignment.tables.length < assignment.category.tableCount;) {
      if (predicate(remaining[index])) {
        assignment.tables.push(remaining.splice(index, 1)[0]);
      } else {
        index += 1;
      }
    }
  };

  // Önce kendi kategorisindeki korumalı masaları yerinde tut.
  for (const assignment of assignments) {
    const sourceKey = assignment.category.sourceKey || assignment.category.nameKey;
    takeFromRemaining(assignment, (table) =>
      protectedIds.has(String(table.id ?? ""))
      && tableCategoryKey(normalizeTableCategoryName(table.area)) === sourceKey
    );
  }

  // Kaldırılan veya küçültülen kategorilerdeki aktif masalara mutlaka yeni bir yer ayır.
  const assignFromPool = (protectedOnly: boolean) => {
    for (const assignment of assignments) {
      while (assignment.tables.length < assignment.category.tableCount) {
        const candidateIndex = remaining.findIndex((table) =>
          protectedIds.has(String(table.id ?? "")) === protectedOnly
        );
        if (candidateIndex < 0) {
          break;
        }
        assignment.tables.push(remaining.splice(candidateIndex, 1)[0]);
      }
    }
  };

  assignFromPool(true);

  // Korumalı masalar yerleştirildikten sonra mevcut kategori eşleşmelerini koru.
  for (const assignment of assignments) {
    const sourceKey = assignment.category.sourceKey || assignment.category.nameKey;
    takeFromRemaining(assignment, (table) =>
      !protectedIds.has(String(table.id ?? ""))
      && tableCategoryKey(normalizeTableCategoryName(table.area)) === sourceKey
    );
  }

  assignFromPool(false);
  for (const assignment of assignments) {
    assignment.tables.sort((left, right) =>
      Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0)
      || String(left.name ?? "").localeCompare(String(right.name ?? ""), "tr")
    );
  }

  const updateTable = db.prepare(`
      UPDATE tables
      SET name = ?,
          area = ?,
          is_active = 1,
          sort_order = ?,
          updated_at = ?,
          deleted_at = '',
          sync_status = 'local_only'
      WHERE id = ?
    `);
  const insertTable = db.prepare(`
      INSERT INTO tables (
        id,
        name,
        area,
        capacity,
        status,
        notes,
        is_active,
        sort_order,
        created_at,
        updated_at,
        sync_status
      ) VALUES (?, ?, ?, 4, 'available', '', 1, ?, ?, ?, 'local_only')
    `);
  let sortOrder = 1;

  for (const assignment of assignments) {
    for (let index = 0; index < assignment.category.tableCount; index += 1) {
      const table = assignment.tables[index];
      const position = index + 1;
      if (table) {
        const nextName = reconcileTableName(table.name, table.area, assignment.category.name, position);
        if (
          nextName !== String(table.name ?? "")
          || assignment.category.name !== String(table.area ?? "")
          || sortOrder !== Number(table.sort_order ?? 0)
          || Number(table.is_active ?? 0) !== 1
        ) {
          updateTable.run(
            nextName,
            assignment.category.name,
            sortOrder,
            now,
            String(table.id ?? "")
          );
        }
      } else {
        insertTable.run(
          createId("table_"),
          `${assignment.category.name} ${position}`,
          assignment.category.name,
          sortOrder,
          now,
          now
        );
      }
      sortOrder += 1;
    }
  }

  const archiveTable = db.prepare(`
      UPDATE tables
      SET is_active = 0,
          deleted_at = ?,
          updated_at = ?,
          sync_status = 'local_only'
      WHERE id = ?
    `);
  for (const table of remaining) {
    archiveTable.run(now, now, String(table.id ?? ""));
  }
}

function getScalarCount(db: DatabaseSync, sql: string): number {
  const row = db.prepare(sql).get() as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}
