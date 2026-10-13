import { DatabaseSync } from "node:sqlite";
import {
  emptyAndroidCommerceSnapshot, emptyAndroidMarketingSnapshot,
  type AndroidCommerceSnapshot, type AndroidCommerceOrderSource
} from "@yardimci-asistan/sync-core";
import { BUSINESS_CAPABILITIES as C, type BusinessCapability } from "@yardimci-asistan/shared";
import { readCommerceOrderOperations, commerceOrderAvailableDecisions } from "./commerce-order-store";
import { readCommerceShipmentOperations } from "./commerce-shipment-store";
import { readCustomerCommercialOperations, readCommerceOrderCustomers } from "./database/customer-store";
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
        placed_at: order.placedAt, updated_at: order.updatedAt,
        ...(order.source === "desktop-wholesale" ? { dealer_order: true } : {}),
        details: {
          customer_name: order.customerName,
          buyer: order.buyerSnapshot ? { name: order.buyerSnapshot.name, phone: order.buyerSnapshot.phone, email: order.buyerSnapshot.email ?? "" } : null,
          delivery_address: order.deliverySnapshot.address ? {
            recipient_name: order.deliverySnapshot.address.recipientName, address_line1: order.deliverySnapshot.address.addressLine1,
            address_line2: order.deliverySnapshot.address.addressLine2 ?? "", district: order.deliverySnapshot.address.district,
            city: order.deliverySnapshot.address.city, postal_code: order.deliverySnapshot.address.postalCode ?? "",
            country_code: order.deliverySnapshot.address.countryCode, note: order.deliverySnapshot.address.note ?? ""
          } : null,
          subtotal: order.subtotal, discount_total: order.discountTotal, note: order.note,
          items: (facts.itemsByOrder.get(order.id) ?? []).map(item => ({ id: item.id, product_id: item.productId,
            product_name: item.productName, unit: item.unit, quantity: item.quantity, unit_price: item.unitPrice, line_total: item.lineTotal })),
          items_total_count: facts.itemCounts.get(order.id) ?? 0,
          items_complete: (facts.itemsByOrder.get(order.id)?.length ?? 0) === (facts.itemCounts.get(order.id) ?? 0),
          available_actions: commerceOrderAvailableDecisions(order.status).map(status => status === "confirmed" ? "commerce_order_confirm" as const : "commerce_order_cancel" as const)
        } }));
      commerce.order_counts = facts.counts.map(r => ({ source: source(String(r.source)),
        status: r.status as AndroidCommerceSnapshot["orders"][number]["status"], count: Number(r.count),
        ...(Number(r.dealer_count) > 0 ? { dealer_count: Number(r.dealer_count) } : {}) }));
      const shipping = readCommerceShipmentOperations(db, commerce.orders.map(order => order.id));
      commerce.shipments = shipping.shipments.map(s => ({ id: s.id, order_id: s.orderId, status: s.status,
        tracking_available: Boolean(s.trackingNumber), updated_at: s.updatedAt,
        provider_name: s.providerName, tracking_number: s.trackingNumber, tracking_url: s.trackingUrl, note: s.note }));
      commerce.shipment_counts = shipping.counts.map(r => ({ source: source(String(r.source)), pending: Number(r.pending),
        ...(Number(r.dealer_pending) > 0 ? { dealer_pending: Number(r.dealer_pending) } : {}) }));
      const customerIds = [...new Set(facts.orders.map(order => order.customerId).filter(Boolean))];
      if (capabilities.includes(C.CUSTOMERS)) {
        commerce.customers = readCommerceOrderCustomers(db, customerIds).map(row => ({ id: String(row.id),
          full_name: String(row.full_name), phone: String(row.phone), email: String(row.email), updated_at: String(row.updated_at) }));
      }
      if (capabilities.includes(C.WHOLESALE) && capabilities.includes(C.CUSTOMERS)) {
        commerce.customer_profiles = readCustomerCommercialOperations(db, customerIds).map(r => ({ customer_id: String(r.customer_id),
          company_name: String(r.company_name), authorized_person: String(r.authorized_person),
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
