import { createContext, useContext, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

const InsideModal = createContext(false);
export function useInsideModalSurface() {
  return useContext(InsideModal);
}
type CloseReason = "close-button" | "escape" | "backdrop";

export interface ModalSurfaceProps {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  className?: string;
  role?: "dialog" | "alertdialog";
  onClose: (reason: CloseReason) => void;
  closeBlocked?: boolean;
  dismissOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/** One modal boundary. Subflows belong inside this surface, never in another modal. */
export function ModalSurface(props: ModalSurfaceProps) {
  const nested = useContext(InsideModal);
  if (nested) throw new Error("ModalSurface cannot be nested; render the subflow in the current surface.");
  return <InsideModal.Provider value={true}><ModalSurfaceContent {...props} /></InsideModal.Provider>;
}

function ModalSurfaceContent({ children, labelledBy, describedBy, className = "", role = "dialog", onClose,
  closeBlocked = false, dismissOnBackdrop = false, initialFocusRef, returnFocusRef }: ModalSurfaceProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Bounded forms are also native dialogs, but are not WorkspaceFrames.
  // Measure the real shell header so tall create forms leave the topbar
  // feedback visible at any density, zoom or responsive header height.
  useLayoutEffect(() => {
    if (!className.split(/\s+/).includes("form-dialog")) return;
    const dialog = ref.current;
    const content = document.querySelector<HTMLElement>(".desktop-shell > .content");
    const header = content?.querySelector<HTMLElement>(":scope > .page-header");
    if (!dialog || !content || !header) return;
    const update = () => {
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const bounds = content.getBoundingClientRect();
      const top = Math.min(window.innerHeight, Math.max(bounds.top, header.getBoundingClientRect().bottom));
      dialog.style.setProperty("--form-canvas-top", `${top / zoom}px`);
      dialog.style.setProperty("--form-canvas-height", `${Math.max(0, Math.min(window.innerHeight, bounds.bottom) - top) / zoom}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(content);
    observer.observe(header);
    window.addEventListener("resize", update);
    content.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      content.removeEventListener("scroll", update);
    };
  }, [className]);
  // Capture once per open lifetime, not per geometry/mode change.
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const preferred = returnFocusRef?.current ?? trigger;
    dialog.showModal();
    (initialFocusRef?.current ?? dialog.querySelector<HTMLElement>("[data-modal-initial-focus]") ?? dialog).focus();
    return () => {
      dialog.close();
      const target = preferred?.isConnected ? preferred : document.querySelector<HTMLElement>("[data-workspace-return-focus]");
      if (target?.isConnected && !target.closest("[inert]")) target.focus({ preventScroll: true });
    };
    // Focus refs describe this open lifetime. Presentation must not rerun setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog ref={ref} className={`modal-surface ${className}`} role={role} aria-modal="true"
      aria-labelledby={labelledBy} aria-describedby={describedBy} tabIndex={-1}
      onCancel={(event) => { event.preventDefault(); if (!closeBlocked) onClose("escape"); }}
      onClick={(event) => {
        if (!dismissOnBackdrop || closeBlocked || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose("backdrop");
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
        )).filter((element) => element.getClientRects().length > 0 && !element.closest("[hidden], [inert]"));
        const first = controls[0], last = controls.at(-1);
        if (!first || !last) { event.preventDefault(); event.currentTarget.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}
    >{children}</dialog>
  );
}
