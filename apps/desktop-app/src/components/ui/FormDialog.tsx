import { useId, type FormEvent, type ReactNode } from "react";
import { WorkspaceHeader } from "../workspace/WorkspaceHeader";
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
      <WorkspaceHeader title={title} titleId={id} closeLabel="Formu kapat" closeBlocked={modal.closeBlocked} onClose={() => modal.onClose("close-button")} />
      <div className="workspace-frame__body">{children}</div>
      <footer className="workspace-frame__footer">{footer}</footer>
    </form>
    {overlay}
  </ModalSurface>;
}
