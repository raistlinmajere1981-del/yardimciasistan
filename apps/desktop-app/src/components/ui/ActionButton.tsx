import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ActionButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet" | "whatsapp";
export type ActionButtonSize = "sm" | "md" | "lg";
export type ActionButtonResult = "success" | "error";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  fullWidth?: boolean;
  busy?: boolean;
  busyLabel?: ReactNode;
  result?: ActionButtonResult;
}

export function ActionButton({
  variant = "primary",
  size = "md",
  fullWidth = false,
  busy = false,
  busyLabel = "İşleniyor…",
  result,
  disabled,
  children,
  className = "",
  type = "button",
  ...props
}: ActionButtonProps) {
  return (
    <button
      className={`action-button action-button-${variant} action-button-${size}${fullWidth ? " action-button-full" : ""} ${className}`.trim()}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-result={result}
      {...props}
    >
      {busy ? busyLabel : children}
    </button>
  );
}
