import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
const require = createRequire(import.meta.url);
const { saveCatalogProduct, setInventoryCount, listInventoryMovements } = require("../../apps/desktop-app/dist-electron/commerce-store.js");

/** Test fixture shorthand only: production has separate product, channel and inventory commands. */
export function saveMenuProductFixture(database, input) {
  const existing = input.id ? database.getPublishedMenu().items.find(entry => entry.id === input.id) : undefined;
  const product = {
    ...(existing ? { id: existing.product_id } : {}),
    name: input.name, description: input.description, salePrice: input.price, currency: input.currency,
    imageSourceUrl: input.image_url, unit: input.stock_unit ?? existing?.stock_unit ?? "piece",
    trackInventory: input.stock_quantity === undefined ? existing?.stock_quantity != null : input.stock_quantity !== null,
    minimumQuantity: input.stock_min_quantity ?? 0
  };
  if (existing) saveCatalogProduct(database.databasePath, product);
  const result = database.saveMenuProductEntry({
    ...(existing ? { id: existing.id, product_id: existing.product_id } : { product }),
    category_id: input.category_id, price_override: null,
    is_available: input.is_available, is_featured: input.is_featured, allergens: input.allergens ?? [], tags: input.tags ?? [],
    sort_order: input.sort_order, stock_consumption_quantity: input.stock_consumption_quantity ?? 1,
    hide_when_out_of_stock: input.hide_when_out_of_stock ?? false
  });
  if (result.ok && input.id && !existing) {
    const db = new DatabaseSync(database.databasePath);
    try { db.exec("PRAGMA foreign_keys = ON"); db.prepare("UPDATE menu_product_entries SET id = ? WHERE id = ?").run(input.id, result.savedId); }
    finally { db.close(); }
    result.savedId = input.id;
    result.dashboardData = database.getDashboardData();
  }
  if (result.ok && input.stock_quantity != null) {
    setInventoryCount(database.databasePath, { productId: fixtureProductId(database, result.savedId), countedQuantity: input.stock_quantity,
      note: input.stock_note ?? "Test fixture count", referenceType: "test_fixture" });
    result.dashboardData = database.getDashboardData();
  }
  return result;
}

export function fixtureProductId(database, entryId) {
  return database.getPublishedMenu().items.find(entry => entry.id === entryId)?.product_id;
}

export function fixtureInventoryMovements(database, entryId) {
  const productId = fixtureProductId(database, entryId);
  const db = new DatabaseSync(database.databasePath);
  try {
    if (!db.prepare("SELECT track_inventory FROM catalog_products WHERE id = ?").get(productId)?.track_inventory) return [];
  } finally { db.close(); }
  return listInventoryMovements(database.databasePath, { productId });
}
