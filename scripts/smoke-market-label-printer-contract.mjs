import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const labelPrinter = read("apps/desktop-app/src/app/label-printer.ts");
const labelsWorkspace = read("apps/desktop-app/src/components/market/MarketLabelsWorkspace.tsx");
const marketPage = read("apps/desktop-app/src/pages/MarketPage.tsx");

assert.match(labelPrinter, /export interface LabelPrinterAdapter/, "LabelPrinter adapter contract is missing.");
assert.match(labelPrinter, /export interface LabelPrintJob/, "LabelPrinter job contract is missing.");
assert.match(labelPrinter, /LABEL_SIZE_PRESETS/, "Label size presets are missing.");
for (const printerId of ["preview", "png", "pdf", "zpl", "tspl", "system"]) {
  assert.match(labelPrinter, new RegExp(`id: "${printerId}"`), `LabelPrinter catalog is missing ${printerId}.`);
}
for (const availableId of ["preview", "png", "pdf"]) {
  assert.match(
    labelPrinter,
    new RegExp(`id: "${availableId}"[\\s\\S]{0,100}availability: "available"`),
    `${availableId} adapter must be available in the MVP.`
  );
}
for (const plannedId of ["zpl", "tspl", "system"]) {
  assert.match(
    labelPrinter,
    new RegExp(`id: "${plannedId}"[\\s\\S]{0,100}availability: "planned"`),
    `${plannedId} adapter must remain planned.`
  );
}

assert.match(labelPrinter, /CODE128_START_B\s*=\s*104/, "Code 128-B start code is missing.");
assert.match(labelPrinter, /% 103/, "Code 128 checksum must use modulo 103.");
assert.match(labelPrinter, /"2331112"/, "Code 128 stop pattern is missing.");
assert.match(labelPrinter, /CODE128_QUIET_MODULES\s*=\s*10/, "Code 128 quiet zone contract is missing.");
assert.match(labelPrinter, /canvasToBlob\(canvas, "image\/png"\)/, "PNG adapter must use the shared label render.");
assert.match(labelPrinter, /\/Filter \/DCTDecode/, "PDF adapter must embed the raster label as an image.");
assert.match(labelPrinter, /job\.copies/, "PDF output must honor requested copy count.");
assert.doesNotMatch(labelPrinter, /from "electron"|ipcRenderer|ipcMain|node:fs|node:sqlite/, "LabelPrinter MVP must stay renderer-local and device-independent.");

assert.match(labelsWorkspace, /getLabelPrinter\("preview"\)/, "Labels workspace must render through the preview adapter.");
assert.match(labelsWorkspace, /exportLabel\("png"\)/, "Labels workspace must expose PNG output.");
assert.match(labelsWorkspace, /exportLabel\("pdf"\)/, "Labels workspace must expose PDF output.");
assert.match(labelsWorkspace, /downloadLabelResult/, "File outputs must use the shared LabelPrinter download result.");
assert.match(labelsWorkspace, /LABEL_PRINTER_CATALOG/, "Labels workspace must expose adapter readiness.");
assert.doesNotMatch(labelsWorkspace, /business_type|modules_json|rooms_enabled|tables_enabled|qr_menu_enabled/, "Labels workspace must not bind to legacy business/profile flags.");

assert.match(marketPage, /C\.RETAIL_LABELS/, "Market page must derive label availability from persisted capability state.");
assert.match(marketPage, /<MarketLabelsWorkspace/, "Market page must render the labels workspace.");

console.log("market-label-printer-contract-smoke-ok");
