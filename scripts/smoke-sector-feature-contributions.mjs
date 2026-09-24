import assert from "node:assert/strict";\nimport { chromium, expect } from "@playwright/test";\nimport { createServer } from "vite";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";\nimport { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";\nimport { installPensionWorkspaceFixture } from "./test-helpers/pension-workspace-fixture.mjs";\nimport { createCompactUiFixture } from "./lib/desktop-renderer-fixtures.mjs";
import ts from "typescript";

const root = process.cwd();
const source = (path) => readFileSync(join(root, path), "utf8");

const configPath = resolve("apps/desktop-app/tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve("apps/desktop-app"));
const typeFixture = resolve("scripts/fixtures/sector-feature-contribution.tsx");
const program = ts.createProgram([...parsed.fileNames, typeFixture], { ...parsed.options, noEmit: true });
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => "\n"
  }));
}

const conditionSource = source("apps/desktop-app/src/app/capability-condition.ts");
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

const navigation = source("apps/desktop-app/src/app/navigation.ts");
const frame = source("apps/desktop-app/src/components/app/DesktopAppFrame.tsx");
const settingsRegistry = source("apps/desktop-app/src/app/settings-registry.ts");
const settingsContributions = source("apps/desktop-app/src/app/settings-section-contributions.tsx");
const settingsWorkspace = source("apps/desktop-app/src/components/settings/SettingsWorkspace.tsx");
const workspaceDefinitions = source("apps/desktop-app/src/app/workspace-definitions.tsx");
const roomDefinition = source("apps/desktop-app/src/components/pension/room-workspace-definition.tsx");
const tableDefinition = source("apps/desktop-app/src/components/restaurant/table-workspace-definition.tsx");\nconst featureFixture = source("scripts/fixtures/sector-feature-contribution.tsx");

assert.match(navigation, /export const navigationContributions/);
assert.match(navigation, /buildNavigationFromContributions/);
assert.match(navigation, /getPageContentScroll/);
assert.doesNotMatch(navigation, /businessType|business_type|profileId\s*===/);
assert.match(frame, /contentScroll=\{getPageContentScroll\(activePage\)\}/);
assert.match(frame, /activePage === "messages"/, "Persistent Messages header behavior must stay explicit.");
assert.match(settingsRegistry, /condition\?: CapabilityCondition/);
assert.match(settingsRegistry, /layoutSettingsDefinition/);
assert.match(settingsContributions, /definition: layoutSettingsDefinition/);
assert.match(settingsContributions, /settingsFieldOwners\[category\]/);
assert.equal((settingsWorkspace.match(/<StagedSettingsContributionSlot category=/g) ?? []).length, 3);
assert.match(workspaceDefinitions, /components\/pension\/room-workspace-definition/);
assert.match(workspaceDefinitions, /components\/restaurant\/table-workspace-definition/);
assert.match(roomDefinition, /defaultPresentation: "centered"/);
assert.match(tableDefinition, /defaultPresentation: "full-canvas"/);
assert.doesNotMatch(settingsContributions, /execute|dispatch|serviceLocator|dependencyContainer/i);

console.log("sector-feature-contributions-smoke-ok");
