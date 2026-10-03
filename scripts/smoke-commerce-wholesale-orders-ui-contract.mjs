import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const intent = read("apps/desktop-app/src/components/workspace/workspace-intent.ts");
const navigation = read("apps/desktop-app/src/app/navigation.ts");
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
assert.match(navigation, /condition:\s*\{ anyOf: \[C\.CATALOG, C\.SALES, C\.ORDERS/);
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
