import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { assertPersistedBusinessCapability } from "../business-capability-runtime";
import { listProductPhotos, mutateProductPhotos, prepareProductPhotoAddition, previewProductPhoto } from "../product-photo-store";
import type { AddProductPhotosInput, ReorderProductPhotosInput, SelectProductPhotoInput } from "@yardimci-asistan/shared";

export function registerProductPhotoIpcHandlers(options: { databasePath: () => string; assertUnlocked: () => void; onMutation?: () => void }) {
  const guard = (mutating = false, expectedPath?: string) => {
    options.assertUnlocked();
    const path = options.databasePath();
    if (expectedPath !== undefined && path !== expectedPath) throw new Error("Ürün veritabanı değişti; galeriyi yeniden açın.");
    assertPersistedBusinessCapability(path, BUSINESS_CAPABILITIES.CATALOG, "Ürün kataloğu bu işletmede etkin değil.");
    if (mutating) assertPersistedBusinessCapability(path, BUSINESS_CAPABILITIES.ONLINE_SALES, "Ürün fotoğraf yönetimi için Online Satış etkin olmalı.");
    return path;
  };
  ipcMain.handle("commerce:product:photos:list", (_event, productId: string) => listProductPhotos(guard(), productId));
  ipcMain.handle("commerce:product:photos:preview", (_event, productId: string, photoId: string) => previewProductPhoto(guard(), productId, photoId));
  ipcMain.handle("commerce:product:photos:add", async (_event, input: AddProductPhotosInput) => {
    const path = guard(true);
    const bytes = await prepareProductPhotoAddition(input?.dataUrls);
    guard(true, path);
    const result = mutateProductPhotos(path, input, { kind: "add", bytes });
    options.onMutation?.(); return result;
  });
  ipcMain.handle("commerce:product:photos:remove", (_event, input: SelectProductPhotoInput) => {
    const result = mutateProductPhotos(guard(true), input, { kind: "remove", photoId: input?.photoId });
    options.onMutation?.(); return result;
  });
  ipcMain.handle("commerce:product:photos:setCover", (_event, input: SelectProductPhotoInput) => {
    const result = mutateProductPhotos(guard(true), input, { kind: "cover", photoId: input?.photoId });
    options.onMutation?.(); return result;
  });
  ipcMain.handle("commerce:product:photos:reorder", (_event, input: ReorderProductPhotosInput) => {
    const result = mutateProductPhotos(guard(true), input, { kind: "reorder", photoIds: input?.photoIds });
    options.onMutation?.(); return result;
  });
}
