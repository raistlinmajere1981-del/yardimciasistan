import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { checkoutHospitalityStay } from "./hospitality-checkout.js";

export type RoomFolioPaymentMethod = "cash" | "card" | "bank" | "other" | "unspecified";
type RoomFolioItemKind = "menu" | "manual_charge" | "discount";

interface DesktopRoomPrice {
  id: string;
  name: string;
  number: string;
  capacity: number;
  nightlyPriceMinor: number;
  currency: string;
}

interface DesktopRoomFolioMenuCategory {
  id: string;
  name: string;
}

interface DesktopRoomFolioMenuItem {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  stockQuantity: number | null;
  stockConsumptionQuantity: number;
  stockUnit: string;
}

interface DesktopRoomFolioItem {
  id: string;
  folioId: string;
  kind: RoomFolioItemKind;
  menuItemId: string;
  label: string;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  note: string;
  createdAt: string;
}

interface DesktopRoomFolioPayment {
  id: string;
  folioId: string;
  amountMinor: number;
  currency: string;
  paymentMethod: RoomFolioPaymentMethod;
  paidAt: string;
  note: string;
  origin: "direct" | "reservation";
  createdAt: string;
}

export interface DesktopRoomFolio {
  id: string;
  stayId: string;
  roomId: string;
  roomName: string;
  roomNumber: string;
  customerId: string;
  customerName: string;
  reservationId: string;
  status: "open" | "closed" | "cancelled";
  guestCount: number;
  checkInDate: string;
  plannedCheckOutDate: string;
  nights: number;
  nightlyPriceMinor: number;
  currency: string;
  lodgingTotalMinor: number;
  lodgingManualOverride: boolean;
  extrasTotalMinor: number;
  chargeTotalMinor: number;
  paidTotalMinor: number;
  remainingMinor: number;
  creditMinor: number;
  openedAt: string;
  closedAt: string;
  note: string;
  items: DesktopRoomFolioItem[];
  payments: DesktopRoomFolioPayment[];
}

interface DesktopRoomFolioStay {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  roomId: string;
  roomName: string;
  roomNumber: string;
  reservationId: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  nightlyPriceMinor: number;
  currency: string;
  folioId: string;
}

export interface DesktopRoomFolioData {
  generatedAt: string;
  rooms: DesktopRoomPrice[];
  activeStays: DesktopRoomFolioStay[];
  folios: DesktopRoomFolio[];
  menuCategories: DesktopRoomFolioMenuCategory[];
  menuItems: DesktopRoomFolioMenuItem[];
}

export interface SetRoomNightlyPriceInput {
  roomId: string;
  amountMinor: number;
  currency?: string;
}

export interface UpdateRoomFolioDetailsInput {
  folioId: string;
  guestCount: number;
  checkInDate: string;
  plannedCheckOutDate: string;
  nightlyPriceMinor: number;
  lodgingTotalMinor?: number;
  lodgingManualOverride?: boolean;
}

export interface AddRoomFolioMenuItemInput {
  folioId: string;
  menuItemId: string;
  quantity: number;
}

export interface UpdateRoomFolioItemQuantityInput {
  itemId: string;
  quantity: number;
}

export interface AddRoomFolioManualItemInput {
  folioId: string;
  kind: "manual_charge" | "discount";
  label: string;
  amountMinor: number;
  note?: string;
}

export interface AddRoomFolioPaymentInput {
  folioId: string;
  amountMinor: number;
  paymentMethod: RoomFolioPaymentMethod;
  note?: string;
}

export interface CheckoutRoomFolioInput {
  folioId: string;
  allowOutstanding: boolean;
}

export type DesktopRoomFolioMutationResult =
  | { ok: true; message: string; data: DesktopRoomFolioData; folioId?: string }
  | { ok: false; message: string };

const PAYMENT_METHODS = new Set<RoomFolioPaymentMethod>(["cash", "card", "bank", "other", "unspecified"]);

export class DesktopRoomFolioService {
  constructor(private readonly databasePath: string) {}

  getData(): DesktopRoomFolioData {
    const db = this.openDatabase();
    try {
      const roomRows = db.prepare(`
        SELECT id, name, number, capacity, nightly_price_minor, price_currency
        FROM rooms
        WHERE deleted_at = '' AND is_active = 1
        ORDER BY sort_order, name
      `).all() as Array<Record<string, unknown>>;

      const stayRows = db.prepare(`
        SELECT
          stays.id,
          stays.customer_id,
          customers.full_name AS customer_name,
          customers.phone AS customer_phone,
          stays.room_id,
          rooms.name AS room_name,
          rooms.number AS room_number,
          stays.reservation_id,
          stays.status,
          stays.check_in_date,
          stays.check_out_date,
          stays.guest_count,
          rooms.nightly_price_minor,
          rooms.price_currency,
          COALESCE(folios.id, '') AS folio_id
        FROM customer_room_stays AS stays
        JOIN customers ON customers.id = stays.customer_id AND customers.deleted_at = ''
        JOIN rooms ON rooms.id = stays.room_id AND rooms.deleted_at = ''
        LEFT JOIN room_folios AS folios ON folios.stay_id = stays.id AND folios.deleted_at = ''
        WHERE stays.deleted_at = ''
          AND stays.status IN ('planned', 'checked_in')
        ORDER BY
          CASE stays.status WHEN 'checked_in' THEN 0 ELSE 1 END,
          stays.check_in_date,
          rooms.sort_order,
          rooms.name
      `).all() as Array<Record<string, unknown>>;

      const folioRows = db.prepare(`
        SELECT
          folios.*,
          rooms.name AS room_name,
          rooms.number AS room_number,
          customers.full_name AS customer_name,
          totals.extras_total_minor,
          totals.charge_total_minor,
          totals.paid_total_minor,
          totals.remaining_minor,
          totals.credit_minor
        FROM room_folios AS folios
        JOIN rooms ON rooms.id = folios.room_id
        JOIN customers ON customers.id = folios.customer_id
        JOIN room_folio_totals AS totals ON totals.folio_id = folios.id
        WHERE folios.deleted_at = ''
          AND (folios.status = 'open' OR folios.closed_at >= datetime('now', '-30 days'))
        ORDER BY CASE folios.status WHEN 'open' THEN 0 ELSE 1 END, folios.updated_at DESC
        LIMIT 100
      `).all() as Array<Record<string, unknown>>;

      const categoryRows = db.prepare(`
        SELECT id, name
        FROM menu_categories
        WHERE deleted_at = '' AND is_active = 1
        ORDER BY sort_order, name
      `).all() as Array<Record<string, unknown>>;

      const menuRows = db.prepare(`
        SELECT
          items.id,
          items.category_id,
          categories.name AS category_name,
          items.name,
          items.description,
          items.price,
          items.currency,
          items.stock_quantity,
          items.stock_consumption_quantity,
          items.stock_unit
        FROM menu_items AS items
        JOIN menu_categories AS categories
          ON categories.id = items.category_id
          AND categories.deleted_at = ''
          AND categories.is_active = 1
        WHERE items.deleted_at = '' AND items.is_available = 1
        ORDER BY categories.sort_order, items.sort_order, items.name
      `).all() as Array<Record<string, unknown>>;

      return {
        generatedAt: new Date().toISOString(),
        rooms: roomRows.map(mapRoomPrice),
        activeStays: stayRows.map(mapStay),
        folios: folioRows.map((row) => this.mapFolio(db, row)),
        menuCategories: categoryRows.map((row) => ({ id: text(row.id), name: text(row.name) })),
        menuItems: menuRows.map(mapMenuItem)
      };
    } finally {
      db.close();
    }
  }

  setRoomNightlyPrice(input: SetRoomNightlyPriceInput): DesktopRoomFolioMutationResult {
    const roomId = cleanText(input?.roomId, 180);
    const amountMinor = nonNegativeAmount(input?.amountMinor);
    if (!roomId || amountMinor === null) {
      return { ok: false, message: "Oda fiyatı geçersiz." };
    }
    const db = this.openDatabase();
    try {
      const now = new Date().toISOString();
      const result = db.prepare(`
        UPDATE rooms
        SET nightly_price_minor = ?, price_currency = ?, updated_at = ?, sync_status = 'local_only'
        WHERE id = ? AND deleted_at = '' AND is_active = 1
      `).run(amountMinor, normalizeCurrency(input?.currency), now, roomId);
      if (Number(result.changes) <= 0) {
        return { ok: false, message: "Oda bulunamadı." };
      }
    } finally {
      db.close();
    }
    return { ok: true, message: "Gecelik oda fiyatı güncellendi.", data: this.getData() };
  }

  openFolio(stayIdValue: string): DesktopRoomFolioMutationResult {
    const stayId = cleanText(stayIdValue, 180);
    if (!stayId) return { ok: false, message: "Konaklama kaydı bulunamadı." };

    const db = this.openDatabase();
    let folioId = "";
    try {
      const existing = db.prepare(`
        SELECT id FROM room_folios WHERE stay_id = ? AND deleted_at = ''
      `).get(stayId) as { id?: string } | undefined;
      if (existing?.id) {
        return { ok: true, message: "Oda adisyonu zaten açık.", data: this.getData(), folioId: existing.id };
      }

      const stay = db.prepare(`
        SELECT
          stays.id, stays.customer_id, stays.room_id, stays.reservation_id, stays.status,
          stays.check_in_date, stays.check_out_date, stays.guest_count,
          rooms.nightly_price_minor, rooms.price_currency,
          COALESCE(reservations.agreed_total_minor, 0) AS reservation_total_minor
        FROM customer_room_stays AS stays
        JOIN rooms ON rooms.id = stays.room_id AND rooms.deleted_at = '' AND rooms.is_active = 1
        LEFT JOIN reservations ON reservations.id = stays.reservation_id AND reservations.deleted_at = ''
        WHERE stays.id = ? AND stays.deleted_at = ''
      `).get(stayId) as Record<string, unknown> | undefined;
      if (!stay || !["planned", "checked_in"].includes(text(stay.status))) {
        return { ok: false, message: "Bu konaklama için oda adisyonu açılamaz." };
      }

      const checkInDate = normalizeDate(stay.check_in_date);
      const checkOutDate = normalizeDate(stay.check_out_date, true);
      if (!checkInDate) return { ok: false, message: "Giriş tarihi geçersiz." };
      const nights = calculateNights(checkInDate, checkOutDate);
      if (nights === null) return { ok: false, message: "Çıkış tarihi giriş tarihinden önce olamaz." };

      const nightlyPriceMinor = safeMinor(stay.nightly_price_minor);
      const reservationTotalMinor = safeMinor(stay.reservation_total_minor);
      const reservationPayments = text(stay.reservation_id)
        ? db.prepare(`
            SELECT id, amount_minor, currency, payment_method, paid_at, note, created_at, updated_at
            FROM pension_payments
            WHERE reservation_id = ? AND deleted_at = ''
            ORDER BY paid_at, created_at
          `).all(text(stay.reservation_id)) as Array<Record<string, unknown>>
        : [];
      const reservationPaidMinor = reservationPayments.reduce((sum, row) => sum + safeMinor(row.amount_minor), 0);
      const automaticLodgingTotal = nightlyPriceMinor * nights;
      const lodgingManualOverride = reservationTotalMinor > 0 ? 1 : 0;
      const lodgingTotalMinor = Math.max(
        lodgingManualOverride ? reservationTotalMinor : automaticLodgingTotal,
        reservationPaidMinor
      );
      const now = new Date().toISOString();
      folioId = `room_folio_${randomUUID()}`;

      db.exec("BEGIN");
      try {
        db.prepare(`
          INSERT INTO room_folios (
            id, stay_id, room_id, customer_id, reservation_id, status, guest_count,
            check_in_date, planned_check_out_date, nightly_price_minor, currency,
            lodging_total_minor, lodging_manual_override, opened_at, closed_at, note,
            created_at, updated_at, deleted_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, '', 'local_only')
        `).run(
          folioId,
          stayId,
          text(stay.room_id),
          text(stay.customer_id),
          text(stay.reservation_id),
          clampGuestCount(stay.guest_count),
          checkInDate,
          checkOutDate,
          nightlyPriceMinor,
          normalizeCurrency(stay.price_currency),
          lodgingTotalMinor,
          lodgingManualOverride,
          now,
          now,
          now
        );

        for (const payment of reservationPayments) {
          db.prepare(`
            INSERT OR IGNORE INTO room_folio_payments (
              id, folio_id, amount_minor, currency, payment_method, paid_at, note,
              origin, reference_id, created_at, updated_at, deleted_at, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'reservation', ?, ?, ?, '', 'local_only')
          `).run(
            `room_folio_reservation_${text(payment.id)}`,
            folioId,
            safeMinor(payment.amount_minor),
            normalizeCurrency(payment.currency),
            normalizePaymentMethod(payment.payment_method),
            normalizeTimestamp(payment.paid_at) || now,
            cleanText(payment.note, 500),
            text(payment.id),
            normalizeTimestamp(payment.created_at) || now,
            normalizeTimestamp(payment.updated_at) || now
          );
        }

        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      return { ok: false, message: friendlyDatabaseError(error, "Oda adisyonu açılamadı.") };
    } finally {
      db.close();
    }

    return { ok: true, message: "Oda adisyonu açıldı.", data: this.getData(), folioId };
  }

  updateFolioDetails(input: UpdateRoomFolioDetailsInput): DesktopRoomFolioMutationResult {
    const folioId = cleanText(input?.folioId, 180);
    const guestCount = clampGuestCount(input?.guestCount);
    const checkInDate = normalizeDate(input?.checkInDate);
    const checkOutDate = normalizeDate(input?.plannedCheckOutDate, true);
    const nightlyPriceMinor = nonNegativeAmount(input?.nightlyPriceMinor);
    if (!folioId || !checkInDate || nightlyPriceMinor === null) {
      return { ok: false, message: "Konaklama bilgileri geçersiz." };
    }
    const nights = calculateNights(checkInDate, checkOutDate);
    if (nights === null) return { ok: false, message: "Çıkış tarihi giriş tarihinden önce olamaz." };

    const db = this.openDatabase();
    try {
      const current = this.requireOpenFolio(db, folioId);
      if (!current) return { ok: false, message: "Açık oda adisyonu bulunamadı." };
      const totals = this.getTotals(db, folioId);
      const manualOverride = Boolean(input?.lodgingManualOverride);
      const requestedTotal = manualOverride
        ? nonNegativeAmount(input?.lodgingTotalMinor)
        : nightlyPriceMinor * nights;
      if (requestedTotal === null) return { ok: false, message: "Konaklama toplamı geçersiz." };
      const prospectiveTotal = requestedTotal + totals.extrasTotalMinor;
      if (prospectiveTotal < totals.paidTotalMinor) {
        return { ok: false, message: "Toplam hesap daha önce alınan ödemeden düşük olamaz." };
      }

      const now = new Date().toISOString();
      db.exec("BEGIN");
      try {
        db.prepare(`
          UPDATE room_folios
          SET guest_count = ?, check_in_date = ?, planned_check_out_date = ?,
              nightly_price_minor = ?, lodging_total_minor = ?, lodging_manual_override = ?,
              updated_at = ?, sync_status = 'local_only'
          WHERE id = ?
        `).run(guestCount, checkInDate, checkOutDate, nightlyPriceMinor, requestedTotal, manualOverride ? 1 : 0, now, folioId);
        db.prepare(`
          UPDATE customer_room_stays
          SET guest_count = ?, check_in_date = ?, check_out_date = ?, updated_at = ?, sync_status = 'local_only'
          WHERE id = ?
        `).run(guestCount, checkInDate, checkOutDate, now, text(current.stay_id));
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      return { ok: false, message: friendlyDatabaseError(error, "Konaklama bilgileri kaydedilemedi.") };
    } finally {
      db.close();
    }
    return { ok: true, message: "Konaklama bilgileri güncellendi.", data: this.getData(), folioId };
  }

  addMenuItem(input: AddRoomFolioMenuItemInput): DesktopRoomFolioMutationResult {
    const folioId = cleanText(input?.folioId, 180);
    const menuItemId = cleanText(input?.menuItemId, 180);
    const quantity = positiveInteger(input?.quantity, 1000);
    if (!folioId || !menuItemId || quantity === null) {
      return { ok: false, message: "Menü ürünü eklenemedi." };
    }

    const db = this.openDatabase();
    try {
      if (!this.requireOpenFolio(db, folioId)) return { ok: false, message: "Oda adisyonu kapalı." };
      const menu = this.getMenuStockRow(db, menuItemId);
      if (!menu) return { ok: false, message: "Menü ürünü bulunamadı veya satışa kapalı." };
      const itemId = `room_folio_item_${randomUUID()}`;
      const unitPriceMinor = Math.max(0, Math.round(Number(menu.price ?? 0) * 100));
      const lineTotalMinor = unitPriceMinor * quantity;
      const now = new Date().toISOString();

      db.exec("BEGIN");
      try {
        this.applyMenuStockDelta(db, menu, quantity, "order_add", itemId, now);
        db.prepare(`
          INSERT INTO room_folio_items (
            id, folio_id, kind, menu_item_id, label, unit_price_minor, quantity,
            line_total_minor, note, created_at, updated_at, deleted_at, sync_status
          ) VALUES (?, ?, 'menu', ?, ?, ?, ?, ?, '', ?, ?, '', 'local_only')
        `).run(itemId, folioId, menuItemId, text(menu.name), unitPriceMinor, quantity, lineTotalMinor, now, now);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      return { ok: false, message: friendlyDatabaseError(error, "Menü ürünü oda hesabına eklenemedi.") };
    } finally {
      db.close();
    }
    return { ok: true, message: "Menü ürünü oda hesabına eklendi.", data: this.getData(), folioId };
  }

  updateItemQuantity(input: UpdateRoomFolioItemQuantityInput): DesktopRoomFolioMutationResult {
    const itemId = cleanText(input?.itemId, 180);
    const quantity = positiveInteger(input?.quantity, 1000);
    if (!itemId || quantity === null) return { ok: false, message: "Ürün adedi geçersiz." };

    const db = this.openDatabase();
    let folioId = "";
    try {
      const item = db.prepare(`
        SELECT * FROM room_folio_items WHERE id = ? AND deleted_at = ''
      `).get(itemId) as Record<string, unknown> | undefined;
      if (!item || text(item.kind) !== "menu") return { ok: false, message: "Menü ürünü bulunamadı." };
      folioId = text(item.folio_id);
      if (!this.requireOpenFolio(db, folioId)) return { ok: false, message: "Oda adisyonu kapalı." };
      const oldQuantity = Math.max(1, Number(item.quantity) || 1);
      const unitPriceMinor = safeMinor(item.unit_price_minor);
      const totals = this.getTotals(db, folioId);
      const prospectiveTotal = totals.chargeTotalMinor - safeSignedMinor(item.line_total_minor) + unitPriceMinor * quantity;
      if (prospectiveTotal < totals.paidTotalMinor) {
        return { ok: false, message: "Ürün adedi azaltılırsa hesap alınan ödemenin altına düşüyor." };
      }
      const menu = this.getMenuStockRow(db, text(item.menu_item_id));
      if (!menu) return { ok: false, message: "Menü ürünü artık bulunamıyor." };
      const quantityDelta = quantity - oldQuantity;
      const now = new Date().toISOString();

      db.exec("BEGIN");
      try {
        if (quantityDelta !== 0) {
          this.applyMenuStockDelta(db, menu, quantityDelta, "order_update", itemId, now);
        }
        db.prepare(`
          UPDATE room_folio_items
          SET quantity = ?, line_total_minor = ?, updated_at = ?, sync_status = 'local_only'
          WHERE id = ?
        `).run(quantity, unitPriceMinor * quantity, now, itemId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      return { ok: false, message: friendlyDatabaseError(error, "Ürün adedi güncellenemedi.") };
    } finally {
      db.close();
    }
    return { ok: true, message: "Ürün adedi güncellendi.", data: this.getData(), folioId };
  }

  addManualItem(input: AddRoomFolioManualItemInput): DesktopRoomFolioMutationResult {
    const folioId = cleanText(input?.folioId, 180);
    const kind = input?.kind === "discount" ? "discount" : input?.kind === "manual_charge" ? "manual_charge" : null;
    const label = cleanText(input?.label, 120);
    const amountMinor = positiveAmount(input?.amountMinor);
    if (!folioId || !kind || !label || amountMinor === null) {
      return { ok: false, message: "Ek ücret veya indirim bilgisi geçersiz." };
    }

    const db = this.openDatabase();
    try {
      if (!this.requireOpenFolio(db, folioId)) return { ok: false, message: "Oda adisyonu kapalı." };
      const totals = this.getTotals(db, folioId);
      const signedTotal = kind === "discount" ? -amountMinor : amountMinor;
      if (totals.chargeTotalMinor + signedTotal < totals.paidTotalMinor) {
        return { ok: false, message: "İndirim toplamı alınan ödemenin altına düşüremez." };
      }
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO room_folio_items (
          id, folio_id, kind, menu_item_id, label, unit_price_minor, quantity,
          line_total_minor, note, created_at, updated_at, deleted_at, sync_status
        ) VALUES (?, ?, ?, '', ?, ?, 1, ?, ?, ?, ?, '', 'local_only')
      `).run(
        `room_folio_item_${randomUUID()}`,
        folioId,
        kind,
        label,
        amountMinor,
        signedTotal,
        cleanText(input?.note, 500),
        now,
        now
      );
    } catch (error) {
      return { ok: false, message: friendlyDatabaseError(error, "Hesap kalemi eklenemedi.") };
    } finally {
      db.close();
    }
    return { ok: true, message: kind === "discount" ? "İndirim eklendi." : "Ek ücret eklendi.", data: this.getData(), folioId };
  }

  removeItem(itemIdValue: string): DesktopRoomFolioMutationResult {
    const itemId = cleanText(itemIdValue, 180);
    if (!itemId) return { ok: false, message: "Hesap kalemi bulunamadı." };

    const db = this.openDatabase();
    let folioId = "";
    try {
      const item = db.prepare(`SELECT * FROM room_folio_items WHERE id = ? AND deleted_at = ''`).get(itemId) as Record<string, unknown> | undefined;
      if (!item) return { ok: false, message: "Hesap kalemi bulunamadı." };
      folioId = text(item.folio_id);
      if (!this.requireOpenFolio(db, folioId)) return { ok: false, message: "Oda adisyonu kapalı." };
      const totals = this.getTotals(db, folioId);
      const prospectiveTotal = totals.chargeTotalMinor - safeSignedMinor(item.line_total_minor);
      if (prospectiveTotal < totals.paidTotalMinor) {
        return { ok: false, message: "Bu kalem çıkarılırsa hesap alınan ödemenin altına düşüyor." };
      }
      const now = new Date().toISOString();

      db.exec("BEGIN");
      try {
        if (text(item.kind) === "menu" && text(item.menu_item_id)) {
          const menu = this.getMenuStockRow(db, text(item.menu_item_id));
          if (menu) {
            this.applyMenuStockDelta(db, menu, -Math.max(1, Number(item.quantity) || 1), "order_remove", itemId, now);
          }
        }
        db.prepare(`
          UPDATE room_folio_items
          SET deleted_at = ?, updated_at = ?, sync_status = 'local_only'
          WHERE id = ?
        `).run(now, now, itemId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      return { ok: false, message: friendlyDatabaseError(error, "Hesap kalemi çıkarılamadı.") };
    } finally {
      db.close();
    }
    return { ok: true, message: "Hesap kalemi çıkarıldı.", data: this.getData(), folioId };
  }

  addPayment(input: AddRoomFolioPaymentInput): DesktopRoomFolioMutationResult {
    const folioId = cleanText(input?.folioId, 180);
    const amountMinor = positiveAmount(input?.amountMinor);
    if (!folioId || amountMinor === null) return { ok: false, message: "Ödeme tutarı geçersiz." };

    const db = this.openDatabase();
    try {
      const folio = this.requireOpenFolio(db, folioId);
      if (!folio) return { ok: false, message: "Oda adisyonu kapalı." };
      const totals = this.getTotals(db, folioId);
      if (totals.chargeTotalMinor <= 0) return { ok: false, message: "Ödeme almadan önce oda hesabında bir tutar olmalı." };
      if (totals.remainingMinor <= 0) return { ok: false, message: "Bu oda hesabının ödemesi tamamlanmış." };
      if (amountMinor > totals.remainingMinor) return { ok: false, message: "Ödeme kalan tutardan büyük olamaz." };
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO room_folio_payments (
          id, folio_id, amount_minor, currency, payment_method, paid_at, note,
          origin, reference_id, created_at, updated_at, deleted_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'direct', '', ?, ?, '', 'local_only')
      `).run(
        `room_folio_payment_${randomUUID()}`,
        folioId,
        amountMinor,
        normalizeCurrency(folio.currency),
        normalizePaymentMethod(input?.paymentMethod),
        now,
        cleanText(input?.note, 500),
        now,
        now
      );
    } catch (error) {
      return { ok: false, message: friendlyDatabaseError(error, "Ödeme kaydedilemedi.") };
    } finally {
      db.close();
    }
    return { ok: true, message: "Ödeme alındı ve kasaya işlendi.", data: this.getData(), folioId };
  }

  voidPayment(paymentIdValue: string): DesktopRoomFolioMutationResult {
    const paymentId = cleanText(paymentIdValue, 180);
    if (!paymentId) return { ok: false, message: "Ödeme kaydı bulunamadı." };
    const db = this.openDatabase();
    let folioId = "";
    try {
      const payment = db.prepare(`
        SELECT folio_id, origin FROM room_folio_payments WHERE id = ? AND deleted_at = ''
      `).get(paymentId) as Record<string, unknown> | undefined;
      if (!payment) return { ok: false, message: "Ödeme kaydı bulunamadı." };
      folioId = text(payment.folio_id);
      if (!this.requireOpenFolio(db, folioId)) return { ok: false, message: "Çıkış yapılmış oda hesabındaki ödeme değiştirilemez." };
      if (text(payment.origin) !== "direct") return { ok: false, message: "Rezervasyondan taşınan kaporayı kaynak kayıttan düzeltin." };
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE room_folio_payments SET deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?
      `).run(now, now, paymentId);
    } finally {
      db.close();
    }
    return { ok: true, message: "Ödeme kaydı geri alındı.", data: this.getData(), folioId };
  }

  /** Compatibility channel; allowOutstanding is retained on the wire but D-005 always permits departure. */
  checkout(input: CheckoutRoomFolioInput): DesktopRoomFolioMutationResult {
    const folioId = cleanText(input?.folioId, 180);
    if (!folioId) return { ok: false, message: "Oda adisyonu bulunamadı." };
    const db = this.openDatabase();
    let message: string;
    try {
      const result = checkoutHospitalityStay(db, { folioId });
      if (!result.ok) return result;
      message = result.remainingMinor > 0
        ? "Çıkış yapıldı; kalan tutar açık oda hesabında korunuyor."
        : "Çıkış yapıldı ve oda hesabı kapatıldı.";
    } catch (error) {
      return { ok: false, message: friendlyDatabaseError(error, "Çıkış işlemi tamamlanamadı.") };
    } finally {
      db.close();
    }
    return { ok: true, message, data: this.getData(), folioId };
  }

  private mapFolio(db: DatabaseSync, row: Record<string, unknown>): DesktopRoomFolio {
    const folioId = text(row.id);
    const items = db.prepare(`
      SELECT id, folio_id, kind, menu_item_id, label, unit_price_minor, quantity,
             line_total_minor, note, created_at
      FROM room_folio_items
      WHERE folio_id = ? AND deleted_at = ''
      ORDER BY created_at, id
    `).all(folioId) as Array<Record<string, unknown>>;
    const payments = db.prepare(`
      SELECT id, folio_id, amount_minor, currency, payment_method, paid_at, note, origin, created_at
      FROM room_folio_payments
      WHERE folio_id = ? AND deleted_at = ''
      ORDER BY paid_at, created_at
    `).all(folioId) as Array<Record<string, unknown>>;
    const checkInDate = normalizeDate(row.check_in_date) || "";
    const checkOutDate = normalizeDate(row.planned_check_out_date, true);
    return {
      id: folioId,
      stayId: text(row.stay_id),
      roomId: text(row.room_id),
      roomName: text(row.room_name),
      roomNumber: text(row.room_number),
      customerId: text(row.customer_id),
      customerName: text(row.customer_name),
      reservationId: text(row.reservation_id),
      status: text(row.status) === "closed" ? "closed" : text(row.status) === "cancelled" ? "cancelled" : "open",
      guestCount: clampGuestCount(row.guest_count),
      checkInDate,
      plannedCheckOutDate: checkOutDate,
      nights: calculateNights(checkInDate, checkOutDate) ?? 1,
      nightlyPriceMinor: safeMinor(row.nightly_price_minor),
      currency: normalizeCurrency(row.currency),
      lodgingTotalMinor: safeMinor(row.lodging_total_minor),
      lodgingManualOverride: Number(row.lodging_manual_override ?? 0) === 1,
      extrasTotalMinor: safeSignedMinor(row.extras_total_minor),
      chargeTotalMinor: safeMinor(row.charge_total_minor),
      paidTotalMinor: safeMinor(row.paid_total_minor),
      remainingMinor: safeMinor(row.remaining_minor),
      creditMinor: safeMinor(row.credit_minor),
      openedAt: text(row.opened_at),
      closedAt: text(row.closed_at),
      note: text(row.note),
      items: items.map(mapFolioItem),
      payments: payments.map(mapFolioPayment)
    };
  }

  private requireOpenFolio(db: DatabaseSync, folioId: string): Record<string, unknown> | null {
    return (db.prepare(`
      SELECT * FROM room_folios WHERE id = ? AND deleted_at = '' AND status = 'open'
    `).get(folioId) as Record<string, unknown> | undefined) ?? null;
  }

  private getTotals(db: DatabaseSync, folioId: string) {
    const row = db.prepare(`
      SELECT extras_total_minor, charge_total_minor, paid_total_minor, remaining_minor
      FROM room_folio_totals WHERE folio_id = ?
    `).get(folioId) as Record<string, unknown> | undefined;
    return {
      extrasTotalMinor: safeSignedMinor(row?.extras_total_minor),
      chargeTotalMinor: safeMinor(row?.charge_total_minor),
      paidTotalMinor: safeMinor(row?.paid_total_minor),
      remainingMinor: safeMinor(row?.remaining_minor)
    };
  }

  private getMenuStockRow(db: DatabaseSync, menuItemId: string): Record<string, unknown> | null {
    return (db.prepare(`
      SELECT id, name, price, currency, stock_quantity, stock_consumption_quantity, stock_unit
      FROM menu_items
      WHERE id = ? AND deleted_at = '' AND is_available = 1
    `).get(menuItemId) as Record<string, unknown> | undefined) ?? null;
  }

  private applyMenuStockDelta(
    db: DatabaseSync,
    menu: Record<string, unknown>,
    quantityDelta: number,
    movementType: "order_add" | "order_update" | "order_remove",
    sourceId: string,
    now: string
  ) {
    if (menu.stock_quantity === null || menu.stock_quantity === undefined) return;
    const before = Math.max(0, Number(menu.stock_quantity) || 0);
    const consumptionPerUnit = Math.max(0.000001, Number(menu.stock_consumption_quantity) || 1);
    const consumedDelta = quantityDelta * consumptionPerUnit;
    const after = before - consumedDelta;
    if (after < -0.000001) {
      throw new Error("room_folio_stock_insufficient");
    }
    const safeAfter = Math.max(0, after);
    db.prepare(`
      UPDATE menu_items SET stock_quantity = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?
    `).run(safeAfter, now, text(menu.id));
    db.prepare(`
      INSERT INTO menu_stock_movements (
        id, menu_item_id, type, quantity_change, quantity_before, quantity_after,
        source_type, source_id, actor_device_id, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'table_order', ?, '', 'Oda adisyonu', ?)
    `).run(
      `stock_room_folio_${randomUUID()}`,
      text(menu.id),
      movementType,
      -consumedDelta,
      before,
      safeAfter,
      sourceId,
      now
    );
    menu.stock_quantity = safeAfter;
  }

  private openDatabase() {
    const db = new DatabaseSync(this.databasePath);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");
    return db;
  }
}

function mapRoomPrice(row: Record<string, unknown>): DesktopRoomPrice {
  return {
    id: text(row.id),
    name: text(row.name),
    number: text(row.number),
    capacity: Math.max(1, Number(row.capacity) || 1),
    nightlyPriceMinor: safeMinor(row.nightly_price_minor),
    currency: normalizeCurrency(row.price_currency)
  };
}

function mapStay(row: Record<string, unknown>): DesktopRoomFolioStay {
  return {
    id: text(row.id),
    customerId: text(row.customer_id),
    customerName: text(row.customer_name),
    customerPhone: text(row.customer_phone),
    roomId: text(row.room_id),
    roomName: text(row.room_name),
    roomNumber: text(row.room_number),
    reservationId: text(row.reservation_id),
    status: text(row.status),
    checkInDate: text(row.check_in_date),
    checkOutDate: text(row.check_out_date),
    guestCount: clampGuestCount(row.guest_count),
    nightlyPriceMinor: safeMinor(row.nightly_price_minor),
    currency: normalizeCurrency(row.price_currency),
    folioId: text(row.folio_id)
  };
}

function mapMenuItem(row: Record<string, unknown>): DesktopRoomFolioMenuItem {
  return {
    id: text(row.id),
    categoryId: text(row.category_id),
    categoryName: text(row.category_name),
    name: text(row.name),
    description: text(row.description),
    priceMinor: Math.max(0, Math.round(Number(row.price ?? 0) * 100)),
    currency: normalizeCurrency(row.currency),
    stockQuantity: row.stock_quantity === null || row.stock_quantity === undefined ? null : Math.max(0, Number(row.stock_quantity) || 0),
    stockConsumptionQuantity: Math.max(0.000001, Number(row.stock_consumption_quantity) || 1),
    stockUnit: text(row.stock_unit) || "piece"
  };
}

function mapFolioItem(row: Record<string, unknown>): DesktopRoomFolioItem {
  const kindText = text(row.kind);
  return {
    id: text(row.id),
    folioId: text(row.folio_id),
    kind: kindText === "discount" ? "discount" : kindText === "manual_charge" ? "manual_charge" : "menu",
    menuItemId: text(row.menu_item_id),
    label: text(row.label),
    unitPriceMinor: safeMinor(row.unit_price_minor),
    quantity: Math.max(1, Number(row.quantity) || 1),
    lineTotalMinor: safeSignedMinor(row.line_total_minor),
    note: text(row.note),
    createdAt: text(row.created_at)
  };
}

function mapFolioPayment(row: Record<string, unknown>): DesktopRoomFolioPayment {
  return {
    id: text(row.id),
    folioId: text(row.folio_id),
    amountMinor: safeMinor(row.amount_minor),
    currency: normalizeCurrency(row.currency),
    paymentMethod: normalizePaymentMethod(row.payment_method),
    paidAt: text(row.paid_at),
    note: text(row.note),
    origin: text(row.origin) === "reservation" ? "reservation" : "direct",
    createdAt: text(row.created_at)
  };
}

function calculateNights(startDate: string, endDate: string): number | null {
  if (!startDate) return 1;
  if (!endDate) return 1;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function normalizeDate(value: unknown, allowEmpty = false): string {
  const candidate = text(value).trim();
  if (!candidate) return allowEmpty ? "" : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return "";
  const parsed = Date.parse(`${candidate}T00:00:00Z`);
  return Number.isFinite(parsed) ? candidate : "";
}

function normalizeTimestamp(value: unknown): string {
  const candidate = text(value).trim();
  if (!candidate) return "";
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function normalizePaymentMethod(value: unknown): RoomFolioPaymentMethod {
  const candidate = text(value).trim() as RoomFolioPaymentMethod;
  return PAYMENT_METHODS.has(candidate) ? candidate : "unspecified";
}

function normalizeCurrency(value: unknown): string {
  const currency = text(value || "TRY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "TRY";
}

function clampGuestCount(value: unknown): number {
  const count = Math.trunc(Number(value) || 1);
  return Math.max(1, Math.min(50, count));
}

function positiveInteger(value: unknown, max: number): number | null {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0 || number > max) return null;
  return number;
}

function positiveAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 999_999_999_999) return null;
  return amount;
}

function nonNegativeAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 999_999_999_999) return null;
  return amount;
}

function safeMinor(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
}

function safeSignedMinor(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.trunc(amount) : 0;
}

function cleanText(value: unknown, maxLength: number): string {
  return text(value).trim().slice(0, maxLength);
}

function text(value: unknown): string {
  return String(value ?? "");
}

function friendlyDatabaseError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("room_folio_stock_insufficient")) return "Bu ürün için yeterli stok yok.";
  if (message.includes("room_folio_payment_exceeds_remaining")) return "Ödeme kalan tutardan büyük olamaz.";
  if (message.includes("room_folio_total_required")) return "Ödeme almadan önce oda hesabında bir tutar olmalı.";
  return fallback;
}
