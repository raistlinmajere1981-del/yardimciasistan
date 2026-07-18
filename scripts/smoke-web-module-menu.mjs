import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-web-module-"));
const webModuleRoot = join(tempRoot, "web-module");
cpSync(join(process.cwd(), "firm-template", "web-module"), webModuleRoot, { recursive: true });
const menuFile = join(webModuleRoot, "data", "menu.json");
const conversationsFile = join(webModuleRoot, "data", "ai-conversations.json");
const requestsFile = join(webModuleRoot, "data", "requests.json");
const aiSettingsFile = join(webModuleRoot, "data", "ai-settings.local.php");
for (const runtimeFile of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) {
  rmSync(join(webModuleRoot, "data", runtimeFile), { force: true });
}
if (existsSync(aiSettingsFile)) {
  unlinkSync(aiSettingsFile);
}
writeFileSync(conversationsFile, "[]\n");
writeFileSync(requestsFile, "[]\n");
const mockAiApiKey = "smoke-ai-key-do-not-log";
const mockAiModel = "smoke-model-001";
const mockAiRequests = [];
const mockAiServer = http.createServer(async (request, response) => {
  const body = await readJsonRequest(request);
  mockAiRequests.push({
    url: request.url,
    authorization: String(request.headers.authorization ?? ""),
    googleApiKey: String(request.headers["x-goog-api-key"] ?? ""),
    body
  });
  if (String(request.url).includes(":generateContent")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Mock Gemini yanıtı hazırlandı." }] } }]
    }));
    return;
  }
  const lastMessage = Array.isArray(body?.messages) ? String(body.messages.at(-1)?.content ?? "") : "";
  if (lastMessage.includes("limit testi")) {
    response.writeHead(429, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: "Rate limit exceeded. Please try again later." } }));
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({
    choices: [
      {
        message: {
          content: "Mock AI yanıtı hazırlandı; kesin bilgi için işletme sahibi kontrol edecektir."
        }
      }
    ]
  }));
});
const mockAiPort = await listenOnRandomPort(mockAiServer);
const mockAiBaseUrl = `http://127.0.0.1:${mockAiPort}/v1`;
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", webModuleRoot], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
let browser;
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForUrl(`${baseUrl}/api/menu.php`);

  browser = await chromium.launch();
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
  const initialEtag = response.headers().etag;
  expect(initialEtag).toMatch(/^"ya-menu-/);
  const cachedResponse = await page.request.get(`${baseUrl}/api/menu.php`, {
    headers: { "If-None-Match": initialEtag }
  });
  expect(cachedResponse.status()).toBe(304);
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

  const changedMenuResponse = await page.request.get(`${baseUrl}/api/menu.php`, {
    headers: { "If-None-Match": initialEtag }
  });
  expect(changedMenuResponse.status()).toBe(200);
  expect(changedMenuResponse.headers().etag).not.toBe(initialEtag);

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
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
  expect(chatResult.error).toMatchObject({
    code: "ai_disabled",
    retryable: false,
    provider_status: null
  });
  expect(chatResult.answer).toContain("işletme sahibi");
  expect(chatResult.conversation_id).toMatch(/^ai_conv_/);
  expect(chatResult.request_created).toBe(false);
  expect(chatResult.request_missing_fields).toEqual(["customer_name", "customer_phone"]);

  const aiSettingsPayload = {
    enabled: true,
    provider: "openai_compatible",
    service: "custom",
    base_url: `${mockAiBaseUrl}/`,
    model: mockAiModel,
    api_key: mockAiApiKey,
    timeout_seconds: 10
  };
  const headerlessAiPublishResponse = await page.request.post(`${baseUrl}/api/sync.php`, {
    data: {
      action: "publish_ai_settings",
      sync_secret: "change-this-secret",
      ai_settings: aiSettingsPayload
    }
  });
  expect(headerlessAiPublishResponse.status()).toBe(401);
  expect(await headerlessAiPublishResponse.text()).not.toContain(mockAiApiKey);

  const getAiPublishResponse = await page.request.get(`${baseUrl}/api/sync.php?action=publish_ai_settings`, {
    headers: {
      "X-YA-Sync-Secret": "change-this-secret"
    }
  });
  expect(getAiPublishResponse.status()).toBe(405);

  const invalidUrlAiPublishResponse = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: {
      "X-YA-Sync-Secret": "change-this-secret"
    },
    data: {
      action: "publish_ai_settings",
      ai_settings: {
        ...aiSettingsPayload,
        base_url: "https://user:password@provider.example/v1"
      }
    }
  });
  expect(invalidUrlAiPublishResponse.status()).toBe(422);
  expect(await invalidUrlAiPublishResponse.text()).not.toContain(mockAiApiKey);
  expect(existsSync(aiSettingsFile)).toBe(false);

  const aiPublishResponse = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: {
      "X-YA-Sync-Secret": "change-this-secret"
    },
    data: {
      action: "publish_ai_settings",
      ai_settings: aiSettingsPayload
    }
  });
  expect(aiPublishResponse.ok()).toBe(true);
  const aiPublishResponseText = await aiPublishResponse.text();
  expect(aiPublishResponseText).not.toContain(mockAiApiKey);
  const aiPublishResult = JSON.parse(aiPublishResponseText);
  expect(aiPublishResult).toMatchObject({
    ok: true,
    enabled: true,
    provider: "openai_compatible",
    service: "custom",
    base_url: mockAiBaseUrl,
    model: mockAiModel,
    timeout_seconds: 10,
    has_api_key: true
  });
  expect(aiPublishResult.api_key).toBeUndefined();
  expect(statSync(aiSettingsFile).mode & 0o777).toBe(0o600);

  const directAiSettingsResponse = await page.request.get(`${baseUrl}/data/ai-settings.local.php`);
  expect(await directAiSettingsResponse.text()).toBe("");

  const liveChatResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: {
      message: "Merhaba, kısaca yardımcı olabilir misiniz?"
    }
  });
  expect(liveChatResponse.ok()).toBe(true);
  const liveChatResult = await liveChatResponse.json();
  expect(liveChatResult.ok).toBe(true);
  expect(liveChatResult.fallback).toBe(false);
  expect(liveChatResult.answer).toContain("Mock AI yanıtı");
  expect(liveChatResult.model).toBe(mockAiModel);
  expect(JSON.stringify(liveChatResult)).not.toContain(mockAiApiKey);
  expect(mockAiRequests).toHaveLength(1);
  expect(mockAiRequests[0]).toMatchObject({
    url: "/v1/chat/completions",
    authorization: `Bearer ${mockAiApiKey}`
  });
  expect(mockAiRequests[0].body).toMatchObject({
    model: mockAiModel,
    store: false
  });

  const rateLimitedResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: {
      message: "Sağlayıcı limit testi"
    }
  });
  expect(rateLimitedResponse.ok()).toBe(true);
  const rateLimitedResult = await rateLimitedResponse.json();
  expect(rateLimitedResult.fallback).toBe(true);
  expect(rateLimitedResult.error).toMatchObject({
    code: "provider_rate_limited",
    retryable: true,
    provider_status: 429
  });
  expect(rateLimitedResult.answer).toContain("istek sınırına ulaştı");
  expect(JSON.stringify(rateLimitedResult)).not.toContain(mockAiApiKey);

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

  const pullAiRequests = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": "change-this-secret" },
    data: { action: "pull_requests", after_seq: 0, limit: 200 }
  });
  expect(pullAiRequests.ok()).toBe(true);
  const requests = (await pullAiRequests.json()).requests;
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

  writeFileSync(aiSettingsFile, `<?php
return ${toPhpArray({
    enabled: true,
    provider: "openai_compatible",
    service: "gemini",
    base_url: `${mockAiBaseUrl}/openai`,
    model: "gemini-smoke",
    api_key: mockAiApiKey,
    timeout_seconds: 10
  })};
`);
  const geminiChatResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: { message: "Gemini authorization key testi" }
  });
  expect(geminiChatResponse.ok()).toBe(true);
  const geminiChatResult = await geminiChatResponse.json();
  expect(geminiChatResult.fallback).toBe(false);
  expect(geminiChatResult.answer).toContain("Mock Gemini yanıtı");
  const geminiRequest = mockAiRequests.at(-1);
  expect(geminiRequest.url).toBe("/v1/models/gemini-smoke:generateContent");
  expect(geminiRequest.googleApiKey).toBe(mockAiApiKey);
  expect(geminiRequest.authorization).toBe("");
  expect(geminiRequest.body.systemInstruction.parts[0].text).toContain("kesin müsaitlik");
  expect(geminiRequest.body.contents.at(-1)).toMatchObject({ role: "user" });

  console.log(`web-module-menu-ok: ${baseUrl}/menu.html`);
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  if (browser) {
    await browser.close().catch(() => undefined);
  }
  server.kill();
  rmSync(tempRoot, { recursive: true, force: true });
  await closeServer(mockAiServer);
}

async function readJsonRequest(request) {
  let rawBody = "";
  for await (const chunk of request) {
    rawBody += chunk.toString();
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function listenOnRandomPort(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      const address = httpServer.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

function closeServer(httpServer) {
  return new Promise((resolve) => {
    httpServer.close(() => resolve());
  });
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

function toPhpArray(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
  if (Array.isArray(value)) return `[${value.map(toPhpArray).join(", ")}]`;
  return `[${Object.entries(value).map(([key, item]) => `${toPhpArray(key)} => ${toPhpArray(item)}`).join(", ")}]`;
}
