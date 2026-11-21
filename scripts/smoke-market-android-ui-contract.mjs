import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

const main = read("apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java");
const navigation = read("apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java");
const rules = read("apps/android-app/src/main/java/com/yardimciasistan/android/MarketUiRules.java");
const cameraScanner = read("apps/android-app/src/main/java/com/yardimciasistan/android/BarcodeCameraScanner.java");
const syncController = read("apps/android-app/src/main/java/com/yardimciasistan/android/AndroidOperationsSyncController.java");
const productLookup = read("apps/android-app/src/main/java/com/yardimciasistan/android/ProductDataLookupClient.java");
const photoUI = read("apps/android-app/src/main/java/com/yardimciasistan/android/MarketFormUi.java");
const catalogUI = read("apps/android-app/src/main/java/com/yardimciasistan/android/MarketCatalogBrowser.java");
const editorUI = read("apps/android-app/src/main/java/com/yardimciasistan/android/MarketProductEditor.java");
const gradle = read("apps/android-app/build.gradle");
const manifest = read("apps/android-app/AndroidManifest.xml");

assert.match(navigation, /TAB_MARKET\s*=\s*"market"/);
assert.match(navigation, /MarketUiRules\.canOpenMarket\(data\)/);
// Market menu ownership, permission withdrawal and swipe selection are exercised
// behaviorally by AndroidNavigationTest; do not freeze a shell method call here.
assert.match(main, /marketWorkspace\.create\(data, localPendingActionCount\(\), loading\)/);
assert.match(main, /marketWorkspace\.handleBack\(\)/);

for (const [actionType, permission] of [
  ["market_stock_count", "market.stock_count"],
  ["market_purchase_receive", "market.receiving"],
  ["market_product_create", "market.product_create"],
  ["market_cart_draft_create", "market.cart_draft"],
  ["market_barcode_scan", "market.scan_to_desktop"]
]) {
  assert.equal(rules.includes(`"${actionType}"`), true, `${actionType} UI action contract missing`);
  assert.equal(rules.includes(`"${permission}"`), true, `${permission} UI gate missing`);
}

// Form drafts, pending guards, dialog ordering and scanner callbacks are exercised
// by the isolated native UI fixture; payload semantics are covered by AndroidMarketUiTest.
assert.match(main, /onSubmissionQueued/);
assert.match(main, /sendMarketBarcodeScan/);
assert.match(main, /onProductImageRequested/);
assert.match(syncController, /containsOnlyMarketActions/);
assert.match(main, /retryingOnlyMarketActions/);
assert.match(cameraScanner, /CameraSelector\.DEFAULT_BACK_CAMERA/);
assert.match(cameraScanner, /BarcodeScanning\.getClient/);
assert.match(manifest, /android\.permission\.CAMERA/);
assert.match(productLookup, /world\.openfoodfacts\.org\/api\/v2\/product/);

// The same fixed neutral surface is used by picker thumbnails, product details
// and new-product previews. No Bitmap/pixel rewriting or theme-derived fill.
assert.match(photoUI, /PRODUCT_IMAGE_BACKGROUND\s*=\s*0xFFF5F5F4/);
assert.match(photoUI, /PRODUCT_IMAGE_BORDER\s*=\s*0xFFE7E5E4/);
assert.match(photoUI, /image\.setBackground\(UiKit\.rounded\(context, PRODUCT_IMAGE_BACKGROUND, PRODUCT_IMAGE_BORDER/);
assert.match(catalogUI, /ui\.productImageView\(cached, 58\)/);
assert.match(catalogUI, /MarketFormUi\.PRODUCT_IMAGE_BACKGROUND/);
assert.match(editorUI, /ui\.productImageView\(productCreateImagePreview, 180\)/);

assert.match(gradle, /androidx\.camera:camera-view:/);
assert.match(gradle, /com\.google\.mlkit:barcode-scanning:/);
assert.match(gradle, /testImplementation\s+"org\.json:json:/);

console.log("market-android-ui-contract-smoke-ok");
