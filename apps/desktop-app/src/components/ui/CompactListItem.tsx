import type { HTMLAttributes, ReactNode } from "react";

interface CompactListItemProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
}

export function CompactListItem({
  title,
  leading,
  meta,
  description,
  actions,
  selected = false,
  className = "",
  ...props
}: CompactListItemProps) {
  return (
    <article className={`compact-list-item${selected ? " is-selected" : ""} ${className}`.trim()} {...props}>
      <div className="compact-list-main">
        <div className="compact-list-heading">
          {leading}
          <h3>{title}</h3>
        </div>
        {meta && <div className="compact-meta-row">{meta}</div>}
        {description && <p className="line-clamp-1">{description}</p>}
      </div>
      {actions && <div className="compact-action-bar">{actions}</div>}
    </article>
  );
}
