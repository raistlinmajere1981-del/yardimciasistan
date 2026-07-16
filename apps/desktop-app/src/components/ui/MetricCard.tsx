import type { LucideIcon } from "lucide-react";

export type MetricTone = "info" | "ok" | "wait" | "neutral";

export interface MetricCardProps {
  title: string;
  value: string;
  detail: string;
  tone: MetricTone;
  icon: LucideIcon;
}

export function MetricCard({ title, value, detail, tone, icon: Icon }: MetricCardProps) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-icon">
        <Icon size={19} aria-hidden="true" />
      </div>
      <div>
        <span title={title}>{title}</span>
        <strong>{value}</strong>
        <p title={detail}>{detail}</p>
      </div>
    </article>
  );
}
