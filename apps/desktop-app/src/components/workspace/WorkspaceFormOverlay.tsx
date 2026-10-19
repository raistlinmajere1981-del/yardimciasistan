import { useId, useLayoutEffect, useRef, type FormEventHandler, type ReactNode } from "react";
import { WorkspaceHeader } from "./WorkspaceHeader";

interface WorkspaceFormOverlayProps {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
  closeBlocked?: boolean;
}

/**
 * A form layer inside an already-open workspace modal.
 * It deliberately reuses the FormDialog anatomy without creating a nested <dialog>.
 */
export function WorkspaceFormOverlay({
  title,
  children,
  footer,
  onSubmit,
  onClose,
  closeBlocked = false
}: WorkspaceFormOverlayProps) {
  const id = useId();
  const card = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    card.current?.querySelector<HTMLElement>("[data-modal-initial-focus]")?.focus();
  }, []);

  return <div
    className="workspace-form-overlay"
    role="presentation"
    onMouseDown={(event) => {
      if (!closeBlocked && event.target === event.currentTarget) onClose();
    }}
  >
    <div
      ref={card}
      className="workspace-form-overlay__card"
      role="dialog"
      aria-labelledby={id}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
        )).filter((element) => element.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <form onSubmit={onSubmit}>
        <WorkspaceHeader title={title} titleId={id} closeLabel="Formu kapat" closeBlocked={closeBlocked} onClose={onClose} />
        <div className="workspace-frame__body workspace-frame__body--body">{children}</div>
        <footer className="workspace-frame__footer">{footer}</footer>
      </form>
    </div>
  </div>;
}
