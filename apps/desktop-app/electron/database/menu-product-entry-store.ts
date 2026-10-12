import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type { SaveMenuProductEntryInput } from "../database-types.js";
import { saveCatalogProductInTransaction, type CatalogProductImageMutation } from "../commerce-store.js";
import { normalizeStringArray } from "./request-utils.js";

/** Link or create one canonical product and its menu channel in the caller's transaction. */
export function saveMenuProductEntryInTransaction(db: DatabaseSync, input: SaveMenuProductEntryInput, now: string, image?: CatalogProductImageMutation) {
  const categoryId = String(input.category_id ?? "").trim();
  if (!db.prepare("SELECT 1 FROM menu_categories WHERE id = ? AND deleted_at = ''").get(categoryId)) {
    throw new Error("Ürün için kategori seçilmeli.");
  }
  const existing = input.id ? db.prepare("SELECT * FROM menu_product_entries WHERE id = ? AND deleted_at = ''").get(input.id) : undefined;
  if (input.id && !existing) throw new Error("Menü ürünü bulunamadı.");
  if (existing && input.product) throw new Error("Ürün ayrıntılarını ortak ürün çalışma alanından düzenleyin.");
  if (input.product && (input.product.id || input.product_id)) throw new Error("Yeni ürün veya mevcut ürün bağlantısından yalnız birini seçin.");
  const productId = input.product
    ? saveCatalogProductInTransaction(db, input.product, now, image).id
    : String(input.product_id ?? existing?.product_id ?? "").trim();
  if (existing && productId !== existing.product_id) throw new Error("Menü ilişkisinin ürün kimliği değiştirilemez.");
  if (!db.prepare(`SELECT 1 FROM catalog_products p JOIN business b ON b.id = p.business_id
    WHERE p.id = ? AND p.deleted_at = '' AND b.deleted_at = ''
      AND p.business_id = (SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1)`).get(productId)) throw new Error("Ürün bulunamadı.");
  if (db.prepare("SELECT 1 FROM menu_product_entries WHERE product_id = ? AND deleted_at = '' AND id <> ?").get(productId, input.id ?? "")) {
    throw new Error("Bu ürün zaten menüde.");
  }
  const override = input.price_override == null ? null : Number(input.price_override);
  if (override !== null && (!Number.isFinite(override) || override < 0)) throw new Error("Menü fiyatı geçersiz.");
  const consumption = Math.round(Number(input.stock_consumption_quantity ?? 1) * 10000) / 10000;
  if (!Number.isFinite(consumption) || consumption <= 0) throw new Error("Stok tüketimi sıfırdan büyük olmalı.");
  const id = existing ? String(existing.id) : createId("menu_entry_");
  db.prepare(`INSERT INTO menu_product_entries (
    id, product_id, category_id, price_override, is_available, is_featured, allergens_json, tags_json,
    hide_when_out_of_stock, stock_consumption_quantity, sort_order, created_at, updated_at, sync_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, price_override = excluded.price_override,
    is_available = excluded.is_available, is_featured = excluded.is_featured,
    allergens_json = excluded.allergens_json, tags_json = excluded.tags_json,
    hide_when_out_of_stock = excluded.hide_when_out_of_stock, stock_consumption_quantity = excluded.stock_consumption_quantity,
    sort_order = excluded.sort_order, updated_at = excluded.updated_at, sync_status = 'pending'`)
    .run(id, productId, categoryId, override, input.is_available ? 1 : 0, input.is_featured ? 1 : 0,
      JSON.stringify(normalizeStringArray(input.allergens)), JSON.stringify(normalizeStringArray(input.tags)),
      input.hide_when_out_of_stock ? 1 : 0, consumption, Math.trunc(input.sort_order), String(existing?.created_at ?? now), now);
  return { ok: true as const, message: "Ürün kaydedildi.", savedId: id };
}

export function saveMenuProductEntry(db: DatabaseSync, input: SaveMenuProductEntryInput, image?: CatalogProductImageMutation) {
  db.exec("SAVEPOINT menu_product_entry");
  try {
    const result = saveMenuProductEntryInTransaction(db, input, new Date().toISOString(), image);
    db.exec("RELEASE menu_product_entry");
    return result;
  } catch (error) {
    db.exec("ROLLBACK TO menu_product_entry; RELEASE menu_product_entry");
    return { ok: false as const, message: error instanceof Error ? error.message : "Menü ürünü kaydedilemedi." };
  }
}
