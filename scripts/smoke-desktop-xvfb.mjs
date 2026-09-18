import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const electronExecutable = require("electron");

const xvfbCheck = spawnSync("xvfb-run", ["--help"], {
  encoding: "utf8"
});

if (xvfbCheck.status !== 0) {
  console.error("xvfb-run bulunamadı. Linux'ta xorg-server-xvfb paketini kurun.");
  process.exit(1);
}

const electron = spawn("xvfb-run", ["-a", electronExecutable, "apps/desktop-app", "--no-sandbox"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: "1",
    YA_DESKTOP_DATA_DIR: createSmokeDataDir()
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

electron.on("exit", (code, signal) => {
  exited = true;
  clearTimeout(successTimer);

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
  const directory = join(process.cwd(), "artifacts", "desktop-smoke-data");
  mkdirSync(directory, { recursive: true });
  return directory;
}
