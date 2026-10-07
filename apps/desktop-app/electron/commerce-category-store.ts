import { DatabaseSync } from "node:sqlite";
import {
  createId,
  type CatalogCategory
} from "@yardimci-asistan/shared";

export interface ListCatalogCategoriesOptions {
  search?: string;
  parentId?: string;
  activeOnly?: boolean;
  limit?: number;
}

export interface SaveCatalogCategoryInput {
  id?: string;
  parentId?: string;
  name: string;
  code?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface DeleteCatalogCategoryResult {
  id: string;
  deletedAt: string;
}

function openDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function activeBusinessId(database: DatabaseSync) {
  const row = database.prepare(`
    SELECT id
    FROM business
    WHERE deleted_at = ''
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id?: unknown } | undefined;
  const businessId = String(row?.id ?? "").trim();
  if (!businessId) throw new Error("Aktif işletme bulunamadı.");
  return businessId;
}

function normalizeLimit(value: unknown, fallback = 200, maximum = 500) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(numeric)));
}

function normalizeSortOrder(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-1_000_000, Math.min(1_000_000, Math.trunc(numeric)));
}

function mapCategory(row: Record<string, unknown>): CatalogCategory {
  return {
    id: String(row.id ?? ""),
    businessId: String(row.business_id ?? ""),
    parentId: String(row.parent_id ?? ""),
    name: String(row.name ?? ""),
    code: String(row.code ?? ""),
    sortOrder: normalizeSortOrder(row.sort_order),
    isActive: Number(row.is_active ?? 0) === 1,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function getCategoryRow(database: DatabaseSync, businessId: string, categoryId: string) {
  return database.prepare(`
    SELECT *
    FROM catalog_categories
    WHERE id = ? AND business_id = ? AND deleted_at = ''
    LIMIT 1
  `).get(categoryId, businessId) as Record<string, unknown> | undefined;
}

function assertValidParentChain(
  database: DatabaseSync,
  businessId: string,
  categoryId: string,
  parentId: string
) {
  if (!parentId) return;
  if (parentId === categoryId) {
    throw new Error("Kategori kendi üst kategorisi olamaz.");
  }

  const visited = new Set<string>([categoryId]);
  let currentId = parentId;

  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error("Kategori hiyerarşisinde döngü oluşturulamaz.");
    }
    visited.add(currentId);

    const current = getCategoryRow(database, businessId, currentId);
    if (!current) throw new Error("Üst kategori bulunamadı.");
    currentId = String(current.parent_id ?? "").trim();
  }
}

export function listCatalogCategories(
  databasePath: string,
  options: ListCatalogCategoriesOptions = {}
): CatalogCategory[] {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const conditions = ["business_id = ?", "deleted_at = ''"];
    const params: Array<string | number> = [businessId];
    const search = String(options.search ?? "").trim();

    if (options.activeOnly) conditions.push("is_active = 1");
    if (options.parentId !== undefined) {
      conditions.push("parent_id = ?");
      params.push(String(options.parentId ?? "").trim());
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push("(name LIKE ? COLLATE NOCASE OR code LIKE ? COLLATE NOCASE)");
      params.push(pattern, pattern);
    }
    params.push(normalizeLimit(options.limit));

    return (database.prepare(`
      SELECT *
      FROM catalog_categories
      WHERE ${conditions.join(" AND ")}
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC, id ASC
      LIMIT ?
    `).all(...params) as Array<Record<string, unknown>>).map(mapCategory);
  } finally {
    database.close();
  }
}

export function getCatalogCategory(databasePath: string, categoryIdInput: string): CatalogCategory | null {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const categoryId = String(categoryIdInput ?? "").trim();
    if (!categoryId) throw new Error("Kategori kimliği boş olamaz.");
    const row = getCategoryRow(database, businessId, categoryId);
    return row ? mapCategory(row) : null;
  } finally {
    database.close();
  }
}

export function saveCatalogCategory(
  databasePath: string,
  input: SaveCatalogCategoryInput
): CatalogCategory {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) throw new Error("Kategori adı gerekli.");
    if (name.length > 160) throw new Error("Kategori adı en fazla 160 karakter olabilir.");

    const id = String(input.id ?? "").trim() || createId("cat_");
    const parentId = String(input.parentId ?? "").trim();
    const code = String(input.code ?? "").trim().slice(0, 80);
    const isActive = input.isActive !== false;
    const now = new Date().toISOString();

    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = getCategoryRow(database, businessId, id);
      if (input.id && !existing) throw new Error("Düzenlenecek kategori bulunamadı.");
      const sortOrder = input.sortOrder === undefined
        ? Number(existing?.sort_order ?? (database.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM catalog_categories WHERE business_id = ? AND deleted_at = ''").get(businessId) as { value: number }).value)
        : normalizeSortOrder(input.sortOrder);
      assertValidParentChain(database, businessId, id, parentId);

      database.prepare(`
        INSERT INTO catalog_categories (
          id, business_id, parent_id, name, code, sort_order,
          is_active, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
        ON CONFLICT(id) DO UPDATE SET
          parent_id = excluded.parent_id,
          name = excluded.name,
          code = excluded.code,
          sort_order = excluded.sort_order,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at,
          deleted_at = ''
      `).run(
        id,
        businessId,
        parentId,
        name,
        code,
        sortOrder,
        isActive ? 1 : 0,
        String(existing?.created_at ?? now),
        now
      );

      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    const saved = getCategoryRow(database, businessId, id);
    if (!saved) throw new Error("Kategori kaydedildi ancak yeniden okunamadı.");
    return mapCategory(saved);
  } finally {
    database.close();
  }
}

export function deleteCatalogCategory(
  databasePath: string,
  categoryIdInput: string
): DeleteCatalogCategoryResult {
  const database = openDatabase(databasePath);
  try {
    const businessId = activeBusinessId(database);
    const categoryId = String(categoryIdInput ?? "").trim();
    if (!categoryId) throw new Error("Kategori kimliği boş olamaz.");
    const now = new Date().toISOString();

    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = getCategoryRow(database, businessId, categoryId);
      if (!existing) throw new Error("Silinecek kategori bulunamadı.");

      const child = database.prepare(`
        SELECT id
        FROM catalog_categories
        WHERE business_id = ? AND parent_id = ? AND deleted_at = ''
        LIMIT 1
      `).get(businessId, categoryId) as { id?: unknown } | undefined;
      if (child?.id) {
        throw new Error("Alt kategorisi bulunan kategori silinemez.");
      }

      const product = database.prepare(`
        SELECT id
        FROM catalog_products
        WHERE business_id = ? AND category_id = ? AND deleted_at = ''
        LIMIT 1
      `).get(businessId, categoryId) as { id?: unknown } | undefined;
      if (product?.id) {
        throw new Error("Ürün bağlı olan kategori silinemez. Önce ürünleri başka kategoriye taşıyın.");
      }

      database.prepare(`
        UPDATE catalog_categories
        SET is_active = 0, updated_at = ?, deleted_at = ?
        WHERE id = ? AND business_id = ? AND deleted_at = ''
      `).run(now, now, categoryId, businessId);

      database.exec("COMMIT");
      return { id: categoryId, deletedAt: now };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}
