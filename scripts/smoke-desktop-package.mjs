import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listPackage } from "@electron/asar";

const packageRoot = join(process.cwd(), "dist", "desktop", "linux-unpacked");
const appAsar = join(packageRoot, "resources", "app.asar");

assert.ok(existsSync(packageRoot), `Paket klasörü bulunamadı: ${packageRoot}`);
assert.ok(existsSync(join(packageRoot, "yardimci-asistan-desktop")), "Linux paket çalıştırılabilir dosyası bulunamadı.");
assert.ok(existsSync(appAsar), `app.asar bulunamadı: ${appAsar}`);

const entries = new Set(listPackage(appAsar));
const requiredEntries = [
  "/package.json",
  "/dist-electron/main.js",
  "/dist-electron/preload.js",
  "/dist-electron/database.js",
  "/dist-renderer/index.html",
  "/db/migrations/001_initial_schema.sql",
  "/db/seeds/001_demo.sql"
];

for (const entry of requiredEntries) {
  assert.ok(entries.has(entry), `Paket içinde eksik dosya: ${entry}`);
}

console.log(`desktop-package-ok: ${packageRoot}`);
