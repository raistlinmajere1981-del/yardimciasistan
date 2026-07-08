import { expect, test } from "@playwright/test";

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

test("rezervasyon formu WhatsApp hazır mesajı açar", async ({ page, context }) => {
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

  await expect(page.getByText("WhatsApp mesajı hazırlandı. Web modül bağlantısı bu demo oturumunda kapalı.")).toBeVisible();
  await expect(page.getByText("Lütfen bilgileri kontrol edip gönder tuşuna basın.")).toBeVisible();
  expect(whatsappUrl).toMatch(/(wa\.me\/905321234567|api\.whatsapp\.com\/send\/\?phone=905321234567)/);
  expect(readableWhatsappUrl).toContain("Demo Misafir");
});
