export type DesktopDiagnosticLevel = "INFO" | "WARN" | "ERROR";
export type DesktopDiagnosticProcess = "main" | "renderer";

export interface DesktopDiagnosticError {
  name: string;
  message: string;
  stack?: string;
}

export interface DesktopDiagnosticEvent {
  timestamp: string;
  sequence: number;
  level: DesktopDiagnosticLevel;
  process: DesktopDiagnosticProcess;
  scope: string;
  event: string;
  message: string;
  operationId?: string;
  meta?: Record<string, unknown>;
  error?: DesktopDiagnosticError;
}

export interface DesktopDiagnosticSessionManifest {
  version: 1;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  endReason?: string;
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  packaged: boolean;
  eventCount: number;
  warnCount: number;
  errorCount: number;
}

export interface DesktopDiagnosticSessionSummary extends DesktopDiagnosticSessionManifest {
  current: boolean;
  totalBytes: number;
}

export interface DesktopDiagnosticWriteInput {
  level: DesktopDiagnosticLevel;
  scope: string;
  event: string;
  message: string;
  operationId?: string;
  meta?: Record<string, unknown>;
  error?: unknown;
}

export interface DesktopDiagnosticReadInput {
  sessionId?: string;
  levels?: DesktopDiagnosticLevel[];
  scopes?: string[];
  query?: string;
  limit?: number;
  beforeSequence?: number;
}

export interface DesktopDiagnosticReadResult {
  session: DesktopDiagnosticSessionSummary;
  events: DesktopDiagnosticEvent[];
  hasMore: boolean;
}


export interface DesktopDiagnosticSupportSession {
  session: DesktopDiagnosticSessionSummary;
  events: DesktopDiagnosticEvent[];
}

export interface DesktopSupportScreenshotDraft {
  previewDataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface DesktopSupportReportDraft {
  screenshot: DesktopSupportScreenshotDraft | null;
  sessions: DesktopDiagnosticSessionSummary[];
  sessionCount: number;
  totalLogBytes: number;
}

export interface DesktopSupportReportActionResult {
  ok: boolean;
  message: string;
  draft: DesktopSupportReportDraft;
}

export interface DesktopSupportReportSendInput {
  note?: string;
}

export interface DesktopSupportReportSendResult {
  ok: boolean;
  message: string;
  reportId?: string;
}
