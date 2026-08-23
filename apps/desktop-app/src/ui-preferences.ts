export type UiTheme = "light" | "dark";
export type UiMode = "easy" | "pro";

export interface UiPreferences {
  theme: UiTheme;
  scale: number;
  mode: UiMode;
}

export const UI_SCALE_OPTIONS = [0.8, 0.9, 1, 1.1, 1.2] as const;

const UI_PREFERENCES_STORAGE_KEY = "yardimci-asistan.ui-preferences";
const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: "light",
  scale: 1,
  mode: "easy"
};

export function readUiPreferences(): UiPreferences {
  let serialized: string | null;

  try {
    serialized = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }

  if (serialized === null) {
    return DEFAULT_UI_PREFERENCES;
  }

  try {
    const stored = JSON.parse(serialized) as Partial<UiPreferences> | null;

    return {
      theme: isUiTheme(stored?.theme) ? stored.theme : DEFAULT_UI_PREFERENCES.theme,
      scale: isUiScale(stored?.scale) ? stored.scale : DEFAULT_UI_PREFERENCES.scale,
      mode: isUiMode(stored?.mode) ? stored.mode : "pro"
    };
  } catch {
    // Bozuk olsa bile var olan bir kayıt eski kullanıcı kabul edilir; görünüm sessizce değişmez.
    return { ...DEFAULT_UI_PREFERENCES, mode: "pro" };
  }
}

export function applyUiPreferences(preferences: UiPreferences) {
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.mode = preferences.mode;
  document.documentElement.style.colorScheme = preferences.mode === "easy" ? "light" : preferences.theme;

  if (window.yardimciDesktop?.setUiScale) {
    document.documentElement.style.setProperty("--ui-scale", "1");
    window.yardimciDesktop.setUiScale(preferences.scale);
  } else {
    document.documentElement.style.setProperty("--ui-scale", String(preferences.scale));
  }
}

export function saveUiPreferences(preferences: UiPreferences) {
  try {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Görünüm tercihi uygulanmaya devam eder; depolama kapalıysa yalnız bu oturumda geçerli olur.
  }
}

function isUiTheme(value: unknown): value is UiTheme {
  return value === "light" || value === "dark";
}

function isUiMode(value: unknown): value is UiMode {
  return value === "easy" || value === "pro";
}

function isUiScale(value: unknown): value is number {
  return typeof value === "number" && UI_SCALE_OPTIONS.some((option) => option === value);
}
