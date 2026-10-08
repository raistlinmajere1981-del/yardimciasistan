import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { saveSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";
const require = createRequire(import.meta.url);
const commerce = require("../apps/desktop-app/dist-electron/commerce-store.js");
const { BUSINESS_CAPABILITIES: C, toggleBusinessProfileOption } = require("../packages/shared/dist");
const { deleteCatalogProduct } = require("../apps/desktop-app/dist-electron/commerce-catalog-presentation-store.js");
const ok = result => { assert.equal(result.ok, true, result.message); return result; };

const fixture = createTemporaryDesktopDatabase("menu-product-identity-");
const { database } = fixture;
try {
  database.initialize();
  ok(database.saveInitialSetup(createSmokeSetupInput({ profileId: "restaurant", businessName: "Canonical menu", phone: "+905550001111", whatsapp: "+905550001111", syncSecret: "canonical-test-secret", servicePreferences: { android: true } })));
  ok(saveSmokeBusinessLayout(database.databasePath, { tableCategories: [{ name: "Salon", tableCount: 1 }] }));
  const db = new DatabaseSync(database.databasePath);
  try {
    for (const table of ["menu_items", "menu_stock_movements"]) assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(table), undefined);
    const category = ok(database.saveMenuCategory({ name: "Drinks", description: "", is_active: true, sort_order: 10 })).savedId;
    const entryInput = { category_id: category, price_override: null, is_available: true, is_featured: false,
      allergens: [], tags: [], stock_consumption_quantity: 0.25, hide_when_out_of_stock: true, sort_order: 10 };
    const creationCounts = () => ["catalog_products", "menu_product_entries"].map(table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
    const beforeCreationFailure = creationCounts();
    db.exec("CREATE TRIGGER test_desktop_menu_entry_failure BEFORE INSERT ON menu_product_entries BEGIN SELECT RAISE(ABORT, 'injected menu entry failure'); END;");
    assert.equal(database.saveMenuProductEntry({ ...entryInput, product: { name: "Failed desktop product", salePrice: 42 } }).ok, false);
    assert.deepEqual(creationCounts(), beforeCreationFailure, "Desktop Product + Menu creation must roll back both rows on entry insertion failure.");
    db.exec("DROP TRIGGER test_desktop_menu_entry_failure");
    const created = ok(database.saveMenuProductEntry({ ...entryInput, product: { name: "Shared drink", salePrice: 20, unit: "l", trackInventory: true, minimumQuantity: 2 } }));
    const entryId = created.savedId;
    const projection = () => database.getPublishedMenu().items.find(entry => entry.id === entryId);
    const productId = projection().product_id;
    const editProduct = patch => commerce.saveCatalogProduct(database.databasePath,
      { ...commerce.listCatalogProducts(database.databasePath).find(product => product.id === productId), ...patch });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM catalog_products").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM menu_product_entries").get().n, 1);
    assert.equal(projection().category_id, category);
    assert.equal(db.prepare("SELECT price_override FROM menu_product_entries WHERE id = ?").get(entryId).price_override, null);
    assert.equal(projection().price, 20);
    assert.equal(projection().stock_min_quantity, 2);
    assert.equal(database.saveMenuProductEntry({ ...entryInput, product_id: productId }).ok, false);
    const countBefore = db.prepare("SELECT COUNT(*) AS n FROM catalog_products").get().n;
    const entriesBeforeInvalidPrice = db.prepare("SELECT COUNT(*) AS n FROM menu_product_entries").get().n;
    assert.equal(database.saveMenuProductEntry({ ...entryInput, price_override: -1, product: { name: "Must roll back", salePrice: 1 } }).ok, false);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM catalog_products").get().n, countBefore);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM menu_product_entries").get().n, entriesBeforeInvalidPrice);

    commerce.setInventoryCount(database.databasePath, { productId, countedQuantity: 10 });
    const stock = () => commerce.getInventoryBalance(database.databasePath, productId).quantity;
    assert.equal(projection().stock_quantity, 10);
    editProduct({ name: "Renamed", salePrice: 30 });
    assert.equal(projection().name, "Renamed"); assert.equal(projection().price, 30);
    assert.equal(projection().stock_unit, "l");
    ok(database.saveMenuProductEntry({ ...entryInput, id: entryId, product_id: productId, price_override: 25 }));
    assert.equal(projection().price, 25);
    editProduct({ name: "Renamed", salePrice: 40 });
    assert.equal(projection().price, 25); // override is channel-owned

    const tableId = db.prepare("SELECT id FROM tables LIMIT 1").get().id;
    const order = ok(database.openTableOrder(tableId)).order;
    const added = ok(database.addTableOrderItem({ orderId: order.id, menuEntryId: entryId, quantity: 2 })).order.items[0];
    assert.equal(added.productId, productId); assert.equal(added.menuEntryId, entryId); assert.equal(stock(), 9.5);
    const noOpMovements = commerce.listInventoryMovements(database.databasePath, { productId }).length;
    ok(database.updateTableOrderItemQuantity({ itemId: added.id, quantity: 2 }));
    assert.equal(commerce.listInventoryMovements(database.databasePath, { productId }).length, noOpMovements);
    ok(database.saveMenuProductEntry({ ...entryInput, id: entryId, product_id: productId, price_override: null, stock_consumption_quantity: 2 }));
    editProduct({ name: "Later identity", salePrice: 80 });
    ok(database.updateTableOrderItemQuantity({ itemId: added.id, quantity: 3 }));
    assert.equal(stock(), 9.25); // frozen 0.25, not current 2
    const historic = database.getActiveTableOrder(tableId).items[0];
    assert.equal(historic.productName, "Renamed"); assert.equal(historic.unitPrice, 25);
    assert.throws(() => editProduct({ unit: "kg" }), /stok|adisyon|hesap/i);
    assert.throws(() => editProduct({ trackInventory: false }), /stok|adisyon|hesap/i);
    assert.throws(() => deleteCatalogProduct(database.databasePath, productId), /adisyon|hesap/i);
    editProduct({ isActive: false });
    assert.equal(database.getPublishedMenu().items.some(entry => entry.id === entryId), false);
    assert.equal(database.getDashboardData().menu.items.find(entry => entry.id === entryId).product_is_active, false);
    assert.equal(database.getQrMenuPublication().items.some(entry => entry.id === entryId), false);
    assert.equal(database.addTableOrderItem({ orderId: order.id, menuEntryId: entryId, quantity: 1 }).ok, false);
    editProduct({ isActive: true });
    ok(database.deleteMenuProductEntry(entryId));
    assert.equal(commerce.listCatalogProducts(database.databasePath).find(product => product.id === productId).id, productId);
    assert.ok(database.getTrackedStockProducts().find(product => product.product_id === productId && product.menu_entry_id === ""));
    assert.ok(database.getMenuProductCandidates().find(product => product.product_id === productId));
    ok(database.removeTableOrderItem(added.id)); assert.equal(stock(), 10);
    ok(database.closeTableOrder({ orderId: order.id, status: "cancelled" })); assert.equal(stock(), 10);

    const relinked = ok(database.saveMenuProductEntry({ ...entryInput, product_id: productId })).savedId;
    const cancelled = ok(database.openTableOrder(tableId)).order;
    ok(database.addTableOrderItem({ orderId: cancelled.id, menuEntryId: relinked, quantity: 4 }));
    assert.equal(stock(), 9);
    ok(database.closeTableOrder({ orderId: cancelled.id, status: "cancelled" })); assert.equal(stock(), 10);
    assert.equal(database.closeTableOrder({ orderId: cancelled.id, status: "cancelled" }).ok, false); assert.equal(stock(), 10);
    const paid = ok(database.openTableOrder(tableId)).order;
    ok(database.addTableOrderItem({ orderId: paid.id, menuEntryId: relinked, quantity: 4 }));
    ok(database.closeTableOrder({ orderId: paid.id, status: "paid" })); assert.equal(stock(), 9);
    const failed = ok(database.openTableOrder(tableId)).order;
    const movements = commerce.listInventoryMovements(database.databasePath, { productId }).length;
    assert.equal(database.addTableOrderItem({ orderId: failed.id, menuEntryId: relinked, quantity: 999 }).ok, false);
    assert.equal(stock(), 9); assert.equal(commerce.listInventoryMovements(database.databasePath, { productId }).length, movements);
    ok(database.closeTableOrder({ orderId: failed.id, status: "cancelled" }));

    const current = database.getSetupData();
    ok(database.saveInitialSetup(createSmokeSetupInput({ ...current,
      profileOptions: toggleBusinessProfileOption(current.profileId, current.profileOptions, C.ONLINE_SALES, true) })));
    database.saveCommerceProductPublication({ productId, isPublished: true, publicTitle: "Shared", publicDescription: "", publicImageUrl: "", sortOrder: 1 });
    const online = database.createCommerceOnlineCatalog().products.find(product => product.productId === productId);
    assert.ok(online); assert.equal(online.price, 80); assert.equal(online.unit, "l");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM catalog_products").get().n, 1);
    ok(database.deleteMenuProductEntry(relinked));
    assert.equal(db.prepare("SELECT is_published FROM commerce_product_publications WHERE product_id = ?").get(productId).is_published, 1);
    deleteCatalogProduct(database.databasePath, productId);
    assert.equal(db.prepare("SELECT is_published FROM commerce_product_publications WHERE product_id = ?").get(productId).is_published, 0);
    assert.equal(database.getPublishedMenu().items.length, 0);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);

    // Android create/link/edit/removal uses the same current-schema operation and receipt.
    const now = new Date().toISOString();
    database.upsertAndroidDeviceSightings([{ device_id: "canonical-phone", device_name: "Canonical phone", app_version: "test", first_seen_at: now, last_seen_at: now }]);
    ok(database.setAndroidDeviceActive("canonical-phone", true));
    ok(database.setAndroidDeviceRole("canonical-phone", "admin"));
    const phoneAction = (id, action_type, payload) => ({ id, action_type, payload, created_at: now, device_id: "canonical-phone", device_name: "Canonical phone", app_version: "test", last_seen_at: now, status: "pending", error_message: "" });
    const phoneCreate = phoneAction("canonical_phone_create", "menu_entry_create", { ...entryInput, product: { name: "Phone product", salePrice: 12, onlineSalesPublished: false } });
    ok(database.applyAndroidAction(phoneCreate));
    assert.equal(ok(database.applyAndroidAction(phoneCreate)).alreadyApplied, true);
    const phoneEntry = database.getPublishedMenu().items.find(entry => entry.name === "Phone product");
    assert.ok(phoneEntry);
    assert.equal(database.getMenuProductCandidates().some(product => product.product_id === phoneEntry.product_id), false);
    ok(database.applyAndroidAction(phoneAction("canonical_phone_edit", "menu_entry_update", { ...entryInput, menu_entry_id: phoneEntry.id, price_override: 15, expected_updated_at: phoneEntry.updated_at })));
    assert.equal(database.getPublishedMenu().items.find(entry => entry.id === phoneEntry.id).price, 15);
    ok(database.applyAndroidAction(phoneAction("canonical_phone_remove", "menu_item_delete", { menu_entry_id: phoneEntry.id })));
    assert.ok(commerce.listCatalogProducts(database.databasePath).find(product => product.id === phoneEntry.product_id));
    const phoneLink = phoneAction("canonical_phone_link", "menu_entry_create", { ...entryInput, product_id: phoneEntry.product_id });
    ok(database.applyAndroidAction(phoneLink));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM catalog_products WHERE id = ?").get(phoneEntry.product_id).n, 1);
    const productCount = db.prepare("SELECT COUNT(*) AS n FROM catalog_products").get().n;
    db.exec("CREATE TRIGGER test_menu_entry_commit_failure BEFORE INSERT ON menu_product_entries BEGIN SELECT RAISE(ABORT, 'injected menu entry failure'); END;");
    assert.equal(database.applyAndroidAction(phoneAction("canonical_phone_atomic", "menu_entry_create", { ...entryInput, product: { name: "Atomic failure", salePrice: 1 } })).ok, false);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM catalog_products").get().n, productCount);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM android_action_receipts WHERE id = 'canonical_phone_atomic'").get().n, 0);
    db.exec("DROP TRIGGER test_menu_entry_commit_failure");

    // Menu reads the canonical immutable archive; no per-channel image copy is created.
    const assetPath = "assets/products/canonical_image/image.png";
    mkdirSync(join(dirname(database.databasePath), "assets/products/canonical_image"), { recursive: true });
    writeFileSync(join(dirname(database.databasePath), assetPath), Buffer.from("iVBORw0KGgo=", "base64"));
    const withImage = ok(database.saveMenuProductEntry({ ...entryInput, product: { name: "Image product", salePrice: 1, onlineSalesPublished: false } },
      { productId: "canonical_image", assetPath, sourceUrl: "", license: "" }));
    assert.equal(database.getPublishedMenu().items.find(entry => entry.id === withImage.savedId).image_url, "data:image/png;base64,iVBORw0KGgo=");

    // QR uses archived media; Online Sales retains its existing public-HTTPS-only policy.
    const imageProductId = "canonical_image";
    database.saveCommerceProductPublication({ productId: imageProductId, isPublished: true });
    assert.equal(database.createCommerceOnlineCatalog().products.find(product => product.productId === imageProductId).imageUrl, "");
    for (const sourceUrl of ["https://images.example.com/image.png?token=private", "https://user:password@images.example.com/image.png", "file:///private/image.png"]) {
      db.prepare("UPDATE catalog_products SET image_asset_path = '', image_source_url = ? WHERE id = ?").run(sourceUrl, imageProductId);
      assert.equal(database.getPublishedMenu().items.find(entry => entry.id === withImage.savedId).image_url, "");
    }
    db.prepare("UPDATE catalog_products SET image_asset_path = ?, image_source_url = '' WHERE id = ?").run(assetPath, imageProductId);
    const compiledMaintenance = new URL("../apps/desktop-app/dist-electron/data-maintenance.js", import.meta.url);
    const maintenanceRequire = createRequire(compiledMaintenance), maintenance = {};
    runInNewContext(readFileSync(compiledMaintenance, "utf8"), { exports: maintenance, Buffer, process,
      require: name => name === "electron" ? { app: { isPackaged: true, getAppPath: () => resolve("apps/desktop-app"), getVersion: () => "test" } }
        : name === "./desktop-logger" ? { desktopLog: { info() {}, warn() {}, error() {} } } : maintenanceRequire(name)
    });
    const backup = maintenance.createUpdateSafetyBackup(database.userDataPath, "identity-test");
    assert.equal(backup.imageCount, 1);
    const manifest = JSON.parse(readFileSync(join(backup.folderPath, "backup.json"), "utf8"));
    assert.equal(manifest.qrMenuImages.files[0].menuItemId, withImage.savedId);
    assert.deepEqual(readFileSync(join(backup.folderPath, "assets/products/canonical_image/image.png")), readFileSync(join(dirname(database.databasePath), assetPath)));

    const beforeStockOff = database.getSetupData();
    ok(database.saveInitialSetup(createSmokeSetupInput({ ...beforeStockOff,
      profileOptions: toggleBusinessProfileOption(beforeStockOff.profileId, beforeStockOff.profileOptions, C.INVENTORY, false) })));
    const noStockInput = { ...entryInput, stock_consumption_quantity: 1, hide_when_out_of_stock: false };
    assert.equal(database.applyAndroidAction(phoneAction("canonical_no_inventory_default", "menu_entry_create", { ...noStockInput, product: { name: "Unauthorized tracking", salePrice: 1 } })).ok, false);
    ok(database.applyAndroidAction(phoneAction("canonical_no_inventory_untracked", "menu_entry_create", { ...noStockInput, product: { name: "Untracked phone product", salePrice: 1, trackInventory: false } })));
  } finally { db.close(); }
} finally { fixture.cleanup(); }
console.log("menu-product-identity-smoke-ok");
