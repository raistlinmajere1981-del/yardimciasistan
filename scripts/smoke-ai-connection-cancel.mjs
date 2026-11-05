import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";

const jsPath = relative => resolve("apps/desktop-app/dist-electron", relative);
function loadModule(relative, mock = {}, globals = {}) {
  const filename = jsPath(relative);
  const moduleRequire = createRequire(filename);
  const exports = {};
  runInNewContext(readFileSync(filename, "utf8"), {
    exports, require: id => Object.hasOwn(mock, id) ? mock[id] : moduleRequire(id),
    URL, AbortController, AbortSignal, DOMException, setTimeout, clearTimeout, Date, ...globals
  }, { filename });
  return exports;
}

const handlers = {};
const database = { recordServiceSettingsVerification: () => { throw Error("Cancelled test cannot record a verification"); } };
let testStarted;
const started = new Promise(resolve => { testStarted = resolve; });
let aborted = false;
const service = loadModule("ai-connection-service.js", {
  "@yardimci-asistan/ai-core": {
    listCloudflareAiModels: async () => ({ ok: true, models: [{ id: "@cf/fixture/text", label: "text", task: "text" }] }),
    generateConfiguredChat: async (_config, fetchImpl) => {
      try {
        await fetchImpl("https://fixture.test/wait", { signal: new AbortController().signal });
      } catch (error) {
        if (error.name === "AbortError") aborted = true;
      }
      return { ok: false, message: "cancelled", model: "@cf/fixture/text" };
    }
  },
  "@yardimci-asistan/shared": {
    isCloudflareAiBaseUrl: () => true, supportsVisionModel: () => true, supportsImageGenerationModel: () => true
  },
  "./ai-config": { normalizeAiTimeoutSeconds: value => value },
  "./ai-secret-service": { getEffectiveAiApiKey: () => "" },
  "./desktop-logger": { createDiagnosticOperationId: () => "fixture", desktopLog: { warn: () => {} } },
  "./ai-diagnostics": { logAiOperationStarted: () => {}, logAiOperationCompleted: () => {} },
  "./generated-image-normalization": { normalizeGeneratedImagePng: bytes => bytes }
}, {
  fetch: async (_url, init) => new Promise((_resolve, reject) => {
    testStarted();
    assert.ok(init.signal, "Test carries the combined network abort signal");
    if (init.signal.aborted) return reject(new DOMException("aborted", "AbortError"));
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  })
});

const ipc = loadModule("ipc/ai-connection-ipc.js", {
  electron: { ipcMain: { handle: (name, callback) => { handlers[name] = callback; } } },
  "../ai-connection-service": service
});
ipc.registerAiConnectionIpcHandlers({ getDatabase: () => database, assertUnlocked: () => {} });
const owner = { sender: { id: 100 } };
const stranger = { sender: { id: 101 } };
const request = {
  provider: "openai_compatible", service: "cloudflare", baseUrl: "https://api.cloudflare.com/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/ai",
  model: "@cf/fixture/text", apiKey: "fixture-only", useStoredApiKey: false, timeoutSeconds: 90, projectName: ""
};
const pending = handlers["ai:testConnection"](owner, request, "ai-test-fixture01");
await started;
assert.equal(handlers["ai:cancelTestConnection"](stranger, "ai-test-fixture01"), false, "Other window cannot cancel this test");
assert.equal(handlers["ai:cancelTestConnection"](owner, "../invalid"), false, "Invalid test ID ignored");
assert.equal(handlers["ai:cancelTestConnection"](owner, "ai-test-fixture01"), true);
assert.deepEqual(JSON.parse(JSON.stringify(await pending)), { ok: false, message: "Bağlantı testi iptal edildi." });
assert.equal(aborted, true, "Pending provider fetch received the abort signal");
assert.equal(handlers["ai:cancelTestConnection"](owner, "ai-test-fixture01"), false, "Completed test is cleaned up");
assert.equal((await handlers["ai:testConnection"](owner, request, "bad-id")).ok, false);

const section = readFileSync("apps/desktop-app/src/components/settings/AiSettingsSection.tsx", "utf8");
const card = readFileSync("apps/desktop-app/src/components/settings/ServiceSettingsCard.tsx", "utf8");
const styles = readFileSync("apps/desktop-app/src/styles/components/workspace.css", "utf8");
assert.match(section, /Testi İptal Et/);
assert.match(section, /inert=\{aiConnectionTestState === "loading"\}/);
assert.match(card, /allowActionDuringTest/);
assert.match(styles, /polygon\(evenodd,/);
assert.match(styles, /--nexa-backdrop-clip/);
console.log("smoke-ai-connection-cancel-ok: IPC owner isolation, fetch abort, no stale write, modal button, Nexa cutout");
