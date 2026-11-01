import type { BrowserWindow } from "electron";
import type { DatabaseSync } from "node:sqlite";
import { openDocumentWindow, prepareDocumentHtml } from "./document-output-pdf";
import type { DocumentSnapshotScope } from "./document-output-snapshot-store";

/** The callback reopens its own authority scope; it must not capture the request DB. */
export async function previewReadyDocument(db: DatabaseSync, scope: DocumentSnapshotScope, parent: BrowserWindow, assertAuthorized: () => void): Promise<void> {
  const { snapshot, html } = prepareDocumentHtml(db, scope);
  // Only screen overflow changes; the composed page and its physical print geometry remain intact.
  const previewHtml = html.replace("</head>", "<style>html{overflow:auto}body{overflow:hidden}</style></head>");
  const opened = await openDocumentWindow(previewHtml, parent);
  const { window, close } = opened;
  let timer: ReturnType<typeof setInterval> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const onParentClosed = () => close();
  window.once("closed", () => {
    if (timer) clearInterval(timer);
    if (expiry) clearTimeout(expiry);
    parent.removeListener("closed", onParentClosed);
  });
  try {
    if (parent.isDestroyed() || window.isDestroyed()) throw new Error("DOCUMENT_OWNER_REQUIRED");
    parent.once("closed", onParentClosed);
    assertAuthorized();
    const widthPx = snapshot.pageWidth / 10 * 96 / 25.4;
    window.webContents.setZoomFactor(Math.min(1, Math.max(0.25, (window.getContentBounds().width - 32) / widthPx)));
    window.webContents.on("before-input-event", (event, input) => {
      if (!(input.control || input.meta) || input.type !== "keyDown") return;
      if (["+", "=", "-", "0"].includes(input.key)) {
        event.preventDefault();
        const zoom = window.webContents.getZoomFactor();
        window.webContents.setZoomFactor(input.key === "0" ? 1 : Math.max(0.25, Math.min(3, zoom * (input.key === "-" ? 1 / 1.2 : 1.2))));
      } else if (["p", "P", "s", "S"].includes(input.key)) event.preventDefault();
    });
    timer = setInterval(() => { try { assertAuthorized(); } catch { close(); } }, 500);
    expiry = setTimeout(close, 5 * 60_000);
    window.show();
  } catch (error) { close(); throw error; }
}
