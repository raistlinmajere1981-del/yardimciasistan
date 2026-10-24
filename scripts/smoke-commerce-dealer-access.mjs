import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { Transformer } = require("@napi-rs/image");
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { saveRuntimeCatalogProduct } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { prepareDealerProductMedia } = require("../apps/desktop-app/dist-electron/dealer-product-media-publication.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-asistan-dealer-access-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

const baseCustomer = (overrides = {}) => ({
  fullName: "Ticari Müşteri",
  phone: "05550001001",
  email: "ticari@example.test",
  notes: "",
  tags: [],
  identityType: "",
  identityNumber: "",
  nationality: "",
  birthDate: "",
  birthdayMessageEnabled: true,
  gender: "",
  documentSerialNumber: "",
  documentExpiryDate: "",
  birthPlace: "",
  motherName: "",
  fatherName: "",
  issuingAuthority: "",
  address: "",
  ...overrides
});

try {
  database.initialize();
  const setup = database.saveInitialSetup({
    businessName: "Toptan Smoke",
    profileId: "market",
    profileOptions: [C.WHOLESALE, C.ONLINE_SALES],
    dealerPortalEnabled: true,
    onlineSalesDeliveryEnabled: true,
    onlineSalesDelivery: { pickupEnabled: true, shippingEnabled: false },
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "dealer-access-smoke-secret",
    autoSyncEnabled: false,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiModel: "",
    aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1",
    aiTimeoutSeconds: 30,
    aiApiKey: "",
    clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });
  assert.equal(setup.ok, true, setup.ok ? "" : setup.message);


  const raw = new DatabaseSync(database.databasePath);
  try {
    const create = (status) => database.saveCustomer(baseCustomer({ phone: "", email: "",
      commercialProfile: status ? { companyName: "Dealer Company", dealerStatus: status, priceGroup: "dealer_a" } : undefined }));
    const ordinary = create(); const inactive = create("inactive"); const active = create("active");
    for (const result of [ordinary, inactive, active]) assert.equal(result.ok, true, result.message);
    for (const result of [ordinary, inactive]) assert.equal(database.getDealerWebAccess(result.savedId).enabled, false);
    const id = active.savedId;
    // Original archive order is the gallery owner. Upload acknowledgements only cache public URLs.
    const product = saveRuntimeCatalogProduct(database.databasePath, { name: "Photo fixture", sku: "PHOTO-1", brand: "",
      categoryId: "", salePrice: 100, dealerPriceA: 80, dealerPriceB: null, purchasePrice: 20,
      currency: "TRY", unit: "piece", taxRate: 20, trackInventory: false, isActive: true });
    const image = Transformer.fromRgbaPixels(Buffer.from([80, 120, 200, 255]), 1, 1).pngSync();
    const bytes = [image, Buffer.concat([image, Buffer.from("second-original")])];
    const originals = bytes.map((buffer, index) => {
      const assetPath = `assets/products/${product.id}/original-${index}.png`;
      mkdirSync(join(dataDir, "assets", "products", product.id), { recursive: true });
      writeFileSync(join(dataDir, assetPath), buffer);
      return { assetPath, hash: createHash("sha256").update(buffer).digest("hex"), format: "image/png" };
    });
    raw.prepare("UPDATE catalog_products SET image_original_assets_json=? WHERE id=?").run(JSON.stringify(originals), product.id);
    const revision = () => database.getPendingSyncJobs().find(job => job.jobType === "dealer_access_publish").sourceRevision;
    const mediaConfig = { baseUrl: "https://media.example/module", syncSecret: "fixture-secret" };
    const uploads = [];
    const upload = async (config, client, endpoint, field, absolute, asset) => {
      assert.equal(endpoint, "/api/product-media.php"); assert.equal(field, "product_id");
      assert.ok(readFileSync(absolute).equals(bytes[uploads.length % 2]));
      uploads.push({ target: config.baseUrl, asset });
      return { ok: true, status: 200, message: "fixture", url: `${config.baseUrl}/media/products/${asset.resourceId}/${asset.contentHash}.png` };
    };
    const beforeMedia = revision();
    const prepared = await prepareDealerProductMedia(database, mediaConfig, beforeMedia, upload);
    assert.equal(prepared.ok, true); assert.equal(uploads.length, 2);
    const gallery = prepared.value.catalogs[0].products.find(row => row.product_id === product.id);
    assert.deepEqual(gallery.image_urls, originals.map(asset => `${mediaConfig.baseUrl}/media/products/${product.id}/${asset.hash}.png`));
    assert.equal(gallery.image_url, gallery.image_urls[0]);
    assert.equal(revision(), beforeMedia, "upload metadata cannot invalidate or allocate a second publication");
    assert.equal(JSON.stringify(prepared.value).includes("assets/products/"), false);
    const cached = await prepareDealerProductMedia(database, mediaConfig, beforeMedia, upload);
    assert.equal(cached.ok, true); assert.equal(uploads.length, 2, "same target/hash reuses upload receipt");
    const other = { ...mediaConfig, baseUrl: "https://media.example/other" };
    assert.equal((await prepareDealerProductMedia(database, other, beforeMedia, upload)).ok, true);
    assert.equal(uploads.length, 4, "a new hosting target must have its own media receipts");
    database.prepareSyncPublication("dealer_access_publish", prepared.value, false, beforeMedia);
    for (const asset of originals) rmSync(join(dataDir, asset.assetPath));
    const frozen = await prepareDealerProductMedia(database, mediaConfig, beforeMedia, () => { throw new Error("Frozen retry must not upload"); });
    assert.deepEqual(frozen.value, prepared.value, "retry reuses immutable exact body even after source files disappear");
    database.completeSyncJob("dealer_access", beforeMedia);
    for (const [index, asset] of originals.entries()) writeFileSync(join(dataDir, asset.assetPath), bytes[index]);
    raw.prepare("UPDATE catalog_products SET name='Changed photo fixture' WHERE id=?").run(product.id);
    const raceRevision = revision();
    const race = await prepareDealerProductMedia(database, { ...mediaConfig, baseUrl: "https://media.example/race" }, raceRevision,
      async (...args) => { const result = await upload(...args); raw.prepare("UPDATE catalog_products SET sale_price=sale_price+1 WHERE id=?").run(product.id); return result; });
    assert.equal(race.ok, true);
    assert.equal(database.prepareSyncPublication("dealer_access_publish", race.value, false, raceRevision), null,
      "media prepared across a domain mutation cannot freeze under the newer revision");
    const failRevision = revision();
    const failed = await prepareDealerProductMedia(database, { ...mediaConfig, baseUrl: "https://media.example/fail" }, failRevision,
      async () => ({ ok: false, status: 503, message: "fixture unavailable" }));
    assert.equal(failed.ok, false); assert.equal(revision(), failRevision, "failure leaves the same durable job pending");
    assert.equal(database.readPreparedSyncPublication("dealer_access_publish", failRevision), null);
    // Wrong archive hash and cross-origin media receipts fail closed without publishing local paths.
    writeFileSync(join(dataDir, originals[0].assetPath), Buffer.from("corrupt"));
    assert.equal((await prepareDealerProductMedia(database, mediaConfig, failRevision, upload)).ok, false);
    writeFileSync(join(dataDir, originals[0].assetPath), bytes[0]);
    assert.throws(() => database.acknowledgeProductImage(product.id, originals[0].hash, mediaConfig.baseUrl,
      `https://other.example/module/media/products/${product.id}/${originals[0].hash}.png`));
    assert.throws(() => database.acknowledgeProductImage(product.id, originals[0].hash, mediaConfig.baseUrl,
      `https://user:password@media.example/module/media/products/${product.id}/${originals[0].hash}.png`));
    assert.equal(database.getSetupData().dealerPortalEnabled, true);
    assert.equal(database.getDealerWebAccess(id).enabled, true);
    const projection = database.createDealerAccessProjection();
    assert.equal(projection.version, 3); assert.equal(projection.online_sales_enabled, true);
    assert.equal(projection.dealers.length, 3, "ordinary and dealer share one customer account binding owner");
    assert.equal(projection.dealers.find(row => row.access_id === database.getDealerWebAccess(id).accessId).enabled, true);
    assert.equal(JSON.stringify(projection).includes("invite"), false);
    assert.equal(JSON.stringify(projection).includes(id), false);
    const before = database.getDealerWebAccess(id);
    const revoked = database.changeDealerWebAccess(id, "revoke_sessions").access;
    assert.equal(revoked.enabled, true); assert.ok(revoked.sessionRevision > before.sessionRevision);
    raw.prepare("UPDATE customer_commercial_profiles SET dealer_status = 'inactive' WHERE customer_id = ?").run(id);
    assert.equal(database.getDealerWebAccess(id).enabled, false);
    assert.equal(database.getDealerWebAccess(id).sessionRevision, revoked.sessionRevision, "dealer demotion preserves normal account sessions");
    raw.prepare("UPDATE customer_commercial_profiles SET dealer_status = 'active' WHERE customer_id = ?").run(id);
    assert.equal(database.getDealerWebAccess(id).enabled, true);
    for (const cap of [C.ONLINE_SALES, C.WHOLESALE]) {
      raw.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = ?").run(cap);
      assert.equal(database.getDealerWebAccess(id).enabled, false);
      assert.equal(database.createDealerAccessProjection().enabled, false);
      raw.prepare("UPDATE business_capabilities SET is_enabled = 1 WHERE capability_id = ?").run(cap);
    }
    const job = database.getPendingSyncJobs().find(job => job.jobKey === "dealer_access");
    database.completeSyncJob(job.jobKey, job.sourceRevision);
    raw.prepare("UPDATE customers SET full_name = 'Updated dealer' WHERE id = ?").run(id);
    assert.ok(database.getPendingSyncJobs().find(job => job.jobKey === "dealer_access").sourceRevision > job.sourceRevision);
  } finally { raw.close(); }
  console.log("commerce-dealer-access-smoke-ok: canonical binding, gates, revocation, media and durable publication");
} finally { database.close(); rmSync(dataDir, { recursive: true, force: true }); }
