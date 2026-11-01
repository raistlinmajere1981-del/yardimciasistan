import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C, moneyToMinor, type CommerceSale, type BenefitsSettlementReceipt, type BenefitsQuote, type BenefitsReservationReceipt } from "@yardimci-asistan/shared";
import { createCommerceSaleInTransaction, prepareCommerceSaleSource, type CommerceSaleSourceAllocation, type CreateCommerceSaleInput } from "./commerce-store.js";
import { assertCustomerCreditBusinessInTransaction, createCustomerCreditSaleInTransaction, recordCustomerCreditSaleInTransaction, recordCustomerCreditPaymentInTransaction } from "./customer-credit-runtime.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { markMarketCartDraftReviewed } from "./market-companion-runtime.js";
import { desktopLog } from "./desktop-logger.js";
import { canonicalBenefitsJson, benefitsHmac, benefitsOperation, withCommerceBenefitsTransaction, withCommerceBenefitsParentFailureBoundary, type BenefitsSecretKey, type BenefitsTransaction } from "./commerce-benefits-rules.js";
import { benefitsAssert } from "./commerce-benefits-engine.js";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service.js";
import { canonicalMarketBenefitsPayment, prepareMarketSaleBenefits, replayMarketSaleBenefits, validateMarketSaleBenefits,
  prepareMarketSaleBenefitsIngress, validateMarketSaleBenefitsCommand, type MarketSaleBenefitsCommand, type MarketSaleBenefitsAuthority, type MarketSaleBenefitsExecution } from "./market-sale-benefits.js";

export interface CompleteMarketSaleInput extends CreateCommerceSaleInput {
  settlement: "paid" | "credit";
  /** Explicit tender in minor units; omission preserves full paid/credit settlement. */
  paymentAmountMinor?: number;
  customerId?: string;
  sourceDraftId?: string;
  operationId?: string;
  /** Explicit B2a opt-in; quote is an expectation, never price/authorization authority. */
  benefits?: MarketSaleBenefitsCommand;
}
export interface CompleteMarketSaleResult {
  sale: CommerceSale;
  draftReview: "not_requested" | "reviewed" | "failed";
  replayed: boolean;
  benefits?: BenefitsSettlementReceipt;
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
export function completeMarketSale(databasePath: string, input: CompleteMarketSaleInput, authority?: MarketSaleBenefitsAuthority): CompleteMarketSaleResult {
  const { draftId } = prepareMarketSaleRequest(input);
  validateMarketSaleBenefitsCommand(input);
  const db = new DatabaseSync(databasePath);
  let result: CompleteMarketSaleResult;
  try {
    // Protected key storage is external I/O: finish it before BEGIN IMMEDIATE.
    let key: BenefitsSecretKey | undefined;
    let authorizationId: string | null = null;
    if (input.benefits !== undefined) {
      benefitsAssert(authority, "BENEFITS_STAFF_REQUIRED");
      authority.actor.assertAuthorized();
      benefitsAssert(authority.actor.role === "desktop_owner" && authority.actor.id.length > 0, "BENEFITS_STAFF_REQUIRED");
      // Exact persisted replays must work even after coupon/family exhaustion or expiry.
      const businessId = String(db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
      const existing = db.prepare("SELECT 1 FROM commerce_market_sale_receipts WHERE business_id = ? AND operation_id = ?")
        .get(businessId, input.operationId!)
        || (draftId && db.prepare("SELECT 1 FROM commerce_cart_draft_sales WHERE draft_id = ?").get(draftId));
      const ingress = prepareMarketSaleBenefitsIngress(db, { operationId: input.operationId!, items: input.items,
        customerId: input.customerId, paymentMethod: input.paymentMethod ?? "cash",
        requestedPointsMinor: input.benefits.requestedPointsMinor, couponCode: input.benefits.couponCode }, authority, Boolean(existing));
      key = ingress.key;
      if (!existing) authorizationId = ingress.authorizeCoupon();
    }
    result = withCommerceBenefitsTransaction(db, Date.now(), tx => completeMarketSaleInTransaction(db,
      { ...input, source: "desktop-market-quick-sale" }, new Date(tx.now).toISOString(), authority && key ? { tx, authority, key, authorizationId } : undefined));
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

export interface MarketSaleSourceAllocation { readonly source: Readonly<{ kind: "sale"; id: string }> }
declare const companionTenderContractBrand: unique symbol;
/** INTERNAL negative execution contract. A plan is never tender authority. */
export interface MarketSaleCompanionTenderContract { readonly [companionTenderContractBrand]: true }
const companionTenderContracts = new WeakMap<MarketSaleCompanionTenderContract, {
  tx: BenefitsTransaction; database: DatabaseSync; now: number; allocation: MarketSaleSourceAllocation;
  requestHash: string; operationId: string; attempted: boolean;
  readIssuedReservation: () => { reservationId: string; quote: BenefitsQuote };
  evidence: string;
}>();

/** The reader must revalidate the original C20k issuance, principal and quote.
 * It confers no reserve/settle permission, even when every comparison succeeds.
 */
export function prepareMarketSaleCompanionTenderContract(tx: BenefitsTransaction, input: CompleteMarketSaleInput,
  allocation: MarketSaleSourceAllocation, readIssuedReservation: () => { reservationId: string; quote: BenefitsQuote }) {
  return benefitsOperation(tx, () => {
    const handle = Object.freeze({}) as MarketSaleCompanionTenderContract;
    companionTenderContracts.set(handle, { tx, database: tx.database, now: tx.now, allocation,
      ...prepareMarketSaleRequest(input), attempted: false, readIssuedReservation, evidence: "" });
    const plan = readMarketSaleCompanionTenderContract(tx, input, allocation, handle);
    companionTenderContracts.get(handle)!.evidence = canonicalBenefitsJson(plan);
    return handle;
  });
}

export function readMarketSaleCompanionTenderContract(tx: BenefitsTransaction, input: CompleteMarketSaleInput,
  allocation: MarketSaleSourceAllocation, handle: MarketSaleCompanionTenderContract) {
  return benefitsOperation(tx, () => {
    const state = handle && companionTenderContracts.get(handle), request = prepareMarketSaleRequest(input);
    benefitsAssert(state && state.tx === tx && state.database === tx.database && state.now === tx.now
      && state.allocation === allocation && !state.attempted && state.requestHash === request.requestHash
      && state.operationId === request.operationId, "COMPANION_POINTS_TENDER_CONTRACT_SCOPE");
    readPreparedMarketSaleOperationSourceInTransaction(tx.database, input, allocation);
    benefitsAssert(input.paymentAmountMinor === undefined && Number(input.discountTotal ?? 0) === 0,
      "COMPANION_POINTS_TENDER_CONTRACT_SCOPE");
    benefitsAssert(input.paymentMethod === "cash", "COMPANION_POINTS_EXTERNAL_TENDER_EVIDENCE_REQUIRED");
    const changes = tx.database.prepare("SELECT total_changes() n").get()!.n;
    const issued = benefitsOperation(tx, state.readIssuedReservation);
    benefitsAssert(tx.database === state.database && tx.now === state.now
      && tx.database.prepare("SELECT total_changes() n").get()!.n === changes,
    "COMPANION_POINTS_TENDER_RECHECK_WROTE");
    const quote = issued.quote, capabilities = readEnabledBusinessCapabilities(tx.database);
    const businessId = String(tx.database.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1").get()?.id ?? "");
    benefitsAssert(capabilities.includes(C.SALES) && capabilities.includes(C.COMMERCE_BENEFITS)
      && capabilities.includes(C.CUSTOMERS) && request.customerId && issued.reservationId,
    "COMPANION_POINTS_TENDER_CONTRACT_SCOPE");
    const subtotalMinor = input.items.reduce((sum, item) => {
      const price = resolveCommerceProductPriceInDatabase(tx.database, businessId,
        { productId: item.productId, customerId: request.customerId }, capabilities.includes(C.WHOLESALE));
      benefitsAssert(price.currency === quote.currency, "COMPANION_POINTS_TENDER_MISMATCH");
      return sum + moneyToMinor(price.unitPrice * item.quantity);
    }, 0);
    benefitsAssert(quote.currencyExponent === 2 && quote.accountingMinor === 0 && quote.subtotalMinor === subtotalMinor
      && [subtotalMinor, quote.discountMinor, quote.pointsTenderMinor, quote.payableMinor].every(n => Number.isSafeInteger(n) && n >= 0)
      && quote.pointsTenderMinor > 0
      && BigInt(subtotalMinor) === BigInt(quote.discountMinor) + BigInt(quote.pointsTenderMinor) + BigInt(quote.payableMinor),
    "COMPANION_POINTS_TENDER_MISMATCH");
    const plan = Object.freeze({ operationId: state.operationId, source: allocation.source, businessId,
      customerId: request.customerId, reservationId: issued.reservationId, currency: quote.currency, paymentMethod: "cash" as const,
      subtotalMinor, discountMinor: quote.discountMinor, totalMinor: subtotalMinor - quote.discountMinor,
      cashPaidMinor: quote.payableMinor, pointsTenderMinor: quote.pointsTenderMinor,
      financeIncomeMinor: quote.payableMinor, authority: "unavailable" as const });
    benefitsAssert(!state.evidence || state.evidence === canonicalBenefitsJson(plan), "COMPANION_POINTS_TENDER_CONTRACT_CHANGED");
    return plan;
  });
}

/** Deliberately terminal: neither issuance nor the plan authorizes a paid sale.
 * No writer is reached. Catching this denial still poisons the borrowed parent.
 * A future owner decision must supply independent Companion tender authority,
 * connect BOTH existing source guards, and recheck before canonical settlement.
 */
export function assertMarketSaleCompanionTenderExecution(tx: BenefitsTransaction, input: CompleteMarketSaleInput,
  allocation: MarketSaleSourceAllocation, handle: MarketSaleCompanionTenderContract): never {
  return benefitsOperation(tx, () => {
    readMarketSaleCompanionTenderContract(tx, input, allocation, handle);
    companionTenderContracts.get(handle)!.attempted = true;
    benefitsAssert(false, "COMPANION_POINTS_TENDER_AUTHORITY_REQUIRED");
  });
}

declare const operationObservationBrand: unique symbol;
/** Internal, non-authorizing, single-use observation of the existing writer. */
export interface MarketSaleOperationObservation { readonly [operationObservationBrand]: true }
const operationObservations = new WeakMap<MarketSaleOperationObservation, {
  tx: BenefitsTransaction; database: DatabaseSync; now: number;
  allocation: MarketSaleSourceAllocation; requestHash: string; operationId: string;
  recheck: () => void; used: boolean;
  receipt?: Readonly<{ operationId: string; requestHash: string; saleId: string; businessId: string; customerId: string | null;
    cashPaidMinor: number; pointsTenderMinor: number; currency: string; paymentMethod: string }>;
  evidence?: string;
  paidSale?: Readonly<{ receipt: BenefitsReservationReceipt; quote: BenefitsQuote; quoteEvidence: string }>;
}>();
const observationParents = new WeakMap<DatabaseSync, BenefitsTransaction>();

/** The callback may only recheck the server-owned parent/issuance; no SQL writes. */
export function prepareMarketSaleOperationObservation(tx: BenefitsTransaction, input: CompleteMarketSaleInput,
  allocation: MarketSaleSourceAllocation, recheck: () => void): MarketSaleOperationObservation {
  return benefitsOperation(tx, () => {
    readPreparedMarketSaleOperationSourceInTransaction(tx.database, input, allocation);
    benefitsAssert(input.paymentAmountMinor === undefined && Number(input.discountTotal ?? 0) === 0,
      "COMPANION_POINTS_OPERATION_SCOPE");
    const handle = Object.freeze({}) as MarketSaleOperationObservation;
    operationObservations.set(handle, { tx, database: tx.database, now: tx.now,
      allocation, ...prepareMarketSaleRequest(input), recheck, used: false });
    observationParents.set(tx.database, tx);
    return handle;
  });
}

function operationEvidence(db: DatabaseSync, operationId: string, saleId: string): string {
  // Snapshot real canonical rows, including the mutable receipt. This is a
  // comparison only; rows alone can never mint or restore the memory identity.
  return JSON.stringify([
    db.prepare("SELECT * FROM commerce_market_sale_receipts WHERE operation_id=? OR sale_id=? ORDER BY operation_id").all(operationId, saleId),
    db.prepare("SELECT * FROM commerce_sales WHERE id=?").all(saleId),
    db.prepare("SELECT * FROM commerce_sale_items WHERE sale_id=? ORDER BY id").all(saleId),
    db.prepare("SELECT * FROM commerce_sale_settlements WHERE sale_id=?").all(saleId),
    db.prepare("SELECT * FROM commerce_benefit_snapshots WHERE source_kind='sale' AND source_id=? ORDER BY id").all(saleId),
    db.prepare("SELECT * FROM commerce_order_fulfillments WHERE sale_id=?").all(saleId),
    db.prepare("SELECT * FROM commerce_sale_full_refunds WHERE sale_id=?").all(saleId),
    db.prepare("SELECT * FROM finance_entries WHERE source_type='commerce_sale' AND source_id=? ORDER BY id").all(saleId),
    db.prepare("SELECT * FROM inventory_movements WHERE reference_type='commerce_sale' AND reference_id=? ORDER BY id").all(saleId)
  ]);
}

function recheckOperationParent(state: NonNullable<ReturnType<typeof operationObservations.get>>): void {
  const db = state.database, changes = db.prepare("SELECT total_changes() n").get()!.n;
  benefitsOperation(state.tx, state.recheck);
  benefitsAssert(state.tx.database === db && state.tx.now === state.now && db.isTransaction,
    "COMPANION_POINTS_OPERATION_SCOPE");
  benefitsAssert(db.prepare("SELECT total_changes() n").get()!.n === changes, "COMPANION_POINTS_OPERATION_RECHECK_WROTE");
}

/** Fresh current-parent identity AND unchanged canonical rows are both required.
 * Never returns settlement permission. Copying/serializing SQL or handles fails.
 */
export function readMarketSaleOperationObservation(tx: BenefitsTransaction, input: CompleteMarketSaleInput,
  allocation: MarketSaleSourceAllocation, handle: MarketSaleOperationObservation) {
  return benefitsOperation(tx, () => {
    const state = handle && operationObservations.get(handle), request = prepareMarketSaleRequest(input);
    benefitsAssert(state && state.tx === tx && state.database === tx.database && state.now === tx.now
      && state.allocation === allocation && state.used && state.receipt
      && state.operationId === request.operationId && state.requestHash === request.requestHash
      && input.source === "android-market-sale" && !input.benefits, "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED");
    recheckOperationParent(state);
    benefitsAssert(tx.database.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1").get()?.id
      === state.receipt.businessId, "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED");
    benefitsAssert(operationEvidence(tx.database, state.operationId, state.receipt.saleId) === state.evidence,
      "COMPANION_POINTS_OPERATION_RECEIPT_CHANGED");
    benefitsAssert(!tx.database.prepare("SELECT 1 FROM android_action_receipts WHERE id=?").get(state.operationId)
      && !tx.database.prepare("SELECT 1 FROM android_market_sale_result_receipts WHERE action_id=?").get(state.operationId),
    "COMPANION_POINTS_PARENT_ALREADY_APPLIED");
    return state.receipt;
  });
}

/** Read the immutable receipt minted by this owner for an already-used witness.
 * Allocation identity was required for the sale; this post-write read rechecks the
 * same parent, request hash and untouched canonical evidence, and returns no
 * settlement permission. SQL rows alone still cannot revive the memory identity. */
export function readMarketSaleOperationWitnessReceipt(tx: BenefitsTransaction, input: CompleteMarketSaleInput,
  handle: MarketSaleOperationObservation) {
  return benefitsOperation(tx, () => {
    const state = handle && operationObservations.get(handle), request = prepareMarketSaleRequest(input);
    benefitsAssert(state && state.tx === tx && state.database === tx.database && state.now === tx.now
      && state.used && state.receipt && state.operationId === request.operationId
      && state.requestHash === request.requestHash && input.source === "android-market-sale"
      && input.settlement === "paid" && !input.benefits, "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED");
    recheckOperationParent(state);
    benefitsAssert(tx.database.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1").get()?.id
      === state.receipt.businessId, "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED");
    benefitsAssert(operationEvidence(tx.database, state.operationId, state.receipt.saleId) === state.evidence,
      "COMPANION_POINTS_OPERATION_RECEIPT_CHANGED");
    benefitsAssert(!tx.database.prepare("SELECT 1 FROM android_action_receipts WHERE id=?").get(state.operationId)
      && !tx.database.prepare("SELECT 1 FROM android_market_sale_result_receipts WHERE action_id=?").get(state.operationId),
    "COMPANION_POINTS_PARENT_ALREADY_APPLIED");
    return state.receipt;
  });
}

declare const paidSaleProvenanceBrand: unique symbol;
/** Opaque, non-serializable capture of a valid owner operation receipt before
 * later settlement rows change the mutable operation evidence. It grants no
 * Store/ACK authority and cannot be recreated from SQL or JSON. */
export interface MarketSalePaidSaleProvenance { readonly [paidSaleProvenanceBrand]: true }
const paidSaleProvenances = new WeakMap<MarketSalePaidSaleProvenance, {
  tx: BenefitsTransaction; database: DatabaseSync; requestHash: string;
  receipt: Readonly<{ operationId: string; requestHash: string; saleId: string; businessId: string; customerId: string | null;
    cashPaidMinor: number; pointsTenderMinor: number; currency: string; paymentMethod: string }>;
}>();
export function captureMarketSalePaidSaleProvenance(tx: BenefitsTransaction, input: CompleteMarketSaleInput,
  witness: MarketSaleOperationObservation): MarketSalePaidSaleProvenance {
  return benefitsOperation(tx, () => {
    const receipt = readMarketSaleOperationWitnessReceipt(tx, input, witness);
    const handle = Object.freeze({}) as MarketSalePaidSaleProvenance;
    paidSaleProvenances.set(handle, { tx, database: tx.database, requestHash: receipt.requestHash, receipt });
    return handle;
  });
}
export function readMarketSalePaidSaleProvenance(tx: BenefitsTransaction, provenance: MarketSalePaidSaleProvenance) {
  return benefitsOperation(tx, () => {
    const state = provenance && paidSaleProvenances.get(provenance);
    benefitsAssert(state && state.tx === tx && state.database === tx.database, "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED");
    return state.receipt;
  });
}

/** INTERNAL owner-bound paid-sale witness. Only the Companion adapter may call
 * this with the exact Store reserve receipt it captured; the opaque handle lives
 * in server memory and cannot be serialized or reconstructed from SQL/JSON.
 * The sale writer additionally requires the original transaction, the unused
 * canonical source allocation and the identical receipt object.
 */
export function prepareMarketSaleCompanionPaidSaleObservation(tx: BenefitsTransaction, input: CompleteMarketSaleInput,
  allocation: MarketSaleSourceAllocation, receipt: BenefitsReservationReceipt,
  recheck: () => void): MarketSaleOperationObservation {
  return benefitsOperation(tx, () => {
    readPreparedMarketSaleOperationSourceInTransaction(tx.database, input, allocation);
    benefitsAssert(input.paymentAmountMinor === undefined && Number(input.discountTotal ?? 0) === 0
      && input.settlement === "paid" && input.source === "android-market-sale" && !input.benefits,
    "COMPANION_POINTS_PAID_SALE_SCOPE");
    benefitsAssert(receipt && receipt.version === 1 && receipt.quote, "COMPANION_POINTS_PAID_SALE_RECEIPT_REQUIRED");
    const quote = receipt.quote;
    benefitsAssert(quote.currencyExponent === 2 && quote.accountingMinor === 0 && quote.pointsTenderMinor >= 0
      && [quote.subtotalMinor, quote.discountMinor, quote.pointsTenderMinor, quote.payableMinor]
        .every(n => Number.isSafeInteger(n) && n >= 0)
      && BigInt(quote.subtotalMinor) === BigInt(quote.discountMinor) + BigInt(quote.pointsTenderMinor) + BigInt(quote.payableMinor),
    "COMPANION_POINTS_PAID_SALE_MISMATCH");
    const handle = Object.freeze({}) as MarketSaleOperationObservation;
    operationObservations.set(handle, { tx, database: tx.database, now: tx.now, allocation,
      ...prepareMarketSaleRequest(input), recheck, used: false,
      paidSale: Object.freeze({ receipt, quote, quoteEvidence: canonicalBenefitsJson(quote) }) });
    observationParents.set(tx.database, tx);
    return handle;
  });
}

/** INTERNAL paid-sale writer: the exact protected receipt quote becomes the
 * canonical sale settlement, then the operation mapping is minted by this owner
 * only. No caller SQL, fabricated hash or replay path exists.
 */
export function completeMarketCompanionPaidSaleInTransaction(tx: BenefitsTransaction, input: CompleteMarketSaleInput,
  allocation: MarketSaleSourceAllocation, receipt: BenefitsReservationReceipt,
  observation: MarketSaleOperationObservation): CompleteMarketSaleResult {
  return benefitsOperation(tx, () => {
    const state = operationObservations.get(observation), request = prepareMarketSaleRequest(input);
    benefitsAssert(state && state.tx === tx && state.database === tx.database && state.now === tx.now
      && state.allocation === allocation && !state.used && state.paidSale
      && state.paidSale.receipt === receipt
      && state.operationId === request.operationId && state.requestHash === request.requestHash
      && input.source === "android-market-sale" && input.settlement === "paid" && !input.benefits
      && input.paymentAmountMinor === undefined && Number(input.discountTotal ?? 0) === 0,
    "COMPANION_POINTS_PAID_SALE_WITNESS_REQUIRED");
    benefitsAssert(canonicalBenefitsJson(state.paidSale.quote) === state.paidSale.quoteEvidence,
      "COMPANION_POINTS_PAID_SALE_RECEIPT_CHANGED");
    const quote = state.paidSale.quote, now = new Date(state.now).toISOString();
    readPreparedMarketSaleOperationSourceInTransaction(tx.database, input, allocation);
    recheckOperationParent(state);
    state.used = true;
    const result = writeMarketSaleInTransaction(tx.database, input, now, undefined, allocation, quote);
    benefitsAssert(!result.replayed && result.sale.id === allocation.source.id && result.sale.status === "paid"
      && moneyToMinor(result.sale.subtotal) === quote.subtotalMinor
      && moneyToMinor(result.sale.discountTotal) === quote.discountMinor
      && moneyToMinor(result.sale.total) === quote.payableMinor + quote.pointsTenderMinor,
    "COMPANION_POINTS_PAID_SALE_MISMATCH");
    const tender = tx.database.prepare("SELECT cash_received_minor,points_tender_minor FROM commerce_sale_settlements WHERE sale_id=?")
      .get(result.sale.id);
    benefitsAssert(tender && Number(tender.cash_received_minor) === quote.payableMinor
      && Number(tender.points_tender_minor) === quote.pointsTenderMinor, "COMPANION_POINTS_TENDER_MISMATCH");
    const income = tx.database.prepare("SELECT * FROM finance_entries WHERE source_type='commerce_sale' AND source_id=?")
      .all(result.sale.id);
    benefitsAssert(quote.payableMinor === 0 ? income.length === 0 : income.length === 1 && income[0]!.direction === "income"
      && income[0]!.deleted_at === "" && income[0]!.amount_minor === quote.payableMinor
      && income[0]!.currency === quote.currency && income[0]!.payment_method === result.sale.paymentMethod,
    "COMPANION_POINTS_FINANCE_MISMATCH");
    benefitsAssert(!tx.database.prepare("SELECT 1 FROM commerce_benefit_snapshots WHERE source_kind='sale' AND source_id=?")
      .get(result.sale.id), "COMPANION_POINTS_PAID_SALE_SCOPE");
    const mapping = tx.database.prepare("SELECT * FROM commerce_market_sale_receipts WHERE operation_id=?")
      .get(state.operationId);
    benefitsAssert(mapping && mapping.business_id === result.sale.businessId && mapping.sale_id === result.sale.id
      && mapping.request_hash === state.requestHash && mapping.created_at === now,
    "COMPANION_POINTS_OPERATION_RECEIPT_CHANGED");
    state.receipt = Object.freeze({ operationId: state.operationId, requestHash: state.requestHash,
      saleId: result.sale.id, businessId: result.sale.businessId, customerId: input.customerId?.trim() || null,
      cashPaidMinor: quote.payableMinor, pointsTenderMinor: quote.pointsTenderMinor,
      currency: result.sale.currency, paymentMethod: result.sale.paymentMethod });
    state.evidence = operationEvidence(tx.database, state.operationId, result.sale.id);
    return result;
  });
}
const marketSaleSources = new WeakMap<MarketSaleSourceAllocation, {
  db: DatabaseSync; businessId: string; operationId: string; requestHash: string; source: CommerceSaleSourceAllocation; used: boolean;
}>();

/** Internal opt-in only. No persistence, replay mapping or financial effects. */
export function prepareMarketSaleOperationSource(db: DatabaseSync, input: CompleteMarketSaleInput): MarketSaleSourceAllocation {
  benefitsAssert(!db.isTransaction, "COMPANION_POINTS_PREPARATION_REQUIRED");
  benefitsAssert(!input.benefits && !input.sourceDraftId && input.operationId && input.settlement === "paid"
    && input.source === "android-market-sale", "COMPANION_POINTS_SOURCE_SCOPE");
  const { operationId, requestHash } = prepareMarketSaleRequest(input);
  const businessId = String(db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
  benefitsAssert(!db.prepare("SELECT 1 FROM commerce_market_sale_receipts WHERE operation_id=?").get(operationId)
    && !db.prepare("SELECT 1 FROM android_action_receipts WHERE id=?").get(operationId), "COMPANION_POINTS_SOURCE_ALREADY_APPLIED");
  const source = prepareCommerceSaleSource(db);
  const allocation = Object.freeze({ source: Object.freeze({ kind: "sale" as const, id: source.id }) });
  marketSaleSources.set(allocation, { db, businessId, operationId, requestHash, source, used: false });
  return allocation;
}

/** Read an unused canonical allocation inside its parent's transaction; no sale
 * row or operation receipt may exist yet. Does not consume the one-shot handle.
 */
export function readPreparedMarketSaleOperationSourceInTransaction(db: DatabaseSync, input: CompleteMarketSaleInput,
  allocation: MarketSaleSourceAllocation): MarketSaleSourceAllocation["source"] {
  const state = marketSaleSources.get(allocation);
  const { operationId, requestHash } = prepareMarketSaleRequest(input);
  const businessId = String(db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
  benefitsAssert(db.isTransaction && state && !state.used && state.db === db && state.businessId === businessId
    && state.operationId === operationId && state.requestHash === requestHash
    && !input.benefits && !input.sourceDraftId && input.settlement === "paid" && input.source === "android-market-sale"
    && !db.prepare("SELECT 1 FROM commerce_sales WHERE id=?").get(allocation.source.id)
    && !db.prepare("SELECT 1 FROM commerce_market_sale_receipts WHERE operation_id=?").get(operationId)
    && !db.prepare("SELECT 1 FROM android_action_receipts WHERE id=?").get(operationId), "COMPANION_POINTS_SOURCE_SCOPE");
  return allocation.source;
}

/** Same canonical sale and source receipt, inside the Android action transaction. */
export function completeMarketSaleInTransaction(db: DatabaseSync, input: CompleteMarketSaleInput, now: string,
  benefitsExecution?: MarketSaleBenefitsExecution, allocatedSource?: MarketSaleSourceAllocation,
  observation?: MarketSaleOperationObservation): CompleteMarketSaleResult {
  if (!observation) return allocatedSource
    ? withCommerceBenefitsParentFailureBoundary(db, () => writeMarketSaleInTransaction(db, input, now, benefitsExecution, allocatedSource))
    : writeMarketSaleInTransaction(db, input, now, benefitsExecution);
  const state = operationObservations.get(observation), tx = observationParents.get(db) ?? state?.tx;
  benefitsAssert(tx, "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED");
  return benefitsOperation(tx, () => {
    benefitsAssert(state, "COMPANION_POINTS_OPERATION_WITNESS_REQUIRED");
    const request = prepareMarketSaleRequest(input);
    benefitsAssert(state.tx === tx && state.database === db && state.tx.database === db && state.now === state.tx.now
      && new Date(state.now).toISOString() === now
      && !state.used && state.allocation === allocatedSource && !benefitsExecution && !input.benefits
      && state.requestHash === request.requestHash && state.operationId === request.operationId
      && input.source === "android-market-sale", "COMPANION_POINTS_OPERATION_SCOPE");
    readPreparedMarketSaleOperationSourceInTransaction(db, input, state.allocation);
    state.used = true;
    recheckOperationParent(state);
    const result = writeMarketSaleInTransaction(db, input, now, undefined, state.allocation);
    benefitsAssert(!result.replayed && result.sale.id === state.allocation.source.id && result.sale.status === "paid",
      "COMPANION_POINTS_OPERATION_SCOPE");
    // Mint ONLY here, after the existing sale/items/stock/Finance/receipt writes.
    const rows = db.prepare("SELECT * FROM commerce_market_sale_receipts WHERE operation_id=? OR sale_id=?")
      .all(state.operationId, result.sale.id), row = rows[0];
    benefitsAssert(rows.length === 1 && row && row.operation_id === state.operationId && row.sale_id === result.sale.id
      && row.business_id === result.sale.businessId && row.request_hash === state.requestHash && row.created_at === now,
    "COMPANION_POINTS_OPERATION_RECEIPT_CHANGED");
    const income = db.prepare("SELECT * FROM finance_entries WHERE source_type='commerce_sale' AND source_id=?").all(result.sale.id);
    benefitsAssert(income.length === 1 && income[0]!.direction === "income" && income[0]!.deleted_at === ""
      && income[0]!.amount_minor === moneyToMinor(result.sale.total) && income[0]!.currency === result.sale.currency
      && income[0]!.payment_method === result.sale.paymentMethod, "COMPANION_POINTS_FINANCE_MISMATCH");
    benefitsAssert(!db.prepare("SELECT 1 FROM commerce_sale_settlements WHERE sale_id=?").get(result.sale.id)
      && !db.prepare("SELECT 1 FROM commerce_benefit_snapshots WHERE source_kind='sale' AND source_id=?").get(result.sale.id),
    "COMPANION_POINTS_OPERATION_SCOPE");
    recheckOperationParent(state);
    state.receipt = Object.freeze({ operationId: state.operationId, requestHash: state.requestHash,
      saleId: result.sale.id, businessId: result.sale.businessId, customerId: input.customerId?.trim() || null,
      cashPaidMinor: moneyToMinor(result.sale.total), pointsTenderMinor: 0 as const,
      currency: result.sale.currency, paymentMethod: result.sale.paymentMethod });
    state.evidence = operationEvidence(db, state.operationId, result.sale.id);
    return result;
  });
}

function writeMarketSaleInTransaction(db: DatabaseSync, input: CompleteMarketSaleInput, now: string,
  benefitsExecution?: MarketSaleBenefitsExecution, allocatedSource?: MarketSaleSourceAllocation,
  paidQuote?: BenefitsQuote): CompleteMarketSaleResult {
  validateMarketSaleBenefits(input, benefitsExecution);
  if (input.benefits) benefitsAssert(benefitsExecution!.tx.database === db
    && new Date(benefitsExecution!.tx.now).toISOString() === now, "BENEFITS_PARENT_TRANSACTION_REQUIRED");
  benefitsAssert(!paidQuote || allocatedSource, "COMPANION_POINTS_PAID_SALE_WITNESS_REQUIRED");
  const { draftId, customerId, operationId, requestHash } = prepareMarketSaleRequest(input, benefitsExecution?.key);
  let sale: CommerceSale;
  let benefits: BenefitsSettlementReceipt | undefined;
  let replayed = false;
  if (!readEnabledBusinessCapabilities(db).includes(C.SALES)) throw new Error("Satış işlemleri bu işletmede etkin değil.");
  if (input.settlement === "credit") assertCustomerCreditBusinessInTransaction(db);
  const businessId = String((db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined)?.id ?? "");
  let canonicalSource: CommerceSaleSourceAllocation | undefined;
  if (allocatedSource) {
    const allocation = marketSaleSources.get(allocatedSource);
    benefitsAssert(db.isTransaction && allocation && !allocation.used && allocation.db === db
      && allocation.businessId === businessId && allocation.operationId === operationId && allocation.requestHash === requestHash
      && !input.benefits && !draftId && input.settlement === "paid" && input.source === "android-market-sale"
      && !db.prepare("SELECT 1 FROM commerce_market_sale_receipts WHERE operation_id=?").get(operationId)
      && !db.prepare("SELECT 1 FROM android_action_receipts WHERE id=?").get(operationId), "COMPANION_POINTS_SOURCE_SCOPE");
    allocation.used = true;
    canonicalSource = allocation.source;
  }
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
    if (input.benefits) benefits = replayMarketSaleBenefits(db, sale.id, benefitsExecution!.authority);
  } else {
    if (draft && draft.status !== "pending") throw new Error("Telefon sepeti daha önce kapatılmış.");
    const saleInput = { ...input, customerId };
    if (input.benefits) {
      const parent = prepareMarketSaleBenefits(saleInput, benefitsExecution!);
      sale = createCommerceSaleInTransaction(db, { ...saleInput, paymentMethod: canonicalMarketBenefitsPayment(input.paymentMethod) }, "paid", now, parent.settlement);
      benefits = parent.settle();
    } else if (input.settlement === "credit") sale = createCustomerCreditSaleInTransaction(db, { ...saleInput, customerId }, now);
    else if (paidQuote) {
      benefitsAssert(canonicalSource, "COMPANION_POINTS_PAID_SALE_WITNESS_REQUIRED");
      sale = createCommerceSaleInTransaction(db, saleInput, "paid", now,
        { saleId: canonicalSource.id, reserve: () => paidQuote });
    } else sale = createCommerceSaleInTransaction(db, saleInput,
      total => input.paymentAmountMinor !== undefined && input.paymentAmountMinor < moneyToMinor(total) ? "credit" : "paid", now, undefined, canonicalSource);
    if (!input.benefits && input.paymentAmountMinor !== undefined && input.settlement === "paid") {
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
  const payableMinor = benefits?.quote.payableMinor ?? moneyToMinor(sale.total);
  if (replayed && !benefits && receivedMinor !== undefined && (sale.status === "credit" || receivedMinor > payableMinor)) assertCustomerCreditBusinessInTransaction(db);
  return { sale, draftReview: "not_requested", replayed,
    ...(benefits ? { benefits } : {}),
    ...(receivedMinor === undefined ? {} : { payment: { receivedMinor,
      appliedToSaleMinor: Math.min(receivedMinor, payableMinor),
      appliedToDebtMinor: Math.max(0, receivedMinor - payableMinor),
      newDebtMinor: Math.max(0, payableMinor - receivedMinor) } }) };
}

/** Internal read only: use the canonical operation receipt and its exact request
 * hash, never derive a sale ID from an Android action ID. No source allocation.
 */
export function readMarketSaleOperationSourceInTransaction(db: DatabaseSync, input: CompleteMarketSaleInput) {
  benefitsAssert(db.isTransaction, "BENEFITS_PARENT_TRANSACTION_REQUIRED");
  benefitsAssert(input.benefits === undefined && !input.sourceDraftId && input.operationId, "COMPANION_POINTS_SOURCE_SCOPE");
  const { operationId, requestHash } = prepareMarketSaleRequest(input);
  const businessId = String(db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
  const receipt = db.prepare("SELECT sale_id,request_hash FROM commerce_market_sale_receipts WHERE business_id=? AND operation_id=?")
    .get(businessId, operationId);
  if (!receipt) return null;
  benefitsAssert(receipt.request_hash === requestHash, "COMPANION_POINTS_SOURCE_SCOPE");
  const row = db.prepare("SELECT customer_id FROM commerce_sales WHERE business_id=? AND id=? AND deleted_at=''")
    .get(businessId, String(receipt.sale_id));
  benefitsAssert(row, "COMPANION_POINTS_SOURCE_SCOPE");
  return { sale: persistedSale(db, String(receipt.sale_id)), customerId: row.customer_id === null ? null : String(row.customer_id) };
}

/** Internal read-only operation identity for the pre-commit Android receipt
 * verifier. Reuses the canonical request preparation; allocates no source,
 * mints no receipt/token and has no sale, Finance or stock effects.
 */
export function readMarketSaleOperationRequestIdentityInTransaction(db: DatabaseSync, input: CompleteMarketSaleInput) {
  benefitsAssert(db.isTransaction && !input.benefits && !input.sourceDraftId && input.operationId
    && input.settlement === "paid" && input.source === "android-market-sale", "COMPANION_POINTS_SOURCE_SCOPE");
  const { operationId, requestHash } = prepareMarketSaleRequest(input);
  return Object.freeze({ operationId, requestHash });
}

function prepareMarketSaleRequest(input: CompleteMarketSaleInput, key?: BenefitsSecretKey) {
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
    ...(input.benefits === undefined ? {} : { benefits: input.benefits.couponCode ? (key ? benefitsHmac(key, "desktop-market", "sale-request", input.benefits) : null) : canonicalBenefitsJson(input.benefits) }),
    discountTotal: Number(input.discountTotal ?? 0), locationId: String(input.locationId ?? "").trim(),
    settlement: input.settlement, customerId, draftId,
    paymentMethod: input.settlement === "credit" ? "" : String(input.paymentMethod ?? "cash").trim()
  })).digest("hex");
  return { draftId, customerId, operationId, requestHash };
}
