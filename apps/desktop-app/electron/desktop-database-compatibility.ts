import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

export const CURRENT_DESKTOP_SCHEMA_ERROR =
  "Veritabanı güncel masaüstü şemasını taşımıyor; temiz veri sıfırlaması gerekli.";

export type DesktopDatabaseCompatibilityState =
  | "fresh"
  | "current"
  | "incompatible"
  | "unreadable";

export interface DesktopDatabaseCompatibility {
  state: DesktopDatabaseCompatibilityState;
  reason: string;
}

const REQUIRED_TABLES = [
  "android_local_credentials",
  "desktop_sync_identity",
  "settings"
] as const;

const REQUIRED_COLUMNS = {
  settings: [
    "local_network_enabled",
    "ai_service",
    "ai_last_published_at",
    "google_reviews_enabled",
    "google_place_id",
    "google_places_api_key_encrypted",
    "google_reviews_last_published_at",
    "google_reviews_publish_pending",
    "product_data_enabled"
  ],
  business: [
    "publish_rooms_web",
    "publish_tables_web"
  ],
  tables: [
    "public_description",
    "public_features_json",
    "smoking_policy"
  ]
} as const;

function tableExists(database: DatabaseSync, tableName: string) {
  return Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(tableName));
}

function tableColumns(database: DatabaseSync, tableName: string) {
  return new Set(
    (database.prepare(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`).all() as Array<{ name?: unknown }>)
      .map((column) => String(column.name ?? ""))
  );
}

export function currentDesktopSchemaProblem(database: DatabaseSync): string {
  for (const tableName of REQUIRED_TABLES) {
    if (!tableExists(database, tableName)) {
      return `Eksik tablo: ${tableName}`;
    }
  }

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const columns = tableColumns(database, tableName);
    for (const columnName of requiredColumns) {
      if (!columns.has(columnName)) {
        return `Eksik alan: ${tableName}.${columnName}`;
      }
    }
  }

  return "";
}

export function assertCurrentDesktopSchema(database: DatabaseSync) {
  const problem = currentDesktopSchemaProblem(database);
  if (problem) throw new Error(CURRENT_DESKTOP_SCHEMA_ERROR);
}

export function inspectDesktopDatabaseCompatibility(databasePath: string): DesktopDatabaseCompatibility {
  if (!fs.existsSync(databasePath)) {
    return { state: "fresh", reason: "Yerel veritabanı henüz oluşturulmamış." };
  }

  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(databasePath);

    const quickCheckRow = database.prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
    const quickCheckValue = quickCheckRow ? String(Object.values(quickCheckRow)[0] ?? "") : "";
    if (quickCheckValue.toLowerCase() !== "ok") {
      return {
        state: "unreadable",
        reason: "SQLite bütünlük kontrolü başarısız."
      };
    }

    const existingDomainObject = database.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE name NOT LIKE 'sqlite_%'
        AND type IN ('table', 'index', 'view', 'trigger')
      LIMIT 1
    `).get();

    if (!existingDomainObject) {
      return { state: "fresh", reason: "Yerel veritabanı boş." };
    }

    const problem = currentDesktopSchemaProblem(database);
    if (problem) {
      return { state: "incompatible", reason: problem };
    }

    return { state: "current", reason: "Yerel veritabanı güncel şema ile uyumlu." };
  } catch (error) {
    return {
      state: "unreadable",
      reason: error instanceof Error && error.message.trim()
        ? error.message
        : "Yerel veritabanı okunamadı."
    };
  } finally {
    database?.close();
  }
}
