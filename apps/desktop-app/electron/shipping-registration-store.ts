import type { DatabaseSync } from "node:sqlite";

export interface ShipmentRegistration {
  shipmentId: string;
  providerId: string;
  integrationCode: string;
  accountFingerprint: string;
  state: "prepared" | "submitted" | "registered";
}
function map(row: Record<string, unknown>): ShipmentRegistration {
  return { shipmentId: String(row.shipment_id), providerId: String(row.provider_id), integrationCode: String(row.integration_code),
    accountFingerprint: String(row.account_fingerprint), state: row.state as ShipmentRegistration["state"] };
}
export function getShipmentRegistration(db: DatabaseSync, shipmentId: string): ShipmentRegistration | null {
  const row = db.prepare("SELECT * FROM commerce_shipment_registrations WHERE shipment_id = ?").get(shipmentId);
  return row ? map(row) : null;
}
export function prepareShipmentRegistration(db: DatabaseSync, input: Omit<ShipmentRegistration, "state">): ShipmentRegistration {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO commerce_shipment_registrations (shipment_id, provider_id, integration_code, account_fingerprint, state, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'prepared', ?, ?) ON CONFLICT(shipment_id) DO NOTHING`)
    .run(input.shipmentId, input.providerId, input.integrationCode, input.accountFingerprint, now, now);
  return getShipmentRegistration(db, input.shipmentId)!;
}
export function markShipmentRegistrationSubmitted(db: DatabaseSync, shipmentId: string): boolean {
  return db.prepare(`UPDATE commerce_shipment_registrations SET state = 'submitted', updated_at = ?
    WHERE shipment_id = ? AND state = 'prepared' AND EXISTS (
      SELECT 1 FROM commerce_shipments s JOIN commerce_orders o ON o.id = s.order_id
      WHERE s.id = shipment_id AND s.status IN ('draft', 'ready') AND s.deleted_at = ''
        AND o.deleted_at = '' AND o.status <> 'cancelled'
    )`)
    .run(new Date().toISOString(), shipmentId).changes === 1;
}

/** Receipt attachment and the shipment write share the caller's transaction.
 * Registration identity is immutable, including the provider account/environment. */
export function confirmShipmentRegistrationInTransaction(db: DatabaseSync, input: Omit<ShipmentRegistration, "state">, now: string): boolean {
  if (!db.isTransaction) throw new Error("Shipment receipt requires a transaction.");
  return db.prepare(`UPDATE commerce_shipment_registrations SET state = 'registered', updated_at = ?
    WHERE shipment_id = ? AND provider_id = ? AND integration_code = ? AND account_fingerprint = ?`)
    .run(now, input.shipmentId, input.providerId, input.integrationCode, input.accountFingerprint).changes === 1;
}
