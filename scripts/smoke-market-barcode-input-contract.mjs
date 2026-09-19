import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const barcodeInput = read("apps/desktop-app/src/app/barcode-input.ts");
const quickSale = read("apps/desktop-app/src/components/market/MarketQuickSaleWorkspace.tsx");
const marketPage = read("apps/desktop-app/src/pages/MarketPage.tsx");

assert.match(barcodeInput, /export interface BarcodeInputAdapter/, "BarcodeInput adapter contract is missing.");
assert.match(barcodeInput, /createBarcodeSimulatorAdapter/, "Simulator barcode adapter is missing.");
assert.match(barcodeInput, /createKeyboardBarcodeInputAdapter/, "USB keyboard-wedge adapter is missing.");
assert.match(barcodeInput, /normalizeBarcodeIdentity/, "Barcode input must normalize human-entered numeric separators.");
assert.match(barcodeInput, /maxInterKeyMs/, "Keyboard barcode adapter must distinguish scanner timing from normal typing.");
assert.match(barcodeInput, /event\.key === "Enter"/, "Keyboard barcode adapter must support scanner terminator input.");
assert.doesNotMatch(barcodeInput, /getUserMedia|MediaDevices|androidBridge|adb/i, "M4 must not implement camera/Android barcode capture yet.");

assert.match(marketPage, /C\.RETAIL_BARCODE/, "Market page must derive barcode availability from persisted capability state.");
assert.match(quickSale, /barcodeEnabled/, "Quick Sale must receive an explicit barcode capability gate.");
assert.match(quickSale, /bridge\.findProductByBarcode\s*\(/, "Barcode scans must use exact guarded barcode lookup.");
assert.match(quickSale, /keyboard-wedge/, "Quick Sale must expose USB keyboard-wedge mode.");
assert.match(quickSale, /simulator/, "Quick Sale must expose simulator mode.");
assert.doesNotMatch(quickSale, /business_type|modules_json|rooms_enabled|tables_enabled|qr_menu_enabled/, "Barcode UI must not bind to removed profile flags.");

console.log("market-barcode-input-contract-smoke-ok");
