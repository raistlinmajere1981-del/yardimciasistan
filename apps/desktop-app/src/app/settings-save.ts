export type SettingsSaveState = "idle" | "loading" | "success" | "error";

export type SettingsOperationResult =
  | { ok: true; changed: boolean; message?: string }
  | { ok: false; message: string };

export interface SettingsSaveSectionHandle {
  validate: () => string | null;
  save: () => Promise<SettingsOperationResult>;
  focus: () => void;
}

export interface SettingsSaveHandle {
  save: () => Promise<boolean>;
}
