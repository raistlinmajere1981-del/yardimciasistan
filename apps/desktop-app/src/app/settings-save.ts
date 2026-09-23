import type { DesktopSetupSaveResult } from "../../electron/database";

export type SettingsSetupSaveResult = DesktopSetupSaveResult & { refreshWarning?: string };

export type SettingsSaveState = "idle" | "loading" | "success" | "error";

export type SettingsOperationResult =
  | { ok: true; changed: boolean; message?: string }
  | { ok: false; message: string };
