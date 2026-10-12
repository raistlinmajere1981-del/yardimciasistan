import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import { createTemporaryDesktopDatabase } from "./desktop-database.mjs";
import { createSmokeSetupInput } from "./desktop-setup.mjs";

const base = new URL("../../apps/desktop-app/dist-electron/", import.meta.url);
const require = createRequire(base);
const syncCore = require("@yardimci-asistan/sync-core");
const { BUSINESS_CAPABILITIES: C } = require("@yardimci-asistan/shared");
const { setBusinessCapability } = require(new URL("business-capability-store.js", base).pathname);
const pixels = Buffer.from("fixture decoded pixels");
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const deviceId = "android-image-ingress-fixture";
function productAction(overrides = {}) {
  const now = new Date().toISOString();
  return { id: "android-product-image-action", action_type: "market_product_create", device_id: deviceId,
    device_name: "Fixture", app_version: "fixture", created_at: now, last_seen_at: now,
    payload: { barcode: "8690000007199", name: "Fixture product", brand: "Fixture brand", sku: "fixture",
      purchase_price: 4.5, sale_price: 7.5, currency: "TRY", unit: "piece", track_inventory: true,
      image_source_url: "https://images.openfoodfacts.org/fixture.jpg", data_source: "open_food_facts",
      source_product_url: "https://world.openfoodfacts.org/product/8690000007199", data_license: "ODbL",
      image_license: "CC BY-SA", source_fetched_at: "2026-10-12T00:00:00.000Z", ...overrides } };
}

function fixture(mode, action = productAction()) {
  const temporary = createTemporaryDesktopDatabase("android-image-ingress-"), db = temporary.database;
  db.initialize();
  const setup = createSmokeSetupInput({ businessName: "Ingress fixture", profileId: "market", phone: "", whatsapp: "",
    syncSecret: "image-ingress-secret", servicePreferences: { android: true, whatsapp: false },
    productData: { enabled: true, provider: "open_food_facts", includeImages: true, autoSearchUnknownBarcode: true },
    initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] });
  assert.equal(db.saveInitialSetup(setup).ok, true);
  setBusinessCapability(db.databasePath, { capability: C.ANDROID, enabled: true });
  db.upsertAndroidDeviceSightings([{ device_id: deviceId, device_name: "Fixture", app_version: "fixture", first_seen_at: action.created_at, last_seen_at: action.created_at }]);
  assert.equal(db.setAndroidDeviceActive(deviceId, true).ok, true);
  assert.equal(db.setAndroidDevicePermissionGroups(deviceId, { service_orders: false, cashier: false, rooms_tasks: false, customer_reservation: false, market_operations: true }).ok, true);
  const raw = new DatabaseSync(db.databasePath), logs = [], order = [], acks = [];
  const state = { imageFailure: "", ackFailure: false, suspended: false, pulls: 0, downloads: 0 };
  const row = () => raw.prepare("SELECT * FROM catalog_products WHERE barcode=? AND deleted_at='' ").get(action.payload.barcode);
  const receipt = () => raw.prepare("SELECT * FROM android_action_receipts WHERE id=?").get(action.id);
  const apply = db.applyAndroidAction.bind(db), record = db.recordAndroidActionResult.bind(db);
  db.applyAndroidAction = (item) => { const result = apply(item); order.push("apply"); return result; };
  db.recordAndroidActionResult = (...args) => { record(...args); order.push("record"); };
  const pull = async () => { state.pulls++; return { ok: true, count: 1, actions: [action], devices: [] }; };
  const complete = async (input) => {
    order.push("ack"); acks.push(input);
    assert.equal(Boolean(receipt()), input.status === "applied", "ACK follows the committed apply/receipt outcome");
    if (row()?.image_asset_path) assert.ok(existsSync(join(dirname(db.databasePath), row().image_asset_path)), "ACK cannot precede durable image file");
    return state.ackFailure ? { ok: false, message: "fixture ACK lost" } : { ok: true };
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const url = new URL(`${file}.js`, base), localRequire = createRequire(url);
    runInNewContext(readFileSync(url, "utf8"), { exports, Buffer, Error, URL, process, setTimeout, clearTimeout, AbortController,
      fetch: async () => {
        state.downloads++; order.push("image");
        assert.ok(receipt(), "receipt commits atomically with product before optional acquisition");
        assert.ok(row(), "image download follows product commit");
        assert.equal(order.at(-2), "record");
        assert.equal(row().image_asset_path, "");
        if (state.imageFailure === "download") return new Response("unavailable", { status: 404 });
        return new Response(pixels, { headers: { "content-type": "image/jpeg" } });
      },
      require: (name) => {
        if (name === "electron") return { app: { getVersion: () => "fixture" }, nativeImage: {
          createFromBuffer: (bytes) => ({ isEmpty: () => !Buffer.from(bytes).equals(pixels), getSize: () => ({ width: 1, height: 1 }), toJPEG: () => jpeg })
        } };
        if (name === "./desktop-logger") return { desktopLog: { info: (event) => logs.push(event), warn: (event) => logs.push(event), error: (event) => logs.push(event) }, createDiagnosticOperationId: () => "fixture" };
        if (name === "@yardimci-asistan/sync-core") return { ...syncCore, pullAndroidActions: pull, markAndroidActionResult: complete };
        if (name === "./product-data-service") return load("product-data-service");
        return localRequire(name);
      }
    });
    return exports;
  }
  const coordinator = new (load("sync-coordinator").SyncCoordinator)({ database: db });
  const manual = new (load("android-action-sync-service").AndroidActionSyncService)({ database: db,
    isSuspended: () => state.suspended, markLocalSnapshotDirty() {}, notifyDashboardChanged() {} });
  const run = () => mode === "automatic" ? coordinator.processAndroidActions({ pullAndroidActions: pull, completeAndroidAction: complete }) : manual.processQueue(false);
  const fileCount = () => {
    const directory = join(dirname(db.databasePath), "assets/products", row().id);
    return existsSync(directory) ? readdirSync(directory).length : 0;
  };
  return { db, raw, state, logs, order, acks, row, receipt, run, fileCount,
    close: () => { raw.close(); temporary.cleanup(); } };
}

export async function verifyAndroidProductImageIngress() {
  const projections = [];
  const equivalentAction = productAction();
  for (const mode of ["automatic", "manual"]) {
    const f = fixture(mode, equivalentAction);
    try {
      assert.equal((await f.run()).applied, 1);
      assert.ok(f.row().image_asset_path, `${mode}: product image must be archived before ACK`);
      assert.deepEqual(readFileSync(join(dirname(f.db.databasePath), f.row().image_asset_path)), jpeg);
      assert.deepEqual(f.order, ["apply", "record", "image", "ack"]);
      assert.equal(f.fileCount(), 1);
      const { id, business_id, created_at, updated_at, image_asset_path, ...projection } = f.row();
      assert.ok(id && business_id && created_at && updated_at && image_asset_path);
      projections.push(projection);
      const originalRow = f.row(), originalReceipt = f.receipt();
      f.state.imageFailure = "download";
      await f.run();
      assert.deepEqual(f.row(), originalRow, "replay preserves product and immutable image reference");
      assert.deepEqual(f.receipt(), originalReceipt);
      assert.equal(f.state.downloads, 1, "successful replay never contacts a now-unavailable source");
      assert.equal(f.fileCount(), 1);
      assert.equal(f.raw.prepare("SELECT COUNT(*) AS count FROM catalog_products").get().count, 1);
    } finally { f.close(); }

    for (const failure of ["download", "archive"]) {
      const f = fixture(mode);
      try {
        f.state.imageFailure = failure;
        const blocked = join(dirname(f.db.databasePath), "assets/products");
        if (failure === "archive") { mkdirSync(dirname(blocked), { recursive: true }); writeFileSync(blocked, "fixture obstruction"); }
        assert.equal((await f.run()).applied, 1);
        assert.ok(f.receipt()); assert.equal(f.row().image_asset_path, "");
        assert.equal(f.acks.at(-1).status, "applied", "optional image failure preserves existing action apply contract");
        assert.ok(f.logs.some((event) => event.scope === "product-data" && event.event === "product-data.image-archive.failed" && event.error), "image failure must remain visible");
        const receipt = f.receipt();
        f.state.ackFailure = true; await f.run();
        assert.deepEqual(f.receipt(), receipt);
        if (failure === "archive") rmSync(blocked);
        f.state.imageFailure = ""; f.state.ackFailure = false;
        await f.run();
        assert.ok(f.row().image_asset_path, "ACK-loss replay can repair an unarchived optional image");
        assert.deepEqual(f.receipt(), receipt); assert.equal(f.fileCount(), 1);
        assert.equal(f.raw.prepare("SELECT COUNT(*) AS count FROM catalog_products").get().count, 1);
      } finally { f.close(); }
    }
    const ackLost = fixture(mode);
    try {
      ackLost.state.ackFailure = true; await ackLost.run();
      const row = ackLost.row(), receipt = ackLost.receipt();
      assert.ok(row.image_asset_path);
      ackLost.state.ackFailure = false; ackLost.state.imageFailure = "download";
      await ackLost.run();
      assert.deepEqual(ackLost.row(), row); assert.deepEqual(ackLost.receipt(), receipt);
      assert.equal(ackLost.state.downloads, 1); assert.equal(ackLost.fileCount(), 1);
      assert.equal(ackLost.acks.length, 2);
    } finally { ackLost.close(); }
    const noImage = fixture(mode, productAction({ image_source_url: "" }));
    try {
      assert.equal((await noImage.run()).applied, 1);
      assert.equal(noImage.row().image_asset_path, ""); assert.equal(noImage.state.downloads, 0);
      assert.deepEqual(noImage.order, ["apply", "record", "ack"]);
    } finally { noImage.close(); }
    const rejected = fixture(mode, productAction({ name: "" }));
    try {
      assert.equal((await rejected.run()).failed, 1);
      assert.equal(rejected.row(), undefined); assert.equal(rejected.receipt(), undefined);
      assert.equal(rejected.state.downloads, 0); assert.equal(rejected.acks.at(-1).status, "failed");
    } finally { rejected.close(); }
    const otherAction = productAction();
    otherAction.action_type = "market_barcode_scan";
    otherAction.payload = { barcode: "8690000007199", scanned_at: new Date().toISOString() };
    const other = fixture(mode, otherAction);
    try {
      assert.equal((await other.run()).applied, 1); await other.run();
      assert.equal(other.state.downloads, 0);
      assert.equal(other.raw.prepare("SELECT COUNT(*) AS count FROM market_barcode_scan_events").get().count, 1);
    } finally { other.close(); }
    const disabled = fixture(mode);
    try {
      setBusinessCapability(disabled.db.databasePath, { capability: C.ANDROID, enabled: false });
      assert.equal((await disabled.run()).pulled, 0); assert.equal(disabled.state.pulls, 0);
    } finally { disabled.close(); }
    if (mode === "manual") {
      const suspended = fixture(mode);
      try {
        suspended.state.suspended = true;
        assert.equal((await suspended.run()).pulled, 0);
        assert.equal(suspended.state.pulls, 0);
      } finally { suspended.close(); }
    }
  }
  assert.deepEqual(projections[0], projections[1], "manual and automatic persistent product/provenance results are equivalent");
  console.log("Android product image ingress: both paths, persistent equivalence, optional failures, replay/ACK loss and other actions passed.");
}
