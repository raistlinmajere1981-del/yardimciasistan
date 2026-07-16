import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

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

interface CompactListButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  title: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
}

export function CompactListButton({
  title,
  leading,
  meta,
  description,
  trailing,
  selected = false,
  className = "",
  type = "button",
  ...props
}: CompactListButtonProps) {
  return (
    <button
      className={`compact-list-item compact-list-button${selected ? " is-selected" : ""} ${className}`.trim()}
      type={type}
      {...props}
    >
      <span className="compact-list-main">
        <span className="compact-list-heading">
          {leading}
          <strong className="compact-list-title">{title}</strong>
        </span>
        {meta && <span className="compact-meta-row">{meta}</span>}
        {description && <span className="compact-list-description line-clamp-1">{description}</span>}
      </span>
      {trailing && <span className="compact-list-trailing">{trailing}</span>}
    </button>
  );
}
