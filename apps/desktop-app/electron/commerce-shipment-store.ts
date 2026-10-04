import { DatabaseSync } from "node:sqlite";
import { createId, normalizeCommerceOrderDeliverySnapshot,
  type CommerceShipment, type CommerceShipmentStatus, type UpdateCommerceShipmentStatusInput
} from "@yardimci-asistan/shared";

export class CommerceShipmentDomainError extends Error {
  readonly code = "invalid_shipment";
}

const transitions: Record<CommerceShipmentStatus, readonly CommerceShipmentStatus[]> = {
  draft: ["ready", "cancelled"], ready: ["dispatched", "cancelled"],
  dispatched: ["delivered"], delivered: [], cancelled: []
};
const timestampColumns: Partial<Record<CommerceShipmentStatus, string>> = {
  ready: "ready_at", dispatched: "dispatched_at", delivered: "delivered_at", cancelled: "cancelled_at"
};

function withDatabase<T>(path: string, write: boolean, operation: (db: DatabaseSync, businessId: string) => T): T {
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    if (write) db.exec("BEGIN IMMEDIATE");
    try {
      const business = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
      if (!business) throw new Error("Aktif işletme bulunamadı.");
      const result = operation(db, String(business.id));
      if (write) db.exec("COMMIT");
      return result;
    } catch (error) {
      if (write) db.exec("ROLLBACK");
      throw error;
    }
  } finally { db.close(); }
}

function requireOrder(db: DatabaseSync, businessId: string, id: string) {
  const row = db.prepare("SELECT * FROM commerce_orders WHERE id = ? AND business_id = ? AND deleted_at = ''").get(String(id ?? "").trim(), businessId);
  if (!row) throw new CommerceShipmentDomainError("Gönderi için sipariş bulunamadı.");
  return row;
}

function mapShipment(row: Record<string, unknown>): CommerceShipment {
  return {
    id: String(row.id), businessId: String(row.business_id), orderId: String(row.order_id),
    status: String(row.status) as CommerceShipmentStatus,
    providerId: String(row.provider_id), providerName: String(row.provider_name),
    externalReference: String(row.external_reference), trackingNumber: String(row.tracking_number),
    trackingUrl: String(row.tracking_url), labelReference: String(row.label_reference), note: String(row.note),
    readyAt: String(row.ready_at), dispatchedAt: String(row.dispatched_at), deliveredAt: String(row.delivered_at),
    cancelledAt: String(row.cancelled_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at)
  };
}

function shipmentRow(db: DatabaseSync, businessId: string, id: string) {
  return db.prepare(`SELECT s.* FROM commerce_shipments s JOIN commerce_orders o ON o.id = s.order_id
    WHERE s.id = ? AND s.business_id = ? AND o.business_id = ? AND s.deleted_at = '' AND o.deleted_at = ''`)
    .get(String(id ?? "").trim(), businessId, businessId);
}

export function listShipmentsForOrder(path: string, orderId: string): CommerceShipment[] {
  return withDatabase(path, false, (db, businessId) => {
    const order = requireOrder(db, businessId, orderId);
    return db.prepare("SELECT * FROM commerce_shipments WHERE order_id = ? AND business_id = ? AND deleted_at = '' ORDER BY created_at, id")
      .all(String(order.id), businessId).map(mapShipment);
  });
}

export function getShipment(path: string, shipmentId: string): CommerceShipment | null {
  return withDatabase(path, false, (db, businessId) => {
    const row = shipmentRow(db, businessId, shipmentId);
    return row ? mapShipment(row) : null;
  });
}

export function createShipmentForOrder(path: string, orderId: string): CommerceShipment {
  return withDatabase(path, true, (db, businessId) => {
    const order = requireOrder(db, businessId, orderId);
    const delivery = normalizeCommerceOrderDeliverySnapshot(JSON.parse(String(order.delivery_snapshot_json)));
    if (delivery.method !== "shipping") throw new CommerceShipmentDomainError("Yalnız kargo teslimatlı sipariş için gönderi oluşturulabilir.");
    if (order.status === "cancelled") throw new CommerceShipmentDomainError("İptal edilmiş sipariş için gönderi oluşturulamaz.");
    const id = createId("commerce_shipment_");
    const now = new Date().toISOString();
    db.prepare("INSERT INTO commerce_shipments (id, business_id, order_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, businessId, String(order.id), now, now);
    return mapShipment(shipmentRow(db, businessId, id)!);
  });
}

export function updateShipmentStatus(path: string, input: UpdateCommerceShipmentStatusInput): CommerceShipment {
  return withDatabase(path, true, (db, businessId) => {
    const row = shipmentRow(db, businessId, input?.shipmentId);
    if (!row) throw new CommerceShipmentDomainError("Gönderi bulunamadı.");
    const current = mapShipment(row);
    const target = input.status;
    if (!Object.hasOwn(transitions, target)) throw new CommerceShipmentDomainError("Geçersiz gönderi durumu.");
    if (current.status === target) return current;
    if (!transitions[current.status].includes(target)) throw new CommerceShipmentDomainError("Geçersiz gönderi durum geçişi.");
    const order = requireOrder(db, businessId, current.orderId);
    if (order.status === "cancelled" && target !== "cancelled" && current.status !== "dispatched") {
      throw new CommerceShipmentDomainError("İptal edilmiş siparişin gönderisi ilerletilemez.");
    }
    const now = new Date().toISOString();
    // Column comes exclusively from the domain transition graph, never from IPC input.
    db.prepare(`UPDATE commerce_shipments SET status = ?, ${timestampColumns[target]} = ?, updated_at = ? WHERE id = ? AND business_id = ?`)
      .run(target, now, now, current.id, businessId);
    return mapShipment(shipmentRow(db, businessId, current.id)!);
  });
}
