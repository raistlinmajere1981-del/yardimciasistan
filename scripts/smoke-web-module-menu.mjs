import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import process from "node:process";

const menuFile = "firm-template/web-module/data/menu.json";
const conversationsFile = "firm-template/web-module/data/ai-conversations.json";
const requestsFile = "firm-template/web-module/data/requests.json";
const originalMenuJson = readFileSync(menuFile, "utf8");
const originalConversationsJson = readFileSync(conversationsFile, "utf8");
const originalRequestsJson = readFileSync(requestsFile, "utf8");
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", "firm-template/web-module"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});

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
  await waitForUrl(`${baseUrl}/api/menu.php`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(`${baseUrl}/menu.html`);
  await expect(page.getByRole("heading", { name: "Deniz Çiçeği Menü" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kahvaltı" })).toBeVisible();
  await expect(page.getByText("Serpme Kahvaltı")).toBeVisible();

  await page.getByRole("button", { name: "İçecekler" }).click();
  await expect(page.getByRole("heading", { name: "İçecekler" })).toBeVisible();
  await expect(page.getByText("Türk Kahvesi")).toBeVisible();
  await expect(page.getByText("Serpme Kahvaltı")).toHaveCount(0);

  const response = await page.request.get(`${baseUrl}/api/menu.php`);
  expect(response.ok()).toBe(true);
  const menu = await response.json();
  expect(menu.ok).toBe(true);
  expect(menu.items.some((item) => item.id === "item_unavailable_sahlep")).toBe(false);
  expect(menu.categories.some((category) => category.id === "cat_hidden")).toBe(false);

  const publishResponse = await page.request.post(`${baseUrl}/api/sync.php`, {
    data: {
      action: "publish_menu",
      sync_secret: "change-this-secret",
      menu: {
        categories: [
          {
            id: "cat_smoke",
            name: "Smoke Test",
            description: "Geçici test kategorisi.",
            is_active: true,
            sort_order: 1,
            created_at: "2026-07-10T10:00:00+03:00",
            updated_at: "2026-07-10T10:00:00+03:00"
          }
        ],
        items: [
          {
            id: "item_smoke_001",
            category_id: "cat_smoke",
            name: "Smoke Kahvesi",
            description: "Yayınlama testi için geçici ürün.",
            price: 1,
            currency: "TRY",
            image_url: "",
            is_available: true,
            is_featured: true,
            allergens: [],
            tags: ["test"],
            sort_order: 1,
            created_at: "2026-07-10T10:00:00+03:00",
            updated_at: "2026-07-10T10:00:00+03:00"
          }
        ],
        updated_at: "2026-07-10T10:00:00+03:00"
      }
    }
  });
  expect(publishResponse.ok()).toBe(true);
  const publishResult = await publishResponse.json();
  expect(publishResult.ok).toBe(true);
  expect(publishResult.item_count).toBe(1);

  await page.goto(`${baseUrl}/menu.html`);
  await expect(page.getByRole("button", { name: "Smoke Test" })).toBeVisible();
  await expect(page.getByText("Smoke Kahvesi")).toBeVisible();

  const chatResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: {
      message: "12 Temmuz için kesin rezervasyon yapabilir misiniz?",
      history: [
        {
          role: "assistant",
          content: "Merhaba, nasıl yardımcı olabilirim?"
        }
      ]
    }
  });
  expect(chatResponse.ok()).toBe(true);
  const chatResult = await chatResponse.json();
  expect(chatResult.ok).toBe(true);
  expect(chatResult.fallback).toBe(true);
  expect(chatResult.answer).toContain("işletme sahibi");
  expect(chatResult.conversation_id).toMatch(/^ai_conv_/);
  expect(chatResult.request_created).toBe(false);
  expect(chatResult.request_missing_fields).toEqual(["customer_name", "customer_phone"]);

  const aiRequestResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: {
      message: "18 Temmuz saat 20:00 için 2 kişi balkonlu oda bilgisi almak istiyorum.",
      customer_name: "AI Misafir",
      customer_phone: "0555 333 44 55",
      request_type: "pension_reservation",
      date_text: "18 Temmuz",
      time: "20:00",
      guest_count: 2,
      create_request: true
    }
  });
  expect(aiRequestResponse.ok()).toBe(true);
  const aiRequestResult = await aiRequestResponse.json();
  expect(aiRequestResult.ok).toBe(true);
  expect(aiRequestResult.request_created).toBe(true);
  expect(aiRequestResult.request_id).toMatch(/^request_/);
  expect(aiRequestResult.request_missing_fields).toEqual([]);

  const requests = JSON.parse(readFileSync(requestsFile, "utf8"));
  const aiRequest = requests.find((request) => request.id === aiRequestResult.request_id);
  expect(aiRequest).toBeTruthy();
  expect(aiRequest.source).toBe("web_ai");
  expect(aiRequest.request_type).toBe("pension_reservation");
  expect(aiRequest.customer_phone).toBe("+905553334455");
  expect(aiRequest.date_text).toBe("18 Temmuz");
  expect(aiRequest.time).toBe("20:00");
  expect(aiRequest.guest_count).toBe(2);
  expect(aiRequest.sync_status).toBe("pending");

  const conversations = JSON.parse(readFileSync(conversationsFile, "utf8"));
  const aiConversation = conversations.find((conversation) => conversation.id === aiRequestResult.conversation_id);
  expect(aiConversation).toBeTruthy();
  expect(aiConversation.request_id).toBe(aiRequestResult.request_id);
  expect(aiConversation.status).toBe("converted_to_request");

  await browser.close();
  console.log(`web-module-menu-ok: ${baseUrl}/menu.html`);
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  writeFileSync(menuFile, originalMenuJson);
  writeFileSync(conversationsFile, originalConversationsJson);
  writeFileSync(requestsFile, originalRequestsJson);
  server.kill();
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
