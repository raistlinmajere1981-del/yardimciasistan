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

interface SchemaObject {
  type: string;
  name: string;
  sql: string;
}

function schemaObjects(database: DatabaseSync): Map<string, SchemaObject> {
  const rows = database.prepare(`
    SELECT type, name, sql FROM sqlite_master
    WHERE type IN ('table', 'index', 'view', 'trigger') AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `).all() as Array<{ type: string; name: string; sql: string }>;
  return new Map(rows.map((row) => [
    `${row.type}:${row.name}`,
    { ...row, sql: row.sql.trim() }
  ]));
}

function tableColumns(database: DatabaseSync, tableName: string) {
  return new Set(
    (database.prepare(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`).all() as Array<{ name?: unknown }>)
      .map((column) => String(column.name ?? ""))
  );
}

export function currentDesktopSchemaProblem(
  database: DatabaseSync,
  schemaSql: string
): string {
  const canonical = new DatabaseSync(":memory:");
  try {
    canonical.exec("PRAGMA foreign_keys = ON;");
    canonical.exec(schemaSql);
    const expected = schemaObjects(canonical);
    const actual = schemaObjects(database);

    // Retain useful missing-table/column diagnostics before checking full definitions.
    for (const table of expected.values()) {
      if (table.type !== "table") continue;
      if (!actual.has(`table:${table.name}`)) return `Eksik tablo: ${table.name}`;
      const columns = tableColumns(database, table.name);
      for (const columnName of tableColumns(canonical, table.name)) {
        if (!columns.has(columnName)) return `Eksik alan: ${table.name}.${columnName}`;
      }
    }

    // SQLite's own persisted DDL catalog is the signature, not a historical snapshot
    // or a schema parser. This includes table constraints/defaults/FKs, unique/partial
    // indexes, views and trigger bodies. Only canonical definitions are current;
    // semantically equivalent handwritten DDL is intentionally not a second authority.
    for (const [key, object] of expected) {
      const existing = actual.get(key);
      if (!existing) return `Eksik şema nesnesi: ${key}`;
      if (existing.sql !== object.sql) return `Şema tanımı farklı: ${key}`;
    }
    for (const key of actual.keys()) {
      if (!expected.has(key)) return `Beklenmeyen şema nesnesi: ${key}`;
    }
    return "";
  } finally {
    canonical.close();
  }
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

    const problem = currentDesktopSchemaProblem(database, schemaSql);
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
