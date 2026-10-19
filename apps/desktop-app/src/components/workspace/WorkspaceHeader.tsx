import type { ReactNode, Ref } from "react";
import { X } from "lucide-react";
import { ActionButton } from "../ui/ActionButton";
import { IconButton } from "../ui/IconButton";

/** Shared chrome only; the owning surface decides whether and how it can close. */
export function WorkspaceHeader({ title, titleId, titleRef, context, summary, actions, onClose,
  closeLabel = "Çalışma alanını kapat", closeBlocked = false, closeButton = "icon" }: {
  title: ReactNode;
  titleId: string;
  titleRef?: Ref<HTMLHeadingElement> | undefined;
  context?: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  closeBlocked?: boolean | undefined;
  closeButton?: "icon" | "text";
}) {
  return <header className="workspace-frame__header">
    <div className={`workspace-frame__identity${summary ? " workspace-frame__identity--summary" : ""}`}>
      <h2 ref={titleRef} id={titleId} tabIndex={-1} data-modal-initial-focus
        className={summary ? "workspace-frame__title--visually-hidden" : undefined}>{title}</h2>
      {summary}
      {!summary && context && <div className="workspace-frame__context">{context}</div>}
    </div>
    <div className="workspace-frame__actions">
      {actions}
      {closeButton === "text"
        ? <ActionButton variant="secondary" disabled={closeBlocked} onClick={onClose}>{closeLabel}</ActionButton>
        : <IconButton aria-label={closeLabel} disabled={closeBlocked} onClick={onClose}><X size={18} aria-hidden="true" /></IconButton>}
    </div>
  </header>;
}
