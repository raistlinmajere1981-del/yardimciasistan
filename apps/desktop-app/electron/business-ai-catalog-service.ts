import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_AI_CATALOG_VERSION,
  BUSINESS_CAPABILITIES,
  hasBusinessCapability,
  selectRelevantBusinessAiCatalogItems,
  type BusinessAiCatalog,
  type BusinessAiCatalogItem
} from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "./database";

const MAX_AI_CATALOG_ITEMS = 600;

export function createBusinessAiCatalog(database: DesktopDatabase): BusinessAiCatalog {
  const enabled = new Set(database.getEnabledBusinessCapabilities());
  const items: BusinessAiCatalogItem[] = [];
  const updatedAtCandidates: string[] = [];

  if (hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.CATALOG)) {
    const market = readCatalogProducts(
      database.databasePath,
      hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.INVENTORY)
    );
    items.push(...market.items);
    updatedAtCandidates.push(...market.updatedAtCandidates);
  }

  if (hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_MENU)) {
    const menu = database.getPublishedMenu();
    const categories = new Map(
      menu.categories
        .filter((category) => category.is_active)
        .map((category) => [category.id, category.name])
    );

    for (const item of menu.items) {
      if (items.length >= MAX_AI_CATALOG_ITEMS) break;
      if (!categories.has(item.category_id)) continue;
      const availableByStock = item.stock_quantity === null
        || !item.hide_when_out_of_stock
        || item.stock_quantity >= item.stock_consumption_quantity;

      items.push({
        id: item.id,
        source: "menu",
        name: item.name.trim(),
        description: item.description.trim().slice(0, 500),
        category: categories.get(item.category_id) ?? "",
        brand: "",
        barcode: "",
        price: Math.max(0, Number(item.price) || 0),
        currency: item.currency || "TRY",
        unit: "piece",
        available: item.is_available && availableByStock,
        featured: item.is_featured,
        tags: [...item.tags].slice(0, 20)
      });
      if (item.updated_at) updatedAtCandidates.push(item.updated_at);
    }
    if (menu.updated_at) updatedAtCandidates.push(menu.updated_at);
  }

  return {
    version: BUSINESS_AI_CATALOG_VERSION,
    updatedAt: updatedAtCandidates.sort().at(-1) ?? "",
    items: items.slice(0, MAX_AI_CATALOG_ITEMS)
  };
}

export function createRelevantBusinessAiCatalogContext(
  database: DesktopDatabase,
  query: string,
  limit = 8
) {
  const catalog = createBusinessAiCatalog(database);
  const matches = selectRelevantBusinessAiCatalogItems(catalog, query, limit);
  return {
    updatedAt: catalog.updatedAt,
    matches: matches.map((item) => ({
      source: item.source,
      name: item.name,
      description: item.description,
      category: item.category,
      brand: item.brand,
      barcode: item.barcode,
      price: item.price,
      currency: item.currency,
      unit: item.unit,
      available: item.available,
      tags: item.tags
    }))
  };
}

function readCatalogProducts(databasePath: string, inventoryEnabled: boolean): {
  items: BusinessAiCatalogItem[];
  updatedAtCandidates: string[];
} {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  database.exec("PRAGMA busy_timeout = 5000;");
  try {
    const businessRow = database.prepare(
      "SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1"
    ).get() as { id?: unknown } | undefined;
    const businessId = text(businessRow?.id);
    if (!businessId) return { items: [], updatedAtCandidates: [] };

    const rows = database.prepare(`
      SELECT
        product.id,
        product.name,
        product.description,
        product.brand,
        product.barcode,
        product.sale_price,
        product.currency,
        product.unit,
        product.track_inventory,
        product.updated_at,
        COALESCE(category.name, '') AS category_name,
        COALESCE(balance.quantity, 0) AS current_quantity,
        COALESCE(balance.updated_at, '') AS inventory_updated_at
      FROM catalog_products AS product
      LEFT JOIN catalog_categories AS category
        ON category.id = product.category_id
        AND category.business_id = product.business_id
        AND category.deleted_at = ''
      LEFT JOIN inventory_locations AS location
        ON location.business_id = product.business_id
        AND location.is_primary = 1
        AND location.is_active = 1
        AND location.deleted_at = ''
      LEFT JOIN inventory_balances AS balance
        ON balance.product_id = product.id
        AND balance.location_id = location.id
      WHERE product.business_id = ?
        AND product.deleted_at = ''
        AND product.is_active = 1
        AND (product.category_id = '' OR COALESCE(category.is_active, 0) = 1)
      ORDER BY product.name COLLATE NOCASE ASC
      LIMIT 500
    `).all(businessId) as Array<Record<string, unknown>>;

    const updatedAtCandidates: string[] = [];
    const items = rows.map((row) => {
      const trackInventory = Number(row.track_inventory ?? 0) === 1;
      const available = !inventoryEnabled || !trackInventory || number(row.current_quantity) > 0;
      const productUpdatedAt = text(row.updated_at);
      const inventoryUpdatedAt = text(row.inventory_updated_at);
      if (productUpdatedAt) updatedAtCandidates.push(productUpdatedAt);
      if (inventoryUpdatedAt) updatedAtCandidates.push(inventoryUpdatedAt);

      return {
        id: text(row.id),
        source: "catalog" as const,
        name: text(row.name),
        description: text(row.description).slice(0, 500),
        category: text(row.category_name),
        brand: text(row.brand),
        barcode: text(row.barcode),
        price: Math.max(0, number(row.sale_price)),
        currency: text(row.currency) || "TRY",
        unit: text(row.unit) || "piece",
        available,
        featured: false,
        tags: []
      };
    });

    return { items, updatedAtCandidates };
  } finally {
    database.close();
  }
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
