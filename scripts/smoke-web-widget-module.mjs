import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import process from "node:process";

const conversationsFile = "firm-template/web-module/data/ai-conversations.json";
const requestsFile = "firm-template/web-module/data/requests.json";
const originalConversationsJson = readFileSync(conversationsFile, "utf8");
const originalRequestsJson = readFileSync(requestsFile, "utf8");
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", "firm-template/web-module"], {
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
  writeFileSync(conversationsFile, "[]\n");
  writeFileSync(requestsFile, "[]\n");
  await waitForUrl(`${baseUrl}/widget.js`);

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "domcontentloaded" });
  await injectWidget(page, baseUrl);

  await expect(page.getByRole("button", { name: "Yardımcı Asistan'ı aç" })).toBeVisible();
  await expect(page.locator(".ya-widget-button img.ya-widget-mark")).toHaveAttribute("src", `${baseUrl}/assets/yardimci-asistan-symbol.png`);

  await page.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(page.locator(".ya-widget-header img.ya-widget-mark")).toHaveAttribute("src", `${baseUrl}/assets/yardimci-asistan-symbol.png`);
  await expect(page.locator(".ya-widget-header strong")).toHaveText("Deniz Çiçeği Pansiyon & Kafe");

  await page.locator('[data-ya-view="info"]').click();
  await expect(page.locator(".ya-widget-ai textarea")).toBeVisible();
  await page.locator(".ya-widget-ai textarea").fill("Bu akşam 4 kişilik masa var mı?");
  await page.locator('.ya-widget-ai button[type="submit"]').click();

  await expect(page.locator(".ya-widget-ai-answer")).toContainText("işletme sahibi");
  await expect(page.locator(".ya-widget-status")).toContainText("güvenli yanıt");

  const conversations = JSON.parse(readFileSync(conversationsFile, "utf8"));
  expect(conversations).toHaveLength(1);
  expect(conversations[0].source).toBe("web_ai");
  expect(conversations[0].request_id).toBe("");
  expect(conversations[0].status).toBe("fallback");
  expect(conversations[0].messages_json).toContain("Bu akşam 4 kişilik masa var mı?");
  expect(conversations[0].messages_json).toContain("işletme sahibi");

  const requests = JSON.parse(readFileSync(requestsFile, "utf8"));
  expect(requests).toHaveLength(0);

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
  writeFileSync(conversationsFile, originalConversationsJson);
  writeFileSync(requestsFile, originalRequestsJson);
  server.kill();
}

async function injectWidget(page, widgetBaseUrl) {
  await page.evaluate((url) => {
    document.body.innerHTML = "<main>Firma sitesi</main>";

    const script = document.createElement("script");
    script.src = `${url}/widget.js`;
    script.dataset.businessName = "Deniz Çiçeği Pansiyon & Kafe";
    script.dataset.whatsappPhone = "+90 532 123 45 67";
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
      if (response.ok) {
        return;
      }
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
