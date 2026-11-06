import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { chooseDate } from "./test-helpers/date-time-picker.mjs";
import { managementFixture } from "./test-helpers/commerce-benefits-management-fixture.mjs";

const screenshots = process.argv.includes("--screenshots");
if (screenshots) mkdirSync("artifacts/commerce-benefits-management", { recursive: true });
const f = managementFixture();
f.db.prepare("UPDATE customers SET full_name = 'Fixture müşteri' WHERE id = 'c1'").run();
f.db.prepare("UPDATE customers SET full_name = 'İkinci müşteri' WHERE id = 'c2'").run();
for (let index = 0; index < 35; index++) f.db.prepare("INSERT INTO customers (id,full_name,phone,business_id,created_at,updated_at) VALUES (?,?,?,'b1','fixture','fixture')").run(`paged-${index}`, `Sayfalı müşteri ${String(index).padStart(2, "0")}`, `test-${index}`);
f.db.prepare("INSERT INTO business_capabilities (business_id,capability_id,created_at,updated_at) VALUES ('b1','service.android','t','t')").run();
f.db.exec("INSERT INTO android_devices (id,device_id,device_name,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','Fixture telefon','t','t','t','t'); UPDATE android_devices SET is_active=1,permissions_json='[\"market.sale.complete\",\"customer.view\"]' WHERE id='d1'; INSERT INTO android_local_credentials (device_id,token_hash,created_at,updated_at) VALUES ('device-one','fixture-hash','t','t');");
f.service.configure({ revision: 1, families: { coupon: false, points: false, payment_modifier: false } });
const server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
  logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: false } });
let browser;
try {
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }), errors = [], calls = [], requests = [];
  let loseNextAdjustmentReply = false;
  page.on("pageerror", error => errors.push(error.message));
  // Rule validity must use the same clock as the real SQLite management service.
  await page.addInitScript(now => { Date.now = () => now; }, f.state.now);
  await page.route("**/benefits-fixture", async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml("/benefits-fixture",
    `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/commerce-benefits-management.tsx")}"></script></body></html>`) }));
  const ipc = f.modules.load("ipc/commerce-benefits-ipc");
  await page.exposeFunction("__benefitsCall", async (method, args) => {
    calls.push(method); requests.push({ method, args });
    const operations = { getCommerceBenefits: () => f.service.snapshot(), configureCommerceBenefits: () => f.service.configure(args[0]), saveCommerceBenefitsRule: () => f.service.saveRule(args[0]),
      issueCommerceBenefitsCoupon: () => f.service.issueCoupon(args[0]), getCommercePointAccount: () => f.service.pointAccount(...args), adjustCommercePoints: () => f.service.adjustPoints(args[0]), expireCommercePoints: () => f.service.expirePoints(args[0]),
      listCompanionPointDevices: () => f.service.companionPointDevices(), getCompanionPointGrantStatus: () => f.service.companionPointGrantStatus(args[0]),
      grantCompanionPointAccess: () => f.service.changeCompanionPointGrant(args[0], true), revokeCompanionPointAccess: () => f.service.changeCompanionPointGrant(args[0], false),
      getCompanionPointSpendStatus: () => f.service.companionPointSpendGrantStatus(args[0]), grantCompanionPointSpend: () => f.service.changeCompanionPointSpendGrant(args[0], true), revokeCompanionPointSpend: () => f.service.changeCompanionPointSpendGrant(args[0], false) };
    if (method === "listCustomers") {
      const rows = f.db.prepare("SELECT id,full_name AS fullName FROM customers WHERE business_id = 'b1' AND deleted_at = '' ORDER BY full_name,id").all();
      const { search = "", offset = 0, limit = 60 } = args[0] ?? {};
      const matches = rows.filter(row => row.fullName.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr")));
      return { items: matches.slice(offset, offset + limit), total: rows.length, matched: matches.length };
    }
    if (method === "listCategories") return [{ id: "category1", name: "Fixture kategori" }];
    if (method === "listProducts") return { items: [{ id: "p1", name: "Fixture ürün" }], total: 1, nextOffset: null };
    if (method === "studio") return { ok: true, value: { contents: [], publications: [], shares: [], campaigns: [], channels: [] } };
    if (method === "schedules") return { ok: true, value: { schedules: [] } };
    try {
      const value = operations[method]();
      if (method === "adjustCommercePoints" && loseNextAdjustmentReply) { loseNextAdjustmentReply = false; throw new Error("Fixture lost acknowledgement"); }
      return { ok: true, value };
    } catch (error) { return ipc.benefitsManagementFailure(error); }
  });
  await page.goto(`${server.resolvedUrls.local[0]}benefits-fixture`);
  await expect(page.getByRole("heading", { name: "İndirim ve Puan", exact: true })).toBeVisible();
  await expect(page.locator('[data-nav-id="marketing"]')).toHaveCount(0);
  await expect(page.locator('[data-nav-id="benefits"]')).toHaveText("İndirim ve Puan");
  await expect(page.getByRole("navigation", { name: "Pazarlama görünümü" })).toHaveCount(0);
  const families = page.getByRole("navigation", { name: "Kural türleri" });
  await expect(families.getByRole("button", { name: "Kupon", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("switch")).toHaveCount(0);
  const familyPanel = page.getByRole("region", { name: /^(Kupon|Puan|Ödeme avantajı) kullanımı$/ });
  const views = page.getByRole("navigation", { name: "İndirim ve Puan görünümü" });
  const rulesView = views.getByRole("button", { name: "Kurallar", exact: true });
  const pointsView = views.getByRole("button", { name: "Puan Hesapları", exact: true });
  await expect(views.getByRole("button")).toHaveText(["Kurallar", "Puan Hesapları"]);
  await expect(families.getByRole("button")).toHaveCount(3);
  if (screenshots) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await captureScheme("dark");
    await fillsPage(page.locator(".benefits-studio"));
    await page.screenshot({ path: "artifacts/commerce-benefits-management/page-empty-dark-1920.png" });
    await captureScheme(null);
    await page.setViewportSize({ width: 1366, height: 900 });
  }
  await families.getByRole("button", { name: "Puan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Yeni paylaşım" })).toHaveCount(0);
  await expect(familyPanel.getByText("Kapalı", { exact: true })).toBeVisible();
  assert(!calls.includes("studio")); assert(!calls.includes("schedules"));
  await familyPanel.getByRole("button", { name: /^Kullanımı / }).click();
  await expect(familyPanel.getByText("Açık", { exact: true })).toBeVisible();
  assert.deepEqual(f.service.snapshot().families, { coupon: false, points: true, payment_modifier: false });
  await families.getByRole("button", { name: "Ödeme Avantajı", exact: true }).click();
  await expect(familyPanel.getByText("Kapalı", { exact: true })).toBeVisible();
  await familyPanel.getByRole("button", { name: /^Kullanımı / }).click();
  assert.equal(f.service.snapshot().families.payment_modifier, true);
  await families.getByRole("button", { name: "Kupon", exact: true }).click();
  const coupon = page.getByRole("region", { name: "Kupon özeti", exact: true });
  const add = page.getByRole("button", { name: "Yeni kural", exact: true });
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
  await expect(coupon.getByText("Pasif", { exact: true })).toBeVisible(); assert.equal(f.service.snapshot().rules[0].version, 3);
  // Scope changes in an existing rule still guard route changes.
  await page.getByRole("button", { name: "ui-kupon düzenle" }).click();
  await page.getByLabel("Müşteri kapsamı", { exact: true }).selectOption("groups");
  await page.getByLabel("Müşteri grupları", { exact: true }).fill("yalnız gizli değişiklik");
  await page.getByRole("button", { name: "Fixture sayfa değiştir" }).evaluate(button => button.click());
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Düzenlemeye dön" }).click();
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await page.getByRole("button", { name: "Değişiklikleri bırak", exact: true }).click();
  assert.equal(f.service.snapshot().rules[0].scope.customerGroups.length, 0);
  await pointsView.click();
  await page.getByRole("region", { name: "Puan müşterileri" }).getByRole("button", { name: "Fixture müşteri", exact: true }).click();
  await expect(page.getByRole("region", { name: "Puan geçmişi", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Telefon", exact: true }).selectOption("device-one");
  await page.getByRole("button", { name: "Puan bakiyesini telefonda göster" }).click();
  await expect(page.getByRole("dialog")).toContainText("Fixture telefon");
  await expect(page.getByRole("dialog")).toContainText("Fixture müşteri");
  await expect(page.getByRole("dialog")).toContainText("c1");
  await page.getByRole("button", { name: "İzin ver", exact: true }).click();
  await expect(page.getByRole("button", { name: "Telefon erişimini kaldır" })).toBeVisible();
  assert.equal(f.service.companionPointSpendGrantStatus({ customerId: "c1", deviceId: "device-one", recordId: "d1" }), false);
  await page.getByRole("button", { name: "Gelecek harcama izni ver" }).click();
  await expect(page.getByRole("dialog")).toContainText("mobil Puan harcaması henüz etkin değildir");
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
  await page.getByRole("button", { name: "Düzeltmeyi uygula" }).click();
  await expect(page.getByRole("dialog")).toContainText("Puan düzeltmesini onayla");
  assert.equal(f.service.pointAccount("c1", "TRY").availableMinor, 0, "confirmation precedes mutation");
  await page.getByRole("button", { name: "İşlemi onayla", exact: true }).click();
  await expect(page.getByLabel("Puan tutarı", { exact: true })).toHaveValue("");
  await expect(page.getByRole("dialog")).toHaveCount(0); assert.equal(f.service.pointAccount("c1", "TRY").availableMinor, 1500);
  await expect(pointsView).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fixture sayfa değiştir" }).click();
  await page.getByRole("button", { name: "Puan bakiyesi ve geçmişi" }).click();
  await expect(page.getByRole("region", { name: "Müşteri Puan hesabı" }).getByText("₺15,00", { exact: true }).first()).toBeVisible();
  await page.locator('[data-nav-id="benefits"]').click();
  await rulesView.click();
  await add.click(); await page.getByLabel("Kural adı", { exact: true }).fill("draft-preserved");
  await page.getByLabel("Müşteri kapsamı", { exact: true }).selectOption("groups");
  await page.getByLabel("Müşteri grupları", { exact: true }).fill("sadık müşteriler");
  await page.getByRole("button", { name: "Fixture sayfa değiştir" }).evaluate(button => button.click());
  await expect(page.getByRole("alertdialog")).toBeVisible(); await page.getByRole("button", { name: "Düzenlemeye dön" }).click();
  await expect(page.getByLabel("Kural adı", { exact: true })).toHaveValue("draft-preserved");
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Düzenlemeye dön" }).click();
  await expect(page.getByLabel("Müşteri grupları", { exact: true })).toHaveValue("sadık müşteriler");
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await page.getByRole("button", { name: "Değişiklikleri bırak", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The same local guard handles a tab request while the rule editor is open.
  await add.click();
  await page.getByLabel("Müşteri kapsamı", { exact: true }).selectOption("customers");
  await pointsView.evaluate(button => button.click());
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Düzenlemeye dön" }).click();
  await expect(rulesView).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Formu kapat", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Değişiklikleri bırak", exact: true }).click();
  // Explicit empty selected scopes cannot silently save as all records.
  await page.getByRole("button", { name: "ui-kupon etkinleştir" }).click();
  await expect(coupon.getByText("Etkin", { exact: true })).toBeVisible();
  await expect(familyPanel.getByText("Kapalı", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ui-kupon düzenle" }).click();
  await expect(page.getByText("Gelişmiş koşullar", { exact: true })).toHaveCount(0);
  for (const [label, mode, message] of [["Fiyat grubu kapsamı", "selected", "En az bir fiyat grubu seçin."], ["Müşteri kapsamı", "customers", "En az bir müşteri seçin."], ["Müşteri kapsamı", "groups", "En az bir müşteri grubu girin."], ["Ürün kapsamı", "products", "En az bir ürün seçin."], ["Ürün kapsamı", "categories", "En az bir kategori seçin."], ["Uygulama", "selected", "Birlikte uygulanacak en az bir avantaj seçin."]]) {
    await page.getByLabel(label, { exact: true }).selectOption(mode);
    const count = calls.filter(method => method === "saveCommerceBenefitsRule").length;
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(message);
    assert.equal(calls.filter(method => method === "saveCommerceBenefitsRule").length, count);
    await page.getByLabel(label, { exact: true }).selectOption(label === "Uygulama" ? "alone" : "all");
  }
  const choose = async (label, option) => { await page.getByRole("button", { name: label, exact: true }).click(); await page.getByRole("option", { name: option, exact: true }).click(); };
  await page.getByLabel("Fiyat grubu kapsamı", { exact: true }).selectOption("selected");
  await page.getByLabel("Perakende", { exact: true }).check();
  await page.getByLabel("Müşteri kapsamı", { exact: true }).selectOption("customers");
  await choose("Müşteriler", "Fixture müşteri");
  await page.getByLabel("Ürün kapsamı", { exact: true }).selectOption("products");
  await choose("Ürünler", "Fixture ürün");
  await choose("Hariç ürünler", "Fixture ürün");
  await choose("Hariç kategoriler", "Fixture kategori");
  await page.getByLabel("Uygulama", { exact: true }).selectOption("selected");
  await page.getByRole("group", { name: "Avantajlar", exact: true }).getByLabel("Puan", { exact: true }).check();
  await expect(page.getByRole("checkbox", { name: "Web · Kullanılamıyor", exact: true })).toBeDisabled();
  await compactRuleForm();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let scoped = f.service.snapshot().rules.find(rule => rule.id === "ui-kupon");
  assert.deepEqual(scoped.scope.productIds, ["p1"]); assert.deepEqual(scoped.scope.customerIds, ["c1"]); assert.deepEqual(scoped.scope.priceGroups, ["retail"]);
  assert.deepEqual(scoped.scope.excludedProductIds, ["p1"]); assert.deepEqual(scoped.scope.excludedCategoryIds, ["category1"]); assert.deepEqual(scoped.combinesWith, ["points"]);
  await page.getByRole("button", { name: "ui-kupon düzenle" }).click();
  await page.getByLabel("Fiyat grubu kapsamı", { exact: true }).selectOption("all");
  await page.getByLabel("Müşteri kapsamı", { exact: true }).selectOption("all");
  await page.getByLabel("Ürün kapsamı", { exact: true }).selectOption("all");
  await page.getByLabel("Uygulama", { exact: true }).selectOption("alone");
  await page.getByRole("button", { name: "p1 kapsamdan çıkar", exact: true }).click();
  await page.getByRole("button", { name: "category1 kapsamdan çıkar", exact: true }).click();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  scoped = f.service.snapshot().rules.find(rule => rule.id === "ui-kupon");
  assert.deepEqual(scoped.scope.productIds, []); assert.deepEqual(scoped.scope.customerIds, []); assert.deepEqual(scoped.scope.priceGroups, []); assert.deepEqual(scoped.combinesWith, []);
  // Date picker uses the existing primitive; do not invent a nested modal.
  await familyPanel.getByRole("button", { name: /^Kullanımı / }).click();
  await page.getByRole("button", { name: "ui-kupon düzenle" }).click(); await page.getByLabel("Durum", { exact: true }).selectOption("active"); await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await familyPanel.getByRole("button", { name: /^Kullanımı / }).click();
  await expect(coupon.getByRole("button", { name: "Kod oluştur" })).toBeDisabled();
  assert.equal(f.service.snapshot().rules[0].status, "active", "family activation never rewrites rule status");
  await familyPanel.getByRole("button", { name: /^Kullanımı / }).click();
  await coupon.getByRole("button", { name: "Kod oluştur" }).click(); await chooseDate(page, "Kupon geçerlilik sonu", "2026-11-20");
  await page.getByRole("button", { name: "Kodu oluştur", exact: true }).click();
  const secret = await page.getByLabel("Yeni kupon kodu", { exact: true }).textContent(); assert.match(secret, /^[A-F0-9]{40}$/);
  await page.keyboard.press("Escape"); await coupon.getByRole("button", { name: "Kod oluştur" }).click();
  await expect(page.getByLabel("Yeni kupon kodu", { exact: true })).toHaveCount(0); await page.keyboard.press("Escape");
  await families.getByRole("button", { name: "Puan", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Puan kuralları", exact: true })).toBeVisible();
  await families.getByRole("button", { name: "Kupon", exact: true }).click();
  await page.getByLabel("Kural ara", { exact: true }).fill("eşleşme yok");
  await expect(page.getByText("Eşleşen kural yok.", { exact: true })).toBeVisible();
  await page.getByLabel("Kural ara", { exact: true }).fill("ui-kupon");
  await page.getByLabel("Durum filtresi", { exact: true }).selectOption("draft");
  await expect(page.getByText("Eşleşen kural yok.", { exact: true })).toBeVisible();
  await page.getByLabel("Durum filtresi", { exact: true }).selectOption("active");
  await expect(page.getByRole("button", { name: "ui-kupon düzenle" })).toBeVisible();
  await page.getByLabel("Kural ara", { exact: true }).fill("");
  await page.getByLabel("Durum filtresi", { exact: true }).selectOption("");
  // Rule save errors keep every staged field and do not close the editor.
  await page.getByRole("button", { name: "ui-kupon düzenle" }).click();
  await page.getByLabel("Yüzde (%)", { exact: true }).fill("12");
  f.state.locked = true;
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Yüzde (%)", { exact: true })).toHaveValue("12");
  f.state.locked = false;
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await page.getByRole("button", { name: "Değişiklikleri bırak", exact: true }).click();
  assert.equal(f.service.snapshot().rules.find(rule => rule.id === "ui-kupon").percentBps, 1000);
  // Derive expiry only for active rules, leaving persisted statuses intact.
  const liveRule = f.service.snapshot().rules.find(rule => rule.id === "ui-kupon");
  f.service.saveRule({ ...liveRule, id: "ui-expired", version: 1, startsAt: f.state.now - 20000, endsAt: f.state.now - 10000 });
  await page.getByRole("button", { name: "Yenile", exact: true }).click();
  await page.getByLabel("Durum filtresi", { exact: true }).selectOption("expired");
  await expect(page.getByRole("region", { name: "Seçili kural" }).getByText("Süresi dolmuş", { exact: true })).toBeVisible();
  await expect(coupon.getByRole("button", { name: "Kod oluştur" })).toBeDisabled();
  assert.equal(f.service.snapshot().rules.find(rule => rule.id === "ui-expired").status, "active");
  await page.getByLabel("Durum filtresi", { exact: true }).selectOption("");
  // Point accounting is a confirmed operation, retained across tabs and replayed with one identity.
  await pointsView.click();
  await page.getByRole("region", { name: "Puan müşterileri" }).getByRole("button", { name: "Fixture müşteri", exact: true }).click();
  await page.getByLabel("Puan tutarı", { exact: true }).fill("2,00");
  await page.getByLabel("İşlem gerekçesi", { exact: true }).fill("Yanıt kaybı tekrarı");
  await page.getByRole("button", { name: "Düzeltmeyi uygula" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Vazgeç", exact: true }).click();
  assert.equal(f.service.pointAccount("c1", "TRY").availableMinor, 1500);
  loseNextAdjustmentReply = true;
  await page.getByRole("button", { name: "Düzeltmeyi uygula" }).click();
  await page.getByRole("button", { name: "İşlemi onayla", exact: true }).evaluate(button => { button.click(); button.click(); });
  await expect(page.getByRole("alert")).toBeVisible();
  assert.equal(f.service.pointAccount("c1", "TRY").availableMinor, 1700);
  await expect(page.getByLabel("Puan tutarı", { exact: true })).toHaveValue("2,00");
  const firstAttempt = requests.filter(request => request.method === "adjustCommercePoints").at(-1).args[0];
  await page.getByRole("button", { name: "Düzeltmeyi uygula" }).click();
  await page.getByRole("button", { name: "İşlemi onayla", exact: true }).evaluate(button => { button.click(); button.click(); });
  await expect(page.getByLabel("Puan tutarı", { exact: true })).toHaveValue("");
  const attempts = requests.filter(request => request.method === "adjustCommercePoints");
  assert.equal(attempts.length, 3, "initial adjustment plus two exact retries, no double submission");
  assert.deepEqual(attempts.at(-1).args[0], firstAttempt);
  assert.equal(f.service.pointAccount("c1", "TRY").availableMinor, 1700);
  assert.equal(f.service.pointAccount("c1", "TRY").entries.length, 2);
  await rulesView.click();
  await families.getByRole("button", { name: "Puan", exact: true }).click();
  await familyPanel.getByRole("button", { name: "Kullanımı kapat", exact: true }).click();
  await pointsView.click();
  await expect(page.getByRole("region", { name: "Puan özeti" }).getByText("₺17,00", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Puan geçmişi" })).toBeVisible();
  await expect(page.getByLabel("Puan tutarı", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Süresi dolan Puanları işle" })).toBeDisabled();
  await rulesView.click();
  await familyPanel.getByRole("button", { name: "Kullanımı aç", exact: true }).click();
  await families.getByRole("button", { name: "Kupon", exact: true }).click();
  await pointsView.click();
  const customersPanel = page.getByRole("region", { name: "Puan müşterileri", exact: true });
  await expect(customersPanel.locator(".list-row")).toHaveCount(30);
  await customersPanel.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(customersPanel.getByRole("button", { name: "Önceki", exact: true })).toBeEnabled();
  await expect(customersPanel.getByRole("button", { name: "Sonraki", exact: true })).toBeDisabled();
  await page.getByLabel("Müşteri ara", { exact: true }).fill("İKİNCİ");
  await expect(customersPanel.locator(".list-row")).toHaveCount(1);
  await expect(customersPanel.getByRole("button", { name: "İkinci müşteri", exact: true })).toBeVisible();
  await page.getByLabel("Puan tutarı", { exact: true }).fill("1,00");
  await customersPanel.getByRole("button", { name: "İkinci müşteri", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Değişiklikler kaydedilmedi");
  await page.getByRole("button", { name: "Düzenlemeye dön", exact: true }).click();
  await expect(page.getByRole("region", { name: "Müşteri Puan hesabı" }).getByRole("heading", { name: "Fixture müşteri", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Hesap seçimi" }).getByLabel("Para birimi", { exact: true }).selectOption("USD");
  await expect(page.getByRole("dialog")).toContainText("Değişiklikler kaydedilmedi");
  await page.getByRole("button", { name: "Düzenlemeye dön", exact: true }).click();
  await expect(page.getByRole("region", { name: "Hesap seçimi" }).getByLabel("Para birimi", { exact: true })).toHaveValue("TRY");
  await page.getByRole("button", { name: "Taslağı temizle", exact: true }).click();
  await page.getByRole("button", { name: "Değişiklikleri bırak", exact: true }).click();
  await page.getByLabel("Müşteri ara", { exact: true }).fill("");
  await expect(customersPanel.locator(".list-row")).toHaveCount(30);
  for (let index = 0; index < 21; index++) f.service.adjustPoints({ customerId: "c1", currency: "TRY", amountMinor: 1, expiresAt: null, reason: "correction", note: "Hareket sayfalaması", operationKey: `history-${index}` });
  await page.getByRole("button", { name: "Hesabı yenile", exact: true }).click();
  const history = page.getByRole("region", { name: "Puan geçmişi", exact: true });
  await expect(history.locator("li")).toHaveCount(20);
  await history.getByRole("button", { name: "Sonraki hareketler", exact: true }).click();
  await expect(history.locator("li")).toHaveCount(3);
  await history.getByRole("button", { name: "Önceki hareketler", exact: true }).click();
  await expect(history.locator("li")).toHaveCount(20);
  await rulesView.click();
  async function captureScheme(scheme) {
    await page.evaluate(async value => {
      if (value) document.documentElement.dataset.colorScheme = value;
      else delete document.documentElement.dataset.colorScheme;
      await new Promise(requestAnimationFrame);
      await Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => {})));
    }, scheme);
  }
  async function noOverflow(locator) {
    assert(await locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1), "horizontal overflow");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "document horizontal overflow");
  }
  async function fillsPage(locator) {
    const body = await page.getByRole("region", { name: "İndirim ve Puan çalışma alanı", exact: true }).boundingBox();
    const surface = await page.locator(".benefits-surface").boundingBox();
    const toolbar = await page.locator(".benefits-surface > .page-toolbar").boundingBox();
    for (const edge of ["x", "y", "width", "height"]) assert(Math.abs(body[edge] - surface[edge]) <= 1, `benefits fills page ${edge}`);
    assert(Math.abs(toolbar.x - body.x) <= 1 && Math.abs(toolbar.y - body.y) <= 1, "toolbar aligns with the page origin");
    const canvas = page.getByRole("region", { name: "İndirim ve Puan çalışma yüzeyi", exact: true });
    const canvasBounds = await canvas.boundingBox();
    assert(Math.abs(canvasBounds.y + canvasBounds.height - body.y - body.height) <= 1, "work surface reaches the page bottom");
    const inner = await canvas.evaluate(element => {
      const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      return { x: bounds.x + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft), y: bounds.y + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop),
        width: element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), height: element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) };
    });
    const bounds = await locator.boundingBox();
    for (const edge of ["x", "y", "width", "height"]) assert(Math.abs(inner[edge] - bounds[edge]) <= 1, `active view fills shared canvas ${edge}`);
    if (page.viewportSize().width === 1920) assert(surface.width > 1280, "wide pages use the available width");
  }
  async function compactRuleForm() {
    const problems = await page.locator(".benefits-rule-column").evaluateAll(columns => {
      const issues = [], tolerance = 1;
      for (const column of columns) {
        const panels = [...column.children], gap = parseFloat(getComputedStyle(column).rowGap);
        for (let index = 1; index < panels.length; index++) {
          const previous = panels[index - 1].getBoundingClientRect(), next = panels[index].getBoundingClientRect();
          if (Math.abs(next.top - previous.bottom - gap) > tolerance) issues.push("extra gap between panels");
        }
      }
      if (innerWidth > 700 && Math.abs(columns[0].getBoundingClientRect().top - columns[1].getBoundingClientRect().top) > tolerance) issues.push("column headings not aligned");
      const dialog = columns[0].closest("dialog");
      for (const field of dialog.querySelectorAll(".form-field")) {
        const control = field.querySelector(":scope > input, :scope > select, :scope > .field-control-group, :scope > .search-select, :scope > .date-time-picker");
        if (control && Math.abs(control.getBoundingClientRect().width - field.getBoundingClientRect().width) > tolerance) issues.push(`field width: ${field.textContent}`);
      }
      for (const grid of dialog.querySelectorAll(".form-grid")) {
        const fields = [...grid.children];
        for (let index = 1; index < fields.length; index++) {
          const a = fields[index - 1].getBoundingClientRect(), b = fields[index].getBoundingClientRect();
          if (b.x > a.right) {
            const controls = [fields[index - 1], fields[index]].map(field => field.querySelector("input,select,.field-control-group,.date-time-picker").getBoundingClientRect());
            if (Math.abs(controls[0].bottom - controls[1].bottom) > tolerance) issues.push("paired controls not aligned");
          }
        }
      }
      return issues;
    });
    assert.deepEqual(problems, [], "compact panels and aligned full-width controls");
  }
  await expect(page.getByRole("region", { name: "Aile durumu", exact: true })).toHaveCount(0);
  for (const [label, title] of [["Kupon", "Kupon kullanımı"], ["Puan", "Puan kullanımı"], ["Ödeme Avantajı", "Ödeme avantajı kullanımı"]]) {
    await families.getByRole("button", { name: label, exact: true }).click();
    await expect(familyPanel.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(familyPanel).toContainText("Kapalıyken bu türdeki kurallar uygulanmaz.");
    await add.click();
    await compactRuleForm();
    if (label === "Puan") {
      await page.getByLabel("Puan işlemi", { exact: true }).selectOption("redeem");
      await expect(page.getByLabel("Kazanç tutarı", { exact: true })).toHaveCount(0);
      await compactRuleForm();
      await page.getByLabel("Puan işlemi", { exact: true }).selectOption("earn");
    }
    if (screenshots) {
      await captureScheme("dark");
      await page.screenshot({ path: `artifacts/commerce-benefits-management/compact-rule-${label === "Kupon" ? "coupon" : label === "Puan" ? "points" : "payment"}.png` });
      await captureScheme(null);
    }
    await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
    if (await page.getByRole("alertdialog").count()) await page.getByRole("button", { name: "Değişiklikleri bırak", exact: true }).click();
  }
  await families.getByRole("button", { name: "Kupon", exact: true }).click();
  const baseRule = f.service.snapshot().rules[0];
  for (let index = 0; index < 30; index++) f.service.saveRule({ ...baseRule, id: `ui-long-rule-${index}`, version: 1 });
  await page.getByRole("button", { name: "Yenile", exact: true }).click();
  await expect(page.locator(".benefits-studio__list .list-row")).toHaveCount(32);
  for (const width of [1920, 1366, 768, 390]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    await noOverflow(page.locator(".benefits-studio"));
    await fillsPage(page.locator(".benefits-studio"));
    if (width >= 1366) {
      const columns = await page.locator(".benefits-studio > *").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().x));
      assert(columns[0] < columns[1] && columns[1] < columns[2], "three distinct desktop columns");
      assert.equal(await page.locator(".benefits-studio__list").evaluate(element => getComputedStyle(element).overflowY), "auto");
      assert(await page.locator(".benefits-studio__list").evaluate(element => element.scrollHeight > element.clientHeight), "long rules list owns its scroll");
      const inspectorBounds = await coupon.boundingBox();
      await page.locator(".benefits-studio__list").evaluate(element => { element.scrollTop = element.scrollHeight; });
      assert.deepEqual(await coupon.boundingBox(), inspectorBounds, "list scrolling preserves the inspector");
    }
    if (screenshots) await page.screenshot({ path: `artifacts/commerce-benefits-management/studio-${width}.png` });
    await add.click();
    await noOverflow(page.getByRole("dialog"));
    await expect(page.getByRole("button", { name: "Kaydet", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Genel bilgiler" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Zaman ve kanallar" })).toBeVisible();
    await compactRuleForm();
    if (screenshots) await page.screenshot({ path: `artifacts/commerce-benefits-management/rule-${width}.png` });
    await page.keyboard.press("Escape"); await expect(add).toBeFocused();
    await pointsView.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await noOverflow(page.locator(".benefits-points-layout"));
    await fillsPage(page.locator(".benefits-points-layout"));
    await page.getByRole("region", { name: "Puan müşterileri" }).getByRole("button", { name: "Fixture müşteri", exact: true }).click();
    await expect(page.getByRole("region", { name: "Puan geçmişi", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Düzeltmeyi uygula" })).toBeVisible();
    if (width >= 1366) {
      const columns = await page.locator(".benefits-points-layout > *").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().x));
      assert(columns[0] < columns[1] && columns[1] < columns[2], "three account columns");
    }
    const noPanelOverlap = await page.locator(".benefits-points-layout").evaluate(element => {
      const groups = [element.querySelector(".benefits-points-account"), element.querySelector(".benefits-points-operations")];
      for (const group of groups) {
        const children = [...group.children].filter(child => child.classList.contains("panel"));
        for (let index = 1; index < children.length; index++) if (children[index].getBoundingClientRect().top < children[index - 1].getBoundingClientRect().bottom - 1) return false;
        if (children.at(-1)?.getBoundingClientRect().bottom > group.getBoundingClientRect().bottom + 1 && getComputedStyle(group).overflowY === "visible") return false;
      }
      if (innerWidth <= 700) {
        const children = [...element.children];
        for (let index = 1; index < children.length; index++) if (children[index].getBoundingClientRect().top < children[index - 1].getBoundingClientRect().bottom - 1) return false;
      }
      return true;
    });
    assert(noPanelOverlap, `account panels must not overlap at ${width}px`);
    await page.getByRole("button", { name: "Süresi dolan Puanları işle" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Süresi dolan Puanları işle" })).toBeInViewport();
    await page.getByRole("button", { name: "Düzeltmeyi uygula" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Düzeltmeyi uygula" })).toBeInViewport();
    if (screenshots) await page.screenshot({ path: `artifacts/commerce-benefits-management/accounts-${width}.png` });
    await rulesView.click();
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  // The customer adjustment's Cancel and navigation paths share the draft guard.
  await pointsView.click();
  await page.getByLabel("Puan tutarı", { exact: true }).fill("2,00");
  await page.getByRole("button", { name: "Taslağı temizle", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Düzenlemeye dön" }).click();
  await expect(page.getByLabel("Puan tutarı", { exact: true })).toHaveValue("2,00");
  await rulesView.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Düzenlemeye dön" }).click();
  await expect(pointsView).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fixture sayfa değiştir" }).evaluate(button => button.click());
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Değişiklikleri bırak", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bugün ne var?", exact: true })).toBeVisible();
  await page.locator('[data-nav-id="benefits"]').click();
  // Exercise independent capability changes in this same running application.
  await page.evaluate(() => window.__setBenefitsCapabilities(false, false));
  await expect(page.locator('[data-nav-id="marketing"]')).toHaveCount(0);
  await expect(page.locator('[data-nav-id="benefits"]')).toHaveCount(0);
  await expect(page.getByRole("region", { name: "İndirim ve Puan yönetimi" })).toHaveCount(0);
  await page.evaluate(() => window.__setBenefitsCapabilities(false, true));
  await expect(page.locator('[data-nav-id="marketing"]')).toHaveText("Pazarlama");
  await expect(page.locator('[data-nav-id="benefits"]')).toHaveCount(0);
  await page.locator('[data-nav-id="marketing"]').click();
  const marketingViews = page.getByRole("navigation", { name: "Pazarlama görünümü" });
  await expect(marketingViews.getByRole("button")).toHaveText(["Çalışma Alanı", "Analitik"]);
  await expect(page.getByRole("navigation", { name: "Pazarlama alanı" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "İndirim ve Puan yönetimi" })).toHaveCount(0);
  await page.evaluate(() => window.__setBenefitsCapabilities(true, true));
  await expect(page.locator('[data-nav-id="marketing"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-nav-id="benefits"]')).toHaveText("İndirim ve Puan");
  await page.locator('[data-nav-id="benefits"]').click();
  await expect(marketingViews).toHaveCount(0);
  await expect(page.getByRole("region", { name: "İndirim ve Puan yönetimi" })).toBeVisible();
  await page.evaluate(() => window.__setBenefitsCapabilities(true, false));
  await expect(page.locator('[data-nav-id="benefits"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-nav-id="marketing"]')).toHaveCount(0);
  await page.evaluate(() => window.__setBenefitsCapabilities(true, true));
  await expect(page.locator('[data-nav-id="benefits"]')).toHaveAttribute("aria-current", "page");
  assert.equal(await page.locator('[data-nav-id="marketing"], [data-nav-id="benefits"]').count(), 2);
  await page.locator('[data-nav-id="marketing"]').click();
  await expect(marketingViews).toBeVisible();
  await page.evaluate(() => window.__setBenefitsCapabilities(true, false));
  await expect(page.getByRole("heading", { name: "Bugün ne var?", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "İndirim ve Puan yönetimi" })).toHaveCount(0);
  // Revocation never substitutes the other feature's page.
  await page.locator('[data-nav-id="benefits"]').click();
  await page.evaluate(() => window.__setBenefitsCapabilities(false, true));
  await expect(page.getByRole("heading", { name: "Bugün ne var?", exact: true })).toBeVisible();
  await expect(marketingViews).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log("PASS benefits V2 UI: independent routes/capabilities; two persistent views; family/rule state, CRUD/expiry, explicit scopes/exclusions/combinations; guarded transitions; confirmed exact point replay, paginated customers/history, phone grants, one-time coupon; 1920/1366/768/390 layouts");
} finally { await browser?.close(); await server.close(); f.close(); }
