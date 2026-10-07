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
export function reorderCatalogRecords(databasePath: string, kind: CatalogOrderKind, orderedIds: string[]): void {
  if (!["categories", "products", "quickAccess"].includes(kind)) throw new Error("Katalog sıralama türü geçersiz.");
  if (!Array.isArray(orderedIds) || orderedIds.some(id => typeof id !== "string" || !id.trim()) || new Set(orderedIds).size !== orderedIds.length) {
    throw new Error("Katalog sıralama kimlikleri geçersiz.");
  }
  mutateCatalogPresentation(databasePath, (db, businessId, now) => {
    const table = kind === "categories" ? "catalog_categories" : "catalog_products";
    const column = kind === "quickAccess" ? "quick_access_order" : "sort_order";
    const filter = kind === "quickAccess" ? " AND quick_access_enabled = 1" : "";
    const ids = (db.prepare(`SELECT id FROM ${table} WHERE business_id = ? AND deleted_at = ''${filter}`).all(businessId) as { id: string }[]).map(row => row.id);
    if (ids.length !== orderedIds.length || ids.some(id => !orderedIds.includes(id))) throw new Error("Katalog sıralama listesi değişti; yeniden yükleyin.");
    const statement = db.prepare(`UPDATE ${table} SET ${column} = ?, updated_at = ? WHERE id = ? AND business_id = ? AND deleted_at = ''`);
    orderedIds.forEach((id, index) => statement.run(index, now, id, businessId));
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

export function deleteCatalogProduct(databasePath: string, productId: string): void {
  mutateCatalogPresentation(databasePath, (db, businessId, now) => {
    const result = db.prepare("UPDATE catalog_products SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ? AND business_id = ? AND deleted_at = ''").run(now, now, productId, businessId);
    if (!result.changes) throw new Error("Düzenlenecek ürün bulunamadı.");
  });
}
