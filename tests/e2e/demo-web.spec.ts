import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const demoBusiness = JSON.parse(readFileSync("apps/demo-web/config/business.json", "utf8")) as { whatsapp: string };
const configuredWhatsAppNumber = demoBusiness.whatsapp.replace(/\D/g, "");

test("demo web ana akışını gösterir", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Deniz Çiçeği Pansiyon & Kafe" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Rezervasyon Talebi Oluştur/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "Odalar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pansiyon / Odalar" })).toBeVisible();
  await expect(page.getByText("Balkonlu Standart Oda")).toBeVisible();

  await page.getByRole("button", { name: "QR Menü", exact: true }).click();
  await expect(page.getByRole("heading", { name: "QR Menü" })).toBeVisible();
  await expect(page.getByText("Serpme Kahvaltı")).toBeVisible();
});

test("ayarlar sayfası Windows kurulum dosyasını sunar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Ayarlar" })).toBeVisible();
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

  await expect(page.getByRole("heading", { name: "Rezervasyon / Bilgi Al" })).toBeVisible();

  await page.getByLabel("Ad soyad").fill("Demo Misafir");
  await page.getByLabel("Telefon").fill("0532 123 45 67");
  await page.getByLabel("Tarih").fill("2026-07-12");
  await page.getByLabel("Kişi sayısı").fill("3");
  await page.getByLabel("Not").fill("Balkonlu oda için bilgi rica ederim.");

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
});
