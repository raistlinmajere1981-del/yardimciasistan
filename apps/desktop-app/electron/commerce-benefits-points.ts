import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { benefitsAssert, minor } from "./commerce-benefits-engine.js";
import { benefitsOperation, type BenefitsTransaction } from "./commerce-benefits-rules.js";

interface PointLot { id: string; amount_minor: number; free_minor: number; expires_at_ms: number | null }
export interface PointHoldPlan { expiresAt: number; allocations: { creditId: string; amountMinor: number }[] }
function checkedTotal(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  benefitsAssert(total >= 0n && total <= BigInt(Number.MAX_SAFE_INTEGER), "BENEFITS_POINT_BALANCE_INVALID");
  return Number(total);
}
export function requireBenefitsCustomer(database: DatabaseSync, businessId: string, customerId: string): void {
  benefitsAssert(database.prepare("SELECT 1 FROM customers WHERE business_id = ? AND id = ? AND deleted_at = ''")
    .get(businessId, customerId), "BENEFITS_CUSTOMER_SCOPE");
}
function pointLots(database: DatabaseSync, businessId: string, customerId: string, currency: string, now: number,
  excludedReservation: string | null = null): PointLot[] {
  requireBenefitsCustomer(database, businessId, customerId);
  return database.prepare(`SELECT l.id, l.amount_minor, l.expires_at_ms,
    l.amount_minor - COALESCE((SELECT SUM(a.amount_minor) FROM commerce_benefit_point_allocations a
      WHERE a.business_id = l.business_id AND a.credit_entry_id = l.id),0)
      - COALESCE((SELECT SUM(h.amount_minor) FROM commerce_benefit_point_holds h JOIN commerce_benefit_reservations r
        ON r.business_id = h.business_id AND r.id = h.reservation_id
        WHERE h.business_id = l.business_id AND h.credit_entry_id = l.id AND r.status = 'active'
          AND r.expires_at_ms > ? AND (? IS NULL OR r.id != ?)),0) AS free_minor
    FROM commerce_benefit_point_ledger l WHERE l.business_id = ? AND l.customer_id = ? AND l.currency = ?
      AND l.amount_minor > 0 ORDER BY l.sequence`)
    .all(now, excludedReservation, excludedReservation, businessId, customerId, currency) as unknown as PointLot[];
}
export function readCommercePointBalance(database: DatabaseSync, businessId: string, customerId: string, currency: string,
  now: number, excludedReservation: string | null = null): { postedMinor: number; availableMinor: number; reservedMinor: number } {
  minor(now);
  const lots = pointLots(database, businessId, customerId, currency, now, excludedReservation);
  const entries = database.prepare("SELECT amount_minor FROM commerce_benefit_point_ledger WHERE business_id = ? AND customer_id = ? AND currency = ?")
    .all(businessId, customerId, currency) as { amount_minor: number }[];
  const holds = database.prepare(`SELECT h.amount_minor FROM commerce_benefit_point_holds h JOIN commerce_benefit_reservations r
    ON r.business_id = h.business_id AND r.id = h.reservation_id WHERE r.business_id = ? AND r.customer_id = ?
    AND r.currency = ? AND r.status = 'active' AND r.expires_at_ms > ? AND (? IS NULL OR r.id != ?)`)
    .all(businessId, customerId, currency, now, excludedReservation, excludedReservation) as { amount_minor: number }[];
  return { postedMinor: checkedTotal(entries.map(row => row.amount_minor)),
    availableMinor: checkedTotal(lots.filter(lot => lot.expires_at_ms === null || lot.expires_at_ms > now).map(lot => minor(lot.free_minor))),
    reservedMinor: checkedTotal(holds.map(row => row.amount_minor)) };
}
/** Conservative read-only deadline: a lot or active hold expiry may change the
 * available balance even while a synchronous parent's logical time stays fixed.
 * This grants no hold and deliberately includes lots already fully allocated.
 */
export function readCommercePointBalanceFreshUntil(database: DatabaseSync, businessId: string, customerId: string,
  currency: string, now: number): number | null {
  minor(now);
  const boundaries = pointLots(database, businessId, customerId, currency, now)
    .flatMap(lot => lot.expires_at_ms !== null && lot.expires_at_ms > now ? [minor(lot.expires_at_ms)] : []);
  const holds = database.prepare(`SELECT expires_at_ms FROM commerce_benefit_reservations
    WHERE business_id=? AND customer_id=? AND currency=? AND status='active' AND expires_at_ms>?`)
    .all(businessId, customerId, currency, now) as { expires_at_ms: number }[];
  for (const hold of holds) boundaries.push(minor(hold.expires_at_ms));
  return boundaries.reduce<number | null>((earliest, boundary) => earliest === null ? boundary : Math.min(earliest, boundary), null);
}
function planCommercePointHoldInternal(tx: BenefitsTransaction, businessId: string, customerId: string, currency: string,
  amount: number, expiresAt: number): PointHoldPlan {
  minor(amount);
  const plan: PointHoldPlan = { expiresAt, allocations: [] };
  let left = amount;
  for (const lot of pointLots(tx.database, businessId, customerId, currency, tx.now)) {
    if (lot.expires_at_ms !== null && lot.expires_at_ms <= tx.now) continue;
    const take = Math.min(left, minor(lot.free_minor));
    if (!take) continue;
    plan.allocations.push({ creditId: lot.id, amountMinor: take });
    if (lot.expires_at_ms !== null) plan.expiresAt = Math.min(plan.expiresAt, lot.expires_at_ms);
    left -= take;
    if (!left) break;
  }
  benefitsAssert(left === 0, "BENEFITS_POINTS_INSUFFICIENT");
  return plan;
}
function insertCommercePointHoldInternal(tx: BenefitsTransaction, businessId: string, reservationId: string, plan: PointHoldPlan): void {
  for (const allocation of plan.allocations) tx.database.prepare("INSERT INTO commerce_benefit_point_holds VALUES (?,?,?,?)")
    .run(businessId, reservationId, allocation.creditId, allocation.amountMinor);
}
function appendEntry(tx: BenefitsTransaction, input: {
  businessId: string; customerId: string; currency: string; amount: number;
  kind: "grant" | "spend" | "reversal" | "expiry" | "manual_adjustment";
  sourceKind: string; sourceId: string; operationKey: string; linkedEntryId: string | null; expiresAt: number | null;
}): string {
  requireBenefitsCustomer(tx.database, input.businessId, input.customerId);
  benefitsAssert(Number.isSafeInteger(input.amount) && input.amount !== 0, "BENEFITS_INVALID_AMOUNT");
  const current = tx.database.prepare("SELECT amount_minor FROM commerce_benefit_point_ledger WHERE business_id = ? AND customer_id = ? AND currency = ?")
    .all(input.businessId, input.customerId, input.currency) as { amount_minor: number }[];
  checkedTotal([...current.map(row => row.amount_minor), input.amount]);
  const id = randomUUID();
  tx.database.prepare(`INSERT INTO commerce_benefit_point_ledger
    (business_id,id,customer_id,currency,kind,amount_minor,source_kind,source_id,operation_key,linked_entry_id,expires_at_ms,created_at_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.businessId, id, input.customerId, input.currency, input.kind, input.amount,
      input.sourceKind, input.sourceId, input.operationKey, input.linkedEntryId, input.expiresAt, tx.now);
  return id;
}
function allocateDebit(tx: BenefitsTransaction, businessId: string, creditId: string, debitId: string, amount: number): void {
  tx.database.prepare("INSERT INTO commerce_benefit_point_allocations VALUES (?,?,?,?)").run(businessId, creditId, debitId, amount);
}
function spendCommercePointHoldInternal(tx: BenefitsTransaction, input: {
  businessId: string; customerId: string; currency: string; reservationId: string; amount: number; sourceKind: string; sourceId: string; operationKey: string;
}): string | null {
  if (!input.amount) return null;
  const holds = tx.database.prepare("SELECT credit_entry_id,amount_minor FROM commerce_benefit_point_holds WHERE business_id = ? AND reservation_id = ?")
    .all(input.businessId, input.reservationId) as { credit_entry_id: string; amount_minor: number }[];
  benefitsAssert(checkedTotal(holds.map(row => row.amount_minor)) === input.amount, "BENEFITS_POINT_HOLD_MISMATCH");
  const id = appendEntry(tx, { ...input, amount: -input.amount, kind: "spend", linkedEntryId: null, expiresAt: null });
  for (const hold of holds) allocateDebit(tx, input.businessId, hold.credit_entry_id, id, hold.amount_minor);
  return id;
}
function grantSettledCommercePointsInternal(tx: BenefitsTransaction, input: {
  businessId: string; customerId: string; currency: string; amount: number; sourceKind: string; sourceId: string;
  operationKey: string; expiresAt: number | null;
}): string | null {
  minor(input.amount);
  if (!input.amount) return null;
  return appendEntry(tx, { ...input, kind: "grant", linkedEntryId: null });
}
function adjustCommercePointsInternal(tx: BenefitsTransaction, input: {
  businessId: string; customerId: string; currency: string; amount: number; operationKey: string; expiresAt: number | null;
}): string {
  benefitsAssert(Number.isSafeInteger(input.amount) && input.amount !== 0, "BENEFITS_INVALID_AMOUNT");
  benefitsAssert(input.expiresAt === null || (input.amount > 0 && minor(input.expiresAt) > tx.now), "BENEFITS_INVALID_EXPIRY");
  const plan = input.amount < 0 ? planCommercePointHold(tx, input.businessId, input.customerId, input.currency, -input.amount, tx.now + 1) : null;
  const id = appendEntry(tx, { ...input, kind: "manual_adjustment", sourceKind: "manual", sourceId: input.operationKey, linkedEntryId: null });
  for (const allocation of plan?.allocations ?? []) allocateDebit(tx, input.businessId, allocation.creditId, id, allocation.amountMinor);
  return id;
}
function expireCommercePointsInternal(tx: BenefitsTransaction, input: {
  businessId: string; customerId: string; currency: string; operationKey: string;
}): string[] {
  const ids: string[] = [];
  for (const lot of pointLots(tx.database, input.businessId, input.customerId, input.currency, tx.now)) {
    if (lot.expires_at_ms === null || lot.expires_at_ms > tx.now || !minor(lot.free_minor)) continue;
    const id = appendEntry(tx, { ...input, amount: -lot.free_minor, kind: "expiry", sourceKind: "expiry", sourceId: `${lot.id}:${input.operationKey}`,
      linkedEntryId: lot.id, expiresAt: null });
    allocateDebit(tx, input.businessId, lot.id, id, lot.free_minor); ids.push(id);
  }
  return ids;
}
/** Full reversal only. Earned Puan already spent/held makes the parent refund fail atomically. */
function reverseSettledCommercePointsInternal(tx: BenefitsTransaction, input: {
  businessId: string; customerId: string; currency: string; snapshotId: string; grantId: string | null; spendId: string | null; operationKey: string;
}): string[] {
  const ids: string[] = [];
  if (input.grantId) {
    const lot = pointLots(tx.database, input.businessId, input.customerId, input.currency, tx.now).find(item => item.id === input.grantId);
    benefitsAssert(lot, "BENEFITS_POINT_REVERSAL_SCOPE");
    const expired = tx.database.prepare(`SELECT a.amount_minor FROM commerce_benefit_point_allocations a JOIN commerce_benefit_point_ledger d
      ON d.business_id = a.business_id AND d.id = a.debit_entry_id WHERE a.business_id = ? AND a.credit_entry_id = ? AND d.kind = 'expiry'`)
      .all(input.businessId, input.grantId) as { amount_minor: number }[];
    const recover = lot.amount_minor - checkedTotal(expired.map(row => row.amount_minor));
    benefitsAssert(lot.free_minor >= recover, "BENEFITS_EARNED_POINTS_ALREADY_USED");
    if (recover) {
      const id = appendEntry(tx, { ...input, amount: -recover, kind: "reversal", sourceKind: "benefit_refund_grant", sourceId: input.snapshotId,
        linkedEntryId: input.grantId, expiresAt: null });
      allocateDebit(tx, input.businessId, input.grantId, id, recover); ids.push(id);
    }
  }
  if (input.spendId) {
    const credits = tx.database.prepare(`SELECT c.id,c.expires_at_ms,a.amount_minor FROM commerce_benefit_point_allocations a
      JOIN commerce_benefit_point_ledger c ON c.business_id = a.business_id AND c.id = a.credit_entry_id
      WHERE a.business_id = ? AND a.debit_entry_id = ? AND c.customer_id = ? AND c.currency = ? ORDER BY c.id`)
      .all(input.businessId, input.spendId, input.customerId, input.currency) as { id: string; expires_at_ms: number | null; amount_minor: number }[];
    for (const credit of credits) {
      const id = appendEntry(tx, { ...input, amount: credit.amount_minor, kind: "reversal", sourceKind: "benefit_refund_spend",
        sourceId: `${input.snapshotId}:${credit.id}`, linkedEntryId: input.spendId, expiresAt: credit.expires_at_ms });
      ids.push(id);
      if (credit.expires_at_ms !== null && credit.expires_at_ms <= tx.now) {
        const expiryId = appendEntry(tx, { ...input, amount: -credit.amount_minor, kind: "expiry", sourceKind: "benefit_refund_expired",
          sourceId: id, linkedEntryId: id, expiresAt: null });
        allocateDebit(tx, input.businessId, id, expiryId, credit.amount_minor); ids.push(expiryId);
      }
    }
  }
  return ids;
}

// Internal primitives share the branded parent transaction and poison it on failure.
function pointOperation<Args extends unknown[], Result>(operation: (tx: BenefitsTransaction, ...args: Args) => Result) {
  return (tx: BenefitsTransaction, ...args: Args): Result => benefitsOperation(tx, () => operation(tx, ...args));
}
export const planCommercePointHold = pointOperation(planCommercePointHoldInternal);
export const insertCommercePointHold = pointOperation(insertCommercePointHoldInternal);
export const spendCommercePointHold = pointOperation(spendCommercePointHoldInternal);
export const grantSettledCommercePoints = pointOperation(grantSettledCommercePointsInternal);
export const adjustCommercePoints = pointOperation(adjustCommercePointsInternal);
export const expireCommercePoints = pointOperation(expireCommercePointsInternal);
export const reverseSettledCommercePoints = pointOperation(reverseSettledCommercePointsInternal);
