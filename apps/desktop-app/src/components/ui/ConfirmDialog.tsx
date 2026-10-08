import { useId, type ReactNode } from "react";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { ActionButton } from "./ActionButton";
import { ModalSurface } from "./ModalSurface";
import { useDialogFocus } from "./useDialogFocus";

export interface ConfirmDialogProps {
  /** Reuse the current workspace modal boundary for an inline decision. */
  embedded?: boolean;
  /** Center the confirmation above the current modal without creating a nested ModalSurface. */
  withinModal?: boolean;
  tone?: "info" | "warning" | "danger";
  eyebrow?: string;
  title: string;
  description?: string;
  details?: ReactNode;
  icon?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  onSecondary?: () => void | Promise<void>;
  busy?: boolean;
}

/** Controlled decision surface: the owner decides when an operation has succeeded. */
export function ConfirmDialog({ embedded = false, withinModal = false, tone = "info", eyebrow, title, description, details, icon,
  confirmLabel, cancelLabel = "Vazgeç", secondaryLabel, onConfirm, onCancel, onSecondary, busy = false }: ConfirmDialogProps) {
  const id = useId();
  const withinModalRef = useDialogFocus(withinModal);
  const ToneIcon = tone === "danger" ? ShieldAlert : tone === "warning" ? AlertTriangle : Info;
  const content = <>
    <header className="confirm-dialog__header">
      {icon !== null && <div className="confirm-dialog__icon" aria-hidden="true">{icon ?? <ToneIcon size={24} />}</div>}
      {eyebrow && <p className="confirm-dialog__eyebrow">{eyebrow}</p>}
      <h2 id={`${id}-title`}>{title}</h2>
    </header>
    <div className="confirm-dialog__body">
      {description && <p id={`${id}-description`}>{description}</p>}
      {details && <div className="confirm-dialog__details">{details}</div>}
    </div>
    <footer className="confirm-dialog__actions" aria-busy={busy}>
      <ActionButton variant="ghost" disabled={busy} onClick={onCancel} data-modal-initial-focus data-dialog-close>{cancelLabel}</ActionButton>
      {secondaryLabel && onSecondary && <ActionButton variant="secondary" disabled={busy} onClick={() => void onSecondary()}>{secondaryLabel}</ActionButton>}
      <ActionButton variant={tone === "danger" ? "danger" : "primary"} disabled={busy} onClick={() => void onConfirm()}>{confirmLabel}</ActionButton>
    </footer>
  </>;
  if (withinModal) return <div className="confirm-dialog-layer">
    <section ref={withinModalRef} className={`confirm-dialog confirm-dialog--embedded confirm-dialog--within-modal confirm-dialog--${tone}`}
      role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}>
      {content}
    </section>
  </div>;
  if (embedded) return <section className={`confirm-dialog confirm-dialog--embedded confirm-dialog--${tone}`} aria-labelledby={`${id}-title`}>{content}</section>;
  return <ModalSurface className={`confirm-dialog confirm-dialog--${tone}`} labelledBy={`${id}-title`}
    {...(description ? { describedBy: `${id}-description` } : {})} onClose={onCancel} closeBlocked={busy} dismissOnBackdrop>{content}</ModalSurface>;
}
