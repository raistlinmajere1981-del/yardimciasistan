import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES,
  hasBusinessCapability,
  normalizeTablePublicFeatures,
  normalizeTableSmokingPolicy,
  type BusinessCapability,
  type TablePublicCatalog
} from "@yardimci-asistan/shared";
import { getTablePublishedMedia } from "./table-media-service";

export function createPublicTableCatalog(
  databasePath: string,
  capabilities: Iterable<BusinessCapability>,
  userDataPath = ""
): TablePublicCatalog {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  if (!hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_TABLES)) {
    return { version: 1, enabled: false, updatedAt: "", tables: [] };
  }

  const db = new DatabaseSync(databasePath);
  try {
    const publication = db.prepare(
      "SELECT publish_tables_web FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1"
    ).get() as { publish_tables_web?: unknown } | undefined;
    const publicationEnabled = Number(publication?.publish_tables_web ?? 0) === 1;
    if (!publicationEnabled) {
      return { version: 1, enabled: false, updatedAt: "", tables: [] };
    }

    const rows = db.prepare(`
      SELECT id, name, area, capacity, public_description, public_features_json,
             smoking_policy, sort_order, updated_at
      FROM tables
      WHERE deleted_at = '' AND is_active = 1
      ORDER BY sort_order ASC, name ASC
    `).all() as Array<Record<string, unknown>>;

    const tables = rows.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      area: text(row.area),
      capacity: Math.max(1, Math.trunc(Number(row.capacity ?? 1) || 1)),
      description: text(row.public_description),
      features: normalizeTablePublicFeatures(parseArray(row.public_features_json)),
      smokingPolicy: normalizeTableSmokingPolicy(row.smoking_policy),
      sortOrder: Math.max(0, Math.trunc(Number(row.sort_order ?? 0) || 0)),
      media: userDataPath ? getTablePublishedMedia(userDataPath, text(row.id)) : [],
      updatedAt: text(row.updated_at)
    })).filter((table) => table.id && table.name);

    const updatedAt = tables.reduce(
      (latest, table) => table.updatedAt > latest ? table.updatedAt : latest,
      ""
    );

    return {
      version: 1,
      enabled: true,
      updatedAt,
      tables: tables.map(({ updatedAt: _updatedAt, ...table }) => table)
    };
  } finally {
    db.close();
  }
}

function parseArray(value: unknown): unknown[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed as unknown[] : [];
  } catch {
    return [];
  }
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}
