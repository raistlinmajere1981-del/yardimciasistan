import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsOperationResult } from "../../app/settings-save";
import {
  UI_ACCENT_OPTIONS,
  UI_DENSITY_OPTIONS,
  UI_FONT_OPTIONS,
  UI_MOTION_OPTIONS,
  UI_SCALE_OPTIONS,
  UI_SCHEME_OPTIONS,
  type UiPreferences
} from "../../ui-preferences";

const APPEARANCE_SCHEME_LABELS = {
  system: "Sistem",
  light: "Açık",
  dark: "Koyu"
} as const;

const APPEARANCE_DENSITY_LABELS = {
  comfortable: "Rahat",
  compact: "Kompakt"
} as const;

const APPEARANCE_ACCENT_LABELS = {
  coral: "Mercan",
  blue: "Mavi",
  green: "Yeşil"
} as const;

const APPEARANCE_FONT_LABELS = {
  plex: "IBM Plex Sans",
  system: "Sistem"
} as const;

const APPEARANCE_MOTION_LABELS = {
  system: "Sistem",
  full: "Normal",
  reduced: "Azaltılmış"
} as const;

export function useAppearanceSettings(
  canonicalPreferences: UiPreferences,
  onCommit: (preferences: UiPreferences) => void
) {
  const [preferences, setPreferencesState] = useState<UiPreferences>(
    () => cloneUiPreferences(canonicalPreferences)
  );
  const draftRef = useRef(preferences);
  const baselineRef = useRef(cloneUiPreferences(canonicalPreferences));
  const canonicalRef = useRef(canonicalPreferences);

  useEffect(() => {
    if (canonicalRef.current === canonicalPreferences) return;
    canonicalRef.current = canonicalPreferences;
    // Adopt the new commit point as baseline, but never overwrite an active
    // dirty draft with an external refresh. Discard restores these values.
    const next = cloneUiPreferences(canonicalPreferences);
    const wasDirty = !sameUiPreferences(draftRef.current, baselineRef.current);
    baselineRef.current = next;
    if (!wasDirty) {
      draftRef.current = cloneUiPreferences(next);
      setPreferencesState(cloneUiPreferences(next));
    }
  }, [canonicalPreferences]);

  const onPreferencesChange = useCallback((next: UiPreferences) => {
    const draft = cloneUiPreferences(next);
    draftRef.current = draft;
    setPreferencesState(draft);
  }, []);

  const dirty = !sameUiPreferences(preferences, baselineRef.current);

  const save = useCallback((): SettingsOperationResult => {
    if (sameUiPreferences(draftRef.current, baselineRef.current)) {
      return { ok: true, changed: false };
    }

    const next = cloneUiPreferences(draftRef.current);
    onCommit(next);
    canonicalRef.current = next;
    baselineRef.current = next;
    draftRef.current = next;
    setPreferencesState(next);
    return { ok: true, changed: true, message: "Görünüm tercihleri kaydedildi." };
  }, [onCommit]);

  const discard = useCallback(() => {
    const next = cloneUiPreferences(baselineRef.current);
    draftRef.current = next;
    setPreferencesState(next);
  }, []);

  return {
    preferences,
    onPreferencesChange,
    dirty,
    save,
    discard
  };
}

type AppearanceSettingsController = ReturnType<typeof useAppearanceSettings>;

export function AppearanceSettingsSection({ controller }: {
  controller: AppearanceSettingsController;
}) {
  const { preferences: uiPreferences, onPreferencesChange } = controller;

  return (
          <section id="settings-appearance" tabIndex={-1} className="settings-application-subsection settings-panel appearance-settings">
            <div className="settings-panel-header">
              <div>
                <h3>Görünüm</h3>
                <p>Seçimler Kaydet ile uygulanır ve bu cihazda saklanır.</p>
              </div>
            </div>
          <div className="settings-panel-body">
          <div className="form-grid appearance-controls">
            <fieldset className="appearance-field">
              <legend>Renk düzeni</legend>
              <div className="appearance-segment">
                {UI_SCHEME_OPTIONS.map((scheme) => (
                  <label key={scheme} className={`appearance-option${uiPreferences.scheme === scheme ? " is-selected" : ""}`}>
                    <input
                      checked={uiPreferences.scheme === scheme}
                      onChange={() => onPreferencesChange({ ...uiPreferences, scheme })}
                      name="appearance-scheme"
                      type="radio"
                      value={scheme}
                    />
                    <span>{APPEARANCE_SCHEME_LABELS[scheme]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="appearance-field">
              <legend>Yoğunluk</legend>
              <div className="appearance-segment">
                {UI_DENSITY_OPTIONS.map((density) => (
                  <label key={density} className={`appearance-option${uiPreferences.density === density ? " is-selected" : ""}`}>
                    <input
                      checked={uiPreferences.density === density}
                      onChange={() => onPreferencesChange({ ...uiPreferences, density })}
                      name="appearance-density"
                      type="radio"
                      value={density}
                    />
                    <span>{APPEARANCE_DENSITY_LABELS[density]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="appearance-field">
              <legend>Vurgu rengi</legend>
              <div className="appearance-segment">
                {UI_ACCENT_OPTIONS.map((accent) => (
                  <label key={accent} className={`appearance-option${uiPreferences.accent === accent ? " is-selected" : ""}`}>
                    <input
                      checked={uiPreferences.accent === accent}
                      onChange={() => onPreferencesChange({ ...uiPreferences, accent })}
                      name="appearance-accent"
                      type="radio"
                      value={accent}
                    />
                    <span>{APPEARANCE_ACCENT_LABELS[accent]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="form-field form-field--short">
              Arayüz ölçeği
              <select
                value={String(uiPreferences.scale)}
                onChange={(event) => onPreferencesChange({ ...uiPreferences, scale: Number(event.target.value) })}
              >
                {UI_SCALE_OPTIONS.map((scale) => (
                  <option value={scale} key={scale}>{Math.round(scale * 100)}%</option>
                ))}
              </select>
            </label>
            <fieldset className="appearance-field">
              <legend>Yazı tipi</legend>
              <div className="appearance-segment">
                {UI_FONT_OPTIONS.map((font) => (
                  <label key={font} className={`appearance-option${uiPreferences.font === font ? " is-selected" : ""}`}>
                    <input
                      checked={uiPreferences.font === font}
                      onChange={() => onPreferencesChange({ ...uiPreferences, font })}
                      name="appearance-font"
                      type="radio"
                      value={font}
                    />
                    <span>{APPEARANCE_FONT_LABELS[font]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="appearance-field">
              <legend>Hareket</legend>
              <div className="appearance-segment">
                {UI_MOTION_OPTIONS.map((motion) => (
                  <label key={motion} className={`appearance-option${uiPreferences.motion === motion ? " is-selected" : ""}`}>
                    <input
                      checked={uiPreferences.motion === motion}
                      onChange={() => onPreferencesChange({ ...uiPreferences, motion })}
                      name="appearance-motion"
                      type="radio"
                      value={motion}
                    />
                    <span>{APPEARANCE_MOTION_LABELS[motion]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          </div>
          </section>

  );
}

function cloneUiPreferences(preferences: UiPreferences): UiPreferences {
  return { ...preferences };
}

function sameUiPreferences(left: UiPreferences, right: UiPreferences) {
  return left.version === right.version
    && left.scheme === right.scheme
    && left.density === right.density
    && left.scale === right.scale
    && left.accent === right.accent
    && left.font === right.font
    && left.motion === right.motion;
}
