import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type FinanceDirection = "income" | "expense";
export type FinancePaymentMethod = "cash" | "card" | "bank" | "other" | "unspecified";

export interface DesktopFinanceEntry {
  id: string;
  direction: FinanceDirection;
  amountMinor: number;
  currency: string;
  paymentMethod: FinancePaymentMethod;
  category: string;
  description: string;
  occurredAt: string;
  sourceType: string;
  sourceId: string;
  note: string;
  createdAt: string;
}

export interface DesktopPensionBalance {
  reservationId: string;
  title: string;
  customerName: string;
  startDate: string;
  endDate: string;
  agreedTotalMinor: number;
  paidTotalMinor: number;
  remainingMinor: number;
  currency: string;
  paymentStatus: string;
}

export interface DesktopFinanceData {
  generatedAt: string;
  currency: string;
  todayIncomeMinor: number;
  todayExpenseMinor: number;
  todayNetMinor: number;
  outstandingPensionMinor: number;
  recentEntries: DesktopFinanceEntry[];
  pensionBalances: DesktopPensionBalance[];
}

export interface SaveManualFinanceEntryInput {
  direction: FinanceDirection;
  amountMinor: number;
  paymentMethod: FinancePaymentMethod;
  category: string;
  description: string;
  occurredAt?: string;
  note?: string;
}

export interface SetReservationAgreedTotalInput {
  reservationId: string;
  amountMinor: number;
  currency?: string;
}

export interface AddPensionPaymentInput {
  reservationId: string;
  amountMinor: number;
  paymentMethod: FinancePaymentMethod;
  paidAt?: string;
  note?: string;
}

export type DesktopFinanceMutationResult =
  | { ok: true; message: string; data: DesktopFinanceData }
  | { ok: false; message: string };

const PAYMENT_METHODS = new Set<FinancePaymentMethod>(["cash", "card", "bank", "other", "unspecified"]);
const INCOME_CATEGORIES = new Set(["restaurant", "pension", "other_income"]);
const EXPENSE_CATEGORIES = new Set(["stock", "utilities", "staff", "maintenance", "transport", "official", "other_expense"]);

export class DesktopFinanceService {
  constructor(private readonly databasePath: string) {}

  getData(limit = 40): DesktopFinanceData {
    const db = this.openDatabase();
    try {
      const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 40)));
      const today = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN direction = 'income' THEN amount_minor ELSE 0 END), 0) AS income_minor,
          COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount_minor ELSE 0 END), 0) AS expense_minor
        FROM finance_entries
        WHERE deleted_at = ''
          AND currency = 'TRY'
          AND date(occurred_at, 'localtime') = date('now', 'localtime')
      `).get() as { income_minor?: number; expense_minor?: number } | undefined;

      // Yeni modelde pansiyon alacağı oda adisyonuna aittir. Henüz oda adisyonuna
      // aktarılmamış eski rezervasyon kayıtları da veri kaybı olmaması için eklenir.
      const outstanding = db.prepare(`
        SELECT
          COALESCE((
            SELECT SUM(totals.remaining_minor)
            FROM room_folio_totals AS totals
            JOIN room_folios AS folios ON folios.id = totals.folio_id
            WHERE folios.deleted_at = ''
              AND folios.status IN ('open', 'closed')
              AND totals.remaining_minor > 0
          ), 0)
          +
          COALESCE((
            SELECT SUM(legacy.remaining_minor)
            FROM pension_payment_totals AS legacy
            JOIN reservations ON reservations.id = legacy.reservation_id
            WHERE reservations.deleted_at = ''
              AND reservations.reservation_type = 'room'
              AND reservations.status NOT IN ('cancelled', 'rejected', 'no_show')
              AND legacy.remaining_minor > 0
              AND NOT EXISTS (
                SELECT 1
                FROM room_folios AS folios
                WHERE folios.reservation_id = reservations.id AND folios.deleted_at = ''
              )
          ), 0) AS outstanding_minor
      `).get() as { outstanding_minor?: number } | undefined;

      const recentRows = db.prepare(`
        SELECT
          id, direction, amount_minor, currency, payment_method, category, description,
          occurred_at, source_type, source_id, note, created_at
        FROM finance_entries
        WHERE deleted_at = ''
        ORDER BY occurred_at DESC, created_at DESC
        LIMIT ?
      `).all(safeLimit) as Array<Record<string, unknown>>;

      // Eski rezervasyon bazlı kayıtlar yalnız geriye dönük uyumluluk içindir.
      // Güncel tahsilat arayüzü Pansiyon > Oda Adisyonu içindedir.
      const pensionRows = db.prepare(`
        SELECT
          reservations.id AS reservation_id,
          reservations.title,
          COALESCE(customers.full_name, '') AS customer_name,
          reservations.start_date,
          reservations.end_date,
          totals.agreed_total_minor,
          totals.paid_total_minor,
          totals.remaining_minor,
          totals.currency,
          reservations.payment_status
        FROM pension_payment_totals AS totals
        JOIN reservations ON reservations.id = totals.reservation_id
        LEFT JOIN customers ON customers.id = reservations.customer_id AND customers.deleted_at = ''
        WHERE reservations.deleted_at = ''
          AND reservations.reservation_type = 'room'
          AND reservations.status NOT IN ('cancelled', 'rejected', 'no_show')
          AND (totals.agreed_total_minor > 0 OR reservations.status IN ('pending', 'approved'))
        ORDER BY
          CASE
            WHEN totals.agreed_total_minor <= 0 THEN 0
            WHEN totals.remaining_minor > 0 THEN 1
            ELSE 2
          END,
          reservations.start_date ASC,
          reservations.created_at DESC
        LIMIT 100
      `).all() as Array<Record<string, unknown>>;

      const todayIncomeMinor = nonNegativeInteger(today?.income_minor);
      const todayExpenseMinor = nonNegativeInteger(today?.expense_minor);
      return {
        generatedAt: new Date().toISOString(),
        currency: "TRY",
        todayIncomeMinor,
        todayExpenseMinor,
        todayNetMinor: todayIncomeMinor - todayExpenseMinor,
        outstandingPensionMinor: nonNegativeInteger(outstanding?.outstanding_minor),
        recentEntries: recentRows.map(mapFinanceEntry),
        pensionBalances: pensionRows.map(mapPensionBalance)
      };
    } finally {
      db.close();
    }
  }

  saveManualEntry(input: SaveManualFinanceEntryInput): DesktopFinanceMutationResult {
    const direction = input?.direction === "income" || input?.direction === "expense" ? input.direction : null;
    const amountMinor = normalizePositiveAmount(input?.amountMinor);
    if (!direction || amountMinor === null) {
      return { ok: false, message: "Gelir veya gider için geçerli bir tutar girin." };
    }

    const paymentMethod = normalizePaymentMethod(input?.paymentMethod);
    const category = normalizeCategory(direction, input?.category);
    const description = cleanText(input?.description, 160) || (direction === "income" ? "Manuel gelir" : "Manuel gider");
    const note = cleanText(input?.note, 500);
    const occurredAt = normalizeTimestamp(input?.occurredAt) || new Date().toISOString();
    const now = new Date().toISOString();
    const id = `finance_manual_${randomUUID()}`;

    const db = this.openDatabase();
    try {
      db.prepare(`
        INSERT INTO finance_entries (
          id, direction, amount_minor, currency, payment_method, category, description,
          occurred_at, source_type, source_id, note, created_at, updated_at, deleted_at, sync_status
        ) VALUES (?, ?, ?, 'TRY', ?, ?, ?, ?, 'manual', '', ?, ?, ?, '', 'local_only')
      `).run(id, direction, amountMinor, paymentMethod, category, description, occurredAt, note, now, now);
    } catch {
      return { ok: false, message: "Kasa hareketi kaydedilemedi." };
    } finally {
      db.close();
    }

    return {
      ok: true,
      message: direction === "income" ? "Gelir kasaya eklendi." : "Gider kasaya eklendi.",
      data: this.getData()
    };
  }

  deleteManualEntry(entryIdValue: string): DesktopFinanceMutationResult {
    const entryId = cleanText(entryIdValue, 180);
    if (!entryId) return { ok: false, message: "Silinecek kasa hareketi bulunamadı." };

    const db = this.openDatabase();
    try {
      const row = db.prepare(`
        SELECT source_type, deleted_at FROM finance_entries WHERE id = ?
      `).get(entryId) as { source_type?: string; deleted_at?: string } | undefined;
      if (!row || row.deleted_at) return { ok: false, message: "Kasa hareketi bulunamadı." };
      if (row.source_type !== "manual") {
        return { ok: false, message: "Otomatik oluşan hareketi kaynak işlem üzerinden düzeltin." };
      }
      const now = new Date().toISOString();
      db.prepare("UPDATE finance_entries SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now, entryId);
    } finally {
      db.close();
    }

    return { ok: true, message: "Kasa hareketi kaldırıldı.", data: this.getData() };
  }

  // Geriye dönük uyumluluk: yeni kullanıcı akışı bu metodu doğrudan kullanmaz.
  setReservationAgreedTotal(input: SetReservationAgreedTotalInput): DesktopFinanceMutationResult {
    const reservationId = cleanText(input?.reservationId, 180);
    const amountMinor = normalizeNonNegativeAmount(input?.amountMinor);
    const currency = normalizeCurrency(input?.currency);
    if (!reservationId || amountMinor === null) {
      return { ok: false, message: "Konaklama tutarı geçersiz." };
    }

    const db = this.openDatabase();
    try {
      const reservation = db.prepare(`
        SELECT reservation_type, status FROM reservations WHERE id = ? AND deleted_at = ''
      `).get(reservationId) as { reservation_type?: string; status?: string } | undefined;
      if (!reservation || reservation.reservation_type !== "room") {
        return { ok: false, message: "Pansiyon rezervasyonu bulunamadı." };
      }
      if (["cancelled", "rejected"].includes(String(reservation.status ?? ""))) {
        return { ok: false, message: "İptal edilmiş rezervasyona tutar eklenemez." };
      }
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE reservations SET agreed_total_minor = ?, currency = ?, updated_at = ? WHERE id = ?
      `).run(amountMinor, currency, now, reservationId);
    } finally {
      db.close();
    }

    return { ok: true, message: "Konaklama bedeli güncellendi.", data: this.getData() };
  }

  // Geriye dönük uyumluluk: yeni tahsilatlar room_folio_payments üzerinden alınır.
  addPensionPayment(input: AddPensionPaymentInput): DesktopFinanceMutationResult {
    const reservationId = cleanText(input?.reservationId, 180);
    const amountMinor = normalizePositiveAmount(input?.amountMinor);
    if (!reservationId || amountMinor === null) {
      return { ok: false, message: "Ödeme için geçerli bir tutar girin." };
    }
    const paymentMethod = normalizePaymentMethod(input?.paymentMethod);
    const note = cleanText(input?.note, 500);
    const paidAt = normalizeTimestamp(input?.paidAt) || new Date().toISOString();

    const db = this.openDatabase();
    try {
      const balance = db.prepare(`
        SELECT
          reservations.reservation_type,
          reservations.status,
          totals.agreed_total_minor,
          totals.remaining_minor,
          totals.currency
        FROM reservations
        LEFT JOIN pension_payment_totals AS totals ON totals.reservation_id = reservations.id
        WHERE reservations.id = ? AND reservations.deleted_at = ''
      `).get(reservationId) as {
        reservation_type?: string;
        status?: string;
        agreed_total_minor?: number;
        remaining_minor?: number;
        currency?: string;
      } | undefined;

      if (!balance || balance.reservation_type !== "room") {
        return { ok: false, message: "Pansiyon rezervasyonu bulunamadı." };
      }
      if (["cancelled", "rejected"].includes(String(balance.status ?? ""))) {
        return { ok: false, message: "İptal edilmiş rezervasyona ödeme eklenemez." };
      }
      const agreedTotal = nonNegativeInteger(balance.agreed_total_minor);
      const remaining = nonNegativeInteger(balance.remaining_minor);
      if (agreedTotal <= 0) return { ok: false, message: "Ödeme almadan önce konaklama bedelini girin." };
      if (remaining <= 0) return { ok: false, message: "Bu konaklamanın ödemesi tamamlanmış." };
      if (amountMinor > remaining) return { ok: false, message: "Ödeme tutarı kalan alacaktan büyük olamaz." };

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO pension_payments (
          id, reservation_id, stay_id, amount_minor, currency, payment_method, paid_at,
          note, created_at, updated_at, deleted_at, sync_status
        ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, '', 'local_only')
      `).run(
        `pension_payment_${randomUUID()}`,
        reservationId,
        amountMinor,
        normalizeCurrency(balance.currency),
        paymentMethod,
        paidAt,
        note,
        now,
        now
      );
    } catch {
      return { ok: false, message: "Pansiyon ödemesi kaydedilemedi." };
    } finally {
      db.close();
    }

    return { ok: true, message: "Pansiyon ödemesi kaydedildi ve kasaya işlendi.", data: this.getData() };
  }

  private openDatabase() {
    const db = new DatabaseSync(this.databasePath);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");
    return db;
  }
}

function mapFinanceEntry(row: Record<string, unknown>): DesktopFinanceEntry {
  return {
    id: String(row.id ?? ""),
    direction: row.direction === "expense" ? "expense" : "income",
    amountMinor: nonNegativeInteger(row.amount_minor),
    currency: normalizeCurrency(row.currency),
    paymentMethod: normalizePaymentMethod(row.payment_method),
    category: String(row.category ?? "other"),
    description: String(row.description ?? ""),
    occurredAt: String(row.occurred_at ?? ""),
    sourceType: String(row.source_type ?? "manual"),
    sourceId: String(row.source_id ?? ""),
    note: String(row.note ?? ""),
    createdAt: String(row.created_at ?? "")
  };
}

function mapPensionBalance(row: Record<string, unknown>): DesktopPensionBalance {
  return {
    reservationId: String(row.reservation_id ?? ""),
    title: String(row.title ?? "Konaklama"),
    customerName: String(row.customer_name ?? ""),
    startDate: String(row.start_date ?? ""),
    endDate: String(row.end_date ?? ""),
    agreedTotalMinor: nonNegativeInteger(row.agreed_total_minor),
    paidTotalMinor: nonNegativeInteger(row.paid_total_minor),
    remainingMinor: nonNegativeInteger(row.remaining_minor),
    currency: normalizeCurrency(row.currency),
    paymentStatus: String(row.payment_status ?? "not_required")
  };
}

function normalizePaymentMethod(value: unknown): FinancePaymentMethod {
  const candidate = String(value ?? "").trim() as FinancePaymentMethod;
  return PAYMENT_METHODS.has(candidate) ? candidate : "unspecified";
}

function normalizeCategory(direction: FinanceDirection, value: unknown): string {
  const candidate = String(value ?? "").trim();
  const allowed = direction === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (allowed.has(candidate)) return candidate;
  return direction === "income" ? "other_income" : "other_expense";
}

function normalizePositiveAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 999_999_999_999) return null;
  return amount;
}

function normalizeNonNegativeAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 999_999_999_999) return null;
  return amount;
}

function nonNegativeInteger(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
}

function normalizeCurrency(value: unknown): string {
  const currency = String(value ?? "TRY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "TRY";
}

function normalizeTimestamp(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}
