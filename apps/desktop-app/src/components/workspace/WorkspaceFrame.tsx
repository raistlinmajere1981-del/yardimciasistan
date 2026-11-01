import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { ModalSurface, type ModalSurfaceProps } from "../ui/ModalSurface";
import { WorkspaceHeader } from "./WorkspaceHeader";
import type { WorkspacePresentation } from "./workspace-intent";

/** Shell content bounds; measured only while a modal frame is open. */
export const WorkspaceCanvasContext = createContext<RefObject<HTMLElement | null> | null>(null);
export const WorkspaceScaleContext = createContext(1);

interface WorkspaceChromeProps {
  className?: string;
  title: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  headerSummary?: ReactNode;
  navigation?: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
  children: ReactNode;
  closeBlocked?: boolean;
  closeLabel?: string;
  bodyScroll?: "body" | "panes";
  onClose: () => void;
  titleId: string;
  titleRef?: RefObject<HTMLHeadingElement | null>;
  presentation?: WorkspacePresentation;
  onPresentationChange?: (presentation: WorkspacePresentation) => void;
}

function WorkspaceChrome({
  title,
  context,
  actions,
  headerSummary,
  navigation,
  footer,
  overlay,
  children,
  closeBlocked = false,
  closeLabel = "Çalışma alanını kapat",
  bodyScroll = "body",
  onClose,
  titleId,
  titleRef,
  presentation,
  onPresentationChange
}: WorkspaceChromeProps) {
  return <>
    <WorkspaceHeader title={title} titleId={titleId} titleRef={titleRef} context={context} summary={headerSummary}
      closeLabel={closeLabel} closeBlocked={closeBlocked} onClose={onClose}
      actions={<>
        {actions}
        {presentation && onPresentationChange && <IconButton aria-label={presentation === "centered" ? "Çalışma alanını genişlet" : "Ortalanmış görünüme dön"}
          onClick={() => onPresentationChange(presentation === "centered" ? "full-canvas" : "centered")}>
          {presentation === "centered" ? <Maximize2 size={18} aria-hidden="true" /> : <Minimize2 size={18} aria-hidden="true" />}
        </IconButton>}
      </>}
    />
    {navigation && <div className="workspace-frame__navigation">{navigation}</div>}
    <div className={`workspace-frame__body workspace-frame__body--${bodyScroll}`}>{children}</div>
    {footer && <footer className="workspace-frame__footer">{footer}</footer>}
    {overlay}
  </>;
}

interface WorkspaceFrameProps extends Omit<ModalSurfaceProps, "labelledBy" | "children" | "className"> {
  className?: string;
  title: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  headerSummary?: ReactNode;
  navigation?: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
  children: ReactNode;
  presentation: WorkspacePresentation;
  onPresentationChange?: (presentation: WorkspacePresentation) => void;
  closeLabel?: string;
  /** Deliberate master/detail scroll owners (diagnostics), instead of the default body scroll. */
  bodyScroll?: "body" | "panes";
}

export function WorkspaceFrame({ title, context, actions, headerSummary, navigation, footer, overlay, children, presentation, className = "",
  onPresentationChange, closeLabel = "Çalışma alanını kapat", bodyScroll = "body", ...modal }: WorkspaceFrameProps) {
  const id = useId();
  const marker = useRef<HTMLDivElement>(null);
  const canvas = useContext(WorkspaceCanvasContext);
  const scale = useContext(WorkspaceScaleContext);
  const [canvasStyle, setCanvasStyle] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    const dialog = marker.current?.closest("dialog");
    const content = canvas?.current;
    if (!dialog) return;
    const header = content?.querySelector<HTMLElement>(":scope > .page-header");
    const update = () => {
      // Standalone workspaces use the viewport; both paths need CSS zoom compensation.
      const bounds = content?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth, bottom: innerHeight };
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const top = Math.min(innerHeight, Math.max(bounds.top, header?.getBoundingClientRect().bottom ?? bounds.top));
      const next = {
        "--workspace-canvas-left": `${bounds.left / zoom}px`,
        "--workspace-canvas-top": `${top / zoom}px`,
        "--workspace-canvas-width": `${Math.min(bounds.width, innerWidth - bounds.left) / zoom}px`,
        "--workspace-canvas-height": `${Math.max(0, Math.min(innerHeight, bounds.bottom) - top) / zoom}px`
      };
      setCanvasStyle(previous => Object.keys(next).every(key => previous[key] === next[key as keyof typeof next]) ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    if (content) observer.observe(content);
    if (header) observer.observe(header);
    // Preference application occurs in the parent effect after this layout effect.
    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    content?.addEventListener("scroll", update);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", update); content?.removeEventListener("scroll", update); };
  }, [canvas, scale]);

  return (
    <ModalSurface {...modal} style={canvasStyle} labelledBy={`${id}-title`} className={`workspace-frame workspace-frame--${presentation} ${className}`}>
      <div ref={marker} hidden aria-hidden="true" />
      <WorkspaceChrome
        title={title}
        context={context}
        actions={actions}
        headerSummary={headerSummary}
        navigation={navigation}
        footer={footer}
        overlay={overlay}
        presentation={presentation}
        {...(onPresentationChange === undefined ? {} : { onPresentationChange })}
        {...(modal.closeBlocked === undefined ? {} : { closeBlocked: modal.closeBlocked })}
        closeLabel={closeLabel}
        bodyScroll={bodyScroll}
        onClose={() => modal.onClose("close-button")}
        titleId={`${id}-title`}
      >
        {children}
      </WorkspaceChrome>
    </ModalSurface>
  );
}

export function WorkspacePageFrame({ title, context, actions, headerSummary, navigation, footer, overlay, children, className = "",
  closeBlocked = false, closeLabel = "Çalışma alanını kapat", bodyScroll = "body", onClose }: {
  title: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  headerSummary?: ReactNode;
  navigation?: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
  children: ReactNode;
  className?: string;
  closeBlocked?: boolean;
  closeLabel?: string;
  bodyScroll?: "body" | "panes";
  onClose: () => void;
}) {
  const id = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return <section className={`workspace-page-frame ${className}`} aria-labelledby={`${id}-title`}>
    <WorkspaceChrome
      title={title}
      context={context}
      actions={actions}
      headerSummary={headerSummary}
      navigation={navigation}
      footer={footer}
      overlay={overlay}
      closeBlocked={closeBlocked}
      closeLabel={closeLabel}
      bodyScroll={bodyScroll}
      onClose={onClose}
      titleId={`${id}-title`}
      titleRef={titleRef}
    >
      {children}
    </WorkspaceChrome>
  </section>;
}
