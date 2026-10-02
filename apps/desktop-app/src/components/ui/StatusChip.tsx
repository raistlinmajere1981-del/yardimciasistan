import type { ButtonHTMLAttributes } from "react";
import { normalizeStatusTone, type StatusTone } from "./StatusBadge";

interface StatusChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: StatusTone;
  selected?: boolean;
}

export function StatusChip({
  tone = "neutral",
  selected = false,
  className = "",
  type = "button",
  ...props
}: StatusChipProps) {
  const normalizedTone = normalizeStatusTone(tone);
  return (
    <button
      className={`status-chip ${className}`.trim()}
      type={type}
      data-tone={normalizedTone}
      aria-pressed={selected}
      {...props}
    />
  );
}
