import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, eyebrow, description, action }: PageHeaderProps) {
  return (
    <header className="topbar page-header">
      <div className="page-header-copy">
        <div className="page-header-title-row">
          {eyebrow && <span className="page-header-eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
        </div>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}
