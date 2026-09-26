# Pension Workspace pilot — Stage 4 implementation

Stage 4 production consumer of the workspace platform for Pension/Rooms. Constitution and domain decisions remain authoritative; this file records only the implemented ownership and operation boundaries.

## Pension operations board

`apps/desktop-app/src/pages/PensionPage.tsx` renders one viewport-filling operations board instead of page tabs. The shared `OperationsBoardLayout` owns only geometry and scroll boundaries:

- left: Reservations when the capability is enabled,
- center: Rooms,
- right: Daily Work when the capability is enabled.

Each pane owns its own vertical scroll. The center resource pane remains the primary operational surface; reservation/task lists use compact side-pane presentation. Capability-disabled panes are removed and the remaining columns expand.

## State ownership

`components/pension/pension-page-state.tsx` owns only reservation/task filters (`reservationStatus`, `reservationDate`, `taskStatus`). There is no hidden page-mode state. The controller is created once in `DesktopWorkspaceRouter` so filters survive entity workspace/page transitions; `PensionPageContext` distributes those filters to reservation/task workspaces. Room tiles use `projectRoomState` for display only. Workspace drafts, busy/dirty flags and tab/flow state live inside `RoomWorkspace`.

## Room Workspace tabs

`components/pension/RoomWorkspace.tsx` mounted by `DesktopAppFrame` through the static `roomWorkspaceDefinition` and `WorkspaceHost`. Tabs: `Özet`, `Konaklama`, `Hesap` (only when `ACCOMMODATION_FOLIO` is enabled), `Geçmiş`. History is explicitly near-term records, not full history (D-008). All subflows render inside the same workspace body; there is no nested modal.

## Canonical operations

Stay side (`RoomWorkspace.submitStayFlow`): `assignReservationRoom`, `createStayFromReservation`, `assignCustomerRoom` (manual, `planned`), `checkInStay`, `checkoutStay`, `updateCustomerRoomStayStatus` (cancel/replan), `updateRoomStatus`. Account side (`RoomAccountOperation` + `useRoomFolioController`): `openRoomFolio`, `addRoomFolioMenuItem`, `updateRoomFolioItemQuantity`, `removeRoomFolioItem`, `addRoomFolioManualItem`, `addRoomFolioPayment`, `voidRoomFolioPayment`, `checkoutRoomFolio` (financial close only). Room profile price stays in Settings (D-007); folio nightly overrides are per-account.

## Reservation assignment vs Stay creation

`components/pension/ReservationRoomAssignment.tsx` exports `assignReservationRoom`, which calls `saveManualReservation` and never creates a Stay. Linked Stay creation calls `createStayFromReservation` and preserves the source `reservation_id`; manual Stay creation calls `assignCustomerRoom` with an empty `reservation_id`. Check-in is always explicit `checkInStay`; `openFolio` is financial-only since Stage 4 and no longer mutates Stay/Room.

## Checkout / cleaning / Folio separation

Guest departure (`checkoutStay`) sets `checked_out`; with no other active Stay the room becomes `cleaning` (D-004/D-005). Positive remaining balance keeps the Folio open for post-checkout payment/void; zero balance closes it via `closeFolioIfSettled`, which never changes Room/Stay. `checkoutRoomFolio` is financial closure only. Cleaning completion is explicit `updateRoomStatus({ status: "available" })`. Checkout messaging uses an awaited fresh `getRoomFolioData` snapshot applied to the folio controller, never a stale pre-checkout snapshot.

## Return context

Intents may still carry `returnContext: { page, view, entityId? }` with `rooms`, `reservations` or `daily-tasks` as the originating region. These values no longer switch a Pension page tab; the full board is already visible. Closing a Room Workspace returns to the Pension page and the mounted filter controller preserves reservation/task filters. Exact per-pane scroll offsets are not preserved by design.

## Capability behavior

`staysEnabled`, `reservationsEnabled`, `folioEnabled`, `menuEnabled` come from runtime capabilities. `rooms-only` hides the account tab and manual Stay entry and performs no folio reads; `no-folio` keeps Stay flows without financial coordination; `no-menu` keeps the account tab without the menu-item surface. `smoke-pension-workspace.mjs` covers all three variants plus stale-result, focus-guard and presentation-preservation cases.

## Intentionally deferred items

Unlimited/paginated folio history, RoomStatus schema split (projection only), per-room financial allocation for multi-room bookings, a second receivables ledger, generic sector/plugin framework, exact scroll restoration. `Customer Credit` remains a separate ledger and is not mixed into the folio flow.
