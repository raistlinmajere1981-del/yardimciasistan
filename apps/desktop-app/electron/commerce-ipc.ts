import { ipcMain } from "electron";
import { prepareCustomerCreditWhatsApp } from "./customer-credit-whatsapp";
import type { DesktopCommerceBridge } from "./commerce-ipc-contract";
import {
  archiveExternalProductImage,
  getProductImageDataUrl,
  lookupExternalProductByBarcode
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
    mutate(() => saveRuntimeCatalogCategory(databasePath(), input))
  );
  ipcMain.handle("commerce:category:delete", (_event, categoryId: string) =>
    mutate(() => deleteRuntimeCatalogCategory(databasePath(), categoryId))
  );

  ipcMain.handle("commerce:product:list", (_event, optionsArg: Parameters<DesktopCommerceBridge["listProducts"]>[0]) =>
    read(() => listRuntimeCatalogProducts(databasePath(), optionsArg))
  );
  ipcMain.handle("commerce:product:save", async (_event, input: Parameters<DesktopCommerceBridge["saveProduct"]>[0]) => {
    options.assertUnlocked();
    let saved = saveRuntimeCatalogProduct(databasePath(), input);
    if (saved.imageSourceUrl && !saved.imageAssetPath && input.imageSourceUrl !== undefined) {
      try {
        const imageAssetPath = await archiveExternalProductImage(databasePath(), saved.id, saved.imageSourceUrl);
        if (imageAssetPath) saved = { ...saved, imageAssetPath };
      } catch (error) {
        console.warn("[product-data] Ürün görseli arşivlenemedi:", error);
      }
    }
    options.onMutation?.();
    return saved;
  });
  ipcMain.handle("commerce:product:findByBarcode", (_event, barcode: string) =>
    read(() => findRuntimeProductByBarcode(databasePath(), barcode))
  );
  ipcMain.handle("commerce:product:lookupExternal", (_event, barcode: string, mode: Parameters<DesktopCommerceBridge["lookupExternalProductByBarcode"]>[1] = "manual") =>
    read(() => lookupExternalProductByBarcode(databasePath(), barcode, mode))
  );
  ipcMain.handle("commerce:product:imageDataUrl", (_event, productId: string) =>
    read(() => getProductImageDataUrl(databasePath(), productId))
  );

  ipcMain.handle("commerce:inventory:getBalance", (_event, productId: string, locationId?: string) =>
    read(() => getRuntimeInventoryBalance(databasePath(), productId, locationId))
  );
  ipcMain.handle("commerce:inventory:listMovements", (_event, optionsArg: Parameters<DesktopCommerceBridge["listInventoryMovements"]>[0]) =>
    read(() => listRuntimeInventoryMovements(databasePath(), optionsArg))
  );
  ipcMain.handle("commerce:inventory:applyMovement", (_event, input: Parameters<DesktopCommerceBridge["applyInventoryMovement"]>[0]) =>
    mutate(() => applyRuntimeInventoryMovement(databasePath(), input))
  );
  ipcMain.handle("commerce:inventory:setCount", (_event, input: Parameters<DesktopCommerceBridge["setInventoryCount"]>[0]) =>
    mutate(() => setRuntimeInventoryCount(databasePath(), input))
  );

  ipcMain.handle("commerce:sale:createPaid", (_event, input: Parameters<DesktopCommerceBridge["createPaidSale"]>[0]) =>
    mutate(() => createRuntimePaidSale(databasePath(), input))
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
    mutate(() => createCustomerCreditSale(databasePath(), input))
  );
  ipcMain.handle("commerce:customerCredit:payment", (_event, input: Parameters<DesktopCommerceBridge["recordCustomerCreditPayment"]>[0]) =>
    mutate(() => recordCustomerCreditPayment(databasePath(), input))
  );
  ipcMain.handle("commerce:customerCredit:adjustment", (_event, input: Parameters<DesktopCommerceBridge["addCustomerCreditAdjustment"]>[0]) =>
    mutate(() => addCustomerCreditAdjustment(databasePath(), input))
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
    mutate(() => markMarketCartDraftReviewed(databasePath(), draftId))
  );
  ipcMain.handle("commerce:barcodeScan:consumePending", (_event, optionsArg: Parameters<DesktopCommerceBridge["consumePendingBarcodeScans"]>[0]) =>
    ephemeralMutate(() => consumePendingMarketBarcodeScans(databasePath(), optionsArg))
  );

  ipcMain.handle("commerce:supplier:list", (_event, optionsArg: Parameters<DesktopCommerceBridge["listSuppliers"]>[0]) =>
    read(() => listRuntimeSuppliers(databasePath(), optionsArg))
  );
  ipcMain.handle("commerce:supplier:save", (_event, input: Parameters<DesktopCommerceBridge["saveSupplier"]>[0]) =>
    mutate(() => saveRuntimeSupplier(databasePath(), input))
  );

  ipcMain.handle("commerce:purchase:list", (_event, optionsArg: Parameters<DesktopCommerceBridge["listPurchaseOrders"]>[0]) =>
    read(() => listRuntimePurchaseOrders(databasePath(), optionsArg))
  );
  ipcMain.handle("commerce:purchase:get", (_event, purchaseOrderId: string) =>
    read(() => getRuntimePurchaseOrder(databasePath(), purchaseOrderId))
  );
  ipcMain.handle("commerce:purchase:receive", (_event, input: Parameters<DesktopCommerceBridge["receivePurchase"]>[0]) =>
    mutate(() => receiveRuntimePurchase(databasePath(), input))
  );
}
