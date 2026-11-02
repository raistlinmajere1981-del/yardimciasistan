import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { Writable, PassThrough } from "node:stream";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, truncateSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exactFixtureReceipt } from "./test-helpers/publication-protocol.mjs";

const require = createRequire(import.meta.url);
const { Transformer } = require("@napi-rs/image");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { saveRuntimeCatalogProduct } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { prepareProductMedia, prepareOnlineProductMedia } = require("../apps/desktop-app/dist-electron/product-media-publication.js");
const { prepareDealerProductMedia } = require("../apps/desktop-app/dist-electron/dealer-product-media-publication.js");
const { SyncOutboxPublisher } = require("../apps/desktop-app/dist-electron/sync-outbox-publisher.js");
const uploader = require("../apps/desktop-app/dist-electron/public-resource-media-publication.js");
const realUpload = uploader.uploadPublicResourceMediaFile;
const originalFetch = globalThis.fetch;
const http = require("node:http");
const originalRequest = http.request;
const root = mkdtempSync(join(tmpdir(), "ya-product-media-publication-"));
const options = { appPath: join(process.cwd(), "apps/desktop-app"), userDataPath: root };
let database = new DesktopDatabase(options), raw;
const config = { baseUrl: "https://media.example/module", syncSecret: "fixture-secret" };
const image = Transformer.fromRgbaPixels(Buffer.from([80, 120, 200, 255]), 1, 1).pngSync();
const bytes = Array.from({ length: 15 }, (_, i) => Transformer.fromRgbaPixels(Buffer.from([i * 15, 120, 200, 255]), 1, 1).pngSync());
const hash = buffer => createHash("sha256").update(buffer).digest("hex");
const uploads = [];
const upload = async (settings, client, endpoint, field, absolute, asset, _messages, verifiedBytes) => {
  assert.equal(endpoint, "/api/product-media.php"); assert.equal(field, "product_id");
  assert.equal(client, database.getSyncRuntimeStatus().clientId);
  assert.equal(asset.contentHash, hash(verifiedBytes)); assert.equal(asset.id, asset.contentHash);
  assert.equal(asset.mimeType, "image/png"); assert.ok(readFileSync(absolute).equals(verifiedBytes));
  uploads.push({ target: settings.baseUrl, asset });
  return { ok: true, status: 200, message: "fixture", url: `/module/media/products/${asset.resourceId}/${asset.contentHash}.png` };
};
const revision = (key = "online_catalog") => Number(raw.prepare("SELECT source_revision FROM sync_outbox WHERE job_key=?").get(key)?.source_revision);
const due = () => raw.exec("UPDATE sync_outbox SET next_attempt_at='' WHERE job_key='online_catalog'");
const archives = (product, count = 2) => bytes.slice(0, count).map((buffer, index) => {
  const assetPath = `assets/products/${product.id}/original-${index}.png`;
  mkdirSync(join(root, "assets/products", product.id), { recursive: true });
  writeFileSync(join(root, assetPath), buffer);
  return { assetPath, hash: hash(buffer), format: "image/png" };
});
const setArchives = (product, originals, legacy = "") => raw.prepare("UPDATE catalog_products SET image_original_assets_json=?,image_asset_path=? WHERE id=?")
  .run(JSON.stringify(originals), legacy, product.id);
const gallery = (prepared, product) => { assert.equal(prepared.ok, true, prepared.message); return prepared.value.products.find(p => p.productId === product.id).imageUrls; };
const expectedUrls = (product, originals) => [...new Set(originals.map(asset => `${config.baseUrl}/media/products/${product.id}/${asset.hash}.png`))];
try {
  database.initialize();
  const setup = database.saveInitialSetup({ businessName: "Shared product media", profileId: "market",
    profileOptions: ["channel.online_sales", "commerce.wholesale"], dealerPortalEnabled: true, onlineSalesDeliveryEnabled: true,
    phone: "", whatsapp: "", email: "", address: "", webModuleUrl: config.baseUrl, syncSecret: config.syncSecret,
    autoSyncEnabled: false, aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "", aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] });
  assert.equal(setup.ok, true, setup.message);
  raw = new DatabaseSync(database.databasePath);
  const input = { name: "Shared gallery", salePrice: 30, purchasePrice: 10, dealerPriceA: 25, dealerPriceB: null,
    unit: "piece", currency: "TRY", taxRate: 20, trackInventory: false, isActive: true };
  const product = saveRuntimeCatalogProduct(database.databasePath, input);
  const hidden = saveRuntimeCatalogProduct(database.databasePath, { ...input, name: "Unpublished", onlineSalesPublished: false });
  const inactive = saveRuntimeCatalogProduct(database.databasePath, { ...input, name: "Inactive", isActive: false });
  const originals = archives(product);
  setArchives(product, originals);
  setArchives(hidden, [{ ...originals[0], assetPath: `assets/products/${hidden.id}/missing.png` }]);
  setArchives(inactive, [{ ...originals[0], assetPath: `assets/products/${inactive.id}/missing.png` }]);
  const before = revision();
  const first = await prepareOnlineProductMedia(database, config, before, upload);
  assert.deepEqual(gallery(first, product), expectedUrls(product, originals));
  assert.equal(first.value.products[0].imageUrl, first.value.products[0].imageUrls[0]);
  assert.equal(uploads.length, 2, "retail uploads only explicitly published active products");
  assert.equal(revision(), before, "media acknowledgements never allocate a new revision");
  assert.equal(JSON.stringify(first).includes("assets/products/"), false);
  database.saveCommerceProductPublication({ productId: hidden.id, isPublished: true });
  assert.equal((await prepareOnlineProductMedia(database, config, revision(), upload)).ok, false, "missing cover fails, including after a valid earlier product");
  database.saveCommerceProductPublication({ productId: hidden.id, isPublished: false });
  raw.prepare("UPDATE catalog_products SET is_active=0 WHERE id=?").run(hidden.id); // Dealer channel uses all active products.
  const customer = database.saveCustomer({ fullName: "Shared media dealer", phone: "", email: "shared-media-dealer@example.test", notes: "", tags: [],
    identityType: "", identityNumber: "", nationality: "", birthDate: "", gender: "", address: "",
    commercialProfile: { companyName: "Fixture", dealerStatus: "active", priceGroup: "dealer_a" } });
  assert.equal(customer.ok, true, customer.message);
  assert.equal(database.createDealerAccessProjection().catalogs.length, 0, "unlinked dealer gets no private catalog");
  const dealerAccountId = "acct-shared-media-dealer";
  raw.prepare("INSERT INTO web_customer_accounts (account_id, email, full_name, status) VALUES (?, ?, ?, 'conflict')")
    .run(dealerAccountId, "shared-media-dealer@example.test", "Shared media dealer");
  database.changeDealerWebAccess(customer.savedId, { type: "link", accountId: dealerAccountId });
  assert.equal(database.getDealerWebAccess(customer.savedId).accountId, dealerAccountId);
  const dealer = await prepareDealerProductMedia(database, config, revision("dealer_access"), upload);
  assert.equal(dealer.ok, true, dealer.message);
  assert.deepEqual(dealer.value.catalogs[0].products.find(p => p.product_id === product.id).image_urls, expectedUrls(product, originals));
  assert.equal(uploads.length, 2, "dealer reuses retail target/product/hash receipts");

  raw.close(); database.close();
  database = new DesktopDatabase(options); database.initialize(); raw = new DatabaseSync(database.databasePath);
  assert.deepEqual(gallery(await prepareOnlineProductMedia(database, config, revision(), upload), product), expectedUrls(product, originals));
  assert.equal(uploads.length, 2, "upload cache survives a real database reopen");
  setArchives(product, [originals[1], originals[0], originals[1]]);
  assert.deepEqual(gallery(await prepareOnlineProductMedia(database, config, revision(), upload), product), expectedUrls(product, [originals[1], originals[0]]));
  assert.equal(uploads.length, 2, "cover reordering and duplicate hashes never upload again");

  const twelve = archives(product, 12);
  setArchives(product, twelve);
  assert.equal(gallery(await prepareOnlineProductMedia(database, config, revision(), upload), product).length, 12);
  assert.equal(uploads.length, 12);
  setArchives(product, archives(product, 13));
  assert.equal((await prepareOnlineProductMedia(database, config, revision(), upload)).ok, false, "13 archives fail instead of truncating");
  assert.equal(uploads.length, 12);
  setArchives(product, originals);
  for (const index of [0, 1]) {
    rmSync(join(root, originals[index].assetPath));
    raw.prepare("UPDATE catalog_products SET image_source_url='https://source.example/different.png' WHERE id=?").run(product.id);
    assert.equal((await prepareOnlineProductMedia(database, config, revision(), upload)).ok, false, `missing original ${index} never succeeds using a cache or unrelated source`);
    writeFileSync(join(root, originals[index].assetPath), bytes[index]);
  }
  const invalidCases = [
    [{ ...originals[0], hash: "0".repeat(64) }, "wrong SHA"],
    [{ ...originals[0], format: "image/jpeg" }, "MIME mismatch"],
    [{ ...originals[0], assetPath: `assets/products/${hidden.id}/original-0.png` }, "cross-product path"],
    [{ ...originals[0], assetPath: `assets/products/${product.id}/../original-0.png` }, "traversal"],
    [{ ...originals[0], assetPath: `/private/${product.id}/original.png` }, "absolute path"]
  ];
  for (const [asset, label] of invalidCases) {
    setArchives(product, [asset, originals[1]]);
    assert.equal((await prepareOnlineProductMedia(database, config, revision(), upload)).ok, false, label);
  }
  const absolute = join(root, originals[0].assetPath);
  rmSync(absolute); symlinkSync(join(root, originals[1].assetPath), absolute);
  setArchives(product, originals);
  assert.equal((await prepareOnlineProductMedia(database, config, revision(), upload)).ok, false, "symlinks fail even inside the product root");
  rmSync(absolute); writeFileSync(absolute, Buffer.from("not an image"));
  setArchives(product, [{ ...originals[0], hash: hash(readFileSync(absolute)) }]);
  assert.equal((await prepareOnlineProductMedia(database, config, revision(), upload)).ok, false, "signature rejects arbitrary bytes with matching hash");
  writeFileSync(absolute, image.subarray(0, 24));
  setArchives(product, [{ ...originals[0], hash: hash(readFileSync(absolute)) }]);
  assert.equal((await prepareOnlineProductMedia(database, config, revision(), upload)).ok, false, "truncated PNG fails decoding");
  truncateSync(absolute, 0);
  assert.equal((await prepareOnlineProductMedia(database, config, revision(), upload)).ok, false, "empty file fails before upload");
  truncateSync(absolute, 5 * 1024 * 1024 + 1);
  assert.equal((await prepareOnlineProductMedia(database, config, revision(), upload)).ok, false, "byte limit is checked before upload");
  writeFileSync(absolute, bytes[0]);
  setArchives(product, [], originals[0].assetPath);
  assert.deepEqual(gallery(await prepareOnlineProductMedia(database, config, revision(), upload), product), expectedUrls(product, [originals[0]]), "legacy single cover reuses its SHA receipt");
  setArchives(product, []);
  assert.deepEqual(gallery(await prepareOnlineProductMedia(database, config, revision(), upload), product), ["https://source.example/different.png"], "source-only fallback");
  for (const value of ["file:///private/photo.png", "http://source.example/a.png", "https://127.0.0.1/a.png", "https://10.0.0.1/a.png", "https://[::1]/a.png", "https://image.internal/a.png", "https://user:secret@source.example/a.png", "https://source.example/a.png?token=private"]) {
    raw.prepare("UPDATE catalog_products SET image_source_url=? WHERE id=?").run(value, product.id);
    assert.deepEqual(gallery(await prepareOnlineProductMedia(database, config, revision(), upload), product), [], value);
  }

  const mixed = [originals[0]];
  for (const [format, extension, buffer] of [
    ["image/jpeg", "jpg", Transformer.fromRgbaPixels(Buffer.from([80, 100, 200, 255]), 1, 1).jpegSync()],
    ["image/webp", "webp", Transformer.fromRgbaPixels(Buffer.from([80, 100, 200, 255]), 1, 1).webpSync()]
  ]) {
    const assetPath = `assets/products/${product.id}/mixed.${extension}`;
    writeFileSync(join(root, assetPath), buffer);
    mixed.push({ assetPath, hash: hash(buffer), format });
  }
  setArchives(product, mixed);
  const mixedResult = await prepareOnlineProductMedia(database, config, revision(), async (settings, _client, _endpoint, _field, _absolute, asset, _messages, checked) => {
    assert.equal(asset.contentHash, hash(checked));
    const extension = asset.mimeType === "image/jpeg" ? "jpg" : "webp";
    return { ok: true, status: 200, url: `${settings.baseUrl}/media/products/${product.id}/${asset.contentHash}.${extension}` };
  });
  assert.deepEqual(gallery(mixedResult, product), mixed.map(asset => `${config.baseUrl}/media/products/${product.id}/${asset.hash}.${asset.format === "image/jpeg" ? "jpg" : asset.format === "image/webp" ? "webp" : "png"}`));

  setArchives(product, originals);
  let partialCalls = 0;
  const partialTarget = { ...config, baseUrl: "https://retry.example/module" };
  const partialUpload = async (...args) => ++partialCalls === 2 ? { ok: false, status: 503, message: "offline" } : upload(...args);
  const failed = await prepareOnlineProductMedia(database, partialTarget, revision(), partialUpload);
  assert.equal(failed.ok, false); assert.equal(failed.status, 503);
  assert.equal(database.readPreparedSyncPublication("online_catalog_publish", revision()), null, "partial gallery never freezes");
  const countAfterFailure = uploads.length;
  raw.close(); database.close();
  database = new DesktopDatabase(options); database.initialize(); raw = new DatabaseSync(database.databasePath);
  assert.equal((await prepareOnlineProductMedia(database, partialTarget, revision(), upload)).ok, true);
  assert.equal(uploads.length, countAfterFailure + 1, "retry after restart uploads only the unacknowledged remaining image");
  const simultaneous = { ...config, baseUrl: "https://parallel.example/module" };
  const countBeforeConcurrent = uploads.length;
  const [retailConcurrent, dealerConcurrent] = await Promise.all([
    prepareOnlineProductMedia(database, simultaneous, revision(), upload),
    prepareDealerProductMedia(database, simultaneous, revision("dealer_access"), upload)
  ]);
  assert.equal(retailConcurrent.ok, true); assert.equal(dealerConcurrent.ok, true);
  assert.equal(uploads.length, countBeforeConcurrent + 2, "simultaneous channels share each in-flight upload");
  assert.equal((await prepareOnlineProductMedia(database, simultaneous, revision(), upload)).ok, true);
  assert.equal(uploads.length, countBeforeConcurrent + 2, "dealer/retail receipts are reusable in both directions");

  for (const target of ["http://media.example/module", "https://127.0.0.1/module", "https://media.internal/module", "https://user:secret@media.example/module", "https://media.example/module?key=private"]) {
    assert.equal((await prepareProductMedia(database, { ...config, baseUrl: target }, [product.id], upload)).ok, false, target);
  }
  for (const url of ["https://other.example/module/media/products/", "https://media.example/other/media/products/", "https://user:secret@media.example/module/media/products/"]) {
    assert.equal((await prepareProductMedia(database, { ...config, baseUrl: "https://untrusted.example/module" }, [product.id], async () => ({ ok: true, url: `${url}${product.id}/${originals[0].hash}.png`, status: 200 }))).ok, false);
  }
  for (const suffix of [`${originals[0].hash}.jpg`, `${"0".repeat(64)}.png`, `${originals[0].hash}.png?token=private`]) {
    assert.equal((await prepareProductMedia(database, { ...config, baseUrl: "https://untrusted.example/module" }, [product.id], async () => ({
      ok: true, url: `https://untrusted.example/module/media/products/${product.id}/${suffix}`, status: 200
    }))).ok, false, "same-origin receipt must match exact hash and actual image type without private parameters");
  }
  raw.prepare("UPDATE catalog_product_media_publications SET public_url='https://private.internal/leak.png' WHERE product_id=? AND target=?").run(product.id, config.baseUrl);
  assert.equal((await prepareOnlineProductMedia(database, config, revision(), upload)).ok, false, "cached acknowledgements are revalidated on reads");
  raw.prepare("DELETE FROM catalog_product_media_publications WHERE product_id=? AND target=?").run(product.id, config.baseUrl);
  assert.equal((await prepareOnlineProductMedia(database, config, revision(), upload)).ok, true);

  const frozenRevision = revision();
  const prepared = await prepareOnlineProductMedia(database, config, frozenRevision, upload);
  database.prepareSyncPublication("online_catalog_publish", prepared.value, false, frozenRevision);
  rmSync(absolute);
  assert.deepEqual((await prepareOnlineProductMedia(database, config, frozenRevision, () => assert.fail("frozen retry uploaded"))).value, prepared.value);
  writeFileSync(absolute, bytes[0]);
  setArchives(product, [originals[1], originals[0]]);
  assert.equal(database.readPreparedSyncPublication("online_catalog_publish", revision()), null, "photo edit invalidates frozen retail revision");
  const receiptsBeforeGate = raw.prepare("SELECT COUNT(*) AS n FROM catalog_product_media_publications").get().n;
  setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: false });
  const off = await prepareOnlineProductMedia(database, config, revision(), () => assert.fail("disabled channel uploaded"));
  assert.equal(off.ok, true); assert.equal(off.value.enabled, false); assert.deepEqual(off.value.products, []);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM catalog_product_media_publications").get().n, receiptsBeforeGate, "capability OFF retains durable media");
  setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: true });

  // Exercise the real outbox publisher, uploader seam and exact wire receipt.
  raw.exec("DELETE FROM sync_outbox WHERE job_key!='online_catalog'");
  database.ensurePublicationTarget(config.baseUrl);
  database.savePublicationSourceEpoch(config.baseUrl, 1);
  let failPost = true;
  const sent = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === "publish_online_catalog") sent.push(body);
    if (failPost) return Response.json({ ok: false, message: "offline" }, { status: 503 });
    return Response.json({ ok: true, ...exactFixtureReceipt(body) });
  };
  uploader.uploadPublicResourceMediaFile = upload;
  let liveConfig = config;
  const publisher = new SyncOutboxPublisher({ database, getSyncConfig: () => liveConfig, createAndroidSnapshot: () => ({}), onDashboardChanged: () => {} }, () => false, () => "fixture", () => {});
  publisher.setSupportedFeatures(["online_catalog_v1"]);
  const oldRevision = revision();
  await publisher.publishOutbox({});
  assert.equal(sent.length, 1); assert.equal(revision(), oldRevision);
  assert.equal(raw.prepare("SELECT attempt_count FROM sync_outbox WHERE job_key='online_catalog'").get().attempt_count, 1);
  const immutable = database.readPreparedSyncPublication("online_catalog_publish", oldRevision);
  assert.ok(immutable);
  due(); failPost = false;
  await publisher.publishOutbox({});
  assert.equal(sent.length, 2); assert.deepEqual(sent[1], sent[0], "offline retry keeps exact payload/revision/key");
  assert.deepEqual(sent[1].online_catalog.products[0].image_urls, expectedUrls(product, [originals[1], originals[0]]));

  // Interrupted offline work followed by a photo edit must not replay the old body.
  raw.exec("DELETE FROM sync_outbox WHERE job_key!='online_catalog'");
  setArchives(product, originals); failPost = true;
  await publisher.publishOutbox({});
  const stale = sent.at(-1);
  setArchives(product, [originals[1]]); failPost = false;
  await publisher.publishOutbox({});
  assert.ok(sent.at(-1).source_revision > stale.source_revision);
  assert.deepEqual(sent.at(-1).online_catalog.products[0].image_urls, expectedUrls(product, [originals[1]]));
  raw.exec("DELETE FROM sync_outbox WHERE job_key!='online_catalog'");
  setArchives(product, [...originals, archives(product, 13)[12]]);
  let changedDuringUpload = false;
  uploader.uploadPublicResourceMediaFile = async (...args) => {
    const result = await upload(...args);
    if (!changedDuringUpload) { changedDuringUpload = true; setArchives(product, [originals[1], originals[0]]); }
    return result;
  };
  const sentBeforeRace = sent.length;
  await publisher.publishOutbox({});
  assert.equal(changedDuringUpload, true);
  assert.equal(sent.length, sentBeforeRace, "photo mutation during upload cannot freeze/send under a newer revision");
  uploader.uploadPublicResourceMediaFile = upload;
  await publisher.publishOutbox({});
  assert.equal(sent.length, sentBeforeRace + 1);

  // Changing the target while upload awaits must not send to the previous target.
  raw.exec("DELETE FROM sync_outbox WHERE job_key!='online_catalog'");
  setArchives(product, [...originals, archives(product, 14)[13]]);
  uploader.uploadPublicResourceMediaFile = async (...args) => { const result = await upload(...args); liveConfig = { ...config, baseUrl: "https://changed.example/module" }; return result; };
  const beforeTargetChange = sent.length;
  await publisher.publishOutbox({});
  assert.equal(sent.length, beforeTargetChange);
  liveConfig = config;
  setArchives(product, [...originals, archives(product, 15)[14]]);
  uploader.uploadPublicResourceMediaFile = async (...args) => {
    const result = await upload(...args);
    setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: false });
    return result;
  };
  await publisher.publishOutbox({});
  assert.equal(sent.length, beforeTargetChange, "capability withdrawal during upload prevents sending enabled data");
  setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: false });
  uploader.uploadPublicResourceMediaFile = () => assert.fail("outbox capability OFF uploaded");
  await publisher.publishOutbox({});
  assert.equal(sent.at(-1).online_catalog.enabled, false);
  assert.equal(sent.at(-1).online_catalog.products.length, 0);
  setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: true });
  publisher.setSupportedFeatures([]);
  const beforeUnsupported = sent.length;
  await publisher.publishOutbox({});
  assert.equal(sent.length, beforeUnsupported, "unsupported hosting feature neither uploads nor sends retail");
  assert.ok(raw.prepare("SELECT next_attempt_at FROM sync_outbox WHERE job_key='online_catalog'").get().next_attempt_at > new Date().toISOString());
  publisher.setSupportedFeatures(["online_catalog_v1"]);
  setArchives(product, originals);
  raw.prepare("DELETE FROM sync_publication_sources WHERE target=?").run(config.baseUrl);
  uploader.uploadPublicResourceMediaFile = upload;
  let activated = false;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.action, "activate_publication_source", "superseded body must not be sent after activation");
    activated = true;
    setArchives(product, [originals[1]]);
    return Response.json({ ok: true, source_client_id: body.client_id, source_epoch: 1, activation_key: body.activation_key });
  };
  raw.exec("DELETE FROM sync_outbox WHERE job_key!='online_catalog'");
  await publisher.publishOutbox({});
  assert.equal(activated, true, "fixture crossed the asynchronous activation boundary");
  assert.equal(sent.length, beforeUnsupported);

  // The shared multipart transport sends verified bytes even if the path changes.
  let received;
  http.request = (_url, requestOptions, onResponse) => {
    const chunks = [];
    const request = new Writable({
      write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); },
      final(done) {
        received = Buffer.concat(chunks);
        assert.equal(received.length, Number(requestOptions.headers["Content-Length"]));
        const response = new PassThrough(); response.statusCode = 200;
        onResponse(response); response.end(JSON.stringify({ ok: true, url: "/media/photo.png" })); done();
      }
    });
    request.setTimeout = () => request;
    return request;
  };
  writeFileSync(absolute, Buffer.from("replaced after verification"));
  const result = await realUpload({ baseUrl: "http://127.0.0.1", syncSecret: "fixture" }, "fixture-client", "/api/product-media.php", "product_id", absolute,
    { id: originals[0].hash, resourceId: product.id, kind: "photo", mimeType: "image/png", originalName: "photo.png", contentHash: originals[0].hash },
    { success: "ok", httpFailure: () => "failed", connectionFailure: "failed", readFailure: "failed", fallbackFileName: "photo" }, bytes[0]);
  assert.equal(result.ok, true); assert.ok(received.includes(bytes[0]));
  assert.equal(received.includes(Buffer.from("replaced after verification")), false);
  console.log("commerce-product-media-publication-smoke-ok: cross-channel reuse, ordered 1-12 gallery, byte/SHA/MIME/path safety, durable partial retry, frozen offline retry, revision/target/capability fencing");
} finally {
  uploader.uploadPublicResourceMediaFile = realUpload; globalThis.fetch = originalFetch; http.request = originalRequest;
  raw?.close(); database.close(); rmSync(root, { recursive: true, force: true });
}
