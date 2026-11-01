import type { DatabaseSync } from "node:sqlite";
import { sanitizeDocumentPrinters } from "./document-output-management";
import { openDocumentWindow, prepareDocumentHtml } from "./document-output-pdf";
import { claimConfirmedManualPrint, finishManualPrintClaim } from "./document-output-print-claim";
import type { DocumentSnapshotScope } from "./document-output-snapshot-store";

type PrintResult = "accepted" | "failed" | "unknown";
type Options = { silent: true; deviceName: string; printBackground: true; copies: number; pageSize: { width: number; height: number } };
type PrintWindow = {
  getPrinters(): Promise<unknown>;
  print(options: Options, callback: (success: boolean) => void): void;
  onDestroyed(callback: () => void): void;
  close(): void;
};
type Dependencies = {
  prepare(db: DatabaseSync, scope: DocumentSnapshotScope): { html: string; snapshot: { pageWidth: number; pageHeight: number } };
  open(html: string): Promise<PrintWindow>;
  timeoutMs: number;
};

/** Main-process only. Scope and both callbacks must originate in the trusted unlocked
 * owner session, never in renderer input. Confirmation is per invocation; authority
 * must synchronously recheck the same session and identities on every call. */
export async function printConfirmedDocument(
  db: DatabaseSync, scope: DocumentSnapshotScope,
  authority: { assertAuthorized(): void; assertExplicitUserConfirmation(): Promise<void> },
  dependencies: Dependencies = nativeDependencies
): Promise<PrintResult | null> {
  scope = { ...scope };
  authority.assertAuthorized();
  const { snapshot, html } = dependencies.prepare(db, scope);
  const window = await dependencies.open(html);
  try {
    authority.assertAuthorized();
    await authority.assertExplicitUserConfirmation();
    authority.assertAuthorized();
    const printers = sanitizeDocumentPrinters(await window.getPrinters()).map(printer => printer.name);
    authority.assertAuthorized();
    const claim = claimConfirmedManualPrint(db, scope, { assertConfirmedAndAuthorized: () => authority.assertAuthorized(), availableDeviceNames: printers });
    if (!claim) return null;
    let result: PrintResult = "failed";
    try {
      authority.assertAuthorized();
      result = await new Promise<PrintResult>(resolve => {
        let settled = false;
        const finish = (value: PrintResult) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
        const timer = setTimeout(() => finish("unknown"), dependencies.timeoutMs);
        window.onDestroyed(() => finish("unknown"));
        if (settled) return;
        try {
          window.print({ silent: true, deviceName: claim.deviceName, printBackground: true, copies: claim.copies, pageSize: { width: snapshot.pageWidth * 100, height: snapshot.pageHeight * 100 } }, success => finish(success ? "accepted" : "failed"));
        } catch { finish("unknown"); }
      });
    } finally { finishManualPrintClaim(db, scope, result); }
    return result;
  } finally { window.close(); }
}

const nativeDependencies: Dependencies = {
  prepare: prepareDocumentHtml,
  async open(html) {
    const { window, close } = await openDocumentWindow(html);
    return {
      getPrinters: () => window.webContents.getPrintersAsync(),
      print: (options, callback) => window.webContents.print(options, callback),
      onDestroyed: callback => { if (window.isDestroyed()) callback(); else window.once("closed", callback); },
      close
    };
  },
  timeoutMs: 30_000
};
