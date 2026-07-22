import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const demoBusiness = JSON.parse(readFileSync("apps/demo-web/config/business.json", "utf8")) as { whatsapp: string };
const configuredWhatsAppNumber = demoBusiness.whatsapp.replace(/\D/g, "");

test("demo web ana akışını gösterir", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Deniz Çiçeği Pansiyon & Kafe" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Rezervasyon Talebi Oluştur/ }).first()).toBeVisible();
  const mainNavigation = page.getByRole("navigation", { name: "Ana menü" });
  await expect(mainNavigation.getByRole("button", { name: "Ayarlar", exact: true })).toHaveCount(0);
  await expect(mainNavigation.getByRole("button", { name: "Talep Oluştur", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Odalar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pansiyon / Odalar" })).toBeVisible();
  await expect(page.getByText("Balkonlu Standart Oda")).toBeVisible();

  await page.getByRole("button", { name: "QR Menü", exact: true }).click();
  await expect(page.getByRole("heading", { name: "QR Menü" })).toBeVisible();
  await expect(page.getByText("Serpme Kahvaltı")).toBeVisible();
  await expect(page.locator(".menu-item img").first()).toBeVisible();
});

test("oda ve restoran sayfaları doğru talep türünü açar", async ({ page }) => {
  await page.goto("/#rooms");

  await page.getByRole("button", { name: "Bu Oda İçin Talep Oluştur" }).first().click();
  await expect(page).toHaveURL(/#request$/);
  await expect(page.getByRole("button", { name: "Oda rezervasyonu", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Masa talebi", exact: true })).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Restoran / Kafe", exact: true }).click();
  await page.getByRole("button", { name: "Masa Talebi Oluştur", exact: true }).click();
  await expect(page).toHaveURL(/#request$/);
  await expect(page.getByRole("button", { name: "Masa talebi", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Oda rezervasyonu", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel(/^Saat/)).toBeVisible();
});

test("kurulum sayfası bağlantı bilgilerini ve uygulama dosyalarını sunar", async ({ page }) => {
  await page.goto("/#settings");

  await expect(page.getByRole("heading", { name: "Kurulum", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Ana menü" }).getByRole("button", { name: "Ayarlar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ortak kurulum bilgileri" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yardımcı Asistan nasıl kurulur?" })).toBeVisible();
  await expect(page.getByLabel("Yardımcı Asistan kurulum yolu")).toHaveValue("https://yardimciasistan.alwaysdata.net/yardimci-asistan");
  await expect(page.getByLabel("Web güvenlik anahtarı")).toHaveValue("Canlı demo paketi oluşturulurken eklenir");
  await expect(page.getByText("Windows 10 / 11")).toHaveCount(2);
  await expect(page.getByText("Android 8.0+")).toBeVisible();

  const x64DownloadLink = page.getByRole("link", { name: "Kurulum Dosyasını İndir" });
  await expect(x64DownloadLink).toHaveAttribute("href", /\/downloads\/YardimciAsistan-Setup-\d+\.\d+\.\d+\.exe$/);
  await expect(x64DownloadLink).toHaveAttribute("download", "");

  const x86DownloadLink = page.getByRole("link", { name: "Windows 32 Bit İndir" });
  await expect(x86DownloadLink).toHaveAttribute("href", /\/downloads\/YardimciAsistan-Setup-\d+\.\d+\.\d+-x86\.exe$/);
  await expect(x86DownloadLink).toHaveAttribute("download", "");

  const androidDownloadLink = page.getByRole("link", { name: "Android APK İndir" });
  await expect(androidDownloadLink).toHaveAttribute("href", /\/downloads\/YardimciAsistan-Android-\d+\.\d+\.\d+\.apk$/);
  await expect(androidDownloadLink).toHaveAttribute("download", "");
});

test("footer kurulum sayfasını açar", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Kurulum", exact: true }).click();
  await expect(page).toHaveURL(/#settings$/);
  await expect(page.getByRole("heading", { name: "Kurulum", exact: true })).toBeVisible();
});

test("rezervasyon formu WhatsApp hazır mesajı açar", async ({ page, context }) => {
  await page.route("**/__yardimci_asistan_live/api/request.php", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, request_id: "request_e2e_001" })
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Rezervasyon Talebi Oluştur/ }).first().click();

  await expect(page.getByRole("heading", { name: "Talebinizi birlikte hazırlayalım" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Bugün:/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Yarın:/ })).toBeVisible();

  await page.getByLabel("Ad soyad").fill("Demo Misafir");
  await page.getByLabel("Telefon").fill("0532 123 45 67");
  await page.getByLabel("Tarih seç").fill("2030-07-12");
  await page.getByRole("spinbutton", { name: "Kişi sayısı", exact: true }).fill("3");
  await page.getByLabel(/Kısa not/).fill("Balkonlu oda için bilgi rica ederim.");

  const pagePromise = context.waitForEvent("page");
  await page.getByRole("button", { name: /WhatsApp'ta Aç/ }).click();
  const whatsappPage = await pagePromise;
  const whatsappUrl = whatsappPage.url();
  const readableWhatsappUrl = decodeURIComponent(whatsappUrl).replace(/\+/g, " ");

  await expect(page.getByText("Talep web modülüne kaydedildi: request_e2e_001")).toBeVisible();
  await expect(page.getByText("Lütfen bilgileri kontrol edip gönder tuşuna basın.")).toBeVisible();
  expect(
    whatsappUrl.includes(`wa.me/${configuredWhatsAppNumber}`) || whatsappUrl.includes(`phone=${configuredWhatsAppNumber}`)
  ).toBe(true);
  expect(readableWhatsappUrl).toContain("Demo Misafir");
  expect(readableWhatsappUrl).toContain("12 Temmuz 2030");
  expect(readableWhatsappUrl).not.toContain("2030-07-12");
});
