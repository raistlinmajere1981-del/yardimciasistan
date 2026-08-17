import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const launch = process.argv.includes("--launch");
const root = process.cwd();
const sandboxRoot = join(root, "artifacts", "pilot-sandbox");
const sandboxId = safeTimestamp(new Date());
const sandboxDir = resolve(sandboxRoot, sandboxId);
const dataDir = join(sandboxDir, "user-data");
const manifestPath = join(sandboxDir, "sandbox.json");

mkdirSync(dataDir, { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify({
  schema_version: 1,
  created_at: new Date().toISOString(),
  sandbox_id: sandboxId,
  user_data_dir: dataDir,
  purpose: "Yardımcı Asistan pre-pilot isolated desktop test",
  real_identity_data_allowed: false
}, null, 2)}\n`);

console.log("\nYardımcı Asistan — İzole Pilot Sandbox");
console.log(`User-data: ${dataDir}`);
console.log(`Manifest: ${manifestPath}`);
console.log("Bu klasör gerçek uygulama verisinden bağımsızdır ve artifacts/ altında git dışıdır.\n");

if (!launch) {
  printManualLaunch(dataDir);
  process.exit(0);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
console.log("Masaüstü uygulaması sandbox verisiyle açılıyor...\n");
const child = spawn(npmCommand, ["run", "dev:desktop"], {
  cwd: root,
  env: {
    ...process.env,
    YA_DESKTOP_DATA_DIR: dataDir
  },
  stdio: "inherit",
  shell: false
});

child.on("error", (error) => {
  console.error(`Sandbox masaüstü başlatılamadı: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.log(`Sandbox masaüstü ${signal} sinyaliyle kapandı.`);
    return;
  }
  process.exitCode = code ?? 0;
});

function printManualLaunch(directory) {
  if (process.platform === "win32") {
    console.log("PowerShell ile açmak için:");
    console.log(`$env:YA_DESKTOP_DATA_DIR='${escapePowerShell(directory)}'; npm run dev:desktop`);
    return;
  }
  console.log("Açmak için:");
  console.log(`YA_DESKTOP_DATA_DIR=${shellQuote(directory)} npm run dev:desktop`);
}

function safeTimestamp(date) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function escapePowerShell(value) {
  return value.replaceAll("'", "''");
}
