import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { inspectDatabase } from "./lib/integrity.mjs";
import { verifyPackage } from "./lib/verify.mjs";
import { countFiles, sha256File } from "./lib/util.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const generator = path.join(here, "generate-demo-data.mjs");

function tempDirectory() {
  const base = fs.existsSync("/tmp/opencode") ? "/tmp/opencode" : os.tmpdir();
  return fs.mkdtempSync(path.join(base, "ya-demo-test-"));
}

test("demo generator emits restorable, readable packages", { timeout: 180000 }, () => {
  const output = tempDirectory();
  const extractRoot = tempDirectory();
  try {
    const generated = spawnSync(process.execPath, [generator, "--output", output], {
      encoding: "utf8",
      cwd: path.resolve(here, "../..")
    });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);

    const manifest = JSON.parse(fs.readFileSync(path.join(output, "demo-data-manifest.json"), "utf8"));
    assert.equal(manifest.format, "yardimci-asistan-demo-data-manifest");
    const productVersion = JSON.parse(fs.readFileSync(path.resolve(here, "../../product-version.json"), "utf8"));
    assert.equal(manifest.version, productVersion.version, "Demo fixtures must match the published Desktop release");
    assert.deepEqual(manifest.packages.map((item) => item.id), [
      "a-pension-restaurant",
      "b-market",
      "c-market-dealer"
    ]);

    for (const pkg of manifest.packages) {
      const zipPath = path.join(output, pkg.zipFile);
      assert.ok(fs.existsSync(zipPath), `${pkg.zipFile} exists`);
      assert.equal(sha256File(zipPath), pkg.zipSha256);
      assert.equal(fs.statSync(zipPath).size, pkg.zipSizeBytes);

      const entries = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
      assert.equal(entries.status, 0, entries.stderr);
      const names = entries.stdout.split("\n").filter(Boolean);
      assert.ok(names.every((name) => name === `${pkg.folderName}/` || name.startsWith(`${pkg.folderName}/`)));
      assert.ok(names.every((name) => !name.includes("..") && !path.isAbsolute(name)));

      const destination = path.join(extractRoot, pkg.id);
      fs.mkdirSync(destination, { recursive: true });
      const unzipped = spawnSync("unzip", ["-q", zipPath, "-d", destination], { encoding: "utf8" });
      assert.equal(unzipped.status, 0, unzipped.stderr);
      assert.deepEqual(fs.readdirSync(destination), [pkg.folderName]);

      const folderPath = path.join(destination, pkg.folderName);
      const databasePath = path.join(folderPath, "yardimci-asistan.sqlite");
      assert.equal(sha256File(databasePath), pkg.databaseSha256);

      const backup = JSON.parse(fs.readFileSync(path.join(folderPath, "backup.json"), "utf8"));
      assert.equal(backup.format, "yardimci-asistan-backup-v2");
      assert.equal(backup.databaseFile, "yardimci-asistan.sqlite");
      assert.equal(backup.assets.directory, "assets");
      assert.equal(backup.assets.fileCount, countFiles(path.join(folderPath, "assets")));
      assert.equal(backup.qrMenuImages.directory, "qr-menu-images");
      const qrDirectory = path.join(folderPath, "qr-menu-images");
      const qrFiles = fs.existsSync(qrDirectory) ? fs.readdirSync(qrDirectory) : [];
      assert.equal(backup.qrMenuImages.count, qrFiles.length);
      assert.ok(backup.qrMenuImages.files.every((file) => qrFiles.includes(file.fileName)));

      const db = new DatabaseSync(databasePath, { readOnly: true });
      try {
        const integrity = inspectDatabase(db);
        assert.equal(integrity.quickCheck.toLowerCase(), "ok");
        assert.deepEqual(integrity.foreignKeyViolations, []);
        assert.deepEqual(integrity.secretViolations, []);
        const settings = db.prepare("SELECT web_module_url, sync_secret, auto_sync_enabled FROM settings").all();
        assert.equal(settings.length, 1);
        assert.equal(settings[0].web_module_url, "");
        assert.equal(settings[0].sync_secret, "");
        assert.equal(settings[0].auto_sync_enabled, 0);
      } finally {
        db.close();
      }

      const result = verifyPackage({
        folderPath,
        dbPath: databasePath,
        pack: { id: pkg.id, expected: { readChecks: pkg.readChecks, ids: pkg.ids, counts: pkg.counts, media: pkg.media } }
      });
      const failures = result.checks.filter((check) => !check.pass);
      assert.deepEqual(failures, [], `${pkg.id} read-path checks`);
    }
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
    fs.rmSync(extractRoot, { recursive: true, force: true });
  }
});
