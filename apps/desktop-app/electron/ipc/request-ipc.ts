import { readFile, copyFile } from "node:fs/promises";
import { requestDocumentPath } from "../request-document-store";
import { ipcMain, shell, dialog } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  CreateManualRequestInput,
  CreateManualRequestResult,
  DesktopDatabase,
  DesktopStatusUpdateResult,
  RequestReservationConversionResult,
  UpdateRequestStatusInput
} from "../database";

export function registerRequestIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  assertRequestType: (requestType: string) => void;
  finalizeRecordDeletion: (result: DesktopStatusUpdateResult) => DesktopStatusUpdateResult;
}) {
  const { getDatabase, assertCapability, assertRequestType, finalizeRecordDeletion } = options;

  ipcMain.handle("request:customerHistory", (_event, customerId: string) => {
    options.assertUnlocked(); assertCapability(BUSINESS_CAPABILITIES.REQUESTS); assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS);
    return getDatabase().getCustomerRequests(customerId);
  });
  ipcMain.handle("request:approveDealer", (_event, requestId: string, priceGroup: string) => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.REQUESTS);
    assertCapability(BUSINESS_CAPABILITIES.WHOLESALE);
    return getDatabase().approveDealerApplication(requestId, priceGroup);
  });
  ipcMain.handle("request:document", async (_event, requestId: string, documentId: string, action: string) => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.REQUESTS);
    assertCapability(BUSINESS_CAPABILITIES.WHOLESALE);
    const db = getDatabase(); const request = db.getRequestById(requestId);
    const doc = request?.request_type === "dealer_application" ? request.documents?.find(item => item.id === documentId) : null;
    if (!doc) throw new Error("Belge bulunamadı.");
    const path = requestDocumentPath(db.userDataPath, doc);
    if (action === "preview" && doc.mime.startsWith("image/")) {
      const bytes = await readFile(path);
      options.assertUnlocked(); assertCapability(BUSINESS_CAPABILITIES.WHOLESALE); assertCapability(BUSINESS_CAPABILITIES.REQUESTS);
      return `data:${doc.mime};base64,${bytes.toString("base64")}`;
    }
    if (action === "download") {
      const result = await dialog.showSaveDialog({ defaultPath: doc.name });
      options.assertUnlocked(); assertCapability(BUSINESS_CAPABILITIES.WHOLESALE); assertCapability(BUSINESS_CAPABILITIES.REQUESTS);
      if (!result.canceled && result.filePath) await copyFile(path, result.filePath);
      return "";
    }
    if (action !== "open") throw new Error("Belge işlemi geçersiz.");
    const error = await shell.openPath(path); if (error) throw new Error("Belge açılamadı.");
    return "";
  });

  ipcMain.handle("request:createManual", (_event, input: CreateManualRequestInput): CreateManualRequestResult => {
    options.assertUnlocked();
    assertRequestType(String(input?.requestType ?? ""));
    return getDatabase().createManualRequest(input);
  });

  ipcMain.handle("request:convertToReservation", (_event, requestId: string): RequestReservationConversionResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.REQUESTS, "Müşteri talepleri bu işletmede etkin değil.");
    const request = getDatabase().getRequestById(requestId);
    assertRequestType(request?.request_type ?? "");
    return getDatabase().convertRequestToReservation(requestId);
  });

  ipcMain.handle("request:updateStatus", (_event, input: UpdateRequestStatusInput): DesktopStatusUpdateResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.REQUESTS, "Müşteri talepleri bu işletmede etkin değil.");
    return getDatabase().updateRequestStatus(input);
  });

  ipcMain.handle("request:delete", (_event, requestId: unknown): DesktopStatusUpdateResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.REQUESTS, "Müşteri talepleri bu işletmede etkin değil.");
    return finalizeRecordDeletion(getDatabase().deleteRequest(String(requestId ?? "")));
  });
}
