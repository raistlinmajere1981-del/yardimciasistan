import { BrowserWindow, ipcMain } from "electron";
import {
  listBusinessGallery, galleryDraftState, commitGalleryDraft, discardGalleryDraft,
  addGalleryPhoto, updateGalleryPhoto, removeGalleryPhoto, moveGalleryPhoto
} from "./business-gallery-service";

export function registerBusinessGalleryIpcHandlers(options: {
  userDataPath: () => string;
  assertUnlocked: () => void;
  onCommit: () => void;
}) {
  const path = () => { options.assertUnlocked(); return options.userDataPath(); };
  ipcMain.handle("businessGallery:list", () => listBusinessGallery(path()));
  ipcMain.handle("businessGallery:draftState", () => galleryDraftState(path()));
  ipcMain.handle("businessGallery:commit", () => {
    const result = commitGalleryDraft(path());
    if (result.ok && result.changed) options.onCommit();
    return result;
  });
  ipcMain.handle("businessGallery:discard", () => discardGalleryDraft(path()));
  ipcMain.handle("businessGallery:add", async (event) =>
    addGalleryPhoto(path(), BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle("businessGallery:update", (_event, input: { id: string; kind: "cover" | "photo"; title: string }) =>
    updateGalleryPhoto(path(), input.id, input.kind, input.title));
  ipcMain.handle("businessGallery:delete", (_event, id: string) => removeGalleryPhoto(path(), id));
  ipcMain.handle("businessGallery:move", (_event, input: { id: string; direction: "up" | "down" }) =>
    moveGalleryPhoto(path(), input.id, input.direction));
}
