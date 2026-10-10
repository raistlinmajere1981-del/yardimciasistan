import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { WorkspaceDefinition, WorkspaceDefinitionMetadata, WorkspaceSessionPage } from "./workspace-definition";
import type { DesktopPage } from "../../app/navigation";
import type { WorkspaceIntent, WorkspaceModeUpdate, WorkspacePresentation, WorkspaceReturnContext } from "./workspace-intent";
import { writeRendererDiagnostic } from "../../app/diagnostics-client";

interface WorkspaceState {
  intent: WorkspaceIntent;
  presentation: WorkspacePresentation;
}
type HospitalityPage = WorkspaceSessionPage;
type HospitalityWorkspaceIntent = Extract<WorkspaceIntent, { entityType: "room" | "table" }>;

interface OpenWorkspaceOptions {
  onReturn?: (context: WorkspaceReturnContext) => void;
}
interface CloseGuardScope {
  entityType: WorkspaceIntent["entityType"];
  entityId: string;
}
interface WorkspaceNavigation {
  /** Transient modal, otherwise the hospitality session belonging to the visible page. */
  current: WorkspaceState | null;
  hospitalitySessions: Record<HospitalityPage, WorkspaceState | null>;
  returnFocusRef: RefObject<HTMLElement | null>;
  openWorkspace: (intent: WorkspaceIntent, options?: OpenWorkspaceOptions) => boolean;
  closeWorkspace: (scope?: CloseGuardScope) => boolean;
  updateWorkspacePresentation: (presentation: WorkspacePresentation) => void;
  updateWorkspaceMode: (update: WorkspaceModeUpdate) => void;
  registerCloseGuard: (guard: () => boolean, scope?: CloseGuardScope) => () => void;
}
const NavigationContext = createContext<WorkspaceNavigation | null>(null);

function sessionPageFor(definitions: readonly WorkspaceDefinitionMetadata[], entityType: WorkspaceIntent["entityType"]) {
  return definitions.find(item => item.entityType === entityType)?.sessionPage ?? null;
}

function guardKey(scope?: CloseGuardScope) {
  return scope ? `${scope.entityType}:${scope.entityId}` : "transient";
}

/**
 * Mounted inside the unlocked frame. Hospitality workspaces keep one independent
 * session per owning page; transient entity workspaces use the shared modal host.
 */
export function WorkspaceNavigationProvider({ page, definitions, onReturnPage, enabledHospitalityPages, children }: {
  page: DesktopPage;
  definitions: readonly WorkspaceDefinitionMetadata[];
  onReturnPage?: (page: DesktopPage) => void;
  enabledHospitalityPages?: Partial<Record<HospitalityPage, boolean>>;
  children: ReactNode;
}) {
  const [transient, setTransient] = useState<WorkspaceState | null>(null);
  const [hospitalitySessions, setHospitalitySessions] = useState<Record<HospitalityPage, WorkspaceState | null>>({
    pension: null,
    restaurant: null
  });
  const guards = useRef(new Map<string, () => boolean>());
  const transientOnReturn = useRef<OpenWorkspaceOptions["onReturn"]>(undefined);
  const hospitalityOnReturn = useRef<Partial<Record<HospitalityPage, OpenWorkspaceOptions["onReturn"]>>>({});
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pensionEnabled = enabledHospitalityPages?.pension !== false;
  const restaurantEnabled = enabledHospitalityPages?.restaurant !== false;

  useLayoutEffect(() => {
    if (pensionEnabled && restaurantEnabled) return;
    if (!pensionEnabled) hospitalityOnReturn.current.pension = undefined;
    if (!restaurantEnabled) hospitalityOnReturn.current.restaurant = undefined;
    setHospitalitySessions((sessions) => {
      const next = {
        pension: pensionEnabled ? sessions.pension : null,
        restaurant: restaurantEnabled ? sessions.restaurant : null
      };
      return next.pension === sessions.pension && next.restaurant === sessions.restaurant ? sessions : next;
    });
  }, [pensionEnabled, restaurantEnabled]);

  const visibleHospitality = page === "pension" || page === "restaurant" ? hospitalitySessions[page] : null;
  const current = transient ?? visibleHospitality;

  function guardAllows(state: WorkspaceState | null) {
    if (!state) return true;
    const check = guards.current.get(guardKey({ entityType: state.intent.entityType, entityId: state.intent.entityId }));
    return check ? check() : true;
  }

  const value: WorkspaceNavigation = {
    current,
    hospitalitySessions,
    returnFocusRef,
    openWorkspace(intent, options) {
      const definition = definitions.find(item => item.entityType === intent.entityType);
      if (!definition || !intent.entityId.trim()) return false;

      const ownerPage = definition.sessionPage ?? null;
      if (ownerPage) {
        if ((ownerPage === "pension" && !pensionEnabled) || (ownerPage === "restaurant" && !restaurantEnabled)) return false;
        const existing = hospitalitySessions[ownerPage];
        if (existing && !guardAllows(existing)) return false;
        // A transient workspace may deliberately hand off into a room/table session.
        // Unrelated dialogs still block a new hospitality surface.
        if (transient) {
          const transientGuard = guards.current.get("transient");
          if (transientGuard && !transientGuard()) return false;
        } else if (document.querySelector('dialog[open], [aria-modal="true"]')) {
          return false;
        }

        const sameEntity = existing?.intent.entityType === intent.entityType && existing.intent.entityId === intent.entityId;
        if (!sameEntity) hospitalityOnReturn.current[ownerPage] = options?.onReturn;
        if (transient) {
          setTransient(null);
          transientOnReturn.current = undefined;
        }
        setHospitalitySessions((sessions) => ({
          ...sessions,
          [ownerPage]: {
            intent: {
              ...intent,
              returnContext: sameEntity ? existing.intent.returnContext : { page, ...intent.returnContext }
            } as HospitalityWorkspaceIntent,
            presentation: sameEntity ? existing.presentation : definition.defaultPresentation
          }
        }));
        writeRendererDiagnostic({
          level: "INFO",
          scope: "navigation",
          event: "navigation.workspace.opened",
          message: "Çalışma alanı açıldı.",
          meta: {
            page,
            ownerPage,
            entityType: intent.entityType,
            mode: intent.mode,
            action: intent.action || "",
            persistent: true
          }
        });
        if (page !== ownerPage) onReturnPage?.(ownerPage);
        return true;
      }

      const transientGuard = guards.current.get("transient");
      if (transientGuard && !transientGuard()) return false;
      if (!transient && document.querySelector('dialog[open], [aria-modal="true"]')) return false;
      if (!transient) returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const sameEntity = transient?.intent.entityType === intent.entityType && transient.intent.entityId === intent.entityId;
      if (!sameEntity) transientOnReturn.current = options?.onReturn;
      const nextReturnContext = sameEntity ? transient.intent.returnContext : { page, ...intent.returnContext };
      setTransient({
        intent: { ...intent, ...(nextReturnContext === undefined ? {} : { returnContext: nextReturnContext }) },
        presentation: sameEntity ? transient.presentation : definition.defaultPresentation
      });
      writeRendererDiagnostic({
        level: "INFO",
        scope: "navigation",
        event: "navigation.workspace.opened",
        message: "Çalışma alanı açıldı.",
        meta: {
          page,
          entityType: intent.entityType,
          mode: intent.mode,
          action: intent.action || "",
          persistent: false
        }
      });
      return true;
    },
    closeWorkspace(scope) {
      if (scope) {
        const ownerPage = sessionPageFor(definitions, scope.entityType);
        if (ownerPage) {
          const session = hospitalitySessions[ownerPage];
          if (!session || session.intent.entityType !== scope.entityType || session.intent.entityId !== scope.entityId || !guardAllows(session)) return false;
          const context = session.intent.returnContext ?? {};
          setHospitalitySessions((sessions) => ({ ...sessions, [ownerPage]: null }));
          if (context.page && context.page !== page) onReturnPage?.(context.page);
          hospitalityOnReturn.current[ownerPage]?.(context);
          hospitalityOnReturn.current[ownerPage] = undefined;
          writeRendererDiagnostic({
            level: "INFO",
            scope: "navigation",
            event: "navigation.workspace.closed",
            message: "Çalışma alanı kapatıldı.",
            meta: { page, ownerPage, entityType: scope.entityType, persistent: true }
          });
          return true;
        }
        if (!transient || transient.intent.entityType !== scope.entityType || transient.intent.entityId !== scope.entityId) return false;
      }

      if (transient) {
        const transientGuard = guards.current.get("transient");
        if (transientGuard && !transientGuard()) return false;
        const context = transient.intent.returnContext ?? {};
        setTransient(null);
        if (context.page && context.page !== page) onReturnPage?.(context.page);
        transientOnReturn.current?.(context);
        transientOnReturn.current = undefined;
        writeRendererDiagnostic({
          level: "INFO",
          scope: "navigation",
          event: "navigation.workspace.closed",
          message: "Çalışma alanı kapatıldı.",
          meta: { page, entityType: transient.intent.entityType, persistent: false }
        });
        return true;
      }

      if (page !== "pension" && page !== "restaurant") return false;
      const session = hospitalitySessions[page];
      if (!session || !guardAllows(session)) return false;
      const context = session.intent.returnContext ?? {};
      setHospitalitySessions((sessions) => ({ ...sessions, [page]: null }));
      if (context.page && context.page !== page) onReturnPage?.(context.page);
      hospitalityOnReturn.current[page]?.(context);
      hospitalityOnReturn.current[page] = undefined;
      writeRendererDiagnostic({
        level: "INFO",
        scope: "navigation",
        event: "navigation.workspace.closed",
        message: "Çalışma alanı kapatıldı.",
        meta: { page, entityType: session.intent.entityType, persistent: true }
      });
      return true;
    },
    updateWorkspacePresentation(presentation) {
      if (transient) {
        setTransient((state) => state ? { ...state, presentation } : state);
        return;
      }
      if (page === "pension" || page === "restaurant") {
        setHospitalitySessions((sessions) => ({
          ...sessions,
          [page]: sessions[page] ? { ...sessions[page], presentation } : null
        }));
      }
    },
    updateWorkspaceMode({ entityType, mode, action }) {
      const ownerPage = sessionPageFor(definitions, entityType);
      if (ownerPage) {
        setHospitalitySessions((sessions) => {
          const state = sessions[ownerPage];
          return state?.intent.entityType === entityType
            ? { ...sessions, [ownerPage]: { ...state, intent: { ...state.intent, mode, action } as WorkspaceIntent } }
            : sessions;
        });
        return;
      }
      setTransient((state) => state?.intent.entityType === entityType
        ? { ...state, intent: { ...state.intent, mode, action } as WorkspaceIntent }
        : state);
    },
    registerCloseGuard(check, scope) {
      const key = guardKey(scope);
      guards.current.set(key, check);
      return () => {
        if (guards.current.get(key) === check) guards.current.delete(key);
      };
    }
  };
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useWorkspaceNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("Workspace navigation requires the unlocked WorkspaceNavigationProvider.");
  return navigation;
}

/** Draft/busy state stays local. Closing or replacing only consults that workspace's guard. */
export function useWorkspaceCloseGuard({ busy, dirty, scope }: {
  busy: boolean;
  dirty: boolean;
  scope?: CloseGuardScope;
}) {
  const { registerCloseGuard } = useWorkspaceNavigation();
  const scopeEntityType = scope?.entityType;
  const scopeEntityId = scope?.entityId;
  useLayoutEffect(
    () => registerCloseGuard(() => !busy && !dirty, scopeEntityType === undefined || scopeEntityId === undefined ? undefined : { entityType: scopeEntityType, entityId: scopeEntityId }),
    [registerCloseGuard, busy, dirty, scopeEntityType, scopeEntityId]
  );
  return busy || dirty;
}

/** Transient modal host. Hospitality entities use HospitalityWorkspaceHost instead. */
export function WorkspaceHost<I extends WorkspaceIntent, Context>({ definition, context }: {
  definition: WorkspaceDefinition<I, Context>;
  context: NoInfer<Context>;
}) {
  const { current } = useWorkspaceNavigation();
  if (!current || current.intent.entityType !== definition.entityType || definition.sessionPage) return null;
  return <WorkspaceInstance key={`${current.intent.entityType}:${current.intent.entityId}`}>
    {definition.render(current.intent as I, context)}
  </WorkspaceInstance>;
}

/** Persistent room/table host. Hidden page sessions stay mounted so local drafts and scroll positions survive navigation. */
export function HospitalityWorkspaceHost<I extends HospitalityWorkspaceIntent, Context>({ page, activePage, definition, context }: {
  page: HospitalityPage;
  activePage: DesktopPage;
  definition: WorkspaceDefinition<I, Context>;
  context: NoInfer<Context>;
}) {
  const { hospitalitySessions } = useWorkspaceNavigation();
  const session = hospitalitySessions[page];
  const matches = session?.intent.entityType === definition.entityType;
  return <div className="persistent-workspace-slot" hidden={activePage !== page || !matches}>
    {matches && <WorkspaceInstance key={`${session.intent.entityType}:${session.intent.entityId}`}>
      {definition.render(session.intent as I, context)}
    </WorkspaceInstance>}
  </div>;
}

function WorkspaceInstance({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
