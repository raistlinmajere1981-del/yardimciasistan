import { createContext, useContext, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

import { nexaBackdropClip } from "./nexa-backdrop";

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
  style?: CSSProperties;
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

function ModalSurfaceContent({ children, labelledBy, describedBy, className = "", style, role = "dialog", onClose,
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
  // Geometry stays on this native dialog: holes change paint only. Background
  // controls remain inert, including controls behind the transparent artwork.
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const sidebar = document.querySelector<HTMLElement>("#desktop-sidebar");
    if (!sidebar) return;
    const root = document.documentElement;
    let frame = 0;
    const observed = new Set<Element>();
    const visible = (node: HTMLElement | null): node is HTMLElement => Boolean(node
      && node.getClientRects().length && getComputedStyle(node).visibility === "visible"
      && Number(getComputedStyle(node).opacity) > 0);
    const observer = new ResizeObserver(() => schedule());
    const update = () => {
      frame = 0;
      const zoom = Number(getComputedStyle(root).zoom) || 1;
      const habitat = sidebar.querySelector<HTMLElement>(".nexa-habitat");
      const character = habitat?.querySelector<HTMLElement>(".nexa-character") ?? null;
      const speech = habitat?.querySelector<HTMLElement>(".nexa-habitat-speech") ?? null;
      const nodes = [sidebar, ...Array.from(sidebar.children), habitat, character, speech].filter((node): node is HTMLElement => Boolean(node));
      for (const node of observed) if (!nodes.includes(node as HTMLElement)) { observer.unobserve(node); observed.delete(node); }
      for (const node of nodes) if (!observed.has(node)) { observer.observe(node); observed.add(node); }
      const shown = habitat && visible(habitat) && !habitat.classList.contains("nexa-habitat--hidden");
      const speechStyle = speech && getComputedStyle(speech);
      const tail = speech && getComputedStyle(speech, "::after");
      const tailDepth = tail?.content && tail.content !== "none"
        ? Math.max(0, -parseFloat(tail.bottom) + (Math.SQRT2 - 1) / 2 * parseFloat(tail.width)) * zoom : 0;
      dialog.style.setProperty("--nexa-backdrop-clip", nexaBackdropClip(
        shown && visible(character) ? character.getBoundingClientRect() : null,
        shown && visible(speech) ? speech.getBoundingClientRect() : null, zoom,
        (parseFloat(speechStyle?.borderTopLeftRadius ?? "0") || 0) * zoom, tailDepth));
      // Follow the balloon's brief entry translation without polling the rig.
      if (speech?.getAnimations().some(animation => animation.playState === "running")) schedule();
    };
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    // React owns habitat content/visibility; ResizeObserver owns its geometry.
    sidebar.addEventListener("nexa:geometry-change", schedule);
    sidebar.addEventListener("animationstart", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      sidebar.removeEventListener("nexa:geometry-change", schedule);
      sidebar.removeEventListener("animationstart", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      dialog.style.removeProperty("--nexa-backdrop-clip");
    };
  }, []);

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
    <dialog ref={ref} style={style} className={`modal-surface ${className}`} role={role} aria-modal="true"
      aria-labelledby={labelledBy} aria-describedby={describedBy} tabIndex={-1}
      onCancel={(event) => { event.preventDefault(); if (!closeBlocked) onClose("escape"); }}
      onClick={(event) => {
        if (!dismissOnBackdrop || closeBlocked || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose("backdrop");
      }}
      onKeyDownCapture={(event) => {
        // A dirty workspace must intercept Escape before native dialog dismissal
        // or any ancestor key listener, not only when the cancel event arrives.
        if (event.key === "Escape" && closeBlocked) { event.preventDefault(); event.stopPropagation(); }
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
