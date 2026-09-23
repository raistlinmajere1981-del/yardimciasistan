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

export function AppearanceSettingsSection({ uiPreferences, onUiPreferencesChange }: {
  uiPreferences: UiPreferences;
  onUiPreferencesChange: (preferences: UiPreferences) => void;
}) {
  return (
          <section id="settings-appearance" tabIndex={-1} className="settings-application-subsection appearance-settings">
            <div className="settings-subsection-heading">
              <h3>Görünüm</h3>
              <p>Görünüm seçimleri anında uygulanır ve bu cihazda saklanır; Ayarları Kaydet gerekmez.</p>
            </div>
          <div className="form-grid appearance-controls">
            <fieldset className="appearance-field">
              <legend>Renk düzeni</legend>
              <div className="appearance-segment">
                {UI_SCHEME_OPTIONS.map((scheme) => (
                  <label key={scheme} className={`appearance-option${uiPreferences.scheme === scheme ? " is-selected" : ""}`}>
                    <input
                      checked={uiPreferences.scheme === scheme}
                      onChange={() => onUiPreferencesChange({ ...uiPreferences, scheme })}
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
                      onChange={() => onUiPreferencesChange({ ...uiPreferences, density })}
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
                      onChange={() => onUiPreferencesChange({ ...uiPreferences, accent })}
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
                onChange={(event) => onUiPreferencesChange({ ...uiPreferences, scale: Number(event.target.value) })}
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
                      onChange={() => onUiPreferencesChange({ ...uiPreferences, font })}
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
                      onChange={() => onUiPreferencesChange({ ...uiPreferences, motion })}
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
          </section>

  );
}
