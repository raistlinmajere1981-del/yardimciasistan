import { commerceAndroidActionIntentHash } from "./android-commerce-order-actions";
import { marketAndroidActionIntentHash } from "./market-android-actions";
import { androidKbsActionIntentHash, isAndroidKbsAction } from "./android-kbs-actions.js";
import { authorizeAndroidAction } from "./android-action-service";
import type { DatabaseSync } from "node:sqlite";
import { moneyToMinor, type BusinessCapability } from "@yardimci-asistan/shared";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import type { ApplyAndroidActionResult, AndroidMarketSaleResultReceipt } from "./database-types.js";
import { routeAndroidActionInTransaction } from "./android-action-router.js";
import { inspectAndroidPointsSaleReceiptEvidenceInTransaction, isIssuedAndroidPointsSaleReceiptAckEvidence,
  readAndroidPointsSaleReceiptAckEvidenceInTransaction, readIssuedAndroidPointsSaleReceiptAckEvidence,
  type AndroidPointsSaleReceiptAckEvidenceHandle } from "./android-points-sale-receipt-evidence.js";
import { CommerceBenefitsError } from "./commerce-benefits-engine.js";
import { canonicalBenefitsJson, withCommerceBenefitsParentTransaction, type BenefitsTransaction } from "./commerce-benefits-rules.js";
import { bindCompanionPointsIntent } from "./companion-points-intent.js";
import { captureCompanionSaleBenefitsIssuedReservation, companionSaleBenefitsPaidWriterPorts,
  companionSaleInputFromAction, hasActiveCompanionCashEarnRule, prepareCompanionCashSaleRoute,
  issueCompanionSaleBenefitsPaidWriterAuthorization, prepareCompanionCouponSaleRoute, prepareCompanionPointsSaleRoute,
  prepareCompanionSaleBenefitsIssuance, prepareCompanionSalePaidSaleWriter, settleCompanionSaleBenefitsPaidSale,
  type CompanionPointsSaleRoutePreparation } from "./companion-sale-benefits.js";
import { companionCouponPermitSource } from "./companion-coupon-permit.js";
import { captureMarketSalePaidSaleProvenance, completeMarketCompanionPaidSaleInTransaction } from "./market-sale-operation.js";
import { materializeAuthorizedPointsSaleReceipt, prepareAndroidPointsSaleReceiptWitness } from "./android-points-sale-receipt-evidence.js";
import { insertAndroidActionEvent } from "./android-action-service.js";
import { queueSyncJob } from "./database/sync-runtime-store.js";
import type { BenefitsManagementKeys } from "./commerce-benefits-management.js";
import { upsertAndroidDeviceSightings } from "./database/android-device-store.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { authorizeAndroidLocalCredential } from "./database/android-local-credential-store.js";
import type { LocalCompanionActionContext } from "./local-companion-server.js";

/** Terminal internal refusal: a structural points candidate never authorizes a
 * paid writer, Android receipt or ACK without an independent trusted grant. */
export const COMPANION_POINTS_PAID_WRITER_AUTHORITY_REQUIRED = "COMPANION_POINTS_PAID_WRITER_AUTHORITY_REQUIRED" as const;

const localActionParents = new WeakMap<LocalCompanionActionContext, { db: DatabaseSync; action: AndroidSyncAction }>();

/** Read-only proof of this owner's currently executing BEGIN IMMEDIATE scope. */
export function isLocalActionParentTransaction(db: DatabaseSync, action: AndroidSyncAction,
  context: LocalCompanionActionContext): boolean {
  const parent = localActionParents.get(context);
  return db.isTransaction && parent?.db === db && parent.action === action;
}

/** Post-commit read-only authorization and canonical receipt lookup in one SQLite snapshot. */
export function readAuthorizedLocalSaleReceipt(db: DatabaseSync, action: AndroidSyncAction, deviceId: string, token: string): AndroidMarketSaleResultReceipt | undefined {
  if (action.action_type !== "market_sale_complete" || action.device_id !== deviceId) return undefined;
  db.exec("BEGIN");
  try {
    if (!authorizeAndroidLocalCredential(db, deviceId, token) || !authorizeAndroidAction(db, action, readEnabledBusinessCapabilities(db)).ok) return undefined;
    const business = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
    if (!business) return undefined;
    const row = db.prepare(`SELECT r.result_json FROM android_market_sale_result_receipts r
      JOIN android_action_receipts a ON a.id = r.action_id
      JOIN commerce_market_sale_receipts s ON s.operation_id = r.action_id AND s.sale_id = r.sale_id
      WHERE r.action_id = ? AND a.action_type = 'market_sale_complete' AND a.device_id = ? AND a.intent_hash = ? AND s.business_id = ?
        AND json_extract(r.result_json, '$.saleId') = s.sale_id AND json_extract(r.result_json, '$.businessId') = s.business_id`)
      .get(action.id, deviceId, marketAndroidActionIntentHash(action), String(business.id));
    if (!row) return undefined;
    const receipt = JSON.parse(String(row.result_json)) as AndroidMarketSaleResultReceipt;
    try {
      const benefitsSettled = Boolean(db.prepare("SELECT 1 FROM commerce_benefit_snapshots WHERE source_kind='sale' AND source_id=?")
        .get(receipt.saleId));
      const evidence = receipt.pointsTenderMinor > 0 || benefitsSettled
        ? readAndroidPointsSaleReceiptAckEvidenceInTransaction(db, action, receipt) : undefined;
      return androidSaleReceiptForAck(action, { ok: true, message: "", alreadyApplied: true, receipt }, deviceId,
        String(business.id), evidence);
    } catch { return undefined; }
  } finally { db.exec("ROLLBACK"); }
}

/** Pure projection only: callers must independently authenticate and reauthorize the device and resolve the current business. */
export function androidSaleReceiptForAck(action: AndroidSyncAction, result: ApplyAndroidActionResult,
  authorizedDeviceId: string, currentBusinessId: string,
  pointsEvidence?: AndroidPointsSaleReceiptAckEvidenceHandle): AndroidMarketSaleResultReceipt | undefined {
  if (!result.ok || !result.receipt || action.action_type !== "market_sale_complete" || !authorizedDeviceId || !currentBusinessId) return undefined;
  const receipt = result.receipt;
  if (action.device_id !== authorizedDeviceId || receipt.deviceId !== authorizedDeviceId || receipt.businessId !== currentBusinessId
      || receipt.actionId !== action.id || receipt.source !== "android-market-sale"
      || !Number.isSafeInteger(receipt.pointsTenderMinor) || receipt.pointsTenderMinor < 0
      || receipt.intentHash !== marketAndroidActionIntentHash(action)) return undefined;
  if (receipt.pointsTenderMinor > 0 || pointsEvidence) {
    // Points and zero-points earn receipts are replayable ONLY with durable
    // settled evidence issued from the stored ACK/mapping/settlement/snapshot/ledger rows.
    if (!pointsEvidence || !isIssuedAndroidPointsSaleReceiptAckEvidence(pointsEvidence)) return undefined;
    const facts = readIssuedAndroidPointsSaleReceiptAckEvidence(pointsEvidence);
    // facts.requestHash is the canonical market-sale operation hash; receipt.intentHash
    // is the Android action hash. They are intentionally unrelated. Compare the
    // durable receipt projection itself instead of either identity.
    if (canonicalBenefitsJson(facts.receipt) !== canonicalBenefitsJson(receipt)
        || facts.saleId !== receipt.saleId || facts.businessId !== receipt.businessId
        || facts.cashPaidMinor !== receipt.cashPaidMinor || facts.pointsTenderMinor !== receipt.pointsTenderMinor
        || facts.currency !== receipt.currency) return undefined;
  }
  return receipt;
}

function materializeSaleReceipt(db: DatabaseSync, actionId: string, deviceId: string, intentHash: string, now: string): AndroidMarketSaleResultReceipt {
  const sale = db.prepare(`SELECT s.* FROM commerce_market_sale_receipts r JOIN commerce_sales s ON s.id=r.sale_id AND s.business_id=r.business_id
    WHERE r.operation_id=? AND s.source='android-market-sale' AND s.status IN ('paid','credit') AND s.deleted_at=''`).get(actionId);
  if (!sale) throw new Error("Missing Android sale evidence");
  const income = db.prepare("SELECT * FROM finance_entries WHERE source_type='commerce_sale' AND source_id=?").all(String(sale.id));
  const entry = income[0];
  const amount = sale.status === "paid" ? moneyToMinor(Number(sale.total)) : 0;
  if (!Number.isSafeInteger(amount) || amount < 0 || (amount === 0 ? income.length !== 0 : income.length !== 1 || !entry
    || entry.direction !== "income" || entry.deleted_at !== "" || entry.amount_minor !== amount
    || entry.currency !== sale.currency || entry.payment_method !== (["cash", "card", "bank"].includes(String(sale.payment_method)) ? sale.payment_method : "other"))) throw new Error("Invalid Android finance evidence");
  if (db.prepare("SELECT 1 FROM commerce_sale_settlements WHERE sale_id=?").get(String(sale.id))
      || db.prepare("SELECT 1 FROM commerce_benefit_snapshots WHERE source_kind='sale' AND source_id=?").get(String(sale.id))) throw new Error("Unexpected benefits evidence");
  return { actionId, deviceId, intentHash, createdAt: now, saleId: String(sale.id), businessId: String(sale.business_id),
    source: "android-market-sale", customerId: sale.customer_id ? String(sale.customer_id) : null,
    cashPaidMinor: amount, pointsTenderMinor: 0, currency: String(sale.currency), paymentMethod: String(sale.payment_method) };
}

/** Genuine owner path for one explicit Android points sale, or a zero-Puan paid
 * cash earn. Runs every existing owner helper in the identical Android BEGIN
 * IMMEDIATE: intent binding, C20k issuance/policy/quote, real Store.reserve,
 * canonical owner-issued paid sale, real Store.settle and the settled receipt
 * witness. Any failure poisons the borrowed benefits parent and the outer owner
 * rolls back the whole parent. */
function applyAndroidPointsSaleInTransaction(db: DatabaseSync, action: AndroidSyncAction, now: string,
  localContext: LocalCompanionActionContext, route: CompanionPointsSaleRoutePreparation): AndroidMarketSaleResultReceipt {
  const input = companionSaleInputFromAction(action);
  return withCommerceBenefitsParentTransaction(db, Date.now(), (tx: BenefitsTransaction) => {
    const intent = route.intent;
    const binding = bindCompanionPointsIntent(tx, action, localContext, intent);
    const issuance = prepareCompanionSaleBenefitsIssuance(tx, action, localContext, intent, binding, route.prepared);
    const authorization = issueCompanionSaleBenefitsPaidWriterAuthorization(tx, action, localContext, intent,
      binding, route.prepared, issuance);
    const writer = companionSaleBenefitsPaidWriterPorts(tx, action, localContext, intent, binding,
      route.prepared, authorization);
    const reservation = writer.store.reserve(tx, { ...writer.request, couponCodes: [] },
      issuance.operationKey, null, issuance.ownerGate);
    captureCompanionSaleBenefitsIssuedReservation(tx, action, localContext, intent, binding,
      route.prepared, issuance, reservation);
    const owner = prepareCompanionSalePaidSaleWriter(tx, action, localContext, intent, binding,
      route.prepared, issuance, reservation);
    const sale = completeMarketCompanionPaidSaleInTransaction(tx, input, owner.allocation, reservation, owner.witness);
    const provenance = captureMarketSalePaidSaleProvenance(tx, input, owner.witness);
    const settled = settleCompanionSaleBenefitsPaidSale(tx, action, localContext, intent, binding,
      route.prepared, issuance, reservation);
    const witness = prepareAndroidPointsSaleReceiptWitness(tx, action, localContext, provenance, settled.settlement);
    const receipt = materializeAuthorizedPointsSaleReceipt(tx, action, localContext, witness, settled.settlement);
    insertAndroidActionEvent(db, action, "market.sale_completed", "commerce_sale", sale.sale.id, {
      source: "android", device_id: action.device_id, settlement: sale.sale.status,
      total: sale.sale.total, currency: sale.sale.currency, points_tender_minor: receipt.pointsTenderMinor
    }, now);
    queueSyncJob(db, "android_snapshot", now);
    return receipt;
  });
}

/** Genuine owner path for one coupon-only paid cash sale. The opaque permit id is
 * the only coupon input from Android; the plaintext code stays in the pre-sale
 * permit request. Everything runs in the identical BEGIN IMMEDIATE: permit-bound
 * Store reserve with a real coupon hold, canonical paid sale with the sealed
 * discount quote, Store settle (redemption + earn), and the discount-aware
 * receipt/ACK witness. Any failure rolls the whole parent back. */
function applyAndroidCouponSaleInTransaction(db: DatabaseSync, action: AndroidSyncAction, now: string,
  localContext: LocalCompanionActionContext, route: CompanionPointsSaleRoutePreparation): AndroidMarketSaleResultReceipt {
  const input = companionSaleInputFromAction(action);
  return withCommerceBenefitsParentTransaction(db, Date.now(), (tx: BenefitsTransaction) => {
    const intent = route.intent;
    const permitId = String(intent.couponPermitId);
    const binding = bindCompanionPointsIntent(tx, action, localContext, intent);
    const issuance = prepareCompanionSaleBenefitsIssuance(tx, action, localContext, intent, binding, route.prepared);
    const authorization = issueCompanionSaleBenefitsPaidWriterAuthorization(tx, action, localContext, intent,
      binding, route.prepared, issuance);
    const writer = companionSaleBenefitsPaidWriterPorts(tx, action, localContext, intent, binding,
      route.prepared, authorization);
    // The canonical sale source is the reservation source; the deterministic
    // coupon source is only the issuance binding, never a forged sale id.
    const reservation = writer.store.reserveCouponWithPermit(tx, { ...writer.request, couponCodes: [] },
      issuance.operationKey, permitId, companionCouponPermitSource(action.device_id, action.id), issuance.ownerGate);
    captureCompanionSaleBenefitsIssuedReservation(tx, action, localContext, intent, binding,
      route.prepared, issuance, reservation);
    const owner = prepareCompanionSalePaidSaleWriter(tx, action, localContext, intent, binding,
      route.prepared, issuance, reservation);
    const sale = completeMarketCompanionPaidSaleInTransaction(tx, input, owner.allocation, reservation, owner.witness);
    const provenance = captureMarketSalePaidSaleProvenance(tx, input, owner.witness);
    const settled = settleCompanionSaleBenefitsPaidSale(tx, action, localContext, intent, binding,
      route.prepared, issuance, reservation);
    const witness = prepareAndroidPointsSaleReceiptWitness(tx, action, localContext, provenance, settled.settlement);
    const receipt = materializeAuthorizedPointsSaleReceipt(tx, action, localContext, witness, settled.settlement);
    insertAndroidActionEvent(db, action, "market.sale_completed", "commerce_sale", sale.sale.id, {
      source: "android", device_id: action.device_id, settlement: sale.sale.status,
      total: sale.sale.total, currency: sale.sale.currency,
      discount_minor: receipt.discountMinor ?? 0, points_tender_minor: receipt.pointsTenderMinor
    }, now);
    queueSyncJob(db, "android_snapshot", now);
    return receipt;
  });
}

export function applyAndroidActionTransaction(
  db: DatabaseSync,
  action: AndroidSyncAction,
  enabledCapabilities: BusinessCapability[],
  localContext?: LocalCompanionActionContext,
  pointsKeys?: BenefitsManagementKeys
): ApplyAndroidActionResult {
  const actionId = String(action.id ?? "").trim();
  const actionType = String(action.action_type ?? "").trim();
  const deviceId = String(action.device_id ?? "").trim();

  if (
    !actionId
    || !actionType
    || !deviceId
    || !action.payload
    || typeof action.payload !== "object"
    || Array.isArray(action.payload)
  ) {
    return {
      ok: false,
      message: "Telefon işlemi eksik veya geçersiz."
    };
  }

  try {
    upsertAndroidDeviceSightings(db, [{
      device_id: deviceId,
      device_name: String(action.device_name ?? ""),
      app_version: String(action.app_version ?? ""),
      first_seen_at: action.created_at,
      last_seen_at: action.last_seen_at || new Date().toISOString()
    }]);
  } catch {
    return {
      ok: false,
      message: "Telefon kaydı masaüstünde hazırlanamadı."
    };
  }

  const commerceAction = ["commerce_order_confirm", "commerce_order_cancel"].includes(actionType);
  const marketFinancialAction = ["market_sale_complete", "customer_credit_payment_add"].includes(actionType);
  const kbsAction = isAndroidKbsAction(actionType);
  const protectedAction = commerceAction || marketFinancialAction || kbsAction;
  const intentHash = commerceAction ? commerceAndroidActionIntentHash(action) : marketFinancialAction ? marketAndroidActionIntentHash(action)
    : kbsAction ? androidKbsActionIntentHash(action) : "";
  if (protectedAction && !/^[A-Za-z0-9_-]{12,120}$/.test(actionId)) {
    return { ok: false, message: "İşlem kimliği geçersiz." };
  }
  const receiptResult = (receipt: Record<string, unknown>): ApplyAndroidActionResult => {
    if (protectedAction || isAndroidKbsAction(String(receipt.action_type)) || ["market_sale_complete", "customer_credit_payment_add"].includes(String(receipt.action_type))) {
      const authorization = authorizeAndroidAction(db, action, actionType === "market_sale_complete" ? readEnabledBusinessCapabilities(db) : enabledCapabilities);
      if (!authorization.ok) return authorization;
      if (!intentHash || receipt.intent_hash !== intentHash || receipt.action_type !== actionType || receipt.device_id !== deviceId) {
        return { ok: false, message: kbsAction || isAndroidKbsAction(String(receipt.action_type)) ? "İşlem kimliği farklı bir KBS isteği için kullanılmış." : marketFinancialAction || !commerceAction
          ? "İşlem kimliği farklı bir satış veya tahsilat isteği için kullanılmış."
          : "İşlem kimliği farklı bir sipariş kararı için kullanılmış." };
      }
    }
    if (actionType === "market_sale_complete") {
      const currentBusinessId = String(db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
      const stored = db.prepare(`SELECT result.result_json FROM android_market_sale_result_receipts result
        JOIN commerce_market_sale_receipts sale ON sale.operation_id = result.action_id AND sale.sale_id = result.sale_id
        WHERE result.action_id = ? AND sale.business_id = (SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1)
          AND json_extract(result.result_json, '$.businessId') = sale.business_id
          AND json_extract(result.result_json, '$.saleId') = sale.sale_id`).get(actionId);
      if (!stored) return { ok: false, message: "Telefon satış makbuzu bulunamadı." };
      const receipt = JSON.parse(String(stored.result_json)) as AndroidMarketSaleResultReceipt;
      try {
        const benefitsSettled = Boolean(db.prepare("SELECT 1 FROM commerce_benefit_snapshots WHERE source_kind='sale' AND source_id=?")
          .get(receipt.saleId));
        const evidence = receipt.pointsTenderMinor > 0 || benefitsSettled
          ? readAndroidPointsSaleReceiptAckEvidenceInTransaction(db, action, receipt) : undefined;
        const projected = androidSaleReceiptForAck(action, { ok: true, message: "", alreadyApplied: true, receipt },
          deviceId, currentBusinessId, evidence);
        if (!projected) return { ok: false, message: "Telefon satış makbuzu doğrulanamadı." };
        return { ok: true, message: "Telefon işlemi daha önce uygulanmış.", alreadyApplied: true, receipt: projected };
      } catch { return { ok: false, message: "Telefon satış makbuzu doğrulanamadı." }; }
    }
    return { ok: true, message: "Telefon işlemi daha önce uygulanmış.", alreadyApplied: true };
  };

  const existingReceipt = db
    .prepare("SELECT action_type, device_id, intent_hash FROM android_action_receipts WHERE id = ?")
    .get(actionId);
  if (existingReceipt) {
    return receiptResult(existingReceipt);
  }

  // Key read and protected-source allocation are external/durable preparation and
  // MUST be complete before the owner's BEGIN IMMEDIATE. A positive points intent
  // is NEVER reinterpreted as a legacy/cash sale: without an authenticated HTTPS
  // context and an established protected key the route rejects immediately. A
  // zero-Puan paid cash sale with an active Companion earn rule uses the same
  // protected owner chain with an explicit 0 amount, never a synthetic spend.
  const requestedPoints = Number(action.payload.requestedPointsMinor ?? 0);
  // A couponPermitId is valid ONLY on a protected Companion paid-cash sale. It is
  // never interpreted as an undiscounted legacy sale and never reaches the
  // generic router. The plaintext coupon code never exists in this payload.
  if (action.payload.couponPermitId !== undefined && actionType !== "market_sale_complete") {
    return { ok: false, message: "Kupon izni yalnız mobil satış için geçerlidir." };
  }
  const couponRequested = actionType === "market_sale_complete" && action.payload.couponPermitId !== undefined;
  let cashEarnCandidate = false;
  if (!couponRequested) {
    try {
      cashEarnCandidate = actionType === "market_sale_complete" && requestedPoints === 0
        && hasActiveCompanionCashEarnRule(db, action);
    } catch {
      // The eligibility reader may reject a disabled benefits/customer capability.
      // Never escape the action boundary or fall through to unprotected cash sale.
      return { ok: false, message: "Mobil nakit satışının Puan kazanımı doğrulanamadı." };
    }
  }
  let pointsRoute: CompanionPointsSaleRoutePreparation | undefined;
  if (actionType === "market_sale_complete" && requestedPoints > 0
      && (action.payload.settlement !== "paid" || !String(action.payload.customer_id ?? "").trim())) {
    return { ok: false, message: "Puan için müşterili ücretli satış gerekli." };
  }
  if (couponRequested) {
    if (!localContext || !pointsKeys) {
      return { ok: false, message: "Mobil kuponlu satışın güvenli kesinleştirmesi henüz etkin değil." };
    }
    try {
      pointsRoute = prepareCompanionCouponSaleRoute(db, action, localContext, pointsKeys);
    } catch {
      return {
        ok: false,
        message: couponRequested
          ? "Kupon doğrulanamadı veya izin süresi doldu; yeni bir kupon kodu girip satışı yeniden onaylayın."
          : "Mobil kuponlu satış doğrulanamadı."
      };
    }
  } else if (actionType === "market_sale_complete" && (requestedPoints > 0 || cashEarnCandidate)) {
    if (!localContext || !pointsKeys) {
      return { ok: false, message: requestedPoints > 0
        ? "Mobil Puanlı satışın güvenli kesinleştirmesi henüz etkin değil."
        : "Mobil nakit satışının Puan kazanımı güvenli biçimde kesinleştirilemedi." };
    }
    try {
      pointsRoute = requestedPoints > 0
        ? prepareCompanionPointsSaleRoute(db, action, localContext, pointsKeys)
        : prepareCompanionCashSaleRoute(db, action, localContext, pointsKeys);
    } catch {
      return { ok: false, message: requestedPoints > 0
        ? "Mobil Puanlı satış doğrulanamadı."
        : "Mobil nakit satışının Puan kazanımı doğrulanamadı." };
    }
  }

  const now = new Date().toISOString();
  let transactionStarted = false;

  try {
    db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    if (localContext && typeof localContext === "object") localActionParents.set(localContext, { db, action });

    const concurrentReceipt = db
      .prepare("SELECT action_type, device_id, intent_hash FROM android_action_receipts WHERE id = ?")
      .get(actionId);
    if (concurrentReceipt) {
      db.exec("COMMIT");
      transactionStarted = false;
      return receiptResult(concurrentReceipt);
    }

    if (pointsRoute) {
      // The positive branch bypasses the generic router, so it must repeat the
      // same Android capability/device authorization inside this exact BEGIN
      // IMMEDIATE before any Store reserve or canonical sale write. The benefits
      // principal grant alone is NOT Android sale permission.
      const authorization = authorizeAndroidAction(db, action, readEnabledBusinessCapabilities(db));
      if (!authorization.ok) {
        db.exec("ROLLBACK");
        transactionStarted = false;
        return authorization;
      }
      const receipt = couponRequested
        ? applyAndroidCouponSaleInTransaction(db, action, now, localContext!, pointsRoute)
        : applyAndroidPointsSaleInTransaction(db, action, now, localContext!, pointsRoute);
      db.prepare("INSERT INTO android_action_receipts (id, action_type, device_id, applied_at, intent_hash) VALUES (?, ?, ?, ?, ?)")
        .run(actionId, actionType, deviceId, now, intentHash);
      db.prepare("INSERT INTO android_market_sale_result_receipts (action_id,sale_id,result_json) VALUES (?,?,?)")
        .run(actionId, receipt.saleId, JSON.stringify(receipt));
      db.exec("COMMIT");
      transactionStarted = false;
      return { ok: true, message: couponRequested
        ? "Satış, kupon indirimi ve ödeme kaydı masaüstünde tamamlandı."
        : receipt.pointsTenderMinor > 0
          ? "Satış, Puan harcaması ve ödeme kaydı masaüstünde tamamlandı."
          : "Satış, ödeme kaydı ve Puan kazanımı masaüstünde tamamlandı.",
        alreadyApplied: false, receipt };
    }

    const result = routeAndroidActionInTransaction(
      db,
      action,
      now,
      enabledCapabilities,
      localContext
    );
    if (!result.ok) {
      db.exec("ROLLBACK");
      transactionStarted = false;
      return result;
    }

    // C20p-2j: a canonical operation receipt mapped to ANY settlement is points
    // evidence, never legacy cash. The read-only verifier runs BEFORE the ACK row
    // exists, and even a structurally valid candidate has no independent trusted
    // paid-writer grant, so the owner terminates and rolls back the whole parent.
    const settledSale = actionType === "market_sale_complete"
      ? db.prepare(`SELECT 1 FROM commerce_market_sale_receipts r
          JOIN commerce_sale_settlements s ON s.sale_id = r.sale_id
          WHERE r.operation_id = ? LIMIT 1`).get(actionId)
      : undefined;
    if (settledSale) {
      inspectAndroidPointsSaleReceiptEvidenceInTransaction(db, action, localContext);
      throw new CommerceBenefitsError(COMPANION_POINTS_PAID_WRITER_AUTHORITY_REQUIRED);
    }

    db.prepare(
      "INSERT INTO android_action_receipts (id, action_type, device_id, applied_at, intent_hash) VALUES (?, ?, ?, ?, ?)"
    ).run(actionId, actionType, deviceId, now, intentHash);
    const saleReceipt = actionType === "market_sale_complete" ? materializeSaleReceipt(db, actionId, deviceId, intentHash, now) : undefined;
    if (saleReceipt) db.prepare("INSERT INTO android_market_sale_result_receipts (action_id,sale_id,result_json) VALUES (?,?,?)")
      .run(actionId, saleReceipt.saleId, JSON.stringify(saleReceipt));
    db.exec("COMMIT");
    transactionStarted = false;

    return {
      ok: true,
      message: result.message,
      alreadyApplied: false,
      ...(saleReceipt ? { receipt: saleReceipt } : {})
    };
  } catch {
    if (transactionStarted) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the action failure result even if SQLite already ended it.
      }
    }
    return {
      ok: false,
      message: couponRequested
        ? "Kupon doğrulanamadı veya izin süresi doldu; yeni bir kupon kodu girip satışı yeniden onaylayın."
        : "Telefon işlemi yerel kayıtlara uygulanamadı. Masaüstünde kayıtları kontrol edip tekrar deneyin."
    };
  } finally {
    if (localContext) localActionParents.delete(localContext);
  }
}
