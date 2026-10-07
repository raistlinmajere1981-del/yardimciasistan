import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import type {
  AndroidFinanceSnapshot,
  AndroidOperationsSnapshot,
  AndroidSnapshotPermissionProfile
} from "@yardimci-asistan/sync-core";
import { emptyAndroidMarketSnapshot } from "./market-android-snapshot.js";

const EMPTY_PROFILE: AndroidSnapshotPermissionProfile = {
  role: "staff",
  is_active: false,
  permissions: []
};

function emptyFinance(source: AndroidFinanceSnapshot): AndroidFinanceSnapshot {
  return {
    generated_at: source.generated_at,
    currency: source.currency,
    today_income_minor: 0,
    today_expense_minor: 0,
    today_net_minor: 0,
    outstanding_pension_minor: 0,
    recent_entries: []
  };
}

function emptySummary(): AndroidOperationsSnapshot["summary"] {
  return {
    pending_daily_tasks: 0,
    today_tasks: 0,
    available_rooms: 0,
    total_rooms: 0,
    available_tables: 0,
    occupied_tables: 0,
    bill_waiting_tables: 0,
    active_table_orders: 0,
    pending_reservations: 0,
    prepared_whatsapp_messages: 0,
    waiting_responses: 0,
    active_menu_categories: 0,
    available_menu_items: 0,
    customer_count: 0
  };
}

function inactiveSnapshot(
  source: AndroidOperationsSnapshot,
  deviceId: string,
  profile: AndroidSnapshotPermissionProfile
): AndroidOperationsSnapshot {
  const menuUpdatedAt = source.menu.updated_at;
  const adminMenuUpdatedAt = source.admin_menu.updated_at;
  return {
    ...source,
    summary: emptySummary(),
    daily_tasks: [],
    requests: [],
    customers: [],
    customer_room_stays: [],
    room_folios: [],
    reservations: [],
    rooms: [],
    tables: [],
    menu: { categories: [], items: [], updated_at: menuUpdatedAt },
    admin_menu: { categories: [], items: [], updated_at: adminMenuUpdatedAt },
    menu_product_candidates: [],
    deleted_request_ids: [],
    trackedStockItems: [],
    appliedStockImageHashes: [],
    table_orders: [],
    messages: [],
    androidPermissions: {
      [deviceId]: {
        role: profile.role,
        is_active: false,
        permissions: []
      }
    },
    finance: emptyFinance(source.finance),
    reports: {} as AndroidOperationsSnapshot["reports"],
    market: emptyAndroidMarketSnapshot()
  };
}

export function projectLocalAndroidSnapshotForDevice(
  source: AndroidOperationsSnapshot,
  deviceIdInput: string
): AndroidOperationsSnapshot {
  const deviceId = deviceIdInput.trim();
  const storedProfile = source.androidPermissions[deviceId];
  const profile: AndroidSnapshotPermissionProfile = storedProfile
    ? {
        role: storedProfile.role,
        is_active: storedProfile.is_active,
        permissions: [...storedProfile.permissions]
      }
    : { ...EMPTY_PROFILE, permissions: [] };

  if (!deviceId || !profile.is_active) {
    return inactiveSnapshot(source, deviceId || "unknown", profile);
  }

  const permissions = new Set(profile.permissions);
  const customerManagementAllowed = profile.role === "admin" && permissions.has("customer.manage");
  const roomFolioAllowed = permissions.has("room_folio.view");
  const financeAllowed = permissions.has("finance.view");
  const reportsAllowed = profile.role === "admin" && source.business_capabilities.includes(BUSINESS_CAPABILITIES.REPORTS);

  const market = emptyAndroidMarketSnapshot();
  if (permissions.has("market.summary.view")) {
    market.summary = source.market.summary;
  }
  if (permissions.has("market.product.view")) {
    market.products = source.market.products;
  }
  if (permissions.has("market.product_create")) {
    market.product_data = source.market.product_data;
  }
  if (permissions.has("market.receiving")) {
    market.suppliers = source.market.suppliers;
    market.recent_purchases = source.market.recent_purchases;
  }
  if (permissions.has("market.cart_draft")) {
    market.cart_drafts = source.market.cart_drafts;
  }

  return {
    ...source,
    customers: customerManagementAllowed ? source.customers : [],
    menu_product_candidates: permissions.has("menu.edit") ? source.menu_product_candidates ?? [] : [],
    customer_room_stays: customerManagementAllowed ? source.customer_room_stays : [],
    room_folios: roomFolioAllowed ? source.room_folios : [],
    androidPermissions: {
      [deviceId]: profile
    },
    finance: financeAllowed ? source.finance : emptyFinance(source.finance),
    reports: reportsAllowed ? source.reports : {} as AndroidOperationsSnapshot["reports"],
    market
  };
}
