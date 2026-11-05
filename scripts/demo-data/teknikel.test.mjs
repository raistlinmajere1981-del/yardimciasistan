import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { DEFAULT_TEKNIKEL_CUSTOMERS, DEFAULT_TEKNIKEL_SOURCE_ROOT, loadTeknikelSources, parseCustomerCsv } from "./lib/teknikel-sources.mjs";
import { sha256File } from "./lib/util.mjs";
import { verifyPackage } from "./lib/verify.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const generator = path.join(repo, "scripts/demo-data/generate-demo-data.mjs");
const verifier = path.join(repo, "scripts/demo-data/verify-demo-data.mjs");
const sourceRoot = process.env.YA_TEKNIKEL_SOURCE_ROOT || DEFAULT_TEKNIKEL_SOURCE_ROOT;
const customersPath = process.env.YA_TEKNIKEL_CUSTOMERS || DEFAULT_TEKNIKEL_CUSTOMERS;
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), "ya-teknikel-test-"));
function execute(command, args, options = {}) {
  const env = { ...process.env, ...options.env };
  delete env.NODE_TEST_CONTEXT;
  // Files also capture diagnostics on hosts that restrict child-process pipes.
  const logs = temporary();
  const stdout = path.join(logs, "stdout"), stderr = path.join(logs, "stderr");
  const handles = [fs.openSync(stdout, "w"), fs.openSync(stderr, "w")];
  try {
    const result = spawnSync(command, args, { cwd: repo, ...options, env, stdio: ["ignore", ...handles] });
    return { ...result, stdout: fs.readFileSync(stdout, "utf8"), stderr: fs.readFileSync(stderr, "utf8") };
  } finally {
    handles.forEach(handle => fs.closeSync(handle));
    fs.rmSync(logs, { recursive: true, force: true });
  }
}
function runNode(args, options = {}) {
  const result = execute(process.execPath, args, options);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

test("Teknikel CSV parser retains quoted semicolons, quotes, Turkish text and newlines", () => {
  const headers = "fullName;phone;email;companyName;taxOffice;taxNumber;authorizedPerson;dealerStatus;priceGroup;paymentTermDays;address;notes";
  const fields = ['"DEMO Ayşe; ""Usta"""', "+905550000001", "a@example.test", ...Array(8).fill(""), '"DEMO\nnotu"'];
  const rows = parseCustomerCsv(`\uFEFF${headers}\r\n${fields.join(";")}\r\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fullName, 'DEMO Ayşe; "Usta"');
  assert.equal(rows[0].notes, "DEMO\nnotu");
  assert.throws(() => parseCustomerCsv(`${headers}\n"unfinished`), /unterminated/);
});

test("optional Teknikel source failures are clean and preserve existing output", () => {
  const output = temporary();
  try {
    fs.writeFileSync(path.join(output, "demo-data-manifest.json"), "preserve existing manifest");
    for (const [selection, options] of [["d", ["--teknikel-source-root", path.join(output, "absent")]], ["d-teknikel", []]]) {
      const result = execute(process.execPath, [generator, "--only", selection, "--output", output, ...options], {
        env: { YA_TEKNIKEL_SOURCE_ROOT: path.join(output, "absent") }
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Teknikel source file not found/);
      assert.doesNotMatch(result.stderr, /\n\s+at /);
      assert.equal(fs.readFileSync(path.join(output, "demo-data-manifest.json"), "utf8"), "preserve existing manifest");
      assert.equal(fs.existsSync(path.join(output, ".work")), false);
    }
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});

// Proprietary local catalog/media are intentionally absent from Git. Full
// integration runs when these explicit local prerequisites exist.
const localSourcesExist = fs.existsSync(path.join(sourceRoot, "import-review-catalog.json")) && fs.existsSync(customersPath);
test("Teknikel refuses an altered original SHA before generating a package", { skip: !localSourcesExist }, () => {
  const root = temporary();
  try {
    fs.copyFileSync(path.join(sourceRoot, "import-review-catalog.json"), path.join(root, "import-review-catalog.json"));
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, "image-manifest.json"), "utf8"));
    const first = manifest.images[0];
    fs.mkdirSync(path.join(root, "images-original"));
    fs.copyFileSync(path.join(sourceRoot, "images-original", first.archive_filename), path.join(root, "images-original", first.archive_filename));
    first.sha256 = "0".repeat(64);
    fs.writeFileSync(path.join(root, "image-manifest.json"), JSON.stringify(manifest));
    assert.throws(() => loadTeknikelSources({ sourceRoot: root, customersPath }), /SHA-256 mismatch/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

async function importWithDesktop(zipPath, root) {
  const dist = path.join(repo, "apps/desktop-app/dist-electron");
  const moduleRequire = createRequire(path.join(dist, "data-maintenance.js"));
  const handlers = new Map();
  const backupRoot = path.join(root, "backups");
  const exports = {};
  const overrides = {
    electron: {
      app: { isPackaged: false, getAppPath: () => repo },
      BrowserWindow: { fromWebContents: () => null },
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [zipPath] }) },
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel) },
      shell: { openPath: async () => "" }, session: { defaultSession: { clearStorageData: async () => {} } }
    },
    "./data-paths.js": {
      DESKTOP_DATABASE_FILE_NAME: "yardimci-asistan.sqlite", resolveBackupRoot: () => backupRoot,
      resolveMaintenancePath: () => path.join(root, ".maintenance"), resolveDatabasePath: () => path.join(root, "yardimci-asistan.sqlite"),
      resolveAssetsPath: () => path.join(root, "assets"), resolvePendingMaintenanceMarkerPath: () => path.join(root, "marker"),
      resolveStagedRestorePath: () => path.join(root, "stage-restore.sqlite"), resolveStagedRestoreAssetsPath: () => path.join(root, "stage-restore-assets")
    },
    "./data-maintenance-confirmation": { requestDataMaintenanceConfirmation: async () => { throw new Error("Import must never request a restore"); } },
    "./desktop-logger": { desktopLog: { error() {}, warn() {} } }
  };
  runInNewContext(fs.readFileSync(path.join(dist, "data-maintenance.js"), "utf8"), {
    exports, require: name => name in overrides ? overrides[name] : moduleRequire(name),
    fs, path, process, console, Buffer, URL, setTimeout, clearTimeout, Date, Error, Map, Set, Promise
  }, { filename: path.join(dist, "data-maintenance.js") });
  exports.registerDataMaintenanceIpcHandlers(() => root, { assertUnlocked() {} });
  const importZip = handlers.get("dataMaintenance:importBackupZip");
  assert.equal(typeof importZip, "function", "Compile the current desktop ZIP importer before this test");
  const result = await importZip({ sender: { id: 3 } });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.backups.length, 1);
  assert.equal(fs.existsSync(path.join(root, "yardimci-asistan.sqlite")), false, "No live DB restore");
  assert.equal(fs.existsSync(path.join(root, "marker")), false);
  const duplicate = await importZip({ sender: { id: 3 } });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.message, /zaten mevcut/);
  assert.equal(fs.readdirSync(backupRoot).filter(name => name.startsWith(".tmp-import-")).length, 0);
  return result.backup.folderPath;
}

test("opt-in Teknikel ZIP preserves 179/68/30 and imports through desktop backup IPC", { skip: !localSourcesExist, timeout: 120000 }, async () => {
  const output = temporary(), desktop = temporary();
  try {
    runNode([generator, "--only", "d", "--output", output, "--teknikel-source-root", sourceRoot, "--teknikel-customers", customersPath], {
      // The explicit flag must take precedence over the environment.
      env: { ...process.env, YA_TEKNIKEL_SOURCE_ROOT: path.join(output, "absent") }
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(output, "demo-data-manifest.json"), "utf8"));
    assert.deepEqual(manifest.packages.map(p => p.id), ["d-teknikel"]);
    const [pkg] = manifest.packages;
    assert.equal(pkg.counts.products, 179);
    assert.equal(pkg.counts.productOriginals, 68);
    assert.equal(pkg.counts.customers, 30);
    assert.equal(pkg.verification.ok, true);
    assert.ok(pkg.verification.checks.every(c => c.pass));
    const zipPath = path.join(output, pkg.zipFile);
    assert.equal(sha256File(zipPath), pkg.zipSha256);
    const listing = execute("unzip", ["-Z1", zipPath]);
    assert.equal(listing.status, 0, listing.stderr);
    const entries = listing.stdout.trim().split("\n");
    assert.ok(entries.length > 70);
    assert.ok(entries.every(entry => entry.startsWith(`${pkg.folderName}/`) && !entry.includes("..") && !entry.includes("\\")));
    assert.ok(entries.includes(`${pkg.folderName}/backup.json`));
    assert.ok(entries.includes(`${pkg.folderName}/yardimci-asistan.sqlite`));
    assert.equal(entries.filter(entry => /^assets\/products\/[^/]+\/[^/]+$/.test(entry.slice(pkg.folderName.length + 1))).length, 68);
    const verified = runNode([verifier, "--output", output]);
    assert.match(verified.stdout, /All 1 package\(s\) passed/);
    const folder = await importWithDesktop(zipPath, desktop);
    const dbPath = path.join(folder, "yardimci-asistan.sqlite");
    assert.equal(sha256File(dbPath), pkg.databaseSha256);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    let firstPhoto;
    try {
      const source = loadTeknikelSources({ sourceRoot, customersPath });
      const rows = db.prepare("SELECT * FROM catalog_products ORDER BY sort_order").all();
      firstPhoto = rows.find(row => row.image_asset_path).image_asset_path;
      assert.deepEqual(rows.map(p => [p.sku, p.name, p.brand, p.sale_price]), source.catalog.products.map(p => [p.sku, p.name, p.brand ?? "", Number(p.sale_price_gross_try)]));
      assert.equal(rows.reduce((sum, row) => sum + JSON.parse(row.image_original_assets_json).length, 0), 68);
      for (const row of rows) {
        const input = source.catalog.products.find(p => p.sku === row.sku);
        const originals = JSON.parse(row.image_original_assets_json);
        assert.deepEqual(originals.map(asset => path.basename(asset.assetPath)), input.image_files);
        for (const asset of originals) {
          assert.equal(asset.hash, source.images.get(path.basename(asset.assetPath)).hash);
          assert.equal(sha256File(path.join(folder, asset.assetPath)), asset.hash);
        }
      }
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM customers").get().count, 30);
      assert.equal(Object.values(db.prepare("PRAGMA integrity_check").get())[0], "ok");
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { db.close(); }
    // A structurally readable photo with changed bytes must fail the packaged
    // image hash check, even though SQLite and gallery metadata are unchanged.
    fs.appendFileSync(path.join(folder, firstPhoto), Buffer.from([0]));
    const corrupted = verifyPackage({ folderPath: folder, dbPath, pack: { id: pkg.id, expected: { readChecks: pkg.readChecks, ids: pkg.ids, counts: pkg.counts } } });
    assert.equal(corrupted.ok, false);
    assert.ok(corrupted.checks.some(check => check.name === `images.${path.basename(firstPhoto)}.bytes` && !check.pass));
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
    fs.rmSync(desktop, { recursive: true, force: true });
  }
});
