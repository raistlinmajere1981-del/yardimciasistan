import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { moneyToMinor } from "@yardimci-asistan/shared";

export type FinanceDirection = "income" | "expense";
export type FinancePaymentMethod = "cash" | "card" | "bank" | "other" | "unspecified";

export interface DesktopFinanceCategory {
  id: string;
  direction: FinanceDirection;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
}

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

interface DesktopPensionBalance {
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
  categories: DesktopFinanceCategory[];
}

export type DesktopFinanceAiMode = "summary" | "flow" | "receivables" | "recommendations";

export interface GenerateDesktopFinanceAiInput {
  mode: DesktopFinanceAiMode;
}

export type GenerateDesktopFinanceAiResult =
  | { ok: true; content: string }
  | { ok: false; message: string };

export interface SaveFinanceCategoryInput {
  id?: string;
  direction: FinanceDirection;
  name: string;
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

export type FinanceSource = "restaurant_order" | "pension_payment" | "room_folio_payment" | "customer_credit_payment" | "commerce_sale";

/** Canonical automatic ledger writer. The source owner must write on this transaction first.
 * System collections have fixed categories, independent of manual category availability.
 * Reservation deposits copied into a folio are not a second collection. */
export function synchronizeFinanceSourceInTransaction(db: DatabaseSync, source: FinanceSource, sourceId: string): void {
  if (!db.isTransaction) throw new Error("Finance source write requires a transaction.");
  let row: Record<string, unknown> | undefined;
  let prefix: string, category: string, description: string;
  if (source === "restaurant_order") {
    row = db.prepare(`SELECT o.*, CAST(ROUND(o.total * 100) AS INTEGER) AS amount_minor,
      COALESCE((SELECT currency FROM table_order_items WHERE order_id = o.id LIMIT 1), 'TRY') AS currency,
      'unspecified' AS payment_method, COALESCE(NULLIF(o.closed_at, ''), o.updated_at) AS occurred_at,
      EXISTS(SELECT 1 FROM room_folio_table_order_transfers WHERE table_order_id = o.id) AS transferred
      FROM table_orders o WHERE o.id = ?`).get(sourceId);
    if (!row) throw new Error("Finance source not found.");
    if (row.status !== "paid" || Number(row.total) <= 0 || row.transferred) {
      db.prepare("UPDATE finance_entries SET deleted_at = ?, updated_at = ? WHERE source_type = ? AND source_id = ?")
        .run(String(row.updated_at), String(row.updated_at), source, sourceId);
      return;
    }
    prefix = "finance_restaurant_"; category = "restaurant"; description = "Restoran adisyonu";
  } else if (source === "commerce_sale") {
    row = db.prepare(`SELECT *, COALESCE(NULLIF(closed_at, ''), created_at) AS occurred_at,
      '' AS note FROM commerce_sales WHERE id = ?`).get(sourceId);
    if (!row) throw new Error("Finance source not found.");
    if (row.status === "paid" && !row.deleted_at && Number(row.total) > 0) {
      row.amount_minor = moneyToMinor(Number(row.total));
    }
    if (!row.amount_minor) {
      const removedAt = String(row.deleted_at || row.updated_at);
      db.prepare("UPDATE finance_entries SET deleted_at = ?, updated_at = ? WHERE source_type = ? AND source_id = ?")
        .run(removedAt, String(row.updated_at), source, sourceId);
      return;
    }
    const method = String(row.payment_method ?? "").trim();
    row.payment_method = ["cash", "card", "bank"].includes(method) ? method : "other";
    ensureFinanceCategories(db);
    prefix = "finance_commerce_sale_"; category = "market"; description = "Market satışı";
  } else if (source === "pension_payment") {
    row = db.prepare("SELECT *, paid_at AS occurred_at FROM pension_payments WHERE id = ?").get(sourceId);
    prefix = "finance_pension_"; category = "pension"; description = "Pansiyon ödemesi";
  } else if (source === "room_folio_payment") {
    row = db.prepare("SELECT *, paid_at AS occurred_at FROM room_folio_payments WHERE id = ?").get(sourceId);
    if (row && row.origin !== "direct") return;
    prefix = "finance_room_folio_"; category = "pension"; description = "Oda tahsilatı";
  } else {
    row = db.prepare("SELECT * FROM customer_credit_entries WHERE id = ? AND entry_type = 'payment'").get(sourceId);
    prefix = "finance_credit_"; category = "other_income"; description = "Veresiye tahsilatı";
  }
  if (!row) throw new Error("Finance source not found.");
  db.prepare(`INSERT INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, deleted_at, sync_status
  ) VALUES (?, 'income', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
    ON CONFLICT(source_type, source_id) WHERE source_id != '' DO UPDATE SET
      amount_minor = excluded.amount_minor, currency = excluded.currency,
      payment_method = excluded.payment_method, occurred_at = excluded.occurred_at,
      note = excluded.note, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`)
    .run(prefix + sourceId, Number(row.amount_minor), String(row.currency), String(row.payment_method), category, description,
      String(row.occurred_at), source, sourceId, String(row.note), String(row.created_at), String(row.updated_at), String(row.deleted_at ?? ""));
}

/** Explicit repair only: existing source links (including deleted entries) are left untouched.
 * Manual income cannot be matched to a sale safely and is never changed here.
 * @compiledSmoke scripts/smoke-market-sale-finance.mjs; scripts/reconcile-commerce-sale-finance.mjs */
export function reconcileMissingCommerceSaleFinanceInTransaction(db: DatabaseSync): { reconciledCount: number } {
  if (!db.isTransaction) throw new Error("Finance reconciliation requires a transaction.");
  const sales = db.prepare(`SELECT s.id FROM commerce_sales s
    WHERE s.status = 'paid' AND s.total > 0 AND s.deleted_at = ''
      AND NOT EXISTS (SELECT 1 FROM finance_entries f
        WHERE f.source_type = 'commerce_sale' AND f.source_id = s.id)
    ORDER BY s.created_at, s.id`).all() as Array<{ id: string }>;
  const activeEntry = db.prepare("SELECT id FROM finance_entries WHERE source_type = 'commerce_sale' AND source_id = ? AND deleted_at = ''");
  let reconciledCount = 0;
  for (const sale of sales) {
    synchronizeFinanceSourceInTransaction(db, "commerce_sale", sale.id);
    if (activeEntry.get(sale.id)) reconciledCount += 1;
  }
  return { reconciledCount };
}

const DEFAULT_FINANCE_CATEGORIES: ReadonlyArray<{
  id: string;
  direction: FinanceDirection;
  name: string;
  isSystem: boolean;
  sortOrder: number;
}> = [
  { id: "other_income", direction: "income", name: "Diğer gelir", isSystem: false, sortOrder: 10 },
  { id: "pension", direction: "income", name: "Pansiyon", isSystem: true, sortOrder: 90 },
  { id: "restaurant", direction: "income", name: "Restoran", isSystem: true, sortOrder: 100 },
  { id: "market", direction: "income", name: "Market", isSystem: true, sortOrder: 110 },
  { id: "stock", direction: "expense", name: "Market / Stok", isSystem: false, sortOrder: 10 },
  { id: "utilities", direction: "expense", name: "Elektrik - Su", isSystem: false, sortOrder: 20 },
  { id: "rent", direction: "expense", name: "Kira", isSystem: false, sortOrder: 30 },
  { id: "staff", direction: "expense", name: "Personel", isSystem: false, sortOrder: 40 },
  { id: "maintenance", direction: "expense", name: "Bakım", isSystem: false, sortOrder: 50 },
  { id: "transport", direction: "expense", name: "Yakıt - Ulaşım", isSystem: false, sortOrder: 60 },
  { id: "official", direction: "expense", name: "Vergi / Resmi", isSystem: false, sortOrder: 70 },
  { id: "other_expense", direction: "expense", name: "Diğer gider", isSystem: false, sortOrder: 80 }
];

/** Uses the caller's connection/transaction; category availability is authoritative here. */
export function saveManualFinanceEntryInTransaction(db: DatabaseSync, input: SaveManualFinanceEntryInput,
  metadata: { id?: string; sourceId?: string; now?: string } = {}): { ok: true; message: string; savedId: string } | { ok: false; message: string } {
  const direction = input?.direction === "income" || input?.direction === "expense" ? input.direction : null;
  const amountMinor = normalizePositiveAmount(input?.amountMinor);
  if (!direction || amountMinor === null) return { ok: false, message: "Gelir veya gider için geçerli bir tutar girin." };
  const paymentMethod = normalizePaymentMethod(input?.paymentMethod);
  const category = cleanText(input?.category, 180);
  const description = cleanText(input?.description, 160) || (direction === "income" ? "Manuel gelir" : "Manuel gider");
  const note = cleanText(input?.note, 500);
  const now = metadata.now ?? new Date().toISOString();
  const occurredAt = normalizeTimestamp(input?.occurredAt) || now;
  const id = metadata.id ?? `finance_manual_${randomUUID()}`;
  ensureFinanceCategories(db);
  if (!db.prepare("SELECT id FROM finance_categories WHERE id = ? AND direction = ? AND is_active = 1 LIMIT 1").get(category, direction)) {
    return { ok: false, message: "Seçilen gelir / gider türü artık kullanılamıyor." };
  }
  db.prepare(`INSERT INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, deleted_at, sync_status
  ) VALUES (?, ?, ?, 'TRY', ?, ?, ?, ?, 'manual', ?, ?, ?, ?, '', 'local_only')`)
    .run(id, direction, amountMinor, paymentMethod, category, description, occurredAt, metadata.sourceId ?? "", note, now, now);
  return { ok: true, message: direction === "income" ? "Gelir kasaya eklendi." : "Gider kasaya eklendi.", savedId: id };
}

export class DesktopFinanceService {
  constructor(private readonly databasePath: string) {}

  getData(limit = 40): DesktopFinanceData {
    const db = this.openDatabase();
    try {
      ensureFinanceCategories(db);
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
            SELECT SUM(reservation_totals.remaining_minor)
            FROM pension_payment_totals AS reservation_totals
            JOIN reservations ON reservations.id = reservation_totals.reservation_id
            WHERE reservations.deleted_at = ''
              AND reservations.reservation_type = 'room'
              AND reservations.status NOT IN ('cancelled', 'rejected', 'no_show')
              AND reservation_totals.remaining_minor > 0
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

      const categoryRows = db.prepare(`
        SELECT id, direction, name, is_system, is_active, sort_order
        FROM finance_categories
        ORDER BY direction ASC, sort_order ASC, name COLLATE NOCASE ASC
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
        pensionBalances: pensionRows.map(mapPensionBalance),
        categories: categoryRows.map(mapFinanceCategory)
      };
    } finally {
      db.close();
    }
  }

  saveManualEntry(input: SaveManualFinanceEntryInput): DesktopFinanceMutationResult {
    const db = this.openDatabase();
    let result: ReturnType<typeof saveManualFinanceEntryInTransaction>;
    try {
      result = saveManualFinanceEntryInTransaction(db, input);
      if (!result.ok) return result;
    } catch {
      return { ok: false, message: "Kasa hareketi kaydedilemedi." };
    } finally {
      db.close();
    }
    return { ok: true, message: result.message, data: this.getData() };
  }

  saveCategory(input: SaveFinanceCategoryInput): DesktopFinanceMutationResult {
    const direction = input?.direction === "income" || input?.direction === "expense" ? input.direction : null;
    const name = cleanText(input?.name, 80);
    if (!direction || !name) {
      return { ok: false, message: "Gelir / gider türü adı gerekli." };
    }

    const db = this.openDatabase();
    try {
      ensureFinanceCategories(db);
      const requestedId = cleanText(input?.id, 180);
      if (requestedId) {
        const existing = db.prepare(`
          SELECT is_system FROM finance_categories WHERE id = ? AND direction = ?
        `).get(requestedId, direction) as { is_system?: number } | undefined;
        if (!existing) return { ok: false, message: "Gelir / gider türü bulunamadı." };
        if (Number(existing.is_system ?? 0) === 1) {
          return { ok: false, message: "Sistem türleri değiştirilemez." };
        }
        db.prepare(`
          UPDATE finance_categories
          SET name = ?, is_active = 1, updated_at = ?
          WHERE id = ? AND direction = ?
        `).run(name, new Date().toISOString(), requestedId, direction);
      } else {
        const duplicate = db.prepare(`
          SELECT id FROM finance_categories
          WHERE direction = ? AND lower(name) = lower(?) AND is_active = 1
          LIMIT 1
        `).get(direction, name);
        if (duplicate) return { ok: false, message: "Bu tür zaten listede." };

        const maxRow = db.prepare(`
          SELECT COALESCE(MAX(sort_order), 0) AS max_order
          FROM finance_categories WHERE direction = ?
        `).get(direction) as { max_order?: number } | undefined;
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO finance_categories (
            id, direction, name, is_system, is_active, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, 0, 1, ?, ?, ?)
        `).run(
          `finance_category_${randomUUID()}`,
          direction,
          name,
          Math.max(0, Math.trunc(Number(maxRow?.max_order ?? 0))) + 10,
          now,
          now
        );
      }
    } finally {
      db.close();
    }

    return {
      ok: true,
      message: input?.id ? "Tür güncellendi." : "Yeni tür eklendi.",
      data: this.getData()
    };
  }

  deleteCategory(categoryIdValue: string): DesktopFinanceMutationResult {
    const categoryId = cleanText(categoryIdValue, 180);
    if (!categoryId) return { ok: false, message: "Kaldırılacak tür bulunamadı." };

    const db = this.openDatabase();
    try {
      ensureFinanceCategories(db);
      const existing = db.prepare(`
        SELECT is_system, is_active FROM finance_categories WHERE id = ?
      `).get(categoryId) as { is_system?: number; is_active?: number } | undefined;
      if (!existing || Number(existing.is_active ?? 0) !== 1) {
        return { ok: false, message: "Gelir / gider türü bulunamadı." };
      }
      if (Number(existing.is_system ?? 0) === 1) {
        return { ok: false, message: "Sistem türleri kaldırılamaz." };
      }
      db.prepare(`
        UPDATE finance_categories
        SET is_active = 0, updated_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), categoryId);
    } finally {
      db.close();
    }

    return { ok: true, message: "Tür listeden kaldırıldı.", data: this.getData() };
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

  // Check-in öncesi rezervasyon bedeli ve kapora akışı.
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

  // Oda hesabı açılmadan önce alınan rezervasyon kaporası.
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
      db.exec("BEGIN IMMEDIATE");
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
      const paymentId = `pension_payment_${randomUUID()}`;
      db.prepare(`
        INSERT INTO pension_payments (
          id, reservation_id, amount_minor, currency, payment_method, paid_at,
          note, created_at, updated_at, deleted_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'local_only')
      `).run(
        paymentId,
        reservationId,
        amountMinor,
        normalizeCurrency(balance.currency),
        paymentMethod,
        paidAt,
        note,
        now,
        now
      );
      synchronizeFinanceSourceInTransaction(db, "pension_payment", paymentId);
      db.exec("COMMIT");
    } catch (error) {
      if (error instanceof Error && error.message.includes("reservation_payment_authority_transferred")) {
        return { ok: false, message: "Bu rezervasyonun ödeme hesabı açılmış. Tahsilatı oda hesabından yapın." };
      }
      return { ok: false, message: "Pansiyon ödemesi kaydedilemedi." };
    } finally {
      if (db.isTransaction) db.exec("ROLLBACK");
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

function mapFinanceCategory(row: Record<string, unknown>): DesktopFinanceCategory {
  return {
    id: String(row.id ?? ""),
    direction: row.direction === "expense" ? "expense" : "income",
    name: String(row.name ?? ""),
    isSystem: Number(row.is_system ?? 0) === 1,
    isActive: Number(row.is_active ?? 0) === 1,
    sortOrder: Math.max(0, Math.trunc(Number(row.sort_order ?? 0)))
  };
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


function ensureFinanceCategories(db: DatabaseSync) {
  // Normal product data seed only; persistent structure belongs to schema.sql.
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO finance_categories (
      id, direction, name, is_system, is_active, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
  `);
  for (const category of DEFAULT_FINANCE_CATEGORIES) {
    insert.run(
      category.id,
      category.direction,
      category.name,
      category.isSystem ? 1 : 0,
      category.sortOrder,
      now,
      now
    );
  }
}
