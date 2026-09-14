import type { HTMLAttributes } from "react";

export type StatusTone = "info" | "wait" | "ok" | "danger" | "neutral" | "success" | "warning";

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

export function StatusBadge({ tone = "neutral", className = "", ...props }: StatusBadgeProps) {
  return <span className={`status-badge ${tone} ${className}`.trim()} {...props} />;
}
