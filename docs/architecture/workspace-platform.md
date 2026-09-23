# Workspace platform — proven APIs (Stage 6)

The Constitution remains authoritative. The [extraction audit](platform-extraction-audit.md)
records A/B/C/D decisions from both completed pilots.

## Static definitions and composition

`app/workspace-definitions.tsx` binds each entity discriminator, default presentation
and typed renderer in one static definition:

- `roomWorkspaceDefinition`: RoomWorkspaceIntent → RoomWorkspace, `centered`.
- `tableWorkspaceDefinition`: TableWorkspaceIntent → TableWorkspace, `full-canvas`.

`WorkspaceDefinition<I, Context>` keeps renderer input narrowed to its intent leaf;
context is the existing component props without intent. `workspaceDefinitions` supplies
metadata to `WorkspaceNavigationProvider`; the navigation module imports no domain
component and has no entity-specific presentation branch. Unknown/unregistered entity
input returns false before state/focus/return callbacks change. This is static
application composition, without runtime registration, discovery or plugin loading.

`WorkspaceHost definition={...} context={...}` checks the discriminator before rendering
and keys only by entity type/id. There is one checked type assertion at this generic
boundary because TypeScript cannot correlate the generic leaf with that comparison.
AppFrame supplies Room context without importing RoomWorkspace; RestaurantPage supplies
Table context without importing TableWorkspace. Their host locations intentionally stay:
Room is accessible across pages; Table orders/projection callbacks live in RestaurantPage.
Moving Table to a global store would change ownership without proven need.

## Navigation, intents and return context

`App` owns activePage. The provider exists inside the unlocked Frame. Lock removes
navigation, hosts and drafts; unlock starts closed. Diagnostics uses presentation
primitives, never an entity intent.

`useWorkspaceNavigation()` exposes current, openWorkspace(intent, options?),
closeWorkspace(), updateWorkspacePresentation(presentation),
updateWorkspaceMode({ entityType, mode, action? }) and returnFocusRef. Open/close return
false when blocked. Empty identity, guarded replacement and unrelated open modals are
rejected. Mode/action updates for a different entity type are ignored.

RoomWorkspaceIntent | TableWorkspaceIntent remains an explicit discriminated union.
Room customerId, leaf mode/action unions and operation semantics remain distinct; no
string bag or generic base was introduced. Mode updates preserve the same discrimination.

On a new entity, navigation resolves defaultPresentation from the supplied metadata.
The provider owns runtime presentation state. Same-entity opens preserve presentation,
original return context/callback and the mounted draft. Room exposes its existing
expand toggle; Table retains its full-canvas default and no user toggle.

WorkspaceReturnContext discriminates by page: PensionView is rooms/reservations/daily-tasks;
RestaurantView is floor/reservations/daily-tasks. Other desktop pages carry optional
entityId without a view. A view requires its page. An omitted page defaults to the current
page. Close restores the original page if necessary and calls options.onReturn(context).
Features retain filters/selection and their existing lifetime owners; navigation does
not persist exact scroll positions or drafts.

## Feature page anatomy

FeatureWorkspacePage owns a fixed toolbar slot, one active named body region and bounded
flex/scroll geometry. FeatureViewSelector owns navigation + aria-pressed buttons and a
feature-provided accessible label. Pages supply typed items/value/onChange; capability
filtering, fallback view, filters and active-body selection remain local. Pension's
controller still survives router page switches; Restaurant state still lives in its page.
Page views remain distinct from WorkspaceTabs and legacy SegmentedControl.

## Frame, state lifetime and tabs

`WorkspaceFrame` has a fixed header (title/context/actions/expand/close), optional fixed navigation, one flexible scrolling body and optional fixed footer. `presentation` changes CSS geometry on the same native dialog and subtree. Full-canvas uses the measured shell content bounds below the header and beside the sidebar, including appearance scale. It is not OS fullscreen.

The host keys the workspace only by entity type/id. Changing presentation, tab or subflow does not remount it; changing entity does. Entity drafts and busy/dirty state remain in the workspace. `WorkspaceTabs` shares stable IDs between `WorkspaceTabList` and `WorkspaceTabPanel`. Left/Right wrap and activate tabs, Home/End select endpoints, selected tab owns the tab stop, and panels remain mounted with inactive panels hidden. Keep expensive request effects scoped to entity/mode even if a panel is hidden. This API is for entity modes; it does not change legacy page `SegmentedControl` semantics.

Diagnostics retains deliberate independent log-list/detail scrolling through `bodyScroll="panes"`. This is an explicit master/detail exception to the default body scroll owner. Its session reads, live timer, filters, detail and export logic remain unchanged.

## Close, focus and bounded tasks

`ModalSurface` uses native `showModal()` for inert background and a single modal boundary. Initial focus is the title (or `initialFocusRef`); Tab stays within the surface. Geometry changes never rerun focus initialization. Escape is prevented at the native cancel event and routed through the same close request as the close button. Backdrop dismissal is opt-in; Diagnostics keeps it disabled.

In an entity consumer, call `useWorkspaceCloseGuard({ busy, dirty })` and pass its result as `closeBlocked` to the frame. Navigation also checks the guard before close or entity replacement. Room shows save/discard or busy feedback inline. Table routes a user close through its note flush and requests navigation close after the guard clears; the platform never discards or executes a business mutation. Security lock unmounts regardless of the guard.

Pass navigation's `returnFocusRef` to the frame to retain the original trigger even after changing entities. Callers can instead supply a meaningful return target ref. A disconnected trigger falls back to the shell content focus target. Native focus restoration and our fallback run only at close, not presentation changes.

`IconButton` requires an accessible label; variants are normal/selected/danger, sizes sm/md. `FormDialog` supplies form submit semantics for one bounded task; it mounts only while open and shares ModalSurface. Nested ModalSurface use is rejected. Workspace subflows and confirmations belong inside the current body; no modal stack API is provided. Legacy `useDialogFocus` is unchanged.

## Room integration example

```tsx
// Feature entry, under the existing provider:
openWorkspace({
  entityType: "room", entityId: room.id, mode: "account", action: "payment",
  returnContext: { page: "pension", view: "rooms", entityId: room.id }
}, { onReturn: restoreRoomSelection });

// Application composition supplies the existing Room props as context:
<WorkspaceHost definition={roomWorkspaceDefinition} context={roomContext} />

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

`useRequestGeneration()` is proven by RoomWorkspace mutations, useRoomFolioController
reads/mutations, useTableOrderController reads and TableRoomTransfer folio reads. Its unchanged API returns begin();
begin returns isCurrent(). A new generation invalidates older requests; unmount
invalidates the current one, including success, catch and finally paths. Each independent
request lifetime owns its own hook instance. The entity key isolates local state.

Table mutations deliberately retain serialized run/flushNotes, alive and order identity
checks. They are not latest-request-wins operations. Restaurant's initial order projection
also intentionally merges late missing orders. Neither belongs inside this helper.
No cancellation framework, mutation routing or feedback policy was added.

## Deliberately local

Existing WorkspaceFrame identity/context/action/footer slots, ActionButton/IconButton,
ModalSurface focus/close behavior and capability-filtered WorkspaceTabs arrays suffice.
No new action registry, capability engine, entity header API, flow hook or feedback
wrapper: Room's explicit dirty/discard/flow coordination differs from Table's auto-save,
note flush, return-after-close and committed-transfer retry. Domain messages stay local.

Platform owns navigation/definitions/host, presentation, frame/tabs, page geometry and
view selection, focus/close guard and generation validity. Pension owns Room projection,
Stay/Reservation/Folio, cleaning and RoomAccount. Restaurant owns TableOrder, menu/order
editing, note flush, close and room-folio transfer UI. Persistence/IPC are unchanged.
Generic repositories/editors/operations, plugin SDK, command/event bus, global store and
universal form/async controllers are not justified by these two pilots.

## Verification

`npm run smoke:workspace-platform` serves a test-only harness from `scripts/fixtures` using the installed Vite/browser. It compiles positive/negative intent, return-context and definition contracts. Browser tests inject reversed metadata defaults to prove navigation is domain-independent, reject unknown input, verify same-entity presentation preservation, generation/unmount invalidation and both return contexts. It also covers two entry points, identity replacement, return context, mounted state/draft, geometry, scrolling, tabs, subflows, guard, inert focus, Escape/backdrop, lock, appearance and the real Diagnostics consumer. The renderer design smoke also exercises Diagnostics through the real App/Frame and lock controller. No production fixture page or IPC change is involved.

## Pilot verification

`smoke:pension-workspace` and `smoke:restaurant-workspace` render the real consumers through the production definitions, covering page-view versus tab semantics, operations, stale results, focus and capability variants. See [Pension Workspace pilot](pension-workspace.md) and [Restaurant Workspace pilot](restaurant-workspace.md).
