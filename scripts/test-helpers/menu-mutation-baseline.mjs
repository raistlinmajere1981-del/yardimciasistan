import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const store = require("../../apps/desktop-app/dist-electron/database/menu-store.js");
const images = require("../../apps/desktop-app/dist-electron/product-image-reader.js");

export function verifyMenuMutationBaseline(database, db, entryId, productId, input) {
  const projected = database.getPublishedMenu(true).items.find((entry) => entry.id === entryId);
  const expected = { stock_consumption_quantity: projected.stock_consumption_quantity, hide_when_out_of_stock: projected.hide_when_out_of_stock };
  const product = db.prepare("SELECT business_id,is_active,deleted_at FROM catalog_products WHERE id=?").get(productId);
  const entry = db.prepare("SELECT deleted_at,stock_consumption_quantity FROM menu_product_entries WHERE id=?").get(entryId);
  const business = db.prepare("SELECT * FROM business WHERE id=?").get(product.business_id);
  db.prepare("UPDATE menu_product_entries SET stock_consumption_quantity=5.1234567 WHERE id=?").run(entryId);
  const precisionExpected = database.getPublishedMenu(true).items.find((item) => item.id === entryId).stock_consumption_quantity;
  db.prepare("UPDATE menu_product_entries SET stock_consumption_quantity=? WHERE id=?").run(entry.stock_consumption_quantity, entryId);
  const facadeProjection = database.getPublishedMenu, storeProjection = store.getPublishedMenu, readImage = images.readProductImageAsset;
  let projections = 0, imageReads = 0;
  database.getPublishedMenu = store.getPublishedMenu = () => { projections++; throw new Error("full projection forbidden in baseline lookup"); };
  images.readProductImageAsset = () => { imageReads++; throw new Error("image/base64 read forbidden in baseline lookup"); };
  try {
    assert.deepEqual(database.getMenuEntryMutationBaseline(entryId), expected);
    assert.equal(database.getMenuEntryMutationBaseline(productId), null, "product id cannot substitute for Menu entry id");
    assert.equal(database.getMenuEntryMutationBaseline("missing-entry"), null);
    assert.equal(database.saveMenuProductEntry({ ...input, id: "missing-entry", product_id: productId }).message, "Menü ürünü bulunamadı.");
    assert.equal(database.saveMenuProductEntry({ ...input, product_id: "missing-product" }).message, "Ürün bulunamadı.");
    db.prepare("UPDATE catalog_products SET is_active=0 WHERE id=?").run(productId);
    assert.deepEqual(database.getMenuEntryMutationBaseline(entryId), expected, "inactive products retain the existing editable baseline, without becoming public/active");
    db.prepare("UPDATE catalog_products SET is_active=? WHERE id=?").run(product.is_active, productId);
    db.prepare("UPDATE catalog_products SET deleted_at='fixture' WHERE id=?").run(productId);
    assert.equal(database.getMenuEntryMutationBaseline(entryId), null);
    assert.equal(database.saveMenuProductEntry({ ...input, id: entryId, product_id: productId }).message, "Ürün bulunamadı.");
    db.prepare("UPDATE catalog_products SET deleted_at=? WHERE id=?").run(product.deleted_at, productId);
    db.prepare("UPDATE menu_product_entries SET deleted_at='fixture' WHERE id=?").run(entryId);
    assert.equal(database.getMenuEntryMutationBaseline(entryId), null);
    assert.equal(database.saveMenuProductEntry({ ...input, id: entryId, product_id: productId }).message, "Menü ürünü bulunamadı.");
    db.prepare("UPDATE menu_product_entries SET deleted_at=? WHERE id=?").run(entry.deleted_at, entryId);
    db.prepare("UPDATE menu_product_entries SET stock_consumption_quantity=5.1234567 WHERE id=?").run(entryId);
    assert.equal(database.getMenuEntryMutationBaseline(entryId).stock_consumption_quantity, precisionExpected, "same stock precision as the full projection");
    db.prepare("UPDATE menu_product_entries SET stock_consumption_quantity=? WHERE id=?").run(entry.stock_consumption_quantity, entryId);
    db.prepare("UPDATE business SET deleted_at='fixture' WHERE id=?").run(business.id);
    assert.equal(database.getMenuEntryMutationBaseline(entryId), null, "deleted business cannot supply mutation authority");
    db.prepare("UPDATE business SET deleted_at=? WHERE id=?").run(business.deleted_at, business.id);
    const columns = Object.keys(business);
    db.prepare(`INSERT INTO business (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      .run(...columns.map((key) => key === "id" ? "foreign-menu-baseline" : key === "created_at" ? "9999" : business[key]));
    db.prepare("UPDATE catalog_products SET business_id='foreign-menu-baseline' WHERE id=?").run(productId);
    assert.equal(database.getMenuEntryMutationBaseline(entryId), null, "another business cannot supply the current business baseline");
    assert.equal(store.getMenuEntryMutationBaseline(db, entryId), null);
    assert.equal(database.saveMenuProductEntry({ ...input, id: entryId, product_id: productId }).message, "Ürün bulunamadı.", "foreign business identity cannot be mutated through the current Menu");
    db.prepare("UPDATE catalog_products SET business_id=? WHERE id=?").run(product.business_id, productId);
    assert.deepEqual(database.getMenuEntryMutationBaseline(entryId), expected);
    assert.equal(projections, 0); assert.equal(imageReads, 0);
  } finally {
    database.getPublishedMenu = facadeProjection; store.getPublishedMenu = storeProjection; images.readProductImageAsset = readImage;
    db.prepare("UPDATE catalog_products SET business_id=?,is_active=?,deleted_at=? WHERE id=?").run(product.business_id, product.is_active, product.deleted_at, productId);
    db.prepare("UPDATE menu_product_entries SET deleted_at=?,stock_consumption_quantity=? WHERE id=?").run(entry.deleted_at, entry.stock_consumption_quantity, entryId);
    db.prepare("UPDATE business SET deleted_at=? WHERE id=?").run(business.deleted_at, business.id);
    db.prepare("DELETE FROM business WHERE id='foreign-menu-baseline'").run();
  }
  assert.equal(database.getPublishedMenu(true).items.find((item) => item.id === entryId).image_url, projected.image_url, "ordinary menu/image projection is unchanged");
  console.log("Menu mutation baseline: exact fields/precision, inactive/deleted/missing identities, business scope and zero projection/image reads passed.");
}

export async function verifyMenuMutationDatabaseChange(database, input) {
  const compiled = new URL("../../apps/desktop-app/dist-electron/ipc/menu-ipc.js", import.meta.url);
  const localRequire = createRequire(compiled), exports = {}, handlers = new Map();
  let entered, release, current = database, writes = 0;
  const preparation = new Promise((resolve) => { entered = resolve; });
  const image = new Promise((resolve) => { release = resolve; });
  runInNewContext(readFileSync(compiled, "utf8"), { exports, Error,
    require: (name) => name === "electron" ? { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
      : name === "../product-data-service" ? { prepareProductImageForSave: () => { entered(); return image; } }
        : localRequire(name)
  });
  const originalSave = database.saveMenuProductEntry;
  database.saveMenuProductEntry = () => { writes++; throw new Error("wrong database mutation"); };
  exports.registerMenuIpcHandlers({ getDatabase: () => current, assertUnlocked() {},
    assertCapability: (capability) => assert.ok(current.getEnabledBusinessCapabilities().includes(capability)),
    finalizeMutation: (result) => result, scheduleSync() {} });
  const pending = handlers.get("menu:saveEntry")(null, { ...input, stock_consumption_quantity: 1, hide_when_out_of_stock: false,
    product: { name: "Prepared product", salePrice: 1, trackInventory: false } });
  try {
    await preparation; current = Object.create(database); release();
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.message, "Ürün veritabanı değişti; yeniden yükleyin.");
    assert.equal(writes, 0);
  } finally { release(); await pending; database.saveMenuProductEntry = originalSave; }
}
