import { useId, type ReactNode } from "react";
import { ActionButton } from "./ActionButton";
import { ModalSurface } from "./ModalSurface";

/** Standalone confirmation only. Workspace confirmations are inline body states. */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, busy = false, danger = false }: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  const id = useId();
  return <ModalSurface labelledBy={`${id}-title`} describedBy={`${id}-description`} role="alertdialog"
    className="confirm-dialog" closeBlocked={busy} onClose={onCancel}>
    <header className="workspace-frame__header"><h2 id={`${id}-title`}>{title}</h2></header>
    <div className="workspace-frame__body" id={`${id}-description`}>{children}</div>
    <footer className="workspace-frame__footer">
      <ActionButton variant="secondary" data-modal-initial-focus disabled={busy} onClick={onCancel}>Vazgeç</ActionButton>
      <ActionButton variant={danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>{confirmLabel}</ActionButton>
    </footer>
  </ModalSurface>;
}
