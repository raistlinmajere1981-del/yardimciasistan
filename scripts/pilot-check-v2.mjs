import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { join } from "node:path";
import process from "node:process";
import { describeSmokeBrowser } from "./test-helpers/playwright-browser.mjs";

const require = createRequire(import.meta.url);
const flags = new Set(process.argv.slice(2));
const full = flags.has("--full");
const android = full || flags.has("--android");
const ui = full || flags.has("--ui");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const started = new Date();
const reportDir = join(process.cwd(), "artifacts", "pilot-check");
const reportPath = join(reportDir, `${stamp(started)}.json`);
const latestPath = join(reportDir, "latest.json");
const browser = browserState();

const preflight = [
  n("build-packages", "Ortak paketleri derle", "build:packages"),
  npmArgs("build-desktop", "Masaüstü uygulamasını derle", ["run", "build", "-w", "@yardimci-asistan/desktop-app"]),
  n("typecheck", "Workspace TypeScript kontrolleri", "typecheck"),
  n("php-lint", "Web modülü PHP lint", "lint:php"),
  n("package-web", "Web modülü dağıtım paketini doğrula", "pack:web-module:no-build")
];
const core = [
  js("web-form", "Web talebi + public abuse guard", "smoke-web-form-api.mjs"),
  jsb("web-menu", "Web modülü menü yayını", "smoke-web-module-menu.mjs"),
  jsb("web-widget", "Web widget + gerçek PHP modülü", "smoke-web-widget-module.mjs"),
  command("room-availability", "Read-only canlı oda müsaitlik sorgusu", "php", [join("scripts", "smoke-public-room-availability.php")]),
  js("availability-publication", "PII içermeyen oda müsaitlik yayını", "smoke-public-room-availability-publication.mjs"),
  js("sync-timeout", "Senkron HTTP zaman aşımı sınırı", "smoke-sync-timeout.mjs"),
  js("web-connection", "Masaüstü web bağlantı testi", "smoke-web-connection-test.mjs"),
  js("automatic-sync", "Otomatik senkron ve geri dönüş", "smoke-automatic-sync.mjs"),
  js("android-approval", "Android yeni cihaz onay sınırı", "smoke-android-device-approval-hosting.mjs"),
  js("android-token", "Android cihaz token güvenliği", "smoke-android-device-token.mjs"),
  js("android-secret", "Release Android bağlantısında ortak anahtar sızıntısı", "smoke-android-release-connection.mjs"),
  js("android-permissions", "Android onay ve izin matrisi", "smoke-android-permission-matrix.mjs"),
  js("architecture", "Masaüstü frontend mimari sınırları", "smoke-desktop-frontend-architecture.mjs"),
  js("locale", "Masaüstü tr-TR yerelleştirme sözleşmesi", "smoke-desktop-locale.mjs"),
  js("location-geocode", "İşletme adresi arama varyantları", "smoke-business-location-geocode.mjs"),
  js("birthday-automatic", "Doğum günü otomatik zamanlayıcı ve teslimat", "smoke-birthday-automatic.mjs"),
  js("app-lock", "Masaüstü uygulama kilidi", "smoke-app-lock.mjs"),
  js("table-categories", "Masa kategori veri akışı", "smoke-table-categories-db.mjs"),
  js("menu-db", "Menü veri modeli ve stok akışı", "smoke-desktop-menu-db.mjs"),
  js("deletions", "Kayıt silme ve arşivleme sınırları", "smoke-record-deletions.mjs"),
  js("customer-room", "Müşteri ve oda yönetimi", "smoke-customer-room-management-db.mjs"),
  js("business-profile", "İşletme profili normalizasyonu", "smoke-business-public-profile.mjs"),
  js("room-details", "Oda genel detayları ve allow-list", "smoke-room-public-details.mjs"),
  js("daily-tasks", "Günlük iş yönetimi", "smoke-daily-task-management.mjs"),
  js("pension-reservation", "Doğrudan pansiyon rezervasyonu", "smoke-manual-reservation.mjs"),
  js("restaurant-reservation", "Doğrudan restoran rezervasyonu", "smoke-manual-restaurant-reservation.mjs"),
  js("stock-image", "Stok görseli veri uygulama katmanı", "smoke-stock-image-import-db.mjs"),
  js("reports", "Rapor veri modeli", "smoke-reports-db.mjs"),
  js("finance-db", "Finans veri bütünlüğü", "smoke-finance-db.mjs"),
  js("finance-service", "Finans servis sözleşmesi", "smoke-finance-service.mjs"),
  js("room-folio", "Oda hesabı/tahsilat/çıkış", "smoke-room-folio-service.mjs"),
  js("room-transfer", "Restoran hesabını oda hesabına aktarma", "smoke-room-folio-table-order-transfer.mjs"),
  jsb("renderer", "Masaüstü renderer browser smoke", "smoke-desktop-renderer.mjs"),
  jsb("customer-pension-ui", "Müşteri/Pansiyon formları, oda hesabı ve responsive UI", "smoke-desktop-customer-pension.mjs"),
  jsb("design-system", "Desktop tasarım sistemi ve responsive Ayarlar", "smoke-desktop-design-system.mjs"),
  jsb("messages-ai-staleness", "Mesajlar AI asenkron sahiplik", "smoke-messages-ai-staleness.mjs"),
  jsb("messages-takeover", "Mesajlar WhatsApp devralma yaşam döngüsü", "smoke-messages-takeover-lifecycle.mjs"),
  jsb("dashboard-workspace", "Ana Ekran projection ve launcher sınırları", "smoke-dashboard-workspace.mjs"),
  jsb("calendar-workspace", "Takvim projection, launcher ve sayfa context sınırları", "smoke-calendar-workspace.mjs"),
  js("sector-contributions", "Sektör/özellik statik katkı sözleşmeleri", "smoke-sector-feature-contributions.mjs"),
  js("modular-foundation", "Modüler commerce/capability sözleşmeleri", "check-modular-foundation.mjs")
];
const extra = [];
if (ui && process.platform === "linux") extra.push(js("desktop-xvfb", "Electron Xvfb açılış smoke", "smoke-desktop-xvfb.mjs"));
if (android) extra.push(n("android-build", "Android birim testleri + debug APK", "smoke:android:build"));
if (full) {
  extra.push(nb("e2e", "Playwright uçtan uca testleri", "e2e"));
}

const report = {
  schema_version: 2,
  started_at: started.toISOString(),
  finished_at: "",
  mode: full ? "full" : android || ui ? "extended" : "core",
  host: { platform: process.platform, release: os.release(), arch: process.arch, node: process.version, playwright_chromium: browser.ready },
  result: "running",
  checks: []
};
mkdirSync(reportDir, { recursive: true });
console.log(`\nYardımcı Asistan — Pilot Check v2\nPlatform: ${process.platform} ${process.arch} · Node ${process.version}`);
if (!browser.ready) console.log("Playwright Chromium eksik: bir kez `npx playwright install chromium` çalıştırın.");

let preflightFailed = false;
for (const check of preflight) {
  const result = run(check);
  report.checks.push(result); save();
  if (result.status !== "passed") { preflightFailed = true; break; }
}
if (!preflightFailed) {
  report.checks.push(browser.ready
    ? row("playwright", "Playwright Chromium ortamı", "passed", 0, "")
    : { ...row("playwright", "Playwright Chromium ortamı", "failed", 1, browser.error), hint: "npx playwright install chromium" });
  for (const check of [...core, ...extra]) {
    if (check.browser && !browser.ready) report.checks.push({ ...row(check.id, check.label, "skipped", null, ""), reason: "Playwright Chromium kurulu değil." });
    else report.checks.push(run(check));
    save();
  }
} else {
  for (const check of [...core, ...extra]) report.checks.push({ ...row(check.id, check.label, "skipped", null, ""), reason: "Preflight başarısız." });
}

const failed = report.checks.filter((x) => x.status === "failed");
const skipped = report.checks.filter((x) => x.status === "skipped");
const passed = report.checks.filter((x) => x.status === "passed");
report.finished_at = new Date().toISOString();
report.result = failed.length || skipped.length ? "failed" : "passed";
save();
console.log(`\nPilot Check özeti\n  Geçen: ${passed.length}\n  Kalan: ${failed.length}\n  Atlanan: ${skipped.length}\n  Rapor: ${reportPath}`);
for (const x of failed) console.log(`  ✗ ${x.label}${x.hint ? ` · ${x.hint}` : ""}`);
for (const x of skipped) console.log(`  - ${x.label} · ${x.reason}`);
if (report.result !== "passed") process.exitCode = 1;
else console.log("\nTemel pilot otomasyon kapıları geçti.");

function run(check) {
  console.log(`\n▶ ${check.label}`);
  const t = Date.now();
  const out = spawnSync(check.cmd, check.args, { cwd: process.cwd(), env: process.env, stdio: "inherit", shell: false });
  const status = out.status === 0 && !out.error ? "passed" : "failed";
  console.log(`${status === "passed" ? "✓" : "✗"} ${check.label} (${Date.now() - t} ms)`);
  return row(check.id, check.label, status, typeof out.status === "number" ? out.status : 1, out.error?.message ?? "");
}
function row(id, label, status, exitCode, error) { return { id, label, status, duration_ms: 0, exit_code: exitCode, error }; }
function command(id, label, cmd, args) { return { id, label, cmd, args, browser: false }; }
function n(id, label, script) { return npmArgs(id, label, ["run", script]); }
function nb(id, label, script) { return { ...n(id, label, script), browser: true }; }
function npmArgs(id, label, npmArgsValue) { return { id, label, cmd: npm, args: npmArgsValue, browser: false }; }
function js(id, label, file) { return { id, label, cmd: process.execPath, args: [join("scripts", file)], browser: false }; }
function jsb(id, label, file) { return { ...js(id, label, file), browser: true }; }
function browserState() {
  try {
    const { chromium } = require("@playwright/test");
    const state = describeSmokeBrowser(chromium);
    return {
      ready: state.ready,
      error: state.ready ? "" : state.message
    };
  } catch (error) {
    return {
      ready: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function save() {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(reportPath, json); writeFileSync(latestPath, json);
}
function stamp(date) { return date.toISOString().replaceAll(":", "-").replaceAll(".", "-"); }
