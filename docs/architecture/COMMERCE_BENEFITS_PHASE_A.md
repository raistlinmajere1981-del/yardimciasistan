# İndirim ve Puan — Phase A integration contract

Status: local canonical foundation; no checkout, IPC, HTTP, publication or device
integration is activated by this phase. Current-schema-only, no migrations.

## Owners and money

`packages/shared/types/pricing-benefits.ts` owns transport-neutral types, re-exported
through `commerce.ts`. `commerce-benefits-engine.ts` owns the pure calculation.
`commerce-benefits-rules.ts` owns versioned rule validation, persisted capability
and family gates, secret handling and the synchronous transaction boundary.
`commerce-benefits-points.ts` contains internal ledger/lot primitives.
`CommerceBenefitsStore` owns preview/reserve/settle/release/reverse and operation receipts.

`commerce.benefits` requires Catalog, Customers and **either Sales or Orders**. It is
an optional root, default OFF for all profiles; the pure Pension profile does not
expose it or acquire Sales. Family flags start OFF independently. The only renderer
change is the existing Business Features label, “İndirim ve Puan”.

The existing price owner must resolve retail/dealer eligibility and product prices
before this engine runs. Currency and its exponent come from the money owner.
Amounts are safe integer minor units, quantities integer ten-thousandths, percentages
basis points. Quantities and percentages round half-up using BigInt intermediates.
Discount allocation uses largest remainders with stable line-ID ties.

Order: resolved items → selected coupons → confirmed payment-method modifier →
explicit tax/finance adjustments → Puan tender → cash payable. Earning is a
projection until actual paid settlement; rules explicitly choose the item base
before/after Puan and whether accounting adjustments enter the earning base.
Puan tender is not `discountMinor`. For the approved example (exponent 2):
`100000 - 10000 - 4500 - 10000 = 75500`, paid earning at 250 bps = `1888`.

Rules specify dates [start,end), currency, channel, customer/group/price group,
item/category inclusions/exclusions, eligible remaining-base minimum, cap,
percent plus fixed on the same base, priority and combination permissions.
All benefit amounts are capped at their eligible base. Higher priority then stable
rule ID selects one payment rule and one earn/redeem rule respectively. Coupons
must all explicitly allow multiple-coupon stacking; cross-family combinations
require permission in both rules. Incompatible selected coupons/payment/redemption
reject the quote; incompatible earning is ineligible. No tax rate is inferred.

## Parent operation and exact receipts (Phase B)

The required `CommerceBenefitsParentPorts` are server-only synchronous adapters:

- `authorize` verifies actor/device/channel and canonical tenant/customer/source access.
- `authorizePointAdjustment` verifies staff/maintenance permission.
- `resolvePricing` calls existing catalog/dealer and payment owners using the supplied
  database connection. It returns current prices, customer groups, explicit
  accounting adjustments and confirmed canonical payment method. No renderer quote
  or client customer/dealer identity may populate this result without authorization.
- `readSettlement` reads the parent's actual persisted paid state, tenant/customer,
  source identity, currency, item/discount/accounting totals, Puan tender and cash
  received. Open/pending/credit/unpaid fulfillment cannot grant or consume Puan.
- `readFullRefund` reads the confirmed full refund in the same parent transaction.

The source is the single canonical paid transaction (`sale`, `commerce_order` or `table_order`), not
an outbox action, web request or provisional order. Order fulfillment must refer to
its resulting sale; all transports reuse that same source. Never represent the
same settlement a second time with another source kind/ID.

Call `withCommerceBenefitsTransaction(database, serverNow, tx => ...)` **instead of**
opening another parent transaction. It owns `BEGIN IMMEDIATE` and the final commit;
the parent writes existing sale/stock/finance/customer ledgers/outbox through
`tx.database`. No awaits, nested BEGIN, internal COMMIT or external I/O. A benefits
writer failure poisons the outer operation even if the caller catches the error.
Every parent side effect rolls back together on failure.

The authoritative key (at least 32 random bytes) is injected, never embedded in
source or stored as a coupon. Phase B must persist it using the existing protected
server configuration owner; rotating it requires explicit code/receipt-key lifecycle
work. Coupon issuance generates 160-bit secrets, returned once. Only purpose/tenant
bound HMACs persist. Rules/projections/receipts never contain codes or code digests.

For codes, call `authorizeCouponAttempt` **before** the parent transaction using a
server-derived principal, then pass its short-lived intent-bound authorization ID
to preview/reserve. Malformed, invalid and exhausted attempts consume durable actor
and tenant rate limits even when checkout fails. No raw secrets in logs or outbox.
Anonymous use requires a code with no per-customer limit; otherwise Customer is
required. Rate limits are fixed-minute 20/actor and 1000/tenant; remote ingress must
also bound unauthenticated traffic and derive principals itself.

`reserve(tx, intent, operationKey, authorizationId?)` returns exactly
`{ version: 1, reservationId, expiresAt, quote }`. The lifetime is at most five
minutes and is shortened to coupon/rule/point-lot expiry. Holds count against code
limits and available Puan. The parent must compare the returned quote with any UI
expectation before committing financial effects. Client quotes authorize nothing.

`settle(tx, businessId, reservationId, operationKey)` recalculates current authorized
prices, rules, payment method and availability, excluding only its own Puan hold.
Changed quote/rule version/method rejects. After matching paid evidence it records
immutable applied context/rules and returns exactly
`{ version: 1, snapshotId, reservationId, source, quote, pointSpendEntryId, pointGrantEntryId }`.
The same operation key and intent replay that stored receipt; changed intent
rejects. Snapshot/source uniqueness prevents another action/channel granting again.
`release` releases holds idempotently; expired holds stop counting immediately.

Positive ledger entries are FIFO lots. Holds/consumption allocations prevent double
spend. Expired lots are immediately unavailable; `expirePoints` materializes immutable
expiry debits. Manual corrections have staff authorization and exact receipts.
Full reversal is once per snapshot and requires parent refund evidence. Spent Puan
returns with original lot expiry; expired Puan is not revived. Coupon usage remains
consumed. If earned Puan has since been spent or reserved, full reversal rejects
atomically (`BENEFITS_EARNED_POINTS_ALREADY_USED`); Phase A never invents negative
balances or partial-refund policy. Partial refunds are outside this foundation.

The remaining Phase B work is to supply these real parent adapters, wire the
existing sale/table/order/finance transactions and existing Marketing/commerce/
Customer overlays, and provide the established top-bar feedback. Foundation tests
use explicit test-only SQLite parent adapters, not a claim of production integration.

## Phase B2a — canonical Desktop fast-sale backend slice

`market-sale-operation.ts` now uses `withCommerceBenefitsTransaction` as its
outer transaction owner. Its existing operation receipt and phone-draft sale link
still own replay/source uniqueness. Calls without an explicit `benefits` command
keep the existing paid/credit/tender behavior, with no benefit or secure-key work.
Enabling the capability alone does not automatically enroll existing checkouts.

The optional command is `{ requestedPointsMinor, expectedQuote }`. The canonical
`commerce:sale:completeMarket` IPC derives the local owner from the trusted main
renderer and unlocked session, and injects the existing protected key owner.
It never accepts an actor, tenant, source identity, price group or key from JSON.
Key storage I/O finishes **before** BEGIN IMMEDIATE; capability/customer/actor
checks, current retail/dealer prices and canonical cash/card/bank/other mapping
are checked again inside the transaction. `transfer` maps to `bank`.

`market-sale-benefits.ts` supplies the real server-only parent ports. The parent
allocates a canonical sale ID before reservation; the sale writer resolves current prices,
checks the quote expectation, and writes sale/items/stock and paid tender evidence.
`commerce_sale_settlements` is parent-owned immutable evidence binding the sale,
business, customer, payment method, cash received and Puan tender. Sale `total`
remains subtotal minus discounts **before Puan tender**. Finance reads this
evidence and records only cash received, including on explicit re-projection;
all-Puan payment creates no cash income. No parallel finance or customer ledger
is introduced. The existing stock publication triggers remain the outbox owner.

Reserve, sale/stock/finance/outbox writes, settlement against persisted paid
evidence, Puan spend/grant/snapshot and source receipt commit in one synchronous
BEGIN IMMEDIATE transaction. Any failure rolls all database effects back. A sale
receipt replay returns the stored exact benefits settlement receipt without
repricing, reserving or granting again. A changed command rejects.

This slice accepts only explicit fully paid settlement with `paymentAmountMinor`
equal to the authoritative quote's cash payable. Credit, partial payment, old-debt
overpayment, manual discounts alongside benefits and coupon fields reject.
Anonymous paid sales cannot earn or spend Puan. Mixed per-product dealer fallback
price groups reject until an explicit scope policy is supplied. Currency exponent
2 follows the current Commerce/Finance money owner; no currency-specific rate or
tax is inferred. No customer-group membership owner currently supplies groups.

Focused proof: `npm run verify:check -- market-sale-benefits` compiles current
sale/price/stock/finance/benefits source into temporary modules and uses disposable
SQLite with the canonical schema. It covers real paid settlement, exact replay,
source uniqueness, disabled legacy behavior, dealer pricing, authorization and
payment rejection, injected rollback failures and two concurrent sale writers.

## Phase B2b-1 — Desktop Market Quick Sale

The existing Quick Sale session/workspace now has an explicit “İndirim ve Puan”
selection. A key-free availability projection gates it by persisted capabilities
and family flags. The same trusted main-frame/unlocked-owner guard protects state,
preview and settlement. `commerce:sale:previewBenefits` accepts only bounded intent
fields, never tenant, source, actor, authority, price or price-group fields. It uses
B2a's canonical pricing/parent ports and `CommerceBenefitsStore.preview` in a minimal
synchronous transaction. No-code preview writes nothing; coupon preview writes only
its independent attempt counters/short-lived permit. No preview creates point holds,
grants, sale, stock or finance effects; its authority remains `preview_only`.

The operation ID derives a stable bounded canonical sale source for preview and
reserve. The optional sale command adds `couponCode` as transient local input.
Before the outer sale BEGIN, trusted main loads the protected key and calls
`authorizeCouponAttempt` with the local owner principal and exact intent/source.
The authorization ID reaches `reserve`. Invalid attempts survive later rollback.
New operations with disabled relevant families fail before key loading. Exact
persisted replays bypass new coupon attempts, including after coupon/family disable;
they still require the current root capability and owner authorization. The parent
receipt fingerprints coupon-bearing commands with a purpose-bound HMAC; plaintext
codes and code hashes never enter previews, receipts, rules, history or outboxes.
No-code B2a request fingerprints retain their existing representation.

Cart, customer, method, points, coupon and pricing changes invalidate the displayed
preview. Renderer money work is presentation/input parsing; the server quote owns
amounts and is rechecked in the sale transaction. Manual discounts, credit, orders,
partial tender and old-debt collection retain their legacy path without benefits.
With benefits selected these incompatible combinations are disabled/explained.
Confirmed receipt feedback uses the existing top-bar status. Coupon input lives in
workspace memory only and clears after success. On uncertain IPC response the exact
pending payload/operation survives workspace unmount, blocks edits and is retried
through the existing sale IPC; only its explicit rejection envelope proves rollback.
Post-commit projection/notification failures stay thrown uncertain responses, even
when their error resembles a domain rejection.
This memory lifetime does not provide recovery across application termination.

Focused checks: `market-sale-benefits-preview` covers real percent coupon + bank
modifier + earned/redeemed points (75500 cash, 10000 Puan tender, 1888 earned), no
secret persistence, read-only preview, durable failure limits, scope/price changes,
exact replay and the actual preload/main IPC chain. The existing A/B1/B2a checks
remain separate. `market-sale-benefits-ui` exercises the real workspace against the
same disposable SQLite owner. Browser execution requires local socket/Chromium
permissions; it has not passed in the restricted implementation environment.

**Remaining after B2b-2:** the table parent adapter (implemented below in B2b-3
using the canonical table_order source), confirmed full-refund evidence and reversal integration. The B1 management snapshot's
`checkoutIntegrated: false` is not an authority signal for this bounded Quick Sale
flow; its availability/quote come from the dedicated guarded APIs. No Web, Dealer
or Companion benefits confirmation is enabled here. The complete İndirim ve Puan
milestone and release verification remain open.

## Phase B2b-2 — paid Desktop Commerce Order fulfillment backend

`commerce-order-fulfillment-service.ts` owns the optional `benefits` command on the
existing fulfillment operation. It uses `withCommerceBenefitsTransaction` as the
single synchronous outer transaction owner. Creation, confirmation, order drafts,
credit and no-payment completion never reserve, consume or grant benefits. Omitted
`benefits` keeps the existing fulfillment fingerprint, result and cash/credit/stock
behavior without protected-key access. This slice accepts only stored `desktop`
and `desktop-wholesale` orders, through trusted local main-frame/unlocked-owner
authorization; Web, Dealer and Companion ingress remain outside its scope.

`commerce-order-benefits.ts` supplies the parent ports. Tenant, customer, currency,
products, quantities and prices come from the stored order. Current catalog/dealer
resolution supplies current eligibility and price-group scope, while accepted
order prices remain authoritative. The engine uses current benefit rules. Its
subtotal and discount must exactly match the stored order subtotal and discount;
cash plus Puan tender must equal the unchanged order total. A new coupon/payment
discount on an undiscounted order, a different existing discount, inconsistent
rounding or changed quote fails closed (`BENEFITS_ORDER_SNAPSHOT_CONFLICT` or
`BENEFITS_QUOTE_CHANGED`). This is a bounded restriction: generic coupon repricing
requires a later explicit domain decision; this slice does not revise order totals.
A matching already accepted discount can settle a real coupon. Puan redemption and
paid earning work on consistent snapshots without repricing the order.

The canonical benefits source is `commerce_order + order id`. The parent allocates
the real sale ID, reserves, writes the existing snapshot sale/items/stock, writes
immutable `commerce_sale_settlements` tender evidence before the existing Finance
projection, persists `commerce_order_fulfillments` and marks the order fulfilled,
then settles benefits. Settlement joins the current stored order/fulfillment/sale
and tender, checks paid state, customer, provenance, currency, totals and method.
Finance records only actual cash; all-Puan tender creates no income. Order sales
cannot also grant through the fast-sale `sale` source. No second ledger or stock
queue is introduced. Every parent/benefits/publication write rolls back together
on failure, including failures after Finance or point writes.

The stable fulfillment operation key and exact parent command fingerprint own
replay. The fingerprint includes a tenant/purpose-bound HMAC of the benefits command,
including its transient coupon secret, expected quote and explicit cash amount.
Codes never persist in receipts, projections, history, logs or outboxes. Coupon
attempt authorization commits independently before the parent transaction using
the main-derived local owner principal. Invalid attempts survive rejected checkout.
Exact replay returns the stored benefits receipt without a new coupon attempt or
current pricing/rule calculation, even after code expiry/exhaustion/family disable;
current root capabilities and owner access remain mandatory. A concurrent commit
during ingress is resolved by the same parent fingerprint, never by assuming success.

The existing commerce preload/main bridge exposes `previewOrderBenefits` and
`tryFulfillOrder`; both fulfillment methods use the same canonical fulfillment IPC.
Preview accepts only bounded order/operation/method/points/code fields and returns
`preview_only`, without holds or financial effects. Confirmation compares the exact
quote and requires cash equal to its payable amount. The explicit rejection envelope
proves parent rollback; post-commit notification failures remain uncertain thrown
responses and must be retried with the identical operation/command.

The existing Siparişler fulfillment screen offers explicit “İndirim ve Puan” opt-in
for confirmed positive-total local Desktop orders. Its controller-owned session uses
the key-free availability projection and family flags. No-discount orders expose
customer Puan only; a secret coupon field is meaningful only with an already accepted
discount. Preview/confirmation must match the unchanged stored subtotal, discount and
total. A payment discount that does not match is rejected with an actionable note;
the UI never reprices an order. Credit, no-payment and remote orders retain their
existing fulfillment path. Omitted opt-in never loads the protected key or earns Puan.

Cash, Puan tender and prospective earning are displayed separately. Only the paid
fulfillment receipt confirms earning through existing status feedback. Payment,
customer, order snapshot, selection and benefit input changes invalidate preview;
late responses cannot authorize another selection. On thrown/invalid fulfillment
responses the exact command, operation key and transient secret stay bound to the
selected order in controller memory across tab/workspace unmounts. Edits and other
mutations are blocked until exact retry confirms the receipt or returns an explicit
expected rejection. Confirmed success clears the secret and pending command. This
memory lifetime does not recover after application termination. Table orders and
refunds/reversals remain later work.

Focused proof: `npm run verify:check -- commerce-order-benefits` uses actual source
owners and disposable SQLite with the current schema. The existing
`commerce-order-fulfillment` check now also compiles current source into temporary
modules, avoiding stale build output or an unrelated full Desktop build. The schema
directly admits `commerce_order` reservation/snapshot sources; no migration, backup,
restore, schema-version adapter or data-preservation scaffolding was added.

`npm run verify:check -- commerce-order-benefits-ui` is the focused Vite/Playwright
check against disposable current-schema SQLite through the actual preload/main
order APIs. It exercises gates, preview without settlement, immutable totals,
matching coupon/bank/Puan receipt, stale quotes, late preview, customer/payment
changes, uncertain post-commit exact replay across unmounts, secret clearing and
legacy fulfillment. It requires local socket and Chromium permissions; an EPERM
bind failure means browser behavior has not been verified in that environment.

## Web + Dealer (Phase C), Companion (Phase D)

Shared `BenefitsCheckoutCommand` carries version, stable action ID, intent, optional
expected quote and reservation ID. `BenefitsCheckoutAcknowledgement` returns the
exact applied settlement receipt, a safe rejection code, or `requires_authority`.
Existing durable ingress/outbox/receipt/ACK owners must carry these; no new sync queue,
second hosting calculator, independent hosting ledger or duplicate grant path.

The authoritative Desktop database may reserve/commit while locally offline.
Web/dealer offline previews and queued Companion intents cannot confirm Puan spend.
A preview returns `{ authority: { state: 'preview_only', canConfirmPoints: false } }`;
confirmation requires a still-valid authoritative reservation and same-source paid
ACK. Loss of connectivity is never implicit reservation or success. Online web
principal/customer/dealer permissions and canonical method mapping must be verified
at ingress, and its quote revalidated by this owner. The future transport must bind
`BenefitsAuthority` revision/expiry to the actual authoritative reservation and
existing access-revision/revocation contracts; a client-supplied authority object is
not evidence. The schema includes a tenant/customer/channel/reservation-bound checkout
authorization envelope with hashed token, principal, access/authority revisions,
quote binding, expiry, revocation and consumed-snapshot reference. It has no issuer
or consumer in Phase A. No HTTP or remote authority lease is implemented in Phase A.

Phase C implements Web + Dealer adapters and secure ingress/public projections.
Phase D implements Companion action/receipt integration and authorized balance
projections using existing outboxes. Phase E is user-owned release verification,
packaging and publishing after the earlier phases; none runs automatically.

## Focused verification

`npm run verify:check -- commerce-benefits` runs only the dedicated SQLite/math/
concurrency tests, with temporary source compilation and disposable fixtures.
Shared/Electron no-emit typechecks and file-scoped ESLint are separate narrow checks.
No pre-main/full/release suite, customer database, device or live-hosting proof is
implied. The user runs `npm run verify:pre-main` when ready to integrate all existing
milestone changes, and the release gate only in Phase E.

## Phase B2b-3 — Desktop table paid settlement backend

`table-order-benefits.ts` supplies the table parent ports to `CommerceBenefitsStore`.
The canonical source is **table_order + order id**, channel `desktop_desk`; there is
no resulting sale or second stock consumption. The existing table service already
consumes stock when items are added. Its transaction-free canonical close writer
is shared by legacy close and the optional benefits operation.

Only the native `tableOrder:close` benefits branch accepts the explicit paid command.
The trusted main frame and unlocked local owner guard also protects the key-free
`tableOrder:benefitsState` and `tableOrder:previewBenefits` APIs. The existing preload
adds `getTableOrderBenefitsState`, `previewTableOrderBenefits` and
`settleTableOrderBenefits` (the latter invokes that same close IPC). No actor, tenant,
customer, source, line, price or key can be supplied through these commands. Persisted
Food Orders and the existing benefits dependency policy (Catalog, Customers and either
Sales or Orders) are enforced in the owner and rechecked inside the transaction.
Omitted opt-in never reads protected key material; disabled capabilities/families
reject new benefit operations before key loading. Exact replay still requires its key.

Preview uses stored table lines/menu retail prices and the current assigned table
customer, verified against the local business. It creates no holds or financial
writes. Coupon attempts use the existing independently durable actor/tenant limits.
A purpose-bound HMAC preview token binds the operation, current customer, line and
order snapshot, payment method and transient coupon input. Confirmation requires
both this token and the exact recomputed quote; client money is never authority.

For an adisyon with **no manual discount**, coupon and payment-method discounts may
be applied atomically on paid close. The order subtotal stays the line subtotal;
discount and total are persisted before the canonical paid close. Any existing
manual discount rejects benefits without changing it. Money uses the existing
exponent 2 contract; customer groups are empty and table pricing is retail, matching
the existing menu/order writer. Cash/card/bank/other are explicit confirmed methods.
Zero-total, unpaid, cancelled and room-folio-transferred sources cannot enroll.
Anonymous customers cannot earn or spend Puan; eligible anonymous coupons still work.

`table_order_settlements` is immutable parent tender/evidence: business, table,
customer captured before assignment clear, source/channel, operation, command HMAC,
method, currency, full line snapshot, subtotal/discount/total, cash and Puan tender.
Cash plus Puan must equal the positive order total. Finance validates this evidence
and records only actual cash/method; all-Puan creates no cash income. Re-projection
uses the same source/evidence. Legacy closes retain full total/unspecified method
and their original customer-assignment behavior. Android's direct close route and
room-folio transfer are unchanged and never enroll or grant benefits.

Key I/O and any coupon permit finish before the single synchronous outer
`BEGIN IMMEDIATE`. Reserve, effective discount, tender, canonical close, Finance,
assignment clear, events/outbox and benefit spend/grant/snapshot commit together.
Paid evidence and Finance are checked again after point/snapshot writes. Failures
roll back every parent/benefit effect; independent coupon attempts remain durable.
The exact command replays its stored receipt after an uncertain response, including
after coupon expiry/exhaustion/family disable and after the table is reassigned.
Changed operation or command rejects. Current owner/root capability access remains
required. Coupon secrets and plain code hashes never persist.

Focused proof: `npm run verify:check -- table-order-benefits` compiles actual source
into temporary modules and uses disposable current-schema SQLite, including concurrent
writers and the real native IPC/preload chain. No migration/backfill/compatibility
path is added. Table refunds/reversals have no authority adapter in this slice. No remote,
Android benefits, live deployment, device or release verification is claimed.

### Canonical table checkout UI

`TableAccountPanel` offers optional **İndirim ve Puan** for a positive active adisyon
with exactly zero original manual discount, using the trusted key-free state probe.
The default **Ödendi / Kapat** keeps its legacy close. The optional method selection
(cash/card/bank/other), transient coupon and valid assigned customer's Puan request
use the secure preview; every displayed discount, tender, collection and earning
amount comes from main. Empty/invalid Puan cannot request a preview. The shared
confirmation shows the actual method, discount, Puan tender, collection and earning.

`use-table-order-benefits` lives in `TableWorkspace`, alongside the canonical order
controller. Order/customer/projection/input changes invalidate the preview; main
also checks the HMAC token and quote against current rules and source. Manual
discount editing and room transfer cannot combine with opt-in. Preview, confirmation,
settlement and uncertain outcomes lock order mutations, assignments and workspace
close. The lock is also enforced at the controller operation gate.

An uncertain response retains the exact frozen secret-bearing command only in an
in-memory ref. **Adisyon Sonucunu Doğrula** replays that command through the same
`tableOrder:close`, including after panel remount or hidden page updates. A rejection
after an uncertain attempt cannot prove that the first attempt did not commit, so
it keeps the pending command and close guard. Confirmed receipt clears the secret
and pending command; a later dashboard failure never reopens payment submission.
Renderer restart/forced destruction is outside this in-memory recovery lifetime.

Focused UI entry: `npm run verify:check -- table-order-benefits-ui`. It reuses the
existing benefits fixture/compiler and Playwright/Vite helpers with current-schema
disposable SQLite, canonical `TableWorkspace`, real preload and native IPC handlers.
Its assertions cover coupon+bank+Puan, stock/finance evidence, gates, stale context,
lost/malformed post-commit replies, exact replay across panel remount, projection
failure and legacy/folio behavior. Browser assertions require a host that permits
Vite listening; fixture preparation or TypeScript success alone is not UI proof.

## Phase B2c-1 — Desktop Market Quick Sale full refund backend

`market-sale-full-refund.ts` owns `fullRefundMarketSale(path, command, authority)`.
The exact command is `{ saleId, operationId, kind: "full" }`; additional fields
reject. `commerce:sale:fullRefundMarket` and preload methods
`commerce.fullRefundMarketSale` / `commerce.tryFullRefundMarketSale` expose the
same native operation. The latter returns the existing explicit mutation result;
post-commit notification failures remain uncertain and require the exact retry.
The trusted main-frame, authenticated local owner and unlocked-session guard runs
before database/key access. The current business and Sales capability are checked
again inside the transaction. Order fulfillment links, credit, table, Android and
other sources cannot enter this parent, even if an order sale is mislabeled.

`commerce_sale_full_refunds` is immutable parent evidence with unique sale and
business/operation identities, original items and stock movements, snapshot,
customer, currency, actual cash/Puan, original method, actor and command.
`commerce_sale_full_refund_receipts` stores the immutable exact result, including
return movement IDs and benefit reversal receipt. The original sale remains its
historical `paid` record and cannot be updated/deleted after refund. No fake
`refunded` settlement or rewritten original income is used. A changed command
or another refund operation for that sale rejects; exact replay reads the stored
result before catalog, rule, coupon, customer or warehouse revalidation, without
key access. Current owner/business/Sales authorization remains required.

The single synchronous `BEGIN IMMEDIATE` contains parent evidence, the Finance
owner's independent `commerce_sale_refund` **expense**, exact inventory returns,
`CommerceBenefitsStore.reverse` and operation receipt. Expense amount is the
immutable original cash tender; legacy sales without a benefit snapshot use the
canonical paid sale total. The original source-owned income must match and is
retained for audit, giving zero net cash for the sale/refund pair. All-Puan creates
no zero Finance entry. The refund uses the original canonical payment method
(`transfer` becomes `bank`); this is local accounting, without a payment-provider
refund integration. Legacy sales have no persisted canonical customer on the sale,
so their refund customer is null rather than inferred from current UI state.

Inventory tracking at sale time is evidenced only by original `commerce_sale`
movements. Their product quantities must exactly match the sale lines; each return
uses the original warehouse, quantity and cost through the existing `return_in`
primitive, with reference `commerce_sale_refund + refund id`. An originally
untracked item receives no stock return even if tracking is now enabled. Missing,
deleted or disabled tracked products/warehouses and inconsistent movements fail
closed; no product/location is revived or substituted. Current tracked-product
flags must still permit the canonical inventory writer. Existing movement triggers
own publication/outbox effects; unrelated manual `return_in` is never refund proof.

For opted-in sales, key loading finishes before BEGIN and the exact stored
snapshot/tender/line scope is validated. A separate refund-only parent adapter
authorizes reversal from this transaction's real refund evidence; checkout ports
remain checkout-only. Disabling Benefits or its families does not prevent an
authorized refund. Existing point reversal restores spent lots with their original
expiry, recovers earned points or rejects the entire refund if they are spent or
held, and keeps coupon usage consumed. Legacy refunds never load a benefits key.
Any Finance, stock, point, receipt or outbox failure rolls back all parent effects.

Focused proof: `npm run verify:check -- market-sale-full-refund` uses the current
schema and actual owners in disposable SQLite. It covers legacy/benefits cash,
mixed/all-Puan, original income, stock/warehouse safety, coupon retention,
disabled benefits, spent/held earned points, exact/changed replay, failures after
every write stage, concurrent refunds and the real IPC/preload guard. This phase
adds no migration, backfill, backup or compatibility path.

**UI deferred:** there is no user-facing refund action yet. This phase provides
only the bounded native backend API/evidence; no generic order, table, dealer,
Android, partial-refund or release support is claimed. Large pre-main/full/release
verification remains with the user.

## Phase B2c-2 — Finance contextual Market full refund

Finance → Son Hareketler now probes only `commerce_sale` income rows through
`commerce.getFullRefundMarketSalePreview(saleId)`. The authenticated trusted
main-frame/unlocked-owner guard runs before database access. The read-only SQLite
snapshot checks current business/Sales authorization and shares the writer's
persisted sale, original tender/benefit snapshot, Finance evidence and original
stock validation. It never loads a protected key or writes data. Order fulfillment,
credit, unrelated sources, unsafe evidence and already-refunded sales have no action.
The preview projects actual cash, Puan, total, currency, known customer and original
product lines; current catalog prices cannot replace historical amounts.

The eligible row's Tam İade opens the existing ConfirmDialog as the single modal.
It names the local **Kasa iadesi kaydı**, exact cash/Puan split, stock return,
earned-Puan recovery failure if spent/held, and consumed coupon policy. It makes
no external payment-provider refund claim. Confirmation creates one frozen
`{saleId, operationId, kind:'full'}` command. Processing/uncertain state is memory
only, scoped by bridge + authenticated business/actor + sale, and survives Finance
unmount/remount. A thrown or malformed reply retains the exact command and offers
İade Sonucunu Doğrula. An expected rejection on a first attempt releases the command;
a rejection after an uncertain attempt cannot disprove the earlier commit and
retains it. No localStorage or process-termination recovery is promised.

A verified receipt clears the pending operation and refreshes Finance. Original
income remains; the independent refund expense appears. Refresh failure does not
turn a confirmed refund into a failed mutation or generate another operation.
Only Finance actions are blocked while its scoped refund is processing/uncertain.

Focused checks: `market-sale-full-refund` (existing backend proof),
`market-sale-full-refund-preview` (real SQLite read-only/authority evidence),
`market-sale-full-refund-ui` (Vite/Playwright, actual main IPC/preload with fake
Electron transport, disposable SQLite), and existing `finance-workspace` regression.
Browser checks need a host where Vite can listen; sandbox `listen EPERM` is an
execution gap, never browser-flow proof. No full/pre-main/release suite is implied.

B2c-2 local checkpoint (2026-10-28): backend 29/29 and read-only preview 10/10
passed, as did desktop Electron/renderer no-emit TypeScript, scoped ESLint and
registry 10/10. Both refund UI and existing Finance browser regression reached
Vite `listen EPERM 127.0.0.1`; no browser behavior pass is claimed. Run
`npm run verify:check -- market-sale-full-refund-ui` and
`node scripts/smoke-finance-workspace.mjs` outside the sandbox. The latter invokes
the existing smoke directly to avoid its registry's package/Electron build
prerequisites. The accidentally started prerequisite chain was stopped during
package compilation; no Electron build or release/installer packaging was completed.


**Host verification update (2026-10-28):** After the sandbox-only EPERM
blocker, the coordinator ran `node scripts/smoke-market-sale-full-refund-ui.mjs`
and `node scripts/smoke-finance-workspace.mjs` on the authorized Linux host.
Both returned PASS; the new UI was run twice successfully. This supersedes the
sandbox browser gap above, not the unrun pre-main/full/release suites.

**Known UI reachability gap:** Finance → Son Hareketler exposes recent
`commerce_sale` income entries, not a complete sale archive. An all-Puan sale
with zero cash has no income entry, so it cannot be initiated from this UI,
although the safe full-refund backend handles it. Older sales outside the
recent Finance projection also need a later, scoped sales-history entry point.
Do not claim the contextual UI covers every paid quick sale until added.

### B2c-3 partial checkpoint (2026-10-29)

The key-free, read-only `listMarketSaleHistory` owner and its trusted main-frame,
unlocked preload/IPC entry now provide a maximum 50-row keyset page, scoped to the
persisted business and Sales capability. It reads original tender and refund state,
including all-Puan sales, and excludes other sources, credits and linked order
fulfillments. This is a history projection only: refund eligibility and mutation
remain with the existing preview and frozen-command operation.

**Not complete:** no Satış Geçmişi UI is connected yet. Before claiming reachability,
implement the single-surface flow and scope/lock/late-response handling, exercise
all-Puan and older-sale confirmation and atomic reversal in Playwright, and check the
query plan/performance for the global order/credit exclusion probes on existing
databases without introducing a migration. Extend history tests for linked credit,
cross-business and cursor edge cases. Existing Finance contextual actions remain.
No deploy, live data operation, full suite, packaging or release is implied.

### B2c-3 Finance history continuation (2026-10-29)

Finance now opens a compact, lazy-loaded Satış Geçmişi panel. Each request reads
at most 30 persisted rows; further pages are explicit. The list includes all-Puan
sales without a Finance income and displays original total, cash/Puan, method and
refund status. Refunded rows have no action. Inspecting another row calls the existing
refund preview and rechecks main-derived business/actor scope before passing an
eligible result to the same `useMarketSaleRefund` and ConfirmDialog; the history
contains no writer. Closing/unmounting invalidates pending panel reads. Lock and
scope mismatch fail closed; the unlocked desktop view is keyed by business/database.
Pending uncertain commands retain the existing in-memory remount/retry behavior.

The expanded `market-sale-full-refund-ui` Playwright smoke exercises real all-Puan
and older paged sales, stock and Puan reversal, no duplicate, lost response retry
across remount, refunded display, denied rows, late response after close, changed
scope and a locked recheck. Existing recent Finance actions remain covered. Global
order/credit exclusion query-plan performance and linked-credit/cursor edge tests
remain follow-up checks; no migration or live database change is introduced.

### B2c-3 history audit (2026-10-29)

The preview smoke now covers malformed/false/null cursors, limits 0 and 50,
stable timestamp ties across pages, foreign-business cursor/id isolation, linked
credit and order exclusions despite a misleading quick-sale source, locked and
untrusted IPC and all-Puan tender. A disposable benchmark inserts 1,500 b1 and
300 b2 historical sales, including 250 linked credits and 250 order fulfillments.
Five first-page (30-row) reads took 9.73–15.51 ms on the audit host; the same
test under parallel verification measured 18.78–47.16 ms. SQLite uses
`idx_commerce_sales_business` and indexed settlement/customer/refund lookups, but
scans order fulfillment and credit indexes/tables for global sale-ID exclusions,
and uses a temporary B-tree for the ID tie-break. This measurement is not a bound
for substantially larger datasets. A schema-only index would not improve existing
pilot databases; no schema or live database changes were made. A future indexing
decision must preserve the writer's global exclusion semantics and explicitly
address existing installations without an unauthorized migration.
