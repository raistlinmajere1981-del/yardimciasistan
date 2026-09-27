# Pension Workspace pilot — Stage 4 implementation

Stage 4 production consumer of the workspace platform for Pension/Rooms. Constitution and domain decisions remain authoritative; this file records only the implemented ownership and operation boundaries.

## Pension operations board

`apps/desktop-app/src/pages/PensionPage.tsx` renders one viewport-filling operations board instead of page tabs. The shared `OperationsBoardLayout` owns only geometry and scroll boundaries:

- left: Reservations when the capability is enabled,
- center: Rooms,
- right: Daily Work when the capability is enabled.

Each pane owns its own vertical scroll. The center resource pane remains the primary operational surface; reservation/task lists use compact side-pane presentation. Capability-disabled panes are removed and the remaining columns expand.

## State ownership

`components/pension/pension-page-state.tsx` owns only reservation/task filters (`reservationStatus`, `reservationDate`, `taskStatus`). There is no hidden page-mode state. The controller is created once in `DesktopWorkspaceRouter` so filters survive entity workspace/page transitions; `PensionPageContext` distributes those filters to reservation/task workspaces. Room tiles use `projectRoomState` for display only. Workspace drafts, busy/dirty flags live inside the canonical Room Workspace and its panel controllers.

## Room control center

`RoomWorkspace` is mounted through `roomWorkspaceDefinition` and `WorkspaceHost`.
The existing `WorkspaceFrame`/`ModalSurface` contains one operation surface:

- Room/stay facts, upcoming reservation, visible manual/linked Stay fields and per-folio lodging price fields.
- Applicable daily actions, physical preparation, reservation assignment and account extras.
- Current-stay account, payment fields, movements and separately labelled previous open accounts.

Each desktop panel owns its scroll; narrow screens stack panels under one surface scroll.
Room profile/capacity are a read-only disclosure; editing remains in Settings.
Daily intents (`summary`, `stay`, `account`) select/focus this same surface without
changing the body. History is a secondary same-overlay body with a return link.
Drafts survive history and presentation changes. `WorkspaceTabs` is not used here.

`room-workspace-model` derives occupancy, planning, current identity and check-in
eligibility. `use-room-stay-operations` owns the guarded Stay mutations and scoped
feedback. `useRoomFolioController` owns account reads/mutations and stale-result
protection. It never selects the first open account or changes current selection as
a side effect of paying an old account. The current account follows the exact checked-in
Stay ID; account intents focus the exact folio/stay record, including prior debt.

Opening, focusing and viewing never create a Stay, Folio or payment. Routine fields
are visible before their mutation buttons are used. Only consequential confirmations
and read-only room information use disclosures; no nested routine modal is opened.

## Canonical operations

Stay operations retain `assignReservationRoom`, `createStayFromReservation`,
`assignCustomerRoom` (manual, `planned`), `checkInStay`, `checkoutStay`, cancellation,
replanning and `setRoomOperationalStatus`. Account panels retain the existing folio
controller and bridge mutations for charges, menu items, quantity, removal, payment,
void, per-account price updates and financial closure. No IPC/domain contracts change.

## Reservation assignment vs Stay creation

`components/pension/ReservationRoomAssignment.tsx` exports `assignReservationRoom`, which calls `saveManualReservation` and never creates a Stay. Linked Stay creation calls `createStayFromReservation` and preserves the source `reservation_id`; manual Stay creation calls `assignCustomerRoom` with an empty `reservation_id`. Check-in is always explicit `checkInStay`; `openFolio` is financial-only since Stage 4 and no longer mutates Stay/Room.

## Checkout / cleaning / Folio separation

Guest departure (`checkoutStay`) sets `checked_out`; with no other active Stay the room becomes `cleaning` (D-004/D-005). Positive remaining balance keeps the Folio open for post-checkout payment/void; zero balance closes it via `closeFolioIfSettled`, which never changes Room/Stay. `checkoutRoomFolio` is financial closure only. Cleaning completion is explicit `updateRoomStatus({ status: "available" })`. Checkout messaging uses the returned dashboard account projection; the dashboard revision refreshes the scoped folio read through its controller.

## Return context

Intents may still carry `returnContext: { page, view, entityId? }` with `rooms`, `reservations` or `daily-tasks` as the originating region. These values no longer switch a Pension page tab; the full board is already visible. Closing a Room Workspace returns to the Pension page and the mounted filter controller preserves reservation/task filters. Exact per-pane scroll offsets are not preserved by design.

## Capability behavior

`staysEnabled`, `reservationsEnabled`, `folioEnabled`, `menuEnabled` come from runtime capabilities. `rooms-only` disables financial controls and hides manual Stay entry and performs no folio reads; `no-folio` keeps Stay flows without financial coordination; `no-menu` keeps payment and manual charge controls without menu-item controls. `smoke-pension-workspace.mjs` covers all three variants plus stale-result, focus-guard and presentation-preservation cases.

## Intentionally deferred items

Unlimited/paginated folio history, RoomStatus schema split (projection only), per-room financial allocation for multi-room bookings, a second receivables ledger, generic sector/plugin framework, exact scroll restoration. `Customer Credit` remains a separate ledger and is not mixed into the folio flow.
