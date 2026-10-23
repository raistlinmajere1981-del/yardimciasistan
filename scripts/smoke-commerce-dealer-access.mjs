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
    profileOptions: [C.WHOLESALE],
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
    for (const result of [ordinary, inactive]) assert.throws(() => database.changeDealerWebAccess(result.savedId, "invite"), /aktif bayi/);
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
    raw.prepare("UPDATE commerce_dealer_web_access SET enabled=0 WHERE customer_id=?").run(id);
    assert.equal(database.getDealerWebAccess(id).enabled, true, "technical enabled bit is not an authorization gate");
    assert.equal(database.createDealerAccessProjection().dealers[0].enabled, true);
    raw.prepare("UPDATE commerce_dealer_web_access SET enabled=1 WHERE customer_id=?").run(id);
    assert.throws(() => database.changeDealerWebAccess(id, "unknown"), /geçersiz/);
    const enabled = { access: database.getDealerWebAccess(id) };
    assert.equal(enabled.access.enabled, true);
    const issued = database.changeDealerWebAccess(id, "invite");
    const invitation = new URL(issued.inviteUrl);
    const fragment = new URLSearchParams(invitation.hash.slice(1));
    const token = fragment.get("invite");
    assert.equal(fragment.get("module"), "https://example.test/yardimci-asistan/");
    assert.equal(new URL(issued.inviteUrl).pathname, "/bayi/");
    assert.equal(token.length, 43); assert.equal(new URL(issued.inviteUrl).search, "");
    const stored = raw.prepare("SELECT * FROM commerce_dealer_web_access WHERE customer_id = ?").get(id);
    assert.equal(stored.invite_hash, createHash("sha256").update(token).digest("hex"));
    assert.equal(JSON.stringify(stored).includes(token), false);
    assert.ok(Date.parse(stored.invite_expires_at) - Date.parse(stored.invite_issued_at) <= 72 * 3600_000 + 1000);
    assert.ok(Date.parse(stored.invite_expires_at) > Date.now());
    assert.equal("invite_hash" in issued.access, false);
    const projection = database.createDealerAccessProjection();
    assert.equal(projection.enabled, true); assert.equal(projection.dealers.length, 1);
    assert.deepEqual(Object.keys(projection.dealers[0]).sort(), ["access_id", "customer_ref", "display_name", "access_revision", "enabled", "invite_hash", "invite_expires_at", "invite_revision"].sort());
    assert.notEqual(projection.dealers[0].customer_ref, id);
    assert.equal(JSON.stringify(projection).includes(id), false);
    const rotated = database.changeDealerWebAccess(id, "invite");
    assert.notEqual(rotated.inviteUrl, issued.inviteUrl); assert.equal(rotated.access.accessRevision, issued.access.accessRevision); assert.ok(rotated.access.inviteRevision > issued.access.inviteRevision);
    const revoked = database.changeDealerWebAccess(id, "revoke_sessions");
    assert.equal(revoked.access.enabled, true); assert.ok(revoked.access.accessRevision > rotated.access.accessRevision);
    assert.equal(database.createDealerAccessProjection().dealers[0].invite_hash, "");
    raw.prepare("UPDATE customer_commercial_profiles SET dealer_status = 'inactive' WHERE customer_id = ?").run(id);
    assert.equal(database.createDealerAccessProjection().dealers[0].enabled, false);
    raw.prepare("UPDATE customer_commercial_profiles SET dealer_status = 'active' WHERE customer_id = ?").run(id); database.changeDealerWebAccess(id, "invite");
    raw.prepare("UPDATE customer_commercial_profiles SET dealer_status = 'inactive' WHERE customer_id = ?").run(id);
    assert.equal(database.getDealerWebAccess(id).enabled, false);
    raw.prepare("UPDATE customer_commercial_profiles SET dealer_status = 'active' WHERE customer_id = ?").run(id);
    assert.equal(database.getDealerWebAccess(id).enabled, true, "reactivation restores eligibility without old invitation");
    raw.prepare("UPDATE customer_commercial_profiles SET dealer_status = 'active' WHERE customer_id = ?").run(id); database.changeDealerWebAccess(id, "invite");
    raw.exec("UPDATE settings SET dealer_portal_enabled = 0");
    assert.equal(database.createDealerAccessProjection().enabled, false);
    assert.equal(database.getDealerWebAccess(id).enabled, false);
    assert.throws(() => database.changeDealerWebAccess(id, "invite"), /Servisler/);
    raw.prepare("UPDATE customer_commercial_profiles SET company_name='Edited while portal off' WHERE customer_id=?").run(id);
    raw.exec("UPDATE settings SET dealer_portal_enabled = 1");
    database.changeDealerWebAccess(id, "invite");
    raw.exec("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.wholesale'");
    assert.equal(database.createDealerAccessProjection().enabled, false);
    assert.throws(() => database.changeDealerWebAccess(id, "invite"), /etkin değil/);
    raw.exec("UPDATE business_capabilities SET is_enabled = 1 WHERE capability_id = 'commerce.wholesale'");
    assert.equal(database.getDealerWebAccess(id).enabled, true);
    database.changeDealerWebAccess(id, "invite");
    const beforeRestore = database.getDealerWebAccess(id).accessRevision;
    database.beginRestoreReconciliation("fixture-restore-dealer", "desktop-restore-dealer");
    assert.equal(database.getDealerWebAccess(id).enabled, true, "restore preserves canonical access intent; hosting sessions are epoch-fenced on normal apply");
    assert.equal(database.getDealerWebAccess(id).accessRevision, beforeRestore, "restore does not invent a wall-clock access revision");
    raw.prepare("DELETE FROM customer_commercial_profiles WHERE customer_id = ?").run(id);
    assert.equal(database.getDealerWebAccess(id).enabled, false);
    const job = database.getPendingSyncJobs().find((job) => job.jobType === "dealer_access_publish");
    assert.ok(job);
    database.completeSyncJob(job.jobKey, job.sourceRevision);
    raw.prepare("UPDATE customers SET full_name = 'Updated dealer' WHERE id = ?").run(id);
    const next = database.getPendingSyncJobs().find((job) => job.jobType === "dealer_access_publish");
    assert.ok(next.sourceRevision > job.sourceRevision, "outbox revision survives completion");
  } finally { raw.close(); }
  console.log("commerce-dealer-access-smoke-ok");
} finally {
  database.close(); rmSync(dataDir, { recursive: true, force: true });
}
