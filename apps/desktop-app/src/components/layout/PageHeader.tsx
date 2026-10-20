import { useLayoutEffect, useRef, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  notice?: ReactNode;
  noticeLeading?: ReactNode;
}

export function PageHeader({ title, eyebrow, description, action, notice, noticeLeading }: PageHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const viewport = header?.parentElement;
    if (!header || !viewport) return;
    const update = () => viewport.style.setProperty("--sticky-header-offset", `${header.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => { observer.disconnect(); viewport.style.removeProperty("--sticky-header-offset"); };
  }, []);
  return (
    <header ref={headerRef} className="page-header">
      <div className="page-header__main">
        <div className="page-header-copy">
          <div className="page-header-title-row">
            {eyebrow && <span className="page-header-eyebrow">{eyebrow}</span>}
            <h1 className="page-header__title">{title}</h1>
          </div>
          {description && <p className="page-header__subtitle">{description}</p>}
        </div>
        <div
          className={`page-header__notice${notice ? " has-notice" : ""}${noticeLeading ? " has-indicator" : ""}`}
          aria-hidden={notice || noticeLeading ? undefined : true}
        >
          {(noticeLeading || notice) && (
            <div className="page-header__message-frame">
              {noticeLeading}
              {notice ?? (
                <span className="page-header__message-ready">
                  <CheckCircle2 size={17} aria-hidden="true" />
                  Hazır
                </span>
              )}
            </div>
          )}
        </div>
        {action && <div className="page-header__actions">{action}</div>}
      </div>
    </header>
  );
}
