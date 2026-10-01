import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-web-module-"));
const webModuleRoot = join(tempRoot, "web-module");
cpSync(join(process.cwd(), "firm-template", "web-module"), webModuleRoot, { recursive: true });
const conversationsFile = join(webModuleRoot, "data", "ai-conversations.json");
const aiSettingsFile = join(webModuleRoot, "data", "ai-settings.local.php");
const businessConfigFile = join(webModuleRoot, "config", "business.json");
const businessConfig = JSON.parse(readFileSync(businessConfigFile, "utf8"));
businessConfig.sync_secret = "change-this-secret";
writeFileSync(businessConfigFile, `${JSON.stringify(businessConfig, null, 2)}\n`);
for (const runtimeFile of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) {
  rmSync(join(webModuleRoot, "data", runtimeFile), { force: true });
}
if (existsSync(aiSettingsFile)) {
  unlinkSync(aiSettingsFile);
}
writeFileSync(conversationsFile, "[]\n");
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
  if (lastMessage.includes("servis sorunu testi")) {
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: "Provider temporarily unavailable." } }));
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

  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const emptyResponse = await page.request.get(`${baseUrl}/api/menu.php`);
  expect(emptyResponse.status()).toBe(200);
  expect(await emptyResponse.json()).toMatchObject({ ok: true, categories: [], items: [], source_revision: 0 });

  const emptyReviews = await page.request.get(`${baseUrl}/api/google-reviews.php`);
  expect(emptyReviews.status()).toBe(200);
  expect(emptyReviews.headers()["cache-control"]).toContain("no-store");
  expect(await emptyReviews.json()).toMatchObject({ available: false, reason: "not_configured" });

  const invalidGoogleTest = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "test_google_reviews_settings",
      client_id: "desktop-google-reviews-smoke",
      google_reviews: { place_id: "", api_key: "" }
    }
  });
  expect(invalidGoogleTest.status()).toBe(422);
  expect(await invalidGoogleTest.json()).toMatchObject({ ok: false });

  const googleSecret = "smoke-google-key-not-secret";
  const googlePublish = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_google_reviews_settings",
      client_id: "desktop-google-reviews-smoke",
      google_reviews: {
        enabled: true,
        place_id: "ChIJSmokePlace",
        api_key: googleSecret
      }
    }
  });
  expect(googlePublish.status()).toBe(200);
  const googlePublishBody = await googlePublish.text();
  expect(googlePublishBody).not.toContain(googleSecret);
  expect(readFileSync(join(webModuleRoot, "data", "google-reviews.local.php"), "utf8")).toContain(googleSecret);

  const businessWithReviews = await page.request.get(`${baseUrl}/api/business.php`);
  expect(businessWithReviews.status()).toBe(200);
  const businessWithReviewsBody = await businessWithReviews.text();
  expect(businessWithReviewsBody).not.toContain(googleSecret);
  expect(JSON.parse(businessWithReviewsBody)).toMatchObject({ business: { google_reviews_enabled: true } });

  const googleDisable = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_google_reviews_settings",
      client_id: "desktop-google-reviews-smoke",
      google_reviews: {
        enabled: false,
        place_id: "ChIJSmokePlace",
        api_key: ""
      }
    }
  });
  expect(googleDisable.status()).toBe(200);
  expect(await googleDisable.json()).toMatchObject({ ok: true, enabled: false, has_api_key: false });

  const businessWithoutReviews = await page.request.get(`${baseUrl}/api/business.php`);
  expect(businessWithoutReviews.status()).toBe(200);
  expect(await businessWithoutReviews.json()).toMatchObject({ business: { google_reviews_enabled: false } });

  const disabledReviews = await page.request.get(`${baseUrl}/api/google-reviews.php`);
  expect(disabledReviews.status()).toBe(200);
  expect(await disabledReviews.json()).toMatchObject({ available: false, reason: "not_configured" });

  const fixturePublish = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_menu",
      sync_secret: businessConfig.sync_secret,
      client_id: "desktop-web-menu-smoke",
      source_revision: 1,
      idempotency_key: "web-menu-fixture-1",
      menu: {
        enabled: true,
        categories: [
          { id: "cat_breakfast", name: "Kahvaltı", is_active: true, sort_order: 1 },
          { id: "cat_drinks", name: "İçecekler", is_active: true, sort_order: 2 },
          { id: "cat_hidden", name: "Gizli Kategori", is_active: false }
        ],
        items: [
          { id: "item_breakfast", category_id: "cat_breakfast", name: "Serpme Kahvaltı (2 Kişilik)", price: 500,
            image_url: "assets/menu-breakfast-spread.webp", is_available: true },
          { id: "item_coffee", category_id: "cat_drinks", name: "Türk Kahvesi", price: 80, is_available: true },
          { id: "item_unavailable_sahlep", category_id: "cat_drinks", name: "Sahlep", price: 90, is_available: false }
        ]
      }
    }
  });
  expect(fixturePublish.status()).toBe(200);
  expect(await fixturePublish.json()).toMatchObject({ ok: true, item_count: 3, source_revision: 1 });
  const firstMenuResponse = await page.request.get(`${baseUrl}/api/menu.php`, {
    headers: { "If-None-Match": emptyResponse.headers().etag }
  });
  expect(firstMenuResponse.status()).toBe(200);
  expect(firstMenuResponse.headers().etag).not.toBe(emptyResponse.headers().etag);
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
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_menu",
      sync_secret: "change-this-secret",
      client_id: "desktop-web-menu-smoke",
      source_revision: 2,
      idempotency_key: "web-menu-stock-2",
      menu: {
        enabled: true,
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
            stock_quantity: 4,
            stock_min_quantity: 2,
            hide_when_out_of_stock: true,
            stock_note: "Smoke stok notu",
            sort_order: 1,
            created_at: "2026-07-10T10:00:00+03:00",
            updated_at: "2026-07-10T10:00:00+03:00"
          },
          {
            id: "item_smoke_hidden_stock",
            category_id: "cat_smoke",
            name: "Gizli Stok Ürünü",
            description: "Stok 0 ve gizleme açık.",
            price: 2,
            currency: "TRY",
            image_url: "",
            is_available: true,
            is_featured: false,
            allergens: [],
            tags: [],
            stock_quantity: 0,
            stock_min_quantity: 1,
            hide_when_out_of_stock: true,
            stock_note: null,
            sort_order: 2,
            created_at: "2026-07-10T10:00:00+03:00",
            updated_at: "2026-07-10T10:00:00+03:00"
          },
          {
            id: "item_smoke_visible_zero",
            category_id: "cat_smoke",
            name: "Görünür Stok Ürünü",
            description: "Stok 0 ama gizleme kapalı.",
            price: 3,
            currency: "TRY",
            image_url: "",
            is_available: true,
            is_featured: false,
            allergens: [],
            tags: [],
            stock_quantity: 0,
            stock_min_quantity: 1,
            hide_when_out_of_stock: false,
            stock_note: null,
            sort_order: 3,
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
  expect(publishResult.item_count).toBe(3);

  const changedMenuResponse = await page.request.get(`${baseUrl}/api/menu.php`, {
    headers: { "If-None-Match": initialEtag }
  });
  expect(changedMenuResponse.status()).toBe(200);
  expect(changedMenuResponse.headers().etag).not.toBe(initialEtag);

  const stockMenuResponse = await page.request.get(`${baseUrl}/api/menu.php`);
  const stockMenu = await stockMenuResponse.json();
  expect(stockMenu.items.some((item) => item.id === "item_smoke_hidden_stock")).toBe(false);
  expect(stockMenu.items.find((item) => item.id === "item_smoke_visible_zero")?.stock_quantity).toBe(0);
  expect(stockMenu.items.find((item) => item.id === "item_smoke_001")).toMatchObject({
    stock_quantity: 4,
    stock_min_quantity: 2,
    hide_when_out_of_stock: true,
    stock_note: "Smoke stok notu"
  });

  const androidStockSnapshot = {
    business_capabilities: [
      "service.android",
      "food_service.menu",
      "channel.qr_menu",
      "commerce.catalog",
      "commerce.inventory"
    ],
    summary: {},
    daily_tasks: [],
    requests: [],
    customers: [],
    reservations: [],
    rooms: [],
    tables: [],
    menu: { categories: [], items: [], updated_at: "2026-07-18T10:00:00+03:00" },
    trackedStockItems: [
      {
        menu_item_id: "item_stock_snapshot_001",
        name: "Snapshot Stok Ürünü",
        category: "Smoke Test",
        price: 12,
        stock_quantity: 0,
        stock_min_quantity: 2,
        hide_when_out_of_stock: true,
        stock_status: "out_of_stock"
      }
    ],
    appliedStockImageHashes: ["A".repeat(64), "invalid-hash", "a".repeat(64)],
    table_orders: [],
    messages: [],
    androidPermissions: {
      "android-stock-web-smoke": {
        role: "admin",
        is_active: true,
        permissions: ["menu.stock_view", "menu.stock_update"]
      }
    },
    updated_at: "2026-07-18T10:00:00+03:00"
  };
  const androidStockSnapshotResponse = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_android_snapshot",
      sync_secret: businessConfig.sync_secret,
      client_id: "desktop-web-menu-smoke",
      source_revision: 1,
      idempotency_key: "web-menu-android-1",
      snapshot: androidStockSnapshot
    }
  });
  expect(androidStockSnapshotResponse.ok()).toBe(true);

  const hiddenQrMenuPublish = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_menu",
      sync_secret: businessConfig.sync_secret,
      client_id: "desktop-web-menu-smoke",
      source_revision: 3,
      idempotency_key: "web-menu-hidden-3",
      menu: {
        enabled: false,
        categories: stockMenu.categories,
        items: stockMenu.items,
        updated_at: stockMenu.updated_at
      }
    }
  });
  expect(hiddenQrMenuPublish.ok()).toBe(true);
  const hiddenQrMenuResponse = await page.request.get(`${baseUrl}/api/menu.php`);
  expect(hiddenQrMenuResponse.status()).toBe(404);
  expect(await hiddenQrMenuResponse.json()).toMatchObject({ ok: false, message: "QR menü webde gizli." });
  const hiddenQrBusiness = await page.request.get(`${baseUrl}/api/business.php`);
  expect(hiddenQrBusiness.ok()).toBe(true);
  expect((await hiddenQrBusiness.json()).business.public_surfaces).not.toContain("qr_menu");

  const visibleQrMenuPublish = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_menu",
      sync_secret: businessConfig.sync_secret,
      client_id: "desktop-web-menu-smoke",
      source_revision: 4,
      idempotency_key: "web-menu-visible-4",
      menu: {
        enabled: true,
        categories: stockMenu.categories,
        items: stockMenu.items,
        updated_at: stockMenu.updated_at
      }
    }
  });
  expect(visibleQrMenuPublish.ok()).toBe(true);
  const visibleQrMenuResponse = await page.request.get(`${baseUrl}/api/menu.php`);
  expect(visibleQrMenuResponse.ok()).toBe(true);
  const visibleQrBusiness = await page.request.get(`${baseUrl}/api/business.php`);
  expect(visibleQrBusiness.ok()).toBe(true);
  expect((await visibleQrBusiness.json()).business.public_surfaces).toContain("qr_menu");

  const androidStockSummaryResponse = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "android_summary",
      sync_secret: "change-this-secret",
      device_id: "android-stock-web-smoke"
    }
  });
  expect(androidStockSummaryResponse.ok()).toBe(true);
  const androidStockSummary = await androidStockSummaryResponse.json();
  expect(androidStockSummary.trackedStockItems).toEqual([
    {
      menu_item_id: "item_stock_snapshot_001",
      name: "Snapshot Stok Ürünü",
      category: "Smoke Test",
      price: 12,
      stock_quantity: 0,
      stock_min_quantity: 2,
      stock_unit: "piece",
      stock_consumption_quantity: 1,
      hide_when_out_of_stock: true,
      stock_status: "out_of_stock"
    }
  ]);
  expect(androidStockSummary.appliedStockImageHashes).toEqual(["a".repeat(64)]);
  expect(androidStockSummary.androidPermissions["android-stock-web-smoke"].permissions).toEqual([
    "menu.stock_view",
    "menu.stock_update"
  ]);

  for (const [index, actionType] of ["menu_stock_add", "menu_stock_set", "menu_stock_adjust"].entries()) {
    const enqueueStockAction = await page.request.post(`${baseUrl}/api/sync.php`, {
      headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
      data: {
        action: "enqueue_android_action",
        sync_secret: "change-this-secret",
        action_id: `android_stock_action_${index}_0001`,
        action_type: actionType,
        device_id: "android-stock-web-smoke",
        payload: { menu_item_id: "item_stock_snapshot_001", quantity: 1, quantity_change: 1, note: "Smoke" }
      }
    });
    expect(enqueueStockAction.ok()).toBe(true);
  }

  const disabledAiStockImport = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "enqueue_android_action",
      sync_secret: "change-this-secret",
      action_id: "android_stock_action_3_disabled",
      action_type: "menu_stock_image_import_apply",
      device_id: "android-stock-web-smoke",
      payload: {
        import_id: "stock_import_web_queue_disabled",
        image_hash: "b".repeat(64),
        lines: [{ menu_item_id: "item_stock_snapshot_001", quantity: 1, raw_text: "1 adet", confidence: "high" }]
      }
    }
  });
  expect(disabledAiStockImport.status()).toBe(403);
  expect(await disabledAiStockImport.json()).toMatchObject({ code: "android_action_capability_disabled" });

  const disabledAiChatPayload = {
    message: "12 Temmuz için kesin rezervasyon yapabilir misiniz?",
    history: [
      {
        role: "assistant",
        content: "Merhaba, nasıl yardımcı olabilirim?"
      }
    ]
  };
  const disabledAiChatResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: disabledAiChatPayload
  });
  expect(disabledAiChatResponse.status()).toBe(403);
  expect(await disabledAiChatResponse.json()).toMatchObject({
    ok: false,
    code: "ai_capability_disabled"
  });

  const aiEnabledSnapshotResponse = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_android_snapshot",
      sync_secret: businessConfig.sync_secret,
      client_id: "desktop-web-menu-smoke",
      source_revision: 2,
      idempotency_key: "web-menu-android-2",
      snapshot: {
        ...androidStockSnapshot,
        business_capabilities: [...androidStockSnapshot.business_capabilities, "service.ai"],
        updated_at: "2026-07-18T10:01:00+03:00"
      }
    }
  });
  expect(aiEnabledSnapshotResponse.ok()).toBe(true);

  const enabledAiStockImport = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "enqueue_android_action",
      sync_secret: "change-this-secret",
      action_id: "android_stock_action_3_0001",
      action_type: "menu_stock_image_import_apply",
      device_id: "android-stock-web-smoke",
      payload: {
        import_id: "stock_import_web_queue_0001",
        image_hash: "b".repeat(64),
        lines: [{ menu_item_id: "item_stock_snapshot_001", quantity: 1, raw_text: "1 adet", confidence: "high" }]
      }
    }
  });
  expect(enabledAiStockImport.ok()).toBe(true);

  const chatResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: disabledAiChatPayload
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

  const businessContextPublish = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_business_context",
      client_id: "desktop-web-ai-context-smoke",
      business_context: {
        version: 1,
        business_name: "Nehir Tekel",
        profile_id: "market",
        profile_label: "Market / Perakende",
        phone: "+903661112233",
        whatsapp: "+905551112233",
        whatsapp_enabled: false,
        email: "info@example.test",
        address: "Gebeş, Sahil Sokak No:45/1, Cide / Kastamonu",
        latitude: 41.891571,
        longitude: 33.003712,
        description: "Mahalle marketi ve tekel bayisi.",
        directions_note: "Cide sahil yolundan Gideros yönüne 5 km gidince solda.",
        policy_note: "Veresiye satışımız yoktur.",
        payment_note: "Nakit ve kredi/banka kartı kabul edilir.",
        languages: ["Türkçe", "İngilizce"],
        features: ["Wi-Fi"],
        feature_ids: ["wifi"],
        social_links: [
          { platform: "facebook", url: "https://facebook.com/nehirtekel" },
          { platform: "instagram", url: "https://instagram.com/nehirtekel" }
        ],
        check_in_time: "",
        check_out_time: "",
        breakfast_start_time: "",
        breakfast_end_time: ""
      }
    }
  });
  expect(businessContextPublish.ok()).toBe(true);
  expect(await businessContextPublish.json()).toMatchObject({
    ok: true,
    profile_id: "market"
  });

  const roomMediaUpload = await page.request.post(`${baseUrl}/api/room-media.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    multipart: {
      client_id: "desktop-web-room-catalog-smoke",
      room_id: "room_101",
      media_id: "room_media_smoke_cover",
      kind: "cover",
      content_hash: "41c651b0bf0bf4f02c4cdd09779fb742cf34494ec72e07e7f3e0682a5676480a",
      file: {
        name: "cover.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQ8cAAAAASUVORK5CYII=",
          "base64"
        )
      }
    }
  });
  expect(roomMediaUpload.ok()).toBe(true);
  const roomMediaUploadResult = await roomMediaUpload.json();
  expect(roomMediaUploadResult).toMatchObject({
    ok: true,
    mime_type: "image/png"
  });
  expect(roomMediaUploadResult.url).toMatch(/\/media\/rooms\/room_101\/room_media_smoke_cover\.png$/);

  const roomCatalogPublish = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_room_catalog",
      client_id: "desktop-web-room-catalog-smoke",
      room_catalog: {
        version: 1,
        enabled: true,
        updated_at: "2026-09-26T12:00:00+03:00",
        rooms: [
          {
            id: "room_101",
            name: "Oda 101",
            number: "101",
            capacity: 2,
            bed_info: "1 çift kişilik yatak",
            floor: "1. kat",
            features: ["wifi", "private_bathroom"],
            description: "Deniz tarafında sakin oda.",
            price_note: "Sezona göre değişebilir.",
            nightly_price_minor: 250000,
            currency: "TRY",
            sort_order: 1,
            media: [{
              id: "room_media_smoke_cover",
              kind: "cover",
              url: roomMediaUploadResult.url,
              mime_type: "image/png",
              title: "Oda 101 kapak",
              sort_order: 1
            }]
          }
        ]
      }
    }
  });
  expect(roomCatalogPublish.ok()).toBe(true);
  expect(await roomCatalogPublish.json()).toMatchObject({ ok: true, room_count: 1 });

  const roomsResponse = await page.request.get(`${baseUrl}/api/rooms.php`);
  expect(roomsResponse.ok()).toBe(true);
  expect(await roomsResponse.json()).toMatchObject({
    ok: true,
    enabled: true,
    rooms: [{
      id: "room_101",
      name: "Oda 101",
      number: "101",
      capacity: 2,
      bed_info: "1 çift kişilik yatak",
      features: ["wifi", "private_bathroom"],
      nightly_price_minor: 250000,
      currency: "TRY",
      media: [{
        id: "room_media_smoke_cover",
        kind: "cover",
        url: roomMediaUploadResult.url,
        mime_type: "image/png"
      }]
    }]
  });

  const publishedRoomMedia = await page.request.get(`${baseUrl}${roomMediaUploadResult.url}`);
  expect(publishedRoomMedia.ok()).toBe(true);
  expect(publishedRoomMedia.headers()["content-type"]).toContain("image/png");


  const roomCatalogDisabled = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_room_catalog",
      client_id: "desktop-web-room-catalog-smoke",
      room_catalog: {
        version: 1,
        enabled: false,
        updated_at: "2026-09-26T12:05:00+03:00",
        rooms: []
      }
    }
  });
  expect(roomCatalogDisabled.ok()).toBe(true);
  const disabledRoomsResponse = await page.request.get(`${baseUrl}/api/rooms.php`);
  expect(disabledRoomsResponse.ok()).toBe(true);
  expect(await disabledRoomsResponse.json()).toMatchObject({
    ok: true,
    enabled: false,
    rooms: []
  });
  // Visibility changes must not delete canonical media: re-enabling should
  // reuse the already-published URL without another upload.
  expect((await page.request.get(`${baseUrl}${roomMediaUploadResult.url}`)).ok()).toBe(true);

  const roomCatalogReenabled = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_room_catalog",
      client_id: "desktop-web-room-catalog-smoke",
      room_catalog: {
        version: 1,
        enabled: true,
        updated_at: "2026-09-26T12:06:00+03:00",
        rooms: [{
          id: "room_101",
          name: "Oda 101",
          number: "101",
          capacity: 2,
          bed_info: "1 çift kişilik yatak",
          floor: "1. kat",
          features: ["wifi", "private_bathroom"],
          description: "Deniz tarafında sakin oda.",
          price_note: "Sezona göre değişebilir.",
          nightly_price_minor: 250000,
          currency: "TRY",
          sort_order: 1,
          media: [{
            id: "room_media_smoke_cover",
            kind: "cover",
            url: roomMediaUploadResult.url,
            mime_type: "image/png",
            title: "Oda 101 kapak",
            sort_order: 1
          }]
        }]
      }
    }
  });
  expect(roomCatalogReenabled.ok()).toBe(true);

  const tableMediaUpload = await page.request.post(`${baseUrl}/api/table-media.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    multipart: {
      client_id: "desktop-web-table-catalog-smoke",
      table_id: "table_teras_1",
      media_id: "table_media_smoke_cover",
      kind: "cover",
      content_hash: "41c651b0bf0bf4f02c4cdd09779fb742cf34494ec72e07e7f3e0682a5676480a",
      file: {
        name: "table-cover.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQ8cAAAAASUVORK5CYII=",
          "base64"
        )
      }
    }
  });
  expect(tableMediaUpload.ok()).toBe(true);
  const tableMediaUploadResult = await tableMediaUpload.json();
  expect(tableMediaUploadResult).toMatchObject({ ok: true, mime_type: "image/png" });
  expect(tableMediaUploadResult.url).toMatch(/\/media\/tables\/table_teras_1\/table_media_smoke_cover\.png$/);

  const tableCatalogPayload = {
    version: 1,
    enabled: true,
    updated_at: "2026-09-29T19:00:00+03:00",
    tables: [{
      id: "table_teras_1",
      name: "Teras 1",
      area: "Teras",
      capacity: 4,
      description: "Deniz tarafındaki masa.",
      features: ["outdoor", "sea_view", "internal_secret"],
      smoking_policy: "outdoor_only",
      sort_order: 1,
      media: [{
        id: "table_media_smoke_cover",
        kind: "cover",
        url: tableMediaUploadResult.url,
        mime_type: "image/png",
        title: "Teras masa kapak",
        sort_order: 1
      }]
    }]
  };
  const tableCatalogPublish = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_table_catalog",
      client_id: "desktop-web-table-catalog-smoke",
      table_catalog: tableCatalogPayload
    }
  });
  expect(tableCatalogPublish.ok()).toBe(true);
  expect(await tableCatalogPublish.json()).toMatchObject({ ok: true, table_count: 1 });

  const tablesResponse = await page.request.get(`${baseUrl}/api/tables.php`);
  expect(tablesResponse.ok()).toBe(true);
  expect(await tablesResponse.json()).toMatchObject({
    ok: true,
    enabled: true,
    tables: [{
      id: "table_teras_1",
      name: "Teras 1",
      area: "Teras",
      capacity: 4,
      description: "Deniz tarafındaki masa.",
      features: ["outdoor", "sea_view"],
      smoking_policy: "outdoor_only",
      media: [{
        id: "table_media_smoke_cover",
        kind: "cover",
        url: tableMediaUploadResult.url,
        mime_type: "image/png"
      }]
    }]
  });
  expect((await page.request.get(`${baseUrl}${tableMediaUploadResult.url}`)).ok()).toBe(true);

  const tableCatalogDisabled = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_table_catalog",
      client_id: "desktop-web-table-catalog-smoke",
      table_catalog: {
        version: 1,
        enabled: false,
        updated_at: "2026-09-29T19:01:00+03:00",
        tables: []
      }
    }
  });
  expect(tableCatalogDisabled.ok()).toBe(true);
  const disabledTablesResponse = await page.request.get(`${baseUrl}/api/tables.php`);
  expect(disabledTablesResponse.ok()).toBe(true);
  expect(await disabledTablesResponse.json()).toMatchObject({
    ok: true,
    enabled: false,
    tables: []
  });
  expect((await page.request.get(`${baseUrl}${tableMediaUploadResult.url}`)).ok()).toBe(true);

  const tableCatalogReenabled = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_table_catalog",
      client_id: "desktop-web-table-catalog-smoke",
      table_catalog: {
        ...tableCatalogPayload,
        updated_at: "2026-09-29T19:02:00+03:00"
      }
    }
  });
  expect(tableCatalogReenabled.ok()).toBe(true);

  const aiCatalogPublish = await page.request.post(`${baseUrl}/api/sync.php`, {
    headers: { "X-YA-Sync-Secret": businessConfig.sync_secret },
    data: {
      action: "publish_ai_catalog",
      client_id: "desktop-web-ai-catalog-smoke",
      ai_catalog: {
        version: 1,
        updated_at: "2026-09-22T02:00:00+03:00",
        items: [
          {
            id: "market_metro",
            source: "catalog",
            name: "Ülker Metro Klasik (50,4 g)",
            description: "Çikolata kaplı bar",
            category: "Atıştırmalık",
            brand: "Ülker",
            barcode: "8690504012345",
            price: 10,
            currency: "TRY",
            unit: "piece",
            available: false,
            featured: false,
            tags: ["çikolata"],
            purchase_price: 4,
            current_quantity: 99
          },
          {
            id: "market_pepsi",
            source: "catalog",
            name: "Pepsi 330 ml",
            description: "Gazlı içecek",
            category: "İçecek",
            brand: "Pepsi",
            barcode: "8690632033556",
            price: 42,
            currency: "TRY",
            unit: "piece",
            available: true,
            featured: false,
            tags: []
          }
        ]
      }
    }
  });
  expect(aiCatalogPublish.ok()).toBe(true);
  expect(await aiCatalogPublish.json()).toMatchObject({
    ok: true,
    item_count: 2
  });

  const publicBusinessResponse = await page.request.get(`${baseUrl}/api/business.php`);
  expect(publicBusinessResponse.ok()).toBe(true);
  expect(await publicBusinessResponse.json()).toMatchObject({
    ok: true,
    business: {
      display_name: "Nehir Tekel",
      profile_id: "market",
      public_surfaces: expect.arrayContaining(["rooms", "restaurant"]),
      whatsapp_enabled: false,
      address: "Gebeş, Sahil Sokak No:45/1, Cide / Kastamonu",
      latitude: 41.891571,
      longitude: 33.003712,
      directions_note: "Cide sahil yolundan Gideros yönüne 5 km gidince solda.",
      policy_note: "Veresiye satışımız yoktur.",
      payment_note: "Nakit ve kredi/banka kartı kabul edilir.",
      languages: ["Türkçe", "İngilizce"],
      features: ["Wi-Fi"],
      feature_ids: ["wifi"],
      social_links: [
        { platform: "facebook", url: "https://facebook.com/nehirtekel" },
        { platform: "instagram", url: "https://instagram.com/nehirtekel" }
      ]
    }
  });

  const metroChatResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: { message: "Metro var mı, fiyatı ne kadar?" }
  });
  expect(metroChatResponse.ok()).toBe(true);
  const metroChatResult = await metroChatResponse.json();
  expect(metroChatResult.fallback).toBe(false);
  expect(metroChatResult.knowledge_files).toEqual(["firma", "sik-sorulan-sorular"]);
  const metroAiRequest = mockAiRequests.at(-1);
  const metroSystemPrompt = String(metroAiRequest.body.messages?.[0]?.content ?? "");
  expect(metroSystemPrompt).toContain("Sektör: Market / Perakende");
  expect(metroSystemPrompt).toContain("Ödeme: Nakit ve kredi/banka kartı kabul edilir.");
  expect(metroSystemPrompt).toContain("Ülker Metro Klasik (50,4 g)");
  expect(metroSystemPrompt).toContain("durum: şu anda mevcut değil");
  expect(metroSystemPrompt).not.toContain("Pepsi 330 ml");
  expect(metroSystemPrompt).not.toContain("purchase_price");
  expect(metroSystemPrompt).not.toContain("current_quantity");
  expect(metroSystemPrompt).not.toContain("Giriş saati:");
  expect(metroSystemPrompt).not.toContain("Kahvaltı başlangıcı:");

  const catalogMissResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: { message: "PlayStation 6 satıyor musunuz, fiyatı ne?" }
  });
  expect(catalogMissResponse.ok()).toBe(true);
  const catalogMissResult = await catalogMissResponse.json();
  expect(catalogMissResult.fallback).toBe(false);
  const catalogMissPrompt = String(mockAiRequests.at(-1).body.messages?.[0]?.content ?? "");
  expect(catalogMissPrompt).toContain("Bu soru için güncel ürün veya menü eşleşmesi bulunamadı.");
  expect(catalogMissPrompt).toContain("Katalogda eşleşme olmaması ürünün kesinlikle satılmadığını kanıtlamaz.");
  expect(catalogMissPrompt).not.toContain("Ülker Metro Klasik (50,4 g)");
  expect(catalogMissPrompt).not.toContain("Pepsi 330 ml");

  const marketIsolationResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: { message: "Odalarınız kaç kişilik ve giriş saati kaç?" }
  });
  expect(marketIsolationResponse.ok()).toBe(true);
  const marketIsolationResult = await marketIsolationResponse.json();
  expect(marketIsolationResult.knowledge_files).toEqual(["firma", "sik-sorulan-sorular"]);
  const marketIsolationPrompt = String(mockAiRequests.at(-1).body.messages?.[0]?.content ?? "");
  expect(marketIsolationPrompt).toContain("Sektör: Market / Perakende");
  expect(marketIsolationPrompt).not.toContain("## Odalar");
  expect(marketIsolationPrompt).not.toContain("Giriş saati:");

  const rateLimitedResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: {
      message: "Sağlayıcı limit testi, kart geçiyor mu?"
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
  expect(rateLimitedResult.answer).toBe("Nakit ve kredi/banka kartı kabul edilir.");
  expect(rateLimitedResult.answer).not.toMatch(/WhatsApp|müsaitlik|rezervasyon/i);
  expect(JSON.stringify(rateLimitedResult)).not.toContain(mockAiApiKey);

  const unavailableResponse = await page.request.post(`${baseUrl}/api/chat.php`, {
    data: {
      message: "Sağlayıcı servis sorunu testi, nasıl gelebilirim?"
    }
  });
  expect(unavailableResponse.ok()).toBe(true);
  const unavailableResult = await unavailableResponse.json();
  expect(unavailableResult.fallback).toBe(true);
  expect(unavailableResult.error).toMatchObject({
    code: "provider_unavailable",
    retryable: true,
    provider_status: 503
  });
  expect(unavailableResult.answer).toContain("Gebeş, Sahil Sokak No:45/1");
  expect(unavailableResult.answer).toContain("Cide sahil yolundan Gideros yönüne 5 km gidince solda.");
  expect(unavailableResult.answer).not.toMatch(/WhatsApp|müsaitlik|rezervasyon/i);

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

  console.log(`web-module-menu-api-ok: ${baseUrl}/api/menu.php`);
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
