import { ipcMain } from "electron";
import { prepareCustomerCreditWhatsApp } from "./customer-credit-whatsapp";
import type { CommerceIpcMutationResult, DesktopCommerceBridge } from "./commerce-ipc-contract";
import { desktopLog } from "./desktop-logger";
import {
  archiveExternalProductImage,
  previewExternalProductImage
} from "./product-data-service";
import {
  addCustomerCreditAdjustment,
  createCustomerCreditSale,
  getCustomerCreditAccount,
  listCustomerCreditAccounts,
  listCustomerCreditEntries,
  recordCustomerCreditPayment,
  applyRuntimeInventoryMovement,
  createRuntimePaidSale,
  consumePendingMarketBarcodeScans,
  deleteRuntimeCatalogCategory,
  findRuntimeProductByBarcode,
  getCommerceRuntimeSnapshot,
  getRuntimeCatalogCategory,
  getRuntimeProductImageDataUrl,
  lookupRuntimeExternalProductByBarcode,
  getRuntimeInventoryBalance,
  getRuntimePurchaseOrder,
  getMarketCartDraft,
  loadMarketCartDraftForQuickSale,
  listRuntimeCatalogCategories,
  listRuntimeCatalogProducts,
  listRuntimeInventoryMovements,
  listRuntimePurchaseOrders,
  listRuntimeSuppliers,
  listMarketCartDrafts,
  markMarketCartDraftReviewed,
  receiveRuntimePurchase,
  saveRuntimeCatalogCategory,
  saveRuntimeCatalogProduct,
  saveRuntimeSupplier,
  setRuntimeInventoryCount
} from "./commerce-runtime";

const EXPECTED_COMMERCE_REJECTIONS: Array<{ code: string; pattern: RegExp }> = [
  { code: "insufficient_stock", pattern: /^Yetersiz stok\./ },
  { code: "inventory_conflict", pattern: /^Stok bu sayımdan sonra değişti\./ },
  { code: "invalid_inventory_operation", pattern: /^(?:Stok işlemi için ürün bulunamadı\.|Bu ürün stok takibine kapalı\.|Stok konumu bulunamadı\.|Geçersiz stok hareketi:|Stok hareketi sıfırdan farklı olmalı\.|Sayım miktarı )/ },
  { code: "invalid_sale", pattern: /^(?:Satış için en az bir ürün gerekli\.|Satış adedi sıfırdan büyük olmalı\.|Satış ürünlerinden biri aktif değil veya bulunamadı\.|Tek satışta birden fazla para birimi kullanılamaz\.)/ },
  { code: "invalid_credit", pattern: /^(?:Veresiye \/ Müşteri Hesabı|Veresiye için |Tutar mevcut veresiye borcunu aşamaz\.|Tahsilat |Düzeltme |Para birimi geçersiz\.|Tutar pozitif tam sayı)/ },
  { code: "invalid_category", pattern: /^(?:Kategori kendi üst kategorisi olamaz\.|Kategori hiyerarşisinde döngü oluşturulamaz\.|Kategori kimliği boş olamaz\.|Kategori adı gerekli\.|Kategori adı en fazla 160 karakter olabilir\.|Düzenlenecek kategori bulunamadı\.|Silinecek kategori bulunamadı\.|Alt kategorisi bulunan kategori silinemez\.|Ürün bağlı olan kategori silinemez\.|Üst kategori bulunamadı\.)/ },
  { code: "invalid_product", pattern: /^(?:Barkod boş olamaz\.|Ürün adı gerekli\.|Ürün adı en fazla 180 karakter olabilir\.|Düzenlenecek ürün bulunamadı\.|Seçilen ürün kategorisi bulunamadı\.|Bu barkod başka bir üründe kullanılıyor\.|Bu stok kodu başka bir üründe kullanılıyor\.)/ },
  { code: "invalid_supplier", pattern: /^(?:Tedarikçi adı gerekli\.|Düzenlenecek tedarikçi bulunamadı\.)/ },
  { code: "invalid_purchase", pattern: /^(?:Satın alma |Seçilen tedarikçi |Aynı ürün satın alma |Tek satın alma kaydında |Sipariş tarihi geçersiz\.)/ }
];

export function classifyExpectedCommerceRejection(error: unknown): { code: string; message: string } | null {
  if (!(error instanceof Error)) return null;
  const message = String(error.message ?? "").trim();
  if (!message) return null;
  const match = EXPECTED_COMMERCE_REJECTIONS.find((candidate) => candidate.pattern.test(message));
  return match ? { code: match.code, message } : null;
}

export function registerCommerceIpcHandlers(options: {
  databasePath: () => string;
  assertUnlocked: () => void;
  onMutation?: () => void;
}) {
  const databasePath = () => options.databasePath();
  const read = <T>(operation: () => T): T => {
    options.assertUnlocked();
    return operation();
  };
  const mutate = <T>(operation: () => T): T => {
    options.assertUnlocked();
    const result = operation();
    options.onMutation?.();
    return result;
  };
  const mutateForIpc = <T>(channel: string, operation: () => T): CommerceIpcMutationResult<T> => {
    try {
      return { ok: true, value: mutate(operation) };
    } catch (error) {
      const rejection = classifyExpectedCommerceRejection(error);
      if (!rejection) throw error;
      desktopLog.warn({
        scope: "commerce",
        event: "commerce.domain.rejected",
        message: rejection.message,
        meta: {
          channel,
          code: rejection.code
        }
      });
      return {
        ok: false,
        expected: true,
        code: rejection.code,
        message: rejection.message
      };
    }
  };
  const ephemeralMutate = <T>(operation: () => T): T => {
    options.assertUnlocked();
    return operation();
  };

  ipcMain.handle("commerce:getSnapshot", () =>
    read(() => getCommerceRuntimeSnapshot(databasePath()))
  );

  ipcMain.handle("commerce:category:list", (_event, optionsArg: Parameters<DesktopCommerceBridge["listCategories"]>[0]) =>
    read(() => listRuntimeCatalogCategories(databasePath(), optionsArg))
  );
  ipcMain.handle("commerce:category:get", (_event, categoryId: string) =>
    read(() => getRuntimeCatalogCategory(databasePath(), categoryId))
  );
  ipcMain.handle("commerce:category:save", (_event, input: Parameters<DesktopCommerceBridge["saveCategory"]>[0]) =>
    mutateForIpc("commerce:category:save", () => saveRuntimeCatalogCategory(databasePath(), input))
  );
  ipcMain.handle("commerce:category:delete", (_event, categoryId: string) =>
    mutateForIpc("commerce:category:delete", () => deleteRuntimeCatalogCategory(databasePath(), categoryId))
  );

  ipcMain.handle("commerce:product:list", (_event, optionsArg: Parameters<DesktopCommerceBridge["listProducts"]>[0]) =>
    read(() => listRuntimeCatalogProducts(databasePath(), optionsArg))
  );
  ipcMain.handle("commerce:product:save", async (_event, input: Parameters<DesktopCommerceBridge["saveProduct"]>[0]) => {
    const mutation = mutateForIpc("commerce:product:save", () => saveRuntimeCatalogProduct(databasePath(), input));
    if (!mutation.ok) return mutation;
    let saved = mutation.value;
    if (saved.imageSourceUrl && !saved.imageAssetPath && input.imageSourceUrl !== undefined) {
      try {
        const imageAssetPath = await archiveExternalProductImage(databasePath(), saved.id, saved.dataSource, saved.imageSourceUrl);
        if (imageAssetPath) saved = { ...saved, imageAssetPath };
      } catch (error) {
        desktopLog.warn({
          scope: "product-data",
          event: "product-data.image-archive.failed",
          message: "Ürün görseli arşivlenemedi.",
          meta: { productId: saved.id },
          error
        });
      }
    }
    return { ok: true, value: saved } satisfies CommerceIpcMutationResult<typeof saved>;
  });
  ipcMain.handle("commerce:product:findByBarcode", (_event, barcode: string) =>
    read(() => findRuntimeProductByBarcode(databasePath(), barcode))
  );
  ipcMain.handle("commerce:product:lookupExternal", (_event, barcode: string, mode: NonNullable<Parameters<DesktopCommerceBridge["lookupExternalProductByBarcode"]>[1]> = "manual") =>
    read(() => lookupRuntimeExternalProductByBarcode(databasePath(), barcode, mode))
  );
  ipcMain.handle("commerce:product:previewExternalImage", async (_event, provider: string, imageUrl: string) => {
    options.assertUnlocked();
    try {
      return await previewExternalProductImage(provider, imageUrl);
    } catch (error) {
      desktopLog.warn({
        scope: "product-data",
        event: "product-data.image-preview.failed",
        message: "Ürün görseli önizlemesi alınamadı.",
        meta: { provider },
        error
      });
      return "";
    }
  });
  ipcMain.handle("commerce:product:imageDataUrl", (_event, productId: string) =>
    read(() => getRuntimeProductImageDataUrl(databasePath(), productId))
  );

  ipcMain.handle("commerce:inventory:getBalance", (_event, productId: string, locationId?: string) =>
    read(() => getRuntimeInventoryBalance(databasePath(), productId, locationId))
  );
  ipcMain.handle("commerce:inventory:listMovements", (_event, optionsArg: Parameters<DesktopCommerceBridge["listInventoryMovements"]>[0]) =>
    read(() => listRuntimeInventoryMovements(databasePath(), optionsArg))
  );
  ipcMain.handle("commerce:inventory:applyMovement", (_event, input: Parameters<DesktopCommerceBridge["applyInventoryMovement"]>[0]) =>
    mutateForIpc("commerce:inventory:applyMovement", () => applyRuntimeInventoryMovement(databasePath(), input))
  );
  ipcMain.handle("commerce:inventory:setCount", (_event, input: Parameters<DesktopCommerceBridge["setInventoryCount"]>[0]) =>
    mutateForIpc("commerce:inventory:setCount", () => setRuntimeInventoryCount(databasePath(), input))
  );

  ipcMain.handle("commerce:sale:createPaid", (_event, input: Parameters<DesktopCommerceBridge["createPaidSale"]>[0]) =>
    mutateForIpc("commerce:sale:createPaid", () => createRuntimePaidSale(databasePath(), input))
  );

  ipcMain.handle("commerce:customerCredit:list", (_event, input: Parameters<DesktopCommerceBridge["listCustomerCreditAccounts"]>[0]) =>
    read(() => listCustomerCreditAccounts(databasePath(), input))
  );
  ipcMain.handle("commerce:customerCredit:get", (_event, customerId: string) =>
    read(() => getCustomerCreditAccount(databasePath(), customerId))
  );
  ipcMain.handle("commerce:customerCredit:prepareWhatsApp", (_event, input: Parameters<DesktopCommerceBridge["prepareCustomerCreditWhatsApp"]>[0]) =>
    read(() => prepareCustomerCreditWhatsApp(databasePath(), input))
  );
  ipcMain.handle("commerce:customerCredit:entries", (_event, customerId: string, input: Parameters<DesktopCommerceBridge["listCustomerCreditEntries"]>[1]) =>
    read(() => listCustomerCreditEntries(databasePath(), customerId, input))
  );
  ipcMain.handle("commerce:customerCredit:sale", (_event, input: Parameters<DesktopCommerceBridge["createCustomerCreditSale"]>[0]) =>
    mutateForIpc("commerce:customerCredit:sale", () => createCustomerCreditSale(databasePath(), input))
  );
  ipcMain.handle("commerce:customerCredit:payment", (_event, input: Parameters<DesktopCommerceBridge["recordCustomerCreditPayment"]>[0]) =>
    mutateForIpc("commerce:customerCredit:payment", () => recordCustomerCreditPayment(databasePath(), input))
  );
  ipcMain.handle("commerce:customerCredit:adjustment", (_event, input: Parameters<DesktopCommerceBridge["addCustomerCreditAdjustment"]>[0]) =>
    mutateForIpc("commerce:customerCredit:adjustment", () => addCustomerCreditAdjustment(databasePath(), input))
  );

  ipcMain.handle("commerce:cartDraft:list", (_event, optionsArg: Parameters<DesktopCommerceBridge["listCartDrafts"]>[0]) =>
    read(() => listMarketCartDrafts(databasePath(), optionsArg))
  );
  ipcMain.handle("commerce:cartDraft:get", (_event, draftId: string) =>
    read(() => getMarketCartDraft(databasePath(), draftId))
  );
  ipcMain.handle("commerce:cartDraft:loadForQuickSale", (_event, draftId: string) =>
    read(() => loadMarketCartDraftForQuickSale(databasePath(), draftId))
  );
  ipcMain.handle("commerce:cartDraft:markReviewed", (_event, draftId: string) =>
    mutateForIpc("commerce:cartDraft:markReviewed", () => markMarketCartDraftReviewed(databasePath(), draftId))
  );
  ipcMain.handle("commerce:barcodeScan:consumePending", (_event, optionsArg: Parameters<DesktopCommerceBridge["consumePendingBarcodeScans"]>[0]) =>
    ephemeralMutate(() => consumePendingMarketBarcodeScans(databasePath(), optionsArg))
  );

  ipcMain.handle("commerce:supplier:list", (_event, optionsArg: Parameters<DesktopCommerceBridge["listSuppliers"]>[0]) =>
    read(() => listRuntimeSuppliers(databasePath(), optionsArg))
  );
  ipcMain.handle("commerce:supplier:save", (_event, input: Parameters<DesktopCommerceBridge["saveSupplier"]>[0]) =>
    mutateForIpc("commerce:supplier:save", () => saveRuntimeSupplier(databasePath(), input))
  );

  ipcMain.handle("commerce:purchase:list", (_event, optionsArg: Parameters<DesktopCommerceBridge["listPurchaseOrders"]>[0]) =>
    read(() => listRuntimePurchaseOrders(databasePath(), optionsArg))
  );
  ipcMain.handle("commerce:purchase:get", (_event, purchaseOrderId: string) =>
    read(() => getRuntimePurchaseOrder(databasePath(), purchaseOrderId))
  );
  ipcMain.handle("commerce:purchase:receive", (_event, input: Parameters<DesktopCommerceBridge["receivePurchase"]>[0]) =>
    mutateForIpc("commerce:purchase:receive", () => receiveRuntimePurchase(databasePath(), input))
  );
}
