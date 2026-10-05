import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createId } from "@yardimci-asistan/shared";
import type { StockImageImportSource } from "@yardimci-asistan/shared";
import type {
  DesktopMenuStockMovement,
  MenuStockMovementType,
  MenuStockSourceType,
  SaveMenuItemInput
} from "../database-types.js";
import { nextMutationTimestamp } from "./android-utils.js";
import { normalizeInteger, normalizeStringArray } from "./request-utils.js";
import {
  normalizeCurrency,
  normalizeMenuStockUnit,
  normalizeNullableStockNumber,
  normalizePositiveStockNumber,
  normalizePrice,
  normalizeStockPrecision,
  nullableNumber,
  nullableTrimmedString
} from "./stock-utils.js";

type MenuStockMutationResult =
  | {
      ok: true;
      message: string;
      tracked: boolean;
      quantityBefore: number;
      quantityAfter: number;
    }
  | { ok: false; message: string };

export function getMenuStockMovements(db: DatabaseSync, menuItemId = ""): DesktopMenuStockMovement[] {
  const normalizedMenuItemId = menuItemId.trim();
  const rows = (normalizedMenuItemId
    ? db.prepare(`
          SELECT * FROM menu_stock_movements
          WHERE menu_item_id = ?
          ORDER BY created_at ASC, id ASC
        `).all(normalizedMenuItemId)
    : db.prepare(`
          SELECT * FROM menu_stock_movements
          ORDER BY created_at ASC, id ASC
        `).all()) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    menuItemId: String(row.menu_item_id ?? ""),
    type: String(row.type ?? "adjust") as MenuStockMovementType,
    quantityChange: Number(row.quantity_change ?? 0),
    quantityBefore: Number(row.quantity_before ?? 0),
    quantityAfter: Number(row.quantity_after ?? 0),
    sourceType: String(row.source_type ?? "desktop") as MenuStockSourceType,
    sourceId: String(row.source_id ?? ""),
    actorSource: String(row.actor_source ?? (row.actor_device_id ? "android" : "desktop")) as StockImageImportSource,
    actorDeviceId: String(row.actor_device_id ?? ""),
    note: String(row.note ?? ""),
    createdAt: String(row.created_at ?? "")
  }));
}

export function saveMenuItem(db: DatabaseSync, input: SaveMenuItemInput): { ok: true; message: string; savedId: string } | { ok: false; message: string } {
  const name = input.name.trim();
  const categoryId = input.category_id.trim();
  const stockQuantity = normalizeNullableStockNumber(input.stock_quantity);
  const stockMinQuantity = normalizeNullableStockNumber(input.stock_min_quantity);
  const stockUnit = normalizeMenuStockUnit(input.stock_unit);
  const stockConsumptionQuantity = normalizePositiveStockNumber(input.stock_consumption_quantity) ?? 1;
  if (!name) {
    return {
      ok: false,
      message: "Ürün adı gerekli."
    };
  }

  const categoryExists = db.prepare("SELECT id FROM menu_categories WHERE id = ? AND deleted_at = ''").get(categoryId);
  if (!categoryExists) {
    return {
      ok: false,
      message: "Ürün için kategori seçilmeli."
    };
  }
  if (input.stock_quantity !== null && input.stock_quantity !== undefined && stockQuantity === null) {
    return { ok: false, message: "Stok miktarı 0 veya daha büyük bir sayı olmalı." };
  }
  if (input.stock_min_quantity !== null && input.stock_min_quantity !== undefined && stockMinQuantity === null) {
    return { ok: false, message: "Minimum stok uyarısı 0 veya daha büyük bir sayı olmalı." };
  }

  const id = input.id?.trim() || createId("item_");
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT created_at, stock_quantity FROM menu_items WHERE id = ?")
    .get(id) as { created_at?: string; stock_quantity?: number | null } | undefined;
  const createdAt = existing?.created_at || now;
  const previousStockQuantity = existing ? nullableNumber(existing.stock_quantity) : null;

  db.exec("BEGIN IMMEDIATE");
  try {
    db
      .prepare(`
          INSERT INTO menu_items (
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
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
          ON CONFLICT(id) DO UPDATE SET
            category_id = excluded.category_id,
            name = excluded.name,
            description = excluded.description,
            price = excluded.price,
            currency = excluded.currency,
            image_url = excluded.image_url,
            is_available = excluded.is_available,
            is_featured = excluded.is_featured,
            allergens_json = excluded.allergens_json,
            tags_json = excluded.tags_json,
            stock_quantity = excluded.stock_quantity,
            stock_min_quantity = excluded.stock_min_quantity,
            stock_unit = excluded.stock_unit,
            stock_consumption_quantity = excluded.stock_consumption_quantity,
            hide_when_out_of_stock = excluded.hide_when_out_of_stock,
            stock_note = excluded.stock_note,
            sort_order = excluded.sort_order,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'pending'
        `)
      .run(
        id,
        categoryId,
        name,
        input.description.trim(),
        normalizePrice(input.price),
        normalizeCurrency(input.currency),
        input.image_url.trim(),
        input.is_available ? 1 : 0,
        input.is_featured ? 1 : 0,
        JSON.stringify(normalizeStringArray(input.allergens)),
        JSON.stringify(normalizeStringArray(input.tags)),
        stockQuantity,
        stockMinQuantity,
        stockUnit,
        stockConsumptionQuantity,
        input.hide_when_out_of_stock ? 1 : 0,
        nullableTrimmedString(input.stock_note),
        normalizeInteger(input.sort_order),
        createdAt,
        now
      );

    if (previousStockQuantity !== stockQuantity) {
      const before = previousStockQuantity ?? 0;
      const after = stockQuantity ?? 0;
      insertMenuStockMovementInTransaction(db, {
        menuItemId: id,
        type: "set",
        quantityChange: after - before,
        quantityBefore: before,
        quantityAfter: after,
        sourceType: "desktop",
        sourceId: id,
        actorDeviceId: "",
        note: stockQuantity === null ? "Stok takibi bırakıldı." : "Menü ürün detayından stok ayarlandı.",
        now
      });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    ok: true,
    message: "Ürün kaydedildi.",
    savedId: id
  };
}

export function mutateMenuStockInTransaction(db: DatabaseSync, input: {
  menuItemId: string;
  type: MenuStockMovementType;
  quantityChange?: number;
  quantityAfter?: number;
  allowStartTracking?: boolean;
  sourceType: MenuStockSourceType;
  sourceId: string;
  actorSource?: StockImageImportSource;
  actorDeviceId: string;
  note: string;
  now: string;
}): MenuStockMutationResult {
  const item = db
    .prepare("SELECT stock_quantity, stock_consumption_quantity, updated_at FROM menu_items WHERE id = ? AND deleted_at = ''")
    .get(input.menuItemId) as {
      stock_quantity?: number | null;
      stock_consumption_quantity?: number;
      updated_at?: string;
    } | undefined;
  if (!item) {
    return { ok: false, message: "Menü ürünü bulunamadı." };
  }

  const storedQuantity = nullableNumber(item.stock_quantity);
  if (storedQuantity === null && !input.allowStartTracking) {
    if (input.sourceType === "table_order" || input.sourceType === "room_folio") {
      return {
        ok: true,
        message: "Ürün stok takibinde değil.",
        tracked: false,
        quantityBefore: 0,
        quantityAfter: 0
      };
    }
    return { ok: false, message: "Bu ürün stok takibinde değil." };
  }

  const quantityBefore = storedQuantity ?? 0;
  const stockConsumptionQuantity = normalizePositiveStockNumber(item.stock_consumption_quantity) ?? 1;
  const quantityChange = input.quantityChange === undefined
    ? undefined
    : ["order_add", "order_update", "order_remove"].includes(input.type)
      ? normalizeStockPrecision(input.quantityChange * stockConsumptionQuantity)
      : input.quantityChange;
  const requestedAfter = input.quantityAfter === undefined
    ? quantityBefore + (quantityChange ?? 0)
    : input.quantityAfter;
  const quantityAfter = normalizeNullableStockNumber(requestedAfter);
  if (quantityAfter === null) {
    return {
      ok: false,
      message: input.actorDeviceId ? "Stokta yeterli ürün yok." : "Bu ürün stokta yeterli değil."
    };
  }

  const updatedAt = nextMutationTimestamp(item.updated_at, input.now);
  const update = db
    .prepare(`
        UPDATE menu_items
        SET stock_quantity = ?, updated_at = ?, sync_status = 'pending'
        WHERE id = ? AND deleted_at = ''
      `)
    .run(quantityAfter, updatedAt, input.menuItemId);
  if (Number(update.changes) !== 1) {
    return { ok: false, message: "Menü ürünü stoku güncellenemedi." };
  }
  insertMenuStockMovementInTransaction(db, {
    menuItemId: input.menuItemId,
    type: input.type,
    quantityChange: quantityAfter - quantityBefore,
    quantityBefore,
    quantityAfter,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    actorSource: input.actorSource,
    actorDeviceId: input.actorDeviceId,
    note: input.note,
    now: input.now
  });
  return {
    ok: true,
    message: "Stok güncellendi.",
    tracked: true,
    quantityBefore,
    quantityAfter
  };
}

function insertMenuStockMovementInTransaction(db: DatabaseSync, input: {
  menuItemId: string;
  type: MenuStockMovementType;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  sourceType: MenuStockSourceType;
  sourceId: string;
  actorSource?: StockImageImportSource;
  actorDeviceId: string;
  note: string;
  now: string;
}) {
  db
    .prepare(`
        INSERT INTO menu_stock_movements (
          id, menu_item_id, type, quantity_change, quantity_before, quantity_after,
          source_type, source_id, actor_source, actor_device_id, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
    .run(
      `stock_movement_${randomUUID()}`,
      input.menuItemId,
      input.type,
      normalizeStockPrecision(input.quantityChange),
      normalizeStockPrecision(input.quantityBefore),
      normalizeStockPrecision(input.quantityAfter),
      input.sourceType,
      input.sourceId || null,
      input.actorSource ?? (input.actorDeviceId ? "android" : "desktop"),
      input.actorDeviceId || null,
      input.note || null,
      input.now
    );
}
