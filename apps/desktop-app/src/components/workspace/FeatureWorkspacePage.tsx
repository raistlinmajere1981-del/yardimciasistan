import type { ReactNode } from "react";

/** Page geometry only; the feature owns its operational body, optional toolbar and state. */
export function FeatureWorkspacePage({ label, toolbar, bodyLabel, children }: {
  label: string;
  toolbar?: ReactNode;
  bodyLabel: string;
  children: ReactNode;
}) {
  return <section className="feature-workspace-page" aria-label={label}>
    {toolbar && <div className="page-toolbar">{toolbar}</div>}
    <section className="feature-workspace-page__body" aria-label={bodyLabel}>{children}</section>
  </section>;
}
