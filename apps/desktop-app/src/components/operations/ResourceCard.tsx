import { ArrowUpRight } from "lucide-react";
import { useId, type ReactNode } from "react";
import { ActionButton } from "../ui/ActionButton";

/** Presentation only. Resource identity, facts and operations belong to the feature. */
export function ResourceCard({ title, subtitle, icon, status, tone, children, action, onOpen, openLabel, busy, feedback, error }: {
  title: string; subtitle?: string; icon: ReactNode; status: ReactNode;
  tone: "neutral" | "success" | "info" | "warning" | "danger";
  children: ReactNode; action?: ReactNode; onOpen: () => void; openLabel: string;
  busy?: boolean; feedback?: string; error?: boolean;
}) {
  const id = useId();
  return <article className="resource-card" data-tone={tone} aria-labelledby={`${id}-title`} aria-busy={busy || undefined}>
    <header className="resource-card__header">
      <span className="resource-card__icon" aria-hidden="true">{icon}</span>
      <div><h3 id={`${id}-title`}>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
    </header>
    <div className="resource-card__status">{status}</div>
    <div className="resource-card__facts">{children}</div>
    <div className="resource-card__footer">
      {(busy || feedback) && <p className="resource-card__feedback" role={error ? "alert" : "status"}>{busy ? "İşlem sürüyor…" : feedback}</p>}
      <div className="resource-card__actions">
        {action}
        <ActionButton variant="secondary" disabled={busy} onClick={onOpen} aria-label={openLabel}>Ayrıntı <ArrowUpRight size={16} aria-hidden="true" /></ActionButton>
      </div>
    </div>
  </article>;
}
