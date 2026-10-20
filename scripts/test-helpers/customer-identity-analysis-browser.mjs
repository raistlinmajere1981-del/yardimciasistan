import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { resolve } from "node:path";

const fields = {
  full_name: "AI Müşteri", identity_type: "tc_identity_card", identity_number: "11111111111",
  nationality: "TR", birth_date: "1990-01-02", gender: "female", document_serial_number: "AI-123",
  document_expiry_date: "2035-01-02", birth_place: "Ankara", mother_name: "AI Anne", father_name: "AI Baba",
  issuing_authority: "AI Kurum", address: "AI Adres"
};
const success = overrides => ({ ok: true, message: "Okundu.", analysis: {
  document_type: "tc_identity_card", document_side: "front", confidence: "high",
  fields: { ...fields, ...overrides }, warnings: []
} });

/** Exercises the production editors with controllable, genuinely pending AI promises. */
export async function checkCustomerIdentityAnalysis(browser, server) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(30000);
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();
    HTMLVideoElement.prototype.play = async function () {};
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 720 });
    window.pendingIdentityCaptures = [];
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      const finish = () => callback(new Blob([new Uint8Array([255, 216, 255, 1])], { type: "image/jpeg" }));
      if (window.deferIdentityCapture) window.pendingIdentityCaptures.push(finish);
      else finish();
    };
  });
  await page.route("**/customer-identity-test*", async route => route.fulfill({
    contentType: "text/html",
    body: await server.transformIndexHtml("/customer-identity-test",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/customer-identity-analysis.tsx")}"></script></body></html>`)
  }));
  const flush = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const count = () => page.evaluate(() => window.customerIdentity.requests.length);
  const start = async name => {
    const index = await count();
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "image/jpeg", buffer: Buffer.from([255, 216, 255, 1]) });
    await expect.poll(count).toBe(index + 1);
    return index;
  };
  const settle = async (index, result) => {
    await page.evaluate(({ index, result }) => window.customerIdentity.requests[index].resolve(result), { index, result });
    await flush();
  };
  const open = async (mode = "create") => {
    await page.goto(`${server.resolvedUrls.local[0]}customer-identity-test?mode=${mode}`);
    if (mode === "workspace") await page.evaluate(() => window.customerIdentity.openCustomer("customer-a"));
    else await page.getByRole("button", { name: "Müşteri formunu aç" }).click();
    await expect(page.getByLabel("Telefon", { exact: true })).toBeVisible();
  };
  const analysisStatus = page.locator(".customer-identity-quick-actions .form-status");
  const globalStatus = page.getByTestId("identity-global-status");
  try {
    await open();
    let request = await start("preserve.jpg");
    await page.getByLabel("Telefon", { exact: true }).fill("+905551234567");
    await page.getByLabel("Not", { exact: true }).fill("Analiz beklerken girilen not");
    await page.getByLabel("Kimlik / pasaport no", { exact: true }).fill("ELLE-123");
    // Editing then clearing an initially empty field still reserves it for the user.
    await page.getByLabel("Uyruk", { exact: true }).fill("Elle girildi");
    await page.getByLabel("Uyruk", { exact: true }).fill("");
    await settle(request, success());
    await expect(page.getByLabel("Telefon", { exact: true })).toHaveValue("+905551234567");
    await expect(page.getByLabel("Not", { exact: true })).toHaveValue("Analiz beklerken girilen not");
    await expect(page.getByLabel("Kimlik / pasaport no", { exact: true })).toHaveValue("ELLE-123");
    await expect(page.getByLabel("Uyruk", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("AI Müşteri");
    await expect(analysisStatus).toHaveClass(/sync-success/);

    await open();
    request = await start("closed.jpg");
    await expect(page.getByRole("button", { name: "Çalışma alanını kapat", exact: true })).toBeDisabled();
    // An external owner teardown still invalidates a pending response.
    await page.evaluate(() => window.customerIdentity.closeEditor());
    await page.getByRole("button", { name: "Müşteri formunu aç" }).click();
    await page.getByLabel("Ad soyad", { exact: true }).fill("Yeni müşteri");
    await settle(request, success());
    await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("Yeni müşteri");
    await expect(page.getByLabel("Kimlik / pasaport no", { exact: true })).toHaveValue("");
    await expect(analysisStatus).toHaveCount(0);

    for (const mode of ["create", "quick-create"]) {
      await open(mode);
      await page.getByLabel("Ad soyad", { exact: true }).fill("Kaydedilen müşteri");
      request = await start(`${mode}-continue.jpg`);
      await expect(page.getByRole("button", { name: "Kaydet ve Yeni Ekle", exact: true })).toBeDisabled();
      await settle(request, success({ full_name: "Kaydedilen müşteri" }));
      await page.getByRole("button", { name: "Kaydet ve Yeni Ekle", exact: true }).click();
      await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("");
      const next = await start(`${mode}-next.jpg`);
      await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("");
      await expect(analysisStatus).toHaveClass(/sync-loading/);
      await expect(globalStatus).toHaveText(/^loading:/);
      await settle(next, success({ full_name: "Sonraki müşteri" }));
      await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("Sonraki müşteri");
      assert.equal(await page.evaluate(() => window.customerIdentity.saves[0].fullName), "Kaydedilen müşteri");
    }

    // Both stale success and stale error must leave the newer request's state alone.
    for (const result of [success({ full_name: "Eski yanıt" }), { ok: false, code: "analysis_timeout", message: "Eski timeout" }]) {
      await open();
      const first = await start("first.jpg"), second = await start("second.jpg");
      await settle(first, result);
      await expect(analysisStatus).toHaveClass(/sync-loading/);
      await expect(globalStatus).toHaveText(/^loading:/);
      await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("");
      await settle(second, success({ full_name: "Güncel yanıt" }));
      await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("Güncel yanıt");
      await expect(analysisStatus).toHaveClass(/sync-success/);
    }

    await open("workspace");
    request = await start("discard.jpg");
    await page.getByLabel("Not", { exact: true }).fill("Geri alınacak not");
    await expect(page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true })).toBeDisabled();
    await settle(request, success());
    await page.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true }).click();
    await flush();
    await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("customer-a");
    await expect(page.getByLabel("Not", { exact: true })).toHaveValue("");
    await expect(analysisStatus).toHaveCount(0);
    request = await start("replacement.jpg");
    await page.evaluate(() => window.customerIdentity.openCustomer("customer-b"));
    await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("customer-b");
    await settle(request, success());
    await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("customer-b");
    await expect(analysisStatus).toHaveCount(0);

    await open();
    const obsolete = await start("late-error.jpg"), latest = await start("latest-success.jpg");
    await settle(latest, success({ full_name: "Son başarılı analiz" }));
    await page.evaluate(index => window.customerIdentity.requests[index].reject(new Error("Old rejected request")), obsolete);
    await flush();
    await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("Son başarılı analiz");
    await expect(analysisStatus).toHaveClass(/sync-success/);
    await expect(globalStatus).toHaveText(/^success:/);

    // A pending camera frame can invoke a retained callback after the editor unmounts.
    await open("quick-create");
    await page.evaluate(() => { window.deferIdentityCapture = true; });
    await page.getByRole("button", { name: "Kimliği kameradan tara", exact: true }).click();
    await page.getByRole("button", { name: "Fotoğraf çek", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.pendingIdentityCaptures.length)).toBe(1);
    await page.evaluate(() => window.customerIdentity.closeEditor());
    await page.getByRole("button", { name: "Müşteri formunu aç" }).click();
    request = await start("after-camera-close.jpg");
    await page.evaluate(() => window.pendingIdentityCaptures.shift()());
    await flush();
    assert.equal(await count(), 1, "The unmounted camera callback must not start a new AI request");
    await expect(analysisStatus).toHaveClass(/sync-loading/);
    await settle(request, success({ full_name: "Yeni form" }));
    await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("Yeni form");

    // Real camera -> CustomerFormFields integration: front/back apply only together.
    await open();
    await page.getByLabel("Ön/arka", { exact: true }).check();
    await page.getByRole("button", { name: "Kimliği kameradan tara", exact: true }).click();
    const camera = page.getByRole("dialog", { name: "Kimliği kameradan tara", exact: true });
    await camera.getByRole("button", { name: "Fotoğraf çek", exact: true }).click();
    await expect(camera.getByText("Kimliğin arka yüzü", { exact: true })).toBeVisible();
    await camera.getByRole("button", { name: "Fotoğraf çek", exact: true }).click();
    await expect.poll(count).toBe(1);
    await settle(0, success({ full_name: "İki yüzlü kimlik", address: "" }));
    await expect.poll(count).toBe(2);
    await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("");
    await settle(1, success({ full_name: "", address: "Arka yüz adresi" }));
    await expect(camera).toHaveCount(0);
    await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("İki yüzlü kimlik");
    await expect(page.getByLabel("Adres", { exact: true })).toHaveValue("Arka yüz adresi");

    await open();
    for (const failure of [
      { ok: false, code: "analysis_timeout", message: "Fixture timeout" },
      { ok: false, code: "provider_authentication_failed", message: "Fixture authentication" }
    ]) {
      request = await start("failure.jpg");
      await settle(request, failure);
      await expect(analysisStatus).toHaveClass(/sync-error/);
      await expect(page.getByRole("button", { name: "Dosyadan AI ile Doldur", exact: true })).toBeEnabled();
      const failedCount = await count();
      await page.waitForTimeout(650);
      assert.equal(await count(), failedCount, "Failure must not restart analysis automatically");
    }
    request = await start("rejected.jpg");
    await page.evaluate(index => window.customerIdentity.requests[index].reject(new Error("Fixture rejection")), request);
    await expect(analysisStatus).toHaveClass(/sync-error/);
    request = await start("recovered.jpg");
    await settle(request, success());
    await expect(analysisStatus).toHaveClass(/sync-success/);
    for (const [label, value] of [["Ad soyad", "AI Müşteri"], ["Kimlik / pasaport no", "11111111111"], ["Uyruk", "TR"], ["Seri / belge no", "AI-123"], ["Doğum yeri", "Ankara"], ["Anne adı", "AI Anne"], ["Baba adı", "AI Baba"], ["Veren makam", "AI Kurum"], ["Adres", "AI Adres"]]) {
      await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
    }
    await expect(page.getByRole("combobox", { name: "Belge türü", exact: true })).toHaveValue("tc_identity_card");
    await expect(page.getByRole("combobox", { name: "Cinsiyet", exact: true })).toHaveValue("female");
    await expect(page.getByRole("button", { name: "Doğum tarihi", exact: true })).toHaveAttribute("data-picker-value", "1990-01-02");
    await expect(page.getByRole("button", { name: "Son geçerlilik", exact: true })).toHaveAttribute("data-picker-value", "2035-01-02");
    assert.deepEqual(errors, [], "Unexpected customer identity renderer errors");
    console.log("customer-identity-analysis-ok: edits, lifetime/reset, overlapping requests and error recovery");
  } finally {
    await page.close();
  }
}
