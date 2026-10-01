import type { ReactNode } from "react";

export function HistoryList({ children, empty }: { children: ReactNode; empty?: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <div className="history-list">{hasChildren ? children : <div className="history-empty">{empty ?? "Kayıt yok."}</div>}</div>;
}

export function HistoryRecord({ kind, title, status, meta, description, trailing, actions, children, className = "" }: {
  kind?: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return <article className={`history-record ${className}`.trim()}>
    <div className="history-record__main">
      <div className="history-record__heading">
        <div className="history-record__title-wrap">
          {kind && <span className="history-record__kind">{kind}</span>}
          <strong className="history-record__title">{title}</strong>
        </div>
        {status && <div className="history-record__status">{status}</div>}
      </div>
      {meta && <div className="history-record__meta">{meta}</div>}
      {description && <p className="history-record__description">{description}</p>}
      {children}
    </div>
    {(trailing || actions) && <div className="history-record__aside">
      {trailing && <div className="history-record__trailing">{trailing}</div>}
      {actions && <div className="history-record__actions">{actions}</div>}
    </div>}
  </article>;
}
