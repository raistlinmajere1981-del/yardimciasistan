import type { ReactNode } from "react";

export type FeatureWorkspaceLayout = "flow" | "fill";

/**
 * Page geometry only.
 * - flow: content owns its natural height and the page body scrolls when needed.
 * - fill: the active work surface fills the available viewport and owns internal scroll.
 */
export function FeatureWorkspacePage({ label, toolbar, bodyLabel, layout = "flow", children }: {
  label: string;
  toolbar?: ReactNode;
  bodyLabel: string;
  layout?: FeatureWorkspaceLayout;
  children: ReactNode;
}) {
  return <section className={`feature-workspace-page feature-workspace-page--${layout}`} aria-label={label}>
    {toolbar && <div className="page-toolbar">{toolbar}</div>}
    <section className="feature-workspace-page__body" aria-label={bodyLabel}>{children}</section>
  </section>;
}
