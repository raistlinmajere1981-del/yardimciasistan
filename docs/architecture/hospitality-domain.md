# Hospitality domain hardening — Stage 3

D-001 through D-008 remain the authority. No schema or transport redesign is included.

## Initial call graph and behavior

| Operation | Entry → owner | Room | Stay | Reservation | Folio / Finance |
| --- | --- | --- | --- | --- | --- |
| Manual assignment | `useCustomerController` → preload `assignCustomerRoom` → `customer:assignRoom` → DesktopDatabase → stay-reservation-service; Android `customer_room_assign` → android-action-service | reserved / occupied | Creates manual Stay, empty reservation ID | Unchanged | Unchanged |
| Stay status | `useCustomerController` → preload/`customer:updateRoomStayStatus` → facade → stay-reservation-service; Android `customer_room_stay_status` → android-action-service | Arrival occupied; departure cleaning unless another active Stay | Lifecycle/timestamps | Unchanged | Previously unchanged even on departure |
| Reservation assignment/status | `useOperationController` → reservation IPC → facade → stay-reservation-service; Android reservation actions/status | Reservation status updates | Does not create Stay | Assignment/status mutation | Unchanged |
| Request conversion | desktop/Android → request-intake-service | Unchanged; new reservation has no assigned room | Does not create Stay | Creates reservation from request | Reservation financial initialization remains existing behavior |
| Open Folio | `RoomFolioWorkspace` → preload/room-folio-ipc → DesktopRoomFolioService.openFolio | occupied | Implicit check-in | Unchanged | Creates account and imports existing reservation deposit once |
| Update Folio details | same Folio chain | Unchanged | Also updates dates/guest count | Unchanged | Updates account pricing/dates; room profile price is separate |
| Desktop Folio checkout | same Folio chain → service.checkout | Previously available | checked_out | Unchanged | Previously rejected debt unless allowOutstanding; then closed even with debt |
| Android Folio checkout | action queue → DesktopDatabase.applyAndroidAction transaction → android-room-folio-actions | Previously available | checked_out | Unchanged | Previously rejected debt; otherwise closed |
| Payment/void | desktop Folio service; Android payment action | Unchanged | Unchanged | Unchanged | Payment row mutation; SQL trigger writes/voids finance entry for direct payments |
| Display projection | PensionPage / OperationWorkspaces / DesktopWorkspaceRouter → getRoomDisplayInfo | Read only, but reservation could hide cleaning/maintenance | Not consulted | Read only | None |

Existing explicit request-to-reservation conversion creates/updates an approved Reservation; that upsert behavior is unchanged. Stay creation/check-in/checkout never changes Reservation status.

`refreshRoomStatusFromStays` and two copies of `enforceActiveStayRoomStatus` previously recomputed the mixed Room status. Their persistence logic now lives in `room-state-service.ts`. The sync path applies Android actions through the same facade/action transaction and publishes existing snapshot/outbox data. No Android UI or transport fields changed.

## Implemented API

DesktopDatabase and preload now expose:

- `createStayFromReservation({ reservationId, roomId? })` → `customer:createStayFromReservation`.
- `checkInStay(stayId)` → `customer:checkInStay` (explicit existing Stay lifecycle transition; no Folio mutation).
- `checkoutStay(stayId)` → `customer:checkoutStay`.

New IPC handlers check the session lock on the main side, then existing customer/stay capability gates (plus reservation capability for conversion), then delegate to the facade and existing publication finalizer. Existing channels and result envelopes remain available.

Linked creation accepts only an **approved room reservation**. A single assigned room can be inferred; multi-room bookings require an explicit member room. Customer, dates, guest count, notes and reservation ID come from that booking; the new Stay is **planned**. Room activation/operational restriction/capacity, overlapping Stay and duplicate active reservation-room guards apply. Other active reservations are checked directly without the dashboard's 80-row limit; only the source reservation is excluded, including when another booking belongs to the same customer. The reservation itself is never updated.

Manual `assignCustomerToRoom` remains separate, retaining its empty reservation ID and existing validation/messages, including its same-customer reservation conflict exemption. Both public paths share insertion/validation internally. Linked conversion encloses source reads and insertion in a savepoint. No schema/index change is needed.

Multi-room bookings have no per-room guest allocation model: the booking guest count is conservatively checked against the selected room, without invented distribution. Folio reservation-total/deposit initialization is unchanged; a per-room financial allocation policy is outside this stage and must not be inferred from the linked Stay API.

## Canonical departure and settlement

`checkoutHospitalityStay` in `electron/hospitality-checkout.ts` is the sole checkout mutation owner. Desktop Stay status/explicit checkout, DesktopRoomFolioService.checkout, Android Stay checkout and Android Folio checkout delegate to it. Its savepoint composes with the Android action/receipt transaction and rolls back all lifecycle/financial/event effects together.

- Only checked-in Stays depart; repeated requests for an already departed Stay are safe.
- Departure sets `checked_out` and `checked_out_at`. Scheduled dates are preserved; an actual departure timestamp is not a planned date.
- With no other active Stay, Room becomes **cleaning**. Other checked-in/planned Stays retain occupancy/planning ownership. Persisted operational restrictions are not erased merely by recomputing reservation/Stay planning.
- No Folio: departure succeeds normally.
- Positive remaining balance: Folio stays **open**, with unchanged debt/items/payments.
- Zero remaining balance: internal `closeFolioIfSettled` closes the financial account. It never changes a Room or Stay.
- Post-departure payment/void continues through the existing open-Folio APIs and finance triggers. Payment alone does **not** close the account or mark a room available.
- Calling the existing Folio checkout entry after settlement performs financial closure only; it does not rewrite departure time or dirty/release an already cleaned room.
- Cleaning completion remains explicit `updateRoomStatus({ roomId, status: "available" })`, subject to its existing active-Stay guard.

A departure emits one existing caller-family event (`customer.room_stay_status_changed` or `room_folio.checked_out`). Financial-only closure emits one `room_folio.closed` event, not another Stay transition. Android actor/action identity is retained; receipt deduplication and stale snapshot/version guards remain in their existing owners. Idempotent no-op departure retries produce no extra domain event.

Finance SQL triggers, stock mutations, restaurant transfer idempotency, Customer Credit and the current schema are unchanged. No second finance entry or new receivables ledger is created.

## Projection for Stage 4

`projectRoomState(room, stays, reservations, asOfDate)` is exported from `packages/shared`. It is pure and browser-safe. Inputs use the existing desktop DTO field shapes; callers supply their authoritative records and an explicit date.

- `operationalCondition`: ready / cleaning / maintenance / out_of_service, derived only from persisted Room status.
- `occupancy`: actual checked-in Stay IDs and occupied/vacant, independent of reservation dates.
- `planning`: separate reservation IDs and planned Stay IDs; both can coexist. Finished/cancelled/expired plans are excluded.
- `persistedStatus` and `isActive` remain visible so callers do not mistake the projection for a schema split. Persisted occupied/reserved values contain no separate physical-condition fact and map to ready.

Stage 4 uses this projection in Room tiles and RoomWorkspace; the remaining dashboard `getRoomDisplayInfo` adapter delegates to it. The projection does not expand limited dashboard/history reads or claim complete Folio history.

## Stage 4 remaining domain cleanup

1. **openFolio implicit check-in: removed in Stage 4.** Production calls now originate in RoomWorkspace after explicit `checkInStay`, or retry financial opening for an already checked-in Stay. `openFolio` no longer mutates Stay/Room or claims arrival in its success message. All service/transfer/Android smoke fixtures now check in explicitly; account opening without arrival is tested.
2. **Folio checkout payload:** current desktop checkout carries only the Folio identity; D-005 governs departure with remaining debt. RoomWorkspace distinguishes guest checkout from a settled-account close action, while Android checkout independently carries its stale-balance guard.
3. **Folio details ↔ Stay metadata and Room profile:** existing date/guest-count coupling and profile edit entry points were audited, not redesigned. RoomWorkspace must preserve D-007's single profile save model; nightly Folio overrides remain separate.
4. **Room display adapter:** replace remaining callers with the orthogonal projection as RoomWorkspace converges on the canonical projection.

## Verification

`npm run smoke:hospitality-domain` builds shared and Electron outputs, then runs the SQLite behavior suite. Other domain scripts can reuse those outputs: customer-room-management-db, manual-reservation, room-folio-service, room-folio-table-order-transfer and android-room-folio-actions. Tests cover manual/linked separation, assignment-only behavior, guards, debt/zero/no-Folio checkout through both entry families, post-departure payment/void and finance uniqueness, explicit cleaning, other active Stays, event count, transaction rollback and projection facts. The Android Folio smoke now initializes an explicit business profile before checking permissions; checkout assertions reflect D-005.
