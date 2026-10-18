import { openSettingsService, cancelSettingsService, saveSettingsService } from "./test-helpers/settings-ui.mjs";
import assert from "node:assert/strict";
import { installSpeechMock, localTtsVoice as local } from "./test-helpers/tts-fixtures.mjs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

// Only Web Speech and the sound device are mocked. Preferences, adapter, camera
// feedback and service close guards execute their real renderer code.

const voices = [local("tr-one", "Türkçe Bir", "tr-TR"), local("en-one", "English One", "en-US", true), local("tr-two", "Türkçe İki", "tr-TR")];
const server = await createServer({
  root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
  logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: false }
});
await server.listen();
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
  await context.addInitScript(installSpeechMock);
  const errors = [];
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  await context.route("**/tts-settings-test*", async route => route.fulfill({
    contentType: "text/html",
    body: await server.transformIndexHtml("/tts-settings-test",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/settings-platform.tsx")}"></script></body></html>`)
  }));
  await context.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.abort());
  const ui = await context.newPage();
  ui.setDefaultTimeout(8000);
  await ui.goto(`${server.resolvedUrls.local[0]}tts-settings-test?profile=market`);
  const openSpeech = () => openSettingsService(ui, "settings-speech");
  const panel = ui.locator(".settings-service-overlay");
  const save = () => saveSettingsService(ui);
  await openSpeech();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Yerel ses yok");
  await expect(panel.getByLabel("Canlı kontrol durumu")).toHaveText("Kullanılamıyor");
  await expect(panel.getByRole("button", { name: "Sesi Dene", exact: true })).toBeDisabled();
  await ui.evaluate(voices => window.__ttsVoices(voices), voices);
  await expect(panel).toContainText("3 yerel ses");
  await expect(panel.getByRole("slider", { name: "Konuşma tonu" })).toHaveCount(0);
  await expect(panel.getByText("Sistem / Yerel", { exact: true })).toBeVisible();
  await panel.getByRole("combobox", { name: "Konuşma dili" }).selectOption("tr-TR");
  const secondVoice = await panel.getByRole("combobox", { name: "Konuşma sesi" }).locator("option").filter({ hasText: "Türkçe İki" }).getAttribute("value");
  await panel.getByRole("combobox", { name: "Konuşma sesi" }).selectOption(secondVoice);
  const slider = async (name, value) => panel.getByRole("slider", { name: new RegExp(name) }).evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await slider("Konuşma hızı", 1.3);
  await slider("Ses düzeyi", 37);
  await expect(ui.locator("#settings-speech").getByRole("img")).toHaveAttribute("aria-label", /Bekliyor/);
  assert.equal(await ui.evaluate(() => localStorage.getItem("yardimci-asistan.desktop-tts")), null);
  await panel.getByRole("button", { name: "Sesi Dene", exact: true }).click();
  await expect(ui.getByText("Ses denemesi tamamlandı.", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("Canlı kontrol durumu")).toHaveText("Hazır");
  assert.deepEqual(await ui.evaluate(() => {
    const spoken = window.__ttsMock.spoken.at(-1);
    return { text: spoken.text, voice: spoken.voice.name, rate: spoken.rate, volume: spoken.volume };
  }), { text: "Yardımcı Asistan. Ses denemesi.", voice: "Türkçe İki", rate: 1.3, volume: 0.37 });
  assert.equal(await ui.evaluate(() => localStorage.getItem("yardimci-asistan.desktop-tts")), null);
  await ui.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await save();
  await expect(ui.locator("#settings-speech").getByRole("img")).not.toHaveAttribute("aria-label", /Bekliyor/);
  assert.equal(await ui.evaluate(() => window.settingsCalls.filter(call => call.kind === "setup").length), 0, "Device TTS save must not rewrite business Setup");
  const saved = await ui.evaluate(() => JSON.parse(localStorage.getItem("yardimci-asistan.desktop-tts")));
  assert.equal(saved.voiceId, secondVoice);
  assert.equal(saved.rate, 1.3);
  assert.equal(saved.volume, 37);

  await ui.reload();
  await ui.evaluate(voices => window.__ttsVoices(voices), voices);
  await openSpeech();
  await expect(panel.getByRole("combobox", { name: "Konuşma sesi" })).toHaveValue(secondVoice);
  await expect(panel.getByRole("slider", { name: /Konuşma hızı/ })).toHaveValue("1.3");
  await expect(panel.getByRole("slider", { name: /Ses düzeyi/ })).toHaveValue("37");
  await slider("Ses düzeyi", 55);
  await ui.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await cancelSettingsService(ui);
  await openSpeech();
  await expect(panel.getByRole("slider", { name: /Ses düzeyi/ })).toHaveValue("37");
  await ui.evaluate(voices => window.__ttsVoices(voices.slice(0, 2)), voices);
  await expect(panel).toContainText("Kayıtlı ses bulunamadı");
  await panel.getByRole("button", { name: "Sesi Dene", exact: true }).click();
  await expect(ui.getByText("Ses denemesi tamamlandı.", { exact: true })).toBeVisible();
  assert.equal(await ui.evaluate(() => window.__ttsMock.spoken.at(-1).voice.name), "Türkçe Bir");
  assert.equal(await ui.evaluate(() => JSON.parse(localStorage.getItem("yardimci-asistan.desktop-tts")).voiceId), secondVoice);

  await ui.evaluate(() => { window.__ttsMock.mode = "never-start"; });
  await panel.getByRole("button", { name: "Sesi Dene", exact: true }).click();
  await expect(ui.getByText(/Konuşma başlatılamadı/)).toBeVisible();
  await panel.getByRole("button", { name: "Sesi Dene", exact: true }).click();
  await panel.getByRole("button", { name: "Sesi Durdur", exact: true }).click();
  await expect(ui.getByText("Ses denemesi durduruldu.", { exact: true })).toBeVisible();

  // Storage failure keeps the dirty category and blocks Save-and-continue.
  await slider("Ses düzeyi", 60);
  await ui.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "yardimci-asistan.desktop-tts") throw new Error("Storage blocked");
      return window.__setItem.call(this, key, value);
    };
  });
  await ui.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await save();
  await expect(panel).toBeVisible();
  await expect(ui.getByText(/saklanamadı/)).toBeVisible();
  await ui.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
  await save();
  await expect(panel).toHaveCount(0);
  await openSpeech();
  await expect(panel.getByRole("slider", { name: /Ses düzeyi/ })).toHaveValue("60");

  // Existing camera prompts use committed settings and preserve signal patterns.
  const camera = await ui.evaluate(async () => {
    const { announceIdentityCamera } = await import("/src/app/identity-camera-feedback.ts");
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    window.__ttsMock.mode = "complete";
    announceIdentityCamera("Kimliği çevirin.", "prompt");
    await delay(100);
    const applied = window.__ttsMock.spoken.at(-1);
    const noBeepOnSpeech = window.__ttsMock.beeps.length;
    window.__ttsVoices([]);
    announceIdentityCamera("Kimlik analizi tamamlanamadı.", "error");
    await delay(20);
    const errorBeep = [...window.__ttsMock.beeps];
    window.__ttsMock.beeps = [];
    window.__ttsVoices([{ voiceURI: "tr", name: "Türkçe", lang: "tr-TR", localService: true, default: true }]);
    window.__ttsMock.mode = "never-start";
    announceIdentityCamera("İşlem tamam.", "success");
    await delay(600);
    const timeoutBeep = [...window.__ttsMock.beeps];
    window.__ttsMock.beeps = [];
    window.__ttsMock.mode = "error-after";
    announceIdentityCamera("Kimlik analizi tamamlanamadı.", "error");
    await delay(120);
    const synthesisErrorBeep = [...window.__ttsMock.beeps];
    window.__ttsMock.beeps = [];
    window.__ttsMock.mode = "never-start";
    announceIdentityCamera("Sabit tutun.", "ready");
    window.__ttsMock.mode = "complete";
    announceIdentityCamera("İşlem tamam.", "success");
    await delay(600);
    return {
      applied: { rate: applied.rate, volume: applied.volume, voice: applied.voice.name },
      noBeepOnSpeech, errorBeep, timeoutBeep, synthesisErrorBeep,
      cancelledBeep: window.__ttsMock.beeps, gains: window.__ttsMock.gains
    };
  });
  assert.deepEqual(camera.applied, { rate: 1.3, volume: 0.6, voice: "Türkçe Bir" });
  assert.equal(camera.noBeepOnSpeech, 0);
  assert.deepEqual(camera.errorBeep, [300, 220]);
  assert.deepEqual(camera.timeoutBeep, [660, 840]);
  assert.deepEqual(camera.synthesisErrorBeep, [300, 220]);
  assert.deepEqual(camera.cancelledBeep, []);
  assert.ok(camera.gains.includes(0.14) && camera.gains.includes(0.22));
  await panel.getByRole("switch", { name: "Seslendirme etkin", exact: true }).uncheck();
  await expect(panel.getByRole("combobox", { name: "Konuşma sesi" })).toBeVisible();
  await save();
  const disabledCamera = await ui.evaluate(async () => {
    const { announceIdentityCamera } = await import("/src/app/identity-camera-feedback.ts");
    window.__ttsMock.beeps = [];
    const spoken = window.__ttsMock.spoken.length;
    announceIdentityCamera("İşlem tamam.", "success");
    await new Promise(resolve => setTimeout(resolve, 20));
    return { beeps: window.__ttsMock.beeps, spoken: window.__ttsMock.spoken.length - spoken,
      preferences: JSON.parse(localStorage.getItem("yardimci-asistan.desktop-tts")) };
  });
  assert.equal(disabledCamera.spoken, 0); assert.deepEqual(disabledCamera.beeps, [660, 840]);
  assert.equal(disabledCamera.preferences.voiceId, secondVoice); assert.equal(disabledCamera.preferences.volume, 60);
  assert.deepEqual(errors, []);
  console.log("desktop-tts-ui-smoke-ok: preview, persistence/reload, category guards, missing voices, camera signals");
} finally {
  await browser?.close();
  await server.close();
}
