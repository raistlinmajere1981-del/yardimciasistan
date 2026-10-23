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
    console.log(`${process.env.PRODUCT_PHOTO_NODE_CODEC === "1" ? "product-photos-node-codec-service-ok (Electron encoder unproved)" : "product-photos-smoke-ok"}: PNG/JPEG/WebP, legacy, append/dedup, cover/reorder/remove, lock/capability/path recheck, durable invalidation, 12-photo ZIP roundtrip, offline cover editor`);
  } finally {
    for (const db of databases) db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
