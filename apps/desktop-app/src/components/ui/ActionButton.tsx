import type { ButtonHTMLAttributes } from "react";

type ActionButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "whatsapp";
type ActionButtonSize = "sm" | "md" | "lg";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  fullWidth?: boolean;
}

export function ActionButton({ variant = "primary", size = "md", fullWidth = false, className = "", type = "button", ...props }: ActionButtonProps) {
  return (
    <button
      className={`action-button action-button-${variant} action-button-${size}${fullWidth ? " action-button-full" : ""} ${className}`.trim()}
      type={type}
      {...props}
    />
  );
}
