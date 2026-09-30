import { ipcMain } from "electron";
import {
  getCurrentDiagnosticSession,
  listDiagnosticSessions,
  readDiagnosticSession,
  writeRendererDiagnostic
} from "../desktop-logger";
import type {
  DesktopDiagnosticReadInput,
  DesktopDiagnosticWriteInput,
  DesktopSupportReportSendInput
} from "../diagnostics-contract";
import {
  addClipboardScreenshotToSupportReport,
  clearSupportReportScreenshot,
  getSupportReportDraft,
  sendSupportReport
} from "../support-report-service";

export function registerDiagnosticsIpcHandlers(options: {
  assertUnlocked: () => void;
  userDataPath: () => string;
}) {
  ipcMain.handle("diagnostics:getCurrentSession", () => {
    options.assertUnlocked();
    return getCurrentDiagnosticSession();
  });

  ipcMain.handle("diagnostics:listSessions", () => {
    options.assertUnlocked();
    return listDiagnosticSessions();
  });

  ipcMain.handle("diagnostics:readSession", (_event, input: DesktopDiagnosticReadInput) => {
    options.assertUnlocked();
    return readDiagnosticSession(input);
  });

  ipcMain.handle("diagnostics:writeRendererEvent", (_event, input: DesktopDiagnosticWriteInput) => {
    return writeRendererDiagnostic(input);
  });

  ipcMain.handle("diagnostics:getSupportReportDraft", () => {
    options.assertUnlocked();
    return getSupportReportDraft(options.userDataPath());
  });

  ipcMain.handle("diagnostics:addClipboardScreenshot", () => {
    options.assertUnlocked();
    return addClipboardScreenshotToSupportReport(options.userDataPath());
  });

  ipcMain.handle("diagnostics:clearSupportScreenshot", () => {
    options.assertUnlocked();
    return clearSupportReportScreenshot(options.userDataPath());
  });

  ipcMain.handle("diagnostics:sendSupportReport", async (_event, input: DesktopSupportReportSendInput) => {
    options.assertUnlocked();
    return sendSupportReport(options.userDataPath(), input);
  });
}
