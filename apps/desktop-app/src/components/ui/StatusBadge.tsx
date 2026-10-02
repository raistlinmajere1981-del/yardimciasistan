import type { HTMLAttributes } from "react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "muted" | "wait" | "ok";
type CanonicalStatusTone = Exclude<StatusTone, "wait" | "ok">;

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

export function normalizeStatusTone(tone: StatusTone): CanonicalStatusTone {
  if (tone === "wait") return "warning";
  if (tone === "ok") return "success";
  return tone;
}

export function StatusBadge({ tone = "neutral", className = "", ...props }: StatusBadgeProps) {
  const normalizedTone = normalizeStatusTone(tone);
  return (
    <span
      className={`status-badge ${normalizedTone} ${className}`.trim()}
      data-tone={normalizedTone}
      {...props}
    />
  );
}
