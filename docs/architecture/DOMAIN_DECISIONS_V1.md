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
