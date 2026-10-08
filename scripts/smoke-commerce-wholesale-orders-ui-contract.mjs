import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { createServer } from "vite";
import { BUSINESS_CAPABILITIES as C, expandBusinessCapabilities, getBusinessProfile } from "@yardimci-asistan/shared";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const intent = read("apps/desktop-app/src/components/workspace/workspace-intent.ts");
const page = read("apps/desktop-app/src/pages/MarketPage.tsx");
const workspace = read("apps/desktop-app/src/components/market/MarketOrdersWorkspace.tsx");
const marketCss = read("apps/desktop-app/src/styles/pages/market.css");
const runtime = read("apps/desktop-app/electron/commerce-runtime.ts");
const orderStore = read("apps/desktop-app/electron/commerce-order-store.ts");
const ipc = read("apps/desktop-app/electron/commerce-ipc.ts");
const contract = read("apps/desktop-app/electron/commerce-ipc-contract.ts");
const preload = read("apps/desktop-app/electron/preload.ts");
const integratedSmoke = read("scripts/smoke-commerce-wholesale-orders-ui.mjs");

assert.match(intent, /"orders"/);
// Exercise the production contribution registry, not its source formatting.
// Shared commerce capabilities also serve hospitality; they are not retail entry signals.
const server = await createServer({ root: resolve("apps/desktop-app"),
  configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), server: { middlewareMode: true } });
try {
  const { buildNavigation } = await server.ssrLoadModule("/src/app/navigation.ts");
  const salesEntry = (enabledCapabilities, profileId = "market") => buildNavigation({ profileId, enabledCapabilities })
    .filter(item => item.id === "market");
  for (const profileId of ["pension", "restaurant", "pension_restaurant"]) {
    assert.deepEqual(salesEntry(getBusinessProfile(profileId).defaultCapabilities, profileId), [],
      `${profileId}: default hospitality capabilities must not expose the retail Sales surface`);
  }
  for (const capabilities of [[], [C.CATALOG], [C.SALES], [C.ORDERS], [C.CATALOG, C.SALES, C.ORDERS]]) {
    assert.deepEqual(salesEntry(expandBusinessCapabilities(capabilities)), [],
      "Generic catalog/sale/order dependencies alone must not expose retail navigation");
  }
  for (const capability of [C.RETAIL_BARCODE, C.RETAIL_PURCHASING, C.RETAIL_SUPPLIERS, C.RETAIL_LABELS, C.WHOLESALE, C.ONLINE_SALES]) {
    const entries = salesEntry(expandBusinessCapabilities([C.CATALOG, capability]));
    assert.equal(entries.length, 1, `${capability}: the Sales route must remain reachable`);
    assert.equal(entries[0].label, "Satış");
  }
  assert.equal(salesEntry(getBusinessProfile("market").defaultCapabilities).length, 1,
    "The persisted Market profile defaults must expose Sales");
} finally { await server.close(); }
assert.match(page, /id:\s*"orders"[\s\S]*label:\s*"Siparişler"/);
assert.match(page, /enabled:\s*ordersEnabled && wholesaleEnabled/);
assert.match(page, /<MarketOrdersWorkspace/);
assert.match(page, /customerCreditEnabled=\{customerCreditEnabled\}/);

assert.match(workspace, /Aktif bayi/);
assert.match(
  workspace,
  /product\.isActive !== false/,
  "Orders UI must only exclude products that are explicitly inactive."
);
assert.match(
  workspace,
  /resolveProductPrice\(\{ productId: product\.id, customerId: requestedCustomerId \}\)/,
  "Price preview must resolve against the customer captured when the request starts."
);
assert.match(workspace, /source:\s*"desktop-wholesale"/);
assert.match(workspace, /sourceReference:\s*draftReferenceRef\.current/);
assert.match(workspace, /customerIdRef\.current !== requestedCustomerId/);
assert.match(workspace, /disabled=\{disabled \|\| Boolean\(resolvingProductId\)\}/);
assert.match(workspace, /createOrder\(/);
assert.match(workspace, /Siparişi Onayla/);
assert.match(workspace, /Siparişi İptal Et/);
assert.match(workspace, /Siparişi Tamamla/);
assert.match(workspace, /aria-label="Sipariş ödeme tercihi"/);
assert.match(workspace, /customerCreditEnabled && selectedOrder\.order\.customerId/);
assert.match(workspace, /bridge\.fulfillOrder\(/);
assert.match(workspace, /desktop-order-fulfillment:\$\{orderId\}:\$\{paymentChoice\}/);
assert.match(workspace, /type:\s*"no_payment"/);
assert.match(workspace, /type:\s*"credit"/);
assert.match(workspace, /type:\s*"paid"/);
assert.match(
  marketCss,
  /\.market-order-product-grid\s*\{[\s\S]*min-height:\s*112px/,
  "Order product grid must keep a visible minimum height."
);
assert.doesNotMatch(workspace, /createPaidSale/);
assert.doesNotMatch(workspace, /applyInventoryMovement/);
assert.doesNotMatch(workspace, /createCustomerCreditSale/);

assert.match(runtime, /resolveRuntimeProductPrice/);
assert.match(runtime, /wholesaleEnabled:\s*hasPersistedBusinessCapability\(databasePath, BUSINESS_CAPABILITIES\.WHOLESALE\)/);
assert.match(orderStore, /resolveCommerceProductPriceInDatabase/);
assert.doesNotMatch(
  orderStore,
  /const unitPrice = roundMoney\(Number\(row\.sale_price/,
  "Order snapshot must not bypass centralized pricing."
);

assert.match(contract, /resolveProductPrice:/);
assert.match(contract, /fulfillOrder:/);
assert.match(ipc, /commerce:price:resolve/);
assert.match(ipc, /commerce:order:fulfill/);
assert.match(preload, /resolveProductPrice:\s*\(input\) => invokeWhenUnlocked<CommerceResolvedUnitPrice>\("commerce:price:resolve"/);
assert.match(integratedSmoke, /Siparişi Kaydet/);
assert.match(integratedSmoke, /Siparişi Onayla/);
assert.match(integratedSmoke, /Siparişi Tamamla/);
assert.match(integratedSmoke, /commerce_order_fulfillments/);
assert.match(integratedSmoke, /settlement\.paymentMethod/);
assert.match(integratedSmoke, /unit_price/);
assert.match(integratedSmoke, /Simulated lost createOrder response/);
assert.match(integratedSmoke, /Retrying the unchanged draft must reuse the same idempotency reference/);
assert.match(integratedSmoke, /commerce_sales/);

console.log("commerce-wholesale-orders-ui-contract-smoke-ok");
