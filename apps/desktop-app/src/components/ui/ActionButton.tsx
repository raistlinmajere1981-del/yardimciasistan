import type { ButtonHTMLAttributes } from "react";

type ActionButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "whatsapp";
type ActionButtonSize = "sm" | "md";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
}

export function ActionButton({ variant = "primary", size = "md", className = "", type = "button", ...props }: ActionButtonProps) {
  return (
    <button
      className={`action-button action-button-${variant} action-button-${size} ${className}`.trim()}
      type={type}
      {...props}
    />
  );
}
