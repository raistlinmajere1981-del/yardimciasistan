import { useId, type ReactNode } from "react";
import type { SurfaceRole } from "../ui/Panel";

/** A fixed panel heading and one deliberate scroll owner within an operation surface. */
export function OperationPanel({
  title,
  children,
  className = "",
  id,
  surfaceRole = "operation"
}: {
  title: string;
  children: ReactNode;
  className?: string;
  id?: string;
  surfaceRole?: SurfaceRole;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      className={`operation-panel ${className}`.trim()}
      data-surface-role={surfaceRole}
      aria-labelledby={headingId}
      tabIndex={-1}
    >
      <header className="operation-panel__heading"><h3 id={headingId}>{title}</h3></header>
      <div className="operation-panel__body">{children}</div>
    </section>
  );
}
