import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

const schema = read("apps/desktop-app/db/migrations/001_baseline.sql");
const service = read("apps/desktop-app/electron/product-data-service.ts");
const store = read("apps/desktop-app/electron/commerce-store.ts");
const ipc = read("apps/desktop-app/electron/commerce-ipc.ts");
const preload = read("apps/desktop-app/electron/preload.ts");
const settings = read("apps/desktop-app/src/components/settings/ServicesSettingsSection.tsx");
const quickSale = read("apps/desktop-app/src/components/market/MarketQuickSaleWorkspace.tsx");
const products = read("apps/desktop-app/src/components/market/MarketProductsWorkspace.tsx");
const productThumbnail = read("apps/desktop-app/src/components/market/MarketProductThumbnail.tsx");
const maintenance = read("apps/desktop-app/electron/data-maintenance.ts");
const dataPaths = read("apps/desktop-app/electron/data-paths.ts");
const androidSnapshot = read("apps/desktop-app/electron/market-android-snapshot.ts");
const androidActions = read("apps/desktop-app/electron/market-android-actions.ts");
const syncCoordinator = read("apps/desktop-app/electron/sync-coordinator.ts");
const androidOperationData = read("apps/android-app/src/main/java/com/yardimciasistan/android/OperationData.java");
const androidWorkspace = read("apps/android-app/src/main/java/com/yardimciasistan/android/MarketWorkspace.java");
const androidLookupClient = read("apps/android-app/src/main/java/com/yardimciasistan/android/ProductDataLookupClient.java");
const hostingSync = read("firm-template/web-module/api/sync.php");

for (const column of [
  "brand TEXT NOT NULL DEFAULT ''",
  "image_asset_path TEXT NOT NULL DEFAULT ''",
  "image_source_url TEXT NOT NULL DEFAULT ''",
  "data_source TEXT NOT NULL DEFAULT ''",
  "source_product_url TEXT NOT NULL DEFAULT ''",
  "data_license TEXT NOT NULL DEFAULT ''",
  "image_license TEXT NOT NULL DEFAULT ''",
  "source_fetched_at TEXT NOT NULL DEFAULT ''",
  "product_data_enabled INTEGER NOT NULL DEFAULT 0",
  "product_data_auto_search INTEGER NOT NULL DEFAULT 1",
  "product_data_include_images INTEGER NOT NULL DEFAULT 1"
]) {
  assert.ok(schema.includes(column), `Product data schema missing: ${column}`);
}

assert.match(service, /interface ProductLookupProvider/);
assert.match(service, /PRODUCT_LOOKUP_PROVIDERS/);
assert.match(service, /world\.openfoodfacts\.org\/api\/v2\/product/);
assert.match(service, /"User-Agent": userAgent\(\)/);
assert.match(service, /product_name/);
assert.match(service, /brands/);
assert.match(service, /image_front_url/);
assert.match(service, /dataLicense: "ODbL"/);
assert.match(service, /imageLicense: imageUrl \? "CC BY-SA" : ""/);
assert.match(service, /IMAGE_MAX_DIMENSION = 768/);
assert.match(service, /response\.status === 404[\s\S]*status: "not_found"/);
assert.match(service, /resolveProductAssetRelativePath/);
assert.match(service, /resolveProductAssetAbsolutePath/);
assert.match(service, /hostname\.endsWith\("\.openfoodfacts\.org"\)/);

assert.match(store, /brand: String\(row\.brand/);
assert.match(store, /imageAssetPath: String\(row\.image_asset_path/);
assert.match(store, /dataSource: String\(row\.data_source/);

assert.match(ipc, /commerce:product:lookupExternal/);
assert.match(ipc, /commerce:product:previewExternalImage/);
assert.match(ipc, /commerce:product:imageDataUrl/);
assert.match(preload, /lookupExternalProductByBarcode/);
assert.match(preload, /previewExternalProductImage/);
assert.match(preload, /getProductImageDataUrl/);

assert.match(settings, />Ürün Verisi</);
assert.match(settings, /Bilinmeyen barkodu otomatik ara/);
assert.match(settings, /Görselleri ekle/);
assert.match(settings, /Open Food Facts/);
assert.match(settings, /ODbL/);
assert.match(settings, /CC BY-SA/);
assert.doesNotMatch(settings, /Ürün formunu bulunan bilgilerle doldur/);

assert.match(quickSale, /lookupExternalProductByBarcode\(barcode, "automatic"\)/);
assert.match(quickSale, /onExternalProductFound/);
assert.match(quickSale, /MarketProductThumbnail/);
assert.match(productThumbnail, /getProductImageDataUrl/);
assert.match(products, /normalizeBarcodeIdentity\(productForm\.barcode/);
assert.match(products, /lookupExternalProductByBarcode\(normalizedBarcode, "manual"\)/);
assert.match(products, /Ürün Bilgilerini Ara/);
assert.match(products, /Ürün verisi:/);
assert.match(products, /previewExternalProductImage/);
assert.match(products, /getProductImageDataUrl/);

assert.match(dataPaths, /assets[^\n]*products|DESKTOP_PRODUCTS_DIR_NAME = "products"/);
assert.match(maintenance, /copyDurableAssets/);
assert.match(maintenance, /stagedRestoreAssetsPath/);
assert.match(maintenance, /replaceAssetsFromStagedRestore/);

assert.match(androidSnapshot, /product_data/);
assert.match(androidSnapshot, /product_data_auto_search/);
assert.match(androidSnapshot, /image_source_url/);
assert.match(androidSnapshot, /data_source/);
assert.match(androidActions, /brand: text\(payload\.brand\)/);
assert.match(androidActions, /imageSourceUrl: text\(payload\.image_source_url\)/);
assert.match(syncCoordinator, /archiveAndroidProductImage/);
assert.match(syncCoordinator, /archiveExternalProductImage/);

assert.match(androidOperationData, /MarketProductDataSettings/);
assert.match(androidOperationData, /auto_search_unknown_barcode/);
assert.match(androidOperationData, /imageSourceUrl/);
assert.match(androidOperationData, /dataSource/);
assert.match(androidWorkspace, /onProductLookupRequested/);
assert.match(androidWorkspace, /Ürün Bilgilerini Ara/);
assert.match(androidWorkspace, /productCreateImagePreview/);
assert.match(androidWorkspace, /onProductImageRequested/);
assert.match(androidWorkspace, /addProductImage/);
assert.match(androidLookupClient, /world\.openfoodfacts\.org\/api\/v2\/product/);
assert.match(androidLookupClient, /User-Agent/);
assert.match(androidLookupClient, /image_front_url/);
assert.match(androidLookupClient, /IMAGE_MAX_DIMENSION = 768/);
assert.match(androidLookupClient, /previewImage/);
assert.match(hostingSync, /'product_data'/);
assert.match(hostingSync, /market\.product_create|market_product_create/);

console.log("market-product-data-contract-smoke-ok");
