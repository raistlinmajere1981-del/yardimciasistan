import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const demoWebRoot = join(repoRoot, "apps", "demo-web");
const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-demo-widget-"));
const webModuleRoot = join(tempRoot, "web-module");
cpSync(join(repoRoot, "firm-template", "web-module"), webModuleRoot, { recursive: true });
const businessConfigFile = join(webModuleRoot, "config", "business.json");
const conversationsFile = join(webModuleRoot, "data", "ai-conversations.json");
const originalBusinessConfigJson = readFileSync(businessConfigFile, "utf8");
for (const runtimeFile of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) {
  rmSync(join(webModuleRoot, "data", runtimeFile), { force: true });
}
const phpPort = await getFreePort();
let demoPort = await getFreePort();
while (demoPort === phpPort) {
  demoPort = await getFreePort();
}
const webModuleUrl = `http://127.0.0.1:${phpPort}`;
const demoWebUrl = `http://127.0.0.1:${demoPort}`;
const processes = [];

let browser;

try {
  writeFileSync(conversationsFile, "[]\n");
  allowDemoOrigin(demoWebUrl);

  const phpServer = startProcess("php", ["-S", `127.0.0.1:${phpPort}`, "-t", webModuleRoot], repoRoot);
  await waitForUrl(`${webModuleUrl}/api/menu.php`, phpServer);

  const demoServer = startProcess("npx", ["vite", "--host", "127.0.0.1", "--port", String(demoPort), "--strictPort"], demoWebRoot, {
    VITE_YA_WEB_MODULE_URL: webModuleUrl
  });
  await waitForUrl(demoWebUrl, demoServer);

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  await page.goto(demoWebUrl, { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: /Günlük işletme işlerini/i }).first()).toBeVisible();
  await expect(page.getByText("Market / Perakende", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Yardımcı Asistan'ı aç" })).toBeVisible();
  await expect(page.locator(".ya-widget-button img.ya-widget-mark")).toHaveAttribute("src", `${webModuleUrl}/assets/yardimci-asistan-symbol.png`);

  await page.evaluate(() => {
    window.open = (url) => {
      window.__yardimciAsistanLastOpenedUrl = String(url);
      return null;
    };
  });

  await page.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(page.locator(".ya-widget-header strong")).toContainText("Yardımcı Asistan");
  await expect(page.getByRole("heading", { name: "Size nasıl yardımcı olayım?" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Menüyü gör/i })).toHaveCount(0);
  await expect(page.locator(".ya-widget-panel")).not.toContainText("mm/dd/yyyy");
  const mobilePanelBox = await page.locator(".ya-widget-panel").boundingBox();
  expect(mobilePanelBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((mobilePanelBox?.x ?? 0) + (mobilePanelBox?.width ?? 0)).toBeLessThanOrEqual(420);
  await page.locator('[data-ya-request-type="pension_reservation"]').click();
  await page.locator('.ya-widget-form input[name="customer_name"]').fill("Demo Web Widget");
  await page.locator('.ya-widget-form input[name="customer_phone"]').fill("0555 222 11 00");
  await page.locator('[data-ya-date-preset="tomorrow"]').click();
  await page.locator('.ya-widget-form input[name="guest_count"]').fill("2");
  await page.locator('.ya-widget-form textarea[name="message"]').fill("Sessiz oda için bilgi rica ederiz.");
  const requestResponsePromise = page.waitForResponse((response) => response.url() === `${webModuleUrl}/api/request.php` && response.request().method() === "POST");
  await page.locator('.ya-widget-form button[type="submit"]').click();
  const requestResponse = await requestResponsePromise;
  expect(requestResponse.status()).toBe(201);
  await expect(page.locator(".ya-widget-status")).toContainText("WhatsApp mesajı hazırlandı");

  const openedUrl = await page.evaluate(() => window.__yardimciAsistanLastOpenedUrl ?? "");
  expect(openedUrl).toContain("https://wa.me/905316969334");
  expect(decodeURIComponent(openedUrl)).toContain("Demo Web Widget");

  const requests = await pullRequests();
  expect(requests).toHaveLength(1);
  expect(requests[0].source).toBe("web_form");
  expect(requests[0].customer_name).toBe("Demo Web Widget");
  expect(requests[0].customer_phone).toBe("+905552221100");
  expect(requests[0].sync_status).toBe("pending");

  await page.locator('[data-ya-view="home"]').click();
  await page.locator('[data-ya-view="info"]').click();
  await expect(page.getByRole("heading", { name: "Merak ettiğiniz şeyi sorun" })).toBeVisible();
  await page.locator(".ya-widget-ai textarea").fill("Bu akşam 2 kişilik masa var mı?");
  const chatResponsePromise = page.waitForResponse((response) => response.url() === `${webModuleUrl}/api/chat.php` && response.request().method() === "POST");
  await page.locator('.ya-widget-ai button[type="submit"]').click();
  const chatResponse = await chatResponsePromise;
  expect(chatResponse.status()).toBe(200);
  await expect(page.locator(".ya-widget-ai-answer")).toContainText("işletme sahibi");
  await expect(page.locator(".ya-widget-status")).toContainText("AI bağlantısı işletme ayarlarında kapalı");
  await expect(page.locator(".ya-widget-status")).toContainText("ai_disabled");

  const conversations = JSON.parse(readFileSync(conversationsFile, "utf8"));
  expect(conversations).toHaveLength(1);
  expect(conversations[0].source).toBe("web_ai");
  expect(conversations[0].status).toBe("fallback");

  await page.locator('[data-ya-view="home"]').click();
  await page.locator('[data-ya-view="whatsapp"]').click();
  await page.locator('[data-ya-whatsapp-topic="table"]').click();
  await expect(page.locator("[data-ya-message-preview]")).toContainText("masa müsaitliği");
  await page.locator('[data-ya-whatsapp-form] button[type="submit"]').click();
  await expect(page.locator(".ya-widget-status")).toContainText("Mesajınız WhatsApp'ta hazırlandı");
  const directMessageUrl = await page.evaluate(() => window.__yardimciAsistanLastOpenedUrl ?? "");
  expect(decodeURIComponent(directMessageUrl)).toContain("masa müsaitliği");

  await page.locator('[data-ya-view="home"]').click();
  await expect(page.getByRole("heading", { name: "Size nasıl yardımcı olayım?" })).toBeVisible();

  console.log(`demo-web-widget-smoke-ok: ${demoWebUrl} -> ${webModuleUrl}`);
} finally {
  if (browser) {
    await browser.close();
  }
  stopProcesses();
  rmSync(tempRoot, { recursive: true, force: true });
}

function allowDemoOrigin(origin) {
  const config = JSON.parse(originalBusinessConfigJson);
  const allowedOrigins = Array.isArray(config.allowed_origins) ? config.allowed_origins : [];
  config.allowed_origins = Array.from(new Set([...allowedOrigins, origin]));
  writeFileSync(businessConfigFile, `${JSON.stringify(config, null, 2)}\n`);
}

async function pullRequests() {
  const response = await fetch(`${webModuleUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": "change-this-secret"
    },
    body: JSON.stringify({ action: "pull_requests", after_seq: 0, limit: 20 })
  });
  expect(response.status).toBe(200);
  return (await response.json()).requests;
}

function startProcess(command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });
  child.output = "";
  child.stdout.on("data", (chunk) => {
    child.output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    child.output += chunk.toString();
  });
  processes.push(child);
  return child;
}

function stopProcesses() {
  for (const child of [...processes].reverse()) {
    if (child.exitCode === null) {
      child.kill();
    }
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const freePort = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(freePort));
    });
  });
}

async function waitForUrl(url, processHandle) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Server erken kapandı: ${url}\n${processHandle.output.trim()}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await delay(100);
  }

  throw new Error(`Server hazır olmadı: ${url}\n${processHandle.output.trim()}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
