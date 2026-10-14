import { DatabaseSync } from "node:sqlite";
import type {
  AndroidMarketCartDraft,
  AndroidMarketSnapshot
} from "@yardimci-asistan/sync-core";
import { listMarketCartDraftRecords } from "./market-companion-store.js";
import { assertCustomerCreditBusinessInTransaction, listCustomerCreditAccounts, getCustomerCreditAccount } from "./customer-credit-runtime.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";

export function emptyAndroidMarketSnapshot(currency = "TRY"): AndroidMarketSnapshot {
  return {
    product_data: {
      enabled: false,
      provider: "open_food_facts",
      auto_search_unknown_barcode: false,
      include_images: false
    },
    summary: {
      today_sale_count: 0,
      today_sales_total: 0,
      currency,
      critical_stock_count: 0,
      recent_stock_adjustments: [],
      recent_receiving_count: 0
    },
    products: [],
    suppliers: [],
    recent_purchases: [],
    cart_drafts: [],
    primary_location_id: "",
    customer_credit_accounts: []
  };
}

/**
 * Reads the complete Market companion source projection. Capability redaction
 * happens in android-capability-projection before publication.
 */
export function createAndroidMarketSnapshotSource(
  databasePath: string,
  today: string
): AndroidMarketSnapshot {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("Market özet tarihi geçersiz.");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  database.exec("PRAGMA busy_timeout = 5000;");
  try {
    const businessId = activeBusinessId(database);
    const productDataRow = database.prepare(`
      SELECT product_data_enabled, product_data_provider,
             product_data_auto_search, product_data_include_images
      FROM settings
      WHERE deleted_at = ''
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    const productData = {
      enabled: Number(productDataRow?.product_data_enabled ?? 0) === 1,
      provider: text(productDataRow?.product_data_provider) || "open_food_facts",
      auto_search_unknown_barcode: Number(productDataRow?.product_data_auto_search ?? 1) === 1,
      include_images: Number(productDataRow?.product_data_include_images ?? 1) === 1
    };
    const products = (database.prepare(`
      SELECT
        products.id,
        products.updated_at,
        products.name,
        products.sku,
        products.barcode,
        products.unit,
        products.sale_price,
        products.currency,
        products.is_active,
        products.track_inventory,
        products.image_source_url,
        products.data_source,
        COALESCE(balance.quantity, 0) AS current_quantity,
        products.minimum_quantity AS minimum_quantity,
        COALESCE(balance.updated_at, '') AS inventory_updated_at
      FROM catalog_products AS products
      LEFT JOIN inventory_locations AS location
        ON location.business_id = products.business_id
        AND location.is_primary = 1
        AND location.is_active = 1
        AND location.deleted_at = ''
      LEFT JOIN inventory_balances AS balance
        ON balance.product_id = products.id
        AND balance.location_id = location.id
      WHERE products.business_id = ? AND products.deleted_at = ''
      ORDER BY products.is_active DESC, products.name COLLATE NOCASE ASC
      LIMIT 500
    `).all(businessId) as Array<Record<string, unknown>>).map((row) => ({
      id: text(row.id),
      name: text(row.name),
      sku: text(row.sku),
      barcode: text(row.barcode),
      unit: text(row.unit) || "piece",
      sale_price: nonNegativeNumber(row.sale_price),
      currency: text(row.currency) || "TRY",
      is_active: Number(row.is_active ?? 0) === 1,
      track_inventory: Number(row.track_inventory ?? 0) === 1,
      image_source_url: text(row.image_source_url),
      data_source: text(row.data_source),
      current_quantity: nonNegativeNumber(row.current_quantity),
      minimum_quantity: nonNegativeNumber(row.minimum_quantity),
      inventory_updated_at: text(row.inventory_updated_at),
      updated_at: text(row.updated_at)
    }));

    const salesRow = database.prepare(`
      SELECT
        COUNT(*) AS sale_count,
        COALESCE(SUM(total), 0) AS sale_total,
        MIN(currency) AS currency,
        COUNT(DISTINCT currency) AS currency_count
      FROM commerce_sales
      WHERE business_id = ?
        AND status IN ('paid', 'credit')
        AND deleted_at = ''
        AND date(closed_at, 'localtime') = ?
    `).get(businessId, today) as Record<string, unknown> | undefined;

    const criticalStockRow = database.prepare(`
      SELECT COUNT(*) AS count
      FROM catalog_products AS products
      LEFT JOIN inventory_locations AS location
        ON location.business_id = products.business_id
        AND location.is_primary = 1
        AND location.is_active = 1
        AND location.deleted_at = ''
      LEFT JOIN inventory_balances AS balance
        ON balance.product_id = products.id
        AND balance.location_id = location.id
      WHERE products.business_id = ?
        AND products.is_active = 1
        AND products.track_inventory = 1
        AND products.deleted_at = ''
        AND COALESCE(balance.quantity, 0) <= products.minimum_quantity
    `).get(businessId) as { count?: unknown } | undefined;

    const recentStockAdjustments = (database.prepare(`
      SELECT
        movement.id,
        movement.product_id,
        products.name AS product_name,
        movement.movement_type,
        movement.quantity_delta,
        movement.quantity_after,
        movement.note,
        movement.created_at
      FROM inventory_movements AS movement
      INNER JOIN catalog_products AS products
        ON products.id = movement.product_id
        AND products.business_id = movement.business_id
      WHERE movement.business_id = ?
        AND movement.movement_type IN ('count', 'adjust')
      ORDER BY movement.created_at DESC, movement.id DESC
      LIMIT 20
    `).all(businessId) as Array<Record<string, unknown>>).map((row) => ({
      id: text(row.id),
      product_id: text(row.product_id),
      product_name: text(row.product_name),
      type: text(row.movement_type) === "adjust" ? "adjust" as const : "count" as const,
      quantity_delta: number(row.quantity_delta),
      quantity_after: nonNegativeNumber(row.quantity_after),
      note: text(row.note),
      created_at: text(row.created_at)
    }));

    const suppliers = (database.prepare(`
      SELECT id, name, is_active
      FROM commerce_suppliers
      WHERE business_id = ? AND deleted_at = ''
      ORDER BY is_active DESC, name COLLATE NOCASE ASC
      LIMIT 300
    `).all(businessId) as Array<Record<string, unknown>>).map((row) => ({
      id: text(row.id),
      name: text(row.name),
      is_active: Number(row.is_active ?? 0) === 1
    }));

    const recentPurchases = (database.prepare(`
      SELECT
        purchase.id,
        purchase.supplier_id,
        COALESCE(supplier.name, '') AS supplier_name,
        purchase.received_at,
        purchase.total,
        purchase.currency,
        COUNT(item.id) AS line_count
      FROM purchase_orders AS purchase
      LEFT JOIN commerce_suppliers AS supplier
        ON supplier.id = purchase.supplier_id
        AND supplier.business_id = purchase.business_id
        AND supplier.deleted_at = ''
      LEFT JOIN purchase_order_items AS item ON item.purchase_order_id = purchase.id
      WHERE purchase.business_id = ?
        AND purchase.status = 'received'
        AND purchase.deleted_at = ''
      GROUP BY purchase.id
      ORDER BY purchase.received_at DESC, purchase.id DESC
      LIMIT 20
    `).all(businessId) as Array<Record<string, unknown>>).map((row) => ({
      id: text(row.id),
      supplier_id: text(row.supplier_id),
      supplier_name: text(row.supplier_name),
      status: "received" as const,
      received_at: text(row.received_at),
      total: nonNegativeNumber(row.total),
      currency: text(row.currency) || "TRY",
      line_count: Math.max(0, Math.trunc(number(row.line_count)))
    }));

    const currency = Number(salesRow?.currency_count ?? 0) <= 1
      ? text(salesRow?.currency) || "TRY"
      : "";
    return {
      product_data: productData,
      summary: {
        today_sale_count: Math.max(0, Math.trunc(number(salesRow?.sale_count))),
        today_sales_total: nonNegativeNumber(salesRow?.sale_total),
        currency,
        critical_stock_count: Math.max(0, Math.trunc(number(criticalStockRow?.count))),
        recent_stock_adjustments: recentStockAdjustments,
        recent_receiving_count: recentPurchases.length
      },
      products,
      suppliers,
      recent_purchases: recentPurchases,
      cart_drafts: cartDrafts(databasePath),
      primary_location_id: text((database.prepare("SELECT id FROM inventory_locations WHERE business_id = ? AND is_primary = 1 AND is_active = 1 AND deleted_at = '' LIMIT 1")
        .get(businessId) as { id?: string } | undefined)?.id),
      customer_credit_accounts: customerCreditAccounts(database, databasePath)
    };
  } finally {
    database.close();
  }
}

function customerCreditAccounts(database: DatabaseSync, databasePath: string) {
  if (!readEnabledBusinessCapabilities(database).includes(C.CUSTOMER_CREDIT)) return [];
  // Profile/dependency ownership remains in the credit runtime, even for private reads.
  try { assertCustomerCreditBusinessInTransaction(database); } catch { return []; }
  return listCustomerCreditAccounts(databasePath, { limit: 300 }).map(({ customer }) => {
    const account = getCustomerCreditAccount(databasePath, customer.id, { entryLimit: 10 });
    return { customer_id: customer.id, full_name: customer.fullName,
      balances: account.balances.map(balance => ({ currency: balance.currency, amount_minor: balance.amountMinor })),
      entries: account.entries.slice(0, 10).map(entry => ({ direction: entry.direction, entry_type: entry.entryType,
        amount_minor: entry.amountMinor, currency: entry.currency, payment_method: entry.paymentMethod, occurred_at: entry.occurredAt })) };
  });
}

function cartDrafts(databasePath: string): AndroidMarketCartDraft[] {
  return listMarketCartDraftRecords(databasePath, { limit: 100 }).map(({ draft, items }) => ({
    id: draft.id,
    status: draft.status,
    source: draft.source,
    created_by_device: draft.createdByDevice,
    note: draft.note,
    lines: items.map((item) => ({
      id: item.id,
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity
    })),
    created_at: draft.createdAt,
    updated_at: draft.updatedAt
  }));
}

function activeBusinessId(database: DatabaseSync): string {
  const row = database.prepare(`
    SELECT id
    FROM business
    WHERE deleted_at = ''
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id?: unknown } | undefined;
  const businessId = text(row?.id);
  if (!businessId) throw new Error("Aktif işletme bulunamadı.");
  return businessId;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function nonNegativeNumber(value: unknown): number {
  return Math.max(0, number(value));
}
