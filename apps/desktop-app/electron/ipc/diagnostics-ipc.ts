import { ipcMain } from "electron";
import {
  getCurrentDiagnosticSession,
  listDiagnosticSessions,
  readDiagnosticSession,
  writeRendererDiagnostic
} from "../desktop-logger";
import type {
  DesktopDiagnosticReadInput,
  DesktopDiagnosticWriteInput
} from "../diagnostics-contract";

export function registerDiagnosticsIpcHandlers(options: {
  assertUnlocked: () => void;
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
}
