import type { HTMLAttributes } from "react";

export type SurfaceRole = "neutral" | "configuration" | "operation" | "finance" | "communication" | "integration";
type PanelPadding = "compact" | "default";
type PanelElement = "article" | "section" | "div";

interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: PanelElement;
  padding?: PanelPadding;
  surfaceRole?: SurfaceRole;
}

export function Panel({
  as: Component = "article",
  className = "",
  padding = "default",
  surfaceRole = "neutral",
  ...props
}: PanelProps) {
  return (
    <Component
      className={`panel panel-padding-${padding} ${className}`.trim()}
      data-surface-role={surfaceRole}
      {...props}
    />
  );
}
