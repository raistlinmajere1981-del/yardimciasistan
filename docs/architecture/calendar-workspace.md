# Calendar Workspace — Stage 8G

Status: closed and verified on `refactor/calendar-workspace-v2`.

## Ownership

Calendar remains a projection and launcher surface.

It does not become a canonical Reservation editor, Daily Task editor or a second operational workspace for Pension/Restaurant.

The Stage 8G ownership model is:

- `DesktopSyncController` remains the authoritative owner of Dashboard/domain projections.
- `projectDesktopDashboardData()` filters Calendar input by active capabilities.
- `useCalendarPageController` owns Calendar presentation context above the page mount boundary.
- `OperationCalendarPage` owns only rendering and local derivation of visible date items.
- `OperationController` remains the owner of Daily Task mutations.
- reservation opening delegates to the existing domain-aware launcher in `DesktopWorkspaceRouter`.

No Calendar-specific persistence layer, entity editor, mutation service or cache was introduced.

## Persistent Calendar page context

Before Stage 8G, Calendar kept:

```text
viewMode
selectedDate
```

inside `OperationCalendarPage`.

Because the page is conditionally mounted by the router, ordinary navigation away from Calendar discarded that context.

Stage 8G introduces `useCalendarPageController` in `DesktopWorkspaceRouter`.

The controller preserves:

- day/week view mode
- selected date

across ordinary page navigation and presentation unmount/remount.

This follows the platform rule that feature-page navigation/filter context lives above a presentation boundary when users reasonably expect to return to it.

## Projection contract

Calendar receives `surfaceData`, the result of `projectDesktopDashboardData()`, rather than raw Dashboard data.

Therefore Calendar does not independently recover or display hidden domain records.

Relevant projection rules remain centralized:

- reservation records pass `isReservationTypeAvailable()`
- Daily Tasks pass `isOperationalTaskAvailable()`
- rooms/tables used for labels are capability-projected
- disabled accommodation or food-service domains are removed before Calendar rendering

The Calendar page still performs date/view projection over that capability-safe input.

## Calendar item derivation

`OperationCalendarPage` derives presentation items only:

- accommodation arrival from reservation start date
- accommodation departure from reservation end date
- restaurant reservation event
- Daily Task event
- time ordering and display labels
- selected day/week range

Rejected/cancelled reservations and archived/cancelled tasks remain excluded according to the existing Calendar contract.

No persistence or IPC occurs while building these items.

## Launcher and operation boundaries

### Reservation

Calendar's `Aç` action delegates to `openDashboardReservation()`.

That existing router operation remains domain-aware:

- linked request/customer context can route to Customer Work
- food-service reservations route to Restaurant
- accommodation reservations route to Pension
- unavailable capability/domain combinations return explicit feedback

Calendar does not implement a Reservation editor.

### Daily Task

Calendar's `Tamamla` action delegates to:

```text
OperationController.handleUpdateDailyTaskStatus(taskId, "done")
```

Calendar does not create a second Daily Task mutation path.

## Regression coverage

Stage 8G adds `smoke-calendar-workspace`.

The browser fixture verifies:

- real Calendar day projection
- day/week presentation switching
- selected-date behavior
- Reservation action stays a launcher callback
- Daily Task completion stays an operation callback
- unmount/remount does not reset selected date
- unmount/remount does not reset day/week mode

The smoke is included in `smoke:desktop-renderer` and `pilot:check`.

The existing static `smoke-operation-calendar` was also extended to guard the router-owned Calendar controller contract.

## Domain boundaries preserved

Stage 8G does not change:

- SQLite schema or migrations
- Reservation service behavior
- Daily Task persistence behavior
- Pension or Restaurant canonical editors
- capability definitions
- reservation-domain classification
- Dashboard projection ownership
- WorkspaceHost entity definitions

This is a page-context ownership migration, not a Calendar domain redesign.

## Verification

Stage closure passed locally:

```text
npm run typecheck
npm run typecheck:electron
npm run smoke:calendar-workspace
node scripts/smoke-operation-calendar.mjs
npm run smoke:desktop-renderer

npm run lint:strict
npm run knip:strict
npm run architecture:audit
npm run design:audit:strict
npm run pilot:check

git diff --check
git status --short --branch
npm run check:linux
```

No high-risk persistence, transaction or concurrency boundary was introduced, so Stage 8G did not require an Astra architecture checkpoint.

## Deferred, non-blocking follow-ups

The following remain outside Stage 8G:

- adding Calendar-specific entity editors
- merging Dashboard and Calendar projection models
- adding month view or drag/drop scheduling
- changing Reservation or Daily Task domain semantics
- introducing declarative sector/feature contribution registries before Stage 9
