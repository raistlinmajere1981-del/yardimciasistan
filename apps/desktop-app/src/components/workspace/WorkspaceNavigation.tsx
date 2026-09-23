import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { DesktopPage } from "../../app/navigation";
import type { WorkspaceIntent, WorkspacePresentation, WorkspaceReturnContext } from "./workspace-intent";

interface WorkspaceState {
  intent: WorkspaceIntent;
  presentation: WorkspacePresentation;
}
interface OpenWorkspaceOptions {
  onReturn?: (context: WorkspaceReturnContext) => void;
}
interface WorkspaceNavigation {
  current: WorkspaceState | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  openWorkspace: (intent: WorkspaceIntent, options?: OpenWorkspaceOptions) => boolean;
  closeWorkspace: () => boolean;
  updateWorkspacePresentation: (presentation: WorkspacePresentation) => void;
  updateWorkspaceMode: (mode: WorkspaceIntent["mode"], action?: WorkspaceIntent["action"]) => void;
  registerCloseGuard: (guard: () => boolean) => () => void;
}
const NavigationContext = createContext<WorkspaceNavigation | null>(null);

/** Mounted inside the unlocked Frame: locking destroys navigation and entity drafts together. */
export function WorkspaceNavigationProvider({ page, onReturnPage, children }: {
  page: DesktopPage;
  onReturnPage?: (page: DesktopPage) => void;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState<WorkspaceState | null>(null);
  const guard = useRef<(() => boolean) | null>(null);
  const onReturn = useRef<OpenWorkspaceOptions["onReturn"]>(undefined);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const value: WorkspaceNavigation = {
    current,
    returnFocusRef,
    openWorkspace(intent, options) {
      if (!intent.entityId.trim() || (guard.current && !guard.current())) return false;
      // A page entry cannot create a second modal over another task/legacy overlay.
      if (!current && document.querySelector('dialog[open], [aria-modal="true"]')) return false;
      if (!current) returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const sameEntity = current?.intent.entityType === intent.entityType && current.intent.entityId === intent.entityId;
      if (!sameEntity) onReturn.current = options?.onReturn;
      setCurrent({
        intent: { ...intent, returnContext: sameEntity ? current.intent.returnContext : { page, ...intent.returnContext } },
        presentation: sameEntity ? current.presentation : intent.entityType === "table" ? "full-canvas" : "centered"
      });
      return true;
    },
    closeWorkspace() {
      if (!current || (guard.current && !guard.current())) return false;
      const context = current.intent.returnContext ?? {};
      setCurrent(null);
      if (context.page && context.page !== page) onReturnPage?.(context.page);
      onReturn.current?.(context);
      onReturn.current = undefined;
      return true;
    },
    updateWorkspacePresentation(presentation) {
      setCurrent((state) => state ? { ...state, presentation } : state);
    },
    updateWorkspaceMode(mode, action) {
      setCurrent((state) => state ? { ...state, intent: { ...state.intent, mode, action } as WorkspaceIntent } : state);
    },
    registerCloseGuard(check) {
      guard.current = check;
      return () => { if (guard.current === check) guard.current = null; };
    }
  };
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useWorkspaceNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("Workspace navigation requires the unlocked WorkspaceNavigationProvider.");
  return navigation;
}

/** Draft/busy state stays local. Every close/replacement request consults the current guard. */
export function useWorkspaceCloseGuard({ busy, dirty }: { busy: boolean; dirty: boolean }) {
  const { registerCloseGuard } = useWorkspaceNavigation();
  useLayoutEffect(() => registerCloseGuard(() => !busy && !dirty), [registerCloseGuard, busy, dirty]);
  return busy || dirty;
}

/** The pilot supplies one explicit renderer here; there is intentionally no entity registry. */
export function WorkspaceHost({ renderWorkspace }: { renderWorkspace?: (intent: WorkspaceIntent) => ReactNode }) {
  const { current } = useWorkspaceNavigation();
  if (!current || !renderWorkspace) return null;
  return <WorkspaceInstance key={`${current.intent.entityType}:${current.intent.entityId}`}>{renderWorkspace(current.intent)}</WorkspaceInstance>;
}

function WorkspaceInstance({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
