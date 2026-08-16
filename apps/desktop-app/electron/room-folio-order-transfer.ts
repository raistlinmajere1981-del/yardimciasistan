import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DesktopRoomFolioService, type DesktopRoomFolioMutationResult } from "./room-folio";

export interface TransferTableOrderToRoomFolioInput {
  folioId: string;
  tableOrderId: string;
}

export function transferTableOrderToRoomFolio(
  databasePath: string,
  input: TransferTableOrderToRoomFolioInput
): DesktopRoomFolioMutationResult {
  const folioId = cleanText(input?.folioId, 180);
  const tableOrderId = cleanText(input?.tableOrderId, 180);
  if (!folioId || !tableOrderId) {
    return { ok: false, message: "Oda hesabı veya restoran adisyonu bulunamadı." };
  }

  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");

  try {
    const existing = db.prepare(`
      SELECT folio_id
      FROM room_folio_table_order_transfers
      WHERE table_order_id = ?
    `).get(tableOrderId) as { folio_id?: string } | undefined;
    if (existing?.folio_id) {
      if (existing.folio_id !== folioId) {
        return { ok: false, message: "Bu restoran adisyonu daha önce başka bir oda hesabına aktarılmış." };
      }
      return {
        ok: true,
        message: "Restoran adisyonu bu oda hesabına daha önce aktarılmış.",
        data: new DesktopRoomFolioService(databasePath).getData(),
        folioId
      };
    }

    const folio = db.prepare(`
      SELECT id, currency
      FROM room_folios
      WHERE id = ? AND deleted_at = '' AND status = 'open'
    `).get(folioId) as { id?: string; currency?: string } | undefined;
    if (!folio?.id) {
      return { ok: false, message: "Açık oda hesabı bulunamadı." };
    }

    const order = db.prepare(`
      SELECT
        orders.id,
        orders.table_id,
        orders.status,
        orders.total,
        tables.name AS table_name,
        COALESCE((
          SELECT items.currency
          FROM table_order_items AS items
          WHERE items.order_id = orders.id AND items.status != 'cancelled'
          ORDER BY items.created_at, items.id
          LIMIT 1
        ), 'TRY') AS currency
      FROM table_orders AS orders
      JOIN tables ON tables.id = orders.table_id AND tables.deleted_at = ''
      WHERE orders.id = ?
    `).get(tableOrderId) as Record<string, unknown> | undefined;

    if (!order) {
      return { ok: false, message: "Restoran adisyonu bulunamadı." };
    }
    if (String(order.status ?? "") !== "payment") {
      return { ok: false, message: "Odaya aktarmadan önce adisyonu Hesap Bekliyor durumuna alın." };
    }

    const amountMinor = Math.round(Math.max(0, Number(order.total ?? 0)) * 100);
    if (amountMinor <= 0) {
      return { ok: false, message: "Tutarı olmayan adisyon oda hesabına aktarılamaz." };
    }

    const currency = normalizeCurrency(order.currency);
    const folioCurrency = normalizeCurrency(folio.currency);
    if (currency !== folioCurrency) {
      return { ok: false, message: "Restoran adisyonu ile oda hesabının para birimi aynı olmalı." };
    }

    const now = new Date().toISOString();
    const folioItemId = `room_folio_item_${randomUUID()}`;
    const transferId = `room_folio_order_transfer_${randomUUID()}`;
    const tableName = cleanText(order.table_name, 120) || "Masa";
    const label = `Restoran · ${tableName}`;
    const note = `Masa adisyonu · ${tableOrderId}`;

    db.exec("BEGIN IMMEDIATE");
    try {
      // Stok burada değiştirilmez. Restoran siparişi oluşturulurken ürün stokları
      // zaten düşürülmüştür; oda folyosuna yalnız parasal toplam taşınır.
      db.prepare(`
        INSERT INTO room_folio_items (
          id, folio_id, kind, menu_item_id, label, unit_price_minor, quantity,
          line_total_minor, note, created_at, updated_at, deleted_at, sync_status
        ) VALUES (?, ?, 'manual_charge', '', ?, ?, 1, ?, ?, ?, ?, '', 'local_only')
      `).run(folioItemId, folioId, label, amountMinor, amountMinor, note, now, now);

      db.prepare(`
        INSERT INTO room_folio_table_order_transfers (
          id, folio_id, folio_item_id, table_order_id, table_id,
          amount_minor, currency, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        transferId,
        folioId,
        folioItemId,
        tableOrderId,
        String(order.table_id ?? ""),
        amountMinor,
        currency,
        now
      );

      db.prepare(`
        UPDATE table_orders
        SET status = 'paid', closed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'payment'
      `).run(now, now, tableOrderId);

      db.prepare(`
        UPDATE tables
        SET status = 'available', current_customer_id = '', current_reservation_id = '',
            updated_at = ?, sync_status = 'local_only'
        WHERE id = ?
      `).run(now, String(order.table_id ?? ""));

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (message.includes("UNIQUE") || message.includes("room_folio_table_order_transfers")) {
      return { ok: false, message: "Bu restoran adisyonu daha önce oda hesabına aktarılmış." };
    }
    return { ok: false, message: "Restoran adisyonu oda hesabına aktarılamadı." };
  } finally {
    db.close();
  }

  return {
    ok: true,
    message: "Restoran adisyonu oda hesabına aktarıldı; masa kapatıldı.",
    data: new DesktopRoomFolioService(databasePath).getData(),
    folioId
  };
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeCurrency(value: unknown) {
  const currency = cleanText(value, 8).toUpperCase();
  return currency || "TRY";
}
