import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

const main = read("apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java");
const navigation = read("apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java");
const rules = read("apps/android-app/src/main/java/com/yardimciasistan/android/MarketUiRules.java");
const workspace = read("apps/android-app/src/main/java/com/yardimciasistan/android/MarketWorkspace.java");
const cameraScanner = read("apps/android-app/src/main/java/com/yardimciasistan/android/BarcodeCameraScanner.java");
const tests = read("apps/android-app/src/test/java/com/yardimciasistan/android/AndroidMarketUiTest.java");
const gradle = read("apps/android-app/build.gradle");
const manifest = read("apps/android-app/AndroidManifest.xml");
const foundation = read("scripts/check-modular-foundation.mjs");
const uiSources = `${workspace}\n${rules}\n${main}`;

assert.match(navigation, /TAB_MARKET\s*=\s*"market"/);
assert.match(navigation, /MarketUiRules\.canOpenMarket\(data\)/);
assert.match(main, /addNavButton\("Market", TAB_MARKET\)/);
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

assert.match(rules, /payload\.put\("counted_quantity", countedQuantity\)/);
assert.doesNotMatch(rules, /payload\.put\("(?:quantity_)?delta"/);
assert.match(rules, /serialized\.put\("unit_cost", line\.unitCost\)/);
assert.match(rules, /existing\.quantity\s*=\s*round\(existing\.quantity \+ 1/);
assert.match(rules, /payload\.put\("lines", serializedLines\)/);
assert.doesNotMatch(rules, /payload\.put\("payment/);

for (const label of [
  "Barkod Tara",
  "Kasa Barkod Modu",
  "Kamera barkodu gördüğünde tarama otomatik olarak masaüstü Hızlı Satış ekranına gönderilir.",
  "Kamerayı Aç",
  "Barkodu Elle Gir",
  "Modu Kapat",
  "Stok Say",
  "Mal Kabul",
  "Sepet",
  "Yeni Ürün",
  "Sayımı Kaydet",
  "Mal Kabulü Gönder",
  "Masaüstüne Gönder",
  "Ürünü Kaydet",
  "Ürün bilgileri doğrudan kataloğa kaydedilir.",
  "Barkod kayıtlı değil.",
  "Gönderim bekliyor"
]) {
  assert.equal(uiSources.includes(label), true, `Android Market UI label missing: ${label}`);
}

assert.match(workspace, /MarketUiRules\.canScanBarcode\(data\)/);
assert.match(workspace, /showProductPicker\(/);
assert.match(workspace, /data\.market\.summary/);
assert.match(workspace, /data\.market\.recentPurchases/);
assert.match(workspace, /summary\.recentStockAdjustments/);
assert.match(workspace, /submissionBlocked\(\)/);
assert.match(main, /onSubmissionQueued/);
assert.match(main, /containsOnlyMarketActions/);
assert.match(main, /sendMarketBarcodeScan/);
assert.match(workspace, /BarcodeCameraScanner\.show/);
assert.match(workspace, /requestCameraScanner\(PURPOSE_CASH, true\)/);
assert.match(cameraScanner, /CameraSelector\.DEFAULT_BACK_CAMERA/);
assert.match(cameraScanner, /BarcodeScanning\.getClient/);
assert.match(cameraScanner, /MarketUiRules\.BarcodeCameraGate/);
assert.match(manifest, /android\.permission\.CAMERA/);
const cashModeSource = workspace.slice(
  workspace.indexOf("private LinearLayout cashBarcodeScreen"),
  workspace.indexOf("private LinearLayout barcodeResultScreen")
);
assert.ok(cashModeSource.length > 0, "cash barcode mode source missing");
assert.doesNotMatch(cashModeSource, /Sepete Ekle|Stok Say|Mal Kabule Ekle|setPositiveButton/);

for (const forbidden of [
  "Satışı Tamamla",
  "paymentMethod",
  "payment_method",
  "invoice OCR",
  "pending purchase order"
]) {
  assert.equal(workspace.includes(forbidden), false, `Forbidden mobile-POS concept leaked into Market UI: ${forbidden}`);
}

assert.match(gradle, /androidx\.camera:camera-view:/);
assert.match(gradle, /com\.google\.mlkit:barcode-scanning:/);
assert.match(gradle, /testImplementation\s+"org\.json:json:/);

for (const coverage of [
  "pureMarketProfileOnlyExposesRelevantNavigation",
  "everyMarketCallToActionUsesItsEffectivePermission",
  "cashBarcodeModeVisibilityRequiresPermissionAndAllThreeCapabilities",
  "continuousBarcodeCaptureCreatesActionWithoutConfirmationAndDebounces",
  "cameraBarcodeGateRequiresBarcodeToLeaveFrameBeforeRepeating",
  "knownAndUnknownBarcodesResolveWithoutInventingProducts",
  "stockCountPayloadCarriesAbsoluteQuantityAndNoDelta",
  "repeatBarcodeIncrementsOneCartLineAndDraftHasNoPayment",
  "receivingBuildsMultipleLinesAndRejectsInvalidNumbers",
  "productCreatePayloadUsesDirectCatalogFields",
  "offlineActionPersistsAndPendingStateIsVisible",
  "missingMarketCapabilitiesRemainSafeForUi"
]) {
  assert.equal(tests.includes(coverage), true, `Android Market JVM coverage missing: ${coverage}`);
}

assert.match(foundation, /smoke-market-android-ui-contract\.mjs/);

console.log("market-android-ui-contract-smoke-ok");
