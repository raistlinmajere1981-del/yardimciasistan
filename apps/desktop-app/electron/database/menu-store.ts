import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type { PublishedQrMenu } from "@yardimci-asistan/sync-core";
import type {
  SaveMenuCategoryInput
} from "../database-types.js";
import { normalizeInteger } from "./request-utils.js";
import {
  normalizeMenuStockUnit,
  normalizePositiveStockNumber,
  nullableNumber,
  nullableString
} from "./stock-utils.js";

function parseStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

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
      allergens: parseStringArray(row.allergens_json),
      tags: parseStringArray(row.tags_json),
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
