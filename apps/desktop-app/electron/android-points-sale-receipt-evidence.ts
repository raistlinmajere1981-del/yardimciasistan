import type { DatabaseSync } from "node:sqlite";
import { moneyToMinor, type BenefitsSettlementReceipt } from "@yardimci-asistan/shared";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { isLocalActionParentTransaction } from "./android-action-application-service.js";
import { benefitsAssert, CommerceBenefitsError } from "./commerce-benefits-engine.js";
import { canonicalBenefitsJson, benefitsOperation, type BenefitsTransaction } from "./commerce-benefits-rules.js";
import { readMarketSaleOperationRequestIdentityInTransaction, readMarketSalePaidSaleProvenance,
  type MarketSalePaidSaleProvenance } from "./market-sale-operation.js";
import { marketAndroidActionIntentHash } from "./market-android-actions.js";
import type { AndroidMarketSaleResultReceipt } from "./database-types.js";
import type { LocalCompanionActionContext } from "./local-companion-server.js";

/** C20p-2i2 read-only structural evidence. It never grants Store, settlement or
 * Android ACK authority; the missing durable grant is reported explicitly.
 */
export const ANDROID_POINTS_SALE_RECEIPT_EVIDENCE_MISSING = "trusted_paid_writer_grant" as const;

const SCOPE = "COMPANION_POINTS_RECEIPT_EVIDENCE";

function saleInputFromAction(action: AndroidSyncAction) {
  const payload = action.payload ?? {};
  const lines = Array.isArray(payload.lines) ? payload.lines as Record<string, unknown>[] : [];
  return {
    operationId: String(action.id ?? "").trim(),
    customerId: String(payload.customer_id ?? "").trim(),
    locationId: String(payload.location_id ?? "").trim(),
    paymentMethod: String(payload.payment_method ?? "cash").trim(),
    settlement: "paid" as const,
    source: "android-market-sale" as const,
    items: lines.map(line => ({ productId: String(line.product_id ?? ""), quantity: Number(line.quantity),
      ...(line.expected_unit_price === undefined ? {} : { expectedUnitPrice: line.expected_unit_price as number }),
      ...(line.expected_currency === undefined ? {} : { expectedCurrency: line.expected_currency as string }),
      ...(line.expected_updated_at === undefined ? {} : { expectedUpdatedAt: line.expected_updated_at as string }) }))
  };
}

/** Must run inside the genuine Android owner BEGIN IMMEDIATE. All reads only. */
export function inspectAndroidPointsSaleReceiptEvidenceInTransaction(db: DatabaseSync,
  action: AndroidSyncAction, context: LocalCompanionActionContext | undefined) {
  if (!context) throw new CommerceBenefitsError(`${SCOPE}_OWNER`);
  benefitsAssert(isLocalActionParentTransaction(db, action, context), `${SCOPE}_OWNER`);
  benefitsAssert(action.action_type === "market_sale_complete", `${SCOPE}_ACTION`);
  const input = saleInputFromAction(action);
  const identity = readMarketSaleOperationRequestIdentityInTransaction(db, input);
  benefitsAssert(identity.operationId === action.id, `${SCOPE}_OPERATION`);

  const deviceId = String(action.device_id ?? "").trim();
  const device = db.prepare("SELECT device_id,is_active,revoked_at FROM android_devices WHERE device_id = ?").get(deviceId);
  benefitsAssert(device && Number(device.is_active) === 1 && !String(device.revoked_at ?? "").trim(), `${SCOPE}_DEVICE`);
  const businessId = String(db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
  benefitsAssert(businessId.length > 0, `${SCOPE}_BUSINESS`);

  const receipt = db.prepare("SELECT business_id,sale_id,request_hash FROM commerce_market_sale_receipts WHERE operation_id = ?")
    .get(identity.operationId);
  benefitsAssert(receipt && receipt.business_id === businessId && receipt.request_hash === identity.requestHash,
    `${SCOPE}_MAPPING`);

  const sale = db.prepare(`SELECT id,business_id,customer_id,status,subtotal,discount_total,total,currency,payment_method,source
    FROM commerce_sales WHERE id = ? AND business_id = ?`).get(String(receipt.sale_id), businessId);
  benefitsAssert(sale && sale.status === "paid" && sale.source === "android-market-sale"
    && sale.customer_id === input.customerId && sale.payment_method === input.paymentMethod, `${SCOPE}_SALE`);

  const settlement = db.prepare(`SELECT customer_id,payment_method,cash_received_minor,points_tender_minor
    FROM commerce_sale_settlements WHERE sale_id = ? AND business_id = ?`).get(String(sale.id), businessId);
  benefitsAssert(settlement && settlement.customer_id === input.customerId
    && settlement.payment_method === input.paymentMethod, `${SCOPE}_SETTLEMENT`);
  const cashMinor = Number(settlement.cash_received_minor), pointsMinor = Number(settlement.points_tender_minor);
  benefitsAssert(Number.isSafeInteger(cashMinor) && cashMinor >= 0
    && Number.isSafeInteger(pointsMinor) && pointsMinor > 0, `${SCOPE}_SETTLEMENT`);

  const subtotalMinor = moneyToMinor(Number(sale.subtotal));
  const discountMinor = moneyToMinor(Number(sale.discount_total));
  const totalMinor = moneyToMinor(Number(sale.total));
  const currency = String(sale.currency);
  benefitsAssert(/^[A-Z]{3}$/.test(currency)
    && [subtotalMinor, discountMinor, totalMinor].every(value => Number.isSafeInteger(value) && value >= 0),
  `${SCOPE}_AMOUNT`);
  benefitsAssert(BigInt(subtotalMinor) === BigInt(discountMinor) + BigInt(pointsMinor) + BigInt(cashMinor)
    && BigInt(totalMinor) === BigInt(pointsMinor) + BigInt(cashMinor), `${SCOPE}_CONSERVATION`);

  // Finance books only realized cash. An all-points sale must have no row.
  const finance = db.prepare(`SELECT direction,amount_minor,currency FROM finance_entries
    WHERE source_type = 'commerce_sale' AND source_id = ? AND deleted_at = ''`).all(String(sale.id));
  if (cashMinor === 0) benefitsAssert(finance.length === 0, `${SCOPE}_FINANCE`);
  else {
    const financeRow = finance[0];
    if (!financeRow) throw new CommerceBenefitsError(`${SCOPE}_FINANCE`);
    benefitsAssert(finance.length === 1 && financeRow.direction === "income"
      && Number(financeRow.amount_minor) === cashMinor && String(financeRow.currency) === currency, `${SCOPE}_FINANCE`);
  }

  // Reservation/hold provenance is limited to fields the Store actually writes.
  const reservations = db.prepare(`SELECT id,customer_id,currency,points_minor,quote_json
    FROM commerce_benefit_reservations
    WHERE business_id = ? AND source_kind = 'sale' AND source_id = ? AND status = 'active'`).all(businessId, String(sale.id));
  benefitsAssert(reservations.length === 1, `${SCOPE}_RESERVATION`);
  const reservation = reservations[0];
  if (!reservation) throw new CommerceBenefitsError(`${SCOPE}_RESERVATION`);
  benefitsAssert(reservation.customer_id === input.customerId && reservation.currency === currency
    && Number(reservation.points_minor) === pointsMinor, `${SCOPE}_RESERVATION`);
  const quote = JSON.parse(String(reservation.quote_json)) as Record<string, unknown>;
  benefitsAssert(Number(quote.pointsTenderMinor) === pointsMinor && Number(quote.payableMinor) === cashMinor
    && Number(quote.subtotalMinor) === subtotalMinor && Number(quote.discountMinor) === discountMinor
    && String(quote.currency) === currency, `${SCOPE}_QUOTE`);
  const holds = db.prepare(`SELECT COALESCE(SUM(amount_minor),0) total FROM commerce_benefit_point_holds
    WHERE business_id = ? AND reservation_id = ?`).get(businessId, String(reservation.id));
  benefitsAssert(Number(holds?.total) === pointsMinor, `${SCOPE}_HOLDS`);

  // Pre-commit only: no competing, foreign or already-applied receipt/snapshot.
  benefitsAssert(!db.prepare("SELECT 1 FROM android_action_receipts WHERE id = ?").get(String(action.id)), `${SCOPE}_COMPETING`);
  benefitsAssert(!db.prepare("SELECT 1 FROM android_market_sale_result_receipts WHERE action_id = ?").get(String(action.id)),
    `${SCOPE}_COMPETING`);
  benefitsAssert(!db.prepare("SELECT 1 FROM commerce_market_sale_receipts WHERE sale_id = ? AND operation_id != ?")
    .get(String(sale.id), String(action.id)), `${SCOPE}_COMPETING`);
  benefitsAssert(!db.prepare("SELECT 1 FROM commerce_benefit_snapshots WHERE source_kind = 'sale' AND source_id = ?")
    .get(String(sale.id)), `${SCOPE}_COMPETING`);

  return Object.freeze({ version: 1 as const, state: "structural_candidate_only" as const,
    authority: "unavailable" as const, missing: ANDROID_POINTS_SALE_RECEIPT_EVIDENCE_MISSING,
    operationId: identity.operationId, requestHash: identity.requestHash, businessId, deviceId,
    saleId: String(sale.id), reservationId: String(reservation.id), currency,
    subtotalMinor, discountMinor, pointsTenderMinor: pointsMinor, cashPaidMinor: cashMinor,
    totalMinor, financeIncomeMinor: cashMinor, canReservePoints: false as const, canConfirmPointsSale: false as const });
}

/* ---------------------------------------------------------------------------
 * C20p-2o: settled, points-aware Android receipt projection.
 *
 * First issuance is server-only and requires BOTH the genuine owner BEGIN
 * IMMEDIATE and the existing opaque market-sale-operation witness. Durable SQL
 * alone (even a fully consistent settlement/snapshot/ledger) can never mint this
 * witness. The live `market_sale_complete` route still terminates before any ACK;
 * no cash-only Android action can spend points.
 * ------------------------------------------------------------------------- */

export interface AndroidPointsSaleReceiptWitness {
  readonly authority: Readonly<{ state: "owner_bound_pre_ack_only"; canConfirmPoints: false }>;
}
const receiptWitnessBrand: unique symbol = Symbol("android-points-sale-receipt-witness");
export type AndroidPointsSaleReceiptWitnessHandle = AndroidPointsSaleReceiptWitness & { readonly [receiptWitnessBrand]: true };

export interface AndroidPointsSaleReceiptAckEvidence {
  readonly state: "durable_ack_replay_only";
}
const ackEvidenceBrand: unique symbol = Symbol("android-points-sale-ack-evidence");
export type AndroidPointsSaleReceiptAckEvidenceHandle = AndroidPointsSaleReceiptAckEvidence & { readonly [ackEvidenceBrand]: true };

interface PointsSaleFacts {
  receipt: AndroidMarketSaleResultReceipt;
  evidence: string;
  operationId: string;
  requestHash: string;
  businessId: string;
  saleId: string;
  reservationId: string;
  snapshotId: string;
  pointSpendEntryId: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  pointsTenderMinor: number;
  cashPaidMinor: number;
  currency: string;
}
const receiptWitnesses = new WeakMap<AndroidPointsSaleReceiptWitnessHandle, {
  tx: BenefitsTransaction; database: DatabaseSync; action: AndroidSyncAction;
  context: LocalCompanionActionContext; settledReceipt: BenefitsSettlementReceipt;
  operationWitness: MarketSalePaidSaleProvenance; facts: PointsSaleFacts; used: boolean;
}>();
const ackEvidences = new WeakMap<AndroidPointsSaleReceiptAckEvidenceHandle, PointsSaleFacts>();

function pointsSaleSnapshot(db: DatabaseSync, businessId: string, operationId: string, saleId: string,
  reservationId: string, pointSpendEntryId: string): string {
  return JSON.stringify([
    db.prepare("SELECT business_id,operation_id,sale_id,request_hash,created_at FROM commerce_market_sale_receipts WHERE operation_id=? ORDER BY operation_id").all(operationId),
    db.prepare("SELECT id,business_id,customer_id,status,subtotal,discount_total,total,currency,payment_method,source FROM commerce_sales WHERE id=?").all(saleId),
    db.prepare("SELECT sale_id,business_id,customer_id,payment_method,cash_received_minor,points_tender_minor FROM commerce_sale_settlements WHERE sale_id=?").all(saleId),
    db.prepare("SELECT id,customer_id,source_kind,source_id,status,currency,points_minor,quote_json FROM commerce_benefit_reservations WHERE business_id=? AND source_kind='sale' AND source_id=? ORDER BY id").all(businessId, saleId),
    db.prepare("SELECT id,kind,amount_minor,currency,source_kind,source_id,operation_key FROM commerce_benefit_point_ledger WHERE business_id=? AND source_kind='sale' AND source_id=? ORDER BY id").all(businessId, saleId),
    db.prepare("SELECT credit_entry_id,debit_entry_id,amount_minor FROM commerce_benefit_point_allocations WHERE business_id=? AND debit_entry_id=? ORDER BY credit_entry_id").all(businessId, pointSpendEntryId),
    db.prepare("SELECT id,reservation_id,source_kind,source_id,receipt_json,created_at_ms FROM commerce_benefit_snapshots WHERE business_id=? AND source_kind='sale' AND source_id=? ORDER BY id").all(businessId, saleId),
    db.prepare("SELECT code_id,customer_id,reservation_id,snapshot_id FROM commerce_benefit_coupon_redemptions WHERE business_id=? AND reservation_id=? ORDER BY code_id").all(businessId, reservationId),
    db.prepare("SELECT code_id FROM commerce_benefit_coupon_holds WHERE business_id=? AND reservation_id=? ORDER BY code_id").all(businessId, reservationId),
    db.prepare("SELECT direction,amount_minor,currency,payment_method,deleted_at FROM finance_entries WHERE source_type='commerce_sale' AND source_id=? ORDER BY id").all(saleId),
    db.prepare("SELECT reservation_id,credit_entry_id,amount_minor FROM commerce_benefit_point_holds WHERE business_id=? AND reservation_id=? ORDER BY credit_entry_id").all(businessId, reservationId)
  ]);
}

/** Pure read-only validation of durable settled points-sale rows. It is NOT an
 * authorization by itself; the owner witness below is the only first-issuance gate. */
function readSettledPointsSaleFacts(db: DatabaseSync, action: AndroidSyncAction,
  receipt: AndroidMarketSaleResultReceipt, replay: boolean,
  expected?: Readonly<{ quote: BenefitsSettlementReceipt["quote"]; reservationId: string; snapshotId: string;
    pointSpendEntryId: string; pointGrantEntryId: string | null }>):
  PointsSaleFacts {
  benefitsAssert(action.action_type === "market_sale_complete" && action.id === receipt.actionId
    && action.device_id === receipt.deviceId && receipt.source === "android-market-sale",
  `${SCOPE}_ACTION`);
  const deviceId = String(action.device_id ?? "").trim();
  const device = db.prepare("SELECT device_id,is_active,revoked_at FROM android_devices WHERE device_id = ?").get(deviceId);
  benefitsAssert(device && Number(device.is_active) === 1 && !String(device.revoked_at ?? "").trim(), `${SCOPE}_DEVICE`);
  const businessId = String(db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
  benefitsAssert(businessId.length > 0 && receipt.businessId === businessId, `${SCOPE}_BUSINESS`);

  const identity = readMarketSaleOperationRequestIdentityInTransaction(db, saleInputFromAction(action));
  // Two distinct hashes: the immutable Android action intent hash is persisted on
  // the receipt; requestHash is the canonical market-sale operation hash. Never
  // interchange them.
  benefitsAssert(identity.operationId === String(action.id) && receipt.intentHash === marketAndroidActionIntentHash(action),
    `${SCOPE}_MAPPING`);

  const mapping = db.prepare("SELECT business_id,sale_id,request_hash FROM commerce_market_sale_receipts WHERE operation_id=?").get(identity.operationId);
  benefitsAssert(mapping && mapping.business_id === businessId && mapping.sale_id === receipt.saleId
    && mapping.request_hash === identity.requestHash, `${SCOPE}_MAPPING`);

  const sale = db.prepare(`SELECT id,business_id,customer_id,status,subtotal,discount_total,total,currency,payment_method,source
    FROM commerce_sales WHERE id=? AND business_id=?`).get(receipt.saleId, businessId);
  const customerId = receipt.customerId ?? "";
  benefitsAssert(sale && sale.status === "paid" && sale.source === "android-market-sale"
    && String(sale.customer_id ?? "") === customerId && sale.payment_method === receipt.paymentMethod
    && String(sale.currency) === receipt.currency, `${SCOPE}_SALE`);
  if (customerId) benefitsAssert(db.prepare("SELECT 1 FROM customers WHERE business_id=? AND id=? AND deleted_at=''")
    .get(businessId, customerId), `${SCOPE}_CUSTOMER`);

  const settlements = db.prepare(`SELECT customer_id,payment_method,cash_received_minor,points_tender_minor
    FROM commerce_sale_settlements WHERE sale_id=? AND business_id=?`).all(receipt.saleId, businessId);
  benefitsAssert(settlements.length === 1, `${SCOPE}_SETTLEMENT`);
  const settlement = settlements[0]!;
  const cashMinor = Number(settlement.cash_received_minor), pointsMinor = Number(settlement.points_tender_minor);
  benefitsAssert(Number.isSafeInteger(cashMinor) && cashMinor >= 0 && Number.isSafeInteger(pointsMinor) && pointsMinor >= 0
    && cashMinor === receipt.cashPaidMinor && pointsMinor === receipt.pointsTenderMinor
    && String(settlement.customer_id ?? "") === customerId && settlement.payment_method === receipt.paymentMethod,
  `${SCOPE}_SETTLEMENT`);

  const subtotalMinor = moneyToMinor(Number(sale.subtotal));
  const discountMinor = moneyToMinor(Number(sale.discount_total));
  const totalMinor = moneyToMinor(Number(sale.total));
  const currency = String(sale.currency);
  benefitsAssert(/^[A-Z]{3}$/.test(currency) && [subtotalMinor, discountMinor, totalMinor].every(value => Number.isSafeInteger(value) && value >= 0)
    && BigInt(subtotalMinor) === BigInt(discountMinor) + BigInt(pointsMinor) + BigInt(cashMinor)
    && BigInt(totalMinor) === BigInt(pointsMinor) + BigInt(cashMinor)
    && (receipt.discountMinor === undefined
      || (Number.isSafeInteger(receipt.discountMinor) && receipt.discountMinor === discountMinor)), `${SCOPE}_CONSERVATION`);

  const finance = db.prepare(`SELECT direction,amount_minor,currency,payment_method FROM finance_entries
    WHERE source_type='commerce_sale' AND source_id=? AND deleted_at=''`).all(receipt.saleId);
  if (cashMinor === 0) benefitsAssert(finance.length === 0, `${SCOPE}_FINANCE`);
  else benefitsAssert(finance.length === 1 && finance[0]!.direction === "income" && Number(finance[0]!.amount_minor) === cashMinor
    && String(finance[0]!.currency) === currency && finance[0]!.payment_method === receipt.paymentMethod, `${SCOPE}_FINANCE`);

  const reservations = db.prepare(`SELECT id,customer_id,source_kind,source_id,status,currency,points_minor,quote_json
    FROM commerce_benefit_reservations WHERE business_id=? AND source_kind='sale' AND source_id=? ORDER BY id`).all(businessId, receipt.saleId);
  benefitsAssert(reservations.length === 1, `${SCOPE}_RESERVATION`);
  const reservation = reservations[0]!;
  const reservationId = String(reservation.id);
  benefitsAssert(reservation.status === "settled" && reservation.customer_id === customerId
    && reservation.currency === currency && Number(reservation.points_minor) === pointsMinor, `${SCOPE}_RESERVATION`);
  if (expected) benefitsAssert(reservationId === expected.reservationId, `${SCOPE}_RESERVATION_CHANGED`);
  const quote = JSON.parse(String(reservation.quote_json)) as Record<string, unknown>;
  benefitsAssert(Number(quote.pointsTenderMinor) === pointsMinor && Number(quote.payableMinor) === cashMinor
    && Number(quote.subtotalMinor) === subtotalMinor && Number(quote.discountMinor) === discountMinor
    && String(quote.currency) === currency && Number(quote.version) === 1
    && Number(quote.currencyExponent) === 2 && Number(quote.accountingMinor) === 0, `${SCOPE}_QUOTE`);
  if (expected) benefitsAssert(canonicalBenefitsJson(quote) === canonicalBenefitsJson(expected.quote), `${SCOPE}_QUOTE_CHANGED`);

  const snapshots = db.prepare(`SELECT id,reservation_id,source_kind,source_id,receipt_json FROM commerce_benefit_snapshots
    WHERE business_id=? AND source_kind='sale' AND source_id=? ORDER BY id`).all(businessId, receipt.saleId);
  benefitsAssert(snapshots.length === 1 && snapshots[0]!.reservation_id === reservationId, `${SCOPE}_SNAPSHOT`);
  const snapshotId = String(snapshots[0]!.id);
  if (expected) benefitsAssert(snapshotId === expected.snapshotId, `${SCOPE}_SNAPSHOT_CHANGED`);

  // Coupon provenance: every active hold must have exactly one settled
  // redemption tied to this snapshot. The transient code plaintext is absent.
  const couponHolds = db.prepare("SELECT code_id FROM commerce_benefit_coupon_holds WHERE business_id=? AND reservation_id=? ORDER BY code_id")
    .all(businessId, reservationId) as { code_id: string }[];
  const couponRedemptions = db.prepare(`SELECT code_id,customer_id,reservation_id,snapshot_id
    FROM commerce_benefit_coupon_redemptions WHERE business_id=? AND reservation_id=? ORDER BY code_id`)
    .all(businessId, reservationId) as { code_id: string; customer_id: string | null; reservation_id: string; snapshot_id: string }[];
  benefitsAssert(canonicalBenefitsJson(couponRedemptions.map(row => row.code_id))
    === canonicalBenefitsJson(couponHolds.map(row => row.code_id))
    && couponRedemptions.every(row => row.reservation_id === reservationId && row.snapshot_id === snapshotId
      && String(row.customer_id ?? "") === customerId), `${SCOPE}_COUPON`);
  if (Number(quote.discountMinor) > 0) benefitsAssert(couponRedemptions.length > 0, `${SCOPE}_COUPON`);
  else benefitsAssert(couponRedemptions.length === 0, `${SCOPE}_COUPON`);

  const spends = db.prepare(`SELECT id,kind,amount_minor,currency,source_kind,source_id,operation_key
    FROM commerce_benefit_point_ledger WHERE business_id=? AND source_kind='sale' AND source_id=? AND kind='spend' ORDER BY id`)
    .all(businessId, receipt.saleId);
  if (pointsMinor > 0) {
    benefitsAssert(spends.length === 1, `${SCOPE}_LEDGER`);
    const spend = spends[0]!;
    const pointSpendEntryId = String(spend.id);
    if (expected) benefitsAssert(pointSpendEntryId === expected.pointSpendEntryId, `${SCOPE}_LEDGER_CHANGED`);
    benefitsAssert(Number(spend.amount_minor) === -pointsMinor && String(spend.currency) === currency
      && spend.source_kind === "sale" && spend.source_id === receipt.saleId, `${SCOPE}_LEDGER`);
  } else benefitsAssert(spends.length === 0 && (!expected || expected.pointSpendEntryId === ""), `${SCOPE}_LEDGER`);
  const pointSpendEntryId = spends[0] ? String(spends[0].id) : "";

  // Store.settle may issue exactly one earn grant for this same paid sale. It is
  // canonical settlement evidence only when it is the receipt-referenced grant,
  // matches the settled quote, and shares the settlement operation key with the
  // single spend. Any additional/foreign ledger kind still fails closed.
  const snapshotReceipt = JSON.parse(String(snapshots[0]!.receipt_json)) as Record<string, unknown>;
  benefitsAssert(Number(snapshotReceipt.version) === 1 && String(snapshotReceipt.reservationId) === reservationId,
    `${SCOPE}_SNAPSHOT`);
  const grantId = typeof snapshotReceipt.pointGrantEntryId === "string" && snapshotReceipt.pointGrantEntryId
    ? String(snapshotReceipt.pointGrantEntryId) : null;
  if (expected) benefitsAssert(grantId === expected.pointGrantEntryId, `${SCOPE}_LEDGER_CHANGED`);
  const grants = db.prepare(`SELECT id,kind,customer_id,amount_minor,currency,source_kind,source_id,operation_key
    FROM commerce_benefit_point_ledger WHERE business_id=? AND source_kind='sale' AND source_id=? AND kind='grant' ORDER BY id`)
    .all(businessId, receipt.saleId);
  if (grantId === null) benefitsAssert(grants.length === 0, `${SCOPE}_LEDGER`);
  else {
    const grant = grants[0];
    benefitsAssert(grants.length === 1 && grant && String(grant.id) === grantId
      && String(grant.customer_id) === receipt.customerId
      && Number(grant.amount_minor) === Number(quote.pointsEarnPreviewMinor) && Number(grant.amount_minor) > 0
      && String(grant.currency) === currency && grant.source_kind === "sale" && grant.source_id === receipt.saleId
      && (pointSpendEntryId ? String(grant.operation_key) === String(spends[0]!.operation_key) : String(grant.operation_key).length > 0),
      `${SCOPE}_LEDGER`);
  }
  benefitsAssert(!db.prepare("SELECT 1 FROM commerce_benefit_point_ledger WHERE business_id=? AND source_kind='sale' AND source_id=? AND kind NOT IN ('spend','grant')")
    .get(businessId, receipt.saleId), `${SCOPE}_COMPETING`);

  const allocated = db.prepare("SELECT COALESCE(SUM(amount_minor),0) n FROM commerce_benefit_point_allocations WHERE business_id=? AND debit_entry_id=?")
    .get(businessId, pointSpendEntryId);
  benefitsAssert(Number(allocated?.n) === pointsMinor, `${SCOPE}_ALLOCATION`);
  const holds = db.prepare("SELECT COALESCE(SUM(amount_minor),0) n FROM commerce_benefit_point_holds WHERE business_id=? AND reservation_id=?")
    .get(businessId, reservationId);
  benefitsAssert(Number(holds?.n) === pointsMinor, `${SCOPE}_HOLDS`);

  const ack = db.prepare("SELECT action_type,device_id,intent_hash FROM android_action_receipts WHERE id=?").get(receipt.actionId);
  const stored = db.prepare("SELECT r.sale_id,r.result_json FROM android_market_sale_result_receipts r WHERE r.action_id=?")
    .get(receipt.actionId);
  if (replay) {
    benefitsAssert(ack && ack.action_type === "market_sale_complete" && ack.device_id === deviceId
      && ack.intent_hash === receipt.intentHash, `${SCOPE}_COMPETING`);
    benefitsAssert(stored && stored.sale_id === receipt.saleId
      && canonicalBenefitsJson(JSON.parse(String(stored.result_json))) === canonicalBenefitsJson(receipt),
    `${SCOPE}_COMPETING`);
  } else {
    benefitsAssert(!ack && !stored, `${SCOPE}_COMPETING`);
  }
  benefitsAssert(!db.prepare("SELECT 1 FROM commerce_market_sale_receipts WHERE sale_id=? AND operation_id!=?")
    .get(receipt.saleId, receipt.actionId), `${SCOPE}_COMPETING`);

  return { receipt, evidence: pointsSaleSnapshot(db, businessId, identity.operationId, receipt.saleId, reservationId, pointSpendEntryId),
    operationId: identity.operationId, requestHash: identity.requestHash, businessId, saleId: receipt.saleId,
    reservationId, snapshotId, pointSpendEntryId, subtotalMinor, discountMinor, totalMinor,
    pointsTenderMinor: pointsMinor, cashPaidMinor: cashMinor, currency };
}

/** Server-only first issuance. Requires the genuine Android owner parent AND the
 * opaque operation witness minted by `completeMarketCompanionPaidSaleInTransaction`;
 * SQL rows alone cannot recreate that identity. */
export function prepareAndroidPointsSaleReceiptWitness(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, operationWitness: MarketSalePaidSaleProvenance,
  settledReceipt: BenefitsSettlementReceipt): AndroidPointsSaleReceiptWitnessHandle {
  return benefitsOperation(tx, () => {
    benefitsAssert(context && isLocalActionParentTransaction(tx.database, action, context), `${SCOPE}_OWNER`);
    benefitsAssert(action.action_type === "market_sale_complete" && settledReceipt && settledReceipt.version === 1
      && settledReceipt.quote && settledReceipt.quote.pointsTenderMinor >= 0
      && (settledReceipt.quote.pointsTenderMinor === 0 || settledReceipt.pointSpendEntryId),
    `${SCOPE}_AUTHORITY`);
    const operation = readMarketSalePaidSaleProvenance(tx, operationWitness);
    const businessId = String(dbBusinessId(tx.database));
    const quote = settledReceipt.quote;
    const draft = { actionId: String(action.id), deviceId: String(action.device_id),
      intentHash: marketAndroidActionIntentHash(action),
      createdAt: "", saleId: operation.saleId, businessId, source: "android-market-sale" as const,
      customerId: operation.customerId, cashPaidMinor: operation.cashPaidMinor,
      pointsTenderMinor: operation.pointsTenderMinor, discountMinor: Number(quote.discountMinor),
      currency: operation.currency, paymentMethod: operation.paymentMethod };
    const facts = readSettledPointsSaleFacts(tx.database, action, draft, false,
      { quote, reservationId: settledReceipt.reservationId, snapshotId: settledReceipt.snapshotId,
        pointSpendEntryId: settledReceipt.pointSpendEntryId ? String(settledReceipt.pointSpendEntryId) : "",
        pointGrantEntryId: settledReceipt.pointGrantEntryId ? String(settledReceipt.pointGrantEntryId) : null });
    benefitsAssert(facts.requestHash === operation.requestHash, `${SCOPE}_OPERATION`);
    const handle = Object.freeze({ authority: Object.freeze({ state: "owner_bound_pre_ack_only" as const,
      canConfirmPoints: false as const }) }) as AndroidPointsSaleReceiptWitnessHandle;
    receiptWitnesses.set(handle, { tx, database: tx.database, action, context, settledReceipt,
      operationWitness, facts, used: false });
    return handle;
  });
}

function dbBusinessId(db: DatabaseSync): string {
  return String(db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
}

/** Internal pre-ACK materializer. The returned receipt is frozen and never
 * persisted by this function; the live Android route still denies before ACK. */
export function materializeAuthorizedPointsSaleReceipt(tx: BenefitsTransaction, action: AndroidSyncAction,
  context: LocalCompanionActionContext | undefined, witness: AndroidPointsSaleReceiptWitnessHandle,
  settledReceipt: BenefitsSettlementReceipt): AndroidMarketSaleResultReceipt {
  return benefitsOperation(tx, () => {
    const state = witness && receiptWitnesses.get(witness);
    benefitsAssert(state && state.tx === tx && state.database === tx.database && state.action === action
      && state.context === context && state.settledReceipt === settledReceipt && !state.used
      && isLocalActionParentTransaction(tx.database, action, context), `${SCOPE}_AUTHORITY`);
    readMarketSalePaidSaleProvenance(tx, state.operationWitness);
    const receipt = state.facts.receipt;
    const facts = readSettledPointsSaleFacts(tx.database, action, receipt, false,
      { quote: settledReceipt.quote, reservationId: settledReceipt.reservationId, snapshotId: settledReceipt.snapshotId,
        pointSpendEntryId: settledReceipt.pointSpendEntryId ? String(settledReceipt.pointSpendEntryId) : "",
        pointGrantEntryId: settledReceipt.pointGrantEntryId ? String(settledReceipt.pointGrantEntryId) : null });
    benefitsAssert(facts.evidence === state.facts.evidence, `${SCOPE}_CHANGED`);
    state.used = true;
    return Object.freeze({ ...receipt, createdAt: new Date(tx.now).toISOString() });
  });
}

/** Durable post-commit replay validation. It accepts a stored Android receipt
 * ONLY when the ACK row, canonical mapping, settled reservation, real Store spend
 * ledger/allocation and snapshot, cash-only Finance and monetary conservation all
 * match. It repairs nothing and never creates a receipt. */
export function readAndroidPointsSaleReceiptAckEvidenceInTransaction(db: DatabaseSync, action: AndroidSyncAction,
  receipt: AndroidMarketSaleResultReceipt): AndroidPointsSaleReceiptAckEvidenceHandle {
  benefitsAssert(receipt && Number.isSafeInteger(receipt.pointsTenderMinor) && receipt.pointsTenderMinor >= 0, `${SCOPE}_ACK`);
  const owned = db.isTransaction;
  if (!owned) db.exec("BEGIN");
  try {
    const facts = readSettledPointsSaleFacts(db, action, receipt, true);
    const handle = Object.freeze({ state: "durable_ack_replay_only" as const }) as AndroidPointsSaleReceiptAckEvidenceHandle;
    ackEvidences.set(handle, facts);
    return handle;
  } finally {
    if (!owned) db.exec("ROLLBACK");
  }
}

/** Membership in the server-issued set; a copied/JSON projection cannot pass. */
export function isIssuedAndroidPointsSaleReceiptAckEvidence(evidence: unknown): evidence is AndroidPointsSaleReceiptAckEvidenceHandle {
  return Boolean(evidence && ackEvidences.has(evidence as AndroidPointsSaleReceiptAckEvidenceHandle));
}

export function readIssuedAndroidPointsSaleReceiptAckEvidence(evidence: AndroidPointsSaleReceiptAckEvidenceHandle): PointsSaleFacts {
  const facts = ackEvidences.get(evidence);
  benefitsAssert(facts, `${SCOPE}_ACK`);
  return facts;
}
