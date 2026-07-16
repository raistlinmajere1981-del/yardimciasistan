import type { HTMLAttributes } from "react";

export function CompactList({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`compact-list ${className}`.trim()} {...props} />;
}
