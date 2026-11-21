import { BrowserWindow, dialog, ipcMain } from "electron";
import { DatabaseSync } from "node:sqlite";
import {
  createQrSvg, resolveQrMenuPublicUrl, type DocumentOutputManagementResult,
  type PrintQrCodesInput
} from "@yardimci-asistan/shared";
import { DocumentOutputManagement, DocumentOutputManagementError, sanitizeDocumentPrinters } from "./document-output-management";
import { getQrRoomOrderConfig, listQrOrderRooms } from "./database/qr-room-order-config";
import { getQrTableOrderConfig, listQrOrderTables } from "./database/qr-table-order-config";
import { openDocumentWindow } from "./document-output-pdf";

type QrKind = "qr_menu" | "qr_room" | "qr_table";
type Result = DocumentOutputManagementResult<"accepted" | "failed" | "unknown" | null>;
type Item = { id: string; label: string; url: string };
interface QrPrintOptions {
  databasePath(): string;
  installationId(): string;
  webModuleUrl(): string;
  assertAuthorized(): void;
}
const error = (code: string): never => { throw new DocumentOutputManagementError(code); };
const text = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const idOk = (value: unknown): value is string => typeof value === "string"
  && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export function validateQrPrintInput(value: unknown): PrintQrCodesInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return error("QR_PRINT_INPUT_INVALID");
  const input = value as Record<string, unknown>;
  if (input.kind === "qr_menu" && Object.keys(input).length === 1) return { kind: "qr_menu" };
  if ((input.kind !== "qr_table" && input.kind !== "qr_room") || Object.keys(input).length !== 2
      || !Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 100
      || !input.ids.every(idOk) || new Set(input.ids).size !== input.ids.length) return error("QR_PRINT_INPUT_INVALID");
  return {kind: input.kind, ids: [...input.ids] };
}
function reportRows(db: DatabaseSync, url: string, input: PrintQrCodesInput): Item[] {
  const publicUrl = resolveQrMenuPublicUrl(url);
  if (!/^https?:\/\//.test(publicUrl)) error("QR_PRINT_URL_MISSING");
  const visibility = db.prepare("SELECT publish_qr_menu_web FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1")
    .get() as { publish_qr_menu_web: number } | undefined;
  if (!visibility || Number(visibility.publish_qr_menu_web) !== 1) error("QR_PRINT_NOT_ACTIVE");
  if (input.kind === "qr_menu") return [{id:"menu", label:"QR Menü", url: publicUrl}];
  const config = input.kind === "qr_room" ? getQrRoomOrderConfig(db) : getQrTableOrderConfig(db);
  if (!config.enabled || !config.secret) error("QR_PRINT_NOT_ACTIVE");
  const source = input.kind === "qr_room" ? listQrOrderRooms(db).map(r => ({
    id:r.id, label:r.number ? "Oda "+r.number : r.name, url:publicUrl+"?room="+encodeURIComponent(r.token)
  })) : listQrOrderTables(db).map(t => ({
    id:t.id, label: t.area ? t.area+" · "+t.name : t.name, url:publicUrl+"?table="+encodeURIComponent(t.token)
  }));
  const selected = new Map(source.map(item => [item.id,item]));
  const result = input.ids.map(id => selected.get(id));
  if (result.some(value => !value)) error("QR_PRINT_SELECTION_CHANGED");
  return result as Item[];
}
export function qrLabelHtml(items: Item[]): string {
  if (!items.length || items.length > 100) error("QR_PRINT_INPUT_INVALID");
  const pages = items.map(item => '<section class="label"><strong>'+text(item.label)
    +'</strong><div class="qr">'+createQrSvg(item.url)+'</div><p>QR menüyü açmak için kodu okutun.</p>'
    +'<small>'+text(item.url)+'</small></section>').join("");
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>'
    +'@page{size:100mm 150mm;margin:0}html,body{margin:0;padding:0;background:white;color:#14253b;font:12pt Arial,sans-serif}'
    +'.label{width:100mm;height:150mm;box-sizing:border-box;break-after:page;page-break-after:always;'
    +'display:flex;flex-direction:column;justify-content:center;align-items:center;gap:7mm;padding:8mm;text-align:center}'
    +'.label:last-child{break-after:auto;page-break-after:auto}.label strong{font-size:18pt;max-width:84mm;overflow-wrap:anywhere}'
    +'.qr{width:79mm;height:79mm}.qr svg{width:100%;height:100%;display:block}.label p{margin:0;font-size:11pt}'
    +'.label small{font-size:7pt;overflow-wrap:anywhere;max-width:84mm;line-height:1.4;color:#425267}'
    +'</style></head><body>'+pages+'</body></html>';
}
function context(db: DatabaseSync, options: QrPrintOptions, kind: QrKind, trigger: "manual" | "stay_checked_in") {
  options.assertAuthorized();
  const owner = new DocumentOutputManagement(db, { role:"desktop_owner", assertAuthorized:options.assertAuthorized });
  const businessId = owner.authorizePrinterAccess({documentKind:kind});
  const installationId = options.installationId();
  const row = db.prepare("SELECT r.mode,r.adapter,p.printer_ref FROM document_output_rules r "+
    "LEFT JOIN document_printer_bindings p ON p.business_id=r.business_id AND p.installation_id=? AND p.id=? "+
    "WHERE r.business_id=? AND r.document_kind=? AND r.trigger_kind=? AND r.channel='print'")
    .get(installationId, kind, businessId, kind, trigger) as
      {mode:string;adapter:string;printer_ref:string|null}|undefined;
  return { businessId, installationId, printer:row?.printer_ref ?? null,
    mode: row?.adapter === "native_print" ? row.mode : "OFF" };
}
async function printLabels(options: QrPrintOptions, input: PrintQrCodesInput,
  trigger: "manual" | "stay_checked_in", initialMode?: "ASK_CONFIRMATION" | "AUTOMATIC",
  requestParent?: BrowserWindow): Promise<Result> {
  const db = new DatabaseSync(options.databasePath());
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  try {
    const kind = input.kind;
    const read = () => context(db,options,kind,trigger);
    const setup = read();
    const mode = initialMode ?? setup.mode;
    if (mode !== "ASK_CONFIRMATION" && mode !== "AUTOMATIC") error("QR_PRINT_RULE_OFF");
    if (trigger === "manual" && mode !== "ASK_CONFIRMATION") error("QR_PRINT_RULE_OFF");
    if (!setup.printer) error("QR_PRINT_PRINTER_MISSING");
    const items = reportRows(db,options.webModuleUrl(),input);
    const html = qrLabelHtml(items);
    const parent = requestParent ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find(w => !w.isDestroyed()) ?? null;
    if (!parent || parent.isDestroyed()) throw new DocumentOutputManagementError("QR_PRINT_OWNER_REQUIRED");
    if (mode === "ASK_CONFIRMATION") {
      const prompt = await dialog.showMessageBox(parent, {
        type:"question", title:"QR kodlarını yazdır",
        message: items.length === 1 ? items[0]!.label+" QR kodu yazdırılsın mı?"
          : String(items.length)+" QR kodu yazdırılsın mı?",
        detail: "Yazıcı: "+setup.printer+" · Etiket: 100 × 150 mm. Oda QR kodları yalnız mevcut konaklamada geçerlidir.",
        buttons:["Vazgeç","Yazdır"], defaultId:0,cancelId:0,noLink:true
      });
      if (prompt.response !== 1) return {ok:true,value:null};
    }
    const again = read();
    if (again.businessId !== setup.businessId || again.installationId !== setup.installationId
      || again.printer !== setup.printer || again.mode !== mode) error("QR_PRINT_CONFIGURATION_CHANGED");
    const fresh = reportRows(db,options.webModuleUrl(),input);
    if (JSON.stringify(items) !== JSON.stringify(fresh)) error("QR_PRINT_SELECTION_CHANGED");
    const opened = await openDocumentWindow(html);
    try {
      const printers = sanitizeDocumentPrinters(await opened.window.webContents.getPrintersAsync());
      const final = read();
      if (!printers.some(printer => printer.name === setup.printer)
        || final.businessId !== setup.businessId || final.installationId !== setup.installationId
        || final.printer !== setup.printer || final.mode !== mode) error("QR_PRINT_CONFIGURATION_CHANGED");
      if (JSON.stringify(reportRows(db,options.webModuleUrl(),input)) !== JSON.stringify(items)) error("QR_PRINT_SELECTION_CHANGED");
      const result = await new Promise<"accepted"|"failed"|"unknown">(resolve => {
        let completed = false;
        const finish = (value:"accepted"|"failed"|"unknown") => {
          if (completed) return;
          completed=true; clearTimeout(timeout); resolve(value);
        };
        const timeout = setTimeout(()=>finish("unknown"),30000);
        opened.window.once("closed",()=>finish("unknown"));
        try { opened.window.webContents.print({
          silent:true, deviceName:setup.printer!, printBackground:true, copies:1,
          pageSize:{width:100000,height:150000}
        },ok=>finish(ok?"accepted":"failed")); } catch { finish("unknown"); }
      });
      return {ok:true,value:result};
    } finally { opened.close(); }
  } catch (cause) {
    const code = cause instanceof DocumentOutputManagementError ? cause.message : "QR_PRINT_FAILED";
    const message = ["QR_PRINT_PRINTER_MISSING","QR_PRINT_RULE_OFF"].includes(code)
      ? "Baskı Yönetimi'nde QR belgesi için yazıcı seçin ve manuel yazdırma onayını etkinleştirin."
      : code === "QR_PRINT_SELECTION_CHANGED" ? "QR kodu veya aktif konaklama değişti. Listeyi yenileyin."
        : code === "QR_PRINT_NOT_ACTIVE" ? "İlgili QR sipariş özelliği etkin değil."
          : code === "QR_PRINT_URL_MISSING" ? "Geçerli QR Menü web bağlantısı bulunamadı."
            : code === "DOCUMENT_CAPABILITY_DISABLED" ? "QR Menü ve Baskı Yönetimi yetenekleri etkin olmalı."
              : "QR yazdırma başlatılamadı. Yetki, yazıcı ve güncel kodları kontrol edin.";
    return {ok:false,code,message};
  } finally { db.close(); }
}
export function registerQrPrintIpc(options: QrPrintOptions & {
  assertSender(event: Electron.IpcMainInvokeEvent): void;
}) {
  ipcMain.handle("documentOutput:printQrCodes",async(event,...args:unknown[]):Promise<Result>=>{
    try {
      options.assertSender(event);
      if (args.length!==1) error("QR_PRINT_INPUT_INVALID");
      const parent = BrowserWindow.fromWebContents(event.sender);
      if (!parent || parent.isDestroyed()) throw new DocumentOutputManagementError("QR_PRINT_OWNER_REQUIRED");
      // The trusted top-level frame is revalidated after every asynchronous confirmation and printer discovery.
      return await printLabels({ ...options, assertAuthorized: () => options.assertSender(event) },
        validateQrPrintInput(args[0]),"manual",undefined,parent);
    } catch(cause) {
      const code = cause instanceof DocumentOutputManagementError ? cause.message : "QR_PRINT_FAILED";
      return {ok:false,code,message:"QR yazdırma isteği geçersiz veya uygulama kilitli."};
    }
  });
}
/** Called only after a successful desktop check-in commit. Persist one attempt
 * per stay before confirmation/spool so replay, cancel and unknown never repeat. */
export async function printQrAfterCheckIn(options: QrPrintOptions, stayId: string): Promise<Result | null> {
  if (!idOk(stayId)) return null;
  const db = new DatabaseSync(options.databasePath());
  try {
    db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
    const setup = context(db,options,"qr_room","stay_checked_in");
    if ((setup.mode !== "ASK_CONFIRMATION" && setup.mode !== "AUTOMATIC") || !setup.printer) {
      db.exec("ROLLBACK"); return null;
    }
    const existing = db.prepare("SELECT 1 FROM qr_room_print_arrival_receipts WHERE business_id=? AND stay_id=?").get(setup.businessId,stayId);
    if (existing) { db.exec("ROLLBACK"); return null; }
    const row = db.prepare("SELECT s.room_id FROM customer_room_stays s JOIN room_folios f ON f.stay_id=s.id "+
      "AND f.room_id=s.room_id AND f.status='open' AND f.deleted_at='' "+
      "WHERE s.id=? AND s.status='checked_in' AND s.deleted_at='' LIMIT 1")
      .get(stayId) as {room_id:string}|undefined;
    if (!row || !reportRows(db,options.webModuleUrl(),{kind:"qr_room",ids:[row.room_id]}).length) {
      db.exec("ROLLBACK");return null;
    }
    db.prepare("INSERT INTO qr_room_print_arrival_receipts(business_id,stay_id,room_id,mode,created_at) VALUES(?,?,?,?,?)")
      .run(setup.businessId,stayId,row.room_id,setup.mode,new Date().toISOString());
    db.exec("COMMIT");
    return await printLabels(options,{kind:"qr_room",ids:[row.room_id]},"stay_checked_in",setup.mode);
  } catch {
    try { db.exec("ROLLBACK"); } catch { /* transaction may already have committed */ }
    return null; // Never undo check-in or KBS due to optional printing.
  } finally { db.close(); }
}
