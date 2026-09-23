import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { WorkspaceDefinition, WorkspaceDefinitionMetadata } from "./workspace-definition";
import type { DesktopPage } from "../../app/navigation";
import type { WorkspaceIntent, WorkspaceModeUpdate, WorkspacePresentation, WorkspaceReturnContext } from "./workspace-intent";

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
  updateWorkspaceMode: (update: WorkspaceModeUpdate) => void;
  registerCloseGuard: (guard: () => boolean) => () => void;
}
const NavigationContext = createContext<WorkspaceNavigation | null>(null);

/** Mounted inside the unlocked Frame: locking destroys navigation and entity drafts together. */
export function WorkspaceNavigationProvider({ page, definitions, onReturnPage, children }: {
  page: DesktopPage;
  definitions: readonly WorkspaceDefinitionMetadata[];
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
      const definition = definitions.find(item => item.entityType === intent.entityType);
      if (!definition || !intent.entityId.trim() || (guard.current && !guard.current())) return false;
      // A page entry cannot create a second modal over another task/legacy overlay.
      if (!current && document.querySelector('dialog[open], [aria-modal="true"]')) return false;
      if (!current) returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const sameEntity = current?.intent.entityType === intent.entityType && current.intent.entityId === intent.entityId;
      if (!sameEntity) onReturn.current = options?.onReturn;
      setCurrent({
        intent: { ...intent, returnContext: sameEntity ? current.intent.returnContext : { page, ...intent.returnContext } },
        presentation: sameEntity ? current.presentation : definition.defaultPresentation
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
    updateWorkspaceMode({ entityType, mode, action }) {
      setCurrent((state) => state?.intent.entityType === entityType ? { ...state, intent: { ...state.intent, mode, action } as WorkspaceIntent } : state);
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

/** Each host receives a static definition and context from its existing lifetime owner. */
export function WorkspaceHost<I extends WorkspaceIntent, Context>({ definition, context }: {
  definition: WorkspaceDefinition<I, Context>;
  context: NoInfer<Context>;
}) {
  const { current } = useWorkspaceNavigation();
  if (!current || current.intent.entityType !== definition.entityType) return null;
  // The discriminator check establishes the leaf type; TS cannot correlate generic I here.
  return <WorkspaceInstance key={`${current.intent.entityType}:${current.intent.entityId}`}>
    {definition.render(current.intent as I, context)}
  </WorkspaceInstance>;
}

function WorkspaceInstance({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
