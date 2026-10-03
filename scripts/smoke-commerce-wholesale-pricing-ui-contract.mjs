import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const productModel = read("apps/desktop-app/src/app/product-model.ts");
const productFields = read("apps/desktop-app/src/components/market/ProductFormFields.tsx");
const marketProducts = read("apps/desktop-app/src/components/market/MarketProductsWorkspace.tsx");
const productWorkspace = read("apps/desktop-app/src/components/market/ProductWorkspace.tsx");
const customerModel = read("apps/desktop-app/src/app/customer-model.ts");
const customerFields = read("apps/desktop-app/src/components/customers/CustomerCommercialProfileFields.tsx");
const frame = read("apps/desktop-app/src/components/app/DesktopAppFrame.tsx");
const pricingService = read("apps/desktop-app/electron/commerce-pricing-service.ts");

assert.match(productModel, /dealerPriceA:\s*string/);
assert.match(productModel, /dealerPriceB:\s*string/);
assert.match(productModel, /dealerPriceA:\s*form\.dealerPriceA\.trim\(\)\s*\?/);
assert.match(productModel, /dealerPriceB:\s*form\.dealerPriceB\.trim\(\)\s*\?/);

assert.match(productFields, /wholesaleEnabled\s*\?/);
assert.match(productFields, /Perakende fiyat/);
assert.match(productFields, /Bayi A fiyatı/);
assert.match(productFields, /Bayi B fiyatı/);
assert.match(productFields, /placeholder="Perakende fiyatı kullan"/);

assert.match(marketProducts, /BUSINESS_CAPABILITIES\.WHOLESALE/);
assert.match(marketProducts, /wholesaleEnabled=\{wholesaleEnabled\}/);
assert.match(productWorkspace, /wholesaleEnabled=\{wholesaleEnabled\}/);
assert.match(
  frame,
  /wholesaleEnabled:\s*runtimeHasCapability\(businessCapabilities, BUSINESS_CAPABILITIES\.WHOLESALE\)/
);

assert.match(customerModel, /commercialPriceGroup:\s*"retail" \| "dealer_a" \| "dealer_b"/);
assert.match(customerFields, /aria-label="Fiyat grubu"/);
for (const label of ["Perakende", "Bayi A", "Bayi B"]) {
  assert.match(customerFields, new RegExp(label));
}

assert.match(pricingService, /readBusinessCapabilitySnapshot/);
assert.match(pricingService, /dealerEligible = wholesaleEnabled/);
assert.match(pricingService, /product\.dealer_price_a != null/);
assert.match(pricingService, /product\.dealer_price_b != null/);
assert.match(pricingService, /fallbackToRetail:/);

console.log("commerce-wholesale-pricing-ui-contract-smoke-ok");
