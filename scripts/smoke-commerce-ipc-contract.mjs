import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const ipcSource = read("apps/desktop-app/electron/commerce-ipc.ts");
const preloadSource = read("apps/desktop-app/electron/preload.ts");
const mainEntrySource = read("apps/desktop-app/electron/main-entry.ts");
const contractSource = read("apps/desktop-app/electron/commerce-ipc-contract.ts");

const channels = [
  "commerce:getSnapshot",
  "commerce:category:list",
  "commerce:category:get",
  "commerce:category:save",
  "commerce:category:delete",
  "commerce:product:list",
  "commerce:product:save",
  "commerce:product:findByBarcode",
  "commerce:inventory:getBalance",
  "commerce:inventory:listMovements",
  "commerce:inventory:applyMovement",
  "commerce:inventory:setCount",
  "commerce:sale:createPaid",
  "commerce:productDraft:list",
  "commerce:productDraft:markReviewed",
  "commerce:cartDraft:list",
  "commerce:cartDraft:get",
  "commerce:cartDraft:loadForQuickSale",
  "commerce:cartDraft:markReviewed",
  "commerce:barcodeScan:consumePending",
  "commerce:supplier:list",
  "commerce:supplier:save",
  "commerce:purchase:list",
  "commerce:purchase:get",
  "commerce:purchase:receive"
];

for (const channel of channels) {
  assert.equal(
    ipcSource.split(`"${channel}"`).length - 1,
    1,
    `Commerce IPC handler must register ${channel} exactly once.`
  );
  assert.equal(
    preloadSource.split(`"${channel}"`).length - 1,
    1,
    `Commerce preload bridge must invoke ${channel} exactly once.`
  );
}

const contractMethods = [
  "getSnapshot",
  "listCategories",
  "getCategory",
  "saveCategory",
  "deleteCategory",
  "listProducts",
  "saveProduct",
  "findProductByBarcode",
  "getInventoryBalance",
  "listInventoryMovements",
  "applyInventoryMovement",
  "setInventoryCount",
  "createPaidSale",
  "listProductDrafts",
  "markProductDraftReviewed",
  "listCartDrafts",
  "getCartDraft",
  "loadCartDraftForQuickSale",
  "markCartDraftReviewed",
  "consumePendingBarcodeScans",
  "setBarcodeScanMode",
  "listSuppliers",
  "saveSupplier",
  "listPurchaseOrders",
  "getPurchaseOrder",
  "receivePurchase"
];

for (const method of contractMethods) {
  assert.match(
    contractSource,
    new RegExp(`\\b${method}\\s*:`),
    `DesktopCommerceBridge contract is missing ${method}.`
  );
}

assert.match(
  preloadSource,
  /commerce:\s*DesktopCommerceBridge;/,
  "DesktopBridge must expose the typed commerce namespace."
);
assert.match(
  mainEntrySource,
  /registerCommerceIpcHandlers\s*\(/,
  "Electron main entry must register commerce IPC handlers."
);

for (const forbiddenImport of [
  "./commerce-store",
  "./commerce-category-store",
  "./commerce-purchase-store"
]) {
  assert.equal(
    ipcSource.includes(`from "${forbiddenImport}"`),
    false,
    `Commerce IPC must not bypass commerce-runtime via ${forbiddenImport}.`
  );
}
assert.match(
  ipcSource,
  /from "\.\/commerce-runtime"/,
  "Commerce IPC must delegate to the capability-guarded commerce runtime."
);

console.log("commerce-ipc-contract-smoke-ok");
