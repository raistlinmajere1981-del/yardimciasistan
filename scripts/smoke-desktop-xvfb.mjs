import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { getLocalElectronExecutable } from "./test-helpers/local-electron.mjs";

const electronExecutable = getLocalElectronExecutable();

const xvfbCheck = spawnSync("xvfb-run", ["--help"], {
  encoding: "utf8"
});

if (xvfbCheck.status !== 0) {
  console.error("xvfb-run bulunamadı. Linux'ta xorg-server-xvfb paketini kurun.");
  process.exit(1);
}

const smokeDataDir = createSmokeDataDir();
const electron = spawn("xvfb-run", ["-a", electronExecutable, "apps/desktop-app", "--no-sandbox"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: "1",
    YA_DESKTOP_DATA_DIR: smokeDataDir
  }
});

let output = "";
let exited = false;
let stoppingAfterSuccessfulStart = false;
const successTimer = setTimeout(() => {
  if (!exited) {
    stoppingAfterSuccessfulStart = true;
    stopElectronProcessGroup();
  }
}, 8000);

electron.stdout.on("data", (chunk) => {
  output += chunk.toString();
});

electron.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

electron.on("error", (error) => {
  clearTimeout(successTimer);
  cleanupSmokeDataDir();
  console.error(error);
  process.exit(1);
});

electron.on("exit", (code, signal) => {
  exited = true;
  clearTimeout(successTimer);
  cleanupSmokeDataDir();

  if (stoppingAfterSuccessfulStart) {
    console.log("electron-started-ok: app stopped after smoke timeout");
    process.exit(0);
  }

  console.error(output.trim());
  console.error(`Electron erken kapandı. code=${code ?? "null"} signal=${signal ?? "null"}`);
  process.exit(1);
});

function stopElectronProcessGroup() {
  if (!electron.pid) {
    electron.kill("SIGTERM");
    return;
  }

  try {
    process.kill(-electron.pid, "SIGTERM");
  } catch {
    electron.kill("SIGTERM");
  }
}

function createSmokeDataDir() {
  return mkdtempSync(join(tmpdir(), "yardimci-desktop-xvfb-"));
}

function cleanupSmokeDataDir() {
  rmSync(smokeDataDir, { recursive: true, force: true });
}
