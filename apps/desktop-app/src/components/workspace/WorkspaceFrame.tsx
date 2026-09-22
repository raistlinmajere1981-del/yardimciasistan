import { createContext, useContext, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { ModalSurface, type ModalSurfaceProps } from "../ui/ModalSurface";
import type { WorkspacePresentation } from "./workspace-intent";

/** Shell content bounds; measured only while a frame is open. */
export const WorkspaceCanvasContext = createContext<RefObject<HTMLElement | null> | null>(null);

interface WorkspaceFrameProps extends Omit<ModalSurfaceProps, "labelledBy" | "children" | "className"> {
  title: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  presentation: WorkspacePresentation;
  onPresentationChange?: (presentation: WorkspacePresentation) => void;
  closeLabel?: string;
  /** Deliberate master/detail scroll owners (diagnostics), instead of the default body scroll. */
  bodyScroll?: "body" | "panes";
}

export function WorkspaceFrame({ title, context, actions, navigation, footer, children, presentation,
  onPresentationChange, closeLabel = "Çalışma alanını kapat", bodyScroll = "body", ...modal }: WorkspaceFrameProps) {
  const id = useId();
  const marker = useRef<HTMLDivElement>(null);
  const canvas = useContext(WorkspaceCanvasContext);
  useLayoutEffect(() => {
    const dialog = marker.current?.closest("dialog");
    const content = canvas?.current;
    if (!dialog || !content) return;
    const header = content.querySelector<HTMLElement>(":scope > .page-header");
    const update = () => {
      const bounds = content.getBoundingClientRect();
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const top = Math.min(innerHeight, Math.max(bounds.top, header?.getBoundingClientRect().bottom ?? bounds.top));
      dialog.style.setProperty("--workspace-canvas-left", `${bounds.left / zoom}px`);
      dialog.style.setProperty("--workspace-canvas-top", `${top / zoom}px`);
      dialog.style.setProperty("--workspace-canvas-width", `${Math.min(bounds.width, innerWidth - bounds.left) / zoom}px`);
      dialog.style.setProperty("--workspace-canvas-height", `${Math.max(0, Math.min(innerHeight, bounds.bottom) - top) / zoom}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(content);
    if (header) observer.observe(header);
    window.addEventListener("resize", update);
    content.addEventListener("scroll", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); content.removeEventListener("scroll", update); };
  }, [canvas]);

  return (
    <ModalSurface {...modal} labelledBy={`${id}-title`} className={`workspace-frame workspace-frame--${presentation}`}>
      <header className="workspace-frame__header">
        <div ref={marker} className="workspace-frame__identity">
          <h2 id={`${id}-title`} tabIndex={-1} data-modal-initial-focus>{title}</h2>
          {context && <div className="workspace-frame__context">{context}</div>}
        </div>
        <div className="workspace-frame__actions">
          {actions}
          {onPresentationChange && <IconButton aria-label={presentation === "centered" ? "Çalışma alanını genişlet" : "Ortalanmış görünüme dön"}
            onClick={() => onPresentationChange(presentation === "centered" ? "full-canvas" : "centered")}>
            {presentation === "centered" ? <Maximize2 size={18} aria-hidden="true" /> : <Minimize2 size={18} aria-hidden="true" />}
          </IconButton>}
          <IconButton aria-label={closeLabel} disabled={modal.closeBlocked} onClick={() => modal.onClose("close-button")}><X size={18} aria-hidden="true" /></IconButton>
        </div>
      </header>
      {navigation && <div className="workspace-frame__navigation">{navigation}</div>}
      <div className={`workspace-frame__body workspace-frame__body--${bodyScroll}`}>{children}</div>
      {footer && <footer className="workspace-frame__footer">{footer}</footer>}
    </ModalSurface>
  );
}
