import { ipcMain } from "electron";
import type { DesktopCommerceBridge } from "./commerce-ipc-contract";
import {
  applyRuntimeInventoryMovement,
  createRuntimePaidSale,
  deleteRuntimeCatalogCategory,
  findRuntimeProductByBarcode,
  getCommerceRuntimeSnapshot,
  getRuntimeCatalogCategory,
  getRuntimeInventoryBalance,
  getRuntimePurchaseOrder,
  listRuntimeCatalogCategories,
  listRuntimeCatalogProducts,
  listRuntimeInventoryMovements,
  listRuntimePurchaseOrders,
  listRuntimeSuppliers,
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
  ipcMain.handle("commerce:product:save", (_event, input: Parameters<DesktopCommerceBridge["saveProduct"]>[0]) =>
    mutate(() => saveRuntimeCatalogProduct(databasePath(), input))
  );
  ipcMain.handle("commerce:product:findByBarcode", (_event, barcode: string) =>
    read(() => findRuntimeProductByBarcode(databasePath(), barcode))
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
