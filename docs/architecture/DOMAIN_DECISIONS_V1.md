# Yardımcı Asistan — Domain & Platform Decision Register v1

This register captures decisions that must remain explicit while Application Architecture v2 is implemented.

Status values:

- **ACCEPTED** — target architecture decision
- **IMPLEMENTATION REQUIRED** — accepted direction; code work remains
- **DEFERRED** — intentionally not part of the current pilot
- **OPEN** — requires a product/domain choice before behavior changes

---

## D-001 — Reservation room assignment and Stay creation are separate operations

**Status:** ACCEPTED

Current code proves these are different mutations:

- editing/assigning a Room on Reservation changes the Reservation resource assignment
- assigning a Customer to a Room creates a `CustomerRoomStay`

They may share form controls and contextual entry points, but they must not silently become one mutation.

Target operation families:

```text
assignReservationRoom
createStay
```

A future reservation-to-stay conversion may coordinate the two explicitly.

---

## D-002 — A Stay created from a Reservation must retain the Reservation relationship

**Status:** IMPLEMENTATION REQUIRED

Current manual `assignCustomerToRoom` creates a Stay with an empty `reservation_id`.

Long-term, when check-in/stay creation originates from a Reservation, the Stay should carry that Reservation identity.

This must be implemented as an explicit domain contract, not inferred later from matching customer/room/date.

The Pension UI pilot must not pretend this linkage already exists.

---

## D-003 — Room status must be presented as separate concepts

**Status:** ACCEPTED; schema cleanup DEFERRED

Current `RoomStatus` mixes:

- physical/operational state: cleaning, maintenance, out_of_service
- occupancy/planning state: occupied, reserved, available

The UI must stop treating one derived “room status” value as the only truth.

Near-term presentation should distinguish:

1. **Operational condition** — ready/available, cleaning, maintenance, out of service
2. **Occupancy** — empty or checked in / occupied
3. **Planning** — upcoming/active Reservation assignment

Current persistence can remain during the pilot. A later domain migration may split these concepts if required.

`getRoomDisplayInfo()` is a projection, not authoritative domain ownership.

---

## D-004 — Canonical checkout must separate guest departure, financial state and room readiness

**Status:** ACCEPTED TARGET; IMPLEMENTATION REQUIRED

Current Stay checkout and Folio checkout have different effects.

Target semantics:

1. Guest departure changes the Stay lifecycle to `checked_out`.
2. The room enters `cleaning` after physical checkout when no other active Stay owns it.
3. Closing/settling the Folio is a financial operation.
4. Financial close must not mark a physically unclean room `available`.
5. The room becomes ready/available when the operational cleaning step is completed.
6. If an open balance blocks checkout, the reason and next action must be explicit in the same workspace.

Exact debt policy is governed by D-005.

This target should be implemented in a dedicated domain-hardening stage before the UI presents checkout as one canonical action.

---

## D-005 — Guest checkout with remaining Folio debt keeps the Folio open

**Status:** ACCEPTED

Policy:

- A guest's physical/operational departure must not be blocked by open debt.
- Stay checkout may proceed even when a Folio balance remains.
- The Stay becomes `checked_out`.
- When no other active Stay owns the room, the room enters `cleaning`.
- The room becomes `available` only after cleaning/operational readiness is completed.
- While a balance remains on the Folio, the Folio stays open.
- Later payment may be collected through the open Folio.
- The Folio is closed only when it reaches a financially closable state.
- The UI must not conflate these three concepts:
  1. guest departure,
  2. room physical readiness,
  3. financial closure of the account.
- A new separate customer-credit/receivables system is not part of this decision.
- Customer Credit and Room Folio remain separate ledgers (see D-012).

This provides post-checkout settlement without introducing a new ledger. A future dedicated accounts-receivable model remains a separate domain project.

---

## D-006 — Opening a Folio is not the canonical check-in operation

**Status:** ACCEPTED TARGET

Current `openFolio` can also check in the Stay.

Target architecture should make check-in an explicit hospitality lifecycle action.

When Room Folio capability is enabled, check-in may coordinate “ensure/open Folio” as part of the same application operation, but a user should not need to understand that opening an account is what checks a guest in.

Implementation should preserve existing financial initialization rules.

---

## D-007 — Room profile data has one canonical edit model

**Status:** ACCEPTED

Room name/default price/public room details are currently editable through multiple surfaces.

Target:

```text
RoomProfile
  identity
  capacity/bed/floor
  default price
  customer-visible details/features
```

Settings may offer batch/resource-management entry points, and Room Workspace may offer contextual edit, but both use the same field model and canonical save operations.

A Folio-specific nightly price override remains a different financial concept.

---

## D-008 — Folio history is not unlimited today

**Status:** ACCEPTED CONSTRAINT; EXPANSION DEFERRED

Current Room Folio data is limited in time/count and the current UI does not provide a general paginated history contract.

The redesigned `Geçmiş` tab must not claim “all history” until a paginated/queryable backend exists.

Pilot wording and tests should reflect the actual available history.

---

## D-009 — Table click must not silently create an order unless that is the explicit product decision

**Status:** ACCEPTED PRINCIPLE; exact UX to decide in Restaurant pilot

Current order drawer opening can create an order when none exists.

The new Table Workspace must distinguish `inspect/open table context` from `start order`.

If the final high-frequency UX intentionally makes selecting an empty table start an order, that behavior must be explicit and tested, not an accidental side effect of opening the workspace.

---

## D-010 — TableOrder close/payment is not a full payment ledger

**Status:** ACCEPTED CONSTRAINT

Current restaurant “paid” flow closes the TableOrder and triggers finance effects; it is not the same as Room Folio payment records.

The Restaurant pilot may redesign the presentation but must not invent split payments/payment methods/refunds unless a separate domain project implements them.

---

## D-011 — Menu Item and Catalog Product remain distinct

**Status:** ACCEPTED

They have different persistence and stock/business semantics.

Shared presentation controls such as pickers, quantity controls or product-summary components are allowed.

Merging their data models is outside the UI/platform program.

---

## D-012 — Customer Credit and Room Folio remain distinct ledgers

**Status:** ACCEPTED

They may appear in one Customer Workspace as related financial information.

They must not be merged into one balance or one payment mutation without an explicit finance-domain redesign.

---

## D-013 — Settings uses one active category draft and guarded transitions

**Status:** ACCEPTED

Target behavior:

- only the active category is presented and only that category may remain dirty
- dirty state is category-specific and visibly marked
- switching category while dirty requires one explicit decision: save and continue, discard and continue, or stay
- Settings search uses the same guarded transition contract
- leaving Settings through application navigation while dirty uses the same decision contract
- a failed save keeps the user in the current category and preserves the remaining draft
- save/discard applies only to the active category
- controls are locked while the owning category save is in flight; late edits are not rebased across a save
- Appearance remains immediate; password, device, update-check/install and maintenance commands remain actions rather than fake staged settings
- Operations owns one transactional `BusinessLayout` draft for rooms and table categories instead of Setup-owned room/table fields

A future backend category-patch API may still narrow Setup persistence, but multi-category dirty preservation is not part of the Settings contract.

---

## D-014 — Appearance is one system with orthogonal preferences

**Status:** ACCEPTED

Remove the conceptual split between “Easy” and “Pro” themes.

Target preferences:

- scheme: system/light/dark
- density: comfortable/compact
- scale
- accent preset
- font preset
- reduced motion

Existing saved preferences may be migrated once.

---

## D-015 — No generic sector/plugin framework before two pilots

**Status:** ACCEPTED

Pension and Restaurant are the evidence-gathering pilots.

Stage 9 satisfied this threshold and extracted only the seams proved by those pilots: static typed navigation contributions, narrow staged Settings contributions and feature-owned entity workspace definitions with a static aggregate. Runtime capability snapshots remain the gate and Business Profiles remain capability presets.

Dashboard contribution registration and executable/domain-operation registration were not extracted because the pilots did not prove a safe common contract. No dynamic plugin registry, service locator, dependency container or generic command bus was introduced.

This preserves the original intent: common composition is extracted only after evidence, without turning the desktop into a speculative plugin framework.

---

## D-016 — Tests protect domain behavior and platform contracts, not old presentation

**Status:** ACCEPTED

Old smoke tests that require a drawer, exact panel stack, anchor navigation or obsolete label must be rewritten when that presentation is intentionally removed.

Business regression tests remain authoritative until the corresponding domain behavior is intentionally changed.

---

## D-017 — Registered guests own their individual arrival and departure

**Status:** ACCEPTED (2026-09-28)

A Stay represents one group occupying one room, with a shared Folio. Each person,
including children and infants, has a Customer and a `stay_guests` participation record.
No anonymous occupants are created from `guest_count`. Reservation guest count remains
the expected occupancy; actual arrival count comes from the selected registered people.
Late arrivals join the same Stay. Each participation records actual timestamps; a return
after departure creates a new participation rather than overwriting history.

One person cannot belong to two active Stay guest lists. One room cannot have two
checked-in Stays. Overlapping planned allocations remain prohibited. Independent
concurrent room accounts and split guest billing are deferred.

## D-018 — Primary guest and billing customer have different lifecycles

**Status:** ACCEPTED (2026-09-28)

The primary guest is the current group contact, not a second ledger owner. They can be
replaced by another active guest. If they depart while others remain, the replacement is
selected explicitly. The original Folio billing customer and existing debt remain intact;
changing a contact does not silently transfer financial responsibility.

Individual departure keeps the group, room and account active. Final/group departure
uses canonical hospitality checkout. It never invents a payment. Remaining debt keeps
the Folio open; the vacated room needs cleaning even if another future Stay is planned.

## D-019 — Desktop arrival is one atomic application operation

**Status:** ACCEPTED (2026-09-28)

Desktop arrival coordinates creation/reuse of the Stay, all selected guests, reservation
room assignment when missing, explicit check-in and enabled Folio initialization in one
SQLite transaction. Its request receipt prevents duplicate retries. Low-level ownership
remains separate; a second renderer financial-opening step is unnecessary.

Room moves preserve Stay/Folio identity, financial history and agreed pricing. Previous
room occupancy and each guest's reporting events remain recorded. Multi-room reservation
conversion is rejected until room-specific deposit/price allocation exists.

## D-020 — Restaurant transfer resolves active guest membership

**Status:** ACCEPTED (2026-09-28)

Any checked-in participant can identify the shared room account. A unique eligible
account is suggested automatically. Prior departed guests' open debt is not a transfer
target. Any open restaurant-order state can transfer the whole order atomically; a
separate payment-waiting step is unnecessary. The server validates membership, account
lifecycle and currency under its transaction. Existing no-double-stock/no-cash-receipt
and idempotent transfer semantics remain. Partial item transfer is deferred.

## D-021 — Local notification preparation is not KBS delivery

**Status:** ACCEPTED (2026-09-28); external integration DEFERRED

Individual arrival/departure and room changes create local pending notification records.
Pending identity data follows corrections in the canonical Customer record. Completed
delivery records must not be rewritten by later customer edits. No provider connection,
MERNİS verification, automatic sender or delivery acknowledgement is fabricated.
The UI explicitly states that notification must still be completed in the official system.
This is an integration foundation, not a claim of certified regulatory compliance.
