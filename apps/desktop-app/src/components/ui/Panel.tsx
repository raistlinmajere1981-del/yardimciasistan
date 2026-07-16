import type { HTMLAttributes } from "react";

export type PanelPadding = "compact" | "default";

interface PanelProps extends HTMLAttributes<HTMLElement> {
  padding?: PanelPadding;
}

export function Panel({ className = "", padding = "default", ...props }: PanelProps) {
  return <article className={`panel panel-padding-${padding} ${className}`.trim()} {...props} />;
}
