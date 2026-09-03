import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const quickSale = read("apps/desktop-app/src/components/market/MarketQuickSaleWorkspace.tsx");
const marketPage = read("apps/desktop-app/src/pages/MarketPage.tsx");

assert.match(quickSale, /bridge\.createPaidSale\s*\(/, "Quick Sale must call the guarded createPaidSale bridge.");
assert.match(quickSale, /source:\s*"desktop-market-quick-sale"/, "Quick Sale must identify its mutation source.");
assert.match(quickSale, /productId:\s*line\.product\.id/, "Quick Sale must submit product ids.");
assert.match(quickSale, /quantity:\s*line\.quantity/, "Quick Sale must submit quantities.");
assert.match(quickSale, /discountTotal:\s*discount/, "Quick Sale must submit only the requested discount total.");
assert.match(quickSale, /paymentMethod/, "Quick Sale must expose payment method selection.");
assert.doesNotMatch(quickSale, /bridge\.findProductByBarcode\b/, "M3 must not consume the M4 barcode runtime path.");

const saleCall = quickSale.match(/bridge\.createPaidSale\s*\(\{([\s\S]*?)\}\);/);
assert.ok(saleCall, "Quick Sale createPaidSale payload could not be inspected.");
assert.doesNotMatch(saleCall[1], /salePrice\s*:|unitPrice\s*:|subtotal\s*:|total\s*:/, "Renderer must not authoritatively submit sale prices or totals.");
assert.match(marketPage, /<MarketQuickSaleWorkspace/, "MarketPage must render the Quick Sale workspace.");

console.log("market-quick-sale-contract-smoke-ok");
