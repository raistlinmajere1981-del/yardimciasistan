import type { HTMLAttributes } from "react";

interface PageWorkSurfaceProps extends HTMLAttributes<HTMLElement> {
  mode?: "fill" | "flow";
}

export function PageWorkSurface({
  mode = "fill",
  className = "",
  ...props
}: PageWorkSurfaceProps) {
  return (
    <section
      className={`page-work-surface page-work-surface--${mode} ${className}`.trim()}
      {...props}
    />
  );
}
