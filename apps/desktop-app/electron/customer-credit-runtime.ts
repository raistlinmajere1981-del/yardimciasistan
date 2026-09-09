import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES as C,
  createId,
  expandBusinessCapabilities,
  moneyToMinor,
  type AddCustomerCreditAdjustmentInput,
  type CommerceSale,
  type CreateCustomerCreditSaleInput,
  type CustomerCreditAccountDetail,
  type CustomerCreditAccountSummary,
  type CustomerCreditBalance,
  type CustomerCreditCustomer,
  type CustomerCreditEntry,
  type CustomerCreditHistoryEntry,
  type CustomerCreditSaleDetail,
  type ListCustomerCreditAccountsOptions,
  type ListCustomerCreditEntriesOptions,
  type RecordCustomerCreditPaymentInput
} from "@yardimci-asistan/shared";
import { createCommerceSaleInTransaction } from "./commerce-store";

type Row = Record<string, unknown>;

/** Capability and account reads share the same snapshot as the operation.
 * No renderer-authored business id, database path, price or balance is trusted. */
function withCreditDatabase<T>(
  databasePath: string,
  mutation: boolean,
  operation: (db: DatabaseSync, businessId: string) => T
): T {
  const db = new DatabaseSync(databasePath, { readOnly: !mutation });
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    db.exec(mutation ? "BEGIN IMMEDIATE" : "BEGIN");
    try {
      const business = db.prepare(`
        SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1
      `).get() as Row | undefined;
      const businessId = String(business?.id ?? "");
      if (!businessId) throw new Error("Aktif işletme bulunamadı.");
      const enabled = new Set((db.prepare(`
        SELECT capability_id FROM business_capabilities WHERE business_id = ? AND is_enabled = 1
      `).all(businessId) as Row[]).map((row) => String(row.capability_id)));
      if (expandBusinessCapabilities([C.CUSTOMER_CREDIT]).some((capability) => !enabled.has(capability))) {
        throw new Error("Veresiye / Müşteri Hesabı ve gerekli işletme yetenekleri etkin değil.");
      }
      const result = operation(db, businessId);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

function requireCustomer(db: DatabaseSync, businessId: string, customerId: string, active = true): CustomerCreditCustomer {
  const row = db.prepare(`
    SELECT id, business_id, full_name, phone, deleted_at FROM customers
    WHERE id = ? AND business_id = ? ${active ? "AND deleted_at = ''" : ""}
  `).get(String(customerId ?? "").trim(), businessId) as Row | undefined;
  if (!row) throw new Error("Veresiye için bu işletmeye ait kayıtlı aktif müşteri gerekli.");
  return mapCustomer(row);
}

function mapCustomer(row: Row): CustomerCreditCustomer {
  return {
    id: String(row.id), businessId: String(row.business_id), fullName: String(row.full_name),
    phone: String(row.phone), deletedAt: String(row.deleted_at)
  };
}

function mapEntry(row: Row): CustomerCreditEntry {
  return {
    id: String(row.id), businessId: String(row.business_id), customerId: String(row.customer_id),
    direction: row.direction as CustomerCreditEntry["direction"], amountMinor: Number(row.amount_minor),
    currency: String(row.currency), entryType: row.entry_type as CustomerCreditEntry["entryType"],
    saleId: row.sale_id === null ? null : String(row.sale_id),
    paymentMethod: row.payment_method as CustomerCreditEntry["paymentMethod"],
    occurredAt: String(row.occurred_at), note: String(row.note), source: String(row.source),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at)
  };
}

function balances(db: DatabaseSync, businessId: string, customerId: string): CustomerCreditBalance[] {
  return (db.prepare(`
    SELECT currency, amount_minor FROM customer_credit_balances
    WHERE business_id = ? AND customer_id = ? ORDER BY currency
  `).all(businessId, customerId) as Row[]).map((row) => ({
    currency: String(row.currency), amountMinor: Number(row.amount_minor)
  }));
}

function currencyCode(value: string): string {
  const currency = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Para birimi geçersiz.");
  return currency;
}

function positiveAmount(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 999_999_999_999) {
    throw new Error("Tutar pozitif tam sayı kuruş olmalı ve güvenli sınırı aşmamalı.");
  }
  return amount;
}

function pagination(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Liste sınırı geçersiz.");
  return Math.min(value, maximum);
}

function readEntries(db: DatabaseSync, businessId: string, customerId: string, options: ListCustomerCreditEntriesOptions): CustomerCreditHistoryEntry[] {
  const params: Array<string | number> = [businessId, customerId];
  if (options.currency !== undefined) params.push(currencyCode(options.currency));
  params.push(pagination(options.limit, 200, 500), pagination(options.offset, 0, Number.MAX_SAFE_INTEGER));
  const entries = (db.prepare(`
    SELECT * FROM customer_credit_entries WHERE business_id = ? AND customer_id = ?
      ${options.currency !== undefined ? "AND currency = ?" : ""}
    ORDER BY occurred_at DESC, created_at DESC, id DESC LIMIT ? OFFSET ?
  `).all(...params) as Row[]).map(mapEntry);
  // At most 500 ledger rows per page, one batched snapshot read, no catalog join.
  const saleIds = [...new Set(entries.filter((entry) => entry.entryType === "credit_sale" && entry.saleId !== null)
    .map((entry) => entry.saleId!))];
  if (!saleIds.length) return entries;
  const details = new Map<string, CustomerCreditSaleDetail>();
  const rows = db.prepare(`
    SELECT s.id AS sale_id, s.subtotal, s.discount_total, s.total, s.currency,
      i.id AS item_id, i.product_id, i.product_name, i.quantity, i.unit_price, i.line_total
    FROM commerce_sales s JOIN commerce_sale_items i ON i.sale_id = s.id
    WHERE s.business_id = ? AND s.id IN (${saleIds.map(() => "?").join(",")})
    ORDER BY s.id, i.created_at, i.rowid
  `).all(businessId, ...saleIds) as Row[];
  for (const row of rows) {
    const saleId = String(row.sale_id);
    let detail = details.get(saleId);
    if (!detail) {
      detail = { items: [], subtotal: Number(row.subtotal), discountTotal: Number(row.discount_total),
        total: Number(row.total), currency: String(row.currency) };
      details.set(saleId, detail);
    }
    detail.items.push({ id: String(row.item_id), productId: String(row.product_id), productName: String(row.product_name),
      quantity: Number(row.quantity), unitPrice: Number(row.unit_price), lineTotal: Number(row.line_total), currency: detail.currency });
  }
  return entries.map((entry) => entry.entryType === "credit_sale" && entry.saleId !== null
    ? { ...entry, saleDetail: details.get(entry.saleId) ?? null } : entry);
}

export function getCustomerCreditAccount(databasePath: string, customerId: string): CustomerCreditAccountDetail {
  return withCreditDatabase(databasePath, false, (db, businessId) => {
    const customer = requireCustomer(db, businessId, customerId, false);
    return { customer, balances: balances(db, businessId, customer.id), entries: readEntries(db, businessId, customer.id, {}) };
  });
}

export function listCustomerCreditEntries(
  databasePath: string, customerId: string, options: ListCustomerCreditEntriesOptions = {}
): CustomerCreditHistoryEntry[] {
  return withCreditDatabase(databasePath, false, (db, businessId) => {
    const customer = requireCustomer(db, businessId, customerId, false);
    return readEntries(db, businessId, customer.id, options);
  });
}

export function listCustomerCreditAccounts(
  databasePath: string, options: ListCustomerCreditAccountsOptions = {}
): CustomerCreditAccountSummary[] {
  return withCreditDatabase(databasePath, false, (db, businessId) => {
    const params: Array<string | number> = [businessId];
    const search = String(options.search ?? "").trim();
    if (search) params.push(`%${search}%`);
    params.push(pagination(options.limit, 200, 500), pagination(options.offset, 0, Number.MAX_SAFE_INTEGER));
    const rows = db.prepare(`
      SELECT c.* FROM customers c WHERE c.business_id = ?
        ${options.includeDeleted ? "" : "AND c.deleted_at = ''"}
        ${search ? "AND c.full_name LIKE ? COLLATE NOCASE" : ""}
        ${options.outstandingOnly ? `AND EXISTS (SELECT 1 FROM customer_credit_balances b
          WHERE b.business_id = c.business_id AND b.customer_id = c.id AND b.amount_minor > 0)` : ""}
      ORDER BY c.full_name COLLATE NOCASE, c.id LIMIT ? OFFSET ?
    `).all(...params) as Row[];
    return rows.map((row) => {
      const customer = mapCustomer(row);
      const last = db.prepare(`
        SELECT MAX(occurred_at) AS occurred_at FROM customer_credit_entries
        WHERE business_id = ? AND customer_id = ?
      `).get(businessId, customer.id) as Row;
      const payment = db.prepare(`
        SELECT * FROM customer_credit_entries WHERE business_id = ? AND customer_id = ? AND entry_type = 'payment'
        ORDER BY occurred_at DESC, created_at DESC, id DESC LIMIT 1
      `).get(businessId, customer.id) as Row | undefined;
      return {
        customer, balances: balances(db, businessId, customer.id).filter((balance) => balance.amountMinor > 0),
        lastMovementAt: String(last.occurred_at ?? ""),
        lastPayment: payment ? {
          id: String(payment.id), occurredAt: String(payment.occurred_at), amountMinor: Number(payment.amount_minor),
          currency: String(payment.currency), paymentMethod: payment.payment_method as CustomerCreditEntry["paymentMethod"]
        } : null
      };
    });
  });
}

function insertEntry(db: DatabaseSync, entry: CustomerCreditEntry): CustomerCreditEntry {
  positiveAmount(entry.amountMinor);
  db.prepare(`
    INSERT INTO customer_credit_entries (
      id, business_id, customer_id, direction, amount_minor, currency, entry_type,
      sale_id, payment_method, occurred_at, note, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(entry.id, entry.businessId, entry.customerId, entry.direction, entry.amountMinor,
    entry.currency, entry.entryType, entry.saleId, entry.paymentMethod, entry.occurredAt,
    entry.note, entry.source, entry.createdAt, entry.updatedAt);
  return entry;
}

function entryBase(businessId: string, customerId: string, now: string, note?: string, source?: string) {
  return {
    id: createId("credit_entry_"), businessId, customerId, saleId: null,
    paymentMethod: "" as const, occurredAt: now,
    note: String(note ?? "").trim().slice(0, 2000),
    source: String(source ?? "desktop").trim().slice(0, 80) || "desktop",
    createdAt: now, updatedAt: now
  };
}

export function createCustomerCreditSale(databasePath: string, input: CreateCustomerCreditSaleInput): CommerceSale {
  return withCreditDatabase(databasePath, true, (db, businessId) => {
    const customer = requireCustomer(db, businessId, input.customerId);
    const now = new Date().toISOString();
    const sale = createCommerceSaleInTransaction(db, input, "credit", now);
    insertEntry(db, {
      ...entryBase(businessId, customer.id, now, input.note, input.source),
      direction: "debit", entryType: "credit_sale", saleId: sale.id,
      amountMinor: moneyToMinor(sale.total), currency: currencyCode(sale.currency)
    });
    return sale;
  });
}

function requireAvailableDebt(db: DatabaseSync, businessId: string, customerId: string, currency: string, amount: number) {
  const debt = balances(db, businessId, customerId).find((balance) => balance.currency === currency)?.amountMinor ?? 0;
  if (debt <= 0 || amount > debt) throw new Error("Tutar mevcut veresiye borcunu aşamaz.");
}

export function recordCustomerCreditPayment(databasePath: string, input: RecordCustomerCreditPaymentInput): CustomerCreditEntry {
  return withCreditDatabase(databasePath, true, (db, businessId) => {
    const customer = requireCustomer(db, businessId, input.customerId);
    const amountMinor = positiveAmount(input.amountMinor);
    const currency = currencyCode(input.currency);
    if (!["cash", "card", "bank", "other"].includes(input.paymentMethod)) throw new Error("Tahsilat ödeme yöntemi geçersiz.");
    requireAvailableDebt(db, businessId, customer.id, currency, amountMinor);
    const now = new Date().toISOString();
    const paidAt = input.paidAt === undefined ? new Date(now) : new Date(input.paidAt);
    if (!Number.isFinite(paidAt.getTime())) throw new Error("Tahsilat tarihi geçersiz.");
    // The INSERT trigger projects finance income on this exact connection.
    return insertEntry(db, {
      ...entryBase(businessId, customer.id, now, input.note, input.source),
      direction: "credit", entryType: "payment", amountMinor, currency,
      paymentMethod: input.paymentMethod, occurredAt: paidAt.toISOString()
    });
  });
}

export function addCustomerCreditAdjustment(databasePath: string, input: AddCustomerCreditAdjustmentInput): CustomerCreditEntry {
  return withCreditDatabase(databasePath, true, (db, businessId) => {
    const customer = requireCustomer(db, businessId, input.customerId);
    const amountMinor = positiveAmount(input.amountMinor);
    const currency = currencyCode(input.currency);
    if (input.entryType !== "adjustment_debit" && input.entryType !== "adjustment_credit") throw new Error("Düzeltme türü geçersiz.");
    if (!String(input.note ?? "").trim()) throw new Error("Düzeltme için açıklama gerekli.");
    if (!String(input.source ?? "").trim()) throw new Error("Düzeltme kaynağı gerekli.");
    const direction = input.entryType === "adjustment_debit" ? "debit" : "credit";
    if (direction === "credit") requireAvailableDebt(db, businessId, customer.id, currency, amountMinor);
    return insertEntry(db, {
      ...entryBase(businessId, customer.id, new Date().toISOString(), input.note, input.source),
      direction, entryType: input.entryType, amountMinor, currency
    });
  });
}
