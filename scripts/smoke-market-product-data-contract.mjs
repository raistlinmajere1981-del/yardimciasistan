import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

const service = read("apps/desktop-app/electron/product-data-service.ts");
const store = read("apps/desktop-app/electron/commerce-store.ts");
const ipc = read("apps/desktop-app/electron/commerce-ipc.ts");
const preload = read("apps/desktop-app/electron/preload.ts");
const settings = read("apps/desktop-app/src/components/settings/ServicesSettingsSection.tsx");
const quickSale = read("apps/desktop-app/src/components/market/MarketQuickSaleWorkspace.tsx");
const products = read("apps/desktop-app/src/components/market/MarketProductsWorkspace.tsx");
const productFields = read("apps/desktop-app/src/components/market/ProductFormFields.tsx");
const productWorkspace = read("apps/desktop-app/src/components/market/ProductWorkspace.tsx");
const productModel = read("apps/desktop-app/src/app/product-model.ts");
const marketController = read("apps/desktop-app/src/app/use-market-controller.ts");
const desktopAppView = read("apps/desktop-app/src/components/app/DesktopAppView.tsx");
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
assert.match(service, /prepareProductImageForSave/);
assert.match(service, /Manuel ürün görseli JPEG, PNG veya WEBP olmalı/);
assert.match(service, /fs\.renameSync\(tempPath, absolutePath\)/);

assert.match(store, /brand: String\(row\.brand/);
assert.match(store, /imageAssetPath: String\(row\.image_asset_path/);
assert.match(store, /dataSource: String\(row\.data_source/);

assert.match(ipc, /commerce:product:lookupExternal/);
assert.match(ipc, /commerce:product:previewExternalImage/);
assert.match(ipc, /prepareRuntimeCatalogProductImage/);
assert.match(service, /input\.manualImageDataUrl/);
assert.match(service, /input\.clearImage/);
assert.match(store, /manualImageDataUrl\?: string/);
assert.match(store, /clearImage\?: boolean/);
assert.match(ipc, /commerce:product:imageDataUrl/);
assert.match(preload, /lookupExternalProductByBarcode/);
assert.match(preload, /previewExternalProductImage/);
assert.match(preload, /getProductImageDataUrl/);

assert.match(settings, /title="Ürün Verisi"/);
assert.match(settings, /settings-product-data/);
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
assert.match(productModel, /normalizeBarcodeIdentity\(form\.barcode/);
assert.match(productFields, /lookupExternalProductByBarcode\(normalizedBarcode, "manual"\)/);
assert.match(productFields, /Ürün Bilgilerini Ara/);
assert.match(marketController, /productDataEnabled\?: boolean/);
assert.doesNotMatch(
  marketController,
  /getSetupData/,
  "Market controller must not cache Ürün Verisi state from a one-time setup read."
);
assert.match(
  desktopAppView,
  /productDataEnabled:\s*setupController\.setupData\.productData\.enabled/,
  "Saved Ürün Verisi state must flow directly from canonical setup into Market."
);
assert.match(productFields, /Ürün verisi:/);
assert.match(productFields, /previewExternalProductImage/);
assert.match(productFields, /accept="image\/jpeg,image\/png,image\/webp"/);
assert.match(productFields, /Görsel Ekle \/ Değiştir/);
assert.match(productFields, /Görseli Temizle/);
assert.match(productFields, /file\.size > 5 \* 1024 \* 1024/);
assert.match(productFields, /onManualImageSelected/);
assert.match(productFields, /onImageClear/);
assert.match(productWorkspace, /getProductImageDataUrl/);
assert.match(products, /entityType: "product"/);
assert.match(products, /lookupSeed=\{productLookupRequest\}/);

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
assert.match(syncCoordinator, /AndroidActionSyncService/);
assert.match(service, /archiveAndroidProductImage/);

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
