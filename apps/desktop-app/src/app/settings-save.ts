import type { DesktopSetupSaveResult } from "../../electron/database";

export type SettingsSetupSaveResult = DesktopSetupSaveResult & { refreshWarning?: string };

export type SettingsOperationResult =
  | { ok: true; changed: boolean; message?: string }
  | { ok: false; message: string };
