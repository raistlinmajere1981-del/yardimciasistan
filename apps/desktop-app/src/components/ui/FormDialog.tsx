import { useId, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { ModalSurface, type ModalSurfaceProps } from "./ModalSurface";

interface FormDialogProps extends Omit<ModalSurfaceProps, "labelledBy" | "children" | "className" | "role"> {
  dialogClassName?: string;
  title: string;
  children: ReactNode;
  footer: ReactNode;
  overlay?: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

/** A bounded task outside workspaces. Mount only while open. */
export function FormDialog({ title, children, footer, overlay, onSubmit, dialogClassName = "", ...modal }: FormDialogProps) {
  const id = useId();
  return <ModalSurface {...modal} labelledBy={id} className={"form-dialog" + (dialogClassName ? " " + dialogClassName : "")}>
    <form inert={Boolean(overlay)} onSubmit={onSubmit}>
      <header className="workspace-frame__header">
        <h2 id={id} tabIndex={-1} data-modal-initial-focus>{title}</h2>
        <IconButton aria-label="Formu kapat" disabled={modal.closeBlocked} onClick={() => modal.onClose("close-button")}><X size={18} aria-hidden="true" /></IconButton>
      </header>
      <div className="workspace-frame__body">{children}</div>
      <footer className="workspace-frame__footer">{footer}</footer>
    </form>
    {overlay}
  </ModalSurface>;
}
