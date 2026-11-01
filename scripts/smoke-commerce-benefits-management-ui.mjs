import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { chooseDate } from "./test-helpers/date-time-picker.mjs";
import { managementFixture } from "./test-helpers/commerce-benefits-management-fixture.mjs";

const f = managementFixture();
f.db.prepare("INSERT INTO business_capabilities (business_id,capability_id,created_at,updated_at) VALUES ('b1','service.android','t','t')").run();
f.db.exec("INSERT INTO android_devices (id,device_id,device_name,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','Fixture telefon','t','t','t','t'); UPDATE android_devices SET is_active=1,permissions_json='[\"market.sale.complete\",\"customer.view\"]' WHERE id='d1'; INSERT INTO android_local_credentials (device_id,token_hash,created_at,updated_at) VALUES ('device-one','fixture-hash','t','t');");
f.service.configure({ revision: 1, families: { coupon: false, points: false, payment_modifier: false } });
const server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
  logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: false } });
let browser;
try {
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }), errors = [], calls = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/benefits-fixture", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/benefits-fixture",
    `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/commerce-benefits-management.tsx")}"></script></body></html>`) }));
  const ipc = f.modules.load("ipc/commerce-benefits-ipc");
  await page.exposeFunction("__benefitsCall", async (method, args) => {
    calls.push(method);
    const operations = { getCommerceBenefits: () => f.service.snapshot(), configureCommerceBenefits: () => f.service.configure(args[0]), saveCommerceBenefitsRule: () => f.service.saveRule(args[0]),
      issueCommerceBenefitsCoupon: () => f.service.issueCoupon(args[0]), getCommercePointAccount: () => f.service.pointAccount(...args), adjustCommercePoints: () => f.service.adjustPoints(args[0]), expireCommercePoints: () => f.service.expirePoints(args[0]),
      listCompanionPointDevices: () => f.service.companionPointDevices(), getCompanionPointGrantStatus: () => f.service.companionPointGrantStatus(args[0]),
      grantCompanionPointAccess: () => f.service.changeCompanionPointGrant(args[0], true), revokeCompanionPointAccess: () => f.service.changeCompanionPointGrant(args[0], false),
      getCompanionPointSpendStatus: () => f.service.companionPointSpendGrantStatus(args[0]), grantCompanionPointSpend: () => f.service.changeCompanionPointSpendGrant(args[0], true), revokeCompanionPointSpend: () => f.service.changeCompanionPointSpendGrant(args[0], false) };
    if (method === "listCustomers") return { items: [{ id: "c1", fullName: "Fixture müşteri" }], total: 1, matched: 1 };
    if (method === "listCategories") return [{ id: "category1", name: "Fixture kategori" }];
    if (method === "listProducts") return { items: [{ id: "p1", name: "Fixture ürün" }], total: 1, nextOffset: null };
    if (method === "studio") return { ok: true, value: { contents: [], publications: [], shares: [], campaigns: [], channels: [] } };
    if (method === "schedules") return { ok: true, value: { schedules: [] } };
    try { return { ok: true, value: operations[method]() }; } catch (error) { return ipc.benefitsManagementFailure(error); }
  });
  await page.goto(`${server.resolvedUrls.local[0]}benefits-fixture`);
  await expect(page.getByRole("heading", { name: "İndirim ve Puan", exact: true })).toBeVisible();
  await expect(page.locator('[data-nav-id="marketing"]')).toHaveText("İndirim ve Puan");
  await expect(page.getByRole("button", { name: "Yeni paylaşım" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Puan ailesi" })).toHaveAttribute("aria-checked", "false");
  assert(!calls.includes("studio")); assert(!calls.includes("schedules"));
  await page.getByRole("switch", { name: "Puan ailesi" }).click();
  await expect(page.getByRole("switch", { name: "Puan ailesi" })).toHaveAttribute("aria-checked", "true");
  assert.deepEqual(f.service.snapshot().families, { coupon: false, points: true, payment_modifier: false });
  const coupon = page.getByRole("region", { name: "Kupon", exact: true });
  const add = coupon.getByRole("button", { name: "Kural ekle", exact: true });
  await add.click(); const dialog = page.getByRole("dialog", { name: "Kupon kuralı", exact: true });
  await expect(dialog).toBeVisible(); await page.getByLabel("Kural adı", { exact: true }).fill("ui-kupon");
  await page.keyboard.press("Escape"); await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Düzenlemeye dön" }).click();
  await expect(page.getByLabel("Kural adı", { exact: true })).toHaveValue("ui-kupon");
  await page.getByLabel("Yüzde (%)", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(add).toBeFocused();
  assert.equal(f.service.snapshot().rules[0].percentBps, 1000);
  await page.getByRole("button", { name: "ui-kupon düzenle" }).click();
  await expect(page.getByLabel("Kural adı", { exact: true })).toBeDisabled();
  await page.getByLabel("Durum", { exact: true }).selectOption("active");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); assert.equal(f.service.snapshot().rules[0].version, 2);
  await page.getByRole("button", { name: "ui-kupon devre dışı bırak" }).click();
  await expect(coupon.getByText("Devre dışı", { exact: true })).toBeVisible(); assert.equal(f.service.snapshot().rules[0].version, 3);
  await page.getByRole("button", { name: "Müşteri Puan hesabı", exact: true }).click();
  await page.getByRole("button", { name: "Puan müşterisi", exact: true }).click();
  await page.getByRole("option", { name: "Fixture müşteri" }).click();
  await page.getByRole("combobox", { name: "Telefon", exact: true }).selectOption("device-one");
  await page.getByRole("button", { name: "Puan bakiyesini telefonda göster" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Fixture telefon");
  await expect(page.getByRole("alertdialog")).toContainText("Fixture müşteri");
  await expect(page.getByRole("alertdialog")).toContainText("c1");
  await page.getByRole("button", { name: "İzin ver", exact: true }).click();
  await expect(page.getByRole("button", { name: "Telefon erişimini kaldır" })).toBeVisible();
  assert.equal(f.service.companionPointSpendGrantStatus({ customerId: "c1", deviceId: "device-one", recordId: "d1" }), false);
  await page.getByRole("button", { name: "Gelecek harcama izni ver" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("mobil Puan harcaması henüz etkin değildir");
  await page.getByRole("button", { name: "Gelecek için izin ver" }).click();
  await expect(page.getByRole("button", { name: "Gelecek harcama iznini kaldır" })).toBeVisible();
  await page.getByRole("button", { name: "Telefon erişimini kaldır" }).click();
  await page.getByRole("button", { name: "Erişimi kaldır", exact: true }).click();
  await expect(page.getByRole("button", { name: "Puan bakiyesini telefonda göster" })).toBeVisible();
  assert.equal(f.service.companionPointSpendGrantStatus({ customerId: "c1", deviceId: "device-one", recordId: "d1" }), true);
  await page.getByRole("button", { name: "Gelecek harcama iznini kaldır" }).click();
  await page.getByRole("button", { name: "Harcamaya izni kaldır" }).click();
  await expect(page.getByRole("button", { name: "Gelecek harcama izni ver" })).toBeVisible();
  await page.getByRole("combobox", { name: "Telefon", exact: true }).selectOption("");
  await expect(page.getByRole("button", { name: "Gelecek harcama izni ver" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Telefon", exact: true }).selectOption("device-one");
  await expect(page.getByRole("button", { name: "Gelecek harcama izni ver" })).toBeEnabled();
  await page.getByLabel("Puan tutarı", { exact: true }).fill("15,00");
  await page.getByLabel("İşlem gerekçesi", { exact: true }).fill("UI düzeltme gerekçesi");
  await page.getByRole("button", { name: "Düzeltmeyi kaydet" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); assert.equal(f.service.pointAccount("c1", "TRY").availableMinor, 1500);
  await page.getByRole("button", { name: "Puan bakiyesi ve geçmişi" }).click();
  await expect(page.getByRole("region", { name: "Müşteri Puan hesabı" }).getByText("₺15,00", { exact: true }).first()).toBeVisible();
  await add.click(); await page.getByLabel("Kural adı", { exact: true }).fill("draft-preserved");
  await page.getByRole("button", { name: "Fixture sayfa değiştir" }).evaluate(button => button.click());
  await expect(page.getByRole("alertdialog")).toBeVisible(); await page.getByRole("button", { name: "Düzenlemeye dön" }).click();
  await expect(page.getByLabel("Kural adı", { exact: true })).toHaveValue("draft-preserved");
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Date picker uses the existing primitive; do not invent a nested modal.
  await page.getByRole("switch", { name: "Kupon ailesi" }).click();
  await page.getByRole("button", { name: "ui-kupon düzenle" }).click(); await page.getByLabel("Durum", { exact: true }).selectOption("active"); await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await coupon.getByRole("button", { name: "Kod oluştur" }).click(); await chooseDate(page, "Kupon geçerlilik sonu", "2026-11-20");
  await page.getByRole("button", { name: "Kodu oluştur", exact: true }).click();
  const secret = await page.getByLabel("Yeni kupon kodu", { exact: true }).textContent(); assert.match(secret, /^[A-F0-9]{40}$/);
  await page.keyboard.press("Escape"); await coupon.getByRole("button", { name: "Kod oluştur" }).click();
  await expect(page.getByLabel("Yeni kupon kodu", { exact: true })).toHaveCount(0); await page.keyboard.press("Escape");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 }); await add.click();
    assert(await page.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    await page.keyboard.press("Escape");
  }
  await page.evaluate(() => window.__setBenefitsCapabilities(false, false));
  await expect(page.locator('[data-nav-id="marketing"]')).toHaveCount(0);
  await expect(page.getByRole("region", { name: "İndirim ve Puan yönetimi" })).toHaveCount(0);
  await page.evaluate(() => window.__setBenefitsCapabilities(true, true));
  await expect(page.locator('[data-nav-id="marketing"]')).toHaveText("Pazarlama");
  assert.equal(await page.locator('[data-nav-id="marketing"]').count(), 1);
  await page.getByRole("navigation", { name: "Pazarlama alanı" }).getByRole("button", { name: "İndirim ve Puan", exact: true }).click();
  await expect(page.getByRole("region", { name: "İndirim ve Puan yönetimi" })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log("PASS benefits management UI: persistence, studio-off entry, keyboard/overlay, customer Puan, one-time secret, inactive visibility");
} finally { await browser?.close(); await server.close(); f.close(); }
