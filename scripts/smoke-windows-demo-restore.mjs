import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const root = fs.mkdtempSync(path.join(fs.existsSync("/tmp/opencode") ? "/tmp/opencode" : os.tmpdir(), "windows-demo-restore-"));
const appPath = path.resolve("apps/desktop-app");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { SyncCoordinator } = require("../apps/desktop-app/dist-electron/sync-coordinator.js");
const { createAndroidOperationsSnapshot } = require("../apps/desktop-app/dist-electron/android-operations-snapshot.js");
const { createBusinessAiCatalog } = require("../apps/desktop-app/dist-electron/business-ai-catalog-service.js");
const { createPublicRoomCatalog } = require("../apps/desktop-app/dist-electron/public-room-catalog-publication.js");
const { createPublicTableCatalog } = require("../apps/desktop-app/dist-electron/public-table-catalog-publication.js");
const { publishPendingRoomMedia } = require("../apps/desktop-app/dist-electron/room-media-publication.js");
const { publishPendingTableMedia } = require("../apps/desktop-app/dist-electron/table-media-publication.js");
const { connectPublicationSource } = require("../apps/desktop-app/dist-electron/publication-source-service.js");
const { MarketingWebsitePublicationService } = require("../apps/desktop-app/dist-electron/marketing/website-publication.js");
const { PhpHostingSyncTransport } = require("../packages/sync-core/dist/index.js");

const dataRoot = path.join(root, "desktop-user-data");
const webRoot = path.join(root, "hosting");
const backupRoot = path.join(dataRoot, "backups");
const logs = [];
let database;
let server;
function loadMaintenance() {
  const compiled = path.resolve("apps/desktop-app/dist-electron/data-maintenance.js");
  const compiledRequire = createRequire(compiled);
  const handlers = new Map(), exported = {};
  runInNewContext(fs.readFileSync(compiled, "utf8"), {
    exports: exported, Buffer, Error, process, setTimeout: () => ({ unref() {} }), clearTimeout,
    require: name => name === "electron" ? {
      app: { isPackaged: true, getAppPath: () => appPath, relaunch() {}, quit() {} },
      ipcMain: { removeHandler() {}, handle: (name, callback) => handlers.set(name, callback) },
      shell: {}, session: {}
    } : name === "./data-maintenance-confirmation" ? { requestDataMaintenanceConfirmation: async () => true }
      : name === "./desktop-logger" ? { desktopLog: { info() {}, warn: value => logs.push(value), error: value => logs.push(value) } }
        : compiledRequire(name)
  });
  exported.registerDataMaintenanceIpcHandlers(() => dataRoot, { assertUnlocked() {} });
  return { handlers, exported };
}
function newDatabase() {
  const db = new DesktopDatabase({ appPath, userDataPath: dataRoot, backupPath: backupRoot });
  db.initialize();
  return db;
}
function coordinatorFor(config) {
  return new SyncCoordinator({
    database, getSyncConfig: () => config,
    marketingWebsite: new MarketingWebsitePublicationService(() => database, {
      absolutePath: () => { throw new Error("Unexpected demo marketing media"); }
    }),
    createAndroidSnapshot: () => createAndroidOperationsSnapshot(database, database.getDashboardData()),
    createAiCatalog: () => createBusinessAiCatalog(database),
    createRoomCatalog: () => createPublicRoomCatalog(database.databasePath, database.getEnabledBusinessCapabilities(), dataRoot),
    prepareRoomCatalog: (cfg, clientId) => publishPendingRoomMedia(dataRoot, cfg, clientId),
    createTableCatalog: () => createPublicTableCatalog(database.databasePath, database.getEnabledBusinessCapabilities(), dataRoot),
    prepareTableCatalog: (cfg, clientId) => publishPendingTableMedia(dataRoot, cfg, clientId),
    onDashboardChanged() {}, onStatusChanged() {}
  });
}
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
try {
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.cpSync("firm-template/web-module", webRoot, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(path.join(webRoot, "data", "yardimci-asistan.sqlite" + suffix), { force: true });
  const secret = "local-demo-restore-secret";
  const configFile = path.join(webRoot, "config/business.json");
  fs.writeFileSync(configFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(configFile, "utf8")), sync_secret: secret }));
  const listener = http.createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  server = spawn("php", ["-S", "127.0.0.1:" + port, "-t", webRoot], { stdio: "ignore" });
  const config = { baseUrl: "http://127.0.0.1:" + port, syncSecret: secret };
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    try { healthy = (await fetch(config.baseUrl + "/api/menu.php")).ok; if (healthy) break; }
    catch {}
    await new Promise(resolve => setTimeout(resolve, 35));
  }
  assert.ok(healthy, "isolated local hosting must start");

  const maintenance = loadMaintenance();
  const list = () => maintenance.handlers.get("dataMaintenance:listBackups")();
  assert.equal(list().ok, true);
  assert.equal(list().backups.length, 0, "empty list before extracting demo");
  const version = JSON.parse(fs.readFileSync("product-version.json", "utf8")).version;
  const packagedManifestPath = path.resolve("artifacts/demo-data/demo-data-manifest.json");
  const packagedManifest = fs.existsSync(packagedManifestPath)
    ? JSON.parse(fs.readFileSync(packagedManifestPath, "utf8"))
    : null;
  const packaged = packagedManifest?.packages?.find(item => item.id === "a-pension-restaurant");
  const packagedZip = packaged?.zipFile ? path.resolve("artifacts/demo-data", packaged.zipFile) : "";
  const packagedHasCovers = (packaged?.media?.counts?.roomCovers ?? 0) >= 4
    && (packaged?.media?.counts?.tableCovers ?? 0) >= 6;
  // Release artifacts are ignored by Git. On clean checkouts, a later schema or
  // an older package without room/table covers, generate the real demo package
  // locally instead of depending on uploaded ZIPs.
  let zip = packagedZip;
  if (process.env.YA_SMOKE_REGENERATE_DEMO === "1" || version !== "2.2.0" || !packagedHasCovers || !zip || !fs.existsSync(zip)) {
    const generatedRoot = path.join(root, "generated-demo");
    run(process.execPath, ["scripts/demo-data/generate-demo-data.mjs", "--output", generatedRoot]);
    const manifest = JSON.parse(fs.readFileSync(path.join(generatedRoot, "demo-data-manifest.json"), "utf8"));
    zip = path.join(generatedRoot, manifest.packages.find(item => item.id === "a-pension-restaurant").zipFile);
  }
  run("unzip", ["-q", zip, "-d", backupRoot]);
  const first = list();
  assert.equal(first.ok, true);
  assert.deepEqual(first.backups.map(value => value.id), ["yardimci-asistan-demo-a-pension-restaurant"]);
  assert.equal(first.backupDirectory, backupRoot, "packaged Windows backup root");
  console.log("demo-zip-extraction-listing-ok (before setup/Web connection)");

  database = newDatabase();
  const saved = database.saveInitialSetup({
    businessName: "Hand entered before restore", profileId: "pension_restaurant",
    phone: "", whatsapp: "", email: "", address: "",
    webModuleUrl: config.baseUrl, syncSecret: secret, autoSyncEnabled: false,
    aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "",
    aiModel: "", aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30,
    aiApiKey: "", clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: true }
  });
  assert.equal(saved.ok, true, saved.message);
  assert.equal((await connectPublicationSource(database, config)).ok, true);
  let cycle = await coordinatorFor(config).runNow();
  assert.equal(cycle.ok, true, "hand-entered content baseline: " + cycle.message);
  const baseline = await fetch(config.baseUrl + "/api/menu.php").then(response => response.json());
  assert.ok(baseline, "manual publication response");
  console.log("hand-entered-publication-before-restore-ok");

  database.close(); database = undefined;
  const restored = await maintenance.handlers.get("dataMaintenance:restoreBackup")({ sender: {} }, first.backups[0].id);
  assert.equal(restored.ok, true, restored.message);
  maintenance.exported.applyPendingDataMaintenanceAtStartup(dataRoot);
  database = newDatabase();
  assert.equal(database.getRestoreReconciliationStatus().state, "activation_pending");
  assert.equal(database.getSetupData().webModuleUrl, "", "demo ZIP must never carry site credentials");
  assert.equal(database.getSetupData().syncSecret, "", "demo ZIP must never carry sync secret");
  const probe = await new PhpHostingSyncTransport({ ...config, clientId: "desktop-connection-test", sourceEpoch: 0 }).getCapabilities();
  assert.equal(probe.ok, true, "restore connection probe " + probe.message);
  const connected = await connectPublicationSource(database, config);
  assert.equal(connected.ok, true, "same connection after demo restore: " + connected.message);
  assert.equal(database.getRestoreReconciliationStatus().state, "reconciliation_pending", "Settings Connect fulfills durable restore activation");

  const sync = coordinatorFor(config);
  for (let i = 0; i < 8; i++) {
    cycle = await sync.runNow();
    assert.equal(cycle.ok, true, "restored demo publishing: " + cycle.message);
    if (database.getRestoreReconciliationStatus().state === "complete") break;
  }
  assert.equal(database.getRestoreReconciliationStatus().state, "complete", "full restore replay and publication converge");
  assert.equal(database.getSyncRuntimeStatus().pendingJobs, 0, "all demo publications applied");
  const menu = await fetch(config.baseUrl + "/api/menu.php").then(response => response.json());
  const rooms = await fetch(config.baseUrl + "/api/rooms.php").then(response => response.json());
  const tables = await fetch(config.baseUrl + "/api/tables.php").then(response => response.json());
  assert.ok(JSON.stringify(menu).includes("Menemen"), "restored demo menu reaches local website");
  assert.ok(JSON.stringify(rooms).includes("101"), "restored demo rooms reach local website");
  assert.equal(rooms.enabled, true, "restored rooms are published");
  assert.equal(rooms.rooms.length, 4, "restored demo room catalog is complete");
  assert.equal(tables.enabled, true, "demo tables publish to the website");
  assert.equal(tables.tables.length, 6, "restored demo table catalog is complete");
  const assertCoverServed = async (record, scope) => {
    const cover = (record.media ?? []).find(item => item.kind === "cover" && item.url);
    assert.ok(cover, `restored ${scope} ${record.id} has a published cover image`);
    assert.ok(cover.url.startsWith("/media/"), `${scope} ${record.id} must use local media, not an external URL`);
    const response = await fetch(new URL(cover.url, config.baseUrl));
    assert.equal(response.status, 200, `${scope} ${record.id} cover must be readable over HTTP`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${scope} ${record.id} must serve real PNG bytes`);
  };
  for (const room of rooms.rooms) await assertCoverServed(room, "room");
  for (const table of tables.tables) await assertCoverServed(table, "table");
  console.log("demo-restore-connect-republish-ok (local PHP, real demo ZIP, room/table covers served over HTTP)");
} finally {
  if (database) database.close();
  if (server) server.kill();
  fs.rmSync(root, { recursive: true, force: true });
}
