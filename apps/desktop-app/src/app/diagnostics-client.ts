import type { DesktopDiagnosticWriteInput } from "../../electron/diagnostics-contract";

export function writeRendererDiagnostic(input: DesktopDiagnosticWriteInput) {
  const writer = window.yardimciDesktop?.writeDiagnosticEvent;
  if (!writer) return;
  void writer(input).catch(() => undefined);
}

export function serializeRendererError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return {
    name: "Error",
    message: typeof error === "string" ? error : String(error)
  };
}
