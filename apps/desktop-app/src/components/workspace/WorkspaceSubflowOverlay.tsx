import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "../ui/IconButton";

interface WorkspaceSubflowOverlayProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeBlocked?: boolean;
  className?: string;
}

/**
 * A non-native dialog layer for a task that lives inside an existing modal surface.
 * It intercepts the host <dialog>'s native cancel event so Escape closes only the subflow.
 */
export function WorkspaceSubflowOverlay({
  title,
  children,
  footer,
  onClose,
  closeBlocked = false,
  className = ""
}: WorkspaceSubflowOverlayProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    card.current?.querySelector<HTMLElement>("[data-modal-initial-focus]")?.focus();
    return () => {
      if (trigger?.isConnected && !trigger.closest("[inert]")) trigger.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const hostDialog = root.current?.closest("dialog");
    if (!hostDialog) return;

    const interceptCancel = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!closeBlocked) onClose();
    };
    // An async child operation may remove the focused button and leave focus on
    // document.body. Capture Escape there too, or the native host dialog can close
    // without dismissing only this subflow. Visible popovers handle Escape first.
    const interceptDetachedEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !hostDialog.open || card.current?.contains(event.target as Node)
        || document.querySelector(":popover-open")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!closeBlocked) onClose();
    };
    hostDialog.addEventListener("cancel", interceptCancel, true);
    document.addEventListener("keydown", interceptDetachedEscape, true);
    return () => {
      hostDialog.removeEventListener("cancel", interceptCancel, true);
      document.removeEventListener("keydown", interceptDetachedEscape, true);
    };
  }, [closeBlocked, onClose]);

  return <div
    ref={root}
    className={`workspace-subflow-overlay ${className}`.trim()}
    data-workspace-subflow
    onMouseDown={(event) => {
      if (!closeBlocked && event.target === event.currentTarget) onClose();
    }}
  >
    <div
      ref={card}
      className="workspace-subflow-overlay__card"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!closeBlocked) onClose();
          return;
        }
        if (event.key !== "Tab") return;
        event.stopPropagation();

        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
        )).filter((element) => element.getClientRects().length > 0 && !element.closest("[hidden], [inert]"));
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <header className="workspace-frame__header">
        <h2 id={id} tabIndex={-1} data-modal-initial-focus>{title}</h2>
        <IconButton aria-label="Alt işlemi kapat" disabled={closeBlocked} onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </IconButton>
      </header>
      <div className="workspace-subflow-overlay__body">{children}</div>
      {footer && <footer className="workspace-frame__footer">{footer}</footer>}
    </div>
  </div>;
}
