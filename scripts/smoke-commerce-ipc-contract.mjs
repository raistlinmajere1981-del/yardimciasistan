import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const ipcSource = read("apps/desktop-app/electron/commerce-ipc.ts");
const preloadSource = read("apps/desktop-app/electron/preload.ts");
const mainEntrySource = read("apps/desktop-app/electron/main-entry.ts");
const contractSource = read("apps/desktop-app/electron/commerce-ipc-contract.ts");

const channels = [
  "commerce:category:list",
  "commerce:category:save",
  "commerce:category:delete",
  "commerce:product:list",
  "commerce:product:activate",
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
  "commerce:price:resolve",
  "commerce:order:list",
  "commerce:order:get",
  "commerce:order:create",
  "commerce:order:updateStatus",
  "commerce:order:fulfill",
  "commerce:order:previewBenefits",
  "commerce:cartDraft:list",
  "commerce:cartDraft:loadForQuickSale",
  "commerce:cartDraft:markReviewed",
  "commerce:barcodeScan:consumePending",
  "commerce:supplier:list",
  "commerce:supplier:save",
  "commerce:purchase:list",
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
    channel === "commerce:order:fulfill" ? 2 : 1,
    `Commerce preload bridge must use the canonical ${channel} channel.`
  );
}

const contractMethods = [
  "listCategories",
  "saveCategory",
  "deleteCategory",
  "listProducts",
  "activateProduct",
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
  "resolveProductPrice",
  "listOrders",
  "getOrder",
  "createOrder",
  "updateOrderStatus",
  "fulfillOrder",
  "previewOrderBenefits",
  "tryFulfillOrder",
  "listCartDrafts",
  "loadCartDraftForQuickSale",
  "markCartDraftReviewed",
  "consumePendingBarcodeScans",
  "setBarcodeScanMode",
  "listSuppliers",
  "saveSupplier",
  "listPurchaseOrders",
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
  ipcSource,
  /mutateForIpc\("commerce:order:create"/,
  "Order creation must use the expected-domain IPC mutation wrapper."
);
assert.match(
  ipcSource,
  /mutateForIpc\("commerce:order:updateStatus"/,
  "Order status mutation must use the expected-domain IPC mutation wrapper."
);
assert.match(
  ipcSource,
  /mutateForIpc\("commerce:order:fulfill"/,
  "Order fulfillment must use the expected-domain IPC mutation wrapper."
);
assert.match(
  ipcSource,
  /code:\s*"invalid_order"/,
  "Order domain rejections must have a stable expected error classification."
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
assert.match(
  preloadSource,
  /resolveProductPrice:\s*\(input\) => invokeWhenUnlocked<CommerceResolvedUnitPrice>\("commerce:price:resolve"/,
  "Product price resolution must stay a read-only typed bridge operation."
);
assert.match(
  preloadSource,
  /createOrder:\s*\(input\) => invokeWhenUnlocked<CommerceIpcMutationResult<CommerceOrderDetail>>\("commerce:order:create"/,
  "Order creation must preserve the typed rejection envelope across contextBridge for safe retry."
);
assert.match(
  preloadSource,
  /updateOrderStatus:\s*\(input\) => invokeCommerceMutation<CommerceOrderDetail>\("commerce:order:updateStatus"/,
  "Order status bridge must use the commerce mutation unwrap path."
);
assert.match(
  preloadSource,
  /fulfillOrder:\s*\(input\) => invokeCommerceMutation<CommerceOrderFulfillmentResult>\("commerce:order:fulfill"/,
  "Order fulfillment bridge must use the commerce mutation unwrap path."
);
assert.doesNotMatch(
  ipcSource,
  /code:\s*"invalid_category"[\s\S]{0,500}\(\?:Kategori \|/,
  "Category classification must not broadly downgrade technical category consistency failures."
);


// Exercise the compiled isolated bridge rather than parsing the subscription body.
const listeners = new Map();
let exposedBridge;
runInNewContext(ts.transpileModule(preloadSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, {
  exports: {}, require: (name) => {
    assert.equal(name, "electron");
    return { contextBridge: { exposeInMainWorld: (_key, bridge) => { exposedBridge = bridge; } }, webFrame: {}, ipcRenderer: {
      on: (channel, handler) => { const set = listeners.get(channel) ?? new Set(); set.add(handler); listeners.set(channel, set); },
      removeListener: (channel, handler) => listeners.get(channel)?.delete(handler), invoke: async () => ({ locked: false })
    } };
  }
});
let notifications = 0;
const unsubscribe = exposedBridge.commerce.onOrdersChanged(() => { notifications++; });
const emitOrdersChanged = () => { for (const listener of listeners.get("commerce:ordersChanged") ?? []) listener({ sender: "electron-event" }); };
emitOrdersChanged();
assert.equal(notifications, 1);
unsubscribe(); unsubscribe();
emitOrdersChanged();
assert.equal(notifications, 1);
assert.equal(listeners.get("commerce:ordersChanged").size, 0);

console.log("commerce-ipc-contract-smoke-ok");
