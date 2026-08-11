import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-widget-module-"));
const webModuleRoot = join(tempRoot, "web-module");
cpSync(join(process.cwd(), "firm-template", "web-module"), webModuleRoot, { recursive: true });
const conversationsFile = join(webModuleRoot, "data", "ai-conversations.json");
const requestsFile = join(webModuleRoot, "data", "requests.json");
for (const runtimeFile of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) {
  rmSync(join(webModuleRoot, "data", runtimeFile), { force: true });
}
writeFileSync(conversationsFile, "[]\n");
writeFileSync(requestsFile, "[]\n");
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", webModuleRoot], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;
let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForUrl(`${baseUrl}/widget.js`);

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "domcontentloaded" });
  await injectWidget(page, baseUrl);

  await expect(page.getByRole("button", { name: "Yardımcı Asistan'ı aç" })).toBeVisible();
  await expect(page.locator(".ya-widget-button img.ya-widget-mark")).toHaveAttribute("src", `${baseUrl}/assets/yardimci-asistan-symbol.png`);

  await page.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(page.locator(".ya-widget-header img.ya-widget-mark")).toHaveAttribute("src", `${baseUrl}/assets/yardimci-asistan-symbol.png`);
  await expect(page.locator(".ya-widget-header strong")).toHaveText("Deniz Çiçeği AI Asistanı");
  await expect(page.getByRole("link", { name: /Menüyü gör/i })).toHaveCount(0);

  await page.evaluate(() => {
    window.open = (url) => {
      window.__yardimciAsistanLastOpenedUrl = String(url);
      return null;
    };
  });

  await page.locator('[data-ya-request-type="restaurant_reservation"]').click();
  await expect(page.locator('.ya-widget-form button[type="submit"]')).toContainText("Talebi Gönder");
  await expect(page.locator(".ya-widget-subview-intro p")).toContainText("doğrudan iletin");
  await expect(page.locator(".ya-widget-form-note")).toContainText("WhatsApp kullanmak zorunlu değildir");

  await page.locator('.ya-widget-form input[name="customer_name"]').fill("Widget Misafir");
  await page.locator('.ya-widget-form input[name="customer_phone"]').fill("0555 444 33 22");
  await page.locator('[data-ya-date-preset="today"]').click();
  await page.locator('.ya-widget-form input[name="guest_count"]').fill("4");
  await page.locator('.ya-widget-form textarea[name="message"]').fill("Bahçede sakin bir masa rica ediyoruz.");

  const requestResponsePromise = page.waitForResponse((response) => response.url() === `${baseUrl}/api/request.php` && response.request().method() === "POST");
  await page.locator('.ya-widget-form button[type="submit"]').click();
  const requestResponse = await requestResponsePromise;
  expect(requestResponse.status()).toBe(201);
  const requestResult = await requestResponse.json();
  expect(requestResult.ok).toBe(true);
  expect(requestResult.request_id).toMatch(/^request_/);

  await expect(page.locator(".ya-widget-request-success")).toBeVisible();
  await expect(page.locator(".ya-widget-view-title")).toHaveText("Talebiniz işletmeye iletildi");
  await expect(page.locator(".ya-widget-request-success-card")).toContainText("Talebiniz kaydedildi");
  await expect(page.locator('[data-ya-request-whatsapp="1"]')).toContainText("WhatsApp'tan da yaz");

  const openedBeforeOptionalWhatsApp = await page.evaluate(() => window.__yardimciAsistanLastOpenedUrl ?? "");
  expect(openedBeforeOptionalWhatsApp).toBe("");

  const requestsAfterForm = await pullRequests();
  expect(requestsAfterForm).toHaveLength(1);
  expect(requestsAfterForm[0].id).toBe(requestResult.request_id);
  expect(requestsAfterForm[0].source).toBe("web_form");
  expect(requestsAfterForm[0].request_type).toBe("restaurant_reservation");
  expect(requestsAfterForm[0].customer_name).toBe("Widget Misafir");
  expect(requestsAfterForm[0].customer_phone).toBe("+905554443322");
  expect(requestsAfterForm[0].date_text).toMatch(/^Bugün, /);
  expect(requestsAfterForm[0].guest_count).toBe(4);
  expect(requestsAfterForm[0].message).toContain("Bahçede sakin");
  expect(requestsAfterForm[0].sync_status).toBe("pending");

  await page.locator('[data-ya-request-whatsapp="1"]').click();
  const openedUrl = await page.evaluate(() => window.__yardimciAsistanLastOpenedUrl ?? "");
  expect(openedUrl).toContain("https://wa.me/905316969334");
  expect(decodeURIComponent(openedUrl)).toContain("Masa rezervasyonu");
  expect(decodeURIComponent(openedUrl)).toContain("Widget Misafir");

  const requestsAfterOptionalWhatsApp = await pullRequests();
  expect(requestsAfterOptionalWhatsApp).toHaveLength(1);
  expect(requestsAfterOptionalWhatsApp[0].id).toBe(requestResult.request_id);

  await page.locator('[data-ya-request-done="1"]').click();
  await page.locator('[data-ya-view="info"]').click();
  await expect(page.locator(".ya-widget-ai textarea")).toBeVisible();
  await page.locator(".ya-widget-ai textarea").fill("Bu akşam 4 kişilik masa var mı?");
  await page.locator('.ya-widget-ai button[type="submit"]').click();

  await expect(page.locator(".ya-widget-ai-answer")).toContainText("işletme sahibi");
  await expect(page.locator(".ya-widget-status")).toContainText("AI bağlantısı işletme ayarlarında kapalı");
  await expect(page.locator(".ya-widget-status")).toContainText("ai_disabled");

  const conversations = JSON.parse(readFileSync(conversationsFile, "utf8"));
  expect(conversations).toHaveLength(1);
  expect(conversations[0].source).toBe("web_ai");
  expect(conversations[0].request_id).toBe("");
  expect(conversations[0].status).toBe("fallback");
  expect(conversations[0].error_code).toBe("ai_disabled");
  expect(conversations[0].messages_json).toContain("Bu akşam 4 kişilik masa var mı?");
  expect(conversations[0].messages_json).toContain("işletme sahibi");

  const requests = await pullRequests();
  expect(requests).toHaveLength(1);
  expect(requests[0].id).toBe(requestResult.request_id);

  console.log(`web-widget-module-smoke-ok: ${baseUrl}/widget.js`);
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  if (browser) {
    await browser.close();
  }
  server.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}

async function pullRequests() {
  const response = await fetch(`${baseUrl}/api/sync.php`, {
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

async function injectWidget(page, widgetBaseUrl) {
  await page.evaluate((url) => {
    document.body.innerHTML = "<main>Firma sitesi</main>";

    const script = document.createElement("script");
    script.src = `${url}/widget.js`;
    script.dataset.businessName = "Deniz Çiçeği Pansiyon & Kafe";
    script.dataset.whatsappPhone = "+90 531 696 9334";
    script.dataset.apiBaseUrl = url;
    script.dataset.menuUrl = `${url}/menu.html`;
    script.dataset.logoUrl = `${url}/assets/yardimci-asistan-symbol.png`;
    script.dataset.primaryColor = "#2F6F5E";
    script.dataset.accentColor = "#E47863";

    return new Promise((resolve, reject) => {
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error("Widget script could not be loaded.")), { once: true });
      document.body.appendChild(script);
    });
  }, widgetBaseUrl);
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

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(100);
  }
  throw new Error(`PHP server did not become ready: ${url}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
