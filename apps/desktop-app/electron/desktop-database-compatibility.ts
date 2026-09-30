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

interface CanonicalTable {
  name: string;
  columns: string[];
}

const GUEST_BOOTSTRAP_TABLES = new Set([
  "hospitality_entry_receipts",
  "stay_guests",
  "hospitality_notifications",
  "stay_room_history"
]);

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

function canonicalTables(schemaSql: string): CanonicalTable[] {
  const canonical = new DatabaseSync(":memory:");
  try {
    canonical.exec("PRAGMA foreign_keys = ON;");
    canonical.exec(schemaSql);
    const rows = canonical.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `).all() as Array<{ name?: unknown }>;

    return rows.map((row) => {
      const name = String(row.name ?? "");
      return {
        name,
        columns: [...tableColumns(canonical, name)]
      };
    });
  } finally {
    canonical.close();
  }
}

function guestBootstrapCanRun(database: DatabaseSync) {
  return [...GUEST_BOOTSTRAP_TABLES].every((tableName) => !tableExists(database, tableName));
}

export function currentDesktopSchemaProblem(
  database: DatabaseSync,
  schemaSql: string,
  options: { allowGuestBootstrap?: boolean } = {}
): string {
  const allowGuestBootstrap = options.allowGuestBootstrap === true && guestBootstrapCanRun(database);

  for (const table of canonicalTables(schemaSql)) {
    if (!tableExists(database, table.name)) {
      if (allowGuestBootstrap && GUEST_BOOTSTRAP_TABLES.has(table.name)) continue;
      return `Eksik tablo: ${table.name}`;
    }

    const columns = tableColumns(database, table.name);
    for (const columnName of table.columns) {
      if (!columns.has(columnName)) {
        return `Eksik alan: ${table.name}.${columnName}`;
      }
    }
  }

  return "";
}

export function assertCurrentDesktopSchema(database: DatabaseSync, schemaSql: string) {
  const problem = currentDesktopSchemaProblem(database, schemaSql);
  if (problem) throw new Error(CURRENT_DESKTOP_SCHEMA_ERROR);
}

export function inspectDesktopDatabaseCompatibility(
  databasePath: string,
  schemaPath: string
): DesktopDatabaseCompatibility {
  if (!fs.existsSync(databasePath)) {
    return { state: "fresh", reason: "Yerel veritabanı henüz oluşturulmamış." };
  }
  if (!fs.existsSync(schemaPath)) {
    return { state: "unreadable", reason: "Güncel masaüstü şeması bulunamadı." };
  }

  let database: DatabaseSync | null = null;
  try {
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
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

    const problem = currentDesktopSchemaProblem(database, schemaSql, { allowGuestBootstrap: true });
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
