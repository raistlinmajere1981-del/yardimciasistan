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

## D-013 — Settings uses category-scoped drafts and save

**Status:** ACCEPTED

Target behavior:

- only active category is presented
- dirty state is category-specific
- switching category preserves drafts
- dirty category gets a visible indicator
- save/discard applies to the active staged category
- leaving Settings with dirty drafts requires one clear decision
- immediate actions remain immediate and are not fake staged settings

A future backend category-patch API is preferred but not required for the first UI split.

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
