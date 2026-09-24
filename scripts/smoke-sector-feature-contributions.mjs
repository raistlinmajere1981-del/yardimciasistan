import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import ts from "typescript";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { installPensionWorkspaceFixture } from "./test-helpers/pension-workspace-fixture.mjs";
import { createCompactUiFixture } from "./lib/desktop-renderer-fixtures.mjs";

const configPath = resolve("apps/desktop-app/tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve("apps/desktop-app"));
const typeFixture = resolve("apps/desktop-app/scripts/sector-feature-contribution-fixture.tsx");
const program = ts.createProgram([...parsed.fileNames, typeFixture], { ...parsed.options, noEmit: true });
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => "\n"
  }));
}

// CapabilityCondition is a small pure contract; execute its implementation directly
// rather than asserting the source shape of navigation/settings/workspace modules.
const conditionSource = readFileSync(resolve("apps/desktop-app/src/app/capability-condition.ts"), "utf8");
const conditionModule = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(
  conditionSource,
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }
).outputText).toString("base64")}`);
const matches = conditionModule.matchesCapabilityCondition;
const snapshot = (enabledCapabilities) => ({ enabledCapabilities });

assert.equal(matches(undefined), true);
assert.equal(matches(undefined, { allOf: ["core.customers"] }), false);
assert.equal(matches(snapshot(["core.customers"]), { allOf: ["core.customers"] }), true);
assert.equal(matches(snapshot(["service.ai"]), { anyOf: ["service.ai", { allOf: ["core.customers", "service.whatsapp"] }] }), true);

for (const customers of [false, true]) {
  for (const whatsapp of [false, true]) {
    for (const ai of [false, true]) {
      const enabled = [
        ...(customers ? ["core.customers"] : []),
        ...(whatsapp ? ["service.whatsapp"] : []),
        ...(ai ? ["service.ai"] : [])
      ];
      assert.equal(
        matches(snapshot(enabled), { anyOf: ["service.ai", { allOf: ["core.customers", "service.whatsapp"] }] }),
        ai || (customers && whatsapp),
        `Messages condition mismatch for customers=${customers} whatsapp=${whatsapp} ai=${ai}`
      );
    }
  }
}

const server = await createServer({
  root: resolve("apps/desktop-app"),
  configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
  server: { port: 0, strictPort: false }
});
await server.listen();
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: "tr-TR" });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/sector-feature-contribution-test", async (route) => {
    const html = await server.transformIndexHtml(
      "/sector-feature-contribution-test",
      '<html><body><div id="root"></div><script type="module" src="/@fs/' + resolve("apps/desktop-app/scripts/sector-feature-contribution-fixture.tsx") + '"></script></body></html>'
    );
    await route.fulfill({ contentType: "text/html", body: html });
  });
  await page.addInitScript(installPensionWorkspaceFixture, {
    dashboard: createCompactUiFixture(),
    variant: "rooms-only"
  });
  await page.goto(`${server.resolvedUrls.local[0]}sector-feature-contribution-test`);

  await expect(page.getByRole("navigation", { name: "Test feature navigation" }).getByRole("button", { name: "Test Konaklama" })).toBeVisible();

  await expect(page.getByLabel("Test oda sayısı", { exact: true })).toHaveValue("2");
  await page.getByLabel("Test oda sayısı", { exact: true }).fill("7");
  await expect(page.getByLabel("Test oda sayısı sonucu")).toHaveText("7");
  expect(await page.evaluate(() => window.fixtureRoomCount())).toBe("7");

  const launcher = page.getByRole("button", { name: "Test oda çalışma alanını aç" });
  await launcher.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("Oda 101 · Pilot 101");
  await expect(dialog.getByRole("tab", { name: "Özet", exact: true })).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await expect(launcher).toBeFocused();

  expect(errors).toEqual([]);
  console.log("sector-feature-contributions-smoke-ok: typed conditions, navigation, staged settings, canonical workspace");
} finally {
  await browser?.close();
  await server.close();
}
