#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { DEMO_VERSION, FIXED_NOW, countFiles, sanitizeBackupFileName, sha256File, writeJson } from "./lib/util.mjs";
import { createDemoContext, writeBackupManifest } from "./lib/build.mjs";
import { inspectDatabase } from "./lib/integrity.mjs";
import { addResourceMedia } from "./lib/resource-media.mjs";
import { verifyPackage, formatVerification } from "./lib/verify.mjs";
import { pensionRestaurantPack } from "./lib/packs/pension-restaurant.mjs";
import { marketPack } from "./lib/packs/market.mjs";
import { marketDealerPack } from "./lib/packs/market-dealer.mjs";
import { createTeknikelPack } from "./lib/packs/teknikel.mjs";
import { DEFAULT_TEKNIKEL_SOURCE_ROOT, DEFAULT_TEKNIKEL_CUSTOMERS } from "./lib/teknikel-sources.mjs";

const require = createRequire(import.meta.url);
const { readProductImageAsset } = require("../../apps/desktop-app/dist-electron/product-image-reader.js");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const schemaPath = path.join(repoRoot, "apps", "desktop-app", "db", "schema.sql");

const ALL_PACKS = [
  { pack: pensionRestaurantPack, short: "a" },
  { pack: marketPack, short: "b" },
  { pack: marketDealerPack, short: "c" },
  { pack: { id: "d-teknikel" }, short: "d", optional: true }
];

function parseArgs(argv) {
  const options = {
    output: path.join(repoRoot, "artifacts", "demo-data"),
    only: null,
    keepWork: false,
    teknikelSourceRoot: process.env.YA_TEKNIKEL_SOURCE_ROOT || DEFAULT_TEKNIKEL_SOURCE_ROOT,
    teknikelCustomers: process.env.YA_TEKNIKEL_CUSTOMERS || DEFAULT_TEKNIKEL_CUSTOMERS
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") options.output = path.resolve(argv[++index] ?? "");
    else if (arg === "--only") options.only = String(argv[++index] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    else if (arg === "--keep-work") options.keepWork = true;
    else if (arg === "--teknikel-source-root" || arg === "--teknikel-customers") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a local path`);
      options[arg === "--teknikel-source-root" ? "teknikelSourceRoot" : "teknikelCustomers"] = path.resolve(value);
    }
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/demo-data/generate-demo-data.mjs [--output DIR] [--only a,b,c,d] [--keep-work] [--teknikel-source-root DIR] [--teknikel-customers CSV]\nDefaults: a,b,c. Teknikel d is opt-in; source root may also use YA_TEKNIKEL_SOURCE_ROOT.");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function removeIfExists(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function zipFolder(workDir, folderName, zipPath) {
  removeIfExists(zipPath);
  const result = spawnSync("zip", ["-r", "-X", "-q", zipPath, folderName], {
    cwd: workDir,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`zip failed (${result.status}): ${result.stderr || result.stdout}`);
  }
}

function extractQrMenuImages(db, databasePath, folderPath) {
  const rows = db.prepare(`
    SELECT e.id, p.name, p.image_asset_path
    FROM catalog_products p
    JOIN menu_product_entries e ON e.product_id = p.id AND e.deleted_at = ''
    WHERE p.deleted_at = '' AND p.image_asset_path <> ''
    ORDER BY e.sort_order ASC, p.name ASC
  `).all();
  const files = [];
  for (const row of rows) {
    const imageUrl = readProductImageAsset(databasePath, String(row.image_asset_path ?? ""));
    const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(imageUrl);
    if (!match) continue;
    const mimeGroup = String(match[1] ?? "").toLowerCase();
    const mimeType = mimeGroup === "image/jpg" ? "image/jpeg" : mimeGroup;
    const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const menuItemId = String(row.id ?? "");
    const menuItemName = String(row.name ?? "Ürün");
    const suffix = sanitizeBackupFileName(menuItemId).slice(-12) || String(files.length + 1);
    const fileName = `${sanitizeBackupFileName(menuItemName)}-${suffix}.${extension}`;
    const bytes = Buffer.from(String(match[2] ?? "").replace(/\s+/g, ""), "base64");
    if (bytes.length === 0) continue;
    fs.mkdirSync(path.join(folderPath, "qr-menu-images"), { recursive: true });
    fs.writeFileSync(path.join(folderPath, "qr-menu-images", fileName), bytes);
    files.push({ menuItemId, menuItemName, fileName, mimeType });
  }
  return files;
}

function generatePackage({ pack, outputRoot, workRoot }) {
  const folderPath = path.join(workRoot, pack.folderName);
  removeIfExists(folderPath);
  fs.mkdirSync(folderPath, { recursive: true });

  const databasePath = path.join(folderPath, "yardimci-asistan.sqlite");
  const db = new DatabaseSync(databasePath);
  let expected;
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(fs.readFileSync(schemaPath, "utf8"));
    const ctx = createDemoContext({ db, pack, folderPath });
    db.exec("BEGIN IMMEDIATE");
    try {
      ctx.addBusiness();
      ctx.addSettings(pack.settings);
      ctx.addBusinessCapabilities(ctx.capabilities);
      pack.seed(ctx);
      expected = ctx.expected;
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The original failure is more useful.
      }
      throw error;
    }
    for (const hook of ctx.commitHooks) hook();

    const media = addResourceMedia({
      folderPath,
      panoramas: pack.panoramaMedia ?? [],
      photos: pack.photoMedia ?? []
    });
    if (media.files.length > 0) {
      expected.media = {
        counts: media.counts,
        targets: media.targets,
        files: media.files,
        manifests: media.manifests,
        attributionPath: media.attributionPath,
        attributionSha256: media.attributionSha256
      };
    }

    const integrity = inspectDatabase(db);
    if (!integrity.ok) {
      throw new Error(`Integrity failed for ${pack.id}: ${JSON.stringify(integrity)}`);
    }

    const qrFiles = extractQrMenuImages(db, databasePath, folderPath);
    const assetFileCount = countFiles(path.join(folderPath, "assets"));
    writeBackupManifest(folderPath, pack, qrFiles, assetFileCount, FIXED_NOW);
  } finally {
    db.close();
  }

  const verification = verifyPackage({ folderPath, dbPath: databasePath, pack: { ...pack, expected } });
  if (!verification.ok) {
    throw new Error(`Read-path verification failed for ${pack.id}:\n${formatVerification(verification)}`);
  }

  const zipFileName = `yardimci-asistan-demo-${DEMO_VERSION}-${pack.id}.zip`;
  const zipPath = path.join(outputRoot, zipFileName);
  zipFolder(workRoot, pack.folderName, zipPath);

  return {
    id: pack.id,
    title: pack.title,
    businessId: pack.business.id,
    folderName: pack.folderName,
    zipFile: zipFileName,
    zipSha256: sha256File(zipPath),
    zipSizeBytes: fs.statSync(zipPath).size,
    databaseSha256: sha256File(databasePath),
    createdAt: FIXED_NOW,
    counts: expected.counts,
    media: expected.media ?? null,
    readChecks: expected.readChecks,
    ids: expected.ids,
    verification: {
      ok: verification.ok,
      checks: verification.checks.map((check) => ({
        name: check.name,
        pass: check.pass,
        ...(check.actual === undefined ? {} : { actual: check.actual })
      }))
    }
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const selected = options.only
    ? ALL_PACKS.filter((entry) => options.only.includes(entry.short) || options.only.includes(entry.pack.id))
    : ALL_PACKS.filter(entry => !entry.optional);
  if (selected.length === 0) throw new Error(`No packs matched --only ${options.only.join(",")}`);
  const packs = selected.map(({ pack }) => pack.id === "d-teknikel"
    ? createTeknikelPack({ sourceRoot: options.teknikelSourceRoot, customersPath: options.teknikelCustomers })
    : pack);

  fs.mkdirSync(options.output, { recursive: true });
  const workRoot = path.join(options.output, ".work");
  removeIfExists(workRoot);
  fs.mkdirSync(workRoot, { recursive: true });

  const packages = [];
  try {
    for (const pack of packs) {
      process.stdout.write(`Generating ${pack.id}... `);
      const result = generatePackage({ pack, outputRoot: options.output, workRoot });
      packages.push(result);
      process.stdout.write("PASS\n");
      for (const check of result.verification.checks) {
        if (!check.pass) process.stdout.write(`  FAIL ${check.name}\n`);
      }
    }
  } finally {
    if (!options.keepWork) removeIfExists(workRoot);
  }

  const manifest = {
    format: "yardimci-asistan-demo-data-manifest",
    version: DEMO_VERSION,
    generatedAt: FIXED_NOW,
    schema: "apps/desktop-app/db/schema.sql",
    backupFormat: "yardimci-asistan-backup-v2",
    packages,
    limitations: [
      "Pack A gives every room and table four media files: a cover and a normal photo from open-licensed Wikimedia Commons sources, plus a 180° and a 360° panorama. Photos use CC BY 4.0, CC BY 2.0, CC0 1.0 or public-domain sources; panoramas use CC BY 4.0 NOIRLab/NSF/AURA/CTIO material. None are photographs of the synthetic demo business; 180° files are centre crops of the matching 360° sources. See assets/MEDIA_ATTRIBUTION.txt inside the package and scripts/demo-data/ASSET_ATTRIBUTION.md.",
      "Packs A-C use synthetic business/catalog identities and prices. All packages use synthetic customers, contact details, orders and payments.",
      ...(packs.some(pack => pack.id === "d-teknikel") ? ["Teknikel D retains real public catalog names/SKUs, source gross TRY prices and all 68 original photographs (67 unique hashes). Photos are not synthetic or open-licensed; original owners retain rights. Stock, purchase cost, dealer A/B prices, descriptions and placeholder tax 20% are synthetic demo values. See assets/TEKNIKEL_SOURCE_MANIFEST.json. No linked web accounts or invitations are created in D."] : []),
      "Packages contain no sync secret, web module URL, Android credential or service password.",
      "Folder-based restore expects the unzipped folder under the desktop backup root. Current desktop builds also offer ZIP import; see scripts/demo-data/README.md."
    ]
  };
  writeJson(path.join(options.output, "demo-data-manifest.json"), manifest);
  console.log(`Wrote ${packages.length} package(s) and demo-data-manifest.json to ${options.output}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
