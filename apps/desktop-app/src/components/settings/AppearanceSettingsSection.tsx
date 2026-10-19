import { useEffect, useRef, useState } from "react";
import { Palette, X } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { ActionButton } from "../ui/ActionButton";
import {
  DEFAULT_UI_PREFERENCES,
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

export function AppearanceSettingsSection({ preferences: uiPreferences, onPreferencesChange }: {
  preferences: UiPreferences;
  onPreferencesChange: (preferences: UiPreferences) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();

    // Clicking a label or a non-focusable area can briefly move focus outside
    // the popover. That focus transition must not dismiss an inside click.
    let internalPointerFocus = false;
    let pointerFocusReset: number | undefined;
    function handlePointerDown(event: PointerEvent) {
      const inside = event.target instanceof Node && rootRef.current?.contains(event.target);
      if (!inside) {
        setOpen(false);
        return;
      }
      internalPointerFocus = true;
      window.clearTimeout(pointerFocusReset);
      pointerFocusReset = window.setTimeout(() => { internalPointerFocus = false; }, 0);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    function handleFocusIn(event: FocusEvent) {
      if (internalPointerFocus) return;
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      window.clearTimeout(pointerFocusReset);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [open]);

  return (
    <div className="appearance-menu" ref={rootRef}>
      <IconButton
        ref={triggerRef}
        type="button"
        className="appearance-trigger"
        aria-label="Görünüm"
        title="Görünüm"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? "desktop-appearance" : undefined}
        onClick={() => setOpen(current => !current)}
      >
        <Palette size={18} aria-hidden="true" />
      </IconButton>
      {open && (
        <section id="desktop-appearance" ref={panelRef} className="appearance-popover" role="dialog" aria-labelledby="desktop-appearance-title" aria-describedby="desktop-appearance-description">
          <header className="appearance-popover-header">
            <div>
              <h2 id="desktop-appearance-title">Görünüm</h2>
              <p id="desktop-appearance-description">Seçimler hemen uygulanır ve bu cihazda saklanır.</p>
            </div>
            <IconButton className="appearance-close" aria-label="Görünümü kapat" onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}><X size={18} aria-hidden="true" /></IconButton>
          </header>
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
          <ActionButton variant="ghost" className="appearance-reset" onClick={() => onPreferencesChange({ ...DEFAULT_UI_PREFERENCES })}>
            Varsayılanlara dön
          </ActionButton>
        </section>
      )}
    </div>
  );
}
