import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const navigation = read("apps/desktop-app/src/app/navigation.ts");
const workspaceRouter = read("apps/desktop-app/src/components/app/DesktopWorkspaceRouter.tsx");
const marketPage = read("apps/desktop-app/src/pages/MarketPage.tsx");
const marketController = read("apps/desktop-app/src/app/use-market-controller.ts");
const marketProducts = read("apps/desktop-app/src/components/market/MarketProductsWorkspace.tsx");
const productFields = read("apps/desktop-app/src/components/market/ProductFormFields.tsx");
const productWorkspace = read("apps/desktop-app/src/components/market/ProductWorkspace.tsx");
const marketInventory = read("apps/desktop-app/src/components/market/MarketInventoryWorkspace.tsx");
const marketPurchasing = read("apps/desktop-app/src/components/market/MarketPurchasingWorkspace.tsx");
const marketLabels = read("apps/desktop-app/src/components/market/MarketLabelsWorkspace.tsx");
const marketSource = [marketPage, marketController, marketProducts, productFields, productWorkspace, marketInventory, marketPurchasing, marketLabels].join("\n");
const preload = read("apps/desktop-app/electron/preload.ts");

assert.match(navigation, /\| "market" \|/, "DesktopPage must include the market route.");
const marketNavigationStart = navigation.indexOf('pageId: "market"');
assert.notEqual(marketNavigationStart, -1, "Market navigation contribution must exist.");
const marketNavigation = navigation.slice(marketNavigationStart, marketNavigationStart + 700);
assert.match(marketNavigation, /condition:\s*\{\s*anyOf:/, "Market navigation must use an explicit capability condition.");
for (const capability of ["RETAIL_BARCODE", "RETAIL_PURCHASING", "RETAIL_SUPPLIERS", "RETAIL_LABELS"]) {
  assert.match(marketNavigation, new RegExp(`C\\.${capability}`), `Market navigation must consider ${capability}.`);
}
assert.doesNotMatch(
  marketNavigation,
  /C\.CATALOG[^\n]*condition|condition[^\n]*C\.CATALOG/,
  "Shared catalog capability alone must not expose the Market workspace."
);
assert.match(workspaceRouter, /activePage === "market"/, "DesktopWorkspaceRouter must route the Market page.");
assert.match(workspaceRouter, /<MarketPage customers=\{dashboardData\.customers\} controller=\{marketController\} \/>/, "DesktopWorkspaceRouter must render MarketPage with the shared market controller.");

for (const section of ["Hızlı Satış", "Ürünler", "Stok", "Tedarikçiler / Alım", "Etiketler"]) {
  assert.ok(marketPage.includes(section), `Market workspace is missing ${section}.`);
}
for (const method of [
  "listProducts",
  "saveProduct",
  "lookupExternalProductByBarcode",
  "getProductImageDataUrl",
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
assert.match(productFields, /Ürün Bilgilerini Ara/, "Product workspace must expose manual product-data lookup.");
assert.match(productFields, /Ürün verisi:/, "Product workspace must retain source attribution.");
assert.match(productWorkspace, /entityType: "product"/, "Canonical Product Workspace must update the product entity mode.");
assert.match(marketProducts, /entityType: "product"/, "Product list rows and create completion must open the canonical Product Workspace.");
assert.match(marketPage, /onExternalProductFound/, "Unknown quick-sale barcodes must hand off to the product form.");
assert.doesNotMatch(marketSource, /business_type|modules_json|rooms_enabled|tables_enabled|qr_menu_enabled/, "Market renderer must not bind to removed profile flags.");

console.log("market-workspace-contract-smoke-ok");
