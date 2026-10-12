import { chromium, expect } from "@playwright/test";
import { activateFixtureSource, publicationFixtureFetch } from "./test-helpers/publication-protocol.mjs";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { nexaRuntimePaths } from "./nexa-assets.mjs";

const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-widget-module-"));
const webModuleRoot = join(tempRoot, "web-module");
const widgetBundlePath = join(process.cwd(), "packages", "web-widget", "dist", "widget.js");
cpSync(join(process.cwd(), "firm-template", "web-module"), webModuleRoot, { recursive: true });
cpSync(widgetBundlePath, join(webModuleRoot, "widget.js"));
for (const path of nexaRuntimePaths("web")) {
  const destination = join(webModuleRoot, path);
  mkdirSync(join(destination, ".."), { recursive: true });
  cpSync(join(process.cwd(), "packages/web-widget/dist", path), destination);
}
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
  await activateFixtureSource(baseUrl, syncSecret, "desktop-widget-module-smoke");

  const publicBusinessBeforeSyncResponse = await fetch(`${baseUrl}/api/business.php`);
  expect(publicBusinessBeforeSyncResponse.status).toBe(200);
  const publicBusinessBeforeSync = await publicBusinessBeforeSyncResponse.json();
  expect(publicBusinessBeforeSync.business.profile_id).toBe("pension_restaurant");
  expect(publicBusinessBeforeSync.business.public_surfaces).toEqual(["accommodation", "food_service", "menu", "directions"]);

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

  const publicBusinessAfterSyncResponse = await fetch(`${baseUrl}/api/business.php`);
  expect(publicBusinessAfterSyncResponse.status).toBe(200);
  const publicBusinessAfterSync = await publicBusinessAfterSyncResponse.json();
  expect(publicBusinessAfterSync.business.public_surfaces).toEqual(["accommodation", "food_service", "menu", "directions"]);
  expect(publicBusinessAfterSync.business.ai_enabled).toBe(true);
  expect(publicBusinessAfterSync.business.whatsapp_enabled).toBe(true);
  expect(publicBusinessAfterSync.business.requests_enabled).toBe(true);

  browser = await launchChromiumForSmoke(chromium);

  const fixedLauncherPage = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await fixedLauncherPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
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
  await pensionPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
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
  await contextPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await injectWidget(contextPage, baseUrl, { profileId: "pension", connectApi: false });
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
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await injectWidget(page, baseUrl);

  await expect(page.getByRole("button", { name: "Yardımcı Asistan'ı aç" })).toBeVisible();
  await expect(page.locator('[data-nexa-role="launcher"] svg[data-nexa-rig]')).toHaveAttribute("data-expression", "idle");
  await expect(page.locator('[data-nexa-role="launcher"] svg[data-nexa-rig]')).toHaveAttribute("data-motion-active", "false");

  await page.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(page.locator(".ya-widget-header img.ya-widget-mark")).toHaveAttribute("src", `${baseUrl}/assets/yardimci-asistan-symbol.png`);
  await expect(page.locator(".ya-widget-header strong")).toHaveText("Deniz Çiçeği AI Asistanı");
  await expect(page.locator('[data-ya-request-type="pension_reservation"]')).toBeVisible();
  await expect(page.locator('[data-ya-request-type="restaurant_reservation"]')).toBeVisible();
  await expect(page.locator(".ya-widget-action-card")).toHaveCount(5);
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
  await aiDisabledPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
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
  expect(requestsDisabledBusiness.business.public_surfaces).toEqual(["accommodation", "food_service", "menu", "directions"]);

  const requestsDisabledPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await requestsDisabledPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
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
      "X-YA-Sync-Secret": syncSecret
    },
    body: JSON.stringify({ action: "pull_requests", after_seq: 0, limit: 20 })
  });
  expect(response.status).toBe(200);
  return (await response.json()).requests;
}

async function injectWidget(page, widgetBaseUrl, options = {}) {
  await page.evaluate(({ url, profileId, connectApi }) => {
    document.body.innerHTML = "<main>Firma sitesi</main>";

    const script = document.createElement("script");
    script.src = `${url}/widget.js`;
    script.dataset.businessName = "Deniz Çiçeği Pansiyon & Kafe";
    script.dataset.whatsappPhone = "+90 531 696 9334";
    if (connectApi) script.dataset.apiBaseUrl = url;
    script.dataset.profileId = profileId;
    script.dataset.logoUrl = `${url}/assets/yardimci-asistan-symbol.png`;
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
    connectApi: options.connectApi !== false
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
