import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from "react";

interface DataListItemProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
  twoLine?: boolean;
}

export function DataListItem({
  title,
  leading,
  meta,
  description,
  actions,
  selected = false,
  twoLine = false,
  className = "",
  ...props
}: DataListItemProps) {
  return (
    <article className={`list-row${selected ? " is-selected" : ""}${twoLine ? " list-row--two-line" : ""} ${className}`.trim()} {...props}>
      <div className="list-row__main">
        <div className="list-row__heading">
          {leading}
          <h3 title={typeof title === "string" ? title : undefined}>{title}</h3>
        </div>
        {meta && <div className="list-row__meta" title={typeof meta === "string" ? meta : undefined}>{meta}</div>}
        {description && <p className="list-row__description" title={typeof description === "string" ? description : undefined}>{description}</p>}
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
  twoLine?: boolean;
}

export function DataListButton({
  title,
  leading,
  meta,
  description,
  trailing,
  selected = false,
  twoLine = false,
  className = "",
  type = "button",
  ...props
}: DataListButtonProps) {
  return (
    <button
      className={`list-row list-row--button${selected ? " is-selected" : ""}${twoLine ? " list-row--two-line" : ""} ${className}`.trim()}
      type={type}
      {...props}
    >
      <span className="list-row__main">
        <span className="list-row__heading">
          {leading}
          <strong title={typeof title === "string" ? title : undefined} className="list-row__title">{title}</strong>
        </span>
        {meta && <span className="list-row__meta" title={typeof meta === "string" ? meta : undefined}>{meta}</span>}
        {description && <span className="list-row__description" title={typeof description === "string" ? description : undefined}>{description}</span>}
      </span>
      {trailing && <span className="list-row__trailing">{trailing}</span>}
    </button>
  );
}

export function DataList({ className = "", ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return <div className={`data-records ${className}`.trim()} {...props} />;
}
