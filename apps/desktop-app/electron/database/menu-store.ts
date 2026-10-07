import { parseStoredStringArray } from "./string-array-utils.js";
import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type { PublishedQrMenu } from "@yardimci-asistan/sync-core";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import type {
  ReorderMenuRecordsInput,
  SaveMenuCategoryInput
} from "../database-types.js";
import { normalizeInteger } from "./request-utils.js";
import type { AndroidActionMutationResult } from "./android-utils.js";
import { getAndroidVersionConflict, nextMutationTimestamp } from "./android-utils.js";
import { insertDeletionEvent } from "./deletion-store.js";
import { queueSyncJob } from "./sync-runtime-store.js";
import { resolveMenuProductPrice } from "../menu-product-price.js";
import { readProductImageAsset } from "../product-image-reader.js";
import { publicImageUrl } from "../commerce-online-catalog-publication.js";
import type { DeletionAndroidEventSink } from "./deletion-store.js";
import {
  normalizeMenuStockUnit,
  normalizePositiveStockNumber,
  nullableNumber,
  nullableString
} from "./stock-utils.js";

export function getPublishedMenu(db: DatabaseSync, includeInactiveProducts = false): PublishedQrMenu {
  const categories = db
    .prepare(`
        SELECT id, name, description, is_active, sort_order, created_at, updated_at
        FROM menu_categories
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, name ASC
      `)
    .all() as Array<Record<string, unknown>>;

  const items = db
    .prepare(`
        SELECT
          e.*, p.name, p.description, p.sale_price, p.currency, p.is_active AS product_is_active, p.image_source_url AS image_url, p.image_asset_path,
          p.unit AS stock_unit,
          CASE WHEN p.track_inventory = 1 THEN COALESCE(b.quantity, 0) ELSE NULL END AS stock_quantity,
          CASE WHEN p.track_inventory = 1 THEN p.minimum_quantity ELSE NULL END AS stock_min_quantity,
          MAX(e.updated_at, p.updated_at, COALESCE(b.updated_at, '')) AS updated_at
        FROM menu_product_entries e
        JOIN catalog_products p ON p.id = e.product_id AND p.deleted_at = ''
        LEFT JOIN inventory_locations l ON l.business_id = p.business_id AND l.is_primary = 1 AND l.deleted_at = ''
        LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.location_id = l.id
        WHERE e.deleted_at = '' AND (? = 1 OR p.is_active = 1)
        ORDER BY e.sort_order ASC, p.name ASC
      `)
    .all(includeInactiveProducts ? 1 : 0) as Array<Record<string, unknown>>;

  const updatedAtRows = [...categories, ...items].map((row) => String(row.updated_at ?? "")).filter(Boolean);
  // Include withdrawals and canonical deactivation even when the public projection is empty.
  const withdrawn = db.prepare(`SELECT MAX(updated_at) AS updated_at FROM (
    SELECT updated_at FROM menu_categories UNION ALL SELECT updated_at FROM menu_product_entries
    UNION ALL SELECT p.updated_at FROM catalog_products p JOIN menu_product_entries e ON e.product_id = p.id
    UNION ALL SELECT b.updated_at FROM inventory_balances b JOIN menu_product_entries e ON e.product_id = b.product_id AND e.deleted_at = ''
  )`).get();
  if (withdrawn?.updated_at) updatedAtRows.push(String(withdrawn.updated_at));
  const updatedAt = updatedAtRows.sort().at(-1) ?? new Date().toISOString();
  const databasePath = String(db.prepare("PRAGMA database_list").all().find(row => row.name === "main")?.file ?? "");

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
      product_id: String(row.product_id ?? ""),
      ...(includeInactiveProducts ? { product_is_active: Number(row.product_is_active) === 1 } : {}),
      price_override: nullableNumber(row.price_override),
      category_id: String(row.category_id ?? ""),
      name: String(row.name ?? ""),
      description: String(row.description ?? ""),
      price: resolveMenuProductPrice({ sale_price: row.sale_price }, { price_override: row.price_override }),
      currency: String(row.currency ?? "TRY"),
      image_url: readProductImageAsset(databasePath, String(row.image_asset_path ?? "")) || publicImageUrl(row.image_url),
      is_available: Number(row.is_available ?? 0) === 1,
      is_featured: Number(row.is_featured ?? 0) === 1,
      allergens: parseStoredStringArray(row.allergens_json),
      tags: parseStoredStringArray(row.tags_json),
      stock_quantity: nullableNumber(row.stock_quantity),
      stock_min_quantity: nullableNumber(row.stock_min_quantity),
      stock_unit: normalizeMenuStockUnit(row.stock_unit),
      stock_consumption_quantity: normalizePositiveStockNumber(row.stock_consumption_quantity) ?? 1,
      hide_when_out_of_stock: Number(row.hide_when_out_of_stock ?? 0) === 1,
      stock_note: nullableString(row.stock_note),
      sort_order: Number(row.sort_order ?? 0),
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? "")
    })),
    updated_at: updatedAt
  };
}

export function getMenuProductCandidates(db: DatabaseSync) {
  return db.prepare(`SELECT p.id, p.name, p.unit, p.sale_price, p.currency FROM catalog_products p
    JOIN business b ON b.id = p.business_id AND b.deleted_at = ''
    WHERE p.deleted_at = '' AND p.is_active = 1
      AND NOT EXISTS (SELECT 1 FROM menu_product_entries e WHERE e.product_id = p.id AND e.deleted_at = '')
    ORDER BY p.name, p.id LIMIT 500`).all().map(row => ({
      product_id: String(row.id), name: String(row.name), unit: normalizeMenuStockUnit(row.unit),
      sale_price: Number(row.sale_price), currency: String(row.currency)
    }));
}

export function getQrMenuWebPublicationEnabled(db: DatabaseSync): boolean {
  const row = db.prepare(
    "SELECT publish_qr_menu_web FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1"
  ).get() as { publish_qr_menu_web?: unknown } | undefined;
  return Number(row?.publish_qr_menu_web ?? 1) === 1;
}

export function setQrMenuWebPublicationEnabled(db: DatabaseSync, enabled: boolean): void {
  const now = new Date().toISOString();
  db.exec("SAVEPOINT qr_menu_visibility");
  try {
    const result = db.prepare(
      "UPDATE business SET publish_qr_menu_web = ?, updated_at = ?, sync_status = 'local_only' WHERE deleted_at = ''"
    ).run(enabled ? 1 : 0, now);
    if (Number(result.changes) < 1) throw new Error("QR Menü web görünürlüğü kaydedilemedi.");
    queueSyncJob(db, "menu_publish", now);
    db.exec("RELEASE qr_menu_visibility");
  } catch (error) {
    db.exec("ROLLBACK TO qr_menu_visibility");
    db.exec("RELEASE qr_menu_visibility");
    throw error;
  }
}

export function getQrMenuPublication(db: DatabaseSync): PublishedQrMenu & { enabled: boolean } {
  const menu = getPublishedMenu(db);
  return {
    ...menu,
    enabled: getQrMenuWebPublicationEnabled(db),
    items: menu.items.filter((item) => item.is_available && menu.categories.some(category => category.id === item.category_id && category.is_active) && !(
      item.stock_quantity !== null
      && item.hide_when_out_of_stock
      && item.stock_quantity < item.stock_consumption_quantity
    ))
  };
}

export function saveMenuCategory(db: DatabaseSync, input: SaveMenuCategoryInput): { ok: true; message: string; savedId: string } | { ok: false; message: string } {
  const name = input.name.trim();
  if (!name) {
    return {
      ok: false,
      message: "Kategori adı gerekli."
    };
  }

  const id = input.id?.trim() || createId("cat_");
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT created_at FROM menu_categories WHERE id = ?").get(id) as { created_at?: string } | undefined;
  const createdAt = existing?.created_at || now;

  db
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
    savedId: id
  };
}

export function reorderMenuRecords(
  db: DatabaseSync,
  input: ReorderMenuRecordsInput
): { ok: true; message: string } | { ok: false; message: string } {
  const orderedIds = input.orderedIds.map((id) => String(id ?? "").trim()).filter(Boolean);
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, message: "Sıralama listesinde yinelenen kayıt var." };
  }

  const table = input.kind === "categories" ? "menu_categories" : "menu_product_entries";
  const categoryId = String(input.categoryId ?? "").trim();
  if (input.kind === "items" && !categoryId) {
    return { ok: false, message: "Ürün sıralaması için kategori seçilmemiş." };
  }

  const currentRows = input.kind === "categories"
    ? db.prepare("SELECT id FROM menu_categories WHERE deleted_at = '' ORDER BY sort_order ASC, name ASC").all() as Array<{ id?: string }>
    : db.prepare("SELECT e.id FROM menu_product_entries e JOIN catalog_products p ON p.id = e.product_id AND p.deleted_at = '' AND p.is_active = 1 WHERE e.deleted_at = '' AND e.category_id = ? ORDER BY e.sort_order ASC, p.name ASC").all(categoryId) as Array<{ id?: string }>;
  const currentIds = currentRows.map((row) => String(row.id ?? "")).filter(Boolean);

  if (
    currentIds.length !== orderedIds.length
    || currentIds.some((id) => !orderedIds.includes(id))
  ) {
    return {
      ok: false,
      message: input.kind === "categories"
        ? "Kategori listesi değişti. Sıralamayı yeniden deneyin."
        : "Ürün listesi değişti. Sıralamayı yeniden deneyin."
    };
  }

  if (currentIds.every((id, index) => id === orderedIds[index])) {
    return { ok: true, message: "Sıralama zaten güncel." };
  }

  const now = new Date().toISOString();
  const update = db.prepare(`UPDATE ${table} SET sort_order = ?, updated_at = ?, sync_status = 'pending' WHERE id = ? AND deleted_at = ''`);

  db.exec("BEGIN IMMEDIATE");
  try {
    orderedIds.forEach((id, index) => {
      update.run((index + 1) * 10, now, id);
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    ok: true,
    message: input.kind === "categories" ? "Kategori sırası güncellendi." : "Ürün sırası güncellendi."
  };
}

export function deleteMenuCategoryInTransaction(
  db: DatabaseSync,
  categoryId: string,
  now: string,
  androidAction?: AndroidSyncAction,
  insertAndroidEvent?: DeletionAndroidEventSink
): AndroidActionMutationResult {
  if (!categoryId) {
    return { ok: false, message: "Silinecek menü kategorisi seçilmemiş." };
  }
  const category = db
    .prepare("SELECT name, updated_at FROM menu_categories WHERE id = ? AND deleted_at = ''")
    .get(categoryId) as { name?: string; updated_at?: string } | undefined;
  if (!category) {
    return { ok: false, message: "Menü kategorisi masaüstü kayıtlarında bulunamadı." };
  }
  const versionConflict = androidAction
    ? getAndroidVersionConflict(androidAction.payload, "expected_updated_at", category.updated_at, "Menü kategorisi")
    : null;
  if (versionConflict) {
    return versionConflict;
  }

  const updatedAt = nextMutationTimestamp(category.updated_at, now);
  const itemResult = db
    .prepare(`
        UPDATE menu_product_entries
        SET deleted_at = ?, updated_at = ?, sync_status = 'pending'
        WHERE category_id = ? AND deleted_at = ''
      `)
    .run(updatedAt, updatedAt, categoryId);
  db
    .prepare("UPDATE menu_categories SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ? AND deleted_at = ''")
    .run(updatedAt, updatedAt, categoryId);
  insertDeletionEvent(db, androidAction, insertAndroidEvent, "menu.category_deleted", "menu_category", categoryId, {
    name: String(category.name ?? ""),
    deleted_item_count: Number(itemResult.changes ?? 0)
  }, now);
  return {
    ok: true,
    message: Number(itemResult.changes ?? 0) > 0
      ? `${Number(itemResult.changes ?? 0)} ürünle birlikte kategori silindi.`
      : "Kategori silindi."
  };
}

export function deleteMenuProductEntryInTransaction(
  db: DatabaseSync,
  itemId: string,
  now: string,
  androidAction?: AndroidSyncAction,
  insertAndroidEvent?: DeletionAndroidEventSink
): AndroidActionMutationResult {
  if (!itemId) {
    return { ok: false, message: "Silinecek menü ürünü seçilmemiş." };
  }
  const item = db
    .prepare("SELECT p.name, e.category_id, MAX(e.updated_at, p.updated_at, COALESCE(b.updated_at, '')) AS updated_at FROM menu_product_entries e JOIN catalog_products p ON p.id = e.product_id LEFT JOIN inventory_locations l ON l.business_id = p.business_id AND l.is_primary = 1 AND l.deleted_at = '' LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.location_id = l.id WHERE e.id = ? AND e.deleted_at = ''")
    .get(itemId) as { name?: string; category_id?: string; updated_at?: string } | undefined;
  if (!item) {
    return { ok: false, message: "Menü ürünü masaüstü kayıtlarında bulunamadı." };
  }
  const versionConflict = androidAction
    ? getAndroidVersionConflict(androidAction.payload, "expected_updated_at", item.updated_at, "Menü ürünü")
    : null;
  if (versionConflict) {
    return versionConflict;
  }

  const updatedAt = nextMutationTimestamp(item.updated_at, now);
  db
    .prepare("UPDATE menu_product_entries SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ? AND deleted_at = ''")
    .run(updatedAt, updatedAt, itemId);
  insertDeletionEvent(db, androidAction, insertAndroidEvent, "menu.item_deleted", "menu_item", itemId, {
    name: String(item.name ?? ""),
    category_id: String(item.category_id ?? "")
  }, now);
  return { ok: true, message: androidAction ? "Ürün telefondan menüden kaldırıldı." : "Ürün menüden kaldırıldı." };
}
