import type { ReactNode } from "react";

interface ServiceSettingsCardProps {
  id: string;
  title: string;
  status?: string;
  enabled: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}

/** Presentation only: toggles update the owning Settings draft. */
export function ServiceSettingsCard({ id, title, status, enabled, onEnabledChange, disabled, children }: ServiceSettingsCardProps) {
  return (
    <section id={id} tabIndex={-1} aria-label={title}
      className={`settings-service-card settings-service-panel${enabled ? " is-enabled" : " is-disabled"}`}>
      <div className="settings-service-card-header">
        <div><strong>{title}</strong><span>{status ?? (enabled ? "Etkin" : "Kapalı")}</span></div>
        {onEnabledChange && <label className="settings-service-toggle">
          <input type="checkbox" aria-label={`${title} servisi`} checked={enabled} disabled={disabled}
            onChange={(event) => onEnabledChange(event.target.checked)} />
          <span>{enabled ? "Etkin" : "Kapalı"}</span>
        </label>}
      </div>
      {enabled && <fieldset className="settings-service-card-body form-stack" disabled={disabled}>{children}</fieldset>}
    </section>
  );
}
