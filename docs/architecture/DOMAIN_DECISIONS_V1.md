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

## D-022 — Commerce Order is intent, not sale or inventory movement

**Status:** ACCEPTED (2026-10-03)

A Commerce Order records channel-independent purchase intent and immutable customer/product
pricing snapshots. Creating or confirming an order does not reduce inventory, create finance
entries or create a Commerce Sale. Those side effects belong to an explicit later fulfillment
operation.

`commerce.orders` depends only on `commerce.catalog`. External sources use the
`source + sourceReference` pair as an idempotency key so retries cannot duplicate the
order. The `fulfilled` state is reserved for the future order-to-sale application
operation; generic status mutation cannot set it directly.

## D-023 — Wholesale is a capability attached to the canonical Customer

**Status:** ACCEPTED (2026-10-03)

Wholesale does not create a new sector-specific Customer entity. `commerce.wholesale`
is an optional capability that depends on canonical Customers and shared Commerce Orders.
A customer may own at most one commercial profile containing company/tax identity, dealer
lifecycle state, payment term and notes.

Commercial profile existence marks a customer as commercial/dealer-capable; ordinary
customer identity and contact fields remain canonical. Saving customer + commercial
profile is atomic. When wholesale is disabled, normal customer edits do not delete or
rewrite the hidden commercial profile.

Price groups, customer-specific prices and wholesale order UX are intentionally deferred
to later slices. They must reference this profile/customer identity rather than expanding
the profile into a pricing engine.

## D-024 — Order pricing is resolved twice; renderer is not authority

**Status:** ACCEPTED (2026-10-03)

Manual wholesale order UX may preview the customer's current price group, but the renderer
does not own pricing. Adding a product asks the centralized commerce pricing service for a
typed resolved price. Creating the order resolves the price again inside the database
transaction and snapshots that backend result into the order item.

This deliberately tolerates a product/customer price change between draft composition and
save: the persisted order reflects the authoritative price at save time. The created order
response is therefore the final total.

Manual dealer orders use the shared `commerce.orders` aggregate with source
`desktop-wholesale`. Confirmation does not create a Sale, inventory movement, payment or
shipment. Those side effects remain deferred to an explicit fulfillment/application slice.

## D-025 — Fulfillment owns Order → Sale atomically

**Status:** ACCEPTED (2026-10-03)

Only a confirmed Commerce Order may be fulfilled. Fulfillment is a single application
operation and transaction: authoritative Order item snapshots create the Sale, current
catalog data is consulted only for inventory tracking/cost metadata, optional customer
credit debt is recorded, an explicit fulfillment link is persisted and the Order becomes
fulfilled.

Settlement is explicit. Positive totals require either paid (cash/card/bank/other) or
credit; commercial payment terms never imply credit automatically. Zero-total Orders use
no_payment and produce a closed paid Sale with payment_method=none so no cash receipt is
implied.

A stable operation key makes retries idempotent. Reusing the same key with different
settlement/location/order input is rejected. A separate commerce_order_fulfillments link
table is used instead of embedding sale_id into commerce_orders.

Fulfillment deliberately does not add a new finance entry for paid Commerce Sales because
the existing Market Quick Sale path does not currently project paid commerce_sales into
finance_entries. Customer-credit finance income remains tied to later actual collection.
Finance standardization, if desired, is a separate domain decision and must apply to both
sales paths consistently.


## D-026 — Online Sales ingress imports an inbox into canonical Commerce Orders

**Status:** ACCEPTED (2026-10-04)

`channel.online_sales` is optional, defaults OFF for Market/retail, and depends on
`commerce.orders`. A Web Order is a transport/inbox record, not a canonical business
entity. Canonical orders belong exclusively to `commerce.orders`.

Desktop imports anonymous orders through canonical `createCommerceOrder()` using
source `web-online-sales` and the Web Order id as `sourceReference`. The
`source + sourceReference` pair is the idempotency boundary. Desktop resolves pricing;
web payload prices are never authoritative. The web side creates no Sale, inventory
movement, payment or fulfillment.

`SyncCoordinator` only orchestrates capability gates, pull, ingress and ack. A focused
Online Order Ingress Service validates envelopes and delegates canonical creation.
`web_orders` has its own cursor/ack line, independent of customer requests. Only the
successfully imported prefix may be acknowledged; failed records remain retryable.

Public checkout/order submission is deferred to the later Product Publication / Web
Catalog slice. Checkout identity, shipping and automatic customer creation are outside
this foundation. Only the current schema is supported; no historical migration chain.

## D-027 — Product Publication projects canonical products into the web channel

**Status:** ACCEPTED (2026-10-04)

Product Publication is not a second canonical Product. A publication references
`catalog_products` by `productId` and owns only channel settings. Web visibility is
explicit opt-in, default OFF, with one publication per product/channel (`online_sales`).

Desktop is authoritative. Only active, non-deleted products with an enabled publication
enter the public projection. `channel.online_sales` OFF publishes a disabled empty
catalog through the existing versioned publication/outbox lifecycle. Web reads the
sanitized projection and does not generate product, price or stock business rules.

Desktop prepares prices using canonical resolved retail pricing, without a customer.
Dealer/wholesale web pricing is deferred. The public contract excludes purchase/cost,
dealer prices, suppliers, internal notes, barcode and private metadata. Local image
archive paths are never public; only safe public image URLs may be projected.

Publication visibility is an immediate preference in the canonical Product Workspace;
it does not create another Product editor or mutate the product's local active state.
Checkout, cart, public order submission and customer identity capture remain deferred.


## D-028 — Public guest submission carries an order contact snapshot

**Status:** ACCEPTED (2026-10-04)

Public checkout never creates a Customer. A guest order carries a buyer/contact snapshot
(name, phone, optional email) and optional note, persisted on canonical `commerce.orders`.
The snapshot records contact at submission time, not canonical Customer identity;
`customerId` may remain empty. Linking a Customer later is a separate operation.

Public submission accepts published online catalog `productId + quantity` only, with
bounded guest contact data. Client price, tax, discount, stock, Sale, payment and fulfillment
fields have no authority and are excluded from the semantic request and queue payload.
Hosting verifies current enabled publication and product membership as a security/UX
filter. Desktop ingress and canonical `createCommerceOrder()` revalidate active products
and resolve current retail prices. Desktop remains business authority.

Only an enabled `online_sales` catalog accepts new submissions. Explicit client
`idempotencyKey` (16–128 ASCII letters/digits/underscore/hyphen; clients should generate a
random key per intent) identifies retries. The same key and normalized semantic request
replay the same acceptance; a changed request conflicts. Replays create no new submission,
including after publication is disabled. Queue insertion and a focused hashed receipt are
atomic. Receipts contain no raw key, IP or buyer PII; request fingerprints are keyed with
a private server-generated secret. Runtime reset clears queue, receipts and that secret.

The existing public request guard owns method, JSON content type, body limits and rate
limits. A request has at most 50 distinct product rows, quantity > 0 and <= 1000 per row,
at most four decimal places and total quantity <= 10000. Duplicate product rows are
rejected; sorted rows make row order irrelevant to idempotency. Body is bounded to 16 KiB,
buyer name to 160 characters, phone to 40 (7–15 digits, international formatting allowed),
email to 254 and note to 2000. PII is never included in diagnostics.

Creating a guest order does not reserve stock or create a Sale, payment or fulfillment.
Shipping, address, delivery method, customer/dealer login and checkout UI remain deferred.
Only the current transport/database contract is supported; no historical compatibility.
