import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";

// Optional relocation check used by the existing Settings/Gallery browser checks.
// The baseline is captured from this working tree before moving CSS, never from HEAD.
export async function verifySettingsStyleParity(page, name) {
  if (!process.env.SETTINGS_CSS_BASELINE) return;
  if (process.env.SETTINGS_CSS_PARITY_MATCH && !new RegExp(process.env.SETTINGS_CSS_PARITY_MATCH).test(name)) return;
  const baseline = readFileSync(process.env.SETTINGS_CSS_BASELINE, "utf8");
  const sheet = page.locator('style[data-vite-dev-id$="/src/styles/index.css"]');
  assert.equal(await sheet.count(), 1, "one application CSS entry");
  const current = await sheet.textContent();
  const freeze = await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  const settle = () => page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const screenshot = async () => {
    let previous = await page.screenshot({ animations: "disabled", caret: "hide" });
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await page.screenshot({ animations: "disabled", caret: "hide" });
      if (current.equals(previous)) return current;
      previous = current;
    }
    assert.fail(`${name}: viewport did not produce two stable screenshots`);
  };
  const snapshot = slot => sheet.evaluate(async (sheetNode, slot) => {
    const styles = (node, pseudo) => {
      const style = getComputedStyle(node, pseudo);
      return Object.fromEntries([...style].filter(key => !key.startsWith("--")).map(key => [key, style.getPropertyValue(key)]));
    };
    const nodes = [...document.querySelectorAll("body *")].filter(node => node.getClientRects().length).map(node => {
      const rect = node.getBoundingClientRect();
      return { tag: node.tagName, classes: node.getAttribute("class"), rect: [rect.x,rect.y,rect.width,rect.height].map(n => Math.round(n*1000)/1000),
        styles: styles(node), before: styles(node, "::before"), after: styles(node, "::after") };
    });
    sheetNode.__paritySnapshots ??= {};
    sheetNode.__paritySnapshots[slot] = nodes;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(nodes)));
    return { count: nodes.length, hash: [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("") };
  }, slot);
  const output = resolve(process.env.SETTINGS_CSS_PARITY_DIR || "artifacts/desktop-architecture/style-parity");
  mkdirSync(output, { recursive: true });
  const id = name.replace(/[^a-z0-9-]/gi, "_");
  try {
    // Both captures follow a stylesheet replacement so Chromium uses the same paint path.
    await sheet.evaluate((node, value) => { node.textContent = value; }, current);
    await settle();
    const after = await snapshot("after");
    const afterImage = await screenshot();
    await sheet.evaluate((node, value) => { node.textContent = value; }, baseline);
    await settle();
    const before = await snapshot("before");
    const beforeImage = await screenshot();
    // Retain both renders for visual review. A same-CSS control reproduces a
    // one-pixel overflow clipping difference in headless Chromium, so PNG byte
    // equality is diagnostic; every computed property and rectangle stays exact.
    const imagesEqual = beforeImage.equals(afterImage);
    writeFileSync(join(output, `${id}-before.png`), beforeImage);
    writeFileSync(join(output, `${id}-after.png`), afterImage);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      writeFileSync(join(output, `${id}.json`), JSON.stringify(await sheet.evaluate(node => node.__paritySnapshots), null, 2));
    }
    assert.deepEqual(after, before, `${name}: CSS relocation changed computed styles or layout`);
    appendFileSync(join(output, "results.jsonl"), JSON.stringify({name, computed: "equal", nodes: before.count, hash: before.hash, imagesEqual}) + "\n");
  } finally {
    await sheet.evaluate((node, value) => { node.textContent = value; }, current);
    await sheet.evaluate(node => { delete node.__paritySnapshots; });
    await freeze.evaluate(node => node.remove());
    await settle();
  }
}

// Use the actual appearance owner while an existing room/table/gallery fixture is
// open. Do not persist these variants or change the staged domain draft.
export async function verifySettingsAppearanceParity(page, name) {
  if (!process.env.SETTINGS_CSS_BASELINE) return;
  const original = await page.evaluate(async () => {
    const { readUiPreferences } = await import("/src/ui-preferences.ts");
    return readUiPreferences();
  });
  const apply = preferences => page.evaluate(async value => {
    const { applyUiPreferences } = await import("/src/ui-preferences.ts");
    applyUiPreferences(value);
  }, preferences);
  try {
    for (const scheme of ["light", "dark"]) for (const density of ["compact", "comfortable"]) {
      await apply({ ...original, scheme, density, scale: 1.2, motion: "reduced" });
      await verifySettingsStyleParity(page, `${name}-${scheme}-${density}-scaled`);
    }
  } finally { await apply(original); }
}
