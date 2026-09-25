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
import type { DeletionAndroidEventSink } from "./deletion-store.js";
import {
  normalizeMenuStockUnit,
  normalizePositiveStockNumber,
  nullableNumber,
  nullableString
} from "./stock-utils.js";

export function getPublishedMenu(db: DatabaseSync): PublishedQrMenu {
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
          id,
          category_id,
          name,
          description,
          price,
          currency,
          image_url,
          is_available,
          is_featured,
          allergens_json,
          tags_json,
          stock_quantity,
          stock_min_quantity,
          stock_unit,
          stock_consumption_quantity,
          hide_when_out_of_stock,
          stock_note,
          sort_order,
          created_at,
          updated_at
        FROM menu_items
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, name ASC
      `)
    .all() as Array<Record<string, unknown>>;

  const updatedAtRows = [...categories, ...items].map((row) => String(row.updated_at ?? "")).filter(Boolean);
  const updatedAt = updatedAtRows.sort().at(-1) ?? new Date().toISOString();

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
      category_id: String(row.category_id ?? ""),
      name: String(row.name ?? ""),
      description: String(row.description ?? ""),
      price: Number(row.price ?? 0),
      currency: String(row.currency ?? "TRY"),
      image_url: String(row.image_url ?? ""),
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

export function getQrMenuPublication(db: DatabaseSync): PublishedQrMenu {
  const menu = getPublishedMenu(db);
  return {
    ...menu,
    items: menu.items.filter((item) => !(
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

  const table = input.kind === "categories" ? "menu_categories" : "menu_items";
  const categoryId = String(input.categoryId ?? "").trim();
  if (input.kind === "items" && !categoryId) {
    return { ok: false, message: "Ürün sıralaması için kategori seçilmemiş." };
  }

  const currentRows = input.kind === "categories"
    ? db.prepare("SELECT id FROM menu_categories WHERE deleted_at = '' ORDER BY sort_order ASC, name ASC").all() as Array<{ id?: string }>
    : db.prepare("SELECT id FROM menu_items WHERE deleted_at = '' AND category_id = ? ORDER BY sort_order ASC, name ASC").all(categoryId) as Array<{ id?: string }>;
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
        UPDATE menu_items
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

export function deleteMenuItemInTransaction(
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
    .prepare("SELECT name, category_id, updated_at FROM menu_items WHERE id = ? AND deleted_at = ''")
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
    .prepare("UPDATE menu_items SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ? AND deleted_at = ''")
    .run(updatedAt, updatedAt, itemId);
  insertDeletionEvent(db, androidAction, insertAndroidEvent, "menu.item_deleted", "menu_item", itemId, {
    name: String(item.name ?? ""),
    category_id: String(item.category_id ?? "")
  }, now);
  return { ok: true, message: androidAction ? "Menü ürünü telefondan silindi." : "Ürün silindi." };
}
