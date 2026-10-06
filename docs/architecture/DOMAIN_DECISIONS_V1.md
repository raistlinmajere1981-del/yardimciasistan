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
`catalog_products` by `productId` and owns only channel settings, with one publication
per product/channel (`online_sales`). When `channel.online_sales` is enabled, canonical
Product creation persists a publication with `isPublished=true` by default in the same
transaction. The create form may explicitly opt out; users may also disable publication
later per product. With the channel disabled, new products are not automatically published.
Existing products retain their stored publication state (including absent/false), and
enabling the capability later never bulk-publishes old products. Product edits do not
reapply the creation default. The existing publication trigger/outbox lifecycle is reused.

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

## D-030 — Delivery is order intent; shipping execution is separate

**Status:** ACCEPTED (2026-10-04)

Commerce Order owns an immutable delivery snapshot, separate from its buyer/contact
snapshot and canonical Customer address. Initial methods are `pickup` (address null)
and `shipping` (structured address required). Guest delivery capture creates neither
a Customer nor an address-book entry and never mutates Customer data. Manual/desktop
creation with omitted delivery defaults to pickup; web submission and ingress require
an explicit method. There is no historical schema migration or envelope fallback.

`channel.online_sales` configuration owns pickupEnabled/shippingEnabled, with at least
one enabled; defaults are pickup ON and shipping OFF. These are staged Services Settings
fields in the existing Setup persistence path, not new capabilities. Desktop publishes
only allowed delivery methods in the public online catalog. Hosting validates the current
method allowlist for new submissions; receipt replay remains independent of later changes.
Delivery and normalized address are part of the public idempotency fingerprint. Desktop
validates the imported snapshot and remains authoritative for canonical orders/pricing.

Address fields are bounded: recipient 160, address lines 300 each, district/city 120 each,
postal code 32, note 500 characters. Country is a normalized two-letter uppercase code
(non-TR countries supported). Required text must be nonempty; control characters are
rejected (line breaks allowed only in address note). Optional empty text is omitted.
Pickup discards any supplied address; client carrier/price/tracking/status fields have
no authority and never enter the canonical snapshot.

Selecting shipping creates no Sale, inventory movement, reservation or fulfillment.
Order totals remain product totals; no shipping charge or zero-price shipping promise is
created. Shipping costs/pricing need a separate domain decision. Providers, labels,
tracking, carrier status and shipment lifecycle belong to a later shipping/fulfillment
layer. Existing explicit Order → Sale fulfillment and order lifecycle remain unchanged.


## D-031 — Shipment owns physical shipping, independently of fulfillment

**Status:** ACCEPTED (2026-10-04)

Shipment is a provider-neutral physical sending operation for a Commerce Order. It is
neither Commerce Order, Sale, inventory movement nor the immutable delivery snapshot.
Only an existing non-cancelled Order with delivery method `shipping` can create a Shipment.
Placed, confirmed and fulfilled Orders are eligible: fulfillment is a separate commercial
operation and may happen before or after shipping. One Order may own multiple Shipments;
there is no unique order_id constraint. B2 UI exposes creation when no Shipment exists
and displays existing records without partial-shipment allocation or additional creation UI.

Lifecycle is draft → ready → dispatched → delivered; draft/ready may be cancelled.
Delivered and cancelled are terminal. Repeating the current status is an idempotent no-op;
all other transitions outside this graph are rejected. Store transactions authoritatively
write the relevant status timestamp and updatedAt, preserving earlier timestamps.
Order cancellation never automatically mutates Shipment: draft/ready shipments can still
be cancelled but cannot advance; dispatched shipments may record delivery even when the
Order was subsequently cancelled. New shipments cannot be created for cancelled Orders.

Shipment mutations never change Order status or create Sale, stock, payment, reservation
or fulfillment. Confirmation/fulfillment never dispatches a Shipment. The provider adapter
is a typed boundary only, with no production fake, SDK, credentials or automatic execution.
B2 is local desktop persistence; existing web ingress/publication outboxes do not transport
shipments. A future provider/sync slice must explicitly define its own execution contract.
Shipment-specific change events refresh only the selected Order's shipment projection;
local mutation responses update that projection immediately without polling.

## D-032 — Aras is a provider adapter, not Shipment domain

**Status:** ACCEPTED (2026-10-04)

Aras Kargo (`aras`) is the first static shipping provider adapter. Its SOAP/XML, endpoints,
credentials and external-state interpretation live outside the provider-neutral Shipment
store. Provider id/display name are owned by the shared static provider configuration
metadata. Store writes accept only normalized provider metadata and internal status;
provider failures never mutate Order, Sale, stock or fulfillment.

Services Settings owns the staged Aras configuration through the existing Setup/category
save transaction: enabled, test/production environment, customer code, username and a
write-only password. Main encrypts the password using Electron safeStorage; Linux basic_text
fallback is rejected. Only encrypted envelopes are persisted. Read APIs expose hasSecret
and configured, never password or encrypted payload; no reveal IPC exists. An absent or
incomplete configuration is unconfigured and disables remote operations. Connection testing
is an explicit read-only operation on draft settings, with no persistence side effect.

B3 registers an existing draft/ready shipping Shipment. Receiver/address come exclusively
from the immutable delivery snapshot; ReceiverPhone1 uses the immutable buyer/contact
snapshot phone, with no live Customer fallback. A missing snapshot phone is rejected.
This first adapter supports domestic TR orders and one parcel per registration; no weights,
shipping fees, COD, reservations or additional commercial side effects are fabricated.

Shipment.id is the immutable IntegrationCode. A durable registration record binds provider,
account/environment fingerprint and reference. Before SetOrder, a compare-and-set records
submitted. Each Shipment may cross that boundary at most once, including concurrent
processes/restarts. Every retry first calls GetOrderWithIntegrationCode. A matching remote
record reconciles the same local Shipment; an absent result after a submitted attempt is
ambiguous and cannot authorize a second SetOrder. No automatic network retry is performed.
A different provider account/environment cannot reuse the existing registration.

SetOrder result codes have no documented meaning in the public WSDL. A positive registration
requires a matching GetOrderWithIntegrationCode read-back, not a guessed success code.
ExternalReference is that integration reference; only provider-returned tracking numbers
are stored. Tracking URLs are constructed from validated numeric tracking numbers on the
provider's fixed tracking host, never copied from an arbitrary remote URL.

GetCargoInfo is the explicit manual status query. Its DataTable has an open schema in the
public WSDL: the adapter projects a small allowlist of reference/tracking/status fields.
Only exact delivered or in-transit descriptions map to internal status. Unknown, numeric,
preparation, failed-delivery and return states preserve the current lifecycle and are
logged without raw values. The provider-neutral store advances through the existing
legal lifecycle steps atomically, never backwards and never out of a terminal state;
status timestamps remain store-authoritative. Registration alone does not dispatch.

Submitted/ambiguous registrations block local status mutation until reconciliation.
A registered remote shipment cannot be locally cancelled: remote cancellation is a later
explicit operation, and the existing local cancel action remains for unbound shipments.
Order cancellation does not invoke provider cancellation or override D-031 lifecycle rules.

B3 uses fixed HTTPS SOAP 1.1 endpoints, bounded responses, timeout, redirect rejection,
namespace/structure validation and entity/DTD rejection. Fault/HTTP/network errors expose
fixed safe messages. Structured diagnostics contain only operation/provider/shipment ids,
bounded error codes and HTTP status; no credentials, recipient/address/phone, raw SOAP,
raw provider state or provider-returned error text. No polling, webhook, labels, automatic
Sale/fulfillment or new provider/sync outbox execution is introduced.


## D-033 — Dealer Web Identity is canonical Customer access, not a second Customer

**Status:** ACCEPTED (2026-10-04)

Dealer Web Identity references canonical Customer + an active commercial dealer profile.
Desktop owns `commerce_dealer_web_access`, eligibility, enabled state, invite generation
and monotonically increasing access revisions. Wholesale owns the staged
`dealerPortalEnabled` subfeature configuration (default OFF); this is neither a new
sector/capability nor an alias of Online Sales. Disabling Wholesale/portal, removing or
inactivating a dealer profile, or deleting its Customer invalidates access and clears
invites. Re-enabling a capability never restores old access. Restore invalidates restored
access generations before publication.

The web module owns only a sanitized private access projection, one-time claim consumption
and server-side transport sessions. It never owns or receives the canonical Customer list.
Projection includes independently random access/customer reference ids, company display
name, revision, enabled state and private invite hash/expiry. Contact, tax, notes, guest
buyer snapshots, pricing and internal Customer ids do not cross this boundary. Price
group could later annotate identity, but never establishes price authority; C1 omits it.

Immediate Customer Workspace operations enable access, issue/rotate an invite, revoke all
sessions and disable access. They do not participate in the customer card draft; dirty
cards must be saved/discarded first. Access status means Desktop-authorized access, not a
claim that a hosting session is currently live. The durable versioned publication/outbox
owns retries, idempotency and stale-publication rejection. Revocation takes effect on
hosting after successful publication; an offline/failed sync must not be presented as
completed remote revocation. Private projection application and publication receipt
commit atomically; retry never resets consumed invites.

Invites contain 256 bits of cryptographic randomness, expire after 72 hours, disclose
only at generation and persist only as SHA-256 hashes. Links carry tokens in fragments,
never query parameters; the portal removes the fragment before claim. Claim is explicit
same-origin JSON POST, rate-limited with hashed IP counters and fail-closed storage.
Generic failure is “Bağlantı geçersiz veya süresi dolmuş.” Consume + session creation is
atomic. Rotation increments access revision, invalidating old invites and sessions.

Hosting sessions carry 256-bit opaque random tokens in HttpOnly, production Secure,
SameSite=Strict cookies scoped to the module's `/api/dealer/` path, with an eight-hour
absolute lifetime. Only hashes persist in `dealer_sessions`. Every authenticated read
joins enabled access and matching revision; session tokens never enter renderer JSON or
browser storage. Logout is same-origin POST and revokes the stored session before
expiring its cookie. Strict JSON + a non-CORS custom header protect claim/logout from
cross-origin mutations. Hosting logs only stable allowlisted events/categories/opaque
access ids. `/bayi/` renders public-safe identity and logout only.

Dealer catalogs, prices, orders, payment, application/self-registration, OTP, messaging,
password recovery and shipping selection remain outside C1.


## D-034 — Authenticated dealer catalogs project prices; Desktop creates canonical dealer orders

**Status:** ACCEPTED (2026-10-04)

A dealer order is a canonical Commerce Order linked to the canonical Customer resolved
from D-033 access. It uses source `web-dealer` and the hosting order id as
`sourceReference`; it is not a guest buyer snapshot. Identity only selects the Customer.
The existing wholesale resolver prepares the displayed price using the current commercial
price group, including existing retail fallback. Canonical creation resolves prices again
inside its transaction, following D-024: current Desktop pricing wins without a price lock.
Client unit prices, totals, discounts and price groups never determine order prices.

Initial dealer visibility is every active, non-deleted canonical Catalog Product while
Wholesale and the dealer portal are enabled. Public `online_sales` publication flags and
retail title overrides do not control this channel. No second publication checkbox is
introduced. The existing public publication model is unchanged; a future per-product
dealer visibility requirement must extend it explicitly. Product/publication changes still
invalidate the private publication outbox; price, active-state and profile changes produce
fresh derived catalogs. The per-access catalog revision hashes projected content plus
the durable private publication generation, not a price lock. Every invalidation renews
it, including profile changes that resolve to identical prices; no private profile fields
are included in the published revision.

Only enabled, eligible dealer access receives a sanitized per-access private catalog.
D-033's durable versioned access publication atomically carries access state plus catalogs;
hosting stores catalogs in `dealer_catalogs`, outside public catalog APIs. Revocation,
missing access and access-revision mismatch make a catalog inaccessible immediately when
publication applies. There is no request-time Desktop lookup and no Customer list/contact,
tax, notes, costs, raw canonical Customer ids or price-group publication. All channels use
the existing staged delivery allowlist (`onlineSalesDelivery`); Services exposes that same
configuration for Wholesale even with Online Sales disabled. No second save path is added.

The reliable `web_orders` cursor/ack line and hashed receipts are reused with a typed
union: guest carries buyer snapshot; `kind: dealer` carries opaque `dealerAccessId` and
`accessRevision`, items, delivery and note, with no buyer. Guest identity and dealer access
cannot be mixed. Session-derived identity is required for catalog and order endpoints;
request-selected access/customer identities are rejected or never used. Bounded JSON,
same-origin mutation protection and rate limiting apply. Shipping reuses D-030's immutable
address snapshot; no address-book mutation, fee, payment, Sale or automatic Shipment occurs.
D-031's explicit Shipment operation remains available after import. D-032 is unchanged:
without a buyer contact snapshot phone the first Aras adapter cannot register a shipment;
no live Customer phone fallback is introduced by C2.

Hosting fingerprints normalized dealer identity (including access revision), sorted items,
delivery and note with its existing private keyed receipt secret. Receipt keys are scoped
to dealer access, separate from guests. Same key + same semantic intent replays its
acceptance; changed intent conflicts. Catalog revision is only a bounded transport hint,
excluded from the semantic fingerprint. Current valid access is checked even for receipt
replays. Retries never rely on client prices. Browser persistence contains only product ids,
quantities and a non-authentication retry key/method; address and note stay in memory.

Desktop ingress delegates to canonical creation through the compatibility facade. In the
creation transaction it resolves access to Customer, validates current revision, enabled
portal/Wholesale, active profile and current allowed delivery, then snapshots authoritative
prices. Stale/revoked dealer records cannot import. An invalid access generation is a terminal
transport outcome: Desktop persists only opaque order/access references and a fixed
`access_revoked` reason in `commerce_dealer_order_rejections`, then advances the same cursor.
Thus revocation cannot permanently block later valid orders in the shared queue. Other
validation/storage failures retain the retryable prefix contract; they are never skipped.
Canonical `source + sourceReference` uniqueness prevents duplicate Desktop orders after
lost acknowledgements. Existing order UI uses canonical customerName and a dealer source
label, without the guest contact block. Fulfillment, shipping execution and Aras remain
explicit operations.

## D-035 — Business Messaging provider foundation (D1)

**Decision:** WhatsApp Web and the official WhatsApp Business Cloud API are separate
delivery providers. The existing user-approved Web/prepared-message/birthday/credit
flows keep their contracts. Cloud configuration never enables, disables or converts Web.

BusinessMessage is a delivery intent, not Customer, Order, Sale or Campaign. Optional
canonical references provide context only. Its provider-neutral projection owns recipient,
message kind, template identity, provider message reference, lifecycle and bounded safe
failure metadata. Template and session/free-form semantics are distinct; D1 executes only
approved text templates. Meta account ids/credentials belong to provider configuration;
account binding and intent fingerprint belong to the delivery boundary, not Customer/Order.
Provider failures never mutate canonical customer or commerce state.

Servisler owns a static staged `whatsappCloud` Settings contribution and saves through the
existing Setup transaction. Disabled and enabled/unconfigured are valid states. Main owns
safeStorage encryption/decryption and rejects Linux `basic_text`. Only ciphertext is stored
in the private provider config table. Setup/configuration reads return `hasSecret` and
`configured`, never token/ciphertext; there is no reveal endpoint. Tests use in-memory draft
credentials without saving them. Graph API access stays in the main-process adapter; version
is central, redirects are rejected, timeout covers response reads, response/catalog sizes
are bounded, errors never expose provider text or raw network exceptions.

Meta is the template authority. Each send revalidates approval and required parameters.
Catalog includes approved metadata and component summaries; unsupported media/buttons
cannot send in D1. The Customer workspace contains a bounded operation panel, not another
Customer editor/modal. Its clearly named Business action requires persisted configuration;
`WhatsApp'tan Yaz` remains the Web handoff. Text parameter values are transient and never
persisted or logged. The canonical Customer phone is resolved and normalized in main.

Desktop generates a stable BusinessMessage id before remote submission and binds a SHA-256
intent fingerprint and provider account. A transaction claims submission and queues the
intent before HTTP. Concurrent/restarted/exact retries replay the same local record;
changed parameters conflict. Cloud does not provide a remote deduplication/query guarantee
for this operation, so a timeout/lost response/crash NEVER authorizes another POST for that
intent. Queued means unresolved; failed network results can still reconcile through a signed
status carrying `biz_opaque_callback_data`. A deliberate later message must be a new intent.
Duplicate provider references cannot attach to two local messages or mutate another intent.

Hosting receives GET verification and POST raw-body HMAC-SHA256 verification at
`api/whatsapp-webhook.php`. Verify token and Meta app secret are hosting environment secrets,
separate from the desktop access token and hosting sync credential. Missing secrets disable
the endpoint. Inbound conversations are discarded. Only sanitized outbound status metadata
enters a focused SQLite inbox, scoped by the hash of WABA + Phone Number ID. Sent maps to
accepted; delivered/read/failed map explicitly. A durable event hash de-duplicates retries.

The existing SyncCoordinator runs focused status pull when hosting advertises
`business_messaging_status_v1`. Local status writes commit before exact sequence ACK. Lost
ACKs replay safely; acknowledged payloads are cleared while hash receipts remain. There is
no order-queue overloading. Matching uses provider message id plus account binding; opaque
local callback can recover an unknown provider id for an already-submitted intent. Unknown
messages are safely ignored/acknowledged. Status updates cannot downgrade delivered/read
or turn those confirmed states into failure. Status reads remain behind the application
session gate. Structured desktop events contain operation ids, provider/status/result codes
only, never recipient, customer name, parameters, access token or raw webhook body.

No campaigns, segmentation, automated birthday conversion, inbound inbox, bots, template
editing, marketing scheduling, SMS or payment are introduced. Real Meta requests are absent
from portable verification. See `docs/architecture/business-messaging.md` for deployment
credentials, end-to-end activation and operational limits.

## D-036 — Campaign / Segmentation / Consent / Outbox foundation (D2)

**Status:** Accepted. **Scope:** Desktop-only marketing preparation; no dispatch.

Campaign is communication/marketing intent, separate from Customer, BusinessMessage and
provider request. Segment is a typed selection of canonical Customers, never a Customer
copy. Channel (`whatsapp`, future `sms`) describes communication semantics; provider
(`whatsapp_cloud` initially) describes transport. WhatsApp Web stays an interactive user
flow and is not a campaign provider. Purpose is only `marketing` in D2.

`customer_messaging_preferences` owns technical eligibility per Customer/channel/purpose,
with source, bounded note and recording/update timestamps. Absence means `unknown`.
Only explicit `opted_in` is marketing-eligible; `opted_out` is a hard block. This is not a
legal compliance guarantee. D1 single operational sends and existing WhatsApp Web/birthday
behavior do not acquire a retrospective marketing-consent gate. The canonical Customer
Workspace contributes an immediate preference operation, separate from profile draft save.
Customer deletion remains soft deletion: preference/history FKs preserve canonical identity,
and pending campaign intent is suppressed. Assigned foreign-business Customers cannot match;
existing unassigned local Customers belong to the current local business context.

Initial segment filters are a versioned conjunction of at most one rule each for canonical
Customer source (`eq`), commercial profile dealer status (`eq`: candidate/active/inactive),
and phone presence (`present`/`absent`). Empty rules match all non-deleted Customers. No
arbitrary field/operator, JS, expression, HTML or SQL is accepted. Presence and usable phone
are distinct. Backend evaluates the allowlist against the entire canonical set, independent
of dashboard's bounded Customer projection. Segmentation and messaging eligibility are
separate: preview returns only matched/eligible/unknown/opt-out/missing-contact counts and
creates no audience or outbox. Exclusive skip priority is opt-out, unknown, unusable phone.
Customer has no independent active flag today; non-deleted defines active canonical identity.
Dealer status is a segment criterion, not an additional eligibility gate.

Draft owns immutable-on-preparation template identity and typed parameter bindings:
`static_text`, `customer.fullName`, `commercial.companyName`. D1 approved discovery remains
the single template catalog. Prepare re-reads approval/language/support/parameter structure
and validates every eligible Customer's bound values; unsupported components and missing
values reject the whole operation. No second rendering engine is introduced. Approved
template metadata and binding definitions persist; resolved per-Customer parameter values,
phone/email and message body do not enter recipient/outbox snapshots.

Lifecycle is `draft → prepared`, `draft/prepared → cancelled`; `completed` is reserved for
D3. Drafts may be saved without available provider credentials; preparation requires an
available provider for the selected channel. One atomic SQLite transaction re-reads draft,
segment, current canonical contacts and consent, freezes every matched Customer identity,
records eligible recipients as `prepared` and ineligible recipients as `skipped` with reason,
creates eligible `pending` outbox, and marks campaign prepared. Any failure rolls everything
back. Repeating prepare returns the existing prepared state even offline. Later segment or
Customer changes never change frozen membership. Preparation counts record the original
decision; current skipped and pending counts reflect later suppression.

Outbox is provider-neutral durable intent with unique campaign/Customer/channel identity and
a stable SHA-256 operation key derived from that tuple. Recipients are unique per campaign/
Customer. D2 does not create BusinessMessage, claim pending rows, schedule, retry or send.
No Meta POST occurs on create/preview/prepare/cancel. The optional `messaging.campaigns`
capability depends only on `core.customers`, defaults OFF for every profile, and uses the
existing staged Business profile option transaction. It has no WhatsApp Web/Cloud dependency.
Provider availability is a separate prepare-time check. Consent remains owned by Customers.

Opt-out uses two safety layers: canonical preference mutation atomically marks pending
outbox/recipient skipped (also when consent becomes unknown); opt-in never resurrects them.
Canonical Customer deletion similarly suppresses pending rows. D3 must revalidate current
Customer/contact/explicit consent immediately before submission, including already claimed
rows. Audience is recipient intent, not durable authorization to send. Cancellation blocks
all pending rows without deleting membership/history. Claimed/in-flight behavior and dispatch
status extensions require D3's controlled dispatch decision.

D3 seam: pending outbox → controlled claim → create/attach authoritative D1 BusinessMessage
→ BusinessMessaging service/provider adapter → providerMessageId/status. Campaign recipient
is never a BusinessMessage. SMS may reuse this intent/outbox foundation with a future adapter.
No worker, rate limiter, scheduler, SMS adapter, inbound chat, template authoring, tracking,
analytics or web publication/API is part of D2. Desktop canonical storage and isolated,
session-gated preload/IPC remain the only campaign access path. Diagnostics log milestones,
counts and opaque campaign/segment ids, never Customer lists/contact/names, parameter values,
raw filters, bodies or secrets. Schema changes extend only current `db/schema.sql`; no
historical migration/compatibility upgrade chain is added.

## D-037 — Controlled Campaign Dispatch (D3)

**Status:** Accepted. **Scope:** Explicitly started desktop campaigns; no date scheduler or real-provider verification calls.

CampaignDispatchService owns background orchestration separately from the campaign store and
SyncCoordinator. Stores perform only canonical SQLite operations. The transport seam delegates
to BusinessMessagingService and D1's WhatsAppCloudProviderAdapter, never Graph code in the worker.
An optional, provider-neutral `messaging.campaigns` capability remains OFF by default. Start/resume
require enabled, configured provider credentials and current approved template metadata.

Lifecycle is draft → prepared → running ↔ paused; running → completed when every local outbox
intent is dispatched/skipped/failed/cancelled. Draft/prepared/running/paused may be cancelled.
Provider acceptance does not mean delivery/read or success for all audience members. Outbox
dispatched means POST acceptance; D1 signed webhooks continue to update BusinessMessage delivery
independently, including delivery failure, without resetting campaign transport or retrying it.
Prepared membership stays frozen. Pause stops new claims/submissions; existing HTTP finishes.
Cancel terminalizes certainly unsent pending/claimed items and preserves in-flight submission
until its response. An unresolved submitted item is failed with submission_uncertain, never
misrepresented as certainly unsent cancellation. Existing in-flight acceptance is reconciled.

BEGIN IMMEDIATE atomically claims due pending intents belonging to running campaigns, ordered
by nextAttemptAt, createdAt, opaque id, in bounded batches. Each lease has a random fencing token
and claimedAt. Completion checks also occur transactionally. Expired leases are recovered without
resetting the separate durable BusinessMessage submission fence; token-qualified writes prevent
a stale worker overwriting a newer lease. Recovery uses any existing acceptance receipt first.

Immediately after template discovery yields, backend rechecks capability, running state, account,
canonical non-deleted business Customer, usable current phone and explicit whatsapp/marketing
opted_in. Unknown/opt-out/deletion/unusable contact are skipped. Preparation is not permission to
send. Static text and the D-036 field allowlist resolve against current canonical Customer data;
missing/unsupported/changed template component identity or binding is non-retryable failed.
Resolved values never enter diagnostics, recipient snapshots or outbox. A transaction attaches
exactly one canonical BusinessMessage (purpose marketing, campaign and recipient relationships)
to an outbox intent and claims its submission before POST. Final failure also terminalizes its canonical message; suppression/cancel terminalizes a
certainly unsent marketing draft without changing operational-message semantics. D1 interactive send cannot send a
campaign BusinessMessage through its single-send IPC. D1 operational and WhatsApp Web semantics
remain independent of marketing consent.

Internal configurable defaults are batch 3, minimum submission interval 3 seconds, maximum 4
attempts, lease 5 minutes, polling 15 seconds, transient backoff 5 seconds, throttling backoff
60 seconds, exponential cap 15 minutes. They are conservative implementation policy, not claimed
Meta limits. The business-scoped next submission permit and each row's nextAttemptAt persist in
SQLite; timers only wake the single-flight worker. Numeric/date Retry-After is respected up to
24 hours and extends the shared rate gate. Deferral for rate/pause/drain does not consume attempts.
Running work resumes after restart/session unlock. Shutdown and maintenance stop new claims and
drain in-flight work before database teardown. Confirmed reset/restore drains before its safety
backup, even without a configured hosting runtime; abort resumes the worker. Development
relaunch preserves before-quit draining, and diagnostic finalization follows worker receipt writes.

**Crash/idempotency boundary:** Cloud's POST does not offer a deduplication/query guarantee in
D1. Exactly-once remote transport cannot be promised. A structured provider error proving the
request was rejected permits throttling/transient retry with the SAME BusinessMessage identity,
resetting only its submission fence. Such certainly rejected, unsubmitted retries resolve current
contact/bindings again. Permanent rejection fails. Read-only catalog network/timeout failures
may retry safely. A POST timeout/network loss/malformed result, or a crash after POST before
receipt persistence, is submission_uncertain: durable retry performs receipt/webhook reconciliation
ONLY, never another POST. After bounded reconciliation attempts it fails explicitly. If acceptance
was saved to BusinessMessage before an outbox-update crash, recovery marks dispatched without POST.
An uncertain intent keeps its fence even after failure/opt-out; a later signed status can update
BusinessMessage. This deliberately prioritizes avoiding duplicate sends over blindly resubmitting
an uncertain transport. No provider-safe idempotency capability is invented.

Message/binding refresh and proven-rejection release are owned by the canonical
Business Messaging store (`refreshUnsubmittedBusinessMessageInTransaction` and
`releaseRejectedBusinessMessageInTransaction`). Campaign adapters pass their existing
transaction and retain lease validation; they never implement message/binding UPDATEs.
Refresh requires an unsubmitted draft bound to the same account. Release requires a
queued, submitted intent with no acceptance/delivery/read evidence. Terminal states and
uncertainty fences cannot be reopened by campaign retry or lease recovery.

Preference/deletion suppression affects only certainly unsent pending records. Submitted records
retain their acceptance/reconciliation history; an opt-out cannot undo an already in-flight POST.
Every future actual submission must still pass current consent, including reclaimed and retry items.
Diagnostics contain stable dispatch milestones, opaque campaign/outbox/BusinessMessage ids, counts
and bounded error categories only, never phone/name/body/parameters/customer-id lists/secrets.
Desktop canonical storage remains authoritative; no web recipient publication, SMS, scheduled
campaign, inbound chat, analytics or independent Settings/retry subsystem is introduced.

## D-038 — Marketing studio, channel publications and reusable media

**Status:** Accepted. **Scope:** D4; Website is the first executable publish adapter.

MarketingContent is editorial intent, separate from Campaign (D-036/D-037 audience,
consent and controlled delivery), Publication (a channel instance), MediaAsset and
provider requests. `marketing.studio` is provider-neutral, optional and default OFF
for every profile. Pazarlama reuses the existing campaign workspace and operations;
`messaging.campaigns` still gates those operations independently.

Content owns master text and independent typed website/whatsapp/sms/instagram
variants. Saving a variant never overwrites another channel. One canonical Content
editor serves all entry points. Content archive does not silently unpublish an
existing instance; archived content cannot create or publish new instances.

MediaAsset owns immutable validated image files under userData/assets/marketing/files,
SQLite metadata and opaque storage references. Content/publication relations own
ordering, never binary/base64. Uploads and generated images enter the same library.
Ephemeral resized IPC previews are projections. Assets may be reused. Archive hides
an asset from new selections and preserves existing references. Physical deletion
is refused while any content/publication or acknowledged live snapshot references
it, including every in-flight intent and pending removal/unpublish awaiting ack. No silent deletion of live media.

AI capabilities are text_generation, rewrite, channel_adaptation and image_generation.
The resolver uses existing saved AI service profiles and safeStorage credentials,
preferring the selected configured service then capable configured alternatives.
Provider-specific image endpoints/model support stay inside ai-core adapters.
Unavailable capabilities are disabled gracefully. AI output is an explicit candidate:
text is applied only after user acceptance; generated images are kept/deleted/attached
through the canonical library. Neither action creates/publishes a publication.
Marketing AI does not assemble customer/recipient context or send request bodies or
credential data. Inputs are editorial/business context only; obvious contact/identity
tokens are removed. Customer names are read locally only as a redaction vocabulary,
which never enters provider requests. Raw prompts, full generated bodies and
binary data are never diagnostic metadata. Image metadata contains only provider/model
ids and a fixed generation intent, no raw prompt.

MarketingChannel is not Provider. The static typed registry owns text/media limits,
configuration state, edit/unpublish/publish/test capabilities. Website uses the
existing Web Module URL and sync secret, without another secret or persistence path.
WhatsApp Business keeps the D1 Settings card and configuration ownership. SMS and
Instagram stay safe planned channels with no generic credential form; D5 will own
adapter-specific config and safeStorage writes. Settings never returns AI or social
provider secrets. Website settings reuse the existing staged Services fields;
connection tests are explicit operational actions using saved connection config.

Publication owns an explicit editable text/title/media snapshot and `homepage_feature`
placement. Its intent revision increases on every edit/state change; `publishedRevision`
advances only on matching web acknowledgement. Master/variant edits do not mutate
live instances. Live edits queue a new revision, keeping the last acknowledged snapshot
and its media guarded until ack. Unpublish is also a revisioned tombstone. A failed
attempt retains the durable intent and retries using the existing sync outbox.

Marketing capability OFF means the feature is out of use, not merely read-only.
It atomically invalidates the Website aggregate and publishes a newer ordered
`enabled:false, publications:[]` projection. Web visibility is owned by that
projection alone; there is no independent Android-manifest marketing gate.
Editorial `desired_published` and instance revisions are retained. Capability ON
invalidates the aggregate again and restores retained Website publication intent
through the normal media preparation/publication/exact-ack lifecycle. Withdrawal
does not falsely acknowledge editorial instances as published or unpublished.
Remote visibility changes after hosting accepts the withdrawal; offline Desktop
retains the durable job and cannot synchronously revoke a remote disconnected site.

Explicit user publication actions request a forced cycle even when passive auto-sync
is disabled; failures retain the same durable job. Desktop is authoritative. Existing sync coordinator, durable outbox, monotonic source
revision ledger, idempotency receipt and ack semantics carry a sanitized aggregate
projection (opaque publication/image ids, public text, local public image URLs and
ordered dimensions/alt text). Web is never a canonical Content store. Media uploads
reuse streaming multipart transport; deterministic asset hash paths allow retries and
site changes without persisting target-specific remote URLs. Web projection validation
and escaped responsive rendering expose only published instances. A generic embeddable
Duyurular / Kampanyalar surface and a standalone public page work for any website.

D5 owns real WhatsApp/SMS/Instagram publication adapters. No scheduling, autonomous
posting, analytics, inbox, social accounts or video is introduced by D4.


D4 image adapter references: [OpenAI Image API](https://developers.openai.com/api/docs/guides/image-generation)
and [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation).
OpenAI configured profiles use the Images endpoint (gpt-image-1 default or explicit
saved gpt-image model); Gemini/custom image support requires a matching saved image
model. Other profiles remain safely unavailable for image generation until an adapter
exists. This is a capability assertion, not proof of provider account quota/permission.

## D-038.1 — Host-owned website navigation and demo showcase (D4.1)

Numbering note: this D4.1 entry was originally D-039 at baseline `2243e368`. D-039 now names the explicitly requested D5 decision.

**Status:** Superseded in part. **Scope:** Website navigation ownership; personal Alwaysdata showcase.

Desktop does **not** own customer website page visibility or ordering. Customer websites may expose different
routes, information architecture and navigation order, so no page registry or `website_navigation` projection
crosses the Desktop/Web boundary. Desktop publishes canonical capabilities and content/publication state only;
each host decides which routes exist and derives visibility from the relevant capability/publication state.

The Alwaysdata root remains a personal showcase/workspace and owns its own fixed navigation registry locally.
Its optional sections appear only when their corresponding published capability/content is available. Installation
and guide routes are showcase-specific and never become a generic customer-site contract. Only the showcase root
and installation PHP surfaces may read and display that installation's configured sync secret.

Business operations, marketing D4 contracts and existing catalog/store routes remain unchanged.


## D-039 — Multi-channel Marketing Publishing (D5)

**Status:** Accepted. **Scope:** Website, WhatsApp Cloud, İleti Merkezi SMS and Instagram Login single-image publishing.

Channel identity (`website`, `whatsapp`, `sms`, `instagram`) remains independent of
transport provider (`website`, `whatsapp_cloud`, `iletimerkezi`, `instagram_api`). The
static typed MarketingChannelRegistry reports family, service availability, media bounds,
audience/consent requirements and actual publish/edit/unpublish/test capabilities.

Two families have distinct authoritative entities:

- **Audience delivery:** WhatsApp and SMS reuse D-036 Campaign/Segment/Recipient/Consent
  and D-037 Outbox/BusinessMessage. The Studio links content ID/revision to a canonical
  campaign draft and opens the existing Campaign editor. Preparation freezes membership;
  only an explicit Start/Resume starts the existing controlled worker.
- **Public publishing:** Website keeps D-038 revision/sync acknowledgement ownership.
  Instagram uses one canonical MarketingPublication plus provider-specific container and
  submission state. No audience campaign or provider-specific message/publication copy is created.

WhatsApp's editorial/AI variant is a reference draft. Arbitrary free text never becomes
a Cloud marketing send: approved template catalog, supported binding contract, canonical
Customer and current WhatsApp marketing consent remain authoritative D1–D3 checks.

SMS uses the same customer/channel/purpose preference resource, independently from
WhatsApp. Default `unknown` and `opted_out` block preparation and final submission.
Eligibility uses current non-deleted business Customer and current usable phone. SMS text
is an immutable, validated campaign snapshot (first version: 160 characters, plain text,
no HTML/images). Studio-linked text must equal the saved SMS variant at the cited revision.
Recipient lists are never sent during preview/preparation. The adapter receives one
current recipient only after the D3 lease, consent guard and durable submission fence commit.
No second message table or dispatch scheduler is introduced.

İleti Merkezi HTTP/JSON is isolated in IletiMerkeziSmsProviderAdapter. Connection test
uses side-effect-free `get-balance` and `get-sender`. Successful sends retain the order ID
in canonical BusinessMessage.providerMessageId; `getDeliveryReport` normalizes single
recipient order status. API key/hash use main-process safeStorage with insecure Linux
`basic_text` rejected. Settings reads expose only presence flags; sender is non-secret.
Marketing requests always use `iys="1"` plus the explicitly selected BIREYSEL/TACIR list.
Provider İYS errors normalize to `iys_rejected`; they never overwrite local consent.
Operator/opt-out suffixes remain provider-owned. Full İYS reconciliation is deferred.

Instagram uses Modern Meta Instagram API with Instagram Login on `graph.instagram.com`,
professional Business/Creator accounts and `instagram_business_basic` /
`instagram_business_content_publish`. No Facebook Page is required. A manual user token
and account ID form the foundation; token storage remains main-process safeStorage and
can later be owned by OAuth without changing publication or renderer ownership. API
version is centrally defined. Connection test verifies the token's own account profile.
Renderer never calls Graph. Edit/unpublish capabilities are false.

Studio selects one Instagram asset independently of Website's ordered multi-image gallery.
Canonical PNG MediaAsset files stay on Desktop. An ephemeral JPEG (320–1440 px wide,
4:5–1.91:1 aspect, <=8 MiB) strips metadata before authenticated multipart upload to
`instagram-media.php`. The hosting stage stores only expiring transport bytes under the
existing protected data directory, addressed by a 256-bit random capability and hashed
at rest. Public GET accepts only an exact JPEG capability path, no query, filename or
listing. Server enforces JPEG signature/MIME, dimensions, size, <=20-minute TTL, immutable
replay and expiry on every read. Authenticated deletion is idempotent. Staging is not a
MediaAsset store; no Customer metadata is uploaded. Hosting access logs must omit/redact
this capability route as described in `docs/architecture/multi-channel-marketing.md`.

**Crash / idempotency:** audience channels keep D3 outbox operation keys, one attached
BusinessMessage and a submission fence before POST. Proven provider rejection can reopen
that same local intent for existing backoff; uncertain responses never reopen the fence.
Provider acceptance is persisted before outbox completion. İleti Merkezi duplicate-order
code 451 is treated as uncertain, never as permission to resend.

Instagram commits a stable publication snapshot, account identity and stage capability
before upload; it commits `create_submitted` before container POST and the returned
container ID before any publish POST. `publish_submitted` commits before media_publish.
Explicit structured rejection permits an explicit safe retry of that phase. A lost create
response leaves an unrecoverable unknown container: no automatic or repeated create.
A lost publish response permits container status reads only; `PUBLISHED` confirms success
without inventing a provider media ID/permalink. `FINISHED` does not prove rejection of a
prior publish and never reopens its fence. Known receipt commits before optional permalink
read and cleanup. In-progress containers continue only through user action. Local edits
do not edit/repost a provider post; a new post is an explicit new publication.
Exactly-once remote delivery cannot be guaranteed. The conservative approach may leave
an unsent/unknown intent after a crash; it prioritizes preventing duplicate posts/sends.

Settings fields join the existing Services category ownership/save/discard contribution
model. Toggles are independent; closed card bodies are hidden. Marketing uses only active,
configured services. Unified Publications projects canonical public publications and
campaign progress directly without duplicate underlying records. AI prepares variants and
assets only; it never prepares recipients, dispatches or publishes autonomously.

Portable verification mocks real providers and exercises actual SQLite, PHP staging,
Electron image conversion and browser flows. Live provider calls are excluded. Carousel,
Reel/Story, Facebook, inbound SMS/social inbox, scheduling/calendar, analytics, full İYS
reconciliation, OAuth wizard, multiple accounts/providers remain outside D5.

## D-040 — Marketing Calendar / Scheduling / Time-based Automation (D6)

**Status:** Accepted. **Scope:** Desktop time-based scheduling; no new providers.

MarketingSchedule is a separate durable time intent, not Campaign, MarketingContent,
Publication or a provider request. MarketingScheduleExecution is the durable occurrence
ledger. The neutral scheduler claims time intents and delegates to a focused application
boundary; it never selects recipients, copies media bytes, posts to providers, prepares
campaigns, generates AI content or manages provider retries.

| Channel | Canonical target | One-shot | Recurring |
| --- | --- | --- | --- |
| WhatsApp | Prepared D2 campaign → D3 start | Yes | No |
| SMS | Prepared D2 campaign → D3 start | Yes | No |
| Website | Ready canonical publication revision → D4 publish/update + sync outbox | Yes | Yes |
| Instagram | Ready canonical publication revision → D5 single-image publication | Yes | Yes |

Audience schedules require a prepared campaign at creation and recheck it at execution.
A paused/cancelled/not-prepared target is skipped; a disabled/unconfigured channel fails.
The scheduler never resumes a user-paused campaign automatically. Campaign pause and
schedule pause are independent. D3 still owns consent, contact/template validation,
submission fences, provider backoff and delivery. One active/paused schedule per campaign
prevents competing start plans. Recurring audience delivery is deliberately rejected.

**Frozen revision:** publication revisions are canonical immutable editorial snapshots in
`marketing_publication_revisions`, including content revision and references to canonical
MediaAsset IDs. Schedules store only revision references, not content/media copies.
Content/publication edits leave schedules unchanged; the canonical Schedule workspace's
explicit “Planı güncelle” plus Save rebinds the selected current publication revision.
Referenced media are guarded against deletion for active/paused/in-flight plans.
Website applies the frozen snapshot to its canonical publication and queues the existing
revisioned publish/update path. Instagram creates one new canonical publication intent per
occurrence; the occurrence's intent is frozen and linked atomically before any remote work.
The source draft remains an editorial source, and recurring runs do not reuse a published
Instagram record as a new remote post. Archiving content retains existing D4/D5 rejection.

**Recurrence:** only typed daily/weekly/monthly rules. Interval 1–365, ISO weekdays 1–7,
monthly day 1–31 and local time HH:mm. No renderer cron. startsAt is a lower bound and
calendar anchor. Weekly interval uses the anchor's Monday week; daily uses the anchor
calendar date; monthly uses the anchor month. The first occurrence must match the rule.
Short months clamp day 29/30/31 to the last day rather than omit a month. Subsequent
occurrences keep the original rule's day. Evaluation seeks near the requested date;
it never enumerates a missed backlog.

**Timezone/DST:** a valid named IANA timezone is explicit and persisted. The default is
the local system timezone at creation (there is no independent business timezone setting).
Changing the OS timezone does not change saved plans. Explicit plan edits can change it.
The original local start is also retained so a DST gap does not silently alter form intent.
All persisted instants are UTC ISO timestamps; recurrence is wall-clock calendar arithmetic
in the saved timezone. Folds use the first instant; gaps shift by the transition's gap,
matching [Temporal compatible disambiguation](https://tc39.es/proposal-temporal/docs/timezone.html).
Calendar month projection uses the current local timezone, labels retain each plan's timezone.

**Missed runs:** default `run_once_when_resumed`, alternative `skip`. A lateness tolerance
of 60 seconds distinguishes normal bounded timer jitter from a missed run. Startup, unlock,
OS wake, forward clock changes and schedule resume all consult the persisted earliest
unconsumed nextRunAt. A recovery consumes at most one catch-up occurrence per plan;
nextRunAt advances strictly past now and the consumed instant. Skip records one skipped
ledger entry for the collapsed missed range. No backlog burst. Pausing retains that earliest
instant, so Resume can apply the selected policy. Backward clock changes cannot consume
an occurrence again: nextRunAt and the unique ledger remain ahead of the consumed instant.

**Idempotency/crash:** occurrenceKey = scheduleId + planned UTC instant, unique under
(scheduleId, occurrenceKey). Claim, occurrence insertion and nextRunAt advance are one
transaction. D3 start and the execution's accepted campaign reference commit together.
Website frozen intent, sync job and execution reference commit together. Instagram new
canonical intent and execution reference commit together, then D5's existing create/publish
submission fences and receipts protect remote effects. Recovery reuses these references.
Scheduler success means durable canonical acceptance for D3/Website, confirmed publication
for Instagram. It does not claim remote exactly-once delivery, consent or sync acknowledgement.
Instagram processing continues through the existing D5 status path on the same intent at
bounded wakes; rejected/uncertain actions become failures with no scheduler provider retry.
Provider rejection recovery remains an explicit D5 action on the result publication.

**Lifecycle:** single-flight, bounded 15-second wake hints and DB authority. Startup reclaims
previous-runtime claims only; no expiry steals a live action. Shutdown/maintenance stop new
claims and drain scheduler before draining D3/D5/sync or replacing DB/files. Session lock
and marketing capability gate background work. Pause stops new claims without aborting
in-flight actions; Cancel removes future occurrences, preserving target lifecycle. Schedule
edits are blocked while an execution is pending/claimed. Terminal schedules cannot be
edited/resumed; users create a new plan. Failures and skipped results are visible in Takvim
and structured diagnostics with only IDs, channel, revisions and bounded safe outcome codes.

The calendar is a projection and the inline Plan workspace is the sole schedule editor;
Studio, Publications and Campaigns converge on it without nested dialogs. Existing Page /
Entity Workspace / Operation and Appearance v2 ownership remain intact. Event/birthday/
stock triggers, AI autonomous generation/publish, analytics, cron editor, inbox and push
notifications are outside D6.

## D-041 — Unified Marketing Analytics (D7)

**Status:** Accepted. **Scope:** Read-only Desktop marketing analytics across Website,
WhatsApp, SMS and Instagram.

MarketingAnalytics is a derived projection, not Campaign, Publication, BusinessMessage
or a provider response. `MarketingAnalyticsService` aggregates canonical operational
records and optional genuinely supported provider read-only observations through
normalized typed metrics. It does not mutate source-of-truth entities or change D3
completion, D4/D5 publication semantics or D6 scheduling.

Provider-specific names stay inside main-process adapters. Numeric zero and unavailable
are distinct; missing data, unsupported metric, absent configuration, unverified or
insufficient permission and refresh failure have explicit typed states. WhatsApp uses
canonical webhook delivery/read evidence, SMS uses existing İleti Merkezi reconciliation,
Website uses acknowledged publication state and never invents visitor/traffic metrics.
Instagram publishing counts are local; D5 basic/publishing credentials do not prove
Insights access, so no production metrics polling is activated without a verified adapter.

Backend owns calendar-date filtering and timezone boundaries. Overview is a selected
preparation/creation cohort's current outcomes, not event-time or historical reconstruction;
active Website count is global current confirmed state. Campaign/publication detail covers
the entity lifetime. Optional provider post observations are lifetime values; reach is
not summed between posts or represented as engagement within the selected date interval.

External snapshots alone may be persisted separately: normalized numbers, bounded rows,
TTL, opaque target/account identity, measurement time and explicit rate-limited refresh.
Failed refresh preserves the last observation and freshness information. Renderer opening
never causes a provider metrics request. Analytics payloads/logs contain no Customer PII,
content, parameters, secrets or raw provider responses. Analytics details join canonical
workspaces; no duplicate entity editor, operation, tracker or nested modal is introduced.

See `docs/architecture/unified-marketing-analytics.md` for the metric matrix, precise
cohort/rate definitions, optional capability/cache contract and portable test coverage.

## D-042 — KBS submission uncertainty is a durable no-resubmit fence

**Status:** Accepted for the explicitly requested runtime hardening. No verified native
provider idempotency/query guarantee exists in the current adapter contract. EGM performs
only session inspection; Jandarma's live SOAP binding is still unverified, and its success
classifier returns no remote receipt. `notificationId` is the stable logical delivery id;
it is not represented as an unsupported provider idempotency key.

`KbsDeliveryService.deliver` is the manual and background submission authority. An enabled,
configured notification atomically commits `pending/failed → submission_unknown` before
adapter I/O. No local transaction spans network work. The same primary notification id and
conditional state write fence concurrent connections, replay and restarts without a lease
expiry. `submission_unknown` means in-flight OR possibly submitted; it never claims sent.

Provider success atomically writes sent/reference/time. Waiting/interaction-required
adapter results promise no submission and return to pending; only explicit rejection
evidence permits failed/retry. Exceptions and unsuccessful responses without verified
rejection evidence stay unknown. Existing Jandarma failure codes alone do not establish
absence of remote effects. Local result persistence failure leaves the pre-I/O fence
intact, including after provider success; a retry must never clear it.

Unknown delivery is surfaced for manual reconciliation using the existing externally-sent
operation after checking the official provider record. There is no new automatic retry,
new notification identity, or force-reset operation. Unknown identity snapshots remain
frozen. This chooses avoiding blind duplicate submission over at-least-once delivery:
crash before actual send can leave an unsent fenced notification needing operator review.
Provider-native exactly-once semantics, lost receipts after local write failure and a
future verified negative-reconciliation/resubmit operation remain explicit limitations.
Configuration, notification creation, provider automation and other hospitality operations
are unchanged. Current schema only; no migration or backward compatibility is introduced.
