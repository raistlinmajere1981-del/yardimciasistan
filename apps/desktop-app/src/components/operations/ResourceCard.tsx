import { useId, type MouseEvent, type ReactNode } from "react";

/** Presentation only. Resource identity, facts and operations belong to the feature. */
export function ResourceCard({ title, subtitle, icon, status, tone, children, action, onOpen, openLabel, busy, feedback, error, imageSrc, selected }: {
  title: string; subtitle?: string; icon: ReactNode; status: ReactNode;
  tone: "neutral" | "success" | "info" | "warning" | "danger";
  children: ReactNode; action?: ReactNode; onOpen: () => void; openLabel: string;
  busy?: boolean; feedback?: string; error?: boolean;
  imageSrc?: string;
  selected?: boolean;
}) {
  const id = useId();
  const openFromCardSurface = (event: MouseEvent<HTMLElement>) => {
    if (busy) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, [role='button'], [role='option'], [role='combobox'], [role='group']")) return;
    onOpen();
  };
  return <article
    className="resource-card"
    data-tone={tone}
    data-feedback={error ? "error" : feedback ? "success" : undefined}
    data-selected={selected || undefined}
    aria-current={selected ? "true" : undefined}
    aria-labelledby={`${id}-title`}
    aria-busy={busy || undefined}
    onClick={openFromCardSurface}
  >
    {imageSrc && <img className="resource-card__image" src={imageSrc} alt="" loading="lazy" decoding="async" width={1536} height={1024} />}
    <header className="resource-card__header">
      <button className="resource-card__open-hit-area" type="button" aria-label={openLabel} disabled={busy}
        onClick={(event) => { event.stopPropagation(); onOpen(); }} />
      <span className="resource-card__icon" aria-hidden="true">{icon}</span>
      <div><h3 id={`${id}-title`}>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
    </header>
    <div className="resource-card__status">{status}</div>
    <div className="resource-card__facts">{children}</div>
    <div className="resource-card__footer">
      {(busy || feedback) && <p className="resource-card__feedback" role={error ? "alert" : "status"}>{busy ? "İşlem sürüyor…" : feedback}</p>}
      {action && <div className="resource-card__actions">{action}</div>}
    </div>
  </article>;
}
