import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { getLocalElectronExecutable } from "./test-helpers/local-electron.mjs";

const xvfbCheck = spawnSync("xvfb-run", ["--help"], { encoding: "utf8" });
if (xvfbCheck.status !== 0) {
  console.error("xvfb-run bulunamadı. Linux'ta xorg-server-xvfb paketini kurun.");
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), "yardimci-desktop-xvfb-"));
let electron;
let browser;
let output = "";
let exited = false;
const deadline = Date.now() + 25000;

try {
  const port = await reservePort();
  electron = spawn("xvfb-run", [
    "-a",
    getLocalElectronExecutable(),
    `--remote-debugging-port=${port}`,
    "apps/desktop-app",
    "--no-sandbox"
  ], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1", YA_DESKTOP_DATA_DIR: profile }
  });
  electron.once("exit", () => { exited = true; });
  for (const stream of [electron.stdout, electron.stderr]) {
    stream?.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-80000);
    });
  }
  electron.on("error", (error) => { output += "\n" + error.message; exited = true; });

  while (!browser && !exited && Date.now() < deadline) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1200 });
    } catch {
      await delay(200);
    }
  }
  if (!browser) throw new Error("Electron DevTools bağlantısı kurulamadı.");

  let rendererReady = false;
  while (!rendererReady && !exited && Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (!page.url().startsWith("file:")) continue;
        const state = await page.evaluate(() => ({
          rootChildren: document.querySelector("#root")?.childElementCount ?? 0,
          bodyText: document.body?.innerText ?? ""
        })).catch(() => ({ rootChildren: 0, bodyText: "" }));
        if (state.rootChildren > 0 && state.bodyText.includes("Yardımcı Asistan")) {
          rendererReady = true;
          break;
        }
      }
      if (rendererReady) break;
    }
    if (!rendererReady) await delay(250);
  }
  if (!rendererReady) throw new Error("Electron çalışıyor ama Yardımcı Asistan renderer arayüzü hazır olmadı.");
  console.log("electron-started-ok: renderer DOM verified in isolated Xvfb session");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (output.trim()) console.error(output.trim());
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch { /* already closed */ }
  if (electron?.pid) {
    try {
      if (process.platform === "win32") electron.kill("SIGTERM");
      else process.kill(-electron.pid, "SIGTERM");
    } catch { /* already exited */ }
    await delay(500);
    if (!exited) {
      try {
        if (process.platform === "win32") electron.kill("SIGKILL");
        else process.kill(-electron.pid, "SIGKILL");
      } catch { /* already exited */ }
    }
  }
  rmSync(profile, { recursive: true, force: true });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close(() => port ? resolve(port) : reject(new Error("No local port available")));
    });
  });
}
