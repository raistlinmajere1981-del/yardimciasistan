export type UiColorScheme = "system" | "light" | "dark";
export type UiDensity = "comfortable" | "compact";
export type UiAccent = "coral" | "blue" | "green";
export type UiFont = "plex" | "system";
export type UiMotion = "system" | "full" | "reduced";
export type RecordPickerType = "product" | "supplier" | "dealer" | "customer";
export type PickerScreenClass = "small" | "medium" | "large";
export interface RecordPickerPreference { view: "list" | "grid"; columns: number }
const PICKER_VIEW_STORAGE_KEY = "yardimci-asistan.record-picker-view";
const pickerSessionPreferences = new Map<string, RecordPickerPreference>();

export function pickerScreenClass(width: number): PickerScreenClass {
  return width < 600 ? "small" : width < 1000 ? "medium" : "large";
}

export function readRecordPickerPreference(type: RecordPickerType, screen: PickerScreenClass): RecordPickerPreference {
  const key = `${type}:${screen}`;
  const fallback: RecordPickerPreference = { view: "list", columns: screen === "large" ? 3 : 2 };
  const session = pickerSessionPreferences.get(key);
  if (session) return session;
  try {
    const record = JSON.parse(window.localStorage.getItem(`${PICKER_VIEW_STORAGE_KEY}:${key}`) ?? "null") as Partial<RecordPickerPreference> | null;
    return { view: record?.view === "grid" ? "grid" : "list",
      columns: Number.isInteger(record?.columns) && Number(record?.columns) >= 1 && Number(record?.columns) <= 4 ? Number(record?.columns) : fallback.columns };
  } catch { return fallback; }
}

export function saveRecordPickerPreference(type: RecordPickerType, screen: PickerScreenClass, preference: RecordPickerPreference) {
  const key = `${type}:${screen}`;
  pickerSessionPreferences.set(key, preference);
  try { window.localStorage.setItem(`${PICKER_VIEW_STORAGE_KEY}:${key}`, JSON.stringify(preference)); } catch { /* Keep the session preference when storage is unavailable. */ }
}

export type SaleProductViewPreset = "comfortable" | "balanced" | "dense" | "list" | "custom";
export interface SaleProductViewPreference {
  preset: SaleProductViewPreset;
  columns: number;
  showImages: boolean;
  emphasizePrice: boolean;
}
const SALE_VIEW_STORAGE_KEY = "yardimci-asistan.sale-product-view";
const DEFAULT_SALE_VIEW: SaleProductViewPreference = { preset: "balanced", columns: 4, showImages: true, emphasizePrice: true };

export function readSaleProductViewPreference(): SaleProductViewPreference {
  try {
    const record = JSON.parse(window.localStorage.getItem(SALE_VIEW_STORAGE_KEY) ?? "null") as Partial<SaleProductViewPreference> | null;
    if (!record) return { ...DEFAULT_SALE_VIEW };
    return {
      preset: ["comfortable", "balanced", "dense", "list", "custom"].includes(String(record.preset)) ? record.preset! : "balanced",
      columns: Number.isInteger(record.columns) && Number(record.columns) >= 2 && Number(record.columns) <= 6 ? Number(record.columns) : 4,
      showImages: typeof record.showImages === "boolean" ? record.showImages : true,
      emphasizePrice: typeof record.emphasizePrice === "boolean" ? record.emphasizePrice : true
    };
  } catch { return { ...DEFAULT_SALE_VIEW }; }
}

export function saveSaleProductViewPreference(preference: SaleProductViewPreference) {
  try { window.localStorage.setItem(SALE_VIEW_STORAGE_KEY, JSON.stringify(preference)); } catch { /* Storage disabled: retain the session preference. */ }
}

export interface UiPreferences {
  version: 2;
  scheme: UiColorScheme;
  density: UiDensity;
  scale: number;
  accent: UiAccent;
  font: UiFont;
  motion: UiMotion;
}

export const UI_SCALE_OPTIONS = [0.8, 0.9, 1, 1.1, 1.2] as const;
export const UI_SCHEME_OPTIONS: UiColorScheme[] = ["system", "light", "dark"];
export const UI_DENSITY_OPTIONS: UiDensity[] = ["comfortable", "compact"];
export const UI_ACCENT_OPTIONS: UiAccent[] = ["coral", "blue", "green"];
export const UI_FONT_OPTIONS: UiFont[] = ["plex", "system"];
export const UI_MOTION_OPTIONS: UiMotion[] = ["system", "full", "reduced"];

const UI_PREFERENCES_STORAGE_KEY = "yardimci-asistan.ui-preferences";
export const DEFAULT_UI_PREFERENCES: Readonly<UiPreferences> = {
  version: 2,
  scheme: "system",
  density: "comfortable",
  scale: 1,
  accent: "coral",
  font: "plex",
  motion: "system"
};

export function readUiPreferences(): UiPreferences {
  let serialized: string | null;

  try {
    serialized = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }

  if (serialized === null) {
    return { ...DEFAULT_UI_PREFERENCES };
  }

  let stored: unknown;
  try {
    stored = JSON.parse(serialized);
  } catch {
    // Bozuk kayıt uygulamayı kırmamalı; sessizce varsayılanlara dönülür.
    return { ...DEFAULT_UI_PREFERENCES };
  }

  if (typeof stored !== "object" || stored === null) {
    return { ...DEFAULT_UI_PREFERENCES };
  }

  const record = stored as Partial<UiPreferences>;
  if (record.version !== 2) {
    return { ...DEFAULT_UI_PREFERENCES };
  }

  return {
    version: 2,
    scheme: isUiColorScheme(record.scheme) ? record.scheme : DEFAULT_UI_PREFERENCES.scheme,
    density: isUiDensity(record.density) ? record.density : DEFAULT_UI_PREFERENCES.density,
    scale: isUiScale(record.scale) ? record.scale : DEFAULT_UI_PREFERENCES.scale,
    accent: isUiAccent(record.accent) ? record.accent : DEFAULT_UI_PREFERENCES.accent,
    font: isUiFont(record.font) ? record.font : DEFAULT_UI_PREFERENCES.font,
    motion: isUiMotion(record.motion) ? record.motion : DEFAULT_UI_PREFERENCES.motion
  };
}

export function applyUiPreferences(preferences: UiPreferences) {
  const root = document.documentElement;
  root.dataset.colorScheme = preferences.scheme;
  root.dataset.density = preferences.density;
  root.dataset.accent = preferences.accent;
  root.dataset.font = preferences.font;
  root.dataset.motion = preferences.motion;
  root.style.colorScheme = preferences.scheme === "system" ? "light dark" : preferences.scheme;

  if (window.yardimciDesktop?.setUiScale) {
    root.style.setProperty("--ui-scale", "1");
    window.yardimciDesktop.setUiScale(preferences.scale);
  } else {
    root.style.setProperty("--ui-scale", String(preferences.scale));
  }
}

export function saveUiPreferences(preferences: UiPreferences) {
  try {
    const record: UiPreferences = {
      version: 2,
      scheme: preferences.scheme,
      density: preferences.density,
      scale: preferences.scale,
      accent: preferences.accent,
      font: preferences.font,
      motion: preferences.motion
    };
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Görünüm tercihi uygulanmaya devam eder; depolama kapalıysa yalnız bu oturumda geçerli olur.
  }
}

function isUiColorScheme(value: unknown): value is UiColorScheme {
  return value === "system" || value === "light" || value === "dark";
}

function isUiDensity(value: unknown): value is UiDensity {
  return value === "comfortable" || value === "compact";
}

function isUiAccent(value: unknown): value is UiAccent {
  return value === "coral" || value === "blue" || value === "green";
}

function isUiFont(value: unknown): value is UiFont {
  return value === "plex" || value === "system";
}

function isUiMotion(value: unknown): value is UiMotion {
  return value === "system" || value === "full" || value === "reduced";
}

function isUiScale(value: unknown): value is number {
  return typeof value === "number" && UI_SCALE_OPTIONS.some((option) => option === value);
}
