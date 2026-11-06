import { app, BrowserWindow, dialog, ipcMain, nativeImage } from "electron";
import { DocumentFormImages, type FormImageDecoder } from "../document-form-images";
import { DatabaseSync } from "node:sqlite";
import type { DocumentKind, DocumentOutputManagementResult } from "@yardimci-asistan/shared";
import { DocumentOutputManagement, DocumentOutputManagementError, sanitizeDocumentPrinters } from "../document-output-management";
import { listReadyDocuments } from "../document-output-ready";
import { prepareSaleDocumentJob } from "../document-output-sale-job";

interface Options {
  printDocument?: typeof import("../document-output-native-print").printConfirmedDocument;
  previewDocument?: typeof import("../document-output-preview").previewReadyDocument;
  formImages?: { userData(): string; choose(): Promise<string | null>; decode: FormImageDecoder };
  databasePath(): string;
  installationId(): string;
  assertUnlocked(): void;
  isTrustedRendererUrl(url: string): boolean;
}
/** Same trusted top-level window gate as native management IPC, before DB access. */
export function assertDocumentOutputSender(event: Electron.IpcMainInvokeEvent, options: Pick<Options, "assertUnlocked" | "isTrustedRendererUrl">): void {
  if (event.sender.getType() !== "window" || !event.senderFrame || event.senderFrame !== event.sender.mainFrame
    || !options.isTrustedRendererUrl(event.senderFrame.url)) throw new DocumentOutputManagementError("DOCUMENT_OWNER_REQUIRED");
  try { options.assertUnlocked(); } catch { throw new DocumentOutputManagementError("DOCUMENT_SESSION_LOCKED"); }
}
export function registerDocumentOutputIpcHandlers(options: Options): void {
  ipcMain.handle("documentOutput:prepareSaleReceipt", (event, ...args: unknown[]): DocumentOutputManagementResult<{ jobId: string }> => {
    let database: DatabaseSync | undefined;
    try {
      const gate = () => assertDocumentOutputSender(event, options);
      gate();
      const input = args[0];
      if (args.length !== 1 || !input || typeof input !== "object" || Array.isArray(input)
        || Object.keys(input).length !== 1 || !Object.hasOwn(input, "saleId")) throw new DocumentOutputManagementError("DOCUMENT_INPUT_INVALID");
      const saleId = (input as { saleId: unknown }).saleId;
      if (typeof saleId !== "string" || !saleId.trim() || saleId.length > 128 || /[\x00-\x1f\x7f]/.test(saleId)) throw new DocumentOutputManagementError("DOCUMENT_INPUT_INVALID");
      database = new DatabaseSync(options.databasePath());
      database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000");
      const owner = new DocumentOutputManagement(database, { role: "desktop_owner", assertAuthorized: gate });
      const businessId = owner.authorizePrinterAccess({ documentKind: "sale_receipt" });
      const installationId = options.installationId();
      // Replays in the preparation owner reuse frozen evidence; this entry point
      // additionally requires current manual configuration on every invocation.
      const configured = database.prepare(`SELECT 1 FROM document_output_rules r
        WHERE r.business_id=? AND r.document_kind='sale_receipt' AND r.trigger_kind='manual'
          AND r.channel='print' AND r.mode='ASK_CONFIRMATION' AND r.adapter='native_print'
          AND EXISTS (SELECT 1 FROM document_print_templates t WHERE t.business_id=r.business_id AND t.id='default:sale_receipt' AND t.document_kind='sale_receipt')
          AND EXISTS (SELECT 1 FROM document_printer_bindings p WHERE p.business_id=r.business_id AND p.installation_id=? AND p.id='sale_receipt' AND length(trim(p.printer_ref))>0)`)
        .get(businessId, installationId);
      if (!configured) throw new DocumentOutputManagementError("DOCUMENT_SALE_JOB_CONFIGURATION_MISSING");
      const images = new DocumentFormImages(options.formImages?.userData() ?? app.getPath("userData"), options.formImages?.decode ?? (bytes => {
        const image = nativeImage.createFromBuffer(bytes);
        if (image.isEmpty()) throw new DocumentOutputManagementError("DOCUMENT_IMAGE_INVALID");
        return { ...image.getSize(), png: image.toPNG() };
      }));
      return { ok: true, value: { jobId: prepareSaleDocumentJob(database, images, { businessId, installationId, saleId }) } };
    } catch (error) {
      const known = error instanceof DocumentOutputManagementError ? error.message : error instanceof Error ? error.message : "";
      const code = ["DOCUMENT_INPUT_INVALID", "DOCUMENT_OWNER_REQUIRED", "DOCUMENT_SESSION_LOCKED", "DOCUMENT_TENANT_REQUIRED", "DOCUMENT_CAPABILITY_DISABLED", "DOCUMENT_SALE_JOB_CONFIGURATION_MISSING", "DOCUMENT_SALE_JOB_LINES_MISSING", "DOCUMENT_SALE_SOURCE_INVALID"].includes(known) ? known : "DOCUMENT_SALE_PREPARE_FAILED";
      return { ok: false, code, message: code === "DOCUMENT_SALE_JOB_LINES_MISSING"
        ? "Fiş şablonunda ürün satırları eksik veya kapasitesi yetersiz. Baskı Yönetimi > Satış fişi > Düzenle > Yerleşim ve form > Ürün satırlarını ekle > Kaydet. Satır kapasitesini aşan satışlar hazırlanamaz."
        : code === "DOCUMENT_SALE_JOB_CONFIGURATION_MISSING"
        ? "Fiş için Baskı Yönetimi'nde şablon, yerel yazıcı ve manuel yazdırma onayı ayarlayın."
        : "Fiş hazırlanamadı. Satış kaydı korunuyor; yetki ve baskı ayarlarını kontrol edin." };
    } finally { database?.close(); }
  });
  for (const channel of ["listReady", "printReady", "previewReady"] as const) {
    ipcMain.handle(`documentOutput:${channel}`, async (event, ...args: unknown[]): Promise<DocumentOutputManagementResult<unknown>> => {
      let database: DatabaseSync | undefined;
      try {
        const gate = () => assertDocumentOutputSender(event, options);
        gate();
        const input = args[0];
        const keys = channel === "listReady" ? ["documentKind"] : ["documentKind", "jobId"];
        if (args.length !== 1 || !input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== keys.length || Object.keys(input).some(key => !keys.includes(key))) throw new DocumentOutputManagementError("DOCUMENT_INPUT_INVALID");
        const value = input as { documentKind: DocumentKind; jobId?: unknown };
        if (channel !== "listReady" && (typeof value.jobId !== "string" || !/^[a-f0-9]{64}$/.test(value.jobId))) throw new DocumentOutputManagementError("DOCUMENT_INPUT_INVALID");
        database = new DatabaseSync(options.databasePath());
        database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000");
        const db = database;
        const owner = new DocumentOutputManagement(db, { role: "desktop_owner", assertAuthorized: gate });
        const readInput = { documentKind: value.documentKind };
        const businessId = owner.authorizePrinterAccess(readInput);
        const installationId = options.installationId();
        if (channel === "listReady") return { ok: true, value: listReadyDocuments(db, businessId, installationId, value.documentKind) };
        const jobId = value.jobId as string;
        if (channel === "previewReady") {
          const check = () => {
            gate();
            const checkDb = new DatabaseSync(options.databasePath());
            try {
              const checkOwner = new DocumentOutputManagement(checkDb, { role: "desktop_owner", assertAuthorized: gate });
              if (checkOwner.authorizePrinterAccess(readInput) !== businessId || options.installationId() !== installationId) throw new DocumentOutputManagementError("DOCUMENT_TENANT_CHANGED");
              const job = checkDb.prepare(`SELECT id FROM document_output_jobs WHERE business_id=? AND installation_id=? AND id=? AND document_kind=?
                AND legal_meaning='non_fiscal_copy' AND command_kind='manual' AND trigger_kind='manual' AND channel='print' AND mode='ASK_CONFIRMATION' AND adapter='native_print' AND state='awaiting-confirmation'`).get(businessId, installationId, jobId, value.documentKind);
              if (!job) throw new DocumentOutputManagementError("DOCUMENT_PRINT_UNAVAILABLE");
            } finally { checkDb.close(); }
          };
          check();
          const parent = BrowserWindow.fromWebContents(event.sender);
          if (!parent) throw new DocumentOutputManagementError("DOCUMENT_OWNER_REQUIRED");
          const preview = options.previewDocument ?? (await import("../document-output-preview")).previewReadyDocument;
          await preview(db, { businessId, installationId, jobId }, parent, check);
          return { ok: true, value: null };
        }
        const assertAuthorized = () => {
          gate();
          if (owner.authorizePrinterAccess(readInput) !== businessId || options.installationId() !== installationId) throw new DocumentOutputManagementError("DOCUMENT_TENANT_CHANGED");
          const job = db.prepare(`SELECT id FROM document_output_jobs WHERE business_id=? AND installation_id=? AND id=? AND document_kind=?
            AND legal_meaning='non_fiscal_copy' AND command_kind='manual' AND trigger_kind='manual' AND channel='print' AND mode='ASK_CONFIRMATION' AND adapter='native_print'`).get(businessId, installationId, jobId, value.documentKind);
          if (!job) throw new DocumentOutputManagementError("DOCUMENT_PRINT_UNAVAILABLE");
        };
        assertAuthorized();
        const printConfirmedDocument = options.printDocument ?? (await import("../document-output-native-print")).printConfirmedDocument;
        const result = await printConfirmedDocument(db, { businessId, installationId, jobId }, {
          assertAuthorized,
          async assertExplicitUserConfirmation() {
            assertAuthorized();
            const parent = BrowserWindow.fromWebContents(event.sender);
            if (!parent) throw new DocumentOutputManagementError("DOCUMENT_OWNER_REQUIRED");
            const answer = await dialog.showMessageBox(parent, { type: "question", title: "Belgeyi yazdır", message: "Mali belge olmayan bu belge yazıcıya gönderilsin mi?", buttons: ["Vazgeç", "Yazdır"], defaultId: 0, cancelId: 0, noLink: true });
            assertAuthorized();
            if (answer.response !== 1) throw new DocumentOutputManagementError("DOCUMENT_PRINT_CANCELLED");
          }
        });
        return { ok: true, value: result };
      } catch (error) {
        const code = error instanceof DocumentOutputManagementError ? error.message : "DOCUMENT_PRINT_FAILED";
        return { ok: false, code, message: channel === "previewReady" ? "Belge önizlemesi açılamadı. Yetkiyi ve hazır belgeyi kontrol edin." : code === "DOCUMENT_PRINT_CANCELLED" ? "Yazdırma iptal edildi." : "Belge işleme alınamadı. Yetkiyi ve yazıcıyı kontrol edin." };
      } finally { database?.close(); }
    });
  }
  for (const channel of ["pickFormImage", "readFormImage", "saveProcessedFormImage"] as const) {
    ipcMain.handle(`documentOutput:${channel}`, async (event, ...args: unknown[]): Promise<DocumentOutputManagementResult<unknown>> => {
      let database: DatabaseSync | undefined;
      try {
        const assertAuthorized = () => assertDocumentOutputSender(event, options);
        assertAuthorized();
        const input = args[0];
        const keys = channel === "pickFormImage" ? ["documentKind"] : channel === "readFormImage" ? ["documentKind", "imageRef"] : ["documentKind", "originalImageRef", "pngBase64"];
        if (args.length !== 1 || !input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== keys.length || Object.keys(input).some(key => !keys.includes(key))) throw new DocumentOutputManagementError("DOCUMENT_INPUT_INVALID");
        const value = input as { documentKind: DocumentKind; imageRef?: unknown; originalImageRef?: unknown; pngBase64?: unknown };
        database = new DatabaseSync(options.databasePath());
        database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000");
        const owner = new DocumentOutputManagement(database, { role: "desktop_owner", assertAuthorized });
        const readInput = { documentKind: value.documentKind };
        const businessId = owner.authorizeFormImageAccess(readInput);
        const store = new DocumentFormImages(options.formImages?.userData() ?? app.getPath("userData"), options.formImages?.decode ?? (bytes => {
          const image = nativeImage.createFromBuffer(bytes);
          if (image.isEmpty()) throw new DocumentOutputManagementError("DOCUMENT_IMAGE_INVALID");
          const size = image.getSize();
          if (size.width * size.height > 25_000_000) throw new DocumentOutputManagementError("DOCUMENT_IMAGE_INVALID");
          return { ...size, png: image.toPNG() };
        }));
        if (channel === "readFormImage") return { ok: true, value: store.read(value.imageRef, businessId, value.documentKind) };
        if (channel === "saveProcessedFormImage") return { ok: true, value: store.saveProcessed(value.originalImageRef, value.pngBase64, businessId, value.documentKind) };
        const choose = async () => {
          const parent = BrowserWindow.fromWebContents(event.sender);
          if (!parent) throw new DocumentOutputManagementError("DOCUMENT_OWNER_REQUIRED");
          const result = await dialog.showOpenDialog(parent, { title: "Boş form görseli seç", properties: ["openFile"], filters: [{ name: "JPG / PNG", extensions: ["jpg", "jpeg", "png"] }] });
          return result.canceled ? null : result.filePaths[0] ?? null;
        };
        const source = await (options.formImages?.choose ?? choose)();
        assertAuthorized();
        if (owner.authorizeFormImageAccess(readInput) !== businessId) throw new DocumentOutputManagementError("DOCUMENT_TENANT_REQUIRED");
        return { ok: true, value: source === null ? null : store.importOriginal(source, businessId, value.documentKind) };
      } catch (error) {
        const code = error instanceof DocumentOutputManagementError ? error.message : "DOCUMENT_IMAGE_FAILED";
        return { ok: false, code, message: "Boş form görseli açılamadı. JPG/PNG, en çok 12 MB ve 25 megapiksel görsel seçin; yetkinizi kontrol edin." };
      } finally { database?.close(); }
    });
  }
  for (const channel of ["getPrinters", "readPrinterBinding", "savePrinterBinding"] as const) {
    ipcMain.handle(`documentOutput:${channel}`, async (event, ...args: unknown[]): Promise<DocumentOutputManagementResult<unknown>> => {
      let database: DatabaseSync | undefined;
      try {
        const assertAuthorized = () => assertDocumentOutputSender(event, options);
        assertAuthorized();
        if (args.length !== 1) throw new DocumentOutputManagementError("DOCUMENT_INPUT_INVALID");
        database = new DatabaseSync(options.databasePath());
        database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000");
        const owner = new DocumentOutputManagement(database, { role: "desktop_owner", assertAuthorized });
        // Validate exact fields, tenant and persisted capabilities before native discovery.
        const input = args[0];
        if (!input || typeof input !== "object" || Array.isArray(input)) throw new DocumentOutputManagementError("DOCUMENT_INPUT_INVALID");
        const keys = channel === "savePrinterBinding" ? ["documentKind", "printerRef"] : ["documentKind"];
        if (Object.keys(input).length !== keys.length || Object.keys(input).some(key => !keys.includes(key))) throw new DocumentOutputManagementError("DOCUMENT_INPUT_INVALID");
        const readInput = { documentKind: (input as { documentKind: unknown }).documentKind };
        const businessId = owner.authorizePrinterAccess(readInput);
        const installationId = options.installationId();
        const printers = sanitizeDocumentPrinters(await event.sender.getPrintersAsync());
        assertAuthorized();
        const value = channel === "savePrinterBinding" ? owner.savePrinterBinding(input, installationId, printers, businessId)
          : owner.readPrinterBinding(readInput, installationId, printers, businessId);
        return { ok: true, value };
      } catch (error) {
        const code = error instanceof DocumentOutputManagementError ? error.message : "DOCUMENT_SETTINGS_FAILED";
        return { ok: false, code, message: code === "DOCUMENT_PRINTER_INVALID" ? "Seçilen yazıcı artık sistemde bulunamıyor. Listeyi yenileyin."
          : code === "DOCUMENT_CAPABILITY_DISABLED" ? "Bu belge özelliği artık etkin değil."
          : "Yazıcı ayarları okunamadı veya kaydedilemedi. Yetkiyi ve sistem yazıcılarını kontrol edin." };
      } finally { database?.close(); }
    });
  }
  for (const [channel, method] of [["documentOutput:read", "read"], ["documentOutput:saveRule", "saveRule"], ["documentOutput:readTemplate", "readTemplate"], ["documentOutput:saveTemplate", "saveTemplate"]] as const) {
    ipcMain.handle(channel, (event, ...args: unknown[]): DocumentOutputManagementResult<unknown> => {
      let database: DatabaseSync | undefined;
      try {
        const assertAuthorized = () => assertDocumentOutputSender(event, options);
        assertAuthorized();
        if (args.length !== 1) throw new DocumentOutputManagementError("DOCUMENT_INPUT_INVALID");
        database = new DatabaseSync(options.databasePath());
        database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000");
        const owner = new DocumentOutputManagement(database, { role: "desktop_owner", assertAuthorized });
        return { ok: true, value: owner[method](args[0]) };
      } catch (error) {
        const code = error instanceof DocumentOutputManagementError ? error.message : "DOCUMENT_SETTINGS_FAILED";
        return { ok: false, code, message: code === "DOCUMENT_SESSION_LOCKED" ? "Ayarlar için uygulama kilidini açın."
          : code === "DOCUMENT_TEMPLATE_CONFLICT" ? "Şablon başka bir işlemde değişti. Taslağı koruyun veya vazgeçip yeniden açın."
          : code === "DOCUMENT_CAPABILITY_DISABLED" ? "Bu belge özelliği artık etkin değil."
            : "Belge ayarları okunamadı veya kaydedilemedi. Yetki ve alanları kontrol edip tekrar deneyin." };
      } finally { database?.close(); }
    });
  }
}
