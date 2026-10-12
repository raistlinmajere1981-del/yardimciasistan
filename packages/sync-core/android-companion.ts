import type {
  CommerceOrderStatus, CommerceShipmentStatus, CommercePriceGroup, CustomerDealerStatus,
  MarketingChannel, MarketingPublication, MarketingSchedule, MarketingScheduleExecution, MessagingCampaign
} from "@yardimci-asistan/shared";

/** Decision precondition guards even a Desktop status change in the same millisecond. */
export interface AndroidCommerceOrderDecisionPayload {
  order_id: string;
  expected_updated_at: string;
  expected_status: CommerceOrderStatus;
}

/** Safe, bounded operations only. No buyer/contact/address, notes, items or media. */
export interface AndroidCommerceSnapshot {
  orders: Array<{
    id: string; customer_id?: string; status: CommerceOrderStatus; source: AndroidCommerceOrderSource;
    total: number; currency: string; delivery_method: "pickup" | "shipping";
    placed_at: string; updated_at: string;
  }>;
  customer_profiles: Array<{
    customer_id: string; dealer_status: CustomerDealerStatus;
    price_group: CommercePriceGroup; updated_at: string;
  }>;
  shipments: Array<{
    id: string; order_id: string; status: CommerceShipmentStatus;
    tracking_available: boolean; updated_at: string;
  }>;
  /** Complete aggregates, independent of list limits; source permits capability redaction. */
  order_counts: Array<{ source: AndroidCommerceOrderSource; status: CommerceOrderStatus; count: number }>;
  shipment_counts: Array<{ source: AndroidCommerceOrderSource; pending: number }>;
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

export const ANDROID_COMPANION_LIMITS = { orders: 100, profiles: 100, shipments: 100, publications: 50, schedules: 50, campaigns: 50 } as const;

export function emptyAndroidCommerceSnapshot(): AndroidCommerceSnapshot {
  return { orders: [], customer_profiles: [], shipments: [], order_counts: [], shipment_counts: [],
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
  const sourceAllowed = (value: AndroidCommerceOrderSource) =>
    ["desktop", "other", "web-online-sales", "web-dealer"].includes(value)
    && (value !== "web-online-sales" || permissions.has("online_sales.view"))
    && (value !== "web-dealer" || enabled.has(C.WHOLESALE));
  if (permissions.has("commerce_order.view")) {
    commerce.orders = source.orders.filter(r => sourceAllowed(r.source) && id(r.id) && orderStatuses.includes(r.status))
      .slice(0, ANDROID_COMPANION_LIMITS.orders).map(r => ({ id: id(r.id), customer_id: permissions.has("dealer.view") ? id(r.customer_id ?? "") : "", status: r.status, source: r.source,
        total: Number.isFinite(r.total) && r.total >= 0 ? r.total : 0,
        currency: /^[A-Z]{3}$/.test(r.currency) ? r.currency : "TRY",
        delivery_method: r.delivery_method === "shipping" ? "shipping" : "pickup",
        placed_at: time(r.placed_at), updated_at: time(r.updated_at) }));
    commerce.order_counts = source.order_counts.filter(r => sourceAllowed(r.source) && orderStatuses.includes(r.status))
      .slice(0, 16).map(r => ({ source: r.source, status: r.status, count: count(r.count) }));
    if (permissions.has("shipment.view")) {
      const orderIds = new Set(commerce.orders.map(r => r.id));
      commerce.shipments = source.shipments.filter(r => id(r.id) && orderIds.has(r.order_id) && shipmentStatuses.includes(r.status))
        .slice(0, ANDROID_COMPANION_LIMITS.shipments).map(r => ({ id: id(r.id), order_id: id(r.order_id), status: r.status,
          tracking_available: r.tracking_available === true, updated_at: time(r.updated_at) }));
      commerce.shipment_counts = source.shipment_counts.filter(r => sourceAllowed(r.source)).slice(0, 4)
        .map(r => ({ source: r.source, pending: count(r.pending) }));
    }
    if (permissions.has("online_sales.view")) {
      commerce.online_catalog = { desired_product_count: count(source.online_catalog.desired_product_count),
        pending: source.online_catalog.pending === true, updated_at: time(source.online_catalog.updated_at) };
    }
  }
  if (permissions.has("dealer.view")) {
    commerce.customer_profiles = source.customer_profiles.filter(r => id(r.customer_id)
      && ["candidate", "active", "inactive"].includes(r.dealer_status) && ["retail", "dealer_a", "dealer_b"].includes(r.price_group))
      .slice(0, ANDROID_COMPANION_LIMITS.profiles).map(r => ({ customer_id: id(r.customer_id), dealer_status: r.dealer_status,
        price_group: r.price_group, updated_at: time(r.updated_at) }));
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
