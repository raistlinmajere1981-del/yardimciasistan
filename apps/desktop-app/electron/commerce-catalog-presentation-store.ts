import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store";

export type CatalogOrderKind = "categories" | "products" | "quickAccess";

function mutateCatalogPresentation<T>(databasePath: string, operation: (db: DatabaseSync, businessId: string, now: string) => T): T {
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE");
    try {
      if (!readEnabledBusinessCapabilities(db).includes(C.CATALOG)) throw new Error("Ürün kataloğu bu işletmede etkin değil.");
      const businessId = String((db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get() as { id?: string } | undefined)?.id ?? "");
      if (!businessId) throw new Error("Aktif işletme bulunamadı.");
      const result = operation(db, businessId, new Date().toISOString());
      db.exec("COMMIT");
      return result;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } finally { db.close(); }
}

/** Reordering writes only presentation fields, never product prices/stock/image drafts. */
export function reorderCatalogRecords(databasePath: string, kind: CatalogOrderKind, orderedIds: string[], page?: { offset: number; total: number }): void {
  if (!["categories", "products", "quickAccess"].includes(kind)) throw new Error("Katalog sıralama türü geçersiz.");
  if (!Array.isArray(orderedIds) || orderedIds.some(id => typeof id !== "string" || !id.trim()) || new Set(orderedIds).size !== orderedIds.length) {
    throw new Error("Katalog sıralama kimlikleri geçersiz.");
  }
  mutateCatalogPresentation(databasePath, (db, businessId, now) => {
    const table = kind === "categories" ? "catalog_categories" : "catalog_products";
    const column = kind === "quickAccess" ? "quick_access_order" : "sort_order";
    const filter = kind === "quickAccess" ? " AND quick_access_enabled = 1" : "";
    const rows = db.prepare(`SELECT id FROM ${table} WHERE business_id = ? AND deleted_at = ''${filter}
      ORDER BY ${column} ASC, ${kind === "quickAccess" ? "sort_order ASC, " : ""}name COLLATE NOCASE ASC, id ASC`).all(businessId) as { id: string }[];
    const ids = rows.map(row => row.id);
    const offset = page?.offset ?? 0;
    if (!Number.isInteger(offset) || offset < 0 || (page && (kind === "categories" || page.total !== ids.length))) throw new Error("Katalog sıralama listesi değişti; yeniden yükleyin.");
    const expected = page ? ids.slice(offset, offset + orderedIds.length) : ids;
    const submitted = new Set(orderedIds);
    if (expected.length !== orderedIds.length || expected.some(id => !submitted.has(id))) throw new Error("Katalog sıralama listesi değişti; yeniden yükleyin.");
    const nextIds = [...ids];
    nextIds.splice(offset, orderedIds.length, ...orderedIds);
    const statement = db.prepare(`UPDATE ${table} SET ${column} = ?, updated_at = ? WHERE id = ? AND business_id = ? AND deleted_at = ''`);
    nextIds.forEach((id, index) => statement.run(index, now, id, businessId));
  });
}

export function setCatalogProductQuickAccess(databasePath: string, productId: string, enabled: boolean): void {
  if (typeof enabled !== "boolean") throw new Error("Hızlı erişim tercihi geçersiz.");
  mutateCatalogPresentation(databasePath, (db, businessId, now) => {
    const row = db.prepare("SELECT quick_access_enabled FROM catalog_products WHERE id = ? AND business_id = ? AND deleted_at = ''").get(productId, businessId) as { quick_access_enabled: number } | undefined;
    if (!row) throw new Error("Düzenlenecek ürün bulunamadı.");
    if ((row.quick_access_enabled === 1) === enabled) return;
    const next = Number((db.prepare("SELECT COALESCE(MAX(quick_access_order), -1) + 1 AS value FROM catalog_products WHERE business_id = ? AND quick_access_enabled = 1 AND deleted_at = ''").get(businessId) as { value: number }).value);
    db.prepare("UPDATE catalog_products SET quick_access_enabled = ?, quick_access_order = ?, updated_at = ? WHERE id = ? AND business_id = ?")
      .run(enabled ? 1 : 0, next, now, productId, businessId);
  });
}

/** Activation preserves the current product fields instead of resaving a renderer snapshot. */
export function activateCatalogProduct(databasePath: string, productId: string): void {
  mutateCatalogPresentation(databasePath, (db, businessId, now) => {
    const row = db.prepare("SELECT is_active FROM catalog_products WHERE id = ? AND business_id = ? AND deleted_at = ''").get(productId, businessId) as { is_active: number } | undefined;
    if (!row) throw new Error("Düzenlenecek ürün bulunamadı.");
    if (row.is_active === 1) return;
    db.prepare("UPDATE catalog_products SET is_active = 1, updated_at = ? WHERE id = ? AND business_id = ? AND deleted_at = ''").run(now, productId, businessId);
  });
}

export function deleteCatalogProduct(databasePath: string, productId: string): void {
  mutateCatalogPresentation(databasePath, (db, businessId, now) => {
    if (db.prepare(`SELECT 1 FROM table_order_items i JOIN table_orders o ON o.id = i.order_id
      WHERE i.product_id = ? AND i.status <> 'cancelled' AND o.status IN ('open', 'preparing', 'served', 'payment')
      UNION ALL SELECT 1 FROM room_folio_items i JOIN room_folios f ON f.id = i.folio_id
      WHERE i.product_id = ? AND i.deleted_at = '' AND f.status = 'open' LIMIT 1`).get(productId, productId)) {
      throw new Error("Açık adisyon veya oda hesabındaki ürün silinemez.");
    }
    const result = db.prepare("UPDATE catalog_products SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ? AND business_id = ? AND deleted_at = ''").run(now, now, productId, businessId);
    if (!result.changes) throw new Error("Düzenlenecek ürün bulunamadı.");
    db.prepare("UPDATE menu_product_entries SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE product_id = ? AND deleted_at = ''").run(now, now, productId);
    db.prepare("UPDATE commerce_product_publications SET is_published = 0, updated_at = ? WHERE product_id = ? AND business_id = ?").run(now, productId, businessId);
  });
}
