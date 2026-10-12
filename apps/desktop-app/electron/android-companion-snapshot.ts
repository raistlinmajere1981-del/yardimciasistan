import { DatabaseSync } from "node:sqlite";
import {
  emptyAndroidCommerceSnapshot, emptyAndroidMarketingSnapshot,
  type AndroidCommerceSnapshot, type AndroidCommerceOrderSource
} from "@yardimci-asistan/sync-core";
import { BUSINESS_CAPABILITIES as C, type BusinessCapability } from "@yardimci-asistan/shared";
import { readCommerceOrderOperations } from "./commerce-order-store";
import { readCommerceShipmentOperations } from "./commerce-shipment-store";
import { readCustomerCommercialOperations } from "./database/customer-store";
import { readOnlineCatalogOperations } from "./commerce-product-publication-store";
import { readMarketingCompanionStatus } from "./marketing/companion-status-store";

function source(value: string): AndroidCommerceOrderSource {
  return value === "desktop" || value === "web-online-sales" || value === "web-dealer" ? value : "other";
}

export function createAndroidCompanionSnapshot(databasePath: string, capabilities: BusinessCapability[]) {
  const commerce = emptyAndroidCommerceSnapshot();
  let marketing = emptyAndroidMarketingSnapshot();
  if (!capabilities.includes(C.ANDROID)) return { commerce, marketing };
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout=5000; BEGIN;");
    if (capabilities.includes(C.ORDERS)) {
      const facts = readCommerceOrderOperations(db);
      commerce.orders = facts.orders.map(order => ({ id: order.id, customer_id: order.customerId, status: order.status, source: source(order.source),
        total: order.total, currency: order.currency, delivery_method: order.deliverySnapshot.method,
        placed_at: order.placedAt, updated_at: order.updatedAt }));
      commerce.order_counts = facts.counts.map(r => ({ source: source(String(r.source)),
        status: r.status as AndroidCommerceSnapshot["orders"][number]["status"], count: Number(r.count) }));
      const shipping = readCommerceShipmentOperations(db, commerce.orders.map(order => order.id));
      commerce.shipments = shipping.shipments.map(s => ({ id: s.id, order_id: s.orderId, status: s.status,
        tracking_available: Boolean(s.trackingNumber), updated_at: s.updatedAt }));
      commerce.shipment_counts = shipping.counts.map(r => ({ source: source(String(r.source)), pending: Number(r.pending) }));
      if (capabilities.includes(C.WHOLESALE) && capabilities.includes(C.CUSTOMERS)) {
        commerce.customer_profiles = readCustomerCommercialOperations(db).map(r => ({ customer_id: String(r.customer_id),
          dealer_status: r.dealer_status as AndroidCommerceSnapshot["customer_profiles"][number]["dealer_status"],
          price_group: r.price_group as AndroidCommerceSnapshot["customer_profiles"][number]["price_group"], updated_at: String(r.updated_at) }));
      }
      if (capabilities.includes(C.ONLINE_SALES)) commerce.online_catalog = readOnlineCatalogOperations(db);
    }
    if (capabilities.includes(C.MARKETING_STUDIO)) marketing = readMarketingCompanionStatus(db);
    db.exec("COMMIT;");
    return { commerce, marketing };
  } finally { db.close(); }
}
