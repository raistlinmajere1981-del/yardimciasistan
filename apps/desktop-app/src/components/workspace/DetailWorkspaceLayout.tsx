import { useId, type ReactNode } from "react";

/** Presentation only: each entity keeps its own drafts, operations and footer. */
export function DetailWorkspaceLayout({ rail, railLabel, contentLabel, children, className = "" }: {
  rail: ReactNode;
  railLabel: string;
  contentLabel: string;
  children: ReactNode;
  className?: string;
}) {
  return <div className={`detail-workspace-layout ${className}`}>
    <aside className="detail-workspace-layout__rail" aria-label={railLabel}>{rail}</aside>
    <div className="detail-workspace-layout__content" role="region" aria-label={contentLabel}>{children}</div>
  </div>;
}

export function DetailSectionCard({ title, actions, children, className = "" }: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  return <section className={`panel detail-section-card ${className}`} aria-labelledby={titleId}>
    <header className="detail-section-card__heading">
      <h3 id={titleId}>{title}</h3>
      {actions}
    </header>
    {children}
  </section>;
}
