import type { ReactNode } from "react";

interface ServiceSettingsCardProps {
  id: string;
  className?: string;
  title: string;
  status?: string;
  enabled: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  toggleLabel?: string;
  toggleAriaLabel?: string;
  toggleDisabled?: boolean;
  headerActions?: ReactNode;
  showBody?: boolean;
  disabled?: boolean;
  feedback?: ReactNode;
  children: ReactNode;
}

/** Presentation only: toggles update the owning Settings draft. */
export function ServiceSettingsCard({ id, title, status, enabled, onEnabledChange, toggleLabel, toggleAriaLabel, toggleDisabled, headerActions, showBody = enabled, disabled, feedback, className = "", children }: ServiceSettingsCardProps) {
  return (
    <section id={id} tabIndex={-1} aria-label={title}
      className={`settings-service-card settings-service-panel ${className}${enabled ? " is-enabled" : " is-disabled"}${showBody ? " is-expanded" : ""}`}>
      <div className="settings-service-card-header">
        <div className="settings-service-card-title"><strong>{title}</strong><span id={`${id}-status`}>{status ?? (enabled ? "Etkin" : "Kapalı")}</span></div>
        {headerActions}
        {onEnabledChange && <label className="settings-service-toggle">
          <input type="checkbox" aria-label={toggleAriaLabel ?? toggleLabel ?? `${title} servisi`} aria-describedby={`${id}-status`} checked={enabled} disabled={disabled || toggleDisabled}
            onChange={(event) => onEnabledChange(event.target.checked)} />
          <span>{toggleLabel ?? (enabled ? "Etkin" : "Kapalı")}</span>
        </label>}
      </div>
      {showBody && <fieldset className="settings-service-card-body form-stack" disabled={disabled}>{children}</fieldset>}
      {feedback}
    </section>
  );
}
