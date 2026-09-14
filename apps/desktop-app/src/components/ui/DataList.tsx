import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

interface DataListItemProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
}

export function DataListItem({
  title,
  leading,
  meta,
  description,
  actions,
  selected = false,
  className = "",
  ...props
}: DataListItemProps) {
  return (
    <article className={`list-row${selected ? " is-selected" : ""} ${className}`.trim()} {...props}>
      <div className="list-row__main">
        <div className="list-row__heading">
          {leading}
          <h3>{title}</h3>
        </div>
        {meta && <div className="list-row__meta">{meta}</div>}
        {description && <p className="list-row__description">{description}</p>}
      </div>
      {actions && <div className="list-row__actions">{actions}</div>}
    </article>
  );
}

interface DataListButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  title: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
}

export function DataListButton({
  title,
  leading,
  meta,
  description,
  trailing,
  selected = false,
  className = "",
  type = "button",
  ...props
}: DataListButtonProps) {
  return (
    <button
      className={`list-row list-row--button${selected ? " is-selected" : ""} ${className}`.trim()}
      type={type}
      {...props}
    >
      <span className="list-row__main">
        <span className="list-row__heading">
          {leading}
          <strong className="list-row__title">{title}</strong>
        </span>
        {meta && <span className="list-row__meta">{meta}</span>}
        {description && <span className="list-row__description">{description}</span>}
      </span>
      {trailing && <span className="list-row__trailing">{trailing}</span>}
    </button>
  );
}

export function DataList({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`data-records ${className}`.trim()} {...props} />;
}
