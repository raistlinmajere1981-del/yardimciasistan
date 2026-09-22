import type { ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  variant?: "normal" | "selected" | "danger";
  size?: "sm" | "md";
}

export function IconButton({ variant = "normal", size = "md", className = "", type = "button", ...props }: IconButtonProps) {
  return <button type={type} className={`icon-button icon-button--${variant} icon-button--${size} ${className}`.trim()} {...props} />;
}
