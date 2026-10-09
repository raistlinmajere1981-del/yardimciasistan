import type { ReactNode } from "react";

interface ResourceManagementWorkspaceProps {
  id: string;
  className?: string;
  title: string;
  subtitle: string;
  publishChecked: boolean;
  publishAriaLabel: string;
  disabled?: boolean;
  onPublishChange: (checked: boolean) => void;
  children: ReactNode;
  media: ReactNode;
  actions?: ReactNode;
}

export function ResourceManagementWorkspace({
  id,
  className = "",
  title,
  subtitle,
  publishChecked,
  publishAriaLabel,
  disabled = false,
  onPublishChange,
  children,
  actions,
  media
}: ResourceManagementWorkspaceProps) {
  return (
    <section
      id={id}
      tabIndex={-1}
      className={`resource-management-workspace${className ? ` ${className}` : ""}`}
    >
      <div className="settings-panel resource-management-shell">
        <div className="resource-management-main-pane">
          <div className="settings-panel-header resource-management-pane-header">
            <div>
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
            <div className="resource-management-header-actions">
              <label className="resource-management-publication-toggle">
                <input
                  type="checkbox"
                  aria-label={publishAriaLabel}
                  checked={publishChecked}
                  disabled={disabled}
                  onChange={(event) => onPublishChange(event.target.checked)}
                />
                <span>Webde yayınla</span>
              </label>
              {actions}
            </div>
          </div>

          <div className="resource-management-main-body">
            <div className="resource-management-content">
              {children}
            </div>
          </div>
        </div>

        <div className="resource-management-media-pane">
          {media}
        </div>
      </div>
    </section>
  );
}
