import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { expandSettingsStructure, openSettingsService, cancelSettingsService } from "./test-helpers/settings-ui.mjs";

const server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
  server: { port: 0, strictPort: false }, logLevel: "error" });
let browser;
try {
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, locale: "tr-TR" });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [url, fixture] of [["service-tiles-test", "settings-platform"], ["modal-nexa-test", "modal-nexa"]]) {
    await page.route(`**/${url}*`, async route => route.fulfill({ contentType: "text/html",
      body: await server.transformIndexHtml(`/${url}`, `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve(`scripts/fixtures/${fixture}.tsx`)}"></script></body></html>`) }));
  }
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.abort());
  await page.goto(`${server.resolvedUrls.local[0]}service-tiles-test?profile=market&webVisibility=on`);
  await expandSettingsStructure(page);
  const tile = id => page.locator(`#settings-${id}`);
  const dialog = page.locator(".settings-service-overlay");
  for (const id of ["translation", "dictation", "whatsapp"]) {
    await expect(tile(id)).toBeDisabled();
    await expect(tile(id).locator(".settings-service-indicator")).toHaveAttribute("data-state", "blocked");
    await tile(id).evaluate(node => node.click());
    await tile(id).evaluate(node => node.focus());
    await expect(tile(id)).not.toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
  }
  await expect(tile("translation")).toContainText("AI Yardımcı kapalı");
  await expect(tile("whatsapp")).toContainText("WhatsApp numarası eksik");
  // Search cannot bypass the shared launcher's external prerequisite gate.
  const search = page.getByRole("searchbox", { name: "Ayarlarda ara" });
  await search.fill("Çoklu Dil");
  await page.locator(".settings-search-results").getByRole("button", { name: "Çoklu Dil", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await search.fill("");
  // Local TTS and self-configured providers remain available while AI is off.
  await openSettingsService(page, "settings-speech");
  await expect(dialog.getByRole("switch")).toBeEnabled();
  await cancelSettingsService(page);
  await openSettingsService(page, "settings-whatsapp-business");
  await expect(dialog.getByRole("switch")).toBeDisabled();
  for (const [label, value] of [["WABA ID", "123"], ["Phone Number ID", "456"], ["Access Token", "fixture-token"]]) {
    await expect(dialog.getByLabel(label, { exact: true })).toBeEnabled();
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  await expect(dialog.getByRole("switch")).toBeEnabled();
  await expect(dialog.getByRole("switch")).not.toBeChecked();
  await cancelSettingsService(page);
  assert.equal(await page.evaluate(() => window.settingsCalls.some(call => call.kind === "setup" || /-test$/.test(call.kind))), false);
  await page.evaluate(() => window.refreshSettings({ aiEnabled: true, aiModel: "", aiSttModel: "", aiApiKeyConfigured: false }));
  await expect(tile("translation")).toContainText("AI modeli/bağlantısı eksik");
  await expect(tile("dictation")).toContainText("AI modeli/bağlantısı eksik");
  await page.evaluate(() => window.refreshSettings({ aiModel: "gpt-4.1", aiSttModel: "whisper-1", aiApiKeyConfigured: true, whatsapp: "+44 20 1234 5678" }));
  await expect(tile("translation")).toBeEnabled();
  await expect(tile("dictation")).toBeEnabled();
  await expect(tile("whatsapp")).toBeEnabled();
  await openSettingsService(page, "settings-dictation");
  await expect(dialog.getByRole("switch")).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "STT Bağlantısını Dene" })).toBeEnabled();
  await cancelSettingsService(page);
  const original = await page.evaluate(() => window.persistedSettings().servicePreferences.whatsapp);
  await tile("whatsapp").click();
  await expect(dialog.getByRole("switch")).toBeChecked({ checked: original });
  await dialog.getByRole("switch").setChecked(!original);
  await expect(tile("whatsapp").locator(".settings-service-indicator")).toHaveAttribute("data-state", original ? "active" : "inactive");
  await expect(tile("whatsapp").locator(".settings-service-indicator")).toHaveAttribute("aria-label", /Bekliyor/);
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("alertdialog")).toBeVisible();
  await cancelSettingsService(page);
  await expect(tile("whatsapp")).toBeFocused();
  for (const [width, height] of [[1920, 1080], [1366, 768]]) {
    await page.setViewportSize({ width, height });
    const layoutFailures = await page.locator(".settings-services-grid").evaluate(grid => [...grid.querySelectorAll(".settings-service-row")].filter(node => {
      const rect = node.getBoundingClientRect();
      return !(rect.width > 0 && rect.height <= 64 && node.tagName === "BUTTON" && !node.querySelector("button,input")
        && node.scrollWidth <= node.clientWidth + 1);
    }).map(node => ({id:node.id, tag:node.tagName, height:node.getBoundingClientRect().height, scroll:node.scrollWidth, client:node.clientWidth})));
    assert.deepEqual(layoutFailures, [], `${width}px compact accessible tiles`);
  }

  // Actual native dialog and actual animated habitat, including responsive sizes.
  await page.goto(`${server.resolvedUrls.local[0]}modal-nexa-test`);
  const modal = page.getByRole("dialog", { name: "Nexa test penceresi" });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator(".nexa-habitat--wide .nexa-character")).toBeVisible();
  await page.evaluate(() => window.nexaFixture.appearance(1, "dark"));
  await page.locator("#open-modal").click();
  await expect(modal).toBeVisible();
  const polygon = () => modal.evaluate(node => getComputedStyle(node, "::backdrop").clipPath);
  await expect.poll(polygon).toMatch(/^polygon\(evenodd,/);
  const withoutSpeech = await polygon();
  await page.evaluate(() => window.nexaFixture.speech(true));
  await expect(page.locator(".nexa-habitat-speech")).toBeVisible();
  await expect.poll(polygon).not.toBe(withoutSpeech);
  const assertHoles = async count => {
    const result = await modal.evaluate(node => {
      const clip = getComputedStyle(node, "::backdrop").clipPath;
      const points = clip.slice(clip.indexOf(",") + 1, -1).split(",").map(point => point.trim());
      return { clip, starts: points.filter(point => point === points[0]).length };
    });
    assert.equal(result.starts, count + 2, `independent holes: ${result.clip}`);
  };
  await assertHoles(2);
  // Paint assertions use a screenshot read by the browser's own PNG decoder.
  // Normalize artwork paint to the panel color so points compare only backdrop coverage.
  await page.addStyleTag({ content: "#desktop-sidebar { background: white !important; } .nexa-character, .nexa-habitat-speech { background: white !important; } .nexa-character > *, .nexa-habitat-speech > * { visibility: hidden; }" });
  const screenshot = await page.screenshot();
  const brightness = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const character = rect(".nexa-character"), speech = rect(".nexa-habitat-speech"), habitat = rect(".nexa-habitat");
    const sample = (x, y) => ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data[0];
    return { artwork: sample(character.x + character.width / 2, character.y + character.height / 2),
      bubble: sample(speech.x + 3, speech.y + speech.height / 2), margin: sample(habitat.x + 3, character.y + character.height / 2),
      gap: sample(character.x + character.width / 2, (character.top + speech.bottom + 8) / 2) };
  }, screenshot.toString("base64"));
  assert.ok(brightness.artwork > 245 && brightness.bubble > 245, JSON.stringify(brightness));
  assert.ok(brightness.margin < 230 && brightness.gap < 230, JSON.stringify(brightness));
  await page.keyboard.press("Tab");
  assert.equal(await modal.evaluate(node => node.contains(document.activeElement)), true);
  await page.evaluate(() => window.nexaFixture.speech(false));
  await expect.poll(polygon).toBe(withoutSpeech);
  await assertHoles(1);
  // Put a control directly behind the artwork's visual hole. Native modality
  // must keep it inert even where the backdrop paints transparent pixels.
  const cutout = await page.evaluate(() => {
    const bounds = document.querySelector(".nexa-character").getBoundingClientRect();
    const button = document.createElement("button");
    button.textContent = "Arka plan hedefi";
    Object.assign(button.style, { position: "fixed", left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
    button.onclick = () => { document.querySelector("#click-count").textContent = "1"; };
    document.body.append(button);
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  });
  await page.mouse.click(cutout.x, cutout.y);
  await expect(page.locator("#click-count")).toHaveText("0");
  if (!await modal.count()) await page.locator("#open-modal").click();
  await page.evaluate(() => window.nexaFixture.appearance(1.25, "light"));
  await expect.poll(polygon).not.toBe(withoutSpeech);
  await assertHoles(1);
  await page.evaluate(() => window.nexaFixture.collapsed(true));
  await expect(page.locator(".nexa-habitat--micro .nexa-character")).toBeVisible();
  await assertHoles(1);
  await page.evaluate(() => { window.nexaFixture.appearance(1, "dark"); window.nexaFixture.collapsed(false); });
  await page.setViewportSize({ width: 1366, height: 330 });
  await expect(page.locator(".nexa-habitat--compact .nexa-character")).toBeVisible();
  await assertHoles(1);
  // A cutout changes paint, never background activation.
  const nav = await page.locator(".sidebar-primary-nav button").first().boundingBox();
  await page.mouse.click(nav.x + nav.width / 2, nav.y + nav.height / 2);
  await expect(page.locator("#click-count")).toHaveText("0");
  if (await modal.count()) await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  assert.equal(await page.evaluate(() => document.querySelector("[style*='--nexa-backdrop']") !== null), false);
  assert.deepEqual(errors, []);
  console.log("service-tiles-ui-ok: disabled click/keyboard/search, dependencies, TTS, Business setup, saved/draft, responsive tiles, native Nexa holes/paint/zoom/cleanup");
} finally {
  await browser?.close();
  await server.close();
}
