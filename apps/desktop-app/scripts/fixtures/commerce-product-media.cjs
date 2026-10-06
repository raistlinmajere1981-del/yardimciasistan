const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { runInNewContext } = require("node:vm");
const { createRequire } = require("node:module");
const { DatabaseSync } = require("node:sqlite");
const { app, nativeImage } = require("electron");
const { DesktopDatabase } = require("../../dist-electron/database.js");
const runtime = require("../../dist-electron/commerce-runtime.js");
const media = require("../../dist-electron/product-data-service.js");
const root = process.env.MEDIA_TEST_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), "product-media-"));
fs.mkdirSync(path.join(root, "electron"), { recursive: true });
app.setPath("userData", path.join(root, "electron"));
const dataUrl = color => `data:image/png;base64,${nativeImage.createFromBitmap(Buffer.from(color), { width: 1, height: 1 }).toPNG().toString("base64")}`;
const replacement = () => dataUrl([0, 0, 255, 255]);
const abruptExit = () => process.kill(process.pid, "SIGKILL");

app.whenReady().then(async () => {
  if (process.env.MEDIA_CRASH_POINT) {
    const input = { id: process.env.MEDIA_PRODUCT_ID, name: "Crash replacement", trackInventory: false, manualImageDataUrl: replacement() };
    if (process.env.MEDIA_CRASH_POINT === "staged") fs.renameSync = source => {
      fs.writeFileSync(path.join(root, "crash.json"), JSON.stringify({ tempPath: source }));
      abruptExit();
    };
    const image = await runtime.prepareRuntimeCatalogProductImage(process.env.MEDIA_TEST_DATABASE_PATH, input);
    assert.ok(image?.assetPath);
    if (process.env.MEDIA_CRASH_POINT === "committed") runtime.saveRuntimeCatalogProduct(process.env.MEDIA_TEST_DATABASE_PATH, input, image);
    fs.writeFileSync(path.join(root, "crash.json"), JSON.stringify(image));
    abruptExit();
    return;
  }
  const database = new DesktopDatabase({ appPath: path.resolve("apps/desktop-app"), userDataPath: root });
  let raw;
  try {
    database.initialize();
    const setup = database.saveInitialSetup({ businessName: "Product media fixture", profileId: "market", phone: "", whatsapp: "", email: "", address: "",
      webModuleUrl: "https://example.test", syncSecret: "product-media-fixture-secret", autoSyncEnabled: false, aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "", aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30,
      aiApiKey: "", clearAiApiKey: false, servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] });
    assert.equal(setup.ok, true, setup.message);
    raw = new DatabaseSync(database.databasePath);
    // Exercise the actual IPC application path with real Electron decoding + SQLite/filesystem.
    const ipcFile = path.resolve("apps/desktop-app/dist-electron/commerce-ipc.js"), compiledRequire = createRequire(ipcFile);
    const exports = {}, handlers = new Map();
    runInNewContext(fs.readFileSync(ipcFile, "utf8"), { exports, Error, require: name => name === "electron"
      ? { ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) } } : compiledRequire(name) });
    let unlocked = true, mutations = 0;
    exports.registerCommerceIpcHandlers({ databasePath: () => database.databasePath, assertUnlocked: () => { if (!unlocked) throw new Error("session locked"); }, onMutation: () => { mutations++; } });
    const save = input => handlers.get("commerce:product:save")({}, input);
    const first = await save({ name: "Original", trackInventory: false, manualImageDataUrl: dataUrl([255, 0, 0, 255]) });
    assert.equal(first.ok, true);
    const id = first.value.id;
    const row = () => raw.prepare("SELECT * FROM catalog_products WHERE id=?").get(id);
    const absolute = relative => path.join(root, relative);
    const previousPath = first.value.imageAssetPath, previousBytes = fs.readFileSync(absolute(previousPath));
    const input = { id, name: "Updated", trackInventory: false, manualImageDataUrl: replacement() };
    const files = () => fs.readdirSync(path.dirname(absolute(previousPath)));

    const badPrepare = await save({ ...input, manualImageDataUrl: "invalid" });
    assert.equal(badPrepare.ok, true, "optional prepare failure preserves product-save UX");
    assert.equal(badPrepare.value.name, "Updated");
    assert.equal(row().image_asset_path, previousPath);
    assert.deepEqual(fs.readFileSync(absolute(previousPath)), previousBytes);

    const before = row();
    raw.exec("CREATE TRIGGER test_product_fail BEFORE UPDATE ON catalog_products BEGIN SELECT RAISE(ABORT,'injected_product'); END");
    await assert.rejects(save(input), /injected_product/);
    assert.deepEqual(row(), before);
    assert.deepEqual(fs.readFileSync(absolute(previousPath)), previousBytes, "DB failure never overwrites the valid image");
    assert.equal(files().length, 2, "uncommitted completed asset is only an orphan");
    raw.exec("DROP TRIGGER test_product_fail");
    media.cleanupOrphanProductImages(database.databasePath);
    assert.deepEqual(files(), [path.basename(previousPath)]);

    const rename = fs.renameSync;
    try {
      fs.renameSync = () => { throw new Error("injected_finalize"); };
      assert.equal((await save({ ...input, name: "Rename failed" })).ok, true);
    } finally { fs.renameSync = rename; }
    assert.equal(row().image_asset_path, previousPath, "rename failure occurs before the DB attachment");
    assert.deepEqual(fs.readFileSync(absolute(previousPath)), previousBytes);
    assert.equal(files().length, 1, "failed finalize removes the temporary file");

    for (const point of ["staged", "prepared", "committed"]) {
      const beforeCrash = row();
      const env = { ...process.env, MEDIA_TEST_ROOT: root, MEDIA_TEST_DATABASE_PATH: database.databasePath, MEDIA_PRODUCT_ID: id, MEDIA_CRASH_POINT: point };
      delete env.ELECTRON_RUN_AS_NODE;
      const result = spawnSync(process.execPath, ["--no-sandbox", __filename], { env, encoding: "utf8", timeout: 30000 });
      assert.equal(result.signal, "SIGKILL", result.stderr);
      const marker = JSON.parse(fs.readFileSync(path.join(root, "crash.json"), "utf8"));
      if (point === "committed") {
        assert.equal(row().image_asset_path, marker.assetPath);
        assert.ok(fs.existsSync(absolute(marker.assetPath)), "committed reference already has its durable file");
      } else {
        assert.deepEqual(row(), beforeCrash, "crash before commit preserves the canonical product + old image");
        assert.deepEqual(fs.readFileSync(absolute(previousPath)), previousBytes);
      }
      media.cleanupOrphanProductImages(database.databasePath);
      const current = row().image_asset_path;
      assert.ok(fs.existsSync(absolute(current)));
      assert.deepEqual(files(), [path.basename(current)], "restart cleanup retains only the referenced image");
    }

    // Optional Android image response cannot replace a newer user image or changed URL.
    raw.prepare("UPDATE settings SET product_data_enabled=1, product_data_include_images=1").run();
    const externalUrl = "https://images.openfoodfacts.org/images/products/123/front.jpg";
    const external = { ok: true, value: runtime.saveRuntimeCatalogProduct(database.databasePath, { name: "Android intent", trackInventory: false, imageSourceUrl: externalUrl, dataSource: "open_food_facts" }) };
    assert.equal(external.ok, true);
    const fetchImpl = globalThis.fetch;
    let release, entered;
    const ready = new Promise(done => { entered = done; }), gate = new Promise(done => { release = done; });
    try {
      globalThis.fetch = async () => { entered(); await gate; return new Response(nativeImage.createFromBitmap(Buffer.alloc(4, 255), { width: 1, height: 1 }).toPNG(), { headers: { "content-type": "image/png" } }); };
      const late = media.archiveExternalProductImage(database.databasePath, external.value.id, "open_food_facts", externalUrl);
      await ready;
      const latest = await save({ id: external.value.id, name: "Manual wins", trackInventory: false, manualImageDataUrl: replacement() });
      release();
      assert.equal(await late, "");
      assert.equal(raw.prepare("SELECT image_asset_path FROM catalog_products WHERE id=?").get(external.value.id).image_asset_path, latest.value.imageAssetPath);
    } finally { globalThis.fetch = fetchImpl; release(); }

    try {
      globalThis.fetch = async () => { throw new Error("injected_download"); };
      const beforeReplacement = row();
      const failedExternal = await save({ id, name: "Failed external", trackInventory: false, imageSourceUrl: externalUrl, dataSource: "open_food_facts", imageLicense: "CC BY-SA" });
      assert.equal(failedExternal.ok, true);
      assert.equal(row().image_asset_path, beforeReplacement.image_asset_path);
      assert.equal(row().image_source_url, beforeReplacement.image_source_url);
      assert.equal(row().image_license, beforeReplacement.image_license);
    } finally { globalThis.fetch = fetchImpl; }

    // Ordinary metadata editing with the same image identity keeps its existing save semantics.
    const beforeMetadata = row();
    const metadataOnly = await save({ id, name: "Metadata only", trackInventory: false, imageLicense: "Metadata edit" });
    assert.equal(metadataOnly.ok, true);
    assert.equal(row().image_asset_path, beforeMetadata.image_asset_path);
    assert.equal(row().image_license, "Metadata edit");

    // Lock arriving during image I/O is rechecked before product persistence.
    let releaseLocked, enteredLocked;
    const lockedReady = new Promise(done => { enteredLocked = done; }), lockedGate = new Promise(done => { releaseLocked = done; });
    try {
      globalThis.fetch = async () => { enteredLocked(); await lockedGate; return new Response(nativeImage.createFromBitmap(Buffer.alloc(4, 255), { width: 1, height: 1 }).toPNG(), { headers: { "content-type": "image/png" } }); };
      const beforeLocked = row();
      const saving = save({ id, name: "Locked during I/O", trackInventory: false, imageSourceUrl: externalUrl, dataSource: "open_food_facts" });
      await lockedReady; unlocked = false; releaseLocked();
      await assert.rejects(saving, /session locked/);
      assert.deepEqual(row(), beforeLocked);
    } finally { unlocked = true; globalThis.fetch = fetchImpl; releaseLocked(); }

    const current = row().image_asset_path;
    const unlink = fs.unlinkSync;
    try {
      fs.unlinkSync = () => { throw new Error("injected_cleanup"); };
      const cleared = await save({ id, name: "Cleared", trackInventory: false, clearImage: true });
      assert.equal(cleared.ok, true); assert.equal(cleared.value.imageAssetPath, "");
      media.cleanupOrphanProductImages(database.databasePath);
      assert.equal(row().image_asset_path, "", "cleanup failure can only leave an orphan, never a broken reference");
      assert.ok(fs.existsSync(absolute(current)));
    } finally { fs.unlinkSync = unlink; }
    media.cleanupOrphanProductImages(database.databasePath);
    assert.equal(fs.existsSync(absolute(current)), false);
    unlocked = false;
    await assert.rejects(save(input), /session locked/);
    assert.equal(mutations, 7, "only successfully committed product operations notify projections");
    console.log("PASS product media: real decoder + IPC, optional prepare/rename failure, DB rollback, SIGKILL at stage/prepare/commit, recovery cleanup, late provider response, clear cleanup failure, session gate");
  } finally { raw?.close(); database.close(); fs.rmSync(root, { recursive: true, force: true }); }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
