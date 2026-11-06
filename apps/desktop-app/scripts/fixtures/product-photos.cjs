const assert = require("node:assert/strict");
if (process.env.PRODUCT_PHOTO_NODE_CODEC === "1") require("../../../../scripts/test-helpers/product-photo-node-codec.cjs");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const { runInNewContext } = require("node:vm");
const { DatabaseSync } = require("node:sqlite");
const { app, nativeImage } = require("electron");
const { Transformer } = require("@napi-rs/image");
const photos = require("../../dist-electron/product-photo-store.js");
const media = require("../../dist-electron/product-data-service.js");
const store = require("../../dist-electron/commerce-store.js");
const productSave = require("../../dist-electron/commerce-product-save.js");
const { transferImageOwner } = require("../../dist-electron/data-transfer-images.js");
const transfer = require("../../dist-electron/data-transfer-service.js");
const format = require("../../dist-electron/data-transfer-format.js");
const { DEFAULT_TRANSFER_PREFERENCES } = require("../../dist-electron/data-transfer-contract.js");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ya-product-photos-"));
app.setPath("userData", root);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const image = n => nativeImage.createFromBitmap(Buffer.from([n, 70, 180, 255]), { width: 1, height: 1 });
const png = n => image(n).toPNG();
const url = (bytes, mime = "image/png") => `data:${mime};base64,${bytes.toString("base64")}`;
const databases = [];
function fixture(name) {
  const directory = path.join(root, name); fs.mkdirSync(directory);
  const databasePath = path.join(directory, "fixture.sqlite"), db = new DatabaseSync(databasePath);
  db.exec(fs.readFileSync("apps/desktop-app/db/schema.sql", "utf8"));
  db.exec("PRAGMA foreign_keys=ON; INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('b','Test','Test','market','t','t')");
  for (const c of ["commerce.catalog", "channel.online_sales"]) db.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES('b',?,1,'t','t')").run(c);
  databases.push(db); return { databasePath, db };
}

async function verifyUnifiedSave() {
  const { databasePath, db } = fixture("unified");
  db.exec("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES('b','commerce.inventory',1,'t','t')");
  const product = store.saveCatalogProduct(databasePath, { name: "Atomic product", salePrice: 25, purchasePrice: 10, trackInventory: true, minimumQuantity: 2 });
  store.setInventoryCount(databasePath, { productId: product.id, countedQuantity: 10 });
  const snapshot = () => JSON.stringify(["catalog_products", "commerce_product_publications", "inventory_locations", "inventory_balances", "inventory_movements", "sync_outbox", "sync_outbox_revisions", "sync_publication_payloads"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  const photo = bytes => ({ id: hash(bytes), format: "image/png", dataUrl: url(bytes) });
  const input = () => ({ product: { id: product.id, name: "Together", salePrice: 30, purchasePrice: 12, minimumQuantity: 4, trackInventory: true, isActive: false, quickAccessEnabled: true },
    sourcePhotoRevision: photos.listProductPhotos(databasePath, product.id).revision, imageMode: "keep", isPublished: false,
    photos: [photo(png(155)), photo(png(156))], stock: { operation: "add", quantity: 4, note: "Unified stock", expectedUpdatedAt: store.getInventoryBalance(databasePath, product.id).updatedAt, operationId: "unified-add" } });
  const save = async draft => productSave.saveProductDetails(databasePath, await productSave.prepareProductDetailsSave(databasePath, draft));
  const before = snapshot(), draft = input();
  const prepared = await productSave.prepareProductDetailsSave(databasePath, draft);
  assert.equal(snapshot(), before, "preparation/discard performs no DB or outbox write");
  const result = productSave.saveProductDetails(databasePath, prepared);
  assert.equal(result.product.name, "Together"); assert.equal(result.product.minimumQuantity, 4);
  assert.equal(result.product.isActive, false); assert.equal(result.product.quickAccessEnabled, true);
  assert.equal(result.publication.isPublished, false); assert.equal(result.photos.photos.length, 2);
  assert.equal(result.stock.balance.quantity, 14); assert.equal(result.balance.quantity, 14); assert.equal(result.stock.movement.quantityDelta, 4);
  assert.equal(store.listInventoryMovements(databasePath, { productId: product.id }).length, 2);
  const committed = snapshot();
  await assert.rejects(save(draft), /değişti|zaten kaydedildi/);
  assert.equal(snapshot(), committed, "an exact replay cannot append stock twice");

  // Fail late, after product, photos and publication have all been written.
  const rollbackDraft = input(); rollbackDraft.stock.operationId = "rollback";
  rollbackDraft.product.name = "Must roll back"; rollbackDraft.isPublished = true;
  rollbackDraft.photos = [photo(png(157))];
  const pending = await productSave.prepareProductDetailsSave(databasePath, rollbackDraft);
  db.exec("CREATE TRIGGER unified_fail BEFORE INSERT ON inventory_movements BEGIN SELECT RAISE(ABORT,'late_inventory_failure'); END");
  assert.throws(() => productSave.saveProductDetails(databasePath, pending), /late_inventory_failure/);
  assert.equal(snapshot(), committed, "late failure rolls back metadata, publication, photos, stock AND all outbox revisions");
  db.exec("DROP TRIGGER unified_fail");

  const stale = await productSave.prepareProductDetailsSave(databasePath, { ...input(), stock: undefined });
  const current = photos.listProductPhotos(databasePath, product.id);
  photos.mutateProductPhotos(databasePath, { productId: product.id, expectedRevision: current.revision }, { kind: "cover", photoId: current.photos[1].id });
  const afterConcurrentPhoto = snapshot();
  assert.throws(() => productSave.saveProductDetails(databasePath, stale), /fotoğrafları değişti/);
  assert.equal(snapshot(), afterConcurrentPhoto);
  const stockStale = await productSave.prepareProductDetailsSave(databasePath, { ...input(), photos: undefined, stock: { ...input().stock, operationId: "stale-stock", operation: "count", quantity: 0 } });
  store.applyInventoryMovement(databasePath, { productId: product.id, type: "adjust", quantityDelta: 1 });
  const afterConcurrentStock = snapshot();
  assert.throws(() => productSave.saveProductDetails(databasePath, stockStale), /Stok bu sayımdan sonra değişti/);
  assert.equal(snapshot(), afterConcurrentStock);
  const count = input(); count.photos = undefined; count.stock = { ...count.stock, operation: "count", quantity: 0, operationId: "count-zero" };
  const counted = await save(count);
  assert.equal(counted.stock.balance.quantity, 0); assert.equal(counted.stock.movement.type, "count");
  assert.equal(store.listInventoryMovements(databasePath, { productId: product.id }).length, 4, "count creates only one additional immutable movement");
  const afterCount = snapshot(); await assert.rejects(save(count), /zaten kaydedildi/); assert.equal(snapshot(), afterCount);

  const invalids = [
    { ...input(), photos: [photo(png(160)), { ...photo(png(161)), dataUrl: url(Buffer.from("invalid")) }] },
    { ...input(), photos: [photo(png(160)), photo(png(160))] },
    { ...input(), photos: Array.from({ length: 13 }, (_, i) => photo(png(170 + i))) },
    { ...input(), photos: [{ ...photo(png(160)), id: "0".repeat(64) }] },
    { ...input(), photos: [photo(Buffer.alloc(5 * 1024 * 1024 + 1))] },
    { ...input(), imageMode: "manual", photos: undefined, product: { ...input().product, manualImageDataUrl: "invalid" } }
  ];
  for (const invalid of invalids) { const beforeInvalid = snapshot(); await assert.rejects(save({ ...invalid, stock: undefined }), /fotoğraf|görsel|JPEG|5 MB/); assert.equal(snapshot(), beforeInvalid); }
  // Gate changes after decoding must also roll back everything.
  const gated = await productSave.prepareProductDetailsSave(databasePath, { ...input(), stock: undefined });
  db.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='channel.online_sales'");
  const disabled = snapshot(); assert.throws(() => productSave.saveProductDetails(databasePath, gated), /Online Satış/); assert.equal(snapshot(), disabled);
  // Cover-only editing is still supported when the multi-photo capability is off.
  const manual = { product: { id: product.id, name: "Manual cover", trackInventory: true, manualImageDataUrl: url(png(200)) }, imageMode: "manual", sourcePhotoRevision: photos.listProductPhotos(databasePath, product.id).revision };
  const manualResult = await save(manual); assert.equal(manualResult.photos.photos[0].id, hash(png(200)));
  assert.equal(manualResult.photos.photos.length, 2, "manual cover keeps the other originals");
  const clearResult = await save({ ...manual, imageMode: "clear", sourcePhotoRevision: manualResult.photos.revision });
  assert.equal(clearResult.photos.photos.length, 1, "cover clear promotes the next photo");
  // Automatic/external image acquisition is optional when the service/images mode is off.
  const external = await save({ product: { id: product.id, name: "Auto mode off", trackInventory: true, imageSourceUrl: "https://images.openfoodfacts.org/images/products/123/front_en.jpg", dataSource: "open_food_facts" }, imageMode: "external", sourcePhotoRevision: clearResult.photos.revision });
  assert.equal(external.product.imageAssetPath, clearResult.product.imageAssetPath);
  db.exec("INSERT INTO settings(id,business_id,product_data_enabled,product_data_include_images,created_at,updated_at) VALUES('s','b',1,1,'t','t')");
  const fetchImpl = globalThis.fetch;
  try {
    let imageFetches = 0;
    globalThis.fetch = async () => { imageFetches++; return new Response(png(205), { headers: { "content-type": "image/png" } }); };
    const externalUrl = "https://images.openfoodfacts.org/images/products/123/front.jpg";
    const automatic = await save({ product: { id: product.id, name: "Auto image", trackInventory: true, dataSource: "open_food_facts", imageSourceUrl: externalUrl, imageLicense: "CC BY-SA" }, imageMode: "external", sourcePhotoRevision: external.photos.revision });
    assert.equal(imageFetches, 1); assert.ok(automatic.product.imageAssetPath); assert.equal(automatic.photos.sourceUrl, externalUrl);
    db.exec("UPDATE settings SET product_data_include_images=0");
    const noAutoImage = await save({ product: { name: "No auto image", trackInventory: false, dataSource: "open_food_facts", imageSourceUrl: externalUrl }, imageMode: "external", sourcePhotoRevision: "" });
    assert.equal(noAutoImage.product.imageAssetPath, ""); assert.equal(imageFetches, 1);
    db.exec("UPDATE settings SET product_data_include_images=1");
    db.exec("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id='channel.online_sales'");
    const combined = await save({ product: { name: "External and gallery draft", trackInventory: false, dataSource: "open_food_facts", imageSourceUrl: externalUrl }, imageMode: "external", sourcePhotoRevision: "", photos: [photo(png(207)), photo(png(208))] });
    assert.equal(combined.photos.photos.length, 2); assert.equal(combined.photos.photos[1].id, hash(png(208)), "external cover preserves other staged gallery additions");
    assert.equal(combined.photos.sourceUrl, externalUrl);
  } finally { globalThis.fetch = fetchImpl; }
  db.exec("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id='channel.online_sales'");
  const created = await save({ product: { name: "Create together", trackInventory: true }, sourcePhotoRevision: "", imageMode: "keep", isPublished: false,
    photos: [photo(png(210)), photo(png(211))], stock: { operation: "add", quantity: 3, note: "Initial stock", expectedUpdatedAt: "", operationId: "create-stock" } });
  assert.equal(created.photos.photos.length, 2); assert.equal(created.stock.balance.quantity, 3); assert.equal(created.publication.isPublished, false);
  assert.equal(store.listInventoryMovements(databasePath, { productId: created.product.id }).length, 1);
  const removed = await save({ product: { id: created.product.id, name: created.product.name, trackInventory: true }, sourcePhotoRevision: created.photos.revision, imageMode: "keep",
    stock: { operation: "remove", quantity: 1, note: "Remove once", expectedUpdatedAt: created.balance.updatedAt, operationId: "remove-once" } });
  assert.equal(removed.balance.quantity, 2); assert.equal(removed.stock.movement.quantityDelta, -1);
  const unchangedCount = await save({ product: { id: created.product.id, name: created.product.name, trackInventory: true }, sourcePhotoRevision: removed.photos.revision, imageMode: "keep",
    stock: { operation: "count", quantity: 2, note: "Unchanged count", expectedUpdatedAt: removed.balance.updatedAt, operationId: "count-no-change" } });
  assert.equal(unchangedCount.stock.movement, null);
  assert.equal(store.listInventoryMovements(databasePath, { productId: created.product.id }).length, 2, "a no-op count does not invent an audit movement");
  // Actual new IPC: async acquisition must recheck unlock and database identity;
  // notifications run only after the full commit and cannot turn it into a failure.
  const ipcFile = path.resolve("apps/desktop-app/dist-electron/commerce-ipc.js"), compiledRequire = createRequire(ipcFile);
  const handlers = new Map(), ipcExports = {};
  runInNewContext(fs.readFileSync(ipcFile, "utf8"), { exports: ipcExports, Error, require: name => name === "electron"
    ? { ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) } }
    : name === "./ipc/product-photo-ipc" ? { registerProductPhotoIpcHandlers() {} } : compiledRequire(name) });
  let unlocked = true, activePath = databasePath, notifications = 0;
  ipcExports.registerCommerceIpcHandlers({ databasePath: () => activePath, assertUnlocked: () => { if (!unlocked) throw new Error("session locked"); }, onMutation: () => {
    notifications++; assert.equal(store.getInventoryBalance(databasePath, product.id).quantity, 4); throw new Error("notification fixture failure");
  } });
  const call = draft => handlers.get("commerce:product:saveDetails")({}, draft);
  for (const gate of ["lock", "path"]) {
    const draft = { ...input(), stock: undefined };
    const beforeGate = snapshot(), request = call(draft);
    if (gate === "lock") unlocked = false; else activePath = "changed.sqlite";
    await assert.rejects(request, /locked|veritabanı/);
    unlocked = true; activePath = databasePath;
    assert.equal(snapshot(), beforeGate); assert.equal(notifications, 0);
  }
  const viaIpc = input(); viaIpc.stock.operationId = "ipc-once";
  const ipcResult = await call(viaIpc);
  assert.equal(ipcResult.stock.balance.quantity, 4); assert.equal(notifications, 1);
  const afterIpc = snapshot(); await assert.rejects(call(viaIpc), /değişti|zaten kaydedildi/); assert.equal(snapshot(), afterIpc);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
}

app.whenReady().then(async () => {
  try {
    const f = fixture("source"), databasePath = f.databasePath, db = f.db;
    const product = store.saveCatalogProduct(databasePath, { name: "Multi photo fixture", sku: "PHOTO", trackInventory: false, salePrice: 25, taxRate: 20 });
    const row = () => db.prepare("SELECT * FROM catalog_products WHERE id=?").get(product.id);
    const original = png(10);
    const prepared = await media.prepareProductImageForSave(databasePath, { id: product.id, manualImageDataUrl: url(original) });
    store.saveCatalogProduct(databasePath, { id: product.id, name: product.name, sku: "PHOTO", trackInventory: false, salePrice: 25, taxRate: 20 }, prepared);
    // A real legacy cover with no original metadata is listed without a read-time write.
    db.prepare("UPDATE catalog_products SET image_original_assets_json='[]' WHERE id=?").run(product.id);
    let current = photos.listProductPhotos(databasePath, product.id);
    assert.equal(current.photos.length, 1);
    assert.equal(row().image_original_assets_json, "[]");
    assert.ok(photos.previewProductPhoto(databasePath, product.id, current.photos[0].id).startsWith("data:image/jpeg;base64,"));

    const ipcFile = path.resolve("apps/desktop-app/dist-electron/ipc/product-photo-ipc.js");
    const compiledRequire = createRequire(ipcFile), handlers = new Map(), exports = {};
    runInNewContext(fs.readFileSync(ipcFile, "utf8"), { exports, Error, require: name => name === "electron"
      ? { ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) } } : compiledRequire(name) });
    let unlocked = true, activePath = databasePath, mutations = 0;
    exports.registerProductPhotoIpcHandlers({ databasePath: () => activePath, assertUnlocked: () => { if (!unlocked) throw new Error("session locked"); }, onMutation: () => mutations++ });
    const call = (op, ...args) => handlers.get(`commerce:product:photos:${op}`)({}, ...args);
    const base = () => ({ productId: product.id, expectedRevision: current.revision });
    const bytes2 = image(20).toJPEG(90), bytes3 = new Transformer(png(30)).webpSync();
    const revisionBefore = db.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='online_catalog'").get().source_revision;
    db.prepare("UPDATE catalog_products SET updated_at='old' WHERE id=?").run(product.id);
    current = await call("add", { ...base(), dataUrls: [url(bytes2, "image/jpeg"), url(bytes3, "image/webp"), url(bytes2, "image/jpeg")] });
    assert.equal(current.photos.length, 3, "append preserves legacy + dedups SHA256");
    assert.deepEqual(current.photos.slice(1).map(p => p.id), [hash(bytes2), hash(bytes3)]);
    assert.notEqual(row().updated_at, "old");
    assert.ok(db.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='online_catalog'").get().source_revision > revisionBefore);
    assert.ok(mutations > 0, "IPC invokes existing publication invalidation callback");
    assert.ok(!JSON.stringify(current).includes("assets/products"), "renderer receives opaque identities, never filesystem paths");
    const beforeFailure = row(), beforeMutations = mutations;
    db.exec("CREATE TRIGGER photo_rollback BEFORE UPDATE ON catalog_products BEGIN SELECT RAISE(ABORT,'photo_rollback'); END");
    assert.throws(() => call("setCover", { ...base(), photoId: hash(bytes3) }), /photo_rollback/);
    assert.deepEqual(row(), beforeFailure, "failed photo commit rolls back product and publication state");
    assert.equal(mutations, beforeMutations);
    db.exec("DROP TRIGGER photo_rollback");
    const linkedPath = path.join(path.dirname(databasePath), JSON.parse(row().image_original_assets_json)[1].assetPath);
    fs.renameSync(linkedPath, `${linkedPath}.held`); fs.symlinkSync(`${linkedPath}.held`, linkedPath);
    assert.throws(() => call("preview", product.id, hash(bytes2)), /sembolik/);
    fs.unlinkSync(linkedPath); fs.renameSync(`${linkedPath}.held`, linkedPath);
    db.prepare("UPDATE catalog_products SET image_asset_path='' WHERE id=?").run(product.id);
    current = call("list", product.id);
    current = call("reorder", { ...base(), photoIds: current.photos.map(p => p.id) });
    assert.ok(row().image_asset_path, "a missing normalized cover is repaired from the first original");
    const originalAssets = JSON.parse(row().image_original_assets_json);
    const previousCover = row().image_asset_path;
    const oldRevision = current.revision;
    current = call("setCover", { ...base(), photoId: hash(bytes3) });
    assert.equal(current.photos[0].id, hash(bytes3));
    assert.deepEqual(fs.readFileSync(path.join(path.dirname(databasePath), row().image_asset_path)), media.normalizeProductImageBytes(bytes3));
    assert.ok(fs.existsSync(path.join(path.dirname(databasePath), previousCover)), "old physical cover retained until safe GC");
    assert.throws(() => call("remove", { productId: product.id, expectedRevision: oldRevision, photoId: hash(bytes2) }), /değişti/);
    assert.throws(() => call("reorder", { ...base(), photoIds: [hash(bytes3), hash(bytes3), hash(bytes2)] }), /birer kez/);
    current = call("reorder", { ...base(), photoIds: [...current.photos.map(p => p.id)].reverse() });
    const unchangedCover = row().image_asset_path;
    current = call("remove", { ...base(), photoId: hash(bytes3) });
    assert.equal(row().image_asset_path, unchangedCover, "non-cover removal retains cover");
    current = call("remove", { ...base(), photoId: current.photos[0].id });
    assert.equal(current.photos.length, 1);
    for (const asset of originalAssets) assert.ok(fs.existsSync(path.join(path.dirname(databasePath), asset.assetPath)));

    // Async IPC must recheck lock, capability, and database identity after decoding.
    for (const gate of ["lock", "path", "capability"]) {
      const pending = call("add", { ...base(), dataUrls: [url(png(40))] });
      if (gate === "lock") unlocked = false;
      if (gate === "path") activePath = "changed.sqlite";
      if (gate === "capability") db.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='channel.online_sales'");
      await assert.rejects(pending, /locked|veritabanı|Online Satış/);
      unlocked = true; activePath = databasePath;
      db.exec("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id='channel.online_sales'");
      assert.equal(photos.listProductPhotos(databasePath, product.id).photos.length, 1);
    }
    const remaining = current.photos[0].id;
    db.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='channel.online_sales'");
    assert.equal(call("list", product.id).photos.length, 1, "capability off preserves read and archive");
    for (const [op, args] of [["remove", {photoId: remaining}], ["setCover", {photoId: remaining}], ["reorder", {photoIds: [remaining]}]]) assert.throws(() => call(op, { ...base(), ...args }), /Online Satış/);
    db.exec("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id='channel.online_sales'");
    current = call("remove", { ...base(), photoId: remaining });
    assert.equal(row().image_asset_path, ""); assert.equal(row().image_original_assets_json, "[]");
    assert.equal(current.photos.length, 0);
    await assert.rejects(call("add", { ...base(), dataUrls: ["/etc/passwd"] }), /JPEG|fotoğraf/);
    await assert.rejects(call("add", { ...base(), dataUrls: [url(bytes2)] }), /biçimi/);
    await assert.rejects(call("add", { ...base(), dataUrls: [url(Buffer.from("not a real image"))] }), /JPEG/);
    await assert.rejects(call("add", { ...base(), dataUrls: [url(Buffer.alloc(5 * 1024 * 1024 + 1))] }), /5 MB|boyut|JPEG/);
    const hugeHeader = Buffer.from(png(50));
    hugeHeader.writeUInt32BE(100000, 16); hugeHeader.writeUInt32BE(100000, 20);
    // Recalculate IHDR CRC; dimensions must be rejected before allocating pixels.
    let crc = 0xffffffff;
    for (const byte of hugeHeader.subarray(12, 29)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    hugeHeader.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
    await assert.rejects(call("add", { ...base(), dataUrls: [url(hugeHeader)] }), /piksel/);
    assert.throws(() => call("preview", product.id, "../../etc/passwd"), /bulunamadı/);
    assert.throws(() => call("list", "../bad"), /kimliği/);
    db.exec("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('other','Other','Other','market','z','z'); INSERT INTO catalog_products(id,business_id,name,created_at,updated_at) VALUES('other-product','other','Other','t','t')");
    assert.throws(() => call("list", "other-product"), /bulunamadı/, "photos stay within the active business");

    const twelve = [bytes2, bytes3, ...Array.from({ length: 10 }, (_, i) => png(80 + i))];
    current = await call("add", { ...base(), dataUrls: twelve.map(b => url(b, format.imageMime(b))) });
    assert.equal(current.photos.length, 12);
    await assert.rejects(call("add", { ...base(), dataUrls: [url(png(120))] }), /12/);
    current = await call("add", { ...base(), dataUrls: [url(twelve[0], format.imageMime(twelve[0]))] });
    assert.equal(current.photos.length, 12, "duplicate at limit is idempotent");
    current = call("reorder", { ...base(), photoIds: current.photos.map(p => p.id).reverse() });
    const hashes = current.photos.map(p => p.id), cover = fs.readFileSync(path.join(path.dirname(databasePath), row().image_asset_path));
    const exported = await transfer.createTransferExport(databasePath, { entity: "products", format: "zip", scope: "all", includeImages: true, includeIdentity: false }, transferImageOwner, () => {}, () => {});
    assert.equal(exported.images, 12); assert.deepEqual(exported.warnings, []);
    const doc = await format.parseTransferFile("photos.zip", exported.bytes, "products");
    assert.deepEqual(doc.assetManifest.map(item => item.hash), hashes);
    const tooManyBytes = png(150), tooManyPath = "assets/thirteenth.png";
    const tooMany = { ...doc, assets: { ...doc.assets, [tooManyPath]: tooManyBytes }, assetManifest: [...doc.assetManifest, { path: tooManyPath, hash: hash(tooManyBytes), format: "image/png", productId: doc.records[0].id, sku: "PHOTO" }] };
    const tooManyPlan = transfer.createTransferPlan(databasePath, "products", tooMany, format.suggestTransferMapping(doc.headers, "products"), { ...DEFAULT_TRANSFER_PREFERENCES, conflicts: "update" }, transferImageOwner);
    assert.equal(tooManyPlan.preview.counts.error, 1, "ZIP import rejects thirteen unique images before apply");
    const target = fixture("roundtrip");
    const plan = transfer.createTransferPlan(target.databasePath, "products", doc, format.suggestTransferMapping(doc.headers, "products"), DEFAULT_TRANSFER_PREFERENCES, transferImageOwner);
    assert.equal(plan.preview.counts.error, 0, JSON.stringify(plan.preview));
    assert.equal((await transfer.applyTransferPlan(target.databasePath, plan, transferImageOwner, () => {}, () => {})).added, 1);
    const imported = target.db.prepare("SELECT * FROM catalog_products WHERE sku='PHOTO'").get();
    assert.deepEqual(JSON.parse(imported.image_original_assets_json).map(item => item.hash), hashes);
    assert.deepEqual(fs.readFileSync(path.join(path.dirname(target.databasePath), imported.image_asset_path)), cover, "ZIP reimport regenerates identical cover from first original");
    for (const asset of JSON.parse(imported.image_original_assets_json)) assert.equal(hash(fs.readFileSync(path.join(path.dirname(target.databasePath), asset.assetPath))), asset.hash);

    // Cover-only editor while offline replaces/removes only the first original.
    db.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='channel.online_sales'");
    const input = { id: product.id, name: product.name, sku: "PHOTO", trackInventory: false, salePrice: 25, taxRate: 20, manualImageDataUrl: url(png(140)) };
    store.saveCatalogProduct(databasePath, input, await media.prepareProductImageForSave(databasePath, input));
    assert.deepEqual(JSON.parse(row().image_original_assets_json).slice(1).map(a => a.hash), hashes.slice(1));
    const clear = { ...input, manualImageDataUrl: undefined, clearImage: true };
    store.saveCatalogProduct(databasePath, clear, await media.prepareProductImageForSave(databasePath, clear));
    assert.deepEqual(JSON.parse(row().image_original_assets_json).map(a => a.hash), hashes.slice(1));
    assert.ok(row().image_asset_path);
    await verifyUnifiedSave();
    console.log(`${process.env.PRODUCT_PHOTO_NODE_CODEC === "1" ? "product-photos-node-codec-service-ok (Electron encoder unproved)" : "product-photos-smoke-ok"}: PNG/JPEG/WebP, legacy, append/dedup, cover/reorder/remove, lock/capability/path recheck, durable invalidation, 12-photo ZIP roundtrip, offline cover editor, unified atomic save/discard, rollback/outbox, stale photo/stock, one movement, create and manual/auto modes`);
  } finally {
    for (const db of databases) db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
