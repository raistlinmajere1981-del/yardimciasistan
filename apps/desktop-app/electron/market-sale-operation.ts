import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C, moneyToMinor, type CommerceSale } from "@yardimci-asistan/shared";
import { createCommerceSaleInTransaction, type CreateCommerceSaleInput } from "./commerce-store.js";
import { assertCustomerCreditBusinessInTransaction, createCustomerCreditSaleInTransaction, recordCustomerCreditSaleInTransaction, recordCustomerCreditPaymentInTransaction } from "./customer-credit-runtime.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { markMarketCartDraftReviewed } from "./market-companion-runtime.js";
import { desktopLog } from "./desktop-logger.js";

export interface CompleteMarketSaleInput extends CreateCommerceSaleInput {
  settlement: "paid" | "credit";
  /** Explicit tender in minor units; omission preserves full paid/credit settlement. */
  paymentAmountMinor?: number;
  customerId?: string;
  sourceDraftId?: string;
  operationId?: string;
}
export interface CompleteMarketSaleResult {
  sale: CommerceSale;
  draftReview: "not_requested" | "reviewed" | "failed";
  replayed: boolean;
  payment?: { receivedMinor: number; appliedToSaleMinor: number; appliedToDebtMinor: number; newDebtMinor: number };
}

function persistedSale(db: DatabaseSync, id: string): CommerceSale {
  const row = db.prepare("SELECT * FROM commerce_sales WHERE id = ? AND deleted_at = ''").get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Telefon sepetinin satış kaydı bulunamadı.");
  return { id: String(row.id), businessId: String(row.business_id), status: row.status as CommerceSale["status"],
    subtotal: Number(row.subtotal), discountTotal: Number(row.discount_total), total: Number(row.total), currency: String(row.currency),
    paymentMethod: String(row.payment_method), source: String(row.source), openedAt: String(row.opened_at),
    closedAt: String(row.closed_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

/** Canonical sale + durable source receipt are atomic; inbox review never rolls back the sale. */
export function completeMarketSale(databasePath: string, input: CompleteMarketSaleInput): CompleteMarketSaleResult {
  const { draftId } = prepareMarketSaleRequest(input);
  const db = new DatabaseSync(databasePath);
  let result: CompleteMarketSaleResult;
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE");
    try {
      result = completeMarketSaleInTransaction(db, { ...input, source: "desktop-market-quick-sale" }, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } finally { db.close(); }
  const { sale } = result;
  if (!draftId) return { ...result, draftReview: "not_requested" };
  try {
    markMarketCartDraftReviewed(databasePath, draftId);
    return { ...result, draftReview: "reviewed" };
  } catch (error) {
    desktopLog.warn({ scope: "commerce", event: "commerce.quick-sale.draft-review.failed",
      message: "Satış kaydedildi; telefon sepeti inceleme durumu güncellenemedi.",
      operationId: sale.id, meta: { draftId, saleId: sale.id }, error });
    return { ...result, draftReview: "failed" };
  }
}

/** Same canonical sale and source receipt, inside the Android action transaction. */
export function completeMarketSaleInTransaction(db: DatabaseSync, input: CompleteMarketSaleInput, now: string): CompleteMarketSaleResult {
  const { draftId, customerId, operationId, requestHash } = prepareMarketSaleRequest(input);
  let sale: CommerceSale;
  let replayed = false;
  if (!readEnabledBusinessCapabilities(db).includes(C.SALES)) throw new Error("Satış işlemleri bu işletmede etkin değil.");
  if (input.settlement === "credit") assertCustomerCreditBusinessInTransaction(db);
  const businessId = String((db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined)?.id ?? "");
  if (customerId && !readEnabledBusinessCapabilities(db).includes(C.CUSTOMERS)) throw new Error("Müşteri yönetimi bu işletmede etkin değil.");
  const draft = draftId ? db.prepare("SELECT status FROM commerce_sale_drafts WHERE id = ? AND business_id = ?")
    .get(draftId, businessId) as { status: string } | undefined : undefined;
  if (draftId && !draft) throw new Error("Telefon sepeti aktif işletmede bulunamadı.");
  const operationReceipt = operationId ? db.prepare("SELECT sale_id, request_hash FROM commerce_market_sale_receipts WHERE operation_id = ? AND business_id = ?")
    .get(operationId, businessId) as { sale_id: string; request_hash: string } | undefined : undefined;
  const receipt = operationReceipt ?? (draftId ? db.prepare("SELECT sale_id, request_hash FROM commerce_cart_draft_sales WHERE draft_id = ?")
    .get(draftId) as { sale_id: string; request_hash: string } | undefined : undefined);
  if (receipt) {
    if (receipt.request_hash !== requestHash) throw new Error(operationReceipt ? "Satış işlem anahtarı farklı bir satış isteğinde kullanılamaz." : "Telefon sepetinin satışı zaten kaydedildi; değiştirilmiş satış isteği uygulanamaz.");
    sale = persistedSale(db, receipt.sale_id);
    replayed = true;
  } else {
    if (draft && draft.status !== "pending") throw new Error("Telefon sepeti daha önce kapatılmış.");
    const saleInput = { ...input, customerId };
    sale = input.settlement === "credit"
      ? createCustomerCreditSaleInTransaction(db, { ...saleInput, customerId }, now)
      : createCommerceSaleInTransaction(db, saleInput, total => input.paymentAmountMinor !== undefined && input.paymentAmountMinor < moneyToMinor(total) ? "credit" : "paid", now);
    if (input.paymentAmountMinor !== undefined && input.settlement === "paid") {
      const totalMinor = moneyToMinor(sale.total);
      const appliedToDebtMinor = Math.max(0, input.paymentAmountMinor - totalMinor);
      if (sale.status === "credit" || appliedToDebtMinor > 0) {
        const creditBusinessId = assertCustomerCreditBusinessInTransaction(db);
        if (sale.status === "credit") recordCustomerCreditSaleInTransaction(db, creditBusinessId, { customerId, sale, now, source: input.source ?? "desktop-market-quick-sale" });
        const collectionMinor = sale.status === "credit" ? input.paymentAmountMinor : appliedToDebtMinor;
        if (collectionMinor > 0) recordCustomerCreditPaymentInTransaction(db, {
          customerId, amountMinor: collectionMinor, currency: sale.currency,
          paymentMethod: input.paymentMethod === "transfer" ? "bank" : (input.paymentMethod ?? "cash") as "cash" | "card" | "bank" | "other",
          source: input.source ?? "desktop-market-quick-sale"
        }, now);
      }
    }
    if (draftId) db.prepare("INSERT INTO commerce_cart_draft_sales (draft_id, sale_id, request_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(draftId, sale.id, requestHash, now);
    if (operationId) db.prepare("INSERT INTO commerce_market_sale_receipts (operation_id, business_id, sale_id, request_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(operationId, businessId, sale.id, requestHash, now);
  }
  const receivedMinor = input.paymentAmountMinor;
  if (replayed && receivedMinor !== undefined && (sale.status === "credit" || receivedMinor > moneyToMinor(sale.total))) assertCustomerCreditBusinessInTransaction(db);
  return { sale, draftReview: "not_requested", replayed,
    ...(receivedMinor === undefined ? {} : { payment: { receivedMinor,
      appliedToSaleMinor: Math.min(receivedMinor, moneyToMinor(sale.total)),
      appliedToDebtMinor: Math.max(0, receivedMinor - moneyToMinor(sale.total)),
      newDebtMinor: Math.max(0, moneyToMinor(sale.total) - receivedMinor) } }) };
}

function prepareMarketSaleRequest(input: CompleteMarketSaleInput) {
  const draftId = String(input?.sourceDraftId ?? "").trim();
  const customerId = String(input?.customerId ?? "").trim();
  const operationId = String(input?.operationId ?? "").trim();
  if (operationId && !/^[a-zA-Z0-9_-]{8,128}$/.test(operationId)) throw new Error("Satış işlem anahtarı geçersiz.");
  if (!["paid", "credit"].includes(input?.settlement)) throw new Error("Satış ödeme seçimi geçersiz.");
  if (input.paymentAmountMinor !== undefined) {
    if (!operationId) throw new Error("Manuel ödeme için satış işlem anahtarı gerekli.");
    if (!Number.isSafeInteger(input.paymentAmountMinor) || input.paymentAmountMinor < 0 || input.paymentAmountMinor > 999_999_999_999) throw new Error("Ödeme tutarı geçersiz.");
    if (input.settlement === "credit" && input.paymentAmountMinor !== 0) throw new Error("Veresiye seçiliyken ödeme tutarı sıfır olmalı.");
    if (input.settlement === "paid" && !["cash", "card", "transfer", "bank", "other"].includes(input.paymentMethod ?? "cash")) throw new Error("Tahsilat ödeme yöntemi geçersiz.");
  }
  if (!Array.isArray(input.items)) throw new Error("Satış için en az bir ürün gerekli.");
  const requestHash = createHash("sha256").update(JSON.stringify({
    items: input.items.map(item => ({ productId: String(item.productId).trim(), quantity: Number(item.quantity),
      ...(item.expectedUnitPrice === undefined ? {} : { expectedUnitPrice: item.expectedUnitPrice }),
      ...(item.expectedCurrency === undefined ? {} : { expectedCurrency: item.expectedCurrency }),
      ...(item.expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt: item.expectedUpdatedAt }) }))
      .sort((a, b) => a.productId.localeCompare(b.productId) || a.quantity - b.quantity),
    ...(input.paymentAmountMinor === undefined ? {} : { paymentAmountMinor: input.paymentAmountMinor }),
    discountTotal: Number(input.discountTotal ?? 0), locationId: String(input.locationId ?? "").trim(),
    settlement: input.settlement, customerId, draftId,
    paymentMethod: input.settlement === "credit" ? "" : String(input.paymentMethod ?? "cash").trim()
  })).digest("hex");
  return { draftId, customerId, operationId, requestHash };
}
