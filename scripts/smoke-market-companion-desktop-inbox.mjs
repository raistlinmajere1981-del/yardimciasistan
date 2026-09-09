import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const {
  marketProductDraftCatalogDefaults
} = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  applyBusinessProfileCapabilities
} = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {
  createMarketCartDraft,
  createMarketProductDraft,
  createRuntimePaidSale,
  listMarketCartDrafts,
  listMarketProductDrafts,
  listRuntimeCatalogCategories,
  loadMarketCartDraftForQuickSale,
  markMarketCartDraftReviewed,
  markMarketProductDraftReviewed,
  saveRuntimeCatalogCategory,
  saveRuntimeCatalogProduct
} = require("../apps/desktop-app/dist-electron/commerce-runtime.js");

const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-market-companion-inbox-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});

try {
  database.initialize();
  const databasePath = database.databasePath;
  applyBusinessProfileCapabilities(databasePath, "market", { preserveUserOverrides: false });
  const sqlite = new DatabaseSync(databasePath);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  try {
    const drinks = saveRuntimeCatalogCategory(databasePath, {
      name: "İçecek Reyonu",
      code: "drinks",
      isActive: true
    });
    saveRuntimeCatalogCategory(databasePath, {
      name: "Kapalı Reyon",
      code: "inactive",
      isActive: false
    });

    const productDraft = createMarketProductDraft(databasePath, {
      barcode: "8690000007311",
      proposedName: "Telefon Kola 330 ml",
      sku: "PHONE-COLA",
      proposedCategory: "  İÇECEK   REYONU ",
      proposedPurchasePrice: 12.5,
      proposedSalePrice: 21.75,
      currency: "TRY",
      unit: "piece",
      note: "Ön rafta denenecek",
      source: "android",
      createdByDevice: "telefon-inbox-1"
    });
    const unmatchedDraft = createMarketProductDraft(databasePath, {
      barcode: "8690000007312",
      proposedName: "Eşleşmeyen Ürün",
      proposedCategory: "Yeni Kategori Aç",
      source: "android",
      createdByDevice: "telefon-inbox-2"
    });

    assert.deepEqual(
      listMarketProductDrafts(databasePath, { status: "pending" }).map((draft) => draft.id).sort(),
      [productDraft.id, unmatchedDraft.id].sort()
    );
    const categoriesBeforeMapping = listRuntimeCatalogCategories(databasePath).length;
    const matchingDefaults = marketProductDraftCatalogDefaults(
      productDraft,
      listRuntimeCatalogCategories(databasePath),
      { inventoryEnabled: true }
    );
    assert.equal(matchingDefaults.categoryId, drinks.id);
    assert.equal(matchingDefaults.name, productDraft.proposedName);
    assert.equal(matchingDefaults.description, "");
    assert.equal(matchingDefaults.noteReference, productDraft.note);
    assert.equal(matchingDefaults.minimumQuantity, 0);
    assert.equal(matchingDefaults.trackInventory, true);
    const unmatchedDefaults = marketProductDraftCatalogDefaults(
      unmatchedDraft,
      listRuntimeCatalogCategories(databasePath),
      { inventoryEnabled: false }
    );
    assert.equal(unmatchedDefaults.categoryId, "");
    assert.equal(unmatchedDefaults.trackInventory, false);
    assert.equal(listRuntimeCatalogCategories(databasePath).length, categoriesBeforeMapping);
    assert.equal(
      listMarketProductDrafts(databasePath, { status: "pending" }).some((draft) => draft.id === productDraft.id),
      true,
      "Loading form defaults must not review a product draft."
    );

    const savedProduct = saveRuntimeCatalogProduct(databasePath, {
      categoryId: matchingDefaults.categoryId,
      name: matchingDefaults.name,
      sku: matchingDefaults.sku,
      barcode: matchingDefaults.barcode,
      description: matchingDefaults.description,
      salePrice: matchingDefaults.salePrice,
      purchasePrice: matchingDefaults.purchasePrice,
      currency: matchingDefaults.currency,
      unit: matchingDefaults.unit,
      minimumQuantity: matchingDefaults.minimumQuantity,
      trackInventory: false,
      isActive: true
    });
    assert.equal(savedProduct.name, productDraft.proposedName);
    assert.equal(markMarketProductDraftReviewed(databasePath, productDraft.id).status, "reviewed");
    assert.equal(markMarketProductDraftReviewed(databasePath, productDraft.id).status, "reviewed");

    const activeCartProduct = saveRuntimeCatalogProduct(databasePath, {
      name: "Güncel Fiyatlı Ürün",
      sku: "CURRENT-PRICE",
      barcode: "8690000007313",
      salePrice: 30,
      purchasePrice: 10,
      trackInventory: false,
      isActive: true
    });
    const laterInactiveProduct = saveRuntimeCatalogProduct(databasePath, {
      name: "Sonradan Pasif Ürün",
      sku: "LATER-INACTIVE",
      barcode: "8690000007314",
      salePrice: 15,
      trackInventory: false,
      isActive: true
    });
    const cartDraft = createMarketCartDraft(databasePath, {
      lines: [
        { productId: activeCartProduct.id, quantity: 2 },
        { productId: laterInactiveProduct.id, quantity: 1 }
      ],
      note: "Telefon hazır sepeti",
      source: "android",
      createdByDevice: "telefon-inbox-1"
    });
    assert.equal(listMarketCartDrafts(databasePath, { status: "pending" }).length, 1);

    sqlite.prepare("UPDATE catalog_products SET sale_price = 47.5, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), activeCartProduct.id);
    sqlite.prepare("UPDATE catalog_products SET is_active = 0, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), laterInactiveProduct.id);
    const beforeLoad = mutationCounts(sqlite);
    const loaded = loadMarketCartDraftForQuickSale(databasePath, cartDraft.draft.id);
    assert.deepEqual(mutationCounts(sqlite), beforeLoad, "Loading a cart draft must be read-only.");
    assert.equal(loaded.draft.status, "pending");
    assert.equal(loaded.items.length, 1);
    assert.equal(loaded.items[0].product.id, activeCartProduct.id);
    assert.equal(loaded.items[0].product.salePrice, 47.5, "Current catalog price must be authoritative.");
    assert.equal(loaded.items[0].quantity, 2);
    assert.equal(loaded.skippedItems.length, 1);
    assert.equal(loaded.skippedItems[0].productName, "Sonradan Pasif Ürün");
    assert.equal(
      listMarketCartDrafts(databasePath, { status: "pending" })[0].draft.id,
      cartDraft.draft.id,
      "Loading Quick Sale must not review the cart draft."
    );

    const sale = createRuntimePaidSale(databasePath, {
      source: "desktop-market-quick-sale",
      paymentMethod: "cash",
      items: loaded.items.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        salePrice: 0
      }))
    });
    assert.equal(sale.subtotal, 95, "Paid sale must re-read the current catalog price.");
    assert.equal(listMarketCartDrafts(databasePath, { status: "pending" }).length, 1);
    assert.equal(markMarketCartDraftReviewed(databasePath, cartDraft.draft.id).status, "reviewed");
    assert.equal(markMarketCartDraftReviewed(databasePath, cartDraft.draft.id).status, "reviewed");

    // UI/runtime availability follows the persisted capability snapshot.
    assert.equal(listMarketProductDrafts(databasePath, { status: "pending" }).length, 1);
    assert.equal(listMarketCartDrafts(databasePath, { status: "reviewed" }).length, 1);
  } finally {
    sqlite.close();
  }

  assertSourceContracts();
} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}

console.log("market-companion-desktop-inbox-smoke-ok");

function mutationCounts(sqlite) {
  return {
    sales: tableCount(sqlite, "commerce_sales"),
    saleItems: tableCount(sqlite, "commerce_sale_items"),
    movements: tableCount(sqlite, "inventory_movements"),
    finance: tableCount(sqlite, "finance_entries")
  };
}

function tableCount(sqlite, table) {
  return Number(sqlite.prepare(`SELECT COUNT(*) AS value FROM ${table}`).get().value ?? 0);
}

function assertSourceContracts() {
  const read = (relativePath) => readFileSync(join(process.cwd(), relativePath), "utf8");
  const page = read("apps/desktop-app/src/pages/MarketPage.tsx");
  const inbox = read("apps/desktop-app/src/components/market/MarketCompanionInboxWorkspace.tsx");
  const products = read("apps/desktop-app/src/components/market/MarketProductsWorkspace.tsx");
  const quickSale = read("apps/desktop-app/src/components/market/MarketQuickSaleWorkspace.tsx");
  const store = read("apps/desktop-app/electron/market-companion-store.ts");

  assert.match(page, /Telefon Taslakları/);
  assert.doesNotMatch(page, /businessType|business_type/);
  assert.match(inbox, /Ürün Kartına Aktar/);
  assert.match(inbox, /Hızlı Satış'a Yükle/);
  assert.match(inbox, /Taslağı Kapat/);
  assert.match(inbox, /yerel masaüstü SQLite/);
  assert.match(products, /marketProductDraftCatalogDefaults/);
  assert.match(products, /Ürün kaydedildi ancak telefon taslağı kapatılamadı\./);
  assert.match(quickSale, /ürünü artık aktif olmadığı için sepete eklenmedi\./);
  assert.match(quickSale, /Satış tamamlandı ancak telefon sepeti kapatılamadı\./);
  assert.match(quickSale, /markCartDraftReviewed/);
  assert.match(store, /product\.sale_price AS product_sale_price/);
  assert.doesNotMatch(store, /loadMarketCartDraftForQuickSaleRecord[\s\S]{0,300}INSERT INTO commerce_sales/);
}
