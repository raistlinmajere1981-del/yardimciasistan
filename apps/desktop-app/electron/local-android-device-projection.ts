import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { projectAndroidCompanion, androidCompanionCounters, androidEffectivePermissions } from "@yardimci-asistan/sync-core";
import type {
  AndroidFinanceSnapshot,
  AndroidOperationsSnapshot,
  AndroidSnapshotPermissionProfile,
  PublishedQrMenu
} from "@yardimci-asistan/sync-core";
import { emptyAndroidMarketSnapshot } from "./market-android-snapshot.js";
import { projectAndroidKbsForDevice } from "./android-kbs-projection.js";

const EMPTY_PROFILE: AndroidSnapshotPermissionProfile = {
  role: "staff",
  is_active: false,
  permissions: []
};

function menuForPermissions(menu: PublishedQrMenu, allowed: boolean, stockAllowed: boolean): PublishedQrMenu {
  if (!allowed) return { categories: [], items: [], updated_at: menu.updated_at };
  if (stockAllowed) return menu;
  return { ...menu, items: menu.items.map(item => ({ ...item, stock_quantity: null,
    stock_min_quantity: null, stock_note: null, stock_unit: "piece", stock_consumption_quantity: 1,
    hide_when_out_of_stock: false })) };
}

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
  const companion = projectAndroidCompanion(undefined, undefined, []);
  const menuUpdatedAt = source.menu.updated_at;
  const adminMenuUpdatedAt = source.admin_menu.updated_at;
  return {
    ...source,
    ...companion,
    kbs: null,
    voice: { stt_available: false },
    summary: { ...emptySummary(), ...androidCompanionCounters(companion.commerce, companion.marketing) },
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
        permissions: androidEffectivePermissions(storedProfile.permissions, source.business_capabilities)
      }
    : { ...EMPTY_PROFILE, permissions: [] };

  if (!deviceId || !profile.is_active) {
    return inactiveSnapshot(source, deviceId || "unknown", profile);
  }

  const companion = projectAndroidCompanion(source.commerce, source.marketing, source.business_capabilities, profile.permissions);
  const permissions = new Set(profile.permissions);
  const customerManagementAllowed = profile.role === "admin" && permissions.has("customer.manage");
  // Sales staff need a picker identity, not the full private customer record.
  // The server still rechecks real customer ownership and permission on write.
  const paidSaleCustomerPickerAllowed = permissions.has("market.product.view")
    && permissions.has("market.sale.complete") && permissions.has("customer.view");
  const roomFolioAllowed = permissions.has("room_folio.view");
  const financeAllowed = permissions.has("finance.view");
  const menuAllowed = permissions.has("menu.view");
  const stockAllowed = permissions.has("menu.stock_view");
  const reportsAllowed = profile.role === "admin" && source.business_capabilities.includes(BUSINESS_CAPABILITIES.REPORTS);

  const market = emptyAndroidMarketSnapshot();
  if (permissions.has("market.summary.view")) {
    market.summary = source.market.summary;
  }
  if (permissions.has("market.product.view")) {
    market.products = source.market.products;
    market.primary_location_id = source.market.primary_location_id ?? "";
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
  if (permissions.has("customer_credit.view")) {
    market.customer_credit_accounts = (source.market.customer_credit_accounts ?? []).slice(0, 300).map(account => ({
      customer_id: account.customer_id, full_name: account.full_name,
      balances: account.balances.slice(0, 10).map(balance => ({ currency: balance.currency, amount_minor: balance.amount_minor })),
      entries: account.entries.slice(0, 10).map(entry => ({ direction: entry.direction, entry_type: entry.entry_type,
        amount_minor: entry.amount_minor, currency: entry.currency, payment_method: entry.payment_method, occurred_at: entry.occurred_at }))
    }));
  }

  return {
    ...source,
    ...companion,
    voice: { stt_available: permissions.has("voice.dictation") && source.voice?.stt_available === true },
    summary: { ...source.summary, ...androidCompanionCounters(companion.commerce, companion.marketing),
      active_menu_categories: menuAllowed ? source.summary.active_menu_categories : 0,
      available_menu_items: menuAllowed ? source.summary.available_menu_items : 0 },
    customers: customerManagementAllowed
      ? source.customers.map(customer => ({ ...customer, identity_number: "", document_serial_number: "" }))
      : paidSaleCustomerPickerAllowed
        ? source.customers.map(customer => ({
            id: customer.id,
            full_name: customer.full_name,
            phone: "", email: "", notes: "", identity_type: "", identity_number: "",
            nationality: "", birth_date: "", gender: "", document_serial_number: "",
            document_expiry_date: "", birth_place: "", mother_name: "", father_name: "",
            issuing_authority: "", address: "", request_count: 0, reservation_count: 0,
            stay_count: 0, updated_at: ""
          }))
        : [],
    menu_product_candidates: permissions.has("menu.edit") ? source.menu_product_candidates ?? [] : [],
    customer_room_stays: customerManagementAllowed ? source.customer_room_stays : [],
    room_folios: roomFolioAllowed ? source.room_folios : [],
    menu: menuForPermissions(source.menu, menuAllowed, stockAllowed),
    admin_menu: menuForPermissions(source.admin_menu, permissions.has("menu.edit") || permissions.has("menu.delete"), stockAllowed),
    trackedStockItems: stockAllowed ? source.trackedStockItems : [],
    appliedStockImageHashes: permissions.has("menu.stock_update") ? source.appliedStockImageHashes : [],
    androidPermissions: {
      [deviceId]: profile
    },
    finance: financeAllowed ? source.finance : emptyFinance(source.finance),
    reports: reportsAllowed ? source.reports : {} as AndroidOperationsSnapshot["reports"],
    market,
    kbs: projectAndroidKbsForDevice(source.kbs, source.business_capabilities, profile)
  };
}
