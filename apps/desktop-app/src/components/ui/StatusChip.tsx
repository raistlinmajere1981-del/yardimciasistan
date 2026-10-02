import type { ButtonHTMLAttributes } from "react";
import type { StatusTone } from "./StatusBadge";

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
  return (
    <button
      className={`status-chip ${className}`.trim()}
      type={type}
      data-tone={tone}
      aria-pressed={selected}
      {...props}
    />
  );
}
