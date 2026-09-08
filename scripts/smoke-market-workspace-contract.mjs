import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const navigation = read("apps/desktop-app/src/app/navigation.ts");
const appView = read("apps/desktop-app/src/components/app/DesktopAppView.tsx");
const marketPage = read("apps/desktop-app/src/pages/MarketPage.tsx");
const marketProducts = read("apps/desktop-app/src/components/market/MarketProductsWorkspace.tsx");
const marketInventory = read("apps/desktop-app/src/components/market/MarketInventoryWorkspace.tsx");
const marketPurchasing = read("apps/desktop-app/src/components/market/MarketPurchasingWorkspace.tsx");
const marketLabels = read("apps/desktop-app/src/components/market/MarketLabelsWorkspace.tsx");
const marketSource = [marketPage, marketProducts, marketInventory, marketPurchasing, marketLabels].join("\n");
const preload = read("apps/desktop-app/electron/preload.ts");

assert.match(navigation, /\| "market" \|/, "DesktopPage must include the market route.");
assert.match(navigation, /hasRetailWorkspaceCapability/, "Market navigation must have an explicit retail capability gate.");
for (const capability of ["RETAIL_BARCODE", "RETAIL_PURCHASING", "RETAIL_SUPPLIERS", "RETAIL_LABELS"]) {
  assert.match(navigation, new RegExp(`C\\.${capability}`), `Market navigation must consider ${capability}.`);
}
assert.doesNotMatch(
  navigation,
  /if \(runtimeHasCapability\(capabilities, C\.CATALOG\)\)[\s\S]{0,120}id: "market"/,
  "Shared catalog capability alone must not expose the Market workspace."
);
assert.match(appView, /activePage === "market"/, "DesktopAppView must route the Market page.");
assert.match(appView, /<MarketPage customers=\{desktopSyncController\.dashboardData\.customers\} \/>/, "DesktopAppView must render MarketPage with the existing customer source.");

for (const section of ["Hızlı Satış", "Ürünler", "Stok", "Tedarikçiler / Alım", "Etiketler"]) {
  assert.ok(marketPage.includes(section), `Market workspace is missing ${section}.`);
}
for (const method of [
  "listProducts",
  "saveProduct",
  "listCategories",
  "saveCategory",
  "deleteCategory",
  "getInventoryBalance",
  "listInventoryMovements",
  "setInventoryCount",
  "listSuppliers",
  "saveSupplier",
  "listPurchaseOrders",
  "receivePurchase"
]) {
  assert.match(marketSource, new RegExp(`bridge\\.${method}\\b`), `Market workspaces must use commerce.${method}.`);
}
assert.match(preload, /commerce:\s*DesktopCommerceBridge;/, "Preload must expose the typed commerce bridge used by Market workspaces.");
assert.doesNotMatch(marketSource, /business_type|modules_json|rooms_enabled|tables_enabled|qr_menu_enabled/, "Market renderer must not bind to legacy business/profile flags.");

console.log("market-workspace-contract-smoke-ok");
