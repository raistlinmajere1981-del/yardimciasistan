import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const realLoad = Module._load;
const providerMessage = "This model is currently experiencing high demand. Please try again later.";
let diagnosticsReceived = false;

Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith("/business-ai-service.js")) {
    if (request === "@yardimci-asistan/ai-core") {
      return { generateConfiguredChat: async () => ({
        ok: false, provider: "gemini", reason: "overloaded", status: 503,
        message: providerMessage
      }), generateOwnerReplySuggestion: () => { throw new Error("Not used"); } };
    }
    if (request === "./ai-config") {
      return { createDesktopAiConfig: () => ({
        enabled: true, provider: "gemini", service: "gemini",
        baseUrl: "https://localhost.invalid", model: "test", apiKey: "", timeoutMs: 1000
      }) };
    }
    if (request === "./business-ai-context-service") {
      return { createCurrentBusinessAiContext: () => ({ capabilityIds: [] }) };
    }
    if (request === "./ai-diagnostics") {
      return {
        logAiOperationStarted: () => {},
        logAiOperationCompleted: (operation, _config, outcome) => {
          assert.equal(operation, "daily-evaluation");
          assert.equal(outcome.message, providerMessage);
          diagnosticsReceived = true;
        },
        logAiFallback: () => {}
      };
    }
  }
  return realLoad.call(this, request, parent, isMain);
};
let generateDailyBusinessEvaluation;
try {
  ({ generateDailyBusinessEvaluation } = require("../apps/desktop-app/dist-electron/business-ai-service.js"));
} finally {
  Module._load = realLoad;
}

const database = {
  getSetupData: () => ({ businessName: "Demo Market" }),
  getEnabledBusinessCapabilities: () => [],
  getDashboardData: () => ({
    rooms: [], tables: [], reservations: [], dailyTasks: [], requests: [],
    customers: [], customerRoomStays: [], androidDevices: [], androidActionFailures: [],
    paymentWaitingTableOrders: [], menu: { categories: [], items: [], updated_at: "" },
    summary: { newRequests: 0, waitingRequests: 0, pendingDailyTasks: 0,
      availableRooms: 0, totalRooms: 0, availableTables: 0, pendingReservations: 0,
      preparedWhatsAppMessages: 0 }
  })
};
const result = await generateDailyBusinessEvaluation(database);
assert.equal(result.ok, true);
assert.equal(result.fallback, true);
assert.match(result.message, /yerel değerlendirme hazırlandı/);
assert.equal(result.message.includes(providerMessage), false);
assert.doesNotMatch(result.message, /high demand|Please try again|503|overloaded|model/i);
assert.match(result.content, /Öncelikler/);
assert.equal(diagnosticsReceived, true, "Provider failure is preserved in diagnostics.");
console.log("Daily AI fallback: Turkish neutral message, local content, diagnostics retained.");
