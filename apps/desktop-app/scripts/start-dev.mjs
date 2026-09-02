import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, "..");
const repoRoot = join(appDir, "..", "..");
const DEV_RELAUNCH_EXIT_CODE = 75;

await run("npm", ["run", "build", "-w", "@yardimci-asistan/shared"], repoRoot);
await run("npm", ["run", "build", "-w", "@yardimci-asistan/ai-core"], repoRoot);
await run("npm", ["run", "build", "-w", "@yardimci-asistan/sync-core"], repoRoot);
await run("npx", ["tsc", "-p", "tsconfig.electron.json"], appDir);

const devServerUrl = "http://127.0.0.1:5174";
const vite = spawn("npx", ["vite", "--config", "vite.renderer.config.ts"], {
  cwd: appDir,
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32"
});

let electronStarted = false;
let electron = null;

function startElectron() {
  electron = spawn("npx", ["electron", "."], {
    cwd: appDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl
    }
  });

  electron.on("exit", (code) => {
    electron = null;
    if (code === DEV_RELAUNCH_EXIT_CODE) {
      // Data restore/reset asked for a relaunch. Keep Vite alive and start a
      // fresh Electron process against the same renderer server.
      startElectron();
      return;
    }
    vite.kill();
    process.exit(code ?? 0);
  });
}

vite.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);

  if (!electronStarted && text.includes("Local:")) {
    electronStarted = true;
    startElectron();
  }
});

vite.stderr.on("data", (chunk) => process.stderr.write(chunk));

process.on("SIGINT", () => {
  if (electron) electron.kill();
  vite.kill();
  process.exit(0);
});

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with ${code}`));
    });
  });
}
