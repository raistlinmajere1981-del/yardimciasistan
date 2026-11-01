import { BrowserWindow, nativeImage, session } from "electron";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { composeDocumentHtml } from "./document-output-html";
import { readDocumentRenderSnapshot, readDocumentSnapshotImages, type DocumentSnapshotScope } from "./document-output-snapshot-store";

/** Trusted main-process owner only. Scope must be derived from the unlocked local session. */
export async function renderDocumentPdf(db: DatabaseSync, scope: DocumentSnapshotScope): Promise<Buffer> {
  const { snapshot, html } = prepareDocumentHtml(db, scope);
  const { window, close } = await openDocumentWindow(html);
  try {
    const pdf = await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: { width: snapshot.pageWidth * 100, height: snapshot.pageHeight * 100 }, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("DOCUMENT_PDF_INVALID");
    return pdf;
  } finally { close(); }
}

/** Validate and compose frozen content before any irreversible delivery claim. */
export function prepareDocumentHtml(db: DatabaseSync, scope: DocumentSnapshotScope) {
  const snapshot = readDocumentRenderSnapshot(db, scope);
  if (!snapshot) throw new Error("DOCUMENT_SNAPSHOT_UNAVAILABLE");
  const images = readDocumentSnapshotImages(db, scope);
  for (const image of images) {
    if (nativeImage.createFromBuffer(image.bytes).isEmpty()) throw new Error("DOCUMENT_SNAPSHOT_IMAGES_INVALID");
  }
  return { snapshot, html: composeDocumentHtml(snapshot, images) };
}

/** Shared network-denied renderer for local PDF and native print. */
export async function openDocumentWindow(html: string, parent?: BrowserWindow) {
  const isolated = session.fromPartition(`document-pdf-${randomUUID()}`);
  const url = "https://document.invalid/";
  isolated.protocol.handle("https", request => request.url === url
    ? new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
    : new Response(null, { status: 403 }));
  isolated.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => callback({ cancel: details.url !== url }));
  const window = new BrowserWindow({ show: false, ...(parent ? { parent, width: 900, height: 800, title: "Belge önizleme" } : {}), webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, ...(parent ? { devTools: false } : {}) } });
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    isolated.protocol.unhandle("https");
    isolated.webRequest.onBeforeRequest(null);
    void isolated.clearStorageData().catch(() => {});
    void isolated.clearCache().catch(() => {});
  };
  const close = () => { if (!window.isDestroyed()) window.destroy(); cleanup(); };
  window.once("closed", cleanup);
  try {
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    await window.loadURL(url);
    return { window, close };
  } catch (error) { close(); throw error; }
}
