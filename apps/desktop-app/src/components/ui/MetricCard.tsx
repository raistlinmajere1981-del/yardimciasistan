import type { LucideIcon } from "lucide-react";

type MetricTone = "info" | "ok" | "wait" | "neutral";

export interface MetricCardProps {
  title: string;
  value: string;
  detail?: string;
  tone: MetricTone;
  icon: LucideIcon;
  compact?: boolean;
}

export function MetricCard({ title, value, detail, tone, icon: Icon, compact = false }: MetricCardProps) {
  return (
    <article className={`surface metric-card tone-${tone}${compact ? " metric-card-compact" : ""}`}>
      <div className="metric-icon">
        <Icon size={19} aria-hidden="true" />
      </div>
      <div>
        <span title={title}>{title}</span>
        <strong>{value}</strong>
        {detail && <p title={detail}>{detail}</p>}
      </div>
    </article>
  );
}
