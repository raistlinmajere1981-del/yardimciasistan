import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const fullMode = args.has("--full");
const androidMode = fullMode || args.has("--android");
const uiMode = fullMode || args.has("--ui");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const startedAt = new Date();
const reportDirectory = join(process.cwd(), "artifacts", "pilot-check");
const reportPath = join(reportDirectory, `${safeTimestamp(startedAt)}.json`);
const latestReportPath = join(reportDirectory, "latest.json");

const blockingChecks = [
  npmCheck("build-packages", "Ortak paketleri derle", ["run", "build:packages"]),
  npmCheck("build-desktop", "Masaüstü uygulamasını derle", ["run", "build", "-w", "@yardimci-asistan/desktop-app"]),
  npmCheck("typecheck", "Workspace TypeScript kontrolleri", ["run", "typecheck"]),
  npmCheck("php-lint", "Web modülü PHP lint", ["run", "lint:php"]),
  npmCheck("package-web-module", "Web modülü dağıtım paketini doğrula", ["run", "pack:web-module"])
];

const coreChecks = [
  nodeCheck("web-form-api", "Web talebi + public abuse guard", "scripts/smoke-web-form-api.mjs"),
  nodeCheck("web-widget-module", "Web widget + gerçek PHP modülü", "scripts/smoke-web-widget-module.mjs"),
  nodeCheck("automatic-sync", "Otomatik senkron ve geri dönüş", "scripts/smoke-automatic-sync.mjs"),
  nodeCheck("android-device-approval", "Android yeni cihaz onay sınırı", "scripts/smoke-android-device-approval-hosting.mjs"),
  nodeCheck("android-device-token", "Android cihaz token güvenliği", "scripts/smoke-android-device-token.mjs"),
  nodeCheck("android-release-secret", "Release Android bağlantısında ortak anahtar sızıntısı", "scripts/smoke-android-release-connection.mjs"),
  nodeCheck("app-lock", "Masaüstü uygulama kilidi", "scripts/smoke-app-lock.mjs"),
  nodeCheck("table-categories", "Masa kategori veri akışı", "scripts/smoke-table-categories-db.mjs"),
  nodeCheck("record-deletions", "Kayıt silme ve arşivleme sınırları", "scripts/smoke-record-deletions.mjs"),
  nodeCheck("customer-room-management", "Müşteri ve oda yönetimi", "scripts/smoke-customer-room-management-db.mjs"),
  nodeCheck("daily-tasks", "Günlük iş yönetimi", "scripts/smoke-daily-task-management.mjs"),
  nodeCheck("stock-image-db", "Stok görseli veri uygulama katmanı", "scripts/smoke-stock-image-import-db.mjs"),
  nodeCheck("reports", "Rapor veri modeli", "scripts/smoke-reports-db.mjs"),
  nodeCheck("finance-db", "Finans veri bütünlüğü", "scripts/smoke-finance-db.mjs"),
  nodeCheck("finance-service", "Finans servis sözleşmesi", "scripts/smoke-finance-service.mjs"),
  nodeCheck("room-folio", "Oda hesabı/tahsilat/çıkış", "scripts/smoke-room-folio-service.mjs"),
  nodeCheck("restaurant-room-transfer", "Restoran hesabını oda hesabına aktarma", "scripts/smoke-room-folio-table-order-transfer.mjs"),
  nodeCheck("demo-flow", "Web → masaüstü → Android uçtan uca demo akışı", "scripts/smoke-demo-flow.mjs"),
  nodeCheck("desktop-renderer", "Masaüstü renderer statik smoke", "scripts/smoke-desktop-renderer.mjs")
];

const optionalChecks = [];
if (uiMode && process.platform === "linux") {
  optionalChecks.push(nodeCheck("desktop-xvfb", "Electron Xvfb açılış smoke", "scripts/smoke-desktop-xvfb.mjs"));
}
if (androidMode) {
  optionalChecks.push(npmCheck("android-build", "Android birim testleri + debug APK", ["run", "smoke:android:build"]));
}
if (fullMode) {
  optionalChecks.push(npmCheck("e2e", "Playwright uçtan uca testleri", ["run", "e2e"]));
}

const report = {
  schema_version: 1,
  started_at: startedAt.toISOString(),
  finished_at: "",
  mode: fullMode ? "full" : androidMode || uiMode ? "extended" : "core",
  options: {
    android: androidMode,
    ui: uiMode,
    e2e: fullMode
  },
  host: {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    node: process.version
  },
  result: "running",
  checks: []
};

mkdirSync(reportDirectory, { recursive: true });

console.log("\nYardımcı Asistan — Pilot Check");
console.log(`Mod: ${report.mode}`);
console.log(`Platform: ${report.host.platform} ${report.host.arch} · Node ${report.host.node}\n`);

let blockingFailed = false;
for (const check of blockingChecks) {
  const result = runCheck(check);
  report.checks.push(result);
  writeReport();
  if (result.status !== "passed") {
    blockingFailed = true;
    break;
  }
}

if (!blockingFailed) {
  for (const check of [...coreChecks, ...optionalChecks]) {
    report.checks.push(runCheck(check));
    writeReport();
  }
} else {
  for (const check of [...coreChecks, ...optionalChecks]) {
    report.checks.push({
      id: check.id,
      label: check.label,
      status: "skipped",
      duration_ms: 0,
      exit_code: null,
      reason: "Ön koşul/build aşaması başarısız olduğu için çalıştırılmadı."
    });
  }
}

const failed = report.checks.filter((check) => check.status === "failed");
const passed = report.checks.filter((check) => check.status === "passed");
const skipped = report.checks.filter((check) => check.status === "skipped");
report.finished_at = new Date().toISOString();
report.result = failed.length === 0 && skipped.length === 0 ? "passed" : "failed";
writeReport();

console.log("\nPilot Check özeti");
console.log(`  Geçen: ${passed.length}`);
console.log(`  Kalan: ${failed.length}`);
console.log(`  Atlanan: ${skipped.length}`);
console.log(`  Rapor: ${reportPath}`);

if (failed.length > 0) {
  console.log("\nKalan kapılar:");
  for (const check of failed) {
    console.log(`  - ${check.label}`);
  }
}

if (report.result !== "passed") {
  process.exitCode = 1;
} else {
  console.log("\nTemel pilot otomasyon kapıları geçti.");
}

function runCheck(check) {
  const started = Date.now();
  console.log(`\n▶ ${check.label}`);
  const result = spawnSync(check.command, check.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false
  });
  const durationMs = Date.now() - started;
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const status = exitCode === 0 && !result.error ? "passed" : "failed";
  console.log(`${status === "passed" ? "✓" : "✗"} ${check.label} (${formatDuration(durationMs)})`);
  if (result.error) {
    console.error(result.error.message);
  }
  return {
    id: check.id,
    label: check.label,
    status,
    duration_ms: durationMs,
    exit_code: exitCode,
    error: result.error?.message ?? ""
  };
}

function npmCheck(id, label, npmArgs) {
  return { id, label, command: npmCommand, args: npmArgs };
}

function nodeCheck(id, label, scriptPath) {
  return { id, label, command: process.execPath, args: [scriptPath] };
}

function writeReport() {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(reportPath, serialized);
  writeFileSync(latestReportPath, serialized);
}

function safeTimestamp(date) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function formatDuration(milliseconds) {
  if (milliseconds < 1000) return `${milliseconds} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} sn`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} dk ${Math.round(seconds % 60)} sn`;
}
