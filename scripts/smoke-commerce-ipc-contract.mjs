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
  "commerce:product:lookupExternal",
  "commerce:product:previewExternalImage",
  "commerce:product:imageDataUrl",
  "commerce:inventory:getBalance",
  "commerce:inventory:listMovements",
  "commerce:inventory:applyMovement",
  "commerce:inventory:setCount",
  "commerce:sale:createPaid",
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
  const escapedChannel = channel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.equal(
    [...ipcSource.matchAll(new RegExp(`ipcMain\\.handle\\("${escapedChannel}"`, "g"))].length,
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
  "lookupExternalProductByBarcode",
  "previewExternalProductImage",
  "getProductImageDataUrl",
  "getInventoryBalance",
  "listInventoryMovements",
  "applyInventoryMovement",
  "setInventoryCount",
  "createPaidSale",
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

assert.match(
  contractSource,
  /CommerceIpcMutationResult<T>/,
  "Expected commerce mutation outcomes must have a typed IPC envelope."
);
assert.match(
  ipcSource,
  /commerce\.domain\.rejected/,
  "Expected commerce domain rejections must have a stable structured log event."
);
assert.match(
  ipcSource,
  /code:\s*"insufficient_stock"[\s\S]*?\^Yetersiz stok\\\./,
  "Insufficient stock must be classified as an expected commerce rejection."
);
assert.match(
  ipcSource,
  /mutateForIpc\("commerce:sale:createPaid"/,
  "Paid sale must use the expected-domain IPC mutation wrapper."
);
assert.match(
  preloadSource,
  /async function invokeCommerceMutation<T>/,
  "Preload must unwrap expected commerce mutation outcomes."
);
assert.match(
  preloadSource,
  /error\.name = "CommerceDomainError"/,
  "Expected domain rejections must become renderer-side user errors without failing the main IPC handler."
);
assert.match(
  preloadSource,
  /createPaidSale:\s*\(input\) => invokeCommerceMutation<CommerceSale>\("commerce:sale:createPaid"/,
  "Paid sale bridge must use the commerce mutation unwrap path."
);
assert.doesNotMatch(
  ipcSource,
  /code:\s*"invalid_category"[\s\S]{0,500}\(\?:Kategori \|/,
  "Category classification must not broadly downgrade technical category consistency failures."
);

console.log("commerce-ipc-contract-smoke-ok");
