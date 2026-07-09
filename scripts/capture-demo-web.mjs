import { chromium, devices } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const providedBaseUrl = process.env.DEMO_WEB_URL;
const outputDir = join(process.cwd(), "artifacts", "screenshots");
mkdirSync(outputDir, { recursive: true });

let devServer = null;
const baseUrl = providedBaseUrl ?? await startDemoWebServer();
const browser = await chromium.launch();

process.once("SIGINT", () => stopAndExit(130));
process.once("SIGTERM", () => stopAndExit(143));

try {
  await capture("demo-web-desktop.png", {
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    isMobile: false
  });

  await capture("demo-web-mobile.png", {
    ...devices["Pixel 7"]
  });
} finally {
  await browser.close();
  stopDemoWebServer();
}

async function capture(filename, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({
    path: join(outputDir, filename),
    fullPage: true
  });
  await context.close();
  console.log(`Kaydedildi: artifacts/screenshots/${filename}`);
}

function startDemoWebServer() {
  return new Promise((resolveUrl, reject) => {
    const child = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "5173"], {
      cwd: join(repoRoot, "apps", "demo-web"),
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32"
    });

    devServer = child;
    child.output = "";

    const timeout = setTimeout(() => {
      cleanupListeners();
      stopDemoWebServer();
      reject(new Error(`Demo web server hazır olmadı.\n${child.output.trim()}`));
    }, 30000);

    const onData = (chunk) => {
      const text = chunk.toString();
      child.output += text;
      if (child.output.length > 20000) {
        child.output = child.output.slice(-10000);
      }

      const match = child.output.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+\/)/);
      if (match) {
        cleanupListeners();
        resolveUrl(match[1]);
      }
    };

    const onExit = (code) => {
      cleanupListeners();
      reject(new Error(`Demo web server erken kapandı (${code ?? 0}).\n${child.output.trim()}`));
    };

    const cleanupListeners = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });
}

function stopDemoWebServer() {
  if (devServer && devServer.exitCode === null) {
    devServer.kill();
  }
}

function stopAndExit(code) {
  stopDemoWebServer();
  process.exit(code);
}
