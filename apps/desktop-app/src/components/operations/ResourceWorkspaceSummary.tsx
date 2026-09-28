import type { ReactNode } from "react";

/** Read-only resource context. Operations and draft state stay in their feature panels. */
export function ResourceWorkspaceSummary({ label, facts, status, children, imageSrc }: {
  label: string; facts: ReactNode; status: ReactNode; children?: ReactNode; imageSrc?: string;
}) {
  return <section className="resource-workspace-summary" aria-label={label}>
    {imageSrc && <img className="resource-workspace-summary__image" src={imageSrc} alt="" title="Temsili görsel" width={1536} height={1024} />}
    <div className="resource-workspace-summary__identity">
    <div className="resource-workspace-summary__facts">{facts}</div>
    <div className="resource-workspace-summary__status">{status}</div>
    </div>
    {children && <div className="resource-workspace-summary__detail">{children}</div>}
  </section>;
}
