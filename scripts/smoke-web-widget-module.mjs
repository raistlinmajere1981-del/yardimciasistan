import { chromium, expect } from "@playwright/test";
import { activateFixtureSource, publicationFixtureFetch } from "./test-helpers/publication-protocol.mjs";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { installDemoSite } from "./test-helpers/demo-site.mjs";

if (process.argv.includes("--capabilities-only")) {
  await runCapabilityContracts();
} else if (process.argv.includes("--language-only")) {
  await runInteractionLanguageContracts();
} else {
const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-widget-module-"));
const webModuleRoot = installDemoSite(tempRoot);
writeFileSync(join(tempRoot, "assistant-test.php"), "<!doctype html><html lang=\"tr\"><body><main>Firma sitesi</main></body></html>");
const syncSecret = "pilot-web-smoke-secret";
const businessConfigFile = join(webModuleRoot, "config", "business.json");
const businessConfig = JSON.parse(readFileSync(businessConfigFile, "utf8"));
businessConfig.sync_secret = syncSecret;
businessConfig.display_name = "Deniz Çiçeği Pansiyon & Kafe";
businessConfig.whatsapp = "+90 531 696 9334";
businessConfig.profile_id = "pension_restaurant";
writeFileSync(businessConfigFile, `${JSON.stringify(businessConfig, null, 2)}\n`);
const conversationsFile = join(webModuleRoot, "data", "ai-conversations.json");
for (const runtimeFile of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) {
  rmSync(join(webModuleRoot, "data", runtimeFile), { force: true });
}
writeFileSync(conversationsFile, "[]\n");
writeFileSync(join(webModuleRoot, "config", "ai.local.php"), "<?php return ['enabled' => false];\n");
const port = await getFreePort();
const siteUrl = `http://127.0.0.1:${port}`;
const baseUrl = `${siteUrl}/yardimci-asistan`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", tempRoot], {
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
  await waitForUrl(`${siteUrl}/assets/assistant/widget.js`);
  await activateFixtureSource(baseUrl, syncSecret, "desktop-widget-module-smoke");

  const publicBusinessBeforeSyncResponse = await fetch(`${baseUrl}/api/business.php`);
  expect(publicBusinessBeforeSyncResponse.status).toBe(200);
  const publicBusinessBeforeSync = await publicBusinessBeforeSyncResponse.json();
  expect(publicBusinessBeforeSync.business.profile_id).toBe("pension_restaurant");
  expect(publicBusinessBeforeSync.business.ai_enabled).toBe(false);
  expect(publicBusinessBeforeSync.business.requests_enabled).toBe(false);
  expect(publicBusinessBeforeSync.business.whatsapp_enabled).toBe(false);
  expect(publicBusinessBeforeSync.business.public_surfaces).toEqual([]);

  const capabilityPublication = await publicationFixtureFetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": syncSecret },
    body: JSON.stringify({
      action: "publish_android_snapshot",
      client_id: "desktop-widget-module-smoke",
      source_revision: 1,
      idempotency_key: "widget-ai-capability-1",
      snapshot: {
        business_capabilities: [
          "service.ai",
          "service.whatsapp",
          "core.customers",
          "customer.requests",
          "accommodation.rooms",
          "accommodation.reservations",
          "food_service.tables",
          "food_service.reservations",
          "food_service.menu",
          "channel.qr_menu"
        ]
      }
    })
  });
  expect(capabilityPublication.status).toBe(200);
  expect((await capabilityPublication.json()).ok).toBe(true);

  const contactPublication = await publicationFixtureFetch(`${baseUrl}/api/sync.php`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": syncSecret },
    body: JSON.stringify({ action: "publish_business_context", client_id: "desktop-widget-module-smoke", business_context: {
      business_name: businessConfig.display_name, profile_id: "pension_restaurant",
      whatsapp: businessConfig.whatsapp, whatsapp_enabled: true
    } })
  });
  expect(contactPublication.status).toBe(200);

  for (const publication of [
    {action: "publish_room_catalog", room_catalog: {enabled: true, rooms: [{id: "room-fixture", name: "Synthetic room", capacity: 2, media: []}]}},
    {action: "publish_table_catalog", table_catalog: {enabled: true, tables: [{id: "table-fixture", name: "Synthetic table", capacity: 2, media: []}]}},
    {action: "publish_menu", menu: {enabled: true, categories: [{id: "category-fixture", name: "Synthetic category", is_active: true}],
      items: [{id: "menu-fixture", category_id: "category-fixture", name: "Synthetic item", price: 1, is_available: true}]}}
  ]) {
    const response = await publicationFixtureFetch(`${baseUrl}/api/sync.php`, {method: "POST",
      headers: {"Content-Type": "application/json", "X-YA-Sync-Secret": syncSecret}, body: JSON.stringify({...publication, client_id: "desktop-widget-module-smoke"})});
    expect(response.status).toBe(200);
  }

  const publicBusinessAfterSyncResponse = await fetch(`${baseUrl}/api/business.php`);
  expect(publicBusinessAfterSyncResponse.status).toBe(200);
  const publicBusinessAfterSync = await publicBusinessAfterSyncResponse.json();
  expect(publicBusinessAfterSync.business.public_surfaces).toEqual(["rooms", "restaurant", "qr_menu"]);
  expect(publicBusinessAfterSync.business.ai_enabled).toBe(true);
  expect(publicBusinessAfterSync.business.whatsapp_enabled).toBe(true);
  expect(publicBusinessAfterSync.business.requests_enabled).toBe(true);

  browser = await launchChromiumForSmoke(chromium);

  const fixedLauncherPage = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await fixedLauncherPage.goto(`${siteUrl}/assistant-test.php`, { waitUntil: "domcontentloaded" });
  await injectWidget(fixedLauncherPage, baseUrl, { profileId: "pension", connectApi: false });
  await fixedLauncherPage.evaluate(() => {
    document.body.style.minHeight = "1800px";
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.style.height = "320px";
    footer.textContent = "Site footer";
    document.body.appendChild(footer);
    window.scrollTo(0, document.body.scrollHeight);
  });
  await fixedLauncherPage.waitForTimeout(80);
  expect(await fixedLauncherPage.locator("#yardimci-asistan-widget").evaluate((node) =>
    getComputedStyle(node).bottom
  )).toBe("18px");
  await fixedLauncherPage.close();

  const pensionPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await pensionPage.goto(`${siteUrl}/assistant-test.php`, { waitUntil: "domcontentloaded" });
  await injectWidget(pensionPage, baseUrl, { profileId: "pension", connectApi: false });
  await pensionPage.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(pensionPage.locator('[data-ya-request-type="pension_reservation"]')).toBeVisible();
  await expect(pensionPage.locator('[data-ya-request-type="restaurant_reservation"]')).toHaveCount(0);
  await pensionPage.locator('[data-ya-request-type="pension_reservation"]').click();
  await expect(pensionPage.locator('input[name="start_date"]')).toHaveAttribute("type", "hidden");
  await expect(pensionPage.locator('input[name="end_date"]')).toHaveAttribute("type", "hidden");
  await pensionPage.locator('[data-ya-open-date-picker="start_date"]').click();
  await expect(pensionPage.locator("[data-ya-calendar]")).toBeVisible();
  await expect(pensionPage.locator('[data-ya-calendar-close="1"]')).toBeVisible();
  await pensionPage.locator('[data-ya-calendar-close="1"]').click();
  await expect(pensionPage.locator("[data-ya-calendar]")).toBeHidden();
  await pensionPage.locator('[data-ya-open-date-picker="start_date"]').click();
  await expect(pensionPage.locator(".ya-widget-calendar-weekdays")).toContainText("Pzt");
  await expect(pensionPage.locator(".ya-widget-calendar-shortcuts")).toContainText("Bugün");
  await expect(pensionPage.locator(".ya-widget-calendar-shortcuts")).toContainText("Yarın");
  await expect(pensionPage.locator(".ya-widget-calendar-shortcuts")).not.toContainText("1 gün");
  await pensionPage.locator('[data-ya-calendar-shortcut="today"]').click();
  await expect(pensionPage.locator('[data-ya-date-label="start_date"]')).not.toHaveText("Giriş tarihi");
  await pensionPage.locator('[data-ya-open-date-picker="end_date"]').click();
  await expect(pensionPage.locator(".ya-widget-calendar-shortcuts")).toContainText("1 gün");
  await expect(pensionPage.locator(".ya-widget-calendar-shortcuts")).toContainText("2 gün");
  await expect(pensionPage.locator(".ya-widget-calendar-shortcuts")).toContainText("7 gün");
  await expect(pensionPage.locator(".ya-widget-calendar-shortcuts")).toContainText("10 gün");
  await expect(pensionPage.locator(".ya-widget-calendar-shortcuts")).not.toContainText("Bugün");
  await pensionPage.locator('[data-ya-calendar-shortcut="day1"]').click();
  await expect(pensionPage.locator('[data-ya-date-label="end_date"]')).not.toHaveText("Çıkış tarihi");
  await expect(pensionPage.locator('input[name="date_text"]')).not.toHaveValue("");
  await pensionPage.locator('[data-ya-open-date-picker="end_date"]').click();
  await expect(pensionPage.locator(".ya-widget-calendar-shortcuts")).toContainText("Temizle");
  await pensionPage.locator('[data-ya-calendar-shortcut="clear"]').click();
  await expect(pensionPage.locator('[data-ya-date-label="end_date"]')).toHaveText("Çıkış tarihi");
  await expect(pensionPage.locator('input[name="end_date"]')).toHaveValue("");
  await pensionPage.close();

  const contextPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await contextPage.goto(`${siteUrl}/assistant-test.php`, { waitUntil: "domcontentloaded" });
  await injectWidget(contextPage, baseUrl, { profileId: "pension", connectApi: false, address: "Cide, Kastamonu" });
  await contextPage.evaluate(() => {
    const reserve = document.createElement("button");
    reserve.textContent = "Balkonlu Odayı Ayır";
    reserve.dataset.yaAction = "accommodation.reserve";
    reserve.dataset.yaResourceType = "room";
    reserve.dataset.yaResourceId = "balcony-room";
    reserve.dataset.yaResourceName = "Balkonlu Oda";
    document.body.appendChild(reserve);
    reserve.click();
  });
  await expect(contextPage.locator("[data-ya-context-card]")).toContainText("Balkonlu Oda");
  await expect(contextPage.locator('input[name="context_resource_id"]')).toHaveValue("balcony-room");

  await contextPage.evaluate(() => {
    const directions = document.createElement("button");
    directions.textContent = "Yol Tarifi";
    directions.dataset.yaAction = "directions";
    directions.dataset.yaAddress = "Cide, Kastamonu";
    document.body.appendChild(directions);
    directions.click();
  });
  await expect(contextPage.locator(".ya-widget-view-title")).toHaveText("Bize nasıl ulaşabilirsiniz?");
  await expect(contextPage.locator(".ya-widget-location-card")).toContainText("Cide, Kastamonu");
  await expect(contextPage.locator('.ya-widget-directions a[target="_blank"]')).toHaveAttribute("href", /google\.com\/maps\/search/);

  await contextPage.evaluate(() => {
    const whatsapp = document.createElement("button");
    whatsapp.textContent = "WhatsApp";
    whatsapp.dataset.yaAction = "contact.whatsapp";
    document.body.appendChild(whatsapp);
    whatsapp.click();
  });
  await expect(contextPage.locator(".ya-widget-view-title")).toHaveText("Mesajınızı birlikte hazırlayalım");
  await contextPage.close();

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${siteUrl}/assistant-test.php`, { waitUntil: "domcontentloaded" });
  await injectWidget(page, baseUrl);

  await expect(page.getByRole("button", { name: "Yardımcı Asistan'ı aç" })).toBeVisible();
  await expect(page.locator('[data-nexa-role="launcher"] svg[data-nexa-rig]')).toHaveAttribute("data-expression", "idle");
  await expect(page.locator('[data-nexa-role="launcher"] svg[data-nexa-rig]')).toHaveAttribute("data-motion-active", "false");

  await page.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(page.locator(".ya-widget-header img.ya-widget-mark")).toHaveAttribute("src", `${siteUrl}/assets/yardimci-asistan-symbol.png`);
  await expect(page.locator(".ya-widget-header strong")).toHaveText("Deniz Çiçeği AI Asistanı");
  await expect(page.locator('[data-ya-request-type="pension_reservation"]')).toBeVisible();
  await expect(page.locator('[data-ya-request-type="restaurant_reservation"]')).toBeVisible();
  await expect(page.locator(".ya-widget-action-card")).toHaveCount(5);
  await expect(page.locator('[data-ya-view="directions"]')).toHaveCount(0); // No published address/map.
  await expect(page.getByRole("link", { name: /Menüyü gör/i })).toHaveCount(0);

  await page.evaluate(() => {
    window.open = (url) => {
      window.__yardimciAsistanLastOpenedUrl = String(url);
      return null;
    };
  });

  await page.locator('[data-ya-request-type="restaurant_reservation"]').click();
  await expect(page.locator(".ya-widget-schedule-row")).toBeVisible();
  await expect(page.locator(".ya-widget-schedule-row [data-ya-open-date-picker]")).toBeVisible();
  await expect(page.locator(".ya-widget-schedule-row [data-ya-open-time-picker]")).toBeVisible();
  await expect(page.locator('.ya-widget-form button[type="submit"]')).toContainText("Talebi Gönder");
  await expect(page.locator(".ya-widget-form-note")).toHaveCount(0);
  await expect(page.locator(".ya-widget-subview-intro p")).toContainText("Tarih ve iletişim");

  await page.locator('.ya-widget-form input[name="customer_name"]').fill("Widget Misafir");
  await page.locator('.ya-widget-form input[name="customer_phone"]').fill("+44 7911 123456");
  await expect(page.locator("[data-ya-date-preset]")).toHaveCount(0);
  await page.locator('[data-ya-open-date-picker="start_date"]').click();
  await expect(page.locator(".ya-widget-calendar-shortcuts")).toContainText("Bugün");
  await expect(page.locator(".ya-widget-calendar-shortcuts")).toContainText("Yarın");
  await expect(page.locator(".ya-widget-calendar-shortcuts")).not.toContainText("Hafta sonu");
  await expect(page.locator(".ya-widget-calendar-shortcuts")).toContainText("Temizle");
  await page.locator('[data-ya-calendar-shortcut="today"]').click();
  await expect(page.locator('[data-ya-date-label="start_date"]')).not.toHaveText("Tarih seç");
  await expect(page.locator("[data-ya-selected-date]")).toHaveCount(0);
  await page.locator("[data-ya-open-time-picker]").click();
  await expect(page.locator("[data-ya-time-popover]")).toBeVisible();
  await page.locator('[data-ya-time-hour="20"]').click();
  await page.locator('[data-ya-time-minute="30"]').click();
  await expect(page.locator("[data-ya-time-popover]")).toBeHidden();
  await expect(page.locator("[data-ya-time-label]")).toHaveText("20:30");
  await expect(page.locator('.ya-widget-form input[name="time"]')).toHaveValue("20:30");
  await page.locator("[data-ya-open-time-picker]").click();
  await expect(page.locator('[data-ya-time-clear="1"]')).toBeEnabled();
  await page.locator('[data-ya-time-clear="1"]').click();
  await expect(page.locator("[data-ya-time-label]")).toHaveText("Saat seç");
  await expect(page.locator('.ya-widget-form input[name="time"]')).toHaveValue("");
  await page.locator("[data-ya-open-time-picker]").click();
  await page.locator('[data-ya-time-hour="20"]').click();
  await page.locator('[data-ya-time-minute="30"]').click();
  await page.locator('.ya-widget-form input[name="guest_count"]').fill("4");
  await page.locator('.ya-widget-form textarea[name="message"]').fill("Bahçede sakin bir masa rica ediyoruz.");

  let lostSubmission;
  await page.route(`${baseUrl}/api/request.php`,async route=>{
    lostSubmission=route.request().postDataJSON();
    const accepted=await route.fetch();expect(accepted.status()).toBe(201);
    await route.abort('failed'); // commit happened, browser never receives it
  },{times:1});
  await page.locator('.ya-widget-form button[type="submit"]').click();
  await expect(page.locator('.ya-widget-form button[type="submit"]')).toBeEnabled();
  expect(lostSubmission.idempotency_key).toMatch(/^[a-f0-9]{32}$/);
  const requestResponsePromise = page.waitForResponse((response) => response.url() === `${baseUrl}/api/request.php` && response.request().method() === "POST");
  await page.locator('.ya-widget-form button[type="submit"]').click();
  const requestResponse = await requestResponsePromise;
  expect(requestResponse.request().postDataJSON().idempotency_key).toBe(lostSubmission.idempotency_key);
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
  expect(requestsAfterForm[0].customer_phone).toBe("+447911123456");
  expect(requestsAfterForm[0].source).toBe("web_form");
  expect(requestsAfterForm[0].request_type).toBe("restaurant_reservation");
  expect(requestsAfterForm[0].customer_name).toBe("Widget Misafir");
  expect(requestsAfterForm[0].date_text).toMatch(/^Bugün, /);
  expect(requestsAfterForm[0].start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(requestsAfterForm[0].time).toBe("20:30");
  expect(requestsAfterForm[0].guest_count).toBe(4);
  expect(requestsAfterForm[0].message).toContain("Bahçede sakin");
  expect(requestsAfterForm[0].sync_status).toBe("pending");

  await page.locator('[data-ya-request-whatsapp="1"]').click();
  const openedUrl = await page.evaluate(() => window.__yardimciAsistanLastOpenedUrl ?? "");
  expect(openedUrl).toContain("https://wa.me/905316969334");
  expect(decodeURIComponent(openedUrl)).toContain("Masa rezervasyonu");
  expect(decodeURIComponent(openedUrl)).toContain("Widget Misafir");
  expect(decodeURIComponent(openedUrl)).toContain("Saat: 20:30");

  const requestsAfterOptionalWhatsApp = await pullRequests();
  expect(requestsAfterOptionalWhatsApp).toHaveLength(1);
  expect(requestsAfterOptionalWhatsApp[0].id).toBe(requestResult.request_id);

  await page.locator('[data-ya-request-done="1"]').click();
  await page.locator('[data-ya-view="info"]').click();
  await expect(page.locator(".ya-widget-ai textarea")).toBeVisible();
  await page.locator(".ya-widget-ai textarea").fill("Bu akşam 4 kişilik masa var mı?");
  await page.locator('.ya-widget-ai button[type="submit"]').click();

  // A profile/config label is not authority: no published table capability, even with AI disabled.
  await expect(page.locator(".ya-widget-ai-answer")).toContainText("hizmeti etkin değil");
  await expect(page.locator(".ya-widget-notice")).toContainText("unsupported_business_domain");

  const conversations = JSON.parse(readFileSync(conversationsFile, "utf8"));
  expect(conversations).toHaveLength(1);
  expect(conversations[0].source).toBe("web_ai");
  expect(conversations[0].request_id).toBe("");
  expect(conversations[0].status).toBe("fallback");
  expect(conversations[0].error_code).toBe("unsupported_business_domain");
  expect(conversations[0].messages_json).toContain("Bu akşam 4 kişilik masa var mı?");
  expect(conversations[0].messages_json).toContain("hizmeti etkin değil");

  const requests = await pullRequests();
  expect(requests).toHaveLength(1);
  expect(requests[0].id).toBe(requestResult.request_id);

  const aiDisabledPublication = await publicationFixtureFetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": syncSecret },
    body: JSON.stringify({
      action: "publish_android_snapshot",
      client_id: "desktop-widget-module-smoke",
      source_revision: 2,
      idempotency_key: "widget-ai-capability-2",
      snapshot: {
        business_capabilities: [
          "core.customers",
          "customer.requests",
          "accommodation.rooms",
          "accommodation.reservations",
          "food_service.tables",
          "food_service.reservations",
          "food_service.menu"
        ]
      }
    })
  });
  expect(aiDisabledPublication.status).toBe(200);
  expect((await aiDisabledPublication.json()).ok).toBe(true);

  const aiDisabledBusinessResponse = await fetch(`${baseUrl}/api/business.php`);
  expect(aiDisabledBusinessResponse.status).toBe(200);
  const aiDisabledBusiness = await aiDisabledBusinessResponse.json();
  expect(aiDisabledBusiness.business.ai_enabled).toBe(false);
  expect(aiDisabledBusiness.business.whatsapp_enabled).toBe(false);
  expect(aiDisabledBusiness.business.requests_enabled).toBe(true);

  const aiDisabledPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await aiDisabledPage.goto(`${siteUrl}/assistant-test.php`, { waitUntil: "domcontentloaded" });
  await injectWidget(aiDisabledPage, baseUrl);
  await aiDisabledPage.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(aiDisabledPage.locator('[data-ya-view="info"]')).toHaveCount(0);
  await expect(aiDisabledPage.locator('[data-ya-view="whatsapp"]')).toHaveCount(0);
  await expect(aiDisabledPage.locator(".ya-widget-header strong")).toHaveText("Deniz Çiçeği Yardımcısı");
  await aiDisabledPage.close();

  const requestsDisabledPublication = await publicationFixtureFetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": syncSecret },
    body: JSON.stringify({
      action: "publish_android_snapshot",
      client_id: "desktop-widget-module-smoke",
      source_revision: 3,
      idempotency_key: "widget-ai-capability-3",
      snapshot: {
        business_capabilities: [
          "service.ai",
          "service.whatsapp",
          "core.customers",
          "accommodation.rooms",
          "accommodation.reservations",
          "food_service.tables",
          "food_service.reservations",
          "food_service.menu",
          "channel.qr_menu"
        ]
      }
    })
  });
  expect(requestsDisabledPublication.status).toBe(200);
  expect((await requestsDisabledPublication.json()).ok).toBe(true);

  const requestsDisabledBusinessResponse = await fetch(`${baseUrl}/api/business.php`);
  expect(requestsDisabledBusinessResponse.status).toBe(200);
  const requestsDisabledBusiness = await requestsDisabledBusinessResponse.json();
  expect(requestsDisabledBusiness.business.requests_enabled).toBe(false);
  expect(requestsDisabledBusiness.business.ai_enabled).toBe(true);
  expect(requestsDisabledBusiness.business.whatsapp_enabled).toBe(true);
  expect(requestsDisabledBusiness.business.public_surfaces).toEqual(["rooms", "restaurant", "qr_menu"]);

  const requestsDisabledPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await requestsDisabledPage.goto(`${siteUrl}/assistant-test.php`, { waitUntil: "domcontentloaded" });
  await injectWidget(requestsDisabledPage, baseUrl);
  await requestsDisabledPage.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(requestsDisabledPage.locator('[data-ya-request-type="pension_reservation"]')).toHaveCount(0);
  await expect(requestsDisabledPage.locator('[data-ya-request-type="restaurant_reservation"]')).toHaveCount(0);
  await expect(requestsDisabledPage.locator('[data-ya-view="info"]')).toBeVisible();
  await expect(requestsDisabledPage.locator('[data-ya-view="whatsapp"]')).toBeVisible();
  await requestsDisabledPage.locator('[data-ya-view="whatsapp"]').click();
  await expect(requestsDisabledPage.locator(".ya-widget-view-title")).toHaveText("Mesajınızı birlikte hazırlayalım");
  await requestsDisabledPage.locator('[data-ya-view="home"]').click();
  await requestsDisabledPage.locator('[data-ya-view="info"]').click();
  await expect(requestsDisabledPage.locator(".ya-widget-ai textarea")).toBeVisible();
  await requestsDisabledPage.close();

  const requestsDisabledFormResponse = await fetch(`${baseUrl}/api/request.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request_type: "restaurant_reservation",
      customer_name: "Kapalı Talep Misafir",
      customer_phone: "+44 7911 123456",
      date_text: "Bu akşam",
      start_date: "2026-07-18",
      time: "20:30",
      guest_count: 2
    })
  });
  expect(requestsDisabledFormResponse.status).toBe(403);
  expect((await requestsDisabledFormResponse.json()).code).toBe("requests_disabled");

  console.log(`demo-assistant-api-smoke-ok: ${siteUrl}/assets/assistant/widget.js`);
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
      "X-YA-Sync-Secret": syncSecret
    },
    body: JSON.stringify({ action: "pull_requests", after_seq: 0, limit: 20 })
  });
  expect(response.status).toBe(200);
  return (await response.json()).requests;
}

async function injectWidget(page, widgetBaseUrl, options = {}) {
  await page.evaluate(({ url, profileId, connectApi, publicSurfaces, requestTypes, address }) => {
    document.body.innerHTML = "<main>Firma sitesi</main>";

    const script = document.createElement("script");
    script.src = new URL("/assets/assistant/widget.js", url).href;
    script.dataset.businessName = "Deniz Çiçeği Pansiyon & Kafe";
    script.dataset.whatsappPhone = "+90 531 696 9334";
    if (connectApi) script.dataset.apiBaseUrl = url;
    script.dataset.profileId = profileId;
    script.dataset.publicSurfaces = JSON.stringify(publicSurfaces);
    script.dataset.requestTypes = JSON.stringify(requestTypes);
    if (address) script.dataset.address = address;
    script.dataset.requestsEnabled = connectApi ? "false" : "true";
    script.dataset.aiEnabled = connectApi ? "false" : "true";
    script.dataset.whatsappEnabled = connectApi ? "false" : "true";

    script.dataset.logoUrl = new URL("/assets/yardimci-asistan-symbol.png", url).href;
    script.dataset.primaryColor = "#2F6F5E";
    script.dataset.accentColor = "#E47863";

    return new Promise((resolve, reject) => {
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error("Widget script could not be loaded.")), { once: true });
      document.body.appendChild(script);
    });
  }, {
    url: widgetBaseUrl,
    profileId: options.profileId ?? "pension_restaurant",
    connectApi: options.connectApi !== false,
    publicSurfaces: options.publicSurfaces ?? ["rooms", "qr_menu", "directions"],
    requestTypes: options.requestTypes ?? ["general_info", "pension_reservation"],
    address: options.address ?? ""
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

}

// A bounded browser contract for the current bundle; no broad demo/PHP fixture,
// build, provider call or download. The form API owner tests real PHP ingress.
async function runCapabilityContracts() {
  const bundle = readFileSync("test-site/landing/assets/assistant/widget.js", "utf8");
  const browser = await launchChromiumForSmoke(chromium);
  let cases = 0;
  const denied = { profile_id: "pension_restaurant", public_surfaces: [], ai_enabled: false,
    requests_enabled: false, request_types: [], whatsapp_enabled: false, address: "", whatsapp: "" };
  async function fixture(business, {forceVisible = false, initial = {}} = {}) {
    const page = await browser.newPage({viewport: {width: 390, height: 844}, reducedMotion: "reduce"});
    const errors = [], requests = [];
    const state = {business: {...denied, ...business}, failOnce: false};
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://widget-contract.test/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/widget.js") return route.fulfill({contentType: "text/javascript", body: bundle});
      if (path === "/yardimci-asistan/api/business.php") return route.fulfill({json: {ok: true, business: state.business}});
      if (path === "/yardimci-asistan/api/request.php") {
        const body = route.request().postDataJSON(); requests.push(body);
        if (!state.business.requests_enabled || !state.business.request_types.includes(body.request_type)) {
          return route.fulfill({status: 403, json: {ok: false, code: "request_type_disabled"}});
        }
        if (state.failOnce) { state.failOnce = false; return route.fulfill({status: 503, json: {ok: false}}); }
        return route.fulfill({status: 201, json: {ok: true, request_id: "synthetic-request"}});
      }
      if (path !== "/") return route.fulfill({status: 404, body: ""});
      const attrs = Object.entries(initial).map(([key, value]) => `data-${key}='${JSON.stringify(value)}'`).join(" ");
      return route.fulfill({contentType: "text/html", body: `<!doctype html><html lang="tr"><head><meta charset="utf-8"></head><body><main>Site</main><script src="/widget.js" data-api-base-url="/yardimci-asistan" data-force-visible="${forceVisible}" ${attrs}></script></body></html>`});
    });
    await page.goto("http://widget-contract.test/");
    await expect.poll(() => page.locator("#yardimci-asistan-widget").count()).toBe(1);
    await expect.poll(() => page.locator("#yardimci-asistan-widget").getAttribute("data-ya-whatsapp-enabled")).toBe(state.business.whatsapp_enabled ? "1" : "0");
    return {page, state, requests, async open() { await page.getByRole("button", {name: "Yardımcı Asistan'ı aç"}).click(); },
      async done() { expect(errors).toEqual([]); await page.close(); cases++; }};
  }
  try {
    const missing = await fixture({email: "contact@example.test"});
    await expect(missing.page.locator("#yardimci-asistan-widget")).toBeHidden();
    await missing.done();

    const emptyDemo = await fixture({}, {forceVisible: true});
    await emptyDemo.open();
    await expect(emptyDemo.page.getByRole("status")).toContainText("Şu anda kullanılabilir bir asistan işlemi yok.");
    await expect(emptyDemo.page.locator(".ya-widget-action-card")).toHaveCount(0);
    await emptyDemo.done();

    for (const profile of ["", "market"]) {
      const hybrid = await fixture({profile_id: profile, public_surfaces: ["rooms", "restaurant", "store"], requests_enabled: true,
        request_types: ["general_info", "pension_reservation", "restaurant_reservation"]});
      await hybrid.open();
      await expect(hybrid.page.locator('[data-ya-request-type="pension_reservation"]')).toBeVisible();
      await expect(hybrid.page.locator('[data-ya-request-type="restaurant_reservation"]')).toBeVisible();
      await expect(hybrid.page.locator('[data-ya-request-type="general_info"]')).toBeVisible();
      await hybrid.done();
    }

    const emptySurfaces = await fixture({public_surfaces: [], requests_enabled: true,
      request_types: ["general_info", "pension_reservation", "restaurant_reservation"]});
    await emptySurfaces.open();
    await expect(emptySurfaces.page.locator('[data-ya-request-type="pension_reservation"]')).toHaveCount(0);
    await expect(emptySurfaces.page.locator('[data-ya-request-type="restaurant_reservation"]')).toHaveCount(0);
    await expect(emptySurfaces.page.locator('[data-ya-request-type="general_info"]')).toBeVisible();
    await emptySurfaces.done();

    const optionalOff = await fixture({public_surfaces: ["rooms", "restaurant"], requests_enabled: true, request_types: ["general_info"]});
    await optionalOff.open();
    await expect(optionalOff.page.locator('[data-ya-request-type="pension_reservation"]')).toHaveCount(0);
    await expect(optionalOff.page.locator('[data-ya-request-type="restaurant_reservation"]')).toHaveCount(0);
    await optionalOff.page.evaluate(() => window.YardimciAsistanWidget.open({intent: "accommodation.reserve"}));
    await expect(optionalOff.page.locator("[data-ya-form]")).toHaveCount(0);
    await optionalOff.done();

    const general = await fixture({profile_id: "market", requests_enabled: true, request_types: ["general_info"]});
    await general.open();
    await general.page.locator('[data-ya-request-type="general_info"]').click();
    await expect(general.page.locator('[data-ya-form]')).toBeVisible();
    await expect(general.page.locator('[name="start_date"], [name="end_date"], [name="time"]')).toHaveCount(0);
    await general.page.locator('[name="customer_name"]').fill("Synthetic guest");
    await general.page.locator('[name="customer_phone"]').fill("+44 7911 123456");
    await general.page.locator('[name="message"]').fill("Synthetic question");
    general.state.failOnce = true;
    await general.page.locator('[data-ya-form] button[type="submit"]').click();
    await expect(general.page.locator('[data-ya-status]')).toBeVisible();
    await expect(general.page.locator('[name="message"]')).toHaveValue("Synthetic question");
    await general.page.locator('[data-ya-form] button[type="submit"]').click();
    await expect(general.page.locator(".ya-widget-request-success")).toBeVisible();
    expect(general.requests.length).toBe(2);
    expect(general.requests[0].idempotency_key).toBe(general.requests[1].idempotency_key);
    expect(general.requests[1]).toMatchObject({request_type: "general_info", start_date: "", end_date: "", time: "", date_text: "", message: "Synthetic question"});
    await general.done();

    const embedUrl = "https://www.google.com/maps/embed?pb=synthetic-location";
    const embedOnly = await fixture({public_surfaces: ["directions"], mapDisplayMode: "google_maps_embed", googleMapsEmbedUrl: embedUrl});
    await embedOnly.open();
    await embedOnly.page.locator('[data-ya-view="directions"]').click();
    await expect(embedOnly.page.getByRole("link", {name: "Haritada Aç"})).toHaveAttribute("href", embedUrl);
    await expect(embedOnly.page.locator('[data-ya-request-type], [data-ya-view="info"]')).toHaveCount(0);
    await embedOnly.done();
    for (const invalid of ["https://invalid.example/maps/embed?pb=x", "https://www.google.com/maps/embed"]) {
      const invalidEmbed = await fixture({public_surfaces: ["directions"], mapDisplayMode: "google_maps_embed", googleMapsEmbedUrl: invalid,
        latitude: 41.1, longitude: 32.2});
      await expect(invalidEmbed.page.locator("#yardimci-asistan-widget")).toBeHidden();
      await invalidEmbed.done();
    }
    const independent = await fixture({profile_id: "market", public_surfaces: ["directions"], whatsapp_enabled: true,
      whatsapp: "+44 7911 123456", mapDisplayMode: "manual", latitude: 41.1, longitude: 32.2});
    await independent.open();
    await expect(independent.page.locator('[data-ya-view="whatsapp"]')).toBeVisible();
    await expect(independent.page.locator('[data-ya-view="directions"]')).toBeVisible();
    await expect(independent.page.locator('[data-ya-view="info"]')).toHaveCount(0);
    await expect(independent.page.locator('[data-ya-request-type]')).toHaveCount(0);
    await independent.page.locator('[data-ya-view="directions"]').click();
    await expect(independent.page.getByRole("link", {name: "Haritada Aç"})).toHaveAttribute("href", /destination=41.1%2C32.2/);
    await independent.done();

    const aiOnly = await fixture({ai_enabled: true});
    await aiOnly.open();
    await expect(aiOnly.page.locator('[data-ya-view="info"]')).toBeVisible();
    await expect(aiOnly.page.locator('[data-ya-request-type]')).toHaveCount(0);
    await aiOnly.done();

    const withdrawal = await fixture({requests_enabled: true, request_types: ["general_info"]}, {forceVisible: true});
    await withdrawal.open();
    await withdrawal.page.locator('[data-ya-request-type="general_info"]').click();
    withdrawal.state.business = {...denied};
    await withdrawal.page.evaluate(() => window.YardimciAsistanWidget.init({apiBaseUrl: "/yardimci-asistan", forceVisible: true}));
    await expect(withdrawal.page.locator("[data-ya-form]")).toHaveCount(0);
    await expect(withdrawal.page.getByRole("status")).toContainText("Şu anda kullanılabilir");
    await withdrawal.done();

    console.log(`widget-capability-contracts-ok: ${cases} bounded browser cases; public payload → widget/form, optional OFF/withdrawal, independent services and idempotent mock-ingress retry`);
  } finally { await browser.close(); }
}

// The site's PHP owner validates hashes; these contexts simulate its accepted
// output with source keys from the real catalog, without a provider call.
async function runInteractionLanguageContracts() {
  const catalog = JSON.parse(readFileSync("web-site-template/locales/tr.json", "utf8"));
  const sourceKeys = Object.fromEntries(Object.entries(catalog).filter(([,value]) => typeof value === "string").map(([key,value]) => [value,key]));
  // Exact envelopes from request.php, request-documents.php and the submission
  // owner. No new error codes are required from legacy uncoded 422 responses.
  const failures = [
    {status: 503, json: {ok: false}},
    {status: 422, json: {ok: false, message: "Lütfen bilgileri kontrol edin.", errors: [{field: "email", message: "Geçerli e-posta adresi girin."}]}},
    ...["En fazla 5 belge ekleyin.", "Belge yüklenemedi. Dosyayı yeniden seçin.", "Her belge en fazla 10 MB olabilir.",
      "Yalnız PDF, JPG ve PNG belgeleri yüklenebilir.", "PDF belgesi okunamadı.", "Belge türü geçersiz.", "Bu talebe belge eklenemez."]
      .map(message => ({status: 422, json: {ok: false, message}})),
    {status: 403, json: {ok: false, code: "requests_disabled", message: "Talep alma özelliği bu işletmede etkin değil."}},
    {status: 403, json: {ok: false, code: "dealer_application_disabled", message: "Online bayi başvurusu kapalı."}},
    {status: 403, json: {ok: false, code: "request_type_disabled", message: "Bu talep türü işletmede etkin değil."}},
    {status: 500, json: {ok: false, message: "Talep kaydedilemedi. Lütfen biraz sonra tekrar deneyin."}},
    {status: 422, json: {ok: false, code: "invalid_idempotency_key", message: "Tekrar deneme kimliği gerekli veya geçersiz."}},
    {status: 409, json: {ok: false, code: "idempotency_conflict", message: "Tekrar deneme kimliği farklı bir talep için kullanılmış."}},
    {status: 503, json: {ok: false, message: "Unknown private server diagnostic <b>must not be displayed</b>"}},
    {status: 403, json: {ok: false, code: "dealer_application_disabled", message: "Unknown replacement server message"}, expected: "Online bayi başvurusu kapalı."}
  ];
  const fallback = "Başvuru sonucu doğrulanamadı. Aynı başvuruyu yeniden deneyin.";
  for (const failure of failures) {
    const source = failure.expected || (failure.json.message?.startsWith("Unknown") ? fallback : failure.json.message) || fallback;
    expect(typeof sourceKeys[source], `Backend result must have a source key: ${source}`).toBe("string");
    failure.expected = source;
  }
  for (const source of ["Bayi Başvurusu", "Firma / unvan", "Belge türü", "{0}: miktar", "Sepet toplamı: {0}"]) {
    expect(typeof sourceKeys[source], `Source catalog must include ${source}`).toBe("string");
  }
  const bundle = readFileSync("test-site/landing/assets/assistant/widget.js", "utf8");
  expect(bundle).toBe(readFileSync("web-site-template/public/assets/core/widget.js", "utf8"));
  expect(bundle).toBe(readFileSync("test-site/landing/deneme/assets/core/widget.js", "utf8"));
  const portal = readFileSync("web-site-template/public/assets/core/portal.js", "utf8");
  const adapter = readFileSync("web-site-template/public/assets/core/interaction-language.js", "utf8");
  const browser = await launchChromiumForSmoke(chromium);
  let cases = 0;
  try {
    for (const code of ["de", "ar"]) {
      const prefix = code === "de" ? "DE " : "AR ";
      const translated = source => prefix + source;
      const messages = Object.fromEntries(Object.entries(sourceKeys).map(([source,key]) => [key,translated(source)]));
      const context = {apiBasePath: "/yardimci-asistan", sourceKeys, language: {code, locale: code === "de" ? "de-DE" : "ar-SA", direction: code === "de" ? "ltr" : "rtl", messages}};
      const contextHtml = `<script id="site-context" type="application/json">${JSON.stringify(context).replace(/</g, "\\u003c")}</script>`;
      const page = await browser.newPage({viewport: {width: 390, height: 844}, reducedMotion: "reduce"});
      const errors = [], submissions = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://widget-language.test/**", async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/widget.js") return route.fulfill({contentType: "text/javascript", body: bundle});
        if (path === "/yardimci-asistan/api/business.php") return route.fulfill({json: {ok: true, business: {
          profile_id: "market", public_surfaces: [], ai_enabled: false, whatsapp_enabled: false,
          requests_enabled: true, request_types: ["general_info", "dealer_application"], dealer_application_enabled: true
        }}});
        if (path === "/yardimci-asistan/api/request.php") {
          submissions.push(route.request().postDataBuffer().toString());
          const failure = failures[submissions.length - 1];
          if (failure) return route.fulfill({status: failure.status, json: failure.json});
          return route.fulfill({status: 201, json: {ok: true, request_id: "synthetic-dealer-request"}});
        }
        if (path !== "/") return route.fulfill({status: 404, body: ""});
        return route.fulfill({contentType: "text/html", body: `<!doctype html><html lang="${code}" dir="${context.language.direction}"><head><meta charset="utf-8"></head><body>${contextHtml}<script src="/widget.js" data-api-base-url="/yardimci-asistan"></script></body></html>`});
      });
      await page.goto("https://widget-language.test/");
      await page.locator("[data-ya-open]").click();
      await expect(page.locator('[data-ya-request-type="dealer_application"]')).toContainText(translated("Bayi Başvurusu"));
      await page.locator('[data-ya-request-type="dealer_application"]').click();
      await expect(page.locator("h2.ya-widget-view-title")).toHaveText(translated("Bayi Başvurusu"));
      await page.getByLabel(translated("Firma / unvan"), {exact: true}).fill("Synthetic company");
      await page.getByLabel(translated("Yetkili adı soyadı"), {exact: true}).fill("Synthetic person");
      await page.getByLabel(translated("Telefon"), {exact: true}).fill("+44 7911 123456");
      await page.getByLabel(translated("E-posta"), {exact: true}).fill("synthetic@example.test");
      await page.locator('[name="tax_office"]').fill("Synthetic office");
      await page.locator('[name="tax_number"]').fill("1234567890");
      await page.locator('[name="message"]').fill("Synthetic application note");
      await page.locator("[data-document-picker]").setInputFiles({name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("invalid")});
      await expect(page.locator("[data-application-status]")).toHaveText(translated("PDF, JPG veya PNG seçin. Her dosya en fazla 10 MB olabilir."));
      await page.locator("[data-document-picker]").setInputFiles({name: "synthetic.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-synthetic-contract")});
      await expect(page.locator("[data-document-list]")).toContainText(translated("Vergi levhası"));
      await expect(page.locator("[data-document-list] button")).toHaveText(translated("Kaldır"));
      for (const failure of failures) {
        await page.locator('[data-dealer-application] button[type="submit"]').click();
        await expect(page.locator("[data-application-status]")).toHaveText(translated(failure.expected));
        for (const [name, value] of Object.entries({company_name: "Synthetic company", authorized_person: "Synthetic person",
          customer_phone: "+44 7911 123456", email: "synthetic@example.test", tax_office: "Synthetic office",
          tax_number: "1234567890", message: "Synthetic application note"})) {
          await expect(page.locator(`[name="${name}"]`)).toHaveValue(value);
        }
        await expect(page.locator('[data-dealer-application] button[type="submit"]')).toBeEnabled();
        await expect(page.locator("[data-document-list]")).toContainText("synthetic.pdf");
        cases++;
      }
      await page.locator('[data-dealer-application] button[type="submit"]').click();
      await expect(page.locator("[data-application-status]")).toHaveText(translated("Başvurunuz alındı. İşletmenin değerlendirmesi bekleniyor."));
      expect(submissions.length).toBe(failures.length + 1);
      const key = body => body.match(/name="idempotency_key"\r\n\r\n([^\r]+)/)?.[1];
      expect(key(submissions[0])).toMatch(/^[a-f0-9-]+$/);
      // Only the generated multipart boundary may change on an unchanged retry;
      // fields, idempotency key, selected document kind and bytes must all match.
      const normalizeMultipart = body => body.replaceAll(body.slice(0, body.indexOf("\r\n")), "--BOUNDARY");
      for (const body of submissions) {
        expect(key(body)).toBe(key(submissions[0]));
        expect(normalizeMultipart(body)).toBe(normalizeMultipart(submissions[0]));
        expect(body).toContain('name="request_type"\r\n\r\ndealer_application');
        expect(body).toContain('name="document_kinds[]"\r\n\r\ntax_certificate');
        expect(body).toContain("%PDF-synthetic-contract");
      }
      await expect(page.locator('[name="company_name"]')).toHaveValue("");
      await expect(page.locator("[data-document-list]")).toBeEmpty();
      expect(errors).toEqual([]);
      await page.close(); cases++;

      const cartPage = await browser.newPage({viewport: {width: 390, height: 844}});
      const cartErrors = []; cartPage.on("pageerror", error => cartErrors.push(error.message));
      await cartPage.route("https://portal-language.test/**", async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/adapter.js") return route.fulfill({contentType: "text/javascript", body: adapter});
        if (path === "/portal.js") return route.fulfill({contentType: "text/javascript", body: portal});
        if (path.endsWith("/account/config.php")) return route.fulfill({json: {ok: true, enabled: true, providers: []}});
        if (path.endsWith("/account/session.php")) return route.fulfill({json: {ok: true, account: {methods: [], dealer: {access_id: "synthetic-access", display_name: "Synthetic dealer"}}}});
        if (path.endsWith("/dealer/catalog.php")) return route.fulfill({json: {ok: true, catalog: {delivery_methods: ["pickup"], catalog_revision: 1,
          products: [{product_id: "synthetic-product", name: "Synthetic product", description: "", price: 5, currency: "TRY", unit: "piece"}]}}});
        if (path !== "/") return route.fulfill({status: 404, body: ""});
        return route.fulfill({contentType: "text/html", body: `<!doctype html><html lang="${code}" dir="${context.language.direction}"><head><meta charset="utf-8"></head><body>${contextHtml}
          <h1 id="portal-title"></h1><p id="portal-message"></p><div id="success" hidden></div><div id="dealer-store" hidden><div id="product-grid"></div><ul id="cart-lines"></ul><div id="subtotal"></div></div>
          <script src="/adapter.js"></script><script src="/portal.js"></script></body></html>`});
      });
      await cartPage.goto("https://portal-language.test/");
      await cartPage.getByRole("button", {name: translated("Sepete ekle")}).click();
      await expect(cartPage.getByRole("spinbutton", {name: translated("{0}: miktar").replace("{0}", "Synthetic product"), exact: true})).toHaveValue("1");
      await expect(cartPage.getByRole("button", {name: translated("{0}: miktarı azalt").replace("{0}", "Synthetic product"), exact: true})).toBeVisible();
      await expect(cartPage.getByRole("button", {name: translated("{0}: miktarı artır").replace("{0}", "Synthetic product"), exact: true})).toBeVisible();
      await expect(cartPage.locator("#subtotal")).toContainText(prefix + "Sepet toplamı:");
      expect(cartErrors).toEqual([]);
      await cartPage.close(); cases++;
    }
    console.log(`widget-interaction-language-contracts-ok: ${cases} bounded de/ar browser cases; real-shaped 422/403/document/500/409 errors, unknown-message fallback, unchanged multipart/idempotency retries, dealer success and cart; synthetic accepted catalog, no provider`);
  } finally {await browser.close();}
}
