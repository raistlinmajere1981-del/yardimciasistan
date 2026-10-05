import { ipcMain } from "electron";
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
