import type {
  CommerceOrderStatus, CommerceShipmentStatus, CommercePriceGroup, CustomerDealerStatus,
  MarketingChannel, MarketingPublication, MarketingSchedule, MarketingScheduleExecution, MessagingCampaign, CommerceUnit
} from "@yardimci-asistan/shared";

/** Decision precondition guards even a Desktop status change in the same millisecond. */
export interface AndroidCommerceOrderDecisionPayload {
  order_id: string;
  expected_updated_at: string;
  expected_status: CommerceOrderStatus;
}

export interface AndroidCommerceOrderDetails {
  customer_name: string;
  buyer: { name: string; phone: string; email: string } | null;
  delivery_address: {
    recipient_name: string; address_line1: string; address_line2: string;
    district: string; city: string; postal_code: string; country_code: string; note: string;
  } | null;
  subtotal: number; discount_total: number; note: string;
  items: Array<{ id: string; product_id: string; product_name: string; unit: CommerceUnit;
    quantity: number; unit_price: number; line_total: number }>;
  items_total_count: number;
  items_complete: boolean;
  /** Domain-owned eligibility; permission projection can only remove actions. */
  available_actions: Array<"commerce_order_confirm" | "commerce_order_cancel">;
}

/** Bounded order facts, delivered only through the authenticated device projection. */
export interface AndroidCommerceSnapshot {
  orders: Array<{
    id: string; customer_id?: string; status: CommerceOrderStatus; source: AndroidCommerceOrderSource;
    total: number; currency: string; delivery_method: "pickup" | "shipping";
    placed_at: string; updated_at: string; details?: AndroidCommerceOrderDetails;
    /** Canonical desktop-wholesale origin, preserving the legacy source enum. */
    dealer_order?: boolean;
  }>;
  customers?: Array<{ id: string; full_name: string; phone: string; email: string; updated_at: string }>;
  customer_profiles: Array<{
    customer_id: string; dealer_status: CustomerDealerStatus;
    price_group: CommercePriceGroup; updated_at: string; company_name?: string; authorized_person?: string;
  }>;
  shipments: Array<{
    id: string; order_id: string; status: CommerceShipmentStatus;
    tracking_available: boolean; updated_at: string;
    provider_name?: string; tracking_number?: string; tracking_url?: string; note?: string;
  }>;
  /** Complete aggregates, independent of list limits; source permits capability redaction. */
  order_counts: Array<{ source: AndroidCommerceOrderSource; status: CommerceOrderStatus; count: number; dealer_count?: number }>;
  shipment_counts: Array<{ source: AndroidCommerceOrderSource; pending: number; dealer_pending?: number }>;
  online_catalog: { desired_product_count: number; pending: boolean; updated_at: string };
}

export type AndroidCommerceOrderSource = "desktop" | "web-online-sales" | "web-dealer" | "other";

export interface AndroidMarketingSnapshot {
  publications: Array<{
    id: string; channel: MarketingChannel; status: MarketingPublication["status"];
    revision: number; published_revision: number; desired_published: boolean; updated_at: string;
  }>;
  schedules: Array<{
    id: string; channel: MarketingChannel; target_type: MarketingSchedule["targetType"];
    status: MarketingSchedule["status"]; next_run_at: string;
    last_execution_status: MarketingScheduleExecution["status"] | ""; updated_at: string;
  }>;
  campaigns: Array<{
    id: string; channel: "whatsapp" | "sms"; status: MessagingCampaign["status"];
    pending_count: number; failed_count: number; updated_at: string;
  }>;
}

export const ANDROID_COMPANION_LIMITS = { orders: 100, profiles: 100, shipments: 100,
  itemsPerOrder: 500, totalItems: 2000, detailBytes: 1024 * 1024,
  publications: 50, schedules: 50, campaigns: 50 } as const;

export function emptyAndroidCommerceSnapshot(): AndroidCommerceSnapshot {
  return { orders: [], customers: [], customer_profiles: [], shipments: [], order_counts: [], shipment_counts: [],
    online_catalog: { desired_product_count: 0, pending: false, updated_at: "" } };
}

export function emptyAndroidMarketingSnapshot(): AndroidMarketingSnapshot {
  return { publications: [], schedules: [], campaigns: [] };
}

import { BUSINESS_CAPABILITIES as C, type BusinessCapability } from "@yardimci-asistan/shared";
import { ANDROID_PERMISSIONS, androidEffectivePermissions, type AndroidPermission } from "./android-policy";

const orderStatuses = ["placed", "confirmed", "fulfilled", "cancelled"];
const shipmentStatuses = ["draft", "ready", "dispatched", "delivered", "cancelled"];
const channels = ["website", "instagram", "whatsapp", "sms"];
const id = (value: string) => /^[A-Za-z0-9._:-]{1,120}$/.test(value) ? value : "";
const time = (value: string) => /^\d{4}-\d{2}-\d{2}T[0-9:.+Z-]{8,30}$/.test(value) ? value : "";
const count = (value: number) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

function text(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  let result = "", length = 0;
  for (const character of value) { if (length++ >= limit) break; result += character; }
  return result;
}
function trackingUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || /[\s\u0000-\u001f\u007f]/u.test(value)) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? value : "";
  } catch { return ""; }
}
const validAmount = (value: number) => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

function projectOrderDetails(source: AndroidCommerceOrderDetails, shipping: boolean, permissions: Set<AndroidPermission>, remainingItems: number) {
  if (!validAmount(source.subtotal) || !validAmount(source.discount_total)) return null;
  const input = Array.isArray(source.items) ? source.items : [];
  const total = count(source.items_total_count);
  const units = ["piece", "kg", "g", "l", "ml", "pack", "box", "meter", "other"];
  const valid = (r: AndroidCommerceOrderDetails["items"][number]) => r && id(r.id) && id(r.product_id)
    && typeof r.product_name === "string" && units.includes(r.unit) && validAmount(r.quantity) && r.quantity > 0
    && validAmount(r.unit_price) && validAmount(r.line_total);
  const canFit = input.length <= ANDROID_COMPANION_LIMITS.itemsPerOrder && input.length <= remainingItems;
  const items = canFit ? input.filter(valid).map(r => ({ id: id(r.id), product_id: id(r.product_id),
    product_name: text(r.product_name, 200), unit: r.unit, quantity: r.quantity, unit_price: r.unit_price, line_total: r.line_total })) : [];
  const complete = source.items_complete === true && total > 0 && total === items.length
    && items.length === input.length && validAmount(source.subtotal) && validAmount(source.discount_total);
  const a = shipping ? source.delivery_address : null;
  const buyer = source.buyer;
  return {
    customer_name: text(source.customer_name, 200),
    buyer: buyer ? { name: text(buyer.name, 200), phone: text(buyer.phone, 80), email: text(buyer.email, 254) } : null,
    delivery_address: a ? { recipient_name: text(a.recipient_name, 200), address_line1: text(a.address_line1, 500),
      address_line2: text(a.address_line2, 500), district: text(a.district, 120), city: text(a.city, 120),
      postal_code: text(a.postal_code, 40), country_code: text(a.country_code, 2), note: text(a.note, 2000) } : null,
    subtotal: source.subtotal, discount_total: source.discount_total,
    note: text(source.note, 4000), items, items_total_count: total, items_complete: complete,
    available_actions: complete && Array.isArray(source.available_actions) ? source.available_actions.filter((action, i, list) =>
      list.indexOf(action) === i && ((action === "commerce_order_confirm" && permissions.has("commerce_order.confirm"))
        || (action === "commerce_order_cancel" && permissions.has("commerce_order.cancel")))) : []
  } satisfies AndroidCommerceOrderDetails;
}

/** The same allowlist protects capability withdrawal and LAN per-device replies. */
export function projectAndroidCompanion(
  commerceSource: AndroidCommerceSnapshot | undefined,
  marketingSource: AndroidMarketingSnapshot | undefined,
  capabilities: Iterable<BusinessCapability>,
  granted: Iterable<AndroidPermission> = ANDROID_PERMISSIONS
): { commerce: AndroidCommerceSnapshot; marketing: AndroidMarketingSnapshot } {
  const enabled = new Set(capabilities);
  const permissions = new Set(androidEffectivePermissions(granted, enabled));
  const commerce = emptyAndroidCommerceSnapshot();
  const marketing = emptyAndroidMarketingSnapshot();
  const source = commerceSource ?? commerce;
  const contactAllowed = permissions.has("customer.view") || permissions.has("dealer.view");
  const sourceAllowed = (value: AndroidCommerceOrderSource, dealerOrder = false) =>
    ["desktop", "other", "web-online-sales", "web-dealer"].includes(value)
    && (value !== "web-online-sales" || permissions.has("online_sales.view"))
    && ((value !== "web-dealer" && !dealerOrder) || enabled.has(C.WHOLESALE));
  if (permissions.has("commerce_order.view")) {
    const selected = source.orders.filter(r => sourceAllowed(r.source, r.dealer_order === true) && id(r.id) && orderStatuses.includes(r.status))
      .slice(0, ANDROID_COMPANION_LIMITS.orders);
    commerce.orders = selected.map(r => ({ id: id(r.id), customer_id: contactAllowed ? id(r.customer_id ?? "") : "", status: r.status, source: r.source,
        total: Number.isFinite(r.total) && r.total >= 0 ? r.total : 0,
        currency: /^[A-Z]{3}$/.test(r.currency) ? r.currency : "TRY",
        delivery_method: r.delivery_method === "shipping" ? "shipping" : "pickup",
        placed_at: time(r.placed_at), updated_at: time(r.updated_at), ...(r.dealer_order === true ? { dealer_order: true } : {}) }));
    let remainingItems = ANDROID_COMPANION_LIMITS.totalItems as number;
    let remainingBytes = ANDROID_COMPANION_LIMITS.detailBytes;
    for (const [index, order] of commerce.orders.entries()) {
      const details = selected[index]?.details;
      if (!details) continue;
      const projected = projectOrderDetails(details, order.delivery_method === "shipping", permissions, remainingItems);
      if (!projected) continue;
      const bytes = new TextEncoder().encode(JSON.stringify(projected)).byteLength;
      if (bytes > remainingBytes) continue;
      order.details = projected;
      remainingItems -= projected.items.length; remainingBytes -= bytes;
    }
    commerce.order_counts = source.order_counts.filter(r => sourceAllowed(r.source) && orderStatuses.includes(r.status))
      .slice(0, 16).map(r => ({ source: r.source, status: r.status,
        count: Math.max(0, count(r.count) - (!enabled.has(C.WHOLESALE) ? count(r.dealer_count ?? 0) : 0)),
        ...(enabled.has(C.WHOLESALE) && r.dealer_count !== undefined ? { dealer_count: count(r.dealer_count) } : {}) }));
    if (permissions.has("shipment.view")) {
      const orderIds = new Set(commerce.orders.map(r => r.id));
      commerce.shipments = source.shipments.filter(r => id(r.id) && orderIds.has(r.order_id) && shipmentStatuses.includes(r.status))
        .slice(0, ANDROID_COMPANION_LIMITS.shipments).map(r => ({ id: id(r.id), order_id: id(r.order_id), status: r.status,
          tracking_available: r.tracking_available === true, updated_at: time(r.updated_at),
          ...(r.tracking_number !== undefined ? { provider_name: text(r.provider_name, 120), tracking_number: text(r.tracking_number, 120),
            tracking_url: trackingUrl(r.tracking_url), note: text(r.note, 2000) } : {}) }));
      commerce.shipment_counts = source.shipment_counts.filter(r => sourceAllowed(r.source)).slice(0, 4)
        .map(r => ({ source: r.source, pending: Math.max(0, count(r.pending) - (!enabled.has(C.WHOLESALE) ? count(r.dealer_pending ?? 0) : 0)),
          ...(enabled.has(C.WHOLESALE) && r.dealer_pending !== undefined ? { dealer_pending: count(r.dealer_pending) } : {}) }));
    }
    if (permissions.has("online_sales.view")) {
      commerce.online_catalog = { desired_product_count: count(source.online_catalog.desired_product_count),
        pending: source.online_catalog.pending === true, updated_at: time(source.online_catalog.updated_at) };
    }
  }
  const customerIds = new Set(commerce.orders.map(r => r.customer_id).filter(Boolean));
  if (contactAllowed) {
    commerce.customers = (source.customers ?? []).filter(r => id(r.id) && customerIds.has(r.id)).slice(0, 100)
      .map(r => ({ id: id(r.id), full_name: text(r.full_name, 200), phone: text(r.phone, 80), email: text(r.email, 254), updated_at: time(r.updated_at) }));
  }
  if (permissions.has("dealer.view")) {
    commerce.customer_profiles = source.customer_profiles.filter(r => id(r.customer_id)
      && customerIds.has(r.customer_id)
      && ["candidate", "active", "inactive"].includes(r.dealer_status) && ["retail", "dealer_a", "dealer_b"].includes(r.price_group))
      .slice(0, ANDROID_COMPANION_LIMITS.profiles).map(r => ({ customer_id: id(r.customer_id), dealer_status: r.dealer_status,
        price_group: r.price_group, updated_at: time(r.updated_at),
        ...(r.company_name !== undefined ? { company_name: text(r.company_name, 200), authorized_person: text(r.authorized_person, 200) } : {}) }));
  }
  if (permissions.has("marketing.status.view")) {
    const m = marketingSource ?? marketing;
    const campaignAllowed = enabled.has(C.MESSAGING_CAMPAIGNS) && enabled.has(C.CUSTOMERS);
    marketing.publications = m.publications.filter(r => id(r.id) && ["website", "instagram"].includes(r.channel)
      && ["draft", "publishing", "published", "unpublished", "failed"].includes(r.status))
      .slice(0, ANDROID_COMPANION_LIMITS.publications).map(r => ({ id: id(r.id), channel: r.channel, status: r.status,
        revision: count(r.revision), published_revision: count(r.published_revision), desired_published: r.desired_published === true,
        updated_at: time(r.updated_at) }));
    marketing.schedules = m.schedules.filter(r => id(r.id) && channels.includes(r.channel)
      && ["active", "paused", "completed", "cancelled"].includes(r.status)
      && ["", "pending", "claimed", "succeeded", "skipped", "failed"].includes(r.last_execution_status)
      && ((r.target_type === "public_publication" && ["website", "instagram"].includes(r.channel))
        || (r.target_type === "audience_campaign" && campaignAllowed && ["whatsapp", "sms"].includes(r.channel))))
      .slice(0, ANDROID_COMPANION_LIMITS.schedules).map(r => ({ id: id(r.id), channel: r.channel, target_type: r.target_type,
        status: r.status, next_run_at: time(r.next_run_at), last_execution_status: r.last_execution_status, updated_at: time(r.updated_at) }));
    marketing.campaigns = campaignAllowed ? m.campaigns.filter(r => id(r.id) && ["whatsapp", "sms"].includes(r.channel)
      && ["draft", "prepared", "running", "paused", "cancelled", "completed"].includes(r.status))
      .slice(0, ANDROID_COMPANION_LIMITS.campaigns).map(r => ({ id: id(r.id), channel: r.channel, status: r.status,
        pending_count: count(r.pending_count), failed_count: count(r.failed_count), updated_at: time(r.updated_at) })) : [];
  }
  return { commerce, marketing };
}

export function androidCompanionCounters(commerce: AndroidCommerceSnapshot, marketing: AndroidMarketingSnapshot) {
  return {
    pending_commerce_orders: commerce.order_counts.filter(r => r.status === "placed").reduce((sum, r) => sum + r.count, 0),
    open_commerce_orders: commerce.order_counts.filter(r => ["placed", "confirmed"].includes(r.status)).reduce((sum, r) => sum + r.count, 0),
    pending_shipments: commerce.shipment_counts.reduce((sum, r) => sum + r.pending, 0),
    online_catalog_pending: commerce.online_catalog.pending ? 1 : 0,
    recent_failed_marketing_operations: marketing.publications.filter(r => r.status === "failed").length
      + marketing.schedules.filter(r => r.last_execution_status === "failed").length
      + marketing.campaigns.filter(r => r.failed_count > 0).length
  };
}
