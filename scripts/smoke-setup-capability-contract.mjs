import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { toLegacySetupSaveInput } = require("../apps/desktop-app/dist-electron/setup-contract.js");

const baseInput = {
  businessName: "Smoke İşletmesi",
  businessType: "market",
  phone: "+905550000000",
  whatsapp: "+905550000000",
  email: "",
  address: "",
  webModuleUrl: "https://example.test/yardimci-asistan",
  syncSecret: "123456789012",
  autoSyncEnabled: true,
  aiEnabled: false,
  aiProvider: "openai_compatible",
  aiService: "openai",
  aiProjectName: "",
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "",
  aiModelOptions: [],
  aiApiKey: "",
  clearAiApiKey: false,
  aiProfiles: [],
  aiTimeoutSeconds: 30,
  servicePreferences: {
    whatsapp: true,
    android: false
  },
  initialCounts: {
    rooms: 0,
    tables: 0
  },
  tableCategories: []
};

const freshMarket = toLegacySetupSaveInput(baseInput, null);
assert.deepEqual(freshMarket.modules, {
  rooms: false,
  tables: false,
  qrMenu: false,
  whatsapp: true,
  android: false
});
assert.equal("servicePreferences" in freshMarket, false);

const marketWithRoomOverride = toLegacySetupSaveInput(baseInput, {
  businessId: "business_smoke",
  businessType: "pension_restaurant",
  profileId: "pension_restaurant",
  capabilities: [
    {
      capability: "accommodation.rooms",
      enabled: true,
      source: "user",
      updatedAt: "2026-09-03T00:00:00.000Z"
    },
    {
      capability: "food_service.tables",
      enabled: true,
      source: "profile",
      updatedAt: "2026-09-03T00:00:00.000Z"
    }
  ],
  enabledCapabilities: ["accommodation.rooms", "food_service.tables"]
});
assert.equal(marketWithRoomOverride.modules.rooms, true, "Explicit user override must survive target profile projection.");
assert.equal(marketWithRoomOverride.modules.tables, false, "Old profile defaults must not leak into the target profile.");
assert.equal(marketWithRoomOverride.modules.qrMenu, false);

const restaurantProjection = toLegacySetupSaveInput({
  ...baseInput,
  businessType: "restaurant"
}, {
  businessId: "business_smoke",
  businessType: "pension",
  profileId: "pension",
  capabilities: [
    {
      capability: "accommodation.rooms",
      enabled: true,
      source: "profile",
      updatedAt: "2026-09-03T00:00:00.000Z"
    }
  ],
  enabledCapabilities: ["accommodation.rooms"]
});
assert.equal(restaurantProjection.modules.rooms, false);
assert.equal(restaurantProjection.modules.tables, true);
assert.equal(restaurantProjection.modules.qrMenu, true);

console.log("setup-capability-contract-smoke-ok");
