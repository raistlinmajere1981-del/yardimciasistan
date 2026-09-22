# Workspace platform (Stage 2)

The Constitution remains authoritative. This document describes the implemented renderer API.

## Ownership and integration

`App` still owns `activePage`. `DesktopAppFrame` mounts `WorkspaceNavigationProvider` and a single `WorkspaceHost` alongside the existing diagnostics/menu overlay composition. The provider exists only inside the unlocked Frame. Lock removes the host, navigation state and drafts; unlock starts closed.

`useWorkspaceNavigation()` exposes `current`, `openWorkspace(intent, options?)`, `closeWorkspace()`, `updateWorkspacePresentation(presentation)`, `updateWorkspaceMode(mode, action?)`, and `returnFocusRef`. Open/close return `false` when blocked. An open request rejects empty identity, unsafe replacement, or an existing unrelated modal. Opening defaults to centered and captures the invoking element and originating page. Mode/action updates do not change entity identity.

Stage 2 has only a room intent: explicit `entityType: "room"`, `entityId`, optional `mode` (`summary`, `stay`, `account`, `history`), optional `action` (`payment`, `assign-reservation`). These are navigation labels, not implemented business operations. Add a discriminated variant only when another real entity consumer arrives.

`returnContext` carries a typed desktop page, optional pilot view (`rooms`, `reservations`, `daily-work`) and optional selected record. Open/close do not switch the feature page during normal use, so its filters and selection survive. If an external page change occurred, close requests the originating page. `options.onReturn(context)` lets the feature restore its own view/selection; navigation does not store drafts or scroll positions. The feature owns any persistence needed across an external page unmount.

The production host is mounted now and returns no DOM or effects while closed. No Room editor or entry point ships in this stage. Stage 4 supplies `renderWorkspace` at the existing host with a direct, explicit RoomWorkspace composition; there is no registry or fallback editor. Diagnostics uses only the presentation primitive, never an entity intent.

## Frame, state lifetime and tabs

`WorkspaceFrame` has a fixed header (title/context/actions/expand/close), optional fixed navigation, one flexible scrolling body and optional fixed footer. `presentation` changes CSS geometry on the same native dialog and subtree. Full-canvas uses the measured shell content bounds below the header and beside the sidebar, including appearance scale. It is not OS fullscreen.

The host keys the workspace only by entity type/id. Changing presentation, tab or subflow does not remount it; changing entity does. Entity drafts and busy/dirty state remain in the workspace. `WorkspaceTabs` shares stable IDs between `WorkspaceTabList` and `WorkspaceTabPanel`. Left/Right wrap and activate tabs, Home/End select endpoints, selected tab owns the tab stop, and panels remain mounted with inactive panels hidden. Keep expensive request effects scoped to entity/mode even if a panel is hidden. This API is for entity modes; it does not change legacy page `SegmentedControl` semantics.

Diagnostics retains deliberate independent log-list/detail scrolling through `bodyScroll="panes"`. This is an explicit master/detail exception to the default body scroll owner. Its session reads, live timer, filters, detail and export logic remain unchanged.

## Close, focus and bounded tasks

`ModalSurface` uses native `showModal()` for inert background and a single modal boundary. Initial focus is the title (or `initialFocusRef`); Tab stays within the surface. Geometry changes never rerun focus initialization. Escape is prevented at the native cancel event and routed through the same close request as the close button. Backdrop dismissal is opt-in; Diagnostics keeps it disabled.

In an entity consumer, call `useWorkspaceCloseGuard({ busy, dirty })` and pass its result as `closeBlocked` to the frame. Navigation also checks the guard before close or entity replacement. The feature must show the save/discard or busy explanation inline and clear its local state before requesting close; the platform never discards or executes a business mutation. Security lock unmounts regardless of the guard.

Pass navigation's `returnFocusRef` to the frame to retain the original trigger even after changing entities. Callers can instead supply a meaningful return target ref. A disconnected trigger falls back to the shell content focus target. Native focus restoration and our fallback run only at close, not presentation changes.

`IconButton` requires an accessible label; variants are normal/selected/danger, sizes sm/md. `FormDialog` supplies form submit semantics for one bounded task, and `ConfirmDialog` starts focus on cancel and disables dismissal/actions while busy. Both mount only while open and share ModalSurface. Nested ModalSurface use is rejected. Workspace subflows and confirmations belong inside the current body; no modal stack API is provided. Legacy `useDialogFocus` is unchanged.

## Future Room integration example

```tsx
// Feature entry, under the existing provider:
openWorkspace({
  entityType: "room", entityId: room.id, mode: "account", action: "payment",
  returnContext: { page: "pension", view: "rooms", entityId: room.id }
}, { onReturn: restoreRoomSelection });

// Existing Frame host, once RoomWorkspace is implemented:
<WorkspaceHost renderWorkspace={intent => <RoomWorkspace intent={intent} />} />

// Inside RoomWorkspace (draft/busy/dirty are local):
const navigation = useWorkspaceNavigation();
const blocked = useWorkspaceCloseGuard({ busy, dirty });
<WorkspaceFrame
  title={room.name}
  presentation={navigation.current!.presentation}
  onPresentationChange={navigation.updateWorkspacePresentation}
  onClose={navigation.closeWorkspace}
  closeBlocked={blocked}
  returnFocusRef={navigation.returnFocusRef}
>{/* tabs and subflows, no second modal */}</WorkspaceFrame>;
```

## Stale async results

No generic helper yet: Stage 2 has no entity request consumer, and Diagnostics data behavior is intentionally unchanged. The host entity key isolates local state on identity change. In the first Room implementation, every read effect must additionally invalidate itself on entity/mode change and unmount; overlapping refreshes require a generation check. Guard success **and** catch/finally updates. Abort the request when supported, but cancellation alone is not the correctness guard.

```tsx
const generation = useRef(0);
useEffect(() => {
  const request = ++generation.current;
  let active = true;
  void readRoom(entityId).then(result => {
    if (active && request === generation.current) setResult(result);
  }).catch(error => {
    if (active && request === generation.current) setError(error);
  });
  return () => { active = false; };
}, [entityId]);
```

The Room pilot must test delayed Room 101 responses after Room 102 is opened and out-of-order same-entity refreshes. Extract a helper once those actual request lifetimes demonstrate shared semantics.

## Verification

`npm run smoke:workspace-platform` serves a test-only harness from `scripts/fixtures` using the installed Vite/browser. It covers two entry points, identity replacement, return context, mounted state/draft, geometry, scrolling, tabs, subflows, guard, inert focus, Escape/backdrop, lock, appearance and the real Diagnostics consumer. The renderer design smoke also exercises Diagnostics through the real App/Frame and lock controller. No production fixture page or IPC change is involved.
