import type { HTMLAttributes } from "react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

export function StatusBadge({ tone = "neutral", className = "", ...props }: StatusBadgeProps) {
  return (
    <span
      className={`status-badge ${tone} ${className}`.trim()}
      data-tone={tone}
      {...props}
    />
  );
}
