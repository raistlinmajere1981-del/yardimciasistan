#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { countFiles, sha256File } from "./lib/util.mjs";
import { verifyPackage } from "./lib/verify.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseArgs(argv) {
  let output = path.join(repoRoot, "artifacts", "demo-data");
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") output = path.resolve(argv[++index] ?? "");
    else if (argv[index] === "--help" || argv[index] === "-h") {
      console.log("Usage: node scripts/demo-data/verify-demo-data.mjs [--output DIR]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return { output };
}

function tempRoot() {
  const base = fs.existsSync("/tmp/opencode") ? "/tmp/opencode" : os.tmpdir();
  return fs.mkdtempSync(path.join(base, "ya-demo-verify-"));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function verifyZip(pkg, outputRoot, extractionRoot) {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
  const zipPath = path.join(outputRoot, pkg.zipFile);

  check("zip.exists", fs.existsSync(zipPath));
  if (!fs.existsSync(zipPath)) return checks;
  check("zip.sha256", sha256File(zipPath) === pkg.zipSha256, sha256File(zipPath));
  check("zip.size", fs.statSync(zipPath).size === pkg.zipSizeBytes);

  const listing = run("unzip", ["-Z1", zipPath]).split("\n").filter(Boolean);
  check("zip.entries", listing.every((entry) => entry === `${pkg.folderName}/` || entry.startsWith(`${pkg.folderName}/`)), listing.slice(0, 3));
  check("zip.traversal", listing.every((entry) => !entry.includes("..") && !path.isAbsolute(entry)));

  const destination = path.join(extractionRoot, pkg.id);
  fs.mkdirSync(destination, { recursive: true });
  run("unzip", ["-q", zipPath, "-d", destination]);
  const topLevel = fs.readdirSync(destination);
  check("unzip.single_folder", topLevel.length === 1 && topLevel[0] === pkg.folderName, topLevel);

  const folderPath = path.join(destination, pkg.folderName);
  const databasePath = path.join(folderPath, "yardimci-asistan.sqlite");
  const manifestPath = path.join(folderPath, "backup.json");
  check("database.present", fs.existsSync(databasePath));
  check("backupJson.present", fs.existsSync(manifestPath));
  if (!fs.existsSync(databasePath) || !fs.existsSync(manifestPath)) return checks;

  check("database.sha256", sha256File(databasePath) === pkg.databaseSha256, sha256File(databasePath));

  const backup = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  check("backup.format", backup.format === "yardimci-asistan-backup-v2");
  check("backup.databaseFile", backup.databaseFile === "yardimci-asistan.sqlite");
  check("backup.createdAt", backup.createdAt === pkg.createdAt);
  check("backup.qrDirectory", backup.qrMenuImages?.directory === "qr-menu-images");
  check("backup.assetDirectory", backup.assets?.directory === "assets");
  const assetsPath = path.join(folderPath, "assets");
  check("backup.assetCount", backup.assets?.fileCount === (fs.existsSync(assetsPath) ? countFiles(assetsPath) : 0));
  const qrPath = path.join(folderPath, "qr-menu-images");
  const qrActual = fs.existsSync(qrPath) ? fs.readdirSync(qrPath).filter((name) => fs.statSync(path.join(qrPath, name)).isFile()) : [];
  check("backup.qrCount", backup.qrMenuImages?.count === qrActual.length);
  check("backup.qrFiles", Array.isArray(backup.qrMenuImages?.files)
    && backup.qrMenuImages.files.every((file) => qrActual.includes(file.fileName)));

  const readVerification = verifyPackage({
    folderPath,
    dbPath: databasePath,
    pack: { id: pkg.id, expected: { readChecks: pkg.readChecks, ids: pkg.ids, counts: pkg.counts, media: pkg.media } }
  });
  for (const item of readVerification.checks) checks.push({ name: `read.${item.name}`, pass: item.pass, detail: item.actual });
  return checks;
}

function main() {
  const { output } = parseArgs(process.argv.slice(2));
  const manifestPath = path.join(output, "demo-data-manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.format !== "yardimci-asistan-demo-data-manifest") throw new Error("Unexpected manifest format");
  if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) throw new Error("Manifest has no packages");

  const extractionRoot = tempRoot();
  let failed = 0;
  try {
    for (const pkg of manifest.packages) {
      const checks = verifyZip(pkg, output, extractionRoot);
      const ok = checks.every((check) => check.pass);
      if (!ok) failed += 1;
      console.log(`${ok ? "PASS" : "FAIL"} ${pkg.id} (${pkg.zipFile})`);
      for (const check of checks.filter((item) => !item.pass)) {
        console.log(`  FAIL ${check.name}${check.detail === undefined ? "" : ` -> ${JSON.stringify(check.detail)}`}`);
      }
    }
  } finally {
    fs.rmSync(extractionRoot, { recursive: true, force: true });
  }

  if (failed > 0) {
    console.error(`${failed} package(s) failed verification.`);
    process.exitCode = 1;
    return;
  }
  console.log(`All ${manifest.packages.length} package(s) passed ZIP, manifest, integrity, secret and read-path verification.`);
}

main();
