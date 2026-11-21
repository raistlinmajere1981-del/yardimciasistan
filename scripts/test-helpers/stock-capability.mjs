import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("../../packages/shared/dist/index.js");
const { setBusinessCapability } = require("../../apps/desktop-app/dist-electron/business-capability-store.js");

/** Only tests creating/counting tracked stock opt in. Sector defaults no longer
 * imply inventory, and production capability enforcement must not be relaxed. */
export function enableFixtureStockTracking(database) {
  if (database.getEnabledBusinessCapabilities().includes(C.INVENTORY)) return;
  const result = setBusinessCapability(database.databasePath, { capability: C.INVENTORY, enabled: true });
  assert.ok(result.enabledCapabilities.includes(C.INVENTORY),
    "Stock fixture must explicitly enable inventory for tracked products.");
}
