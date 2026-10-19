import type { ButtonHTMLAttributes, Ref } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  "aria-label": string;
  variant?: "normal" | "quiet" | "selected" | "danger";
  size?: "sm" | "md";
  busy?: boolean;
}

export function IconButton({ variant = "normal", size = "md", busy = false, disabled, className = "", type = "button", ...props }: IconButtonProps) {
  return <button type={type} className={`icon-button icon-button--${variant} icon-button--${size} ${className}`.trim()}
    disabled={disabled || busy} aria-busy={busy || undefined} {...props} />;
}
