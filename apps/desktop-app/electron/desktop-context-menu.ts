import {
  Menu,
  type BrowserWindow,
  type MenuItemConstructorOptions
} from "electron";

export function installDesktopContextMenu(window: BrowserWindow): void {
  window.webContents.on("context-menu", (_event, params) => {
    const template: MenuItemConstructorOptions[] = [];

    if (params.isEditable) {
      template.push(
        { label: "Geri Al", role: "undo", enabled: params.editFlags.canUndo },
        { label: "Yinele", role: "redo", enabled: params.editFlags.canRedo },
        { type: "separator" },
        { label: "Kes", role: "cut", enabled: params.editFlags.canCut },
        { label: "Kopyala", role: "copy", enabled: params.editFlags.canCopy },
        { label: "Yapıştır", role: "paste", enabled: params.editFlags.canPaste },
        { label: "Sil", role: "delete", enabled: params.editFlags.canDelete },
        { type: "separator" },
        { label: "Tümünü Seç", role: "selectAll", enabled: params.editFlags.canSelectAll }
      );
    } else if (params.selectionText.trim()) {
      template.push(
        { label: "Kopyala", role: "copy", enabled: params.editFlags.canCopy },
        { type: "separator" },
        { label: "Tümünü Seç", role: "selectAll", enabled: params.editFlags.canSelectAll }
      );
    }

    if (template.length === 0) return;
    Menu.buildFromTemplate(template).popup({ window });
  });
}
