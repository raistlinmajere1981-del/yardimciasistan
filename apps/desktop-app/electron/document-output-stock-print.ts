import { BrowserWindow, dialog, ipcMain } from "electron";
import { DatabaseSync } from "node:sqlite";
import type { IpcMainInvokeEvent } from "electron";
import type { DocumentOutputManagementResult } from "@yardimci-asistan/shared";
import { DocumentOutputManagement, DocumentOutputManagementError, sanitizeDocumentPrinters } from "./document-output-management";
// Source is loaded only on an authorized print request, never during IPC registration.
import { selectStockReportRows, composeStockReportHtml } from "./document-output-stock-report";
import { openDocumentWindow } from "./document-output-pdf";

type Result = DocumentOutputManagementResult<"accepted" | "failed" | "unknown" | null>;
interface StockPrintOptions {
  databasePath(): string;
  installationId(): string;
  assertAuthorized(event: IpcMainInvokeEvent): void;
}
const kind = "stock_replenishment" as const;
const err = (code: string): never => { throw new DocumentOutputManagementError(code); };

/** Reuses Baskı Yönetimi's tenant, capability, manual policy and device binding.
 * A read-only, variable-length report is deliberately not stored as a single-page
 * receipt job. Network-denied Electron's native print path handles A4 pagination. */
export function registerStockReplenishmentPrintIpc(options: StockPrintOptions) {
  ipcMain.handle("documentOutput:printStockReplenishment", async (event, ...args: unknown[]): Promise<Result> => {
    let db: DatabaseSync | undefined;
    try {
      const gate = () => options.assertAuthorized(event);
      gate();
      if (args.length !== 1) err("DOCUMENT_STOCK_INPUT_INVALID");
      db = new DatabaseSync(options.databasePath());
      db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
      const owner = new DocumentOutputManagement(db, { role: "desktop_owner", assertAuthorized: gate });
      const businessId = owner.authorizePrinterAccess({ documentKind: kind });
      const installationId = options.installationId();
      const settings = () => {
        gate();
        if (owner.authorizePrinterAccess({ documentKind: kind }) !== businessId || options.installationId() !== installationId) err("DOCUMENT_TENANT_CHANGED");
        const row = db!.prepare("SELECT r.mode,r.adapter,p.printer_ref FROM document_output_rules r LEFT JOIN document_printer_bindings p ON p.business_id=r.business_id AND p.installation_id=? AND p.id=? WHERE r.business_id=? AND r.document_kind=? AND r.trigger_kind='manual' AND r.channel='print'")
          .get(installationId, kind, businessId, kind) as { mode: string; adapter: string; printer_ref: string | null } | undefined;
        if (!row || row.mode !== "ASK_CONFIRMATION" || row.adapter !== "native_print") throw new DocumentOutputManagementError("DOCUMENT_STOCK_CONFIGURATION_MISSING");
        if (typeof row.printer_ref !== "string" || !row.printer_ref.trim()) throw new DocumentOutputManagementError("DOCUMENT_STOCK_PRINTER_MISSING");
        return row.printer_ref;
      };
      const printer = settings();
      const { listStockReplenishment } = await import("./stock-replenishment");
      const rows = selectStockReportRows(listStockReplenishment(options.databasePath()), args[0]);
      const business = db.prepare("SELECT name FROM business WHERE id=? AND deleted_at=''").get(businessId) as { name: string } | undefined;
      if (!business) throw new DocumentOutputManagementError("DOCUMENT_TENANT_CHANGED");
      const html = composeStockReportHtml(rows, business.name, new Date().toLocaleString("tr-TR"));
      const parent = BrowserWindow.fromWebContents(event.sender);
      if (!parent) throw new DocumentOutputManagementError("DOCUMENT_OWNER_REQUIRED");
      gate();
      const confirmation = await dialog.showMessageBox(parent, {
        type: "question", title: "Stok ihtiyaç listesini yazdır",
        message: String(rows.length) + " ürün içeren stok ihtiyaç listesi " + printer + " yazıcısına gönderilsin mi?",
        detail: "A4 yatay · Çok sayfalı belge · Sipariş oluşturulmaz. Yazdırma sonucundan emin olunmadan tekrar gönderim yapmayın.",
        buttons: ["Vazgeç", "Yazdır"], defaultId: 0, cancelId: 0, noLink: true
      });
      if (confirmation.response !== 1) return { ok: true, value: null };
      if (settings() !== printer) err("DOCUMENT_STOCK_CONFIGURATION_CHANGED");
      const opened = await openDocumentWindow(html);
      try {
        if (settings() !== printer) err("DOCUMENT_STOCK_CONFIGURATION_CHANGED");
        const available = sanitizeDocumentPrinters(await opened.window.webContents.getPrintersAsync());
        if (!available.some(value => value.name === printer)) err("DOCUMENT_STOCK_PRINTER_MISSING");
        if (settings() !== printer) err("DOCUMENT_STOCK_CONFIGURATION_CHANGED");
        const outcome = await new Promise<"accepted" | "failed" | "unknown">(resolve => {
          let done = false;
          const finish = (value: "accepted" | "failed" | "unknown") => {
            if (done) return;
            done = true; clearTimeout(timeout); resolve(value);
          };
          const timeout = setTimeout(() => finish("unknown"), 30_000);
          opened.window.once("closed", () => finish("unknown"));
          try {
            opened.window.webContents.print({
              silent: true, deviceName: printer, printBackground: true, copies: 1,
              pageSize: { width: 297000, height: 210000 }
            }, success => finish(success ? "accepted" : "failed"));
          } catch { finish("unknown"); }
        });
        return { ok: true, value: outcome };
      } finally { opened.close(); }
    } catch (cause) {
      const code = cause instanceof DocumentOutputManagementError ? cause.message
        : cause instanceof Error && cause.message.startsWith("DOCUMENT_STOCK_") ? cause.message : "DOCUMENT_STOCK_PRINT_FAILED";
      const message = code === "DOCUMENT_STOCK_CONFIGURATION_MISSING" || code === "DOCUMENT_STOCK_PRINTER_MISSING"
        ? "Baskı Yönetimi → Stok ihtiyaç listesi bölümünden yazıcı seçip yazdırma onayını etkinleştirin."
        : code === "DOCUMENT_STOCK_CHANGED" ? "Seçilen ürünlerden birinin stok ihtiyacı değişmiş. Listeyi yenileyip tekrar deneyin."
          : code === "DOCUMENT_STOCK_EMPTY" ? "Yazdırılacak stok ihtiyacı bulunamadı."
            : code === "DOCUMENT_CAPABILITY_DISABLED" ? "Stok takibi ve Baskı Yönetimi özellikleri etkin olmalı."
              : code === "DOCUMENT_STOCK_CONFIGURATION_CHANGED" || code === "DOCUMENT_TENANT_CHANGED"
                ? "Yazıcı, işletme veya yetki değişti. Listeyi ve ayarları yeniden kontrol edin."
                : "Stok ihtiyaç listesi yazdırılamadı. Güncel verileri ve baskı ayarlarını kontrol edin.";
      return { ok: false, code, message };
    } finally { db?.close(); }
  });
}
