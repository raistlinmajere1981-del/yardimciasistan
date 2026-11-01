# Companion points: C20a transaction ownership audit

Status: implementation contract, not permission to enable mobile spending. The
existing Phase A and C15 contracts remain authoritative. This slice changes no
runtime behavior, schema, mobile action, transport or UI.

## Observed ownership

- `applyAndroidActionTransaction` owns the Android action `BEGIN IMMEDIATE`,
  routing, action receipt, commit and rollback. Its market sale route currently
  rejects benefits fields and creates non-benefits sales only. C19's immutable
  Android receipt explicitly represents zero points; it is not a settlement ACK.
- `withCommerceBenefitsParentTransaction` borrows an already-open synchronous
  database transaction. It neither begins nor commits it; its caller must roll
  back on **any** error, including a caught benefits failure. Nested benefits
  scopes and async callbacks are forbidden. There is currently no production
  caller of this adapter for Companion spending.
- Desktop's `completeMarketSaleInTransaction` is the canonical parent sale
  writer. `prepareMarketSaleBenefits` reauthorizes, reserves, compares the
  authoritative quote and actual cash, writes tender evidence and settles using
  the same transaction. Its present principal and `desktop_cart` channel are
  Desktop-owner-specific; they are not an Android authorization model.
- The Android points quote is read-only, rule-unaware and advisory; neither it,
  the balance-view grant, nor a device admin role can authorize spending.

## Required future parent-write contract

1. Define a canonical Companion principal and versioned action bound to the
   authenticated device, current business/customer, cart, currency, action ID,
   rules and an authoritative reservation. Establish the separate spend grant;
   recheck device, credentials, capabilities, grant, customer and reservation at
   confirmation inside the parent write boundary. Do not accept client totals,
   balances, benefit settlements or discounts as evidence.
2. Keep the existing action owner as the **only** transaction owner. Borrow its
   synchronous transaction for reservation/settlement; sale, stock, cash Finance,
   points ledger, immutable benefits snapshot/receipt, publication outbox and
   action receipt must commit or roll back together. Do not swallow an error or
   start another transaction. Existing independently committed coupon-attempt
   authorization remains separate; coupon secrets are out of scope here.
3. Persist and replay the exact authoritative settlement result on matching
   action/intent only, after current device and tenant authorization; conflicting
   intent must fail without new writes. Reuse the existing outbox and ACK owners;
   do not treat the current zero-points C19 receipt as a spending receipt.
4. Before enabling any route or UI, exercise real parent rollback at each write
   boundary, concurrent reservations, stale quotes, revoke/grant ordering, lost ACK,
   exact replay, tenant/device isolation, offline behavior and canonical refund.
   Explicitly resolve receipt wire security and physical paired-device E2E.

## C20a evidence and limits

`scripts/smoke-companion-benefits-parent-contract.mjs` uses current source and
disposable SQLite to run the **Desktop-owner** points checkout inside an explicit
parent `BEGIN IMMEDIATE`. It checks rollback after settlement and a synthetic
action receipt, then checks commit and canonical Desktop sale replay. The
synthetic action receipt is not Android action routing or authorization; this is
proof of transaction composition only, not a mobile spend implementation.

## C20b internal principal seam

`requireCompanionPointsPrincipal` reads only inside an existing transaction. The
caller supplies authenticated ingress credentials and the requested customer,
never a client business ID or price. Active business, device record/epoch, live
token, explicit spend grant, points family/capabilities, customer scope and
effective paid-sale permissions are read from current SQLite. Returned context is
frozen and contains no token; `assertAuthorized` rechecks and rejects a replaced
record, changed epoch or business rather than rebinding stale context. It is not a
`desktop_owner` actor and cannot be passed off as a settlement authority.

This seam opens no transaction and performs no writes. `db.isTransaction` proves
an existing transaction, not its locking mode: the trusted action owner must still
use `BEGIN IMMEDIATE` and roll back on denial. No route or current Android action
calls this validator yet; transport credential handoff, reservation binding and
settlement remain separate work. It currently checks paid-sale visibility only,
not authorization for a credit-spend operation or remote/hosting principal.

## C20c authenticated LAN handoff (spend still disabled)

The existing HTTPS action handler now mints an empty, frozen, opaque context only
after its LAN, enabled and pre/post-body header authentication gates. A private
WeakMap retains the header device/token and normalized action identity only for
the synchronous apply callback; a finally block removes it on success or failure.
Plain HTTP mocks, JSON, hosting and offline actions cannot mint this context.
No raw credential enters the shared action, fingerprint, receipt or database.

`main.ts` and `DesktopDatabase.applyAndroidAction` forward this separate optional
argument to `applyAndroidActionTransaction` and its router. Existing actions do
not consume it. The transaction owner privately binds it to the current database
and action after its existing `BEGIN IMMEDIATE`, then removes that binding in
finally. `isLocalActionParentTransaction` is a read-only scope check; a caller's
independently opened transaction is insufficient.

`requireLocalActionPointsPrincipal` is an ingress-owned internal reader. It
requires both live bindings, exact action identity, header device, paid-sale
customer scope and C20b's current SQLite authorization. Its token-free frozen
principal rechecks ingress lifetime and parent ownership as well as C20b's
device/token/grant checks. It exposes no credential accessor or context factory.
No production route calls this reader yet, and it is not a reservation or
settlement authority. Existing non-spend sale/replay/ACK paths remain independent
of the spend grant. Reservation/quote/action-version binding, concurrent revoke
ordering, spend receipt security and physical ACK-loss testing remain future work.

`scripts/smoke-companion-points-ingress.mjs` uses actual Node TLS/HTTPS/HTTP parsers
over paired in-memory streams and disposable SQLite. A test-only router wrapper
consumes the principal inside the actual canonical parent, without adding a spend
route. It checks header-only provenance, fabricated/expired contexts, arbitrary
caller transactions, token/grant revocation, parent rollback, token-free logs and
rows, credential-rotation replay, plaintext rejection and existing zero-points
sale ACK without a spend grant. `--tcp` separately checks loopback sockets; Codex's restricted sandbox blocked
TCP binding with `listen EPERM`, but the identical test passed over real loopback
TCP/TLS from the authorized Desktop session after correcting a disposable fixture's
credential-rotation sequence to use fresh unique tokens. In-memory and TCP TLS
checks are not physical paired-device spending E2E proof.

## C20d internal versioned intent binding (no reservation authority)

`companion-points-intent.ts` defines an internal v1 preference with exactly
`{ version: 1, currency, requestedPointsMinor }`. The positive safe-integer points
value is a request, never a tender amount. This module has no production consumer,
route, IPC, mobile command or shared wire type. Existing sale actions still reject
benefits fields and their ACK still represents zero points.

`bindCompanionPointsIntent` and `validateCompanionPointsIntent` run through
`benefitsOperation` inside `withCommerceBenefitsParentTransaction`, borrowed from
the canonical Android action owner. They open/commit no transaction and execute
only reads. Each call independently obtains the live C20c ingress principal, so
another caller's transaction, forged principal/context or ended request is not
sufficient. Current token, active device record/epoch, tenant/customer, explicit
spend grant, capabilities and paid-sale permissions are rechecked, including for
an exact repeated intent.

The frozen binding includes current business/customer/device record/epoch,
action ID/type and the existing canonical action fingerprint; Companion channel,
currency/exponent, requested points; ordered product/quantity scope; current
canonical unit prices, product revisions/categories and resolved price groups;
and a digest of settings revision plus full canonical rule heads and their time
windows. Pricing comes from `resolveCommerceProductPriceInDatabase`; client
price/version fields only guard against stale input. A fresh client price hint
cannot repair an old binding. New/changed rule heads, settings changes and a
rule-window transition also invalidate it.

Server time is the trusted parent's `tx.now`. Validity is `[generatedAtMs,
expiresAtMs)`, at most 30 seconds; a future-dated or expired binding rejects.
Private WeakMap provenance binds the object to its database and fingerprint;
copies, JSON and the existing read-only advisory Android quote cannot substitute
for it. The SHA-256 digest is an equality guard, **not** an authentication token.
There are no new secrets, persisted intent rows, receipts or queues. Identical
scope has an identical fingerprint and validates repeatedly without writes;
changed intent against that binding rejects. This is not durable action
idempotency, reservation replay or a guarantee that only one binding can be minted
per action. Process restart loses the object and fails closed.

Every result explicitly says
`{ state: "intent_only", canReservePoints: false, canConfirmPoints: false }`.
It does not evaluate rule eligibility, available balance, discounts, points
tender, cash, inventory or paid settlement. In particular it may describe a
request when there are no available points or applicable redeem rules. No
successful validation authorizes a spend. Validation failure poisons the borrowed
benefits scope even if caught; the action owner must roll back.

### Test-backed reservation blocker and required continuation

The actual `CommerceBenefitsStore.reserve` with the actual C20c principal and
existing `marketSaleBenefitsPorts` rejects `BENEFITS_STAFF_REQUIRED` before writes.
Those ports require `desktop_owner` and `desktop_cart`, and supply Desktop paid
tender/settlement evidence. Renaming a Companion principal or changing its role
would bypass that authority boundary. The rule engine accepting a `companion`
channel does not establish a Companion parent adapter. The advisory
`quoteAndroidPointSpend` remains rule-unaware and cannot substitute for one.

Before a reservation slice, establish Companion-specific canonical parent ports
and the real sale source identity (never treat the Android action as a second
settlement source), then prove authorization and pricing under that same owner.
Use the existing protected benefits key lifecycle before parent BEGIN; do not
invent transport secrets or load keys from action JSON. Only then call the
existing `CommerceBenefitsStore.reserve` and point holds in the borrowed parent.
Bind its exact reservation ID/quote/expiry and canonical sale source to the
versioned tenant/device/action/intent/rules scope. Recheck the live reservation
status and current scope before financial effects: canonical `reserve` returns
its stored operation receipt early on exact replay, which by itself is not proof
of a currently active/fresh reservation. Settlement and durable exact-result
replay must remain with the canonical parent and existing receipts/outbox.

The extended `smoke-companion-points-ingress.mjs` consumes the validator only in
its test router wrapper, using actual in-memory TLS ingress and disposable
current-schema SQLite. It covers exact repeats, conflicting points/action/cart/
payment, malformed/extra fields, client price hints, copied/advisory bindings,
expiry/future time, settings/rule-head/window changes, fully authorized other
device/customer/tenant, grant/token revocation, stale epoch after regrant and a
caught failure poisoning the parent. Full database comparisons prove no intent
side effects; explicit checks confirm zero reservations, holds and point ledger
entries. Existing legacy paid/credit zero-points ACK tests still pass. This is
not TCP, concurrent second-connection revoke ordering, durable reservation replay,
spend receipt wire security, offline/refund or physical-device spend E2E proof.

## C20e internal read-only Companion source/pricing ports

`companion-sale-benefits.ts::companionSaleBenefitsReadPorts` is an internal,
key-free reader. There is no production consumer. It borrows the current benefits
scope inside the authenticated Android action owner's `BEGIN IMMEDIATE`; each
factory/read call validates the opaque C20d binding, current C20c ingress lifetime,
device/credential/epoch, spend grant, effective paid-sale permissions, capabilities,
tenant/customer, canonical prices, rule revisions and time window. Neither a
caller-supplied principal nor a `desktop_owner` role is accepted as a substitute.

The existing canonical sale allocates a random sale ID. The new read-only
`market-sale-operation.ts::readMarketSaleOperationSourceInTransaction` reuses the
owner's exact request hash and reads `commerce_market_sale_receipts.operation_id`
to find the actual sale. It allocates nothing. A missing mapping rejects with
`COMPANION_POINTS_SOURCE_REQUIRED`; hashing the action ID into a purported sale ID
would be incorrect for the active Android path. The Companion reader additionally
checks the mapped sale's tenant/customer, paid state, currency, method and immutable
`android-market-sale` provenance, excludes order fulfillment, checks any existing
Android action receipt's device/type/fingerprint, and rejects changed mappings.
The sole benefits source is `{ kind: "sale", id: actualCanonicalSaleId }`.

The frozen request is constructed internally from that source and validated intent.
`assertReadAuthorized` and `ports.resolvePricing` permit only exact scope on the
same database and current parent time. Extra caller quote/total/price fields,
forged sources and changed customer/channel/payment reject. Pricing validation
reruns `resolveCommerceProductPriceInDatabase` through the C20d owner, including
retail/dealer eligibility and price groups; mixed applied groups remain unsupported.
Payment method must match the persisted canonical sale, but `confirmed` is always
false. Family/balance placeholders are not an eligibility or balance result, and
this module does not calculate or accept a spend quote.

The result explicitly has `{ state: "read_only", canReservePoints: false,
canConfirmPoints: false }`. Its `CommerceBenefitsParentPorts.authorize` deliberately
rejects checkout/refund with `COMPANION_POINTS_RESERVATION_DISABLED`, after current
scope validation. Adjustment, settlement and refund evidence entrypoints also deny.
Thus passing these ports to the actual `CommerceBenefitsStore.reserve` rejects
before expiry updates, reservation/hold writes or stored-receipt replay. A read
authorization is not a successful checkout authorization. Failures poison the
borrowed benefits scope and require the action owner's rollback.

### Verified blockers; reserve/hold remains disabled

- `CommerceBenefitsKey` already owns the per-user OS `safeStorage` encrypted key,
  separate from TLS and SQLite. It denies `basic_text`, corruption and a missing
  established key rather than rotating silently. Desktop's
  `prepareMarketSaleBenefitsIngress` loads it before `BEGIN IMMEDIATE`, after owner
  authorization. The Android action ingress has no equivalent protected-key
  preparation/handoff. C20e neither loads nor creates a key. Existing focused key
  lifecycle tests pass with a test keystore; live OS storage was not exercised.
- The real `completeMarketSaleInTransaction`, called with the actual C20c Companion
  principal in the actual Android parent and a fixture key, rejects
  `BENEFITS_STAFF_REQUIRED` without writes. Its current benefits execution,
  `prepareMarketSaleBenefits` and replay path still select Desktop-owner ports and
  `desktop_cart`. The sale writer can persist paid tender evidence in
  `commerce_sale_settlements`, but using that evidence under Companion authority is
  unproved. This slice changes no existing sale execution branch.
- An actual pre-reservation sale ID allocation/adapter is still absent: this reader
  can inspect an already-created canonical sale in the same parent, not reserve
  before it. Tests create a normal zero-points sale through the existing owner,
  inspect it through the new reader, then force the owner to roll everything back.
  These tests do not implement a post-sale points settlement flow.
- `materializeSaleReceipt` still explicitly rejects sale settlements/benefits
  snapshots and emits zero-points evidence only. That ACK must remain independent
  of the spend grant; it cannot carry a Companion spend settlement result.

The extended `scripts/smoke-companion-points-ingress.mjs` passes over real in-memory
TLS and source-loaded disposable current-schema SQLite. It checks actual random
sale mapping, retail/dealer pricing, missing/replaced/wrong-source sale, mismatched
operation hash, tenant/device/customer isolation, copied binding/context, expiry,
changed prices/rules, revoked grant/credential/device, missing effective product
permission, disabled capabilities/family, caller quote/total/payment tampering,
expired owner lifetime, actual blocked reserve and actual blocked canonical paid
benefits execution. Full table comparisons check zero reader/denial side effects
and complete parent rollback. Reservations, holds and point ledger remain empty;
legacy paid/credit ACK and exact replay pass. Parent composition tests pass 2/2,
Android action receipt tests 3/3 and focused protected-key lifecycle tests 2/2.
Electron typecheck, scoped ESLint and `git diff --check` pass. No device, active port,
live database, Electron process, TCP listener, APK or hosting was touched.

### Next bounded C20f

Keep route/UI/reserve disabled. Resolve and source-test the server-only pre-sale
source allocation and canonical parent execution seam, preserving legacy sale/ACK
behavior. Establish a Companion-specific authority and paid evidence contract
without renaming the actor or weakening grants; specify protected-key preparation
before the existing action BEGIN. Only after those proofs may a later authorized
slice consider canonical reserve/holds. Reservation ID/quote/expiry/live status,
durable exact replay, second-connection revoke ordering, revoke/regrant lifetime,
spend receipt security, offline/refund and physical ACK-loss/spend E2E remain open.

## C20f internal pre-sale identity and protected-key handoff

This is a server-only opt-in seam with no production caller, route, shared wire
field or mobile UI. It enables no points reservation, hold or settlement.

`prepareCompanionSaleBenefitsSource` runs only before BEGIN and during the existing
authenticated HTTPS callback. The ingress module retains header credentials and
returns only the current business/device record/epoch scope, after current token,
spend grant, capabilities, customer and effective paid-sale permission checks.
This preflight scope is not a parent principal. The established
`CommerceBenefitsKey`/`BenefitsManagementKeys.load(false)` loads the protected key;
missing/corrupt storage fails closed, with no creation or rotation. The empty-key
configuration is not repaired by Companion. No key or token is exposed by the
preparation handle or persisted in SQLite/receipts/logs. Key material remains in a
private WeakMap for the request-scoped parent handoff.

The canonical sale owner now accepts an optional opaque source allocation,
separate from `CompleteMarketSaleInput` and `CreateCommerceSaleInput`.
`prepareMarketSaleOperationSource` binds its exact existing request hash, operation,
business and database. `prepareCommerceSaleSource` uses the same random
`createId("sale_")` generator as existing sales. The actual canonical writer
explicitly adopts that ID when the allocation is supplied; it is not an action
hash or an invented persisted sale. Allocation performs no writes, creates no
receipt and makes no financial claim. Copies, another database/business/request/
operation, an existing receipt and repeated consumption fail closed. An attempted
write consumes its handle even after rollback. A later request without a committed
receipt may allocate a fresh candidate; this is not a durable pre-sale ID registry.
Two preparations for one action cannot create two committed mappings. Existing
operation/action receipts remain the sole durable replay authority.

Inside the actual Android action parent's borrowed benefits transaction,
`requireCompanionSaleBenefitsSource` revalidates C20c/C20d authorization, canonical
prices/rules, customer/device/epoch and action/intent binding, the original HTTPS
object lifetime, database and a maximum 30-second preparation lifetime. The opaque
allocation then goes to the existing sale owner. No Desktop actor is substituted.
There is no protected storage I/O inside BEGIN.

After that canonical sale is written, `companionSaleBenefitsPreparedPorts` requires
the actual operation mapping to equal the allocated source. Its read-only
`readPaidEvidence` rechecks current authorization, sale provenance/paid state,
customer/currency/method and canonical Finance income amount/method/currency. It
rejects changed mappings, inconsistent Finance, settlement rows and benefit
snapshots. Evidence explicitly represents zero points paid by cash/other supported
canonical tender; it is not proof of a points settlement. It constructs the actual
`CommerceBenefitsStore` with the preloaded key and C20e read-only ports. Actual
`reserve` still rejects `COMPANION_POINTS_RESERVATION_DISABLED` before writes.
The existing Desktop benefits execution still rejects a Companion actor with
`BENEFITS_STAFF_REQUIRED`; it was not weakened or routed around.

When this optional seam is absent, the active Android path loads no benefits key,
allocates its random ID at the same existing owner, and preserves sale, Finance,
stock, operation receipt, immutable zero-points result receipt and cash/credit
ACK/replay behavior. No schema, migration, backup, Android code or live data changed.

### C20f evidence and minimum C20g

The new interface assertion first failed RED (missing function); the extended
`smoke-companion-points-ingress.mjs` then passed using current source, disposable
real SQLite and actual in-memory Node TLS/HTTPS. It proves allocated ID adoption by
the real paid sale/Finance owner, no side effects from preparation/read/denial,
action/business/customer/device/price/currency/expiry mismatches, copied handles,
cross-action and double-preparation mapping, source/replay/Finance tampering,
revoked grant/token/device, protected key missing/corrupt and pre-BEGIN-only key
loading. Full table comparisons prove rollback of canonical sale, stock, Finance,
outbox and receipts, including failure inserting the final immutable result
receipt. Successful commit and exact existing ACK replay bind the allocated ID;
legacy zero-points cash/credit ACK checks pass. Reservations, holds and point ledger
remain empty; responses/logs/SQLite contain no credential or protected key.

Additional targeted results: principal smoke PASS; borrowed parent composition
2/2; Android immutable action receipts 3/3; focused protected-key lifecycle 2/2
(test keystore); Android financial-boundary smoke PASS; Electron typecheck,
scoped ESLint and tracked/touched-untracked whitespace checks PASS. No TCP listener,
real OS storage, live Electron/device/sandbox/port, APK, hosting, full verification,
release packaging, commit or deployment was exercised.

Minimum C20g: keep route/UI/reserve disabled and build read-only Companion pricing
ports for the allocated source **before** any sale is written. C20e ports still
require a persisted sale. Neither the new zero-points paid evidence nor a loaded
key authorizes points tender. Companion parent pricing/paid-tender execution must
be established without Desktop-owner ports before a separately authorized
reservation slice. Canonical reservation eligibility/ID/quote/expiry/live status,
actual cash+points Finance, durable replay, concurrent revoke/regrant ordering,
immutable spend ACK security, offline/refund and physical ACK-loss/spend E2E remain
open. C20f stops here; C20g is not started automatically.


## C20g internal pre-sale advisory pricing/eligibility ports

`companionSaleBenefitsPreSaleReadPorts` is a separate internal reader for C20f's
allocated source **before** any sale row exists. C20e's
`companionSaleBenefitsReadPorts` still requires the actual persisted sale, and
C20f's `companionSaleBenefitsPreparedPorts` still reads zero-points paid evidence
only after that sale. No production route/caller, shared wire field or Android UI
uses the new reader. Neither source allocation, protected key nor advisory quote
confers reservation/settlement authority.

The new reader borrows the existing synchronous benefits scope in the authenticated
Android action owner's transaction. Every factory/read reuses C20d intent validation
and C20f's opaque preparation: current ingress credentials/lifetime, business,
customer, device record/epoch, live spend grant, capabilities, paid-sale permissions,
ordered product quantities, canonical retail/dealer prices, currency, action/hash,
rule heads/windows and preparation/intent expiry are rechecked. A copied context,
binding/preparation, another caller transaction, changed request or ended owner
fails closed and poisons the borrowed scope. Parent rollback remains mandatory.
`readPreparedMarketSaleOperationSourceInTransaction` reads the sale owner's private
allocation provenance, database/business/operation/request hash and unused status;
it rejects an existing sale/action/operation mapping. It performs no allocation,
write or consumption. Canonical sale execution can still consume that handle once;
subsequent pre-sale reads reject.

`CommerceBenefitsParentPorts.authorizeReadOnly` is optional and explicitly separate
from checkout/refund authorization. `CommerceBenefitsStore.previewReadOnly` fails
closed without that reader port; it reuses the existing Store context, live family
settings, `readCommercePointBalance`, canonical current rule heads and
`calculateCommerceBenefits`. The engine does **not** require a persisted sale for
this advisory calculation, so no substitute calculator, ledger, table or migration
was needed. Missing/inapplicable redeem rules, excluded products and insufficient
or expired available points raise the existing engine errors, without writes.
Rules scoped to retail/dealer price groups use the canonical applied group;
Wholesale disabled or a missing dealer price follows the existing pricing owner's
retail fallback. Mixed applied groups remain fail-closed. Customer groups remain
empty, as in the existing sale adapter; group-targeted rules do not acquire an
invented membership.

The result contains the engine's hypothetical quote and current available points,
with `{ state: "read_only", canReservePoints: false, canConfirmPoints: false }`.
In particular, `quote.pointsTenderMinor` is a proposed calculation, never a hold,
paid tender, cash amount or immutable ACK. Payment method is scope-checked but
`confirmed` stays false, including card requests with external confirmation hints;
payment modifiers therefore do not apply before paid evidence exists. Coupon rules
are excluded because this reader accepts no secret authorization. Direct parent
pricing contexts' family/balance placeholders are replaced only by the Store's
canonical live reads; they are not eligibility evidence on their own.

Every mutating Store path still uses the existing denied checkout/refund/adjustment
ports: reserve, settle, release, reverse/refund, adjustment and expiry remain
blocked. No holds, point spend, cash+points settlement or paid evidence are added.
The Desktop-owner boundary and the legacy no-points cash/credit action, immutable
receipt and exact ACK replay remain unchanged. Key loading remains C20f's
pre-BEGIN `load(false)`; no credential/key is added to JSON, SQLite, logs or receipts.

### C20g test evidence and limits

The new pre-sale interface assertion failed RED (`undefined`); the completed
`node scripts/smoke-companion-points-ingress.mjs` passes all five C20d/e/f/g and
legacy HTTPS groups with actual in-memory Node TLS/HTTPS and source-loaded current
schema disposable SQLite. C20g checks no persisted source, repeat reads, canonical
retail/dealer A/dealer B and fallback prices, all supported payment methods,
unconfirmed-card rejection, current rules/channel/product applicability and real
available/expired/changed points balance. It rejects source/quote/total/line price,
caller/context, business/customer/device/action/payment/currency/time tampering,
copied preparation/binding, stale prices/rules, revoked credential/device/grant,
changed epoch after regrant, consumed allocation and expired owner. An injected
balance-read fault and a caught reserve denial are fail-closed. Actual Store reserve,
settle/release/reverse (with synthetic existing fixture records), adjustment/expiry
and normal checkout preview all reject without effects. The read-only Store method
also rejects a parent lacking explicit read authorization.

Full-table equality **and SQLite `total_changes()` equality** around factories and
reads/denials/faults prove no row writes, including no-op writes; rule/point and
synthetic reservation fixture provisioning occurs before these measurements and
is rolled back by the actual Android parent. Outside those fixtures reservations,
holds and point ledger remain empty. A successful advisory read leaves its opaque
allocation available to the canonical sale writer; subsequent reads reject after
that writer consumes it. C20f's real sale/Finance/stock/outbox/result-receipt rollback
and commit/replay tests continue to pass. Responses/logs/SQLite are checked for
credential and protected-key leakage.

Additional results: `smoke-companion-points-principal.mjs` PASS;
`smoke-companion-benefits-parent-contract.mjs` 2/2 PASS;
`smoke-android-sale-action-receipt.mjs` 3/3 PASS;
`smoke-android-benefits-financial-boundary.mjs` PASS;
`smoke-android-sale-source-boundary.mjs` PASS;
`smoke-market-sale-benefits.mjs` 20/20 PASS;
`smoke-commerce-benefits.mjs` 29/29 PASS. All commands use `node scripts/<name>`.
`npm run typecheck:electron`, scoped ESLint on the three changed TS owners plus
ingress smoke, `git diff --check` and whitespace checks including all six touched
tracked/untracked files PASS.

Live grant checks are not grant-history proofs: today's grant table has no grant
generation. Revoke then regrant at the **same** device epoch restores a read-only
principal's live eligibility; the test explicitly accepts that advisory read.
Regrant at a changed device epoch rejects the old binding. C20g introduces no
historical continuity guarantee, and none may be inferred for future reserve/replay.
Second-connection revoke ordering specifically for these new ports remains untested.
Only in-memory TLS was run here; the host must separately run
`node scripts/smoke-companion-points-ingress.mjs --tcp`. Earlier C20f host TCP proof
does not verify the new C20g cases. No real OS keystore, physical phone, C19 sandbox,
active DB/process/port, APK, hosting, full/pre-main/release, build, commit/push/deploy,
backup/migration/reset/stash was touched.

### Next smallest C20h (not started)

Keep route/UI/reserve disabled. Bind an immutable advisory quote/freshness snapshot
to this exact prepared source/action/intent (including live balance and relevant
rule evidence), then prove stale/repeated validation and rollback through the same
parent. Specify the needed grant-lifetime guarantee against the existing device
epoch/grant owner; do not infer historical revocation continuity from row presence
or change device roles. A separately authorized reservation slice must still prove
canonical reserve/hold eligibility, reservation ID/quote/expiry/live status,
Companion paid tender/Finance authority, concurrent revoke ordering, immutable spend
ACK security and durable replay. Cash+points settlement, offline/refund and physical
ACK-loss/spend E2E remain open. C20g stops at this read-only checkpoint.

## C20h internal immutable advisory quote/freshness snapshot

`captureCompanionSaleBenefitsQuote` captures the existing C20g read-only
`CommerceBenefitsStore.previewReadOnly` result inside the authenticated Android
action owner's borrowed benefits parent. It uses C20f's exact unused opaque source
and established pre-BEGIN protected-key preparation. No production caller, route,
IPC, UI, shared wire or Android change consumes this seam.

The only capture result is a frozen empty, TypeScript-branded handle. Its provenance
is private WeakMap identity; no reusable HMAC/bearer token, quote, secret, expiry or
authorization object is serialized. Canonical request, full bound scope (including
rule/family revision and canonical retail/dealer pricing evidence), current available
points and quote are retained as an immutable canonical string in private memory.
The exact parent object/logical time, action, authenticated request context, intent,
intent binding and prepared allocation identities are retained with it. JSON,
cloning, archiving, another process/request/parent and rollback replay cannot restore
its authority. Nothing is persisted; it is not a durable benefits snapshot/receipt.

`revalidateCompanionSaleBenefitsQuote` requires all those same identities and an
active authorized parent on every repeat. It creates fresh C20g read ports and
rechecks credential/request lifetime, live spend grant, device record/epoch,
business/customer/capabilities, action/operation/payment/intent, canonical prices,
rule/family evidence and the canonical sale owner's still-unused allocation.
The original Store/context/rule/points/engine path recomputes the quote and available
balance; exact canonical evidence must match. Even a 5000 to 4900 balance change
that leaves the proposed points tender unchanged rejects. The returned advisory
result is an isolated deeply frozen value, with read-only authority and both
reservation/confirmation flags false. No supplied quote is accepted as authority.

The deadline is the earliest preparation/intent/parent 30-second bound, canonical
future rule start/end, customer/currency point-lot expiry or active reservation
expiry. `readCommercePointBalanceFreshUntil` in the canonical points owner reads
only a conservative time boundary; it does not calculate prices/balances, hold
points, write rows or open a transaction. It includes already allocated lots and
scoped active reservations conservatively. Wall time is checked before/after
recomputation, and backward time or expiry fails closed even while the synchronous
parent's logical time is unchanged. Changing that logical time also rejects.
This advisory snapshot contains no stock availability or stock reservation promise;
a price-neutral inventory change leaves the quote usable, and the actual sale
writer retains stock validation. C20g standalone read-only preview is unchanged.

No second calculator, ledger, schema, transaction, key lifecycle or payment evidence
was added. Capture/revalidate do not consume the source. The real canonical sale
owner can still adopt its allocation once; pre-sale revalidation rejects after
consumption. Reserve/hold/settle/release/refund/reverse/adjust/expire remain disabled.
Companion never becomes Desktop owner, and legacy no-points cash/credit immutable
ACK and exact replay retain their previous behavior.

### C20h proof and explicit limitations

The missing capture API assertion first failed RED (`undefined`); the final
`node scripts/smoke-companion-points-ingress.mjs` passes six groups (C20d/e/f/g/h
and legacy HTTPS). It source-loads actual owners/current schema into disposable
SQLite and uses real Node in-memory TLS/HTTPS. C20h tests exact repeat, deeply frozen
results, copied/JSON/missing/forged quote/currency/expiry handles, different key/source
preparation, DB/parent/action/context/binding/intent, action type/operation/payment,
device/business/customer, price/price group/family/rule changes, grant/token/device
revocation and epoch change. Same-action/context sequential borrowed parents reject
the old handle. Out-of-parent/archived/rollback use rejects. Rule start/end, lot and
active reservation expiry, clock reversal and expiry during recomputation reject.
Capture/recompute SELECT failures and a swallowed denial fail the parent closed.

Full-table equality and SQLite `total_changes()` equality around capture, repeat,
revalidation, denials and faults prove zero writes, including no-op writes. Fixture
rules/points/grant/stock/synthetic reservation provisioning occurs outside those
measurements and rolls back with the actual Android parent. Full-table equality
after each fixture proves zero new committed sale, Finance, action/operation/result
receipts or benefits effects; reservations, holds and point ledger remain empty.
A successful capture/repeat leaves its exact allocation consumable by the real sale
writer. C20g actual mutation-denial and C20f rollback/commit/exact ACK tests still pass.

Another operation's debit for the same customer changes available points and rejects
the snapshot; a different customer's debit does not affect it. A separate SQLite
connection cannot enter `BEGIN IMMEDIATE` while this authorized parent holds the
writer lock. This proves exclusion of an interleaving spend, not a new concurrency
or revocation-history guarantee. Existing benefits/sale concurrent writer tests pass.

Historical C20h finding (superseded by C20i below): revocation followed by regrant at the **same device epoch** restores live advisory
eligibility, even for this original handle; the test explicitly demonstrates it.
The current grant table has no generation/history, so uninterrupted authorization
cannot be proved. Changed device epoch rejects. No schema was invented, no epoch
was bypassed, and this limitation must not be interpreted as future reserve/replay
authority. Two-connection revoke ordering for this seam remains a separate proof.

Additional targeted results: principal PASS; benefits parent 2/2; Android sale action
receipt 3/3; financial and source boundaries PASS; commerce benefits 29/29; market
sale benefits 20/20; market sale benefits preview 9/9. Electron no-emit typecheck,
scoped ESLint, tracked `git diff --check` and touched untracked whitespace checks
PASS. The initial scoped lint found an unsafe `Object.values` argument in deep
freezing; it was narrowed to unknown values and the recheck passed.

`node scripts/smoke-companion-points-ingress.mjs --tcp` was attempted against only
the disposable fixture and loopback ephemeral port; sandbox `listen EPERM
127.0.0.1` prevented TCP proof. Run that exact command externally on the host.
Earlier C20g host proof does not cover C20h. The live C19 Electron process/database,
paired SM-J700F and HTTPS port 47831 were untouched. No real OS keystore, physical
points spend/payment, Android build, hosting, full/pre-main/release, packaging,
commit/push/deploy, backup/migration/reset/stash was performed.

### Next smallest C20i (not started)

Keep route/UI/reserve disabled. At the existing grant/device-epoch owner, make the
required grant-lifetime decision explicit and add two-connection revoke-before-parent
and revoke-waits-for-parent ordering proof in a separate bounded slice. Without a
grant-generation decision, claim no continuous authorization or reserve/replay
authority. Actual reservation ID/quote/expiry/live-status, Companion paid tender and
Finance, immutable spend ACK/durable replay, offline/refund and physical ACK-loss/
spend E2E require later separately authorized work. C20h stops at this checkpoint;
C20i does not start automatically.


## C20i owner-issued durable spend-grant lifetime

The real `database/android-benefits-spend-grant-store.ts` owner now generates a
fresh 256-bit `node:crypto.randomBytes(32)` hexadecimal `grant_generation` on every
successful grant INSERT **and** conflict UPDATE. Reissuing an otherwise identical
grant rotates it without requiring revoke or changing the device epoch. The value
is independent of customer/request data and cannot be supplied through owner call
arguments, credentials or client JSON. Owner authorization, scope/capability gates,
expected device-record guard and atomic owner SQL statement remain mandatory.
This is a per-grant lifetime, not a global epoch, counter or authorization log.
Granting another customer does not invalidate this customer's generation.

The owner table is the sole source of generation evidence. Its read helper retains
the existing business/customer/device/epoch/permission/capability/family predicates;
missing or invalid lifetime evidence grants nothing. `canSpendAndroidBenefits`
still returns a boolean. `readCompanionPointsPreparationScope` includes the current
owner generation; `requireCompanionPointsPrincipal.assertAuthorized` rereads it in
the caller's existing transaction and requires the original generation. The same
field enters C20d's immutable scope/fingerprint and C20f's pre-BEGIN source scope
comparison. Thus C20g ports and C20h capture/revalidation inherit the check through
the existing intent/source path, with no duplicate quote calculator or transaction.
An old binding/snapshot fails `COMPANION_POINTS_INTENT_CHANGED` after same-epoch
regrant/reissue. A new intent with an old pre-BEGIN preparation fails
`COMPANION_POINTS_SOURCE_SCOPE`; a fresh preparation and binding can read again.
C20b's original principal fails `COMPANION_POINTS_DENIED`. A live grant is still
required on every read; generation equality alone confers no authority. No token,
key, serialized grant authority or new shared wire field is exposed.

### Clean-start compatibility decision

Canonical `schema.sql` adds `android_benefits_spend_grants.grant_generation TEXT
NOT NULL` with a 64-character lowercase hexadecimal CHECK and **no default**.
This explicitly changes the clean-start schema. Old databases without the column
are unsupported by these owners and can raise SQL schema errors; there is no
fallback that treats an old row/epoch as a valid generation. There is no migration,
ALTER, startup backfill, compatibility shim, backup conversion or active DB reset.
Pilot data remains disposable per the user's decision, but **no active database
was opened or changed in this slice**. Only newly created isolated current-schema
fixture DBs were used. C19 Electron, HTTPS 47831, its DB and paired SM-J700F were
neither queried nor restarted. Any future adoption of this source on old data
requires a separately performed clean start; it was not performed here.

### C20i proof and limits

The existing principal smoke first failed RED with `Missing expected exception`
when its old principal regained authority after same-epoch revoke/regrant. With
the owner generation and scope bindings it passes GREEN. A final ingress rerun initially failed with `COMPANION_POINTS_QUOTE_EXPIRED`:
C20d's unrelated fixture rule had a real-time +10s start that crossed a later
worker quote's freshness boundary. After the window-change assertion, the fixture
now publishes canonical rule version 3 with a stable past start. This removes the
scheduling dependency without relaxing production quote expiry; the rerun passes.
The existing ingress
smoke replaces C20g/h's former regrant allowance with explicit denials and adds
reissue-without-revoke denial, retaining exact quote/repeat and old paid/credit ACK
behavior. Source, preparation, intent and quote denials are measured with full-table
equality **and** zero `total_changes()` delta, including no-op writes. Fixtures
provision rules/points outside the measured readers and roll them back with the
canonical Android parent; no new Companion reservation/hold/point ledger/Finance
writer was added. The C20i failed parents leave every table unchanged except the
explicit independent owner grant/revoke commits. Existing legacy sale tests still
exercise their established sale/Finance writes and immutable receipt replay.

`smoke-companion-points-ingress.mjs` runs the new test helper
`test-helpers/companion-spend-grant-concurrent.mjs`: a real worker with a separate
SQLite connection to `saleFixture`'s disposable WAL/current-schema DB. Both
connections have `busy_timeout` (parent fixture 5000 ms, worker 100 ms). MessagePort
responses and bounded Atomics completion barriers order actual SQL results; there
are no scheduling sleeps or elapsed-time assertions. Each barrier is at most ten
seconds, and failure/success cleanup terminates the worker in `finally`.

- Owner revoke commits on the worker **before** the canonical parent BEGIN:
  preparation was previously valid, parent authorization now denies, and no sale,
  benefits, Finance or receipt mutation survives.
- Parent `BEGIN IMMEDIATE` wins first: the worker executes the actual owner's
  DELETE and receives SQLite error 5 (`SQLITE_BUSY`), with zero worker row changes
  and no transaction left open. The parent can still revalidate its quote. After
  the canonical parent rollback releases the lock, the worker retry commits revoke;
  all later preparation/current principal authorization fails until a new grant.
  This proves the permitted BUSY/retry serialization branch, not a blocked writer
  successfully waiting through a parent commit or a production automatic retry.
- Worker revoke then regrant commits in the **same** device row/epoch: old pre-BEGIN
  preparation fails even with a freshly bound intent; a new preparation passes.
  Owner reissue alone has the same behavior. Same-parent captured C20h handles and
  existing C20b principals also reject their old generation.
- Worker grant/revoke rollback restores the exact original generation and full DB
  state, and the original principal remains valid. The principal smoke additionally
  rejects a transient principal minted from a generation which was rolled back.
  Device epoch changes remain independently fail closed; unauthorized owners/stale
  record IDs do zero writes and cannot rotate a generation.

Targeted commands/results: `node scripts/smoke-companion-points-ingress.mjs` **7
PASS groups** (C20d/e/f/g/h/i and legacy in-memory TLS/HTTPS);
`smoke-android-benefits-spend-grants.mjs`, `smoke-companion-points-principal.mjs`,
`smoke-android-device-authorization-epoch.mjs`, `smoke-android-point-spend-quote.mjs`,
`smoke-android-benefits-financial-boundary.mjs` and
`smoke-android-sale-source-boundary.mjs` **PASS**;
`smoke-companion-benefits-parent-contract.mjs` **2/2**;
`smoke-android-sale-action-receipt.mjs` **3/3**; `smoke-commerce-benefits.mjs` **29/29**;
`smoke-market-sale-benefits.mjs` **20/20**;
`smoke-market-sale-benefits-preview.mjs` **9/9**. All are direct `node scripts/...`
commands against isolated fixtures. Electron `tsc --noEmit -p
apps/desktop-app/tsconfig.electron.json` and scoped ESLint on the four TS owners,
three changed smokes and new helper **PASS**. Tracked `git diff --check` and all
11 C20i file whitespace checks **PASS**. The full scan of all 171 untracked files is **FAIL (preexisting, unrelated)**:
one extra EOF blank line in
`apps/desktop-app/src/components/settings/secure-pairing-qr-code.ts:223`; it is
outside this slice and was left untouched.

No new production caller/route/UI/IPC/mobile spend/reserve/settle/payment authority,
ledger, Finance path, grant history service or durable replay/snapshot was enabled.
This proves a durable committed grant-lifetime boundary under SQLite writer
serialization; it does not prove uninterrupted authorization across arbitrary
external changes, restore/process replay, actual reservation/settlement or immutable
spend ACK. C20i did not rerun TCP host proof, real keystore/device/physical spend,
APK/build/installer/full/pre-main/release/deploy/commit/push/reset/stash/rebase.

### Next smallest C20j (not started)

In a separately authorized server-only contract slice, specify and test fail-closed
requirements for a canonical reservation's ID, quote, expiry and live-status and
where this grant generation must be revalidated at future reserve/settle boundaries.
Reuse the existing benefits parent/owner; keep production route/UI/mobile spend off.
Do not infer paid tender/Finance authority or immutable spend ACK/durable replay
from advisory quote success. Actual reserve/settle, Companion payment/Finance,
offline/refund and physical ACK-loss/spend E2E remain later explicitly authorized
work. Stop at this single C20i checkpoint; do not start C20j automatically.

## C20j internal canonical reservation witness (read-only checkpoint)

Session `01a18b82-5df1-7e81-95e6-d85989f42f6b`, current worktree
`main@fca57c5a6bf0916e294ae77ccf6ef12499b19ad2`. This is internal evidence only.
There is no production caller, route, IPC, UI or Android spend/reserve endpoint.
C20h remains an advisory quote and cannot be used as a reservation witness.

### Canonical lifecycle and ownership, verified from the current source

| Evidence | Existing owner and exact meaning |
| --- | --- |
| Reservation ID | `CommerceBenefitsStore.reserve` generates `randomUUID()`, inserts the canonical row and saves a reserve receipt in the caller's existing transaction. It is not action ID, sale ID or an Android-provided ID. Active source uniqueness is enforced by `(business_id,source_kind,source_id)`. |
| Request/source | Immutable stored intent captures business, customer, source kind/ID, channel, currency, product/quantity lines, payment method and requested points. C20f's opaque allocation belongs to the real sale owner and binds the unused sale source to the authenticated action; the witness requires that exact source. |
| Quote/rules | Store resolves current canonical context, family flags and point balance and uses the existing calculator. Reserve persists quote and applied rule versions. Read and settle now share the same private quote validator, including exclusion of this reservation's own hold from the available-balance calculation. No second calculator is introduced. |
| Expiry | Reserve chooses the minimum of five minutes, coupon expiry, applied rule end and the point-hold lot deadlines. Live means **`now < expiresAt`**, never equality. Read never sweeps expiry. A row may still say `active` after its deadline; that row is rejected. A later canonical reserve sweeps such rows to `expired`. |
| Status | Schema values are exactly `active`, `settled`, `released`, `expired`. Settle changes active to settled; release changes an eligible row to released. Reverse writes reversal evidence/point entries and leaves the reservation **settled**; there is no `reversed` reservation status. None of these mutations is authorized for Companion. |
| Key/operation | Canonical receipts are unique per `(business_id, operation_key)` and bind operation plus key-derived intent HMAC. Reserve HMAC includes the stored request and coupon digests. An operation-kind or intent/key mismatch rejects. An exact reserve replay returns its original receipt **before** checking current expiry/status; the returned ID alone does not establish liveness. The witness separately checks live row, receipt ID/quote/expiry and the current quote. |
| Grant lifetime | C20i's existing grant owner remains the only issuer of generation. Every witness read reuses current principal/intent/source validation, including the exact generation, device record/epoch and authenticated action. No grant is inferred from reservation existence. |

### Implemented boundary

`CommerceBenefitsStore.readReservationReadOnly` requires the explicit read-only
parent port. It accepts only an internal `{reservationId, operationKey}` reference,
compares the full expected stored intent and row scope, checks the canonical reserve
receipt with the already loaded protected key, requires active/unexpired status and
no settled source snapshot, and recomputes quote/applied-rule evidence through the
settlement validator. This points-only boundary rejects coupon holds and extra
reference fields; there is no client quote/expiry/status override. The normal
Store mutation authorization remains separate and unchanged.

`captureCompanionSaleBenefitsReservation` and
`revalidateCompanionSaleBenefitsReservation` reuse C20g's pre-sale read ports and
C20f's key/source preparation. The empty frozen handle has WeakMap provenance and
is tied to the identical active benefits transaction object/time, action/context,
intent binding, preparation and action fingerprint. Every repeat rereads the
principal, grant generation, price/rule scope, unused source and canonical
reservation. Returned evidence is deeply frozen. The private reference is copied;
caller mutation cannot redirect it. Clone/JSON/advisory handles, another DB/parent,
post-rollback and later borrowed parent use fail closed. Caught reader errors poison
the existing parent. No nested or second transaction is opened.

Freshness is bounded by reservation expiry and the existing intent/preparation,
30-second, rule-window and balance/hold deadlines. Both logical parent time and
wall-clock start/end checks apply, including expiry during a read and clock rollback.
The shared freshness helper preserves C20h's existing checks. Android payload/intent
allowlists still reject reservation fields; no wire field was added. Authority is
always `read_only`, `canReservePoints=false`, `canConfirmPoints=false`.

### Proof and limits

RED: ingress first failed on the missing capture API (`undefined` versus function).
GREEN: `node scripts/smoke-companion-points-ingress.mjs` **8 PASS groups**: C20d/e/f/g,
C20j, C20i, C20h and legacy HTTPS ACK. C20j adds **54 matrix scenarios plus initial
exact-read/repeat**. It constructs actual reservations/holds/ledger entries using
the source-loaded canonical Store and existing fixture parent ports in disposable
current-schema SQLite, without inventing a `desktop_owner` for Companion. Release,
settle and reverse fixtures invoke those real canonical owners outside measured
readers. Only the explicit fake-row rejection test fabricates a reservation row;
it fails because no canonical reserve receipt exists. Quote/expiry UPDATE attempts
are rejected by the existing immutable SQL trigger, which is left intact.

Covered: absent/forged/foreign ID; business/customer/source kind and ID/currency/intent
mismatch; wrong operation kind/key and protected key; client quote/expiry reference;
released/settled/reversed/replayed ID; price/rule changes; same-epoch grant revoke,
regrant and owner reissue; handle/action/device/context/parent/DB isolation; payload
injection; rollback/parent poison; expiry before/equal/after and during read; read
faults. An independent source-loaded worker's actual grant-owner DELETE receives
SQLite error 5/BUSY while this parent owns BEGIN IMMEDIATE, changes zero worker rows
and leaves the witness valid. This is the BUSY serialization branch, not a waiting
writer commit or automatic retry guarantee. C20i's existing before-parent revoke
and after-rollback retry tests remain passing.

Every measured factory/capture/revalidation success, denial and fault checks full
table equality and zero `total_changes()` delta, including no-op writes. Every C20j
ingress parent is deliberately rolled back, including canonical fixture provisioning;
no reservation, Finance, stock, ledger, outbox or Android receipt survives it. Legacy
cash/credit sale ACK and immutable replay tests retain their existing behavior.

`node scripts/smoke-commerce-benefits.mjs` **32/32** (three new canonical read tests)
also proves strict logical expiry before/equal/after, active-but-expired rejection
without lazy writes, the real reserve-owner sweep to `expired`, canonical price
and applied-rule-version quote changes, read-port requirement, operation intent
rejection, receipt-ID mismatch between two real reservations with the same intent
after release/re-reserve, and pending-parent rollback.

Other targeted results: parent contract **2/2**, Android sale source boundary **PASS**,
sale action receipt **3/3**, market sale benefits **20/20**, market sale benefits
preview **9/9**, Companion principal **PASS**, Android benefits spend grants **PASS**,
Android benefits financial boundary **PASS**. Commands are `node scripts/smoke-<name>.mjs`
with names recorded in the continuation backlog. Scoped Electron typecheck, ESLint
on all five changed code/test files, tracked `git diff --check` and all seven touched
untracked-file whitespace checks **PASS**. No full untracked-tree cleanliness claim.

### Exact blocker and next smallest C20k (not started)

A canonical reservation does **not** persist device/action/authorization epoch or
grant-generation issuance evidence. Its reserve operation key binds the benefits
intent/source, not an Android principal history. This witness proves current
same-parent matching evidence; it cannot establish which grant lifetime originally
authorized reservation creation, durable replay or a future settlement. There is
no authorized production Companion producer of its internal reference. The test
fixture's canonical write authority must never become a production port.

Smallest C20k: a separately authorized owner-contract/fail-closed slice deciding how
the existing canonical parent would bind reservation issuance to authenticated
action/source/operation and the C20i generation, and where it must revalidate that
binding immediately before reserve and settle. Decide parent-only atomic use versus
any required durable replay evidence explicitly; do not infer it from this handle
or create an independent authority. Keep production mutations closed until that
decision and Companion paid-tender/Finance authority are established. Actual
reserve/hold/settle/refund/release/expire/adjust/transfer, immutable spend ACK,
offline/refund and physical ACK-loss/spend E2E remain unimplemented.

C20i's default-free `grant_generation` clean-start incompatibility is unchanged.
No migration, compatibility shim, DB reset or active data access occurred. In-memory
TLS/HTTPS and isolated SQLite proof are test evidence, not field/device/keystore or
real loopback proof. Host tester must run
`node scripts/smoke-companion-points-ingress.mjs --tcp` for the new C20j cases;
previous host C20i results do not cover them. No TCP bind was attempted here.
Stop at this C20j checkpoint; C20k does not start automatically.

## C20k — internal same-parent reservation issuance gate (2026-10-30)

**Decision:** one synchronous request in the existing Android action parent's
`BEGIN IMMEDIATE` needs process-local issuance evidence, not a new durable schema.
No production Companion reserve/hold/settle/release/refund/reverse/adjust/expire,
paid-tender/Finance permission, public route, wire field or UI is enabled. No new
production caller invokes the issuance APIs or a points writer.

### Canonical owner and exact binding

`prepareCompanionSaleBenefitsIssuance` creates a frozen, identity-checked source
handle. Its private state retains the exact transaction, authenticated ingress
context, action object/fingerprint, opaque source preparation and immutable intent
binding. That binding includes business/customer/device ID + device-record ID,
authorization epoch + owner-issued grant generation, action ID/type/hash, currency,
current prices/product revisions/groups and full rule/settings revision. The
canonical sale operation ID is the action ID. The reserve operation key is derived
on the server with the established protected key from action/operation/source;
it is not accepted from Android. No credential or key is exposed.

`CommerceBenefitsStore.prepareReservationIssuanceReadOnly` owns the opaque reserve
gate. It binds the exact parent object, normalized request, operation key, protected
key proof and expected canonical quote. It grants **no** authority: `Store.reserve`
still calls its existing parent authorization first. Its optional fifth argument
adds a single-attempt, synchronous gate, without changing existing callers:

1. Reject forged/foreign/reused gates, altered request/source/operation, coupons
   and any pre-existing reserve receipt (including exact canonical replay).
2. Immediately before the existing reserve writer, re-read the authenticated
   principal, live grant generation, source, prices/rules/balance and canonical
   quote through C20h. Async callbacks fail the existing transaction guard.
3. Reuse the existing reserve calculation/hold/receipt writer. Its computed quote
   must equal the gate's expected quote. Only **after** the real reserve receipt
   INSERT succeeds does the canonical owner privately bind the exact returned
   receipt object and its immutable serialized evidence to that gate.

`captureCompanionSaleBenefitsIssuedReservation` accepts only that owner-bound
receipt object in the same parent. A copied/JSON/tampered receipt, a reserve made
without the gate, an older reserve adopted by a later gate, or C20j's witness
cannot establish issuance. It revalidates current Companion scope, then captures
the existing C20j reservation witness from the owner-derived reference. Capture is
one-shot; repeat reads use `revalidateCompanionSaleBenefitsIssuedReservation`.
That reader requires the original source-handle identities and rechecks live
principal/generation, canonical receipt, reservation ID/operation/source/quote,
strict expiry and active status every time. Released/expired/settled/reversed
reservations fail, even if `Store.reserve` can still replay an older receipt.

This closes the **same-parent issuance provenance** gap. It does not upgrade C20j
witnesses or authorize any mutation. Before any future same-request settle, the
real parent must call the issued-reservation revalidator immediately before its
existing writer **and** independently establish Companion paid-tender/Finance
permission. No settle authority adapter is supplied here. Before a future reserve,
passing this gate must be mandatory in that separately authorized Companion parent;
its omission currently cannot bypass the Companion ports' unconditional denial.

All scopes are borrowed from the existing synchronous parent. No BEGIN/COMMIT,
second ledger/quote engine, new outbox/ACK, reservation schema change, startup
backfill or migration is introduced. A caught gate/reader/writer error poisons the
parent; a failed receipt INSERT cannot publish owner issuance evidence. Handles
cannot cross parent/DB/request/process lifetimes or survive rollback as authority.
The WeakMaps hold process-local identity evidence, never bearer tokens.

### Durable inter-request issuance remains explicitly unavailable

A new request, retry after rollback, process restart or deferred settlement must
fail closed with these handles. The existing benefits receipt HMAC binds checkout
intent, not the authenticated device/action/grant lifetime. No durable issuance or
spend ACK/replay is inferred from a matching reservation row or receipt JSON.

If a separately authorized design actually requires reserve and settle in different
requests, the minimum canonical clean-start addition is an **immutable issuance
envelope written by Store.reserve in the same parent transaction as the reservation,
hold and reserve receipt**, never by an ingress reader. It needs:

- Composite business/reservation reference and reserve-operation receipt reference;
  the existing immutable reservation supplies customer/source/currency/quote/expiry.
- Authenticated device ID + device-record ID, authorization epoch, grant generation;
  action ID/type/intent hash and canonical operation ID; scope digest covering the
  current product prices/revisions/groups and full rule/settings revision.
- Issued-at time and key ID/HMAC binding that entire envelope to the immutable
  canonical reservation/quote/expiry and reserve receipt. No second expiry, quote,
  point balance or ledger authority is needed.
- Uniqueness preventing a second issuance for the same business/action/operation,
  plus the existing canonical source and operation constraints. The current owner
  must atomically return/verify this envelope with its receipt. Deferred consumers
  require exact live generation/epoch/principal + active status/strict expiry,
  and use the existing action receipt/outbox/ACK owner for committed replay.

This is an interface/schema requirement for a future explicit decision, **not an
implemented table, migration or compatibility fallback**. It does not supply the
still-missing paid-tender/Finance authority. C20i's old-DB `grant_generation`
incompatibility is unchanged; no running/pilot DB was inspected or reset.

### Verification and remaining gate

The existing source-loaded current-schema ingress smoke adds **71 matrix cases
plus initial exact read/repeat**, with independently authorized canonical fixture
Store/point owners, never a fabricated Android `desktop_owner`. It covers gate
forgery and omission, late adoption/replay, canonical quote mismatch, pre-reserve
and post-issuance grant revoke/regrant/reissue in the SAME epoch, epoch change,
context/action/device/customer/business/currency/intent/source kind+ID/operation,
price/rule/balance drift, nonlive status, expiry/clock rollback, receipt
clone/JSON/tampering, duplicate capture/gate, cross DB/parent, rollback/archive,
caught read error and caught receipt-writer failure. Real fixture release/settle/
reverse owners produce lifecycle rejection cases; one explicit fixture-only status
UPDATE supplies the expired-status rejection. All those fixture writes roll back.

Every measured preparation/capture/revalidation and pre-write denial asserts full
SQLite table equality and zero `total_changes()` delta, including no-op writes.
Canonical fixture provisioning/writing is outside those reader measurements. Each
C20k ingress action intentionally rolls its whole parent back, leaving zero new
sale, stock, Finance, points, outbox or Android ACK/receipt. A real independent
SQLite grant-owner worker receives BUSY/error 5 with zero writes while the parent
holds BEGIN IMMEDIATE. Existing C20i tests also prove committed revoke-before-BEGIN
and after-rollback retry ordering; no waiting-writer or auto-retry claim is added.
Real Companion reserve/settle/release/reverse/refund/adjust/expire still deny even
when handed valid internal issuance evidence; reserve also denies its hold path.

Final targeted results (all `node scripts/smoke-<name>.mjs`, exit 0):

| Smoke | Result |
| --- | --- |
| companion-points-ingress | 9 groups, including C20k's 71 cases + initial read/repeat |
| commerce-benefits | 32/32 |
| companion-benefits-parent-contract | 2/2 |
| market-sale-benefits / market-sale-benefits-preview | 20/20 / 9/9 |
| commerce-order-benefits / table-order-benefits | 24/24 / 20/20 |
| android-sale-action-receipt | 3/3 |
| companion-points-principal / android-benefits-spend-grants | PASS / PASS |
| android-benefits-financial-boundary / android-sale-source-boundary | PASS / PASS |
| android-device-authorization-epoch / market-android-sales | PASS / PASS |

Electron `tsc --noEmit -p apps/desktop-app/tsconfig.electron.json` and scoped ESLint
`--max-warnings=0` on the four changed code/test files pass. Tracked
`git diff --check` and all six touched untracked-file checks pass. Baseline hashes
show only the six C20k files changed; all unrelated pre-existing content and the
main@fca57c5a worktree/status inventory remain intact. The backlog records the
session ID and exact paths. Initial epoch smoke ENOENT was resolved by creating
only its missing `/tmp/opencode` directory. A parallel compilation run timed out
at the grant worker startup barrier; the final standalone ingress run passed,
without changing the worker or its timeout. The initial missing-API RED and these
execution retries are distinct from the final GREEN results.

Evidence is isolated SQLite + real in-memory Node TLS/HTTPS, not a running DB, phone,
keystore, field spend or physical ACK-loss test. TCP was not bound here; a host
may separately run `node scripts/smoke-companion-points-ingress.mjs --tcp` for C20k.
No full/pre-main/release suite or release artifact was run.

### Exact blocker and next smallest C20l (not started)

Production Companion paid-tender/Finance authority and its mandatory parent
reserve/settle integration remain absent. The next separately authorized bounded
C20l should define and test that **internal parent owner contract**, using canonical
sale/tender/Finance evidence for mixed/all-points cases, mandatory issuance gates
before reserve/settle, and full rollback on disagreement. Keep mutation ports,
route/UI/wire/payment grants and new production points writes closed. Decide any
durable envelope only if multi-request issuance becomes a real requirement; do
not add the speculative schema above merely to progress the milestone. Durable
spend ACK/offline/refund and physical device/ACK-loss E2E remain later work.
**Stop at C20k. C20l is not started.**


## C20l — internal paid-tender/Finance proof and terminal negative parent gate (2026-10-30)

**Decision:** the current canonical owners can prove persisted cash tender and
all-Puan accounting in an isolated parent. They cannot yet prove a fresh immutable
Android points-sale operation receipt or an external card/bank/other transaction.
C20l therefore exposes a read-only evidence comparison and a **terminal negative
contract**, not Companion settlement authorization. No production caller, route,
IPC, wire/Android API, UI payment/receipt or points writer is added.

### Evidence and owner boundaries

`market-sale-paid-evidence.ts::readMarketSalePaidTenderEvidence` borrows the active
`BenefitsTransaction`. Its request and expected quote must come from server-owned
scope and the canonical reservation reader; they are comparison expectations,
never client-authorized amounts. Returned cash/Puan amounts are read independently
from `commerce_sale_settlements`. It checks:

- Exact sale source ID/kind, business/customer, Android sale provenance, currency,
  method, nondeleted PAID/closed sale, and absence of order fulfillment/full refund.
- Immutable canonical tender identity/method/time, integer nonnegative amounts,
  sale subtotal/discount/total and canonical quote amounts/currency/exponent.
- One live income Finance row for nonzero cash, with exact amount/currency/method.
  **All-Puan requires zero Finance rows**, including no deleted or spurious income.
- Exact product/quantity/item-price/line/subtotal evidence, using the existing
  retail/dealer price resolver. Applicable stock movements must match product,
  business, sale reference, requested/primary location, quantity and Android source.

A PAID cash sale with its immutable received tender supplies `cash_received`
evidence. Zero remaining external tender supplies `points_only` evidence.
Card/bank/other with nonzero cash fail
`COMPANION_POINTS_EXTERNAL_TENDER_EVIDENCE_REQUIRED`: a client
`external_payment_confirmed`, method configuration, tender label or Finance
projection is not transaction-specific external payment proof. No second payment,
quote or Finance engine is introduced. The reader returns a deeply frozen small
projection with `canReservePoints=false` and `canConfirmPoints=false`; it confers
no principal or mutation authority.

`companion-sale-benefits.ts::revalidateCompanionSaleBenefitsPaidParent` is the
explicit **immediately-before-hypothetical-settlement negative seam**, with return
type `never`. Inside the identical existing `BEGIN IMMEDIATE` parent it requires
C20k's original source-issuance handle and fresh exact canonical reserve receipt
witness. It rereads live authenticated context/action/device-record/business/
customer, action hash, grant generation/epoch, current price/rule/coupon/settings
scope, active reservation/receipt/quote and strict wall-clock expiry. It then
compares independent persisted paid evidence against that reservation quote.
The private paid-evidence reader branch permits these comparisons after fixture
sale provisioning; the public pre-sale adapter still requires an unused allocation.
No used allocation is returned to a writer and every mutation port still denies.

Existing Android ACK/result rows reject `COMPANION_POINTS_PARENT_ALREADY_APPLIED`.
The final gate requires operation ID (= action ID) to map to that exact canonical
sale/business and reuses `readMarketSaleOperationSourceInTransaction` for the real
request hash. Missing receipt fails `COMPANION_POINTS_PARENT_RECEIPT_REQUIRED`;
wrong mapping fails `COMPANION_POINTS_PARENT_RECEIPT_SCOPE`; wrong hash retains
`COMPANION_POINTS_SOURCE_SCOPE`. Even valid SQL mapping/hash fails
`COMPANION_POINTS_PARENT_RECEIPT_PROVENANCE_REQUIRED`.

**Why the last denial is necessary:** `commerce_market_sale_receipts` has source
uniqueness and a request hash, but no immutable UPDATE/DELETE guard or fresh
same-parent owner-issued receipt identity. A test obtains the real canonical
operation owner's valid hash from a separate zero-Puan sale, relabels its SQL
mapping to the provisioned Puan sale, and demonstrates that the old mapping reader
alone accepts it. C20l rejects it. The canonical Android operation owner also has
no allowed allocated-source + Puan-tender path today. C20l does not change either
writer or adopt a fixture's privilege as Companion authority.

Every gate/reader error poisons the existing benefits parent, even if caught.
No connection, BEGIN/COMMIT, nested transaction, schema/migration, new ledger,
receipt/ACK/outbox writer, or Finance projection write is introduced. C20k handles
remain same-parent/request/process only; restart/retry/another request is not a
durable spend ACK. Canonical Desktop paid benefits and legacy Android cash/credit
receipt behavior remain owned by their existing code.

### C20l test evidence

RED: the added real-sale scenario initially failed with `ENOENT` for the absent
paid-evidence owner module. GREEN uses the existing ingress/current-schema SQLite
harness and canonical Store reserve + Commerce sale/tender/stock/Finance owners.
The sale owner receives the **actual canonical reserve receipt quote**, resolves
its own prices, and persists its real tender and Finance. No synthetic client total
or fixture settlement JSON supplies the paid evidence. No Android desktop-owner
role is manufactured. Fixture provisioning is outside reader measurements.

C20l adds 48 ingress action scenarios: initial mixed cash/Puan exact read/repeat,
41 denial/concurrency/poison cases, three all-Puan cases and three external-method
negative cases. Coverage includes missing/wrong/deleted/duplicate Finance (the
fixture alone temporarily drops its uniqueness index for duplicate corruption),
zero-cash spurious Finance, missing/mismatched immutable tender (fixture alone drops
its immutability trigger for corruption), credit/open/pending, forged total/Puan,
source/customer/business/currency/items/stock/location, grant revoke/regrant/reissue/
epoch, price/rule/coupon drift, disabled device/family, parent/action/context/handle
copies, expiry, forged/relabelled operation receipts and Android ACK replay.
Independent revoke during the held BEGIN returns BUSY/error 5 and zero writes;
existing C20i committed-before-BEGIN and after-rollback ordering stays covered.

Every measured success/repeat/denial checks **all-table equality and unchanged
`total_changes()`**, including no-op writes. Every fixture action rolls its outer
parent back: provisioned sale/items/tender/stock/Finance/points/outbox/receipt all
return to baseline. A deliberately caught final denial still aborts the parent.
These are isolated current-schema SQLite + real Node in-memory TLS parser tests,
not physical-device, live-hosting or durable spend/ACK-loss evidence.

Validation (all exit 0): `node scripts/smoke-companion-points-ingress.mjs`
**10/10 groups** (48 C20l scenarios; final standalone 45.7 seconds),
`smoke-commerce-benefits.mjs` **32/32**,
`smoke-companion-benefits-parent-contract.mjs` **2/2**,
`smoke-android-sale-action-receipt.mjs` **3/3**,
`smoke-android-benefits-financial-boundary.mjs` **PASS**,
`smoke-market-sale-benefits.mjs` **20/20**, and
`smoke-market-android-sales.mjs` **PASS** (legacy paid/credit ACK/retry).
Electron `tsc --noEmit -p apps/desktop-app/tsconfig.electron.json` and scoped ESLint
`--max-warnings=0` for the four code/test files **PASS**. `git diff --check` and
separate `git diff --no-index --check /dev/null <path>` for all six touched
untracked files **PASS**. An intermediate forged-hash test expectation was corrected
to retain the existing `COMPANION_POINTS_SOURCE_SCOPE`; the independently valid
owner-hash/relabel case separately proves the provenance denial. Initial typecheck
SQL-value narrowing errors were corrected before the final passing run.
Only the six named checkpoint files differ from the initial SHA-256 baseline;
all unrelated pre-existing files retain their hashes. HEAD/branch remain unchanged.
No TCP bind was attempted this checkpoint; C20k host TCP evidence is historical,
not a C20l TCP run. No full/pre-main/release/build/device/live-data validation.

### Exact blocker and next smallest C20m (not started)

A separately authorized owner-contract slice should establish a **fresh immutable
same-parent canonical sale-operation receipt witness**, binding operation/request
hash + opaque allocation/sale + business/customer and the already checked C20k
issuance. It must be produced by the existing canonical operation owner after its
sale/tender/Finance writes, reread before hypothetical settle, and reject copying,
SQL relabelling, replay, parent mismatch and any caught error. Decide the minimal
owner interface first: the current owner explicitly disallows allocated source
with benefits, while the current receipt is mutable. Do not bypass either with a
reader, fixture authority, another writer or speculative migration. C20m must not
silently enable Companion mutations. External methods additionally require real
transaction-specific canonical confirmation evidence; absent that, preserve their
precise denial (cash/all-Puan proof does not fill this gap).

Production reserve/hold/settle/release/reverse/adjust/refund/expire and new Puan
writes, user-visible payment/receipt, durable multi-request spend ACK/offline/refund
and real-device ACK-loss E2E are intentionally unimplemented. No live C19/pilot DB,
paired device, Electron, hosting, admin/effect/site collaborator was touched.
**Stop at this C20l checkpoint. C20m does not start automatically.**

## C20m — fresh canonical operation receipt observation; points parent still closed (2026-10-30)

**Decision:** mint a process-memory receipt identity only from the existing Market
sale operation, after its ordinary allocated Android cash sale, items, stock,
Finance and SQL operation receipt have succeeded. This proves canonical operation
provenance. It does **not** prove a Puan-paid parent: the owner still prohibits
allocated source + benefits, and its ordinary allocated sale has no benefits tender.
No successful Companion points settlement or end-to-end spend is claimed.

### Minimal owner contract

- `market-sale-operation.ts::prepareMarketSaleOperationObservation` creates a frozen,
  opaque WeakMap identity in the current registered `BenefitsTransaction`, bound
  independently to that exact transaction object, database, time, unused canonical
  allocation, operation ID and canonical request hash. It allows only the existing
  paid Android source, no draft, benefits execution, manual payment or discount.
- The optional sixth argument to `completeMarketSaleInTransaction` observes the
  existing writer. Omission preserves its previous path. The original writer body
  remains the sole private write implementation; there is no second sale/Finance,
  quote calculator, receipt writer or schema/migration. Before writes it consumes
  this observation once and rechecks allocation and parent. After all existing
  writes it validates exactly one operation receipt and the actual full-paid
  Finance income, rejects any benefits tender/snapshot, then rechecks the parent.
  Only here is one frozen concrete receipt object minted. It contains the operation
  hash, actual allocated sale/business/customer and actual ordinary cash/zero-Puan,
  currency/method. A replay never mints. Failed/caught writes poison the borrowed
  benefits scope and cannot yield a usable receipt.
- The internal callback is a synchronous parent/issuance recheck. `benefitsOperation`
  rejects async work; `total_changes()` rejects even a no-op SQL write. Transaction,
  DB and time must still match after the callback. The callback has no production
  caller and never provides a benefits authority or settlement quote to the writer.
- `readMarketSaleOperationObservation` requires the original opaque observation,
  allocation and active transaction. It returns the **same frozen receipt object**,
  comparing current operation receipt, sale/items/tender, snapshots, fulfillment/
  refund links, Finance and stock rows with the owner-captured snapshot. It also
  checks the current business and absence of action/result ACK. SQL rows, copied
  observations, receipt JSON, another parent/DB/time or an archived handle cannot
  mint or restore provenance. SQL receipt mutability itself is unchanged.

### Companion binding and fail-closed result

`prepareCompanionSaleOperationObservation` requires the real captured C20k issuance
and current canonical reservation. Its private owner callback revalidates the exact
issuance/action/context/binding/preparation, live HTTPS action parent, customer,
business, device/authorization epoch, spend-grant generation, request fingerprint,
quote/rules/balance and expiry both before and after canonical writes and on reads.
`readCompanionSaleOperationWitness` returns the owner receipt, freshly re-read
canonical reservation/quote and frozen server scope; permissions remain false.
External card/bank/other observation is rejected before sale writes because no
transaction-specific canonical confirmation owner exists, even with the Android
confirmation flag.

Immediately before hypothetical settle, `revalidateCompanionSaleBenefitsPaidParent`
rechecks any prepared operation observation and still requires independent C20l
paid-tender/Finance evidence. An actual observed allocated cash sale fails with
`COMPANION_POINTS_TENDER_REQUIRED`. The same happens with an all-Puan quote: the
current owner writes its ordinary cash sale, not zero-cash Puan tender. Tests roll
that entire parent back; they never graft tender/receipt SQL or fabricate a local
owner to turn it into a successful points parent. C20l's separate real Commerce
mixed/all-Puan tender comparisons and external-method denials remain covered.

### C20m evidence and limits

RED: the ingress smoke first failed on missing
`prepareCompanionSaleOperationObservation`. GREEN uses the existing ingress harness,
actual current-schema SQLite, canonical operation/Store and C20k fixture issuance.
The added matrix has **46 scenarios**, plus one all-Puan quote and three external
method scenarios (**50 total**). It covers exact repeated receipt object identity,
unminted/copy/JSON/stale/replay/parent/DB/time/allocation/hash/source/operation scope,
missing/changed SQL receipts and sale mapping to another actual owner-created sale,
Finance/stock/customer drift, action/device/tenant/grant revoke-regrant in the same
epoch, ACK collision, receipt-write fault, caught errors, async and writing callbacks.
Duplicate receipt insertion is rejected by the existing UNIQUE constraint; sale
source mutation is rejected by the existing immutable trigger, without weakening
those guards. The real second connection gets SQLITE_BUSY/error 5 and zero writes
while the action parent owns BEGIN IMMEDIATE; C20i before-BEGIN and after-rollback
revocation ordering is retained.

Measured reads/repeats and pre-write scope denials compare **every table** and
SQLite `total_changes()` (delta zero). Canonical provisioning/corruption is outside
those read measurements, and every scenario rolls back the complete parent,
including sale/items/stock/Finance/reservation/ledger/outbox/operation and ACK
receipts. The intentionally writing callback test attempts exactly one no-op,
observes its `total_changes` increment, rejects it and proves parent poisoning;
this is a negative hook test, not a zero-write reader pass.

Targeted results: final standalone ingress **11/11 groups, exit 0, 107.332 s**,
canonical benefits **32/32**, parent
**2/2**, Android receipt **3/3**, market benefits **20/20**, Android financial
boundary and legacy Market Android smoke PASS; Electron no-emit typecheck and
four-file ESLint PASS. `git diff --check` and touched untracked whitespace checks
are clean. The C20m `--tcp` attempt inside the Codex sandbox failed loopback bind with **EPERM**. After the C20m source/test changes, a separate Linux host invocation of `node scripts/smoke-companion-points-ingress.mjs --tcp` **passed 11/11 groups, exit 0 (110.41 s)** on real loopback TCP/TLS. Neither that test nor in-memory HTTPS provides physical-phone Puan spend, provider payment or ACK-loss E2E evidence. No full,
pre-main/release/build/deploy/live database/device validation was run.

### Exact blocker and next smallest C20n (not started)

Fresh ordinary-sale operation provenance is now available internally, but there is
still **no canonical allocated-source Companion Puan-tender execution contract**.
A separately authorized C20n should define/test the smallest internal owner port
that could bind the existing C20k issuance and quote to the same reserved sale and
canonical tender/Finance writer, with independent Companion authorization and
mandatory pre-settle rechecks. It must preserve the existing allocated+benefits
prohibition until a real owner contract replaces it; a copied Desktop authority,
fixture adapter, second writer or SQL tender graft is not that contract. Keep the
parent terminally closed if that contract cannot be proved safely. No production
reserve/settle, new ledger writes or public interface follows automatically.
External confirmation, durable spend ACK/offline recovery, refund and device
ACK-loss proof remain separate open work. **Stop at C20m; C20n is not started.**


## C20n — canonical tender preflight; execution authority remains closed (2026-10-30)

**Bağımsız host doğrulaması:** C20n tamamlandıktan sonra gerçek Linux loopback TCP/TLS üzerinden `node scripts/smoke-companion-points-ingress.mjs --tcp` **12/12 PASS**, exit code **0** (48,10 saniye). Yalnız izole current-schema SQLite ve test verileri kullanıldı; fiziksel telefonda Puan harcama, OS keystore, dış ödeme onayı ve ACK-loss E2E yapılmadı.

This checkpoint takes the explicitly permitted **test-backed fail-closed** option.
It does **not** establish successful Companion points payment, even in the fixture.
C20m's cash observation and C20k's issuance are still not payment authorization.

### Owner decision and exact internal inputs

`market-sale-operation.ts` owns a process-local opaque
`MarketSaleCompanionTenderContract`. `prepareCompanionSaleTenderContract` is an
internal consumer in `companion-sale-benefits.ts`; there is no production caller.
Its inputs are the original active BenefitsTransaction, exact action/context,
intent/binding/preparation and captured C20k issuance. It supplies the existing
opaque unused sale allocation and a synchronous reader of that original issuance.
No caller amount, quote, reservation ID, payment flag or Desktop role is added to
CompleteMarketSaleInput, IPC, public routes, shared wire or Android.

The owner binds DB/parent/time identity, operation/request hash and exact allocation;
every read rechecks the current principal, business/customer/device/action,
authorization epoch, grant_generation, prices/rules, receipt/reservation and expiry
through the original C20k reader. The reader must be synchronous and cannot increase
SQLite total_changes, including no-op writes. It independently resolves canonical
product prices and checks safe integer arithmetic:

- `subtotalMinor = discountMinor + pointsTenderMinor + cashPaidMinor`;
- `totalMinor = subtotalMinor - discountMinor = pointsTenderMinor + cashPaidMinor`;
- prospective Finance income equals cash only: all-Puan 0, mixed cash > 0;
- currency/exponent/accounting and original request/method must match; external
  card/bank/other remain denied without canonical transaction confirmation.

The frozen plan explicitly says `authority: unavailable`. Reading it consumes no
allocation and writes no sale, item, stock movement, tender, Finance, snapshot,
receipt, ACK or outbox. `assertMarketSaleCompanionTenderExecution` rechecks the
whole plan, marks its attempt and **always** raises
`COMPANION_POINTS_TENDER_AUTHORITY_REQUIRED`. Catching the denial poisons the parent;
rollback is still required. Clone/JSON/archived contracts cannot restore identity.
Even a server module supplying a callback to the low-level preflight cannot obtain
execution permission; callback injection is not an authorization mechanism.

### Why successful execution was not introduced

Both canonical owners still reject allocated source + benefits:
`writeMarketSaleInTransaction` in `market-sale-operation.ts` and
`createCommerceSaleInTransaction` in `commerce-store.ts`. Existing Desktop benefits
execution requires `desktop_owner`; that role must not be synthesized for Companion.
CommerceBenefitsStore reserve independently invokes `ports.authorize`; C20k's
gate does not grant it. Existing test helper `parentPorts()` authorizes fixtures,
not a real Companion payment. C20n reuses those already labelled rollback-only
canonical reservations as negative/read evidence only; it adds no fixture authority
or simulated successful execution. Store/Finance/sale writers and their guards are
unchanged. No SQL graft, second writer, schema or migration is introduced.

Consequently, **one real allocated points sale/tender/stock/Finance write, actual
Companion hold consumption, successful settlement/replay and faults after those
new writes are not proved by C20n**. Existing canonical paid-tender smokes and C20l
fixtures cover arithmetic/Finance separately; they do not close this missing proof.
Production reserve/consume/settle/release/reverse/refund/adjust/expire remain closed.

### Verification and bounded handoff

Session: direct Codex `01a18bca-b725-75f1-b4e2-bec44f4c867b`; no OpenCode or child agent.
Baseline: `main@fca57c5a6bf0916e294ae77ccf6ef12499b19ad2`, 367 short status
entries, 2,123 file SHA-256 values in `/tmp/c20n-file-hashes.json`, status/hash
metadata in `/tmp/c20n-baseline.json`. No live DB, Electron process, C19 fixture,
paired device, sites or admin/effect changes. The requested Electron typecheck is
static compilation only. Test results and preservation checks are recorded below.

### Exact blocker and next smallest C20o (not started)

C20o must first define independent, server-owned Companion mutation/tender authority
bound to the current principal + grant generation + action + business/customer +
opaque source + canonical reservation. The C20n plan is not that authority. Then
extend the two existing allocation guards narrowly to accept only that opaque
owner execution capability, preserving all ordinary cash/credit and Desktop paths.
Use the existing Commerce reserve callback and single sale/stock/tender/Finance
writer, the existing operation receipt writer, and mandatory rechecks immediately
before actual Store reserve and settle in the same BEGIN IMMEDIATE. No alternate
writer, copied Desktop adapter, arbitrary quote callback or client confirmation.
Before enabling success, replace fixture payment authority with that real owner
adapter and prove all-Puan zero Finance, mixed exactly one real Finance entry,
exactly one sale/stock/tender/operation receipt, single-use/replay, after-write
fault/caught-error rollback and competing revoke serialization. If authority cannot
be proved in one bounded slice, keep the terminal gate. External confirmation,
durable spend ACK/offline/refund and physical device ACK-loss remain separate.
**STOP at C20n; C20o has not started.**


### C20n final targeted results / STOP

All following commands completed with exit 0 on the final source checkpoint:

| Command | Actual result |
| --- | --- |
| `node scripts/smoke-companion-points-ingress.mjs` | 12/12 PASS groups, including C20n 32-case matrix + all-Puan/external/archived-parent checks; real in-memory Node TLS |
| `node scripts/smoke-commerce-benefits.mjs` | 32/32 PASS |
| `node scripts/smoke-companion-benefits-parent-contract.mjs` | 2/2 PASS |
| `node scripts/smoke-android-sale-action-receipt.mjs` | 3/3 PASS |
| `node scripts/smoke-android-benefits-financial-boundary.mjs` | PASS |
| `node scripts/smoke-market-sale-benefits.mjs` | 20/20 PASS |
| `node scripts/smoke-market-android-sales.mjs` | PASS; canonical cash/credit, stock, Finance, receipts/retry |
| `node_modules/.bin/tsc --noEmit -p apps/desktop-app/tsconfig.electron.json` | PASS |
| `node_modules/.bin/eslint` scoped to the four changed code/test files with `--max-warnings=0` | PASS |
| `git diff --check` + five touched untracked file whitespace checks | PASS |

Initial RED was the missing C20n export. Intermediate new-test assumptions were
corrected for existing sales in the shared harness, captured original intent
identity, and the earlier source guard's business error. No production guard was
relaxed to make tests pass. Existing C20m after-write faults and C20i writer
serialization still pass, but do not prove the deliberately unavailable new
points execution path. No TCP bind was attempted here; host may separately run
`node scripts/smoke-companion-points-ingress.mjs --tcp`. No physical device,
provider confirmation, live DB or release/full/pre-main evidence is claimed.

Final baseline comparison: only the six listed C20n files changed; all other
2,117 file hashes match, status records equal the original 367 entries, branch
and HEAD unchanged, no new files. Logs are `/tmp/c20n-*.log`. **STOP.**


## C20o — caught canonical owner failure poisons parent; points authority remains unavailable (2026-10-30)

**Bağımsız Linux host TCP/TLS son doğrulaması (Nexa):** C20o sonrası `node scripts/smoke-companion-points-ingress.mjs --tcp` gerçek ephemeral loopback TCP/TLS üzerinden **13/13 PASS**, exit **0** (75.72 s). Bu bir isolated SQLite/HTTPS testi; fiziksel Companion Puan tahsilatı, OS keystore, dış ödeme onayı veya kayıp ACK E2E kanıtı değildir.

**STOP at the first test-backed fail-closed checkpoint. C20p is not started.**
This slice does not mint a Companion reserve/tender mutation capability and does
not prove a successful allocated points sale. The C20n plan still returns
`authority: unavailable`; its terminal execution gate remains unchanged.

### Demonstrated RED and narrow owner correction

The source-loaded ingress baseline passed 12/12 groups. New RED
`boundary-market-request` caught the real Market allocated-source request-hash
rejection, then returned normally from the borrowed benefits scope: actual
`undefined`, expected `BENEFITS_TRANSACTION_ABORTED` (exit 1,
`/tmp/c20o-ingress-red.log`). This demonstrates a missing failure-state connection
for direct owner calls, not an observed production ACK exploit: the harness still
forced its own rollback and no production caller was introduced.

`commerce-benefits-rules.ts` now owns
`withCommerceBenefitsParentFailureBoundary`: it borrows only the existing
connection's registered failure state, preserves the original error, marks that
same parent failed on error, and rejects subsequent attempts in a poisoned scope.
It has no authentication, payment, quote, SQL, BEGIN/COMMIT or authority-minting
role. Without a registered benefits scope it preserves existing owner behavior.
Market's direct allocated-source entry and Commerce's allocated-source entry use
this boundary around their existing synchronous writers. The observation path
already uses `benefitsOperation`. Nonallocated paths and both allocation guards
retain their prior behavior; no second writer, arithmetic, ledger or transaction.

### New proof and its exact limits

Thirteen added scenarios use current-schema disposable SQLite, actual loaded
owners, pre-BEGIN owner-minted source identities, authenticated HTTPS context and
real C20k Store issuance. The existing `parentPorts()` provisions fixture-only
reservations; it is still NOT independent Companion payment authority. No new
fixture authorizer or synthetic Desktop principal was added.

- Four rejection cases run with both mixed and all-points plans: Market request
  hash mismatch (even supplying the exact quoted cash amount), Market benefits
  without execution authority, Commerce real allocated source + benefits, and a
  cloned Commerce allocation. Each denial and subsequent poisoned-owner attempt
  preserves every table and `total_changes` exactly; the forbidden reserve callback
  is never reached. No quote/amount/client payment flag becomes authority.
- Five caught fault cases use actual legacy CASH allocated writers: Market and
  Commerce after sale insertion and after Finance insertion, plus Market operation
  receipt insertion. SQLite TEMP triggers inject failures in the isolated parent;
  `total_changes` proves provisional canonical writes occurred. These are cash
  rollback tests, NOT successful mixed/all-points payments.
- Returning normally after each catch now raises `BENEFITS_TRANSACTION_ABORTED`
  before returning to the action owner. All-table pre-BEGIN snapshots match after
  rollback, including fixture reservation/hold/receipts, sale/items/stock/Finance,
  outbox and Android operation/result receipts. Subsequent owner attempts are
  rejected with zero writes. Existing ingress rechecks, grant_generation/reissue,
  epoch/expiry/quote/currency/customer/device/action guards, actual competing revoke
  serialization and legacy HTTPS ACK remain green.

No new-path successful point consume/settle/replay, exact positive sale/tender/
Finance/operation-receipt cardinality, or faults after a real Companion points
settlement are proved. After-reserve evidence here is fixture reservation rollback;
existing Desktop paid-benefits tests are separate evidence. Physical device,
provider confirmation, points ACK-loss, offline/refund and production spend stay
open. Codex sandbox'ında TCP bind denenmedi; ancak final C20o kaynakları Linux host üzerinden `node scripts/smoke-companion-points-ingress.mjs --tcp` ile ayrıca doğrulandı: **13/13 PASS, exit 0**. Bu fiziksel cihaz harcaması testi değildir.

### Exact blocker and next smallest C20p (not started)

The missing chain has three concrete owner barriers:

1. `CommerceBenefitsStore.reserve` requires independent `ports.authorize`; the
   Companion read ports always deny mutations. A C20k issuance gate or C20n plan
   supplies evidence, not that authorization.
2. `writeMarketSaleInTransaction` and `writeCommerceSaleInTransaction` still reject
   allocated source + benefits. Desktop benefits ports require `desktop_owner`;
   that role cannot stand in for the authenticated device principal.
3. The existing Android receipt type fixes `pointsTenderMinor: 0`.
   `materializeSaleReceipt` expects full-total cash Finance and rejects any benefits
   tender/snapshot; `androidSaleReceiptForAck` rejects nonzero points. A new points
   writer alone therefore cannot prove the required same-owner receipt/ACK chain.
   Receipt/wire semantics were deliberately left unchanged in this scope.

The smallest separately authorized C20p is an internal owner-capability and receipt
contract: bind a strict opaque one-use capability to the original current device
principal, grant_generation/epoch, action/request hash, business/customer, allocated
source, current canonical quote and original active parent. Define how the existing
operation/receipt owner witnesses that same reserve/sale/tender/settle operation
without changing the public cash-only ACK. Keep terminal denial until this can be
proved; then and only then connect the two guarded canonical writer ports and
Store authorization with mandatory immediate pre-reserve/pre-settle rechecks.
Positive mixed/all-points cardinalities, replay, all after-write fault rollback and
revoke serialization must precede success. No C20p implementation begins here.

### Session, files and targeted results

Direct Codex thread `01a18bdb-3426-7612-9abc-46efc772c9a8`, no OpenCode server/session or child agent.
`android-commerce-sync` skill applied. Current branch/worktree stayed
`main@fca57c5a6bf0916e294ae77ccf6ef12499b19ad2`; initial porcelain 367 entries.
Baseline `/tmp/c20o-baseline-1793347776.json` contains 2,126 tracked/nonignored
file hash records; raw status is the sibling `.status` file.
Only these seven pre-existing files changed:

- `apps/desktop-app/electron/commerce-benefits-rules.ts`
- `apps/desktop-app/electron/commerce-store.ts`
- `apps/desktop-app/electron/market-sale-operation.ts`
- `scripts/test-helpers/companion-reservation-witness.mjs`
- `scripts/smoke-companion-points-ingress.mjs`
- `docs/dev/CONTINUATION_BACKLOG_2026-10-29.md`
- `docs/architecture/COMPANION_BENEFITS_C20A_TRANSACTION_CONTRACT.md`

All tests below ran serially on the final source checkpoint; logs are
`/tmp/c20o-final-0.log` through `-8.log`, with exact results in
`/tmp/c20o-final-results.json`.

| Command | Actual result |
| --- | --- |
| `node scripts/smoke-companion-points-ingress.mjs` | 13/13 PASS groups; C20d–n baseline + C20o, real in-memory Node TLS; exit 0; 73.630 s |
| `node scripts/smoke-commerce-benefits.mjs` | 32/32 PASS; exit 0; 7.943 s |
| `node scripts/smoke-companion-benefits-parent-contract.mjs` | 2/2 PASS; exit 0; 4.481 s |
| `node scripts/smoke-android-sale-action-receipt.mjs` | 3/3 PASS; exit 0; 8.419 s |
| `node scripts/smoke-android-benefits-financial-boundary.mjs` | PASS; exit 0; 6.162 s |
| `node scripts/smoke-market-sale-benefits.mjs` | 20/20 PASS; exit 0; 8.294 s |
| `node scripts/smoke-market-android-sales.mjs` | PASS; legacy cash/credit, stock, Finance, receipts/retry; exit 0; 4.044 s |
| `node_modules/.bin/tsc --noEmit -p apps/desktop-app/tsconfig.electron.json` | PASS; exit 0; 19.745 s |
| `node_modules/.bin/eslint <five C20o source/test files> --max-warnings=0` | PASS; five source/test files, --max-warnings=0; exit 0; 20.610 s |

No live C19 DB, paired Samsung, Electron runtime, sites/admin/effects, schema,
migration/backups, public API/wire/UI or production caller changed. No Git
reset/stash/commit/push/rebase, full/pre-main/release/build/deploy/APK/installer.
Final preservation/whitespace evidence follows. **STOP; C20p not started.**

Final handoff: `git diff --check` exit 0. All five touched untracked files
(including both docs) pass `git diff --no-index --check /dev/null <path>`
with no whitespace diagnostics (exit 1 denotes file differences). Exactly seven
existing files changed, all other 2,119 hashes match the initial baseline, no new
files, raw porcelain byte-identical at 367 entries, branch/HEAD unchanged.
Evidence: `/tmp/c20o-preservation.json`, `/tmp/c20o-whitespace.json`. **STOP.**

## C20p-1a — owner-only points receipt acceptance contract (2026-10-30)

### Design and bounded implementation plan

Goal: pin the internal acceptance conditions for a future true Companion points
operation witness, without enabling any writer, public receipt type or ACK.
The approved fallback is selected: the current trusted Market observation mints
only a zero-points receipt; the paid-evidence reader cannot prove operation
provenance. A pure arithmetic validator would not close that gap. No new validator,
capability, minting API or production mutation is introduced in this slice.

Alternatives: accepting matching SQL/fixture settlement would counterfeit provenance;
widening the cash observation/type would bypass the missing authority and public
receipt decision. Both are rejected. Only contract + actual guard regression tests
are in scope. Existing cash/credit routes and both allocated-source guards stay intact.

- [x] Inspect paid evidence, Market observation, Companion adapter and Android receipt owner.
- [ ] RED: add negative scenario expectations before implementing their test probes.
- [ ] GREEN: exercise existing owners, including Android materialization without the
  old harness's unconditional rollback masking that boundary; no production changes.
- [ ] Run targeted ingress/cash-receipt/financial-boundary/cash-credit smoke checks,
  Electron no-emit typecheck, scoped lint and whitespace/preservation checks.

Review focus: SQL/JSON provenance forgery; cash observation promoted into points
authority; same-parent tender/snapshot mutation; materializer rejection independent
of correct-looking gross Finance; all-points zero-Finance and atomic receipt rollback.

### Mandatory future witness acceptance conditions — not an implemented API

All conditions are conjunctive. Passing arithmetic or a SQL lookup is never authority.

1. **Issuer and identity:** only the canonical Market operation owner, after its own
   guarded execution, can mint an opaque one-use witness. Retain the original
   authenticated HTTPS action/context and current Companion principal; bind device
   record/ID, business/customer, `grant_generation`, `authorization_epoch`, action
   ID/type/intent hash AND canonical Market request hash, channel and sale allocation.
   Neither a Desktop actor nor fixture Store authorization can substitute for it.
2. **Parent and time:** original active Android `BEGIN IMMEDIATE`, exact benefits
   transaction object, DB connection, logical time and allocation identity. Reject
   copied/serialized handles, second use, rollback/commit/next-request reuse. Current
   credentials, grants, capabilities and quote freshness must be rechecked immediately
   before reserve and settle; a poisoned parent cannot return success after a catch.
3. **Canonical quote and money:** use the current price/rule/balance owners and the
   original issuance quote, never client totals. Safe nonnegative integer minor units,
   same currency/exponent, exact item/discount/accounting totals. Gross here means
   sale total AFTER discounts, BEFORE Puan: `cashPaidMinor + pointsTenderMinor = gross`.
   Finance is exactly one matching active income for positive cash, NO Finance row
   for all-Puan; full-gross income cannot disguise a points tender. Cash-only first;
   client external-payment flags prove no provider confirmation.
4. **Operation lifecycle:** same owner-derived reserve/settle operation keys and exact
   reservation/source; real immutable tender, items/stock/outbox, point hold/consume,
   settled reservation, settlement receipt and snapshot must all describe that one
   operation. Snapshot reservation/source/quote/spend-entry links and cardinalities
   must agree; no foreign source/customer/business, fulfillment or refund. Current
   active-reservation readers reject settled snapshots, so they cannot simply be
   reused as a post-settle witness validator. A separate lifecycle decision is needed.
5. **Provenance and receipts:** memory identity minted by that executing owner AND
   unchanged canonical rows are required, not matching rows alone. The existing
   mutable Market operation receipt's mapping/hash cannot recreate provenance.
   Internal evidence must not escape as an Android success receipt. Future durable
   result materialization, replay and post-commit ACK reauthorization require a
   separately approved extension of the existing receipt owner, never a parallel path.

Source anchors at this checkpoint: `market-sale-operation.ts:165–237,275–340`;
`companion-sale-benefits.ts:277–310,347–393`; `market-sale-paid-evidence.ts:14–76`;
`commerce-benefits-store.ts:308–338,351–388`;
`android-action-application-service.ts:24–69,153–185` (all under
`apps/desktop-app/electron/`). These conditions authorize no guard relaxation.

## C20p-1b — owner-minted one-use mutation capability: minting-site evidence and minimal gated acceptance contract (2026-10-30)

### Verdict: BLOCKED — missing independent mutation authority

Docs-only design checkpoint; `main@fca57c5a`; no code changed. The C20p-1a
terminal gate (`readMarketSaleCompanionTenderContract` deny chain +
`assertMarketSaleCompanionTenderExecution: never`) stays exactly as it is.

**Where minting is possible (proven anchor).** The only proven site where the
real canonical operation owner mints an opaque, one-use, memory-identity object
is the guarded same-parent execution branch of `completeMarketSaleInTransaction`
(`market-sale-operation.ts:275–340`): frozen WeakMap handle bound to tx object,
DB connection, logical time, allocation identity, request hash and operation ID;
single use enforced (`state.used`); minted only after sale/items/stock/Finance/SQL
receipt writes and pre/post `recheckOperationParent` revalidations, with the live
parent callback recheck between. A true one-use mutation capability **could** be
produced there by the same pattern, extended by the C20p-1a witness conditions
(§above, items 1–5) and bound additionally to the C20k issuance identity
(`prepareCompanionSaleBenefitsIssuance` — device record/ID, business/customer,
`grant_generation`, `authorization_epoch`, action ID/type/intent hash, source,
operation = action ID), the canonical reserve quote and the frozen tender plan.

**Why it is blocked anyway.** A mutation capability must authorize the reserve
BEFORE the canonical sale writes, but the owner mint is provably only AFTER the
guarded writes — it cannot authorize what precedes it. Pre-write minting would
have to rest on one of: (a) the C20k issuance gate, which deliberately confers no
authority; (b) the C20k fixture `parentPorts()` adapter, test-only; (c) the frozen
tender plan, which carries `authority: "unavailable"`; (d) reader/SQL per
C20p-1a — all fake authority, prohibited. No production principal grants
Companion paid-tender points settlement (`companionSaleBenefitsReadPorts.authority`
is `read_only`, `canReservePoints: false`, `canConfirmPoints: false`, and
`ports.authorize` deliberately denies with `COMPANION_POINTS_RESERVATION_DISABLED`);
both allocated-source guards explicitly reject `input.benefits`
(`commerce-store.ts:936–941`, `market-sale-operation.ts:334–343`); and the ACK
materializer still rejects nonzero points literal (C20o blocker).
Therefore **no suitable owner exists today**:
`BLOCKED: missing independent mutation authority`.

### Minimal applicable acceptance contract (gated, not implementable yet)

Conjunctive; unmet ⇒ the contract stays non-ratified and all routes fail closed:

1. An independently owning, server-only mutation authority must first exist and
   explicitly decide Companion points settlement per current device principal,
   `grant_generation`/epoch and paid tender evidence — before any minting site.
2. The existing real owner then mints the one-use capability ONLY inside the
   active Android `BEGIN IMMEDIATE` parent, after C20k issuance capture AND the
   C20n tender-contract revalidation chain succeed with zero `total_changes()`.
3. Capability consumption: exactly one Store `reserve` accepts it as
   `ports.authorize`; immediately before reserve and again before settle the
   same fresh checks rerun (principal/grant_generation/action/source/quote
   canonical/reservation/fresh-issuance `readIssuedReservation` zero-write).
4. Cardinality per successful operation: one sale, one canonical allocated
   source receipt, one hold + one consume, one settled reservation, one
   settlement receipt + snapshot (0 Finance rows for all-points, exactly one
   matching income for the cash remainder), correct items/stock/outbox rows.
5. Every failure, replay, caught error, expired/released/settled reservation,
   revoke-vs-BEGIN serialization loss, after-write fault ⇒ full parent rollback;
   capability already consumed ⇒ poison, never retryable on a new parent.
6. Open test matrix (RED first, only GREEN after item 1 exists): mixed- and
   all-points success cardinality, exact replay, same-BUSY second-writer
   serialization, owner-mint fault after each guarded write step, and BlackBox
   forgery (clone/JSON/SQL/stale/replay/copied parent). Until then every added
   scenario must be written and observed as denial + zero table delta; **no
   mutation-success scenario can be exercised in the current harness.**


## C20p-2a1 — unproven authentic Android parent boundary (2026-10-30)

A scoped, internal decision experiment called `requireLocalActionPointsPrincipal` from a borrowed C20k issuance fixture. The expected positive decision did **not** occur: `issuance-decision-read` failed with `BENEFITS_PARENT_TRANSACTION_REQUIRED`. This was an important fail-closed observation. An arbitrary benefits transaction within the test router is not proof of `isLocalActionParentTransaction`, which is owned by the real `android-action-application-service.ts` `localActionParents` WeakMap and the original authenticated `LocalCompanionActionContext`. The test fixture must not bypass that owner identity.

All new experimental decision handles, WeakMap state, APIs and positive test assertions from this attempt were surgically removed. No reserve/settle/sale/receipt/ACK authority was enabled, no guard was relaxed, and the C20p-1a negative baseline remains the required gate. The next narrow code/test slice must exercise the genuine Android action-owner parent with authenticated context and prove owner-bound identity before introducing an independently authorized pre-write decision. The C20p-1b `BLOCKED: missing independent mutation authority` verdict still stands.

## C20p-2e — mutation-authority source audit (2026-10-31)

### Verdict: BLOCKED — the device spend grant is not tender authority

Docs-only decision; no production or test code changed. The C20p-2b/c/d
owner + principal + issuance evidence is revalidation evidence, not a spend
authorization.

**Sources inspected.**

- `commerce-benefits-management.ts:16–27,121–130` — the only real issuer of
  `android_benefits_spend_grants`. `BenefitsManagementActor` must be a live
  `desktop_owner` with `assertAuthorized`; the command requires
  `confirmed: true`, a paired active device/credential, the exact owner
  `recordId` and the points family.
- `ipc/commerce-benefits-ipc.ts:59,70–71` — that actor is constructed only in
  the desktop IPC handler from the unlocked-operator gate. It is not exposed to
  the Android action path.
- `database/android-benefits-spend-grant-store.ts:21–33,51–58` — the persisted
  grant is `(business, device_record, customer, authorization_epoch,
  grant_generation)`: no operation, quote, amount, expiry or consume. It is
  durable, reusable standing eligibility.
- `market-sale-operation.ts:275–319` — the canonical replacement owner mints an
  observation only after sale/items/stock/Finance/receipt writes; it cannot
  authorize the pre-write reserve.
- `commerce-benefits-store.ts:63–64,240–243` — the Store calls
  `ports.authorize` before writes; that port is precisely the missing decision.
- `companion-sale-benefits.ts:108–120` — production Companion `authorize` and
  mutation ports deny `COMPANION_POINTS_RESERVATION_DISABLED`.
- `companion-points-principal.ts:39–56` — the principal revalidates read scope
  only; it confers no mutation authority.

**Distinction.** The device spend grant proves the unlocked Desktop operator
allowed that device/customer pair to spend points at all. It does not decide a
specific tender (action/operation, allocated source, exact quote, one-use
consumption) and is not a paid-sale mutation permission. Both allocated-source
guards still reject `input.benefits`. No existing owner can legitimately
authorize the exact pre-write Companion tender.

**Missing predicate.** An operation-scoped, owner-authenticated pre-write
decision, consumed exactly once inside the real Android `BEGIN IMMEDIATE`, that
the Store's `ports.authorize` may accept.

**Next trusted entrypoint (corrected).** Do **not** add a per-sale decision to
`CommerceBenefitsManagement` behind the same `BenefitsManagementActor` gate:
that actor exists only in the desktop IPC handler, so every paired-phone sale
would require a live Desktop operator confirmation. That is an unapproved
product assumption.

- **(A) Management actor** authorizes the durable standing spend grant. It
  stays as is and is not consulted per sale.
- **(B) Server-side operation policy** validates one exact tender under the
  preexisting grant, inside the Android `BEGIN IMMEDIATE`, with its own
  independent per-sale rule (exact source/quote/operation, current
  principal/epoch/grant, one-use consumption). It must not impersonate the IPC
  actor or call `changeCompanionPointSpendGrant`/`grantAndroidBenefitsSpend`.

**Exact (B) location.** `apps/desktop-app/electron/companion-sale-benefits.ts`:
the `authorize` implementation returned by the private
`companionSaleBenefitsReadOnlyPorts` (via
`companionSaleBenefitsPreSaleReadPorts`) — the existing pre-write port the
Store already invokes. The decision must be derived there from live owner state,
never from a cloned principal or a management actor.

**Separate product approval required.** The grant does not define (B)'s
semantics: per-sale limit/confirmation threshold, whether a standing grant
permits unattended phone spend, offline/revoked behavior, refunds/reversals.
A separate explicit product/security approval must define these before any code.

## C20p-2f — server-only per-sale points policy preview (2026-10-31)

Implementation checkpoint; the mutation guard remains closed. `companion-sale-benefits.ts`
now exports one internal, nonmutating evaluator,
`evaluateCompanionSaleBenefitsPolicy`; the C20k issuance state also retains the
exact captured C20h quote handle. It is not a route, IPC handler, Store port or
mutation capability, and no production caller exists.

Every evaluation, inside the genuine Android `BEGIN IMMEDIATE`:

- re-reads the live authenticated principal through
  `requireLocalActionPointsPrincipal` (owner parent, paired device, customer,
  epoch and current spend-grant generation) and calls `assertAuthorized`;
- requires the exact C20k frozen issuance handle and revalidates its captured
  quote with C20h, so current cart/source/rules/balance and expiry are canonical;
- requires positive requested points equal to the canonical points tender, no
  more than the pre-points payable and no more than the current available
  balance; and
- returns frozen policy evidence with
  `authority: { state: "policy_only", canReservePoints: false, canConfirmPoints: false }`.

The evaluator does not call `ports.authorize`, `Store.reserve/settle`, the
management actor, `grantAndroidBenefitsSpend` or any Android receipt/ACK writer.
`adapter.store.reserve` after an allow still denies
`COMPANION_POINTS_RESERVATION_DISABLED`. There is no one-use capability, no
consumption state and no claim of independent Store permission. C20p-2f is an
authorization predicate, not a tender/settlement path.

Tests: `scripts/smoke-companion-points-ingress.mjs` (in-memory TLS and `--tcp`)
17/17 PASS. New policy scenarios cover allow with no Store authority; excess
payable/balance; stale price/rule; revoke/reissue/epoch; changed action/payload,
cloned context/action/prepared/handle; cloned parent; wrong database; decision
reuse after the HTTP parent ends; and terminal Store reserve denial.

Still closed: no real Store reserve/settle, no points tender sale/stock/Finance/
settlement/snapshot/operation receipt, no Android points ACK/receipt, no refund/
reversal, no offline finalization, no public route/UI. A separate consumer slice
must connect this policy to an independently authorized Store/tender/receipt
owner before mobile spend is usable.

## C20p-2g — one-shot prewrite rehearsal, not Store authority (2026-10-31)

Implementation checkpoint. `companion-sale-benefits.ts` now exports an INTERNAL
pair, `prepareCompanionSaleBenefitsPrewriteDecision` and
`consumeCompanionSaleBenefitsPrewriteDecision`. They are a rehearsal of the
missing consumer contract, not a new authority and not a production caller.

- `prepare` first requires a successful `evaluateCompanionSaleBenefitsPolicy`
  (live authenticated principal, current grant generation, exact C20k issuance,
  fresh canonical quote/source/balance), then records a one-use decision in a
  process-local `WeakMap`. The returned object is frozen and carries only
  `authority: { state: "prewrite_decision_only", canReservePoints: false,
  canConfirmPoints: false }`; it has no Store port, route, receipt or ACK.
- `consume` requires the identical active `BenefitsTransaction`, action, context,
  binding, preparation, C20k issuance and action fingerprint. It rejects a
  copied/serialized decision, a mismatched handle or database, a second
  consumption, an expired decision and any failed live re-evaluation. It then
  re-runs the full policy evaluator in the same parent and compares canonical
  evidence, so changed quote/rule/balance or revoked/reissued/epoch-shifted
  grants fail closed. Success marks the decision consumed and returns frozen
  evidence with `authority: { state: "prewrite_intent_only",
  canReservePoints: false, canConfirmPoints: false }`.
- C20k's gate is single-attempt for `Store.reserve`; it does not consume or
  bind a policy decision. This rehearsal therefore adds distinct one-use
  consumption state, while reusing the C20k issuance and policy evaluator
  instead of minting a parallel authority.
- Store still denies: calling `Store.reserve` after consuming the intent throws
  `COMPANION_POINTS_RESERVATION_DISABLED`; a caught denial poisons the parent
  (`BENEFITS_TRANSACTION_ABORTED`). No reservation, sale, receipt, ACK,
  Finance, settlement or outbox row is written, and the decision cannot be
  consumed after the HTTP parent ends.

Tests: `scripts/smoke-companion-points-ingress.mjs` 18/18 PASS in-memory and
`--tcp`; new `policy-prewrite-*` scenarios cover exactly-once consumption,
clone/JSON/handle/action/parent/database rejection, stale quote/rule,
revoke/reissue/epoch, expiry, post-parent rollback and terminal Store denial.

## C20p-2h — real Android owner cross-writer atomic denial (2026-10-31)

Test-only negative choreography in the genuine HTTPS Android `BEGIN IMMEDIATE`.
No production file, guard or port changed.

Inside the real action owner transaction the test:

1. consumes the C20p-2g one-shot prewrite decision before the fixture reservation
   changes the points balance;
2. creates a test-only C20k fixture `CommerceBenefitsStore` reservation (real
   reservation + point hold), explicitly NOT Companion authorization;
3. writes a canonical points-paid market sale through
   `createCommerceSaleInTransaction` with that fixture quote, producing real
   sale/items/settlement/Finance/stock rows;
4. adds a negative fixture `commerce_market_sale_receipts` mapping only, then
   returns success to the REAL `applyAndroidActionTransaction`.

The real owner inserts `android_action_receipts` and calls
`materializeSaleReceipt`, which rejects any `commerce_sale_settlements` row as
`"Unexpected benefits evidence"`. The owner catch rolls back the whole parent.
The harness compares the full pre-BEGIN and post-response SQLite snapshots and
explicitly asserts zero reservation, point hold, fixture ledger, sale, item,
settlement, Finance, stock movement, operation receipt, Android receipt and
Android result receipt rows for the exercised IDs.

This proves the current real receipt/ACK writer refuses a fixture-authorized
points reservation plus canonical points-paid sale, and cannot partially commit
across writers. It does NOT prove a legitimate production points flow; it is a
fail-closed boundary. Tests: 19/19 PASS in-memory and `--tcp`.

## C20p-2i — points-sale receipt evidence: BLOCKED, no code (2026-10-31)

Time-box expired before implementation. **No code changed in this slice**; C20p-2h
19/19 remains the last verified state. The intended artifact was one read-only
`inspectAndroidPointsSaleReceiptEvidenceInTransaction(db, action, context)` in
`apps/desktop-app/electron/android-action-application-service.ts`, returning
frozen `{ state: "structural_candidate_only", authority: "unavailable",
missing: "trusted_paid_writer_grant", ... }` and never ACK, receipt or authority.

Available fields permit only a structural subset:

- owner: `isLocalActionParentTransaction` (same file) proves the live parent;
- `android_action_receipts` (id, action_type, device_id, intent_hash) and
  `android_devices` active/current state;
- `commerce_market_sale_receipts` (operation_id, business_id, sale_id,
  request_hash) for operation/sale/business mapping and uniqueness;
- `commerce_sales` (business_id, status `paid`, source `android-market-sale`,
  customer_id, payment_method, subtotal, discount_total, total) and
  `commerce_sale_items` for the canonical sale;
- `commerce_sale_settlements` (customer_id, payment_method,
  cash_received_minor, points_tender_minor) for cash/points conservation
  (`subtotal = discount + points + cash`, `total = points + cash`);
- `finance_entries` (`source = commerce_sale`, `source_id = sale_id`) whose
  minor units must equal settlement `cash_received_minor`, not `sale.total`;
- `commerce_benefit_reservations` (`source_kind = 'sale'`,
  `source_id = sale_id`, `status = 'active'`, customer/currency/`points_minor`)
  plus `commerce_benefit_point_holds` sum and `commerce_benefit_point_ledger`
  spend provenance.

Exact blockers for anything stronger:

1. **Request hash is not recomputable here.** `prepareMarketSaleRequest` and
   `requestHash` are module-private in `market-sale-operation.ts` (not
   exported). Duplicating that serialization in the receipt owner would create a
   second canonical hash authority, so only 64-hex format and mapping
   consistency can be checked.
2. **No trusted paid-writer grant exists to read.** There is no persisted
   artifact binding a Store/C20k reservation to an Android action;
   `commerce_benefit_reservations.intent_json/context_json` are Store-issued
   quotes, not Companion or paid-writer authorization. Evidence must therefore
   stay `authority: "unavailable"` with `missing: "trusted_paid_writer_grant"`.
3. **The positive path is unreachable today.** `materializeSaleReceipt` rejects
   any `commerce_sale_settlements` row ("Unexpected benefits evidence") before
   a points receipt can be validated, and its Finance check compares against
   `sale.total` (100000) while a points sale books Finance at
   `cash_received_minor` (99000). A paid-writer owner must fix both before any
   positive points receipt/ACK test is honest.

Next implementation order: export a canonical hash reader from the sale owner
(read-only, no new key), add the structural verifier with coded mismatch
errors, then assert it test-only in the C20p-2h fixture before intentional
rollback plus finance-tamper and foreign-operation negatives in fresh
transactions. No production reserve/settle/tender/ACK is authorized.

## C20p-2i1 — canonical operation identity reader (2026-10-31)

Blocker 1 removed without duplicating the hash. `market-sale-operation.ts` now
exports `readMarketSaleOperationRequestIdentityInTransaction(db, input)`, a
frozen `{ operationId, requestHash }` reader that reuses the private
`prepareMarketSaleRequest`. It requires an active SQLite transaction, a paid
`android-market-sale` input with no benefits/draft and an operation id, and it
allocates no source, receipt, token or financial row. It must not be used by a
writer as authorization.

Important canonical fact confirmed by RED: `prepareMarketSaleRequest` builds the
SHA-256 payload from items, payment amount, benefits, discount, location,
settlement, customer, draft and payment method — **not** `operationId`.
`operationId` is returned and compared separately. The new test therefore
asserts: identical request with a different operation id keeps the same hash but
reports the other operation id; changed item quantity changes the hash; the
fabricated `c20p2h_fixture` mapping is explicitly not equal to the canonical
hash and the real owner still rolls the whole cross-writer parent back.

Tests: `scripts/smoke-companion-points-ingress.mjs` 19/19 PASS in-memory and
`--tcp`, exit 0; electron `tsc` and scoped `eslint` exit 0. Store mutation,
settlement and Android ACK remain closed to points. Still missing before a
positive verifier: a trusted paid-writer grant and a `materializeSaleReceipt`
points-aware Finance check (cash `cash_received_minor` vs `sale.total`).

## C20p-2j — real Android owner pre-commit points receipt refusal (2026-10-31)

The read-only C20p-2i2 verifier is now wired into the genuine Android owner.
After `routeAndroidActionInTransaction` returns ok and **before** any
`android_action_receipts` insert, `applyAndroidActionTransaction` checks whether
the canonical operation receipt is mapped to a sale with ANY
`commerce_sale_settlements` row. If so it calls
`inspectAndroidPointsSaleReceiptEvidenceInTransaction(db, action, localContext)`
in the same `BEGIN IMMEDIATE` and then unconditionally throws the internal
`COMPANION_POINTS_PAID_WRITER_AUTHORITY_REQUIRED`; no independent trusted
paid-writer grant exists. Malformed evidence keeps the verifier's coded
fail-closed error. Both errors are caught by the existing owner boundary and roll
back every write: reservation, point hold, ledger, sale, item, settlement,
Finance, stock movement, operation receipt, Android ACK, result receipt and
outbox. No public response, route, schema, client field or ACK shape changed;
legacy cash/credit creates no settlement row and remains byte-equivalent.

A zero-points settlement is not treated as cash: the verifier requires positive
points tender, so the owner denies it. The C20p-2j fixture produces that case
through the canonical sale writer with a zero-points quote; it does not UPDATE
the immutable settlement table.

The exact terminal code is internal and is not surfaced by the public generic
failure. Integration is proven by a test-only SQL probe on
`android_action_receipts`: the real owner leaves the probe untouched (0) for the
valid structural candidate and the hash, Finance and zero-points negatives,
whereas the pre-wiring RED path incremented it (1) before
`materializeSaleReceipt` rejected. Exact verifier mismatch codes remain covered
by the C20p-2i2 direct-reader negatives. The C20p-2j fixture never calls the
verifier itself, so the positive integration signal is the real owner's pre-ACK
refusal plus whole-database rollback.

Tests: `scripts/smoke-companion-points-ingress.mjs` **21/21 PASS** in-memory and
`--tcp` (real loopback TLS), exit 0; `smoke-android-sale-action-receipt.mjs`
3/3; `smoke-market-android-sales.mjs` PASS; electron `tsc --noEmit`; scoped
`eslint`; `git diff --check`. Still missing before any live points flow:
`trusted_paid_writer_grant`, a points-aware `materializeSaleReceipt` Finance
check, and a points ACK/receipt contract. Companion points spending, Store
reserve and Android points ACK remain disabled.

## C20p-2k — owner-issued one-operation paid-writer checkout authority (2026-10-31)

`companion-sale-benefits.ts` now exposes two INTERNAL, opt-in functions with no
production route, IPC, UI or Android caller:

- `issueCompanionSaleBenefitsPaidWriterAuthorization(...)` mints an opaque,
  frozen, process-local handle only inside the genuine Android
  `BEGIN IMMEDIATE`. It requires the live
  `requireLocalActionPointsPrincipal` (paired device/customer/epoch/current
  spend-grant generation), the exact C20k issuance and a successful
  `evaluateCompanionSaleBenefitsPolicy` (canonical quote, rules, balance and
  payable cap). It binds the original `BenefitsTransaction`/database, action,
  context, binding, prepared source, action/operation id, canonical request,
  policy evidence, freshness deadline and a one-use flag. It writes nothing and
  exposes no serializable evidence (`{}`).
- `companionSaleBenefitsPaidWriterPorts(...)` is the ONLY Companion adapter
  whose `authorize("checkout")` can return success. It validates the opaque
  handle and exact canonical request, consumes it once, and re-runs the full
  live principal/quote/rules/balance policy immediately before the Store
  writer. `refund`, point adjustment, settlement and full-refund ports still
  deny; `companionSaleBenefitsPreSaleReadPorts` still denies
  `COMPANION_POINTS_RESERVATION_DISABLED` unchanged.

The fixture proves a REAL `CommerceBenefitsStore.reserve` through REAL Companion
ports inside the genuine Android owner transaction writes a reservation and
point hold with the canonical 1000-point quote, while no sale, settlement,
Finance, operation receipt, result receipt or Android ACK exists. The outer
owner then always rolls the whole parent back; the smoke compares the complete
database snapshot. Clone/JSON handles, cloned action/context/prepared/parent,
another database, refund operation, wrong request/source, stale quote/rule,
revoke, reissue, epoch change, expiry and reuse all terminate the parent with
coded denials.

Tests: `scripts/smoke-companion-points-ingress.mjs` **22/22 PASS** in-memory and
`--tcp` (real loopback TLS), exit 0; electron `tsc --noEmit`; scoped `eslint`;
`git diff --check`. This is still test-only. Remaining blockers before any live
points flow: no production route/tender owner consumes the handle;
`materializeSaleReceipt` is not points-aware (cash Finance vs `sale.total`);
there is no points settlement/snapshot, Android points receipt or ACK contract;
the handle is process-local and intentionally not durable. Companion points
spending, Store settlement and Android points ACK remain disabled.

## C20p-2l — real reserve + canonical paid sale in one Android parent (2026-10-31)

TEST-ONLY integration, no production code change. The witness mode
`paid-writer-canonical-sale` first performs the genuine owner-issued C20p-2k
`CommerceBenefitsStore.reserve` and then, in the same real Android
`BEGIN IMMEDIATE`, calls the canonical
`createCommerceSaleInTransaction(..., "paid", ..., { saleId: prepared.source.id,
reserve: () => receipt.quote })`. That callback is a quote reader, not a second
Store writer.

Inside the parent the fixture asserts a `paid` sale on the prepared protected
source, `discountMinor + pointsTenderMinor + payableMinor === subtotalMinor`
(1000 points, 99000 cash, 100000 subtotal), a `commerce_sale_settlements` row
matching the real Store receipt, exactly one cash `income` Finance row for
99000, and stock movements. The reservation remains `active` and no
`commerce_benefit_snapshots` row exists, so genuine `Store.settle` has NOT
executed: points are not spent and no Puan purchase succeeds.

To reach the real owner's pre-ACK points check, the fixture inserts a
**TEST FIXTURE** `commerce_market_sale_receipts` mapping with the canonical
request hash. It is not an ACK, not a trusted-writer certification and not a
genuine settlement. The real Android owner returns a generic failure with no
public `sale_receipt`, the ACK-insert probe stays untouched, and the complete
database snapshot equals pre-BEGIN: no reservation, hold, ledger, sale, item,
settlement, Finance, stock, operation receipt, ACK or result receipt survives.

Tests: `scripts/smoke-companion-points-ingress.mjs` **23/23 PASS** in-memory and
`--tcp` (real loopback TLS), exit 0; scoped `eslint`; `git diff --check`.
Remaining blockers are unchanged and explicit: genuine `Store.settle`, points
settlement/snapshot, points-aware `materializeSaleReceipt`, Android points
receipt/ACK, and a production tender/route owner consuming the paid-writer
handle do not exist. Live mobile points spending remains disabled.

## C20p-2m — genuine Store.settle through a bounded test-only settlement port (2026-10-31)

`companion-sale-benefits.ts` adds one INTERNAL, test-only function
`settleCompanionSaleBenefitsPaidSale(...)` with no production route, IPC, UI,
Android ACK or materializer caller. It accepts only the exact
`Store.reserve` receipt object captured through
`captureCompanionSaleBenefitsIssuedReservation` (identity, not JSON), the
original C20k issuance, and the same genuine Android `BEGIN IMMEDIATE`. Before
any settlement port is exposed it re-reads the live
`requireLocalActionPointsPrincipal` (business/customer/device/record, current
epoch and spend-grant generation), revalidates the captured active reservation
through the paid-evidence reader, and independently re-reads the canonical
persisted paid sale/tender/Finance/stock with
`readMarketSalePaidTenderEvidence`. `readSettlement` is exposed only for that
exact `{ kind: "sale", id }` source and the current reservation; adjustment,
refund and full-refund ports deny. The settle operation key is derived from the
issuance key, and settlement is one-use per issuance.

`resolvePricing.payment.confirmed` becomes `true` only when the persisted cash
tender is independently re-read and confirmed; every `resolvePricing` and
`readSettlement` call repeats the live owner/grant/epoch, reservation and tender
checks rather than trusting a prior flag. Store's own reservation quote/rules
comparison is unchanged, so a payment-modifier discount absent at reserve cannot
be introduced at settle (it would change the quote and fail closed).

The `paid-writer-settled-sale` fixture performs the genuine C20p-2k reserve,
captures the exact receipt, writes the canonical paid sale on the prepared
source, then calls the real `CommerceBenefitsStore.settle`. Inside the parent it
asserts a settled reservation, a points spend ledger entry equal to
`-quote.pointsTenderMinor`, hold allocations equal to the spent amount, a
`commerce_benefit_snapshots` row, and consistent paid sale/tender/99000 cash
Finance/stock. The `commerce_market_sale_receipts` mapping remains a **TEST
FIXTURE**, not trusted provenance. The real owner's pre-ACK verifier still
requires an ACTIVE reservation and no snapshot, so it fails closed and the whole
parent rolls back with no ACK or public receipt.

Tests: `scripts/smoke-companion-points-ingress.mjs` **24/24 PASS** in-memory and
`--tcp` (real loopback TLS), exit 0; electron `tsc --noEmit`; scoped `eslint`;
`git diff --check`. This does NOT prove independent paid-sale provenance, a
production settlement/tender route, points-aware `materializeSaleReceipt`, an
Android points receipt/ACK, refund/reversal or offline finalization. Live mobile
points spending remains disabled.

## C20p-2n — owner-issued canonical paid sale mints its own operation mapping (2026-10-31)

`market-sale-operation.ts` adds INTERNAL
`prepareMarketSaleCompanionPaidSaleObservation(...)` and
`completeMarketCompanionPaidSaleInTransaction(...)`. The writer requires the
original `BenefitsTransaction`, the canonical Android paid-sale input, the
existing unused `MarketSaleSourceAllocation`, the exact captured
`Store.reserve` receipt object, and an opaque owner-bound witness minted only by
`prepareCompanionSalePaidSaleWriter(...)` in `companion-sale-benefits.ts`. The
witness re-reads the live principal/grant/epoch, the original C20k issuance and
the canonical active reservation quote; the writer rejects clones, JSON, a
foreign receipt, a used source, replay, an existing mapping and any quote or
money-conservation mismatch. Sale/stock/Finance are written by the canonical
`createCommerceSaleInTransaction` settlement-quote path on the protected source;
`commerce_market_sale_receipts` is then minted only inside
`market-sale-operation.ts` from the canonical `prepareMarketSaleRequest` hash.
The helper's new `paid-writer-owner-minted-sale` mode contains no direct receipt
INSERT.

`android-points-sale-receipt-evidence.ts` now preserves the original action's
`expectedUnitPrice`/`expectedCurrency`/`expectedUpdatedAt` in its sale input, so
the pre-ACK verifier hash aligns with the original source allocation and the
owner-issued mapping. This is a hash-alignment fix, not a weaker verifier.

Tests: `scripts/smoke-companion-points-ingress.mjs` **25/25 PASS** in-memory and
`--tcp` (real loopback TLS), exit 0; electron `tsc --noEmit`; scoped `eslint`;
`git diff --check`. The real owner still denies before ACK and rolls the whole
parent back. Live mobile points spending remains disabled.


## C20p-2o — server-only settled points receipt projection; live route closed (2026-10-31)

`android-points-sale-receipt-evidence.ts` adds `prepareAndroidPointsSaleReceiptWitness(...)`
and `materializeAuthorizedPointsSaleReceipt(...)`. First issuance requires the
genuine Android `BEGIN IMMEDIATE` (`isLocalActionParentTransaction`) and an opaque
paid-sale provenance captured from the real `market-sale-operation` owner witness
BEFORE `Store.settle`. `captureMarketSalePaidSaleProvenance(...)` preserves the
original owner receipt while the pre-settle active-reservation recheck is still
valid; settlement-specific validation then re-reads the immutable mapping, paid
sale, one settled reservation, canonical quote, real `kind='spend'` ledger and
allocation, single snapshot, cash-only Finance and monetary conservation. Neither
SQL rows alone nor JSON/cloned handles can mint authority. The receipt stores the
Android action intent hash; the mapping stores the canonical operation request
hash, and the two are never interchanged.

`AndroidMarketSaleResultReceipt.pointsTenderMinor` is now numeric (cash `0` stays
backward compatible). `androidSaleReceiptForAck(...)` accepts a positive points
projection only with durable evidence from
`readAndroidPointsSaleReceiptAckEvidenceInTransaction(...)`; replay revalidates
the stored result/ACK, mapping, settlement, reservation, spend ledger and
snapshot. `receiptResult(existingReceipt)` applies the same gate before returning
a stored points receipt. No live code path creates such a receipt.

Tests: new `paid-writer-authorized-points-receipt` scenario uses the real owner
sale, real `Store.settle`, genuine spend/snapshot and opaque provenance to produce
a frozen 1000-point / 99000-cash receipt, then terminally rejects witness replay
and rolls the whole parent back. `scripts/smoke-companion-points-ingress.mjs`
**26/26 PASS** in-memory and `--tcp` (real loopback TLS), exit 0; electron
`tsc --noEmit` and scoped `eslint --max-warnings=0` exit 0; `git diff --check`
exit 0. The live `market_sale_complete` route is still cash-only and denies any
settled points sale before ACK. Android still does not send authenticated
`requestedPointsMinor`; therefore there is no committed points sale, no public
points ACK and **live mobile points spending remains disabled**. This test-only
materializer is projection evidence, not release authorization.

## C20p-2p — opsiyonel Android Puan request intent; production Puanlı satış kapalı (2026-10-31)

`market_sale_complete` opsiyonel `requestedPointsMinor` alanına hazırlanmıştır. Field yokluğu/0 eski nakit ve veresiye akışını değiştirmez. Positif safe integer yalnız ücretli müşteri satışına ait intent olabilir; **bir harcama yetkisi değildir**. Server `market-android-actions.ts` bu talebi kanonik satış/Finance/stok yazılmadan reddeder. `marketAndroidActionIntentHash` mevcut payload hash'i ile farklı istek/aynı action replay'ini ayırır; canonical `requestHash` ile karıştırılmamalıdır.

Android `MarketUiRules.CartDraft` overloaded sale payload üreticisi yalnız explicit pozitif istek, canlı müşteri fiyat önizlemesi, toplamı aşmayan tutar koşulunda alanı ekler; varsayılan hiç eklemez. `AndroidActionPolicy` allowlist/type/customer kısıtlarını denetler. Canlı Puan seçme UI'si, owner-approved quote/reservation/settlement route'u, settled-result ACK ve telefonun pozitif Puan ACK doğrulaması **yoktur**. Bunlar tamamlanmadan Puan harcaması açılmamalı.

Doğrulama: targeted Electron tsc/eslint/diff exit 0, compiled market Android sales smoke exit 0, targeted AndroidMarketSalesTest Gradle exit 0, existing C20p Companion points 26/26 in-memory + 26/26 TCP/TLS exit 0. Commit/deploy/APK kurulumu yok.

## C20p-2q — gerçek Android Puan seçimi + authenticated canlı quote UI (2026-10-31)

Bu dilimde Companion satış ekranı, müşterili ücretli satışta **açık Puan miktarı seçimi** sunar. Alan boş/0 ise hiçbir `requestedPointsMinor` alanı gönderilmez; satış eskisi gibi kalır. Kullanıcı "Puan limitini sorgula" ile mevcut `/local/v1/point-spend-quote` HTTPS endpoint'inden taze kullanılabilir/en fazla harcanabilir tutarı alır; bu değer yalnız danışma amaçlıdır ve seçim sepet/müşteri/ödeme/snapshot'a bağlanır.

- `PointSpendQuoteRequest` / `PointSpendQuote`: owner quote yanıtındaki gerçek 5 alanlı satırları (`productId`, `quantity`, `unitPriceMinor`, `currency`, `updatedAt`) doğrular; 2 alanlı sepet scope'unu `MarketSalePreviewGuard.fingerprint` için normalize eder. `matches(...)` quote satırlarını canlı müşteri önizlemesiyle fiyat/para birimi/`updatedAt` dahil birebir karşılaştırır, ayrıca mevcut sepet parmak izi ve Puan ≤ `maxSpendable`/subtotal kontrolü yapar.
- Flow: seçim → canlı fiyat önizlemesi → **yeni** Puan quote'u → onay dialogu. Dialog tam Puan tutarını ve kalan nakit tutarını gösterir. Gönderim anında quote yeniden `isCurrent()` + `matches(...)` ile doğrulanır; süresi dolmuş, bağlantısı kopmuş, iptal edilmiş cihaz veya sepet/müşteri/ödeme değişmişse işlem reddedilir ve Puan alanı gönderilmez.
- `invalidatePointChoice()` sepet satırı, ürün ekleme, müşteri, ödeme ve harici onay değişimlerinde seçimi ve quote'u temizler. Önizleme/quote bekleme sırasında `invalidateSale()` yazılan Puan metnini silmez; gönderim yerel olarak yakalanan miktarla yapılır.
- `MainActivity.requestPointSpendQuote(...)` quote'u mevcut `LocalDesktopOperationsTransport.fetchPointSpendQuote` ile asenkron çağırır; `PointPreviewGuard`/`MarketSalePreviewGuard`, ekran görünürlüğü, foreground, snapshot ve generation kontrollerini yeniden kullanır. Offline/revoked/expired veya eşleşmeyen yanıtta callback `null` alır (fail closed).

**Hâlâ kapalı:** Desktop owner `market_sale_complete` pozitif `requestedPointsMinor` isteğini kanonik paid writer/reserve/sale/`Store.settle` zincirinden önce kontrollü hata ile reddediyor; production Puanlı satış, kalıcı ACK ve Android pozitif-Puan ACK doğrulaması yoktur. Yeni APK kurulmadı, gerçek telefon uçtan uca denenmedi. **Mobil Puan harcaması açık değildir.**

Doğrulama: `node scripts/run-android-gradle.mjs --offline testDebugUnitTest --tests com.yardimciasistan.android.AndroidMarketSalesTest` **BUILD SUCCESSFUL, exit 0**; `--tests com.yardimciasistan.android.LocalPinnedHttpsTest` **BUILD SUCCESSFUL, exit 0**; `git diff --check` exit **0**. Electron/desktop TS değişmediği için tsc/smoke yeniden çalıştırılmadı. Commit/stash/reset/branch/APK/deploy yok.

## C20p-2r — production owner zinciri kodlandı, doğrulanmadan açılmadı (2026-10-31)

Genuine authenticated Android owner için protected key/source pre-BEGIN hazırlanması ve aynı `BEGIN IMMEDIATE` altında strict `requestedPointsMinor` + C20k issuance/policy + Store.reserve + canonical paid sale + Store.settle + C20p-2o settled receipt materialization + durable action/result receipt akışı eklendi. Positive branch ayrıca normal Android satış permission kontrolünü uygular. Android receipt positive amount tam kullanıcı niyetiyle eşleşmeli; applied result'ta receipt yoksa telefon `local_delivery_unknown` ile bekleyen action'ı korur. Owner/replay durumlarının pozitif gerçek HTTP testi henüz yapılmadı.

**Current deployment gate: CLOSED.** `main.ts` HTTPS applyAction callback'i intentionally `pointsKeys` sağlamaz; bu nedenle pozitif Puanlı route fail-closed kalır ve hiçbir kredi/stock/Finance yazımı yapmaz. Kodun varlığı release onayı değildir. Son scoped Electron TS/lint/diff exit 0, Android LocalPinnedHttpsTest 26/26 exit 0. Mevcut server-only smoke, sıkı explicit-intent kuralıyla uyuşmayan eski fixture nedeniyle exit 1; test fixture immutable action oluşturacak şekilde düzeltilmeli, hash sonrası payload mutasyonu veya production fallback kullanılmamalı. DeepSeek 429 kullanım sınırında durdu; git/deploy/APK değişmedi. Bir sonraki aşama hedefli gerçek owner pozitif ACK + replay testidir, ardından açma kararı.

## C20p-2s — gerçek HTTPS production pozitif Puan satışı doğrulandı (2026-10-31)

Gerçek `LocalCompanionServer` HTTPS ingress, authenticated opaque context, established protected benefits key ve gerçek `applyAndroidActionTransaction` üzerinden pozitif `requestedPointsMinor` satışı çalıştırıldı. Zincir: strict immutable intent → C20k issuance/policy/quote → `CommerceBenefitsStore.reserve` → kanonik paid sale → `Store.settle` → C20p-2o settled receipt → aynı parent durable ACK/result receipt. Testte 1000 Puan + 99000 minor nakit, tek sale/settlement/snapshot/spend/ACK, stok -1; aynı action retry idempotent (ek harcama/stok/ACK yok); değiştirilmiş miktar, revoke grant ve satış izni olmayan cihaz atomik rollback ile reddedildi.

**Production hata düzeltmesi:** `Store.settle`, earn kuralı olduğunda aynı satış için kanonik bir `kind='grant'` ledger satırı yazar. C20p-2o verifier yalnız `spend` kabul ettiğinden gerçek pozitif rota her zaman `COMPANION_POINTS_RECEIPT_EVIDENCE_COMPETING` ile rollback oluyordu. Verifier genişletilmedi; yalnız durability snapshot'ındaki `receipt_json.pointGrantEntryId` ile birebir eşleşen, settled quote `pointsEarnPreviewMinor` tutarında, aynı business/customer/currency/sale source ve spend ile aynı settlement `operation_key` taşıyan **tek** grant kabul ediliyor. Grant yoksa grant satırı yasak; `kind NOT IN ('spend','grant')` rekabet kontrolü, tek spend, hold/allocation, cash-only Finance ve snapshot/evidence eşitliği korunuyor. Durable ACK replay aynı grant kanıtını yeniden doğrular.

`main.ts` artık pozitif yol için `CommerceBenefitsKey(app.getPath("userData"), safeStorage)` aktarır; anahtar `load(false)` ile yalnızca BEGIN öncesi okunur, oluşturulmaz/rotate edilmez. Secure storage yoksa veya key yoksa pozitif rota fail-closed kalır.

Doğrulama: `node scripts/smoke-companion-points-production-path.mjs` PASS exit 0; Electron `tsc --noEmit` exit 0; scoped ESLint exit 0; `git diff --check` exit 0. Eski `smoke-companion-points-ingress.mjs` internal fixture seti hâlâ `intent-create` aşamasında exit 1; production kuralı test için gevşetilmedi. Gerçek telefon/APK, bağlantı kopması, refund/reversal ve stale/Finance-tamper negatifleri açık; bu checkpoint telefon uçtan uca release kanıtı değildir.


## C20p-2u — Gerçek Samsung satış doğrulaması (2026-10-31)

Samsung J700F, masaüstündeki gerçek QR ile eşleşti. Cihaz masaüstü arayüzünden etkinleştirildi; Market ve Mobil Satış izinleri kaydedildi. Personel rolünde müşteri görüntüleme yetkisi bulunmadığından test sırasında yönetici rolü kullanıldı.

Test müşterisi, 100 TL ürün, 10 adet sayılmış stok ve %10 Puan kazanımı ile Puan harcama kuralları gerçek masaüstü ekranlarından oluşturuldu. İlk masaüstü satışından 1000 minor TRY Puan kazanıldı. İkinci satış fiziksel Companion üzerinden canlı fiyat önizlemesi ve onayla gönderildi; telefon satışın masaüstüne kaydedildiğini bildirdi. Veritabanında iki satış, iki ayrı 10000 minor TRY gelir, 8 adet kalan stok ve bir kalıcı Android satış makbuzu doğrulandı.

Pozitif Puan harcaması henüz kanıtlanmadı: telefonda Puan limitini sorgulama canlı tutarı göstermiyor. Bu yüzden Puanlı satış gönderilmedi. Android normal satışının yeni Puan kazandırmadığı, personel Market yetkisinin müşteri seçimine yetmediği ve senkron bitiminden sonra bazı sepet düğmelerinin pasif göründüğü ayrıca belirlendi. C20p-2v'de bu üç davranış ve canlı Puan teklif dönüşü incelenecek, ardından 5 TL Puanlı gerçek telefon satışı ve tekrar gönderim testi yapılacak.

DeepSeek yeni oturumda 429 sınırı verdi. Bu turda kaynak kod, APK, Bayi, Git HEAD veya deploy değiştirilmedi; ayrıntılı komut ve kayıtlar devam backlog belgesinde yer alıyor.

## C20p-2v — explicit owner grants are the live quote prerequisite; B/D fixes (2026-10-31)

The live paired database has a real `+1000` minor TRY point earn but **zero**
`android_benefits_balance_grants` and **zero** `android_benefits_spend_grants`.
`quoteAndroidPointSpend(...)` requires the dedicated spend grant via
`canSpendAndroidBenefits(...)`; an admin device, a balance grant, or earned points
alone do not authorize a quote. The HTTPS route therefore returns the correct
`403 point_spend_quote_denied`. This is an explicit owner-control prerequisite,
not a reason to relax the grant or quote gate.

The production grant path remains `BenefitsPointsEditor` → preload
`benefits:companionGrant` / `benefits:companionSpendGrant` →
`CommerceBenefitsManagement.changeCompanionPointGrant` /
`changeCompanionPointSpendGrant` → scoped grant stores. The spend grant keeps a
64-character owner-issued `grant_generation`, binds the device
`authorization_epoch`, and is revoked by device/credential revoke or scope/capability
changes. `scripts/smoke-android-point-spend-quote.mjs` now exercises that management
service path (not raw grant SQL) and asserts the device epoch is preserved and
bound into the grant row.

The phone now reports an actionable, secret-free quote failure: check the desktop
connection and whether the desktop owner granted **Puan spending permission** for
this phone/customer. Balance display still requires the separate balance grant.

Two bounded product fixes accompany this checkpoint:

- `market_sales` staff permission group now includes `customer.view` (and only
  that customer permission) because the paid-customer sale ingress already requires
  it. It does not grant customer management, credit viewing or credit payment.
- A sync that finishes while the Market tab is visible rerenders the Market view
  when `loading` transitions to false, so `MarketSubmissionFeedback.submissionBlocked()`
  releases buttons built during loading. Existing pending/snapshot guards remain.

**Still pending:** Android zero-point cash sales write the canonical sale,
Finance, stock and ACK but do not run `Store.settle`/earn, so they do not award
points. Integrating earn for ordinary Android cash sales requires a separate
points-aware settlement and receipt/ACK decision and is not part of this slice.
Positive-point sale E2E on a real phone remains unproven until the owner grants
both balance and spend access through the desktop UI and a live sale is run.

Verification: shared policy tests 49/49 PASS; both point-spend quote smokes PASS
including real loopback TLS; Electron typecheck and scoped ESLint exit 0; targeted
Android unit tests and `assembleDebug` BUILD SUCCESSFUL; `git diff --check` exit 0.


### C20p-2v fiziksel uygulama doğrulaması (2026-10-31)

Yeni Companion APK'sı 16:27'de gerçek SM-J700F'ye adb install -r ile veri/eşleşme kaybı olmadan kuruldu. Gerçek desktop HTTPS 47831 üzerinden ayakta. Masaüstü Puan hesabı yönetim penceresinde C20 Test Müşterisi ile Samsung için bakiye görüntüleme ve harcama yetkileri ayrı ayrı native onaylarıyla verildi (her iki grant tablosunda 1 kayıt, ledger'da +1000 minor TRY bakiye). Market Sepet satış düğmeleri senkronizasyon sonrası aktif göründü.

Gerçek Puanlı satış henüz doğrulanmadı: Android satış formunda müşteri açılır listesi C20 Test Müşterisi'ni gösterse de ADB ile seçim sonrası alanda Müşteri seçilmedi yazmaya devam ediyor. Bunun gerçek spinner/rerender regresyonu mu, ADB koordinat penceresi çakışması mı olduğu C20p-2w'de ayrıştırılacak. Yanlışlıkla görünen tüm nakit onayları VAZGEÇ ile kapatıldı. Nihai DB: 2 satış, 2 finans kaydı, 1 Android makbuzu, stok 8, Puan ledger 1000 minor, grant 1+1. Kesilen Puan yok; Puan quote/ACK veya retry E2E PASS iddiası yok. Runtime ve telefon eşleşmesi korunuyor.


### C20p-2w — fiziksel müşteri seçimi + gerçek canlı Puan quote PASS, satış onayı bekliyor (2026-10-31)

Samsung SM-J700F'de native `MarketFormUi.addSelectionDialog` ile cash müşteri seçimi kalıcı, C20 Test Müşterisi seçimi ve Puan alanı gerçek cihazda doğrulandı. `LocalDesktopOperationsTransport.fetchPointSpendQuote` Android/server saat farkı nedeniyle `generatedAtMs > now` olduğunda yanıtı reddediyordu; sınırlı 60 saniye ileri zaman toleransı kondu, owner expiry 30 saniye değişmedi. Geçici C20QuoteProbe logları tamamen silindi. TestDebugUnitTest (AndroidMarketSalesTest, PointPreviewGuardTest), assembleDebug ve adb install -r başarılı. Samsung'da gerçek HTTPS Puan yanıtı: `Kullanılabilir ₺10,00 / En fazla ₺10,00`. 5 TL girip yeniden sorgulayınca `Kalan nakit ₺95,00` yazısı da doğrulandı.

**Henüz pozitif Puanlı satış yapılmadı.** 18:09 sonrası canlı incelemede UI C20 Test Müşterisi + 5 tutarı gösterirken sorgu düğmesi tekrar `Puan limitini sorgula` idi; geçerli taze quote almadan onay verilmemeli. Salt-okuma DB doğrulaması 2 canonical sales / 2 income x 100 TL / 1 Android receipt / stock 8 / 1 gerçek +1000 minor point grant / 1 balance and 1 spend grant. Yerel masaüstü HTTPS, OpenCode ve Android açık, ADB bağlantısı aktif, HEAD fca57c5a, 374 kirli yol korunuyor. Pozitif owner route kodda `android-action-application-service.ts` üzerinden işlem zinciri olarak mevcut ama gerçek telefon satış, Store reserve/settle, ACK, replay henüz E2E PASS değil. Sonraki adım taze quote → 5 TL Puan + 95 TL nakit onayı → gerçek ledger/stock/Finance/receipt ve tekrar gönderim kontrolü. Detaylar continuation backlog C20p-2w checkpoint'inde.


### C20p-2w: gerçek Android Puanlı satış E2E PASS (2026-10-31)

SM-J700F Android Companion ile daha önce gerçek QR ve yerel HTTPS üzerinden eşleştirilmiş cihaz, aktif yönetici/Market satış/puan görme/puan harcama grant'leriyle 1 adet 100 TL üründe `requestedPointsMinor=500` seçti. Canlı Puan teklifinde `available=1000` minor, `max=1000` minor, nakit=9500 minor görüldü. Son satış onay penceresinde **5 TL Puan + 95 TL nakit** açıkça doğrulanarak tek işlemi gerçek telefondan gönderdik. Companion `Satış masaüstünde kaydedildi` gösterdi. Gerçek desktop DB: üçüncü `commerce_sales` kaydı, yeni `finance_entries.income=9500` minor TRY, stok 8→7, Android action ve sale receipt 1→2, `commerce_sale_settlements.points_tender_minor=500`, `cash_received_minor=9500`; Puan Store ledger `spend -500` ve %10 kazanım kuralıyla `grant +1000` minor TRY, settled reservation. Önceki +1000 ile net bakiye +1500 minor (15 TL). Sunucu kaynaklı receipt JSON cash 9500 / points 500 / actionId eşleşiyor.

Fiziksel Samsung kısa ekran boyu için test sırasında yalnız geçici ADB `wm size 720x1850` kullanıldı; işlem bitiminde özgün 720x1280 geri yüklendi. Bir önceki ilk son-onay aralıklı sessiz no-op oldu ama DB değişmedi; ikinci denemede taze quote ve ayrı SMS/receipt doğrulamasıyla başarı. Bu sessiz no-op **UI/yeniden render senkron yarışı** olarak izlenecek (kök neden henüz kesin değil).

İzole, canlı DB'den bağımsız `node scripts/smoke-companion-points-production-path.mjs` çıktı **exit 0 / PASS**, üretim HTTPS owner testinde aynı immutable action replay `already_applied=true` ve aynı makbuzla idempotent, değiştirilmiş payload deny, ikinci harcama/stok/Finance sıfır. **Kasıtlı fiziksel telefon ağ koparma/retransmission testi yapılmadı**, onu ayrı bırak. HEAD fca57c5a, 374 dirty yol korunuyor; bağlantı/eşleşme ve Bayi verileri muhafaza. Yeni migration, backup, legacy, deploy yok. Sonraki C20p-2x: normal mobil nakit earn bütünleşmesi, personel müşteri seçimi, dialog kapanırken sessiz no-op, kısa ekran scroll ve fiziksel kesinti/retry.


### C20p-2x — Samsung satış onayı / async-render / küçük ekran koruması (2026-10-31)

Android `MarketFormUi.confirmFinancial`, engellenmiş bir `Onayla` çağrısında default AlertDialog auto-dismiss yapıp sonucu sessizce kaybettiriyordu. Artık `setOnShowListener` pozitif click handler `feedback.submissionBlocked()` koşulunda görünür senkronizasyon mesajıyla dialog'u açık bırakır. `MarketCheckoutFlow.showPaidConfirmation` stale generation, rejected owner submit ve başarısız saleLifecycle durumunda görünür hata verir. Güvenli quote/ack ve immutable amount kontrolleri değişmedi. `MarketWorkspace.create`, yalnız yeni OperationData object identity'si nedeniyle doğrulanmış sale generation'ı bozmaz; yalnız `snapshotUpdatedAt` revizyonunda invalidate eder. `SCREEN_SALE` 104dp aşağı padding ve async rerender scroll restore eklendi. Samsung'un gerçek 720×1280 ekranında ödeme gönderilmeden test edildi: satış butonu ekranı kaydırınca tamamen görünür (bounds y812..920).

Android MarketSalesTest ve PointPreviewGuardTest BUILD SUCCESSFUL; market_sales/customer.view least privilege permission mapping 3/3 PASS; assembleDebug BUILD SUCCESSFUL; Samsung versionCode16 APK `adb install -r` ile veri silmeden yenilendi. İzole production HTTPS Puanlı satış/ACK/exact retry/negative smoke PASS. Gerçek finansal satış tekrarlanmadı, önceki fiziksel 5 TL points + 95 TL cash satışı ve kayıtlar korundu.

**C20p-2y:** Nakit Android paid customer sale yolunda earn settlement eksik: generic market_sale_complete owner route `completeMarketSaleInTransaction` ve no-benefits receipt bekliyor; pozitif points route real Store.reserve/settle olduğundan earn yapıyor. Mevcut `companionSaleBenefitsPreparedPorts` salt-okuma ve reserve/settle için güvenli yetki üretmiyor. 0 points ile pozitif intent guard'ı aşılmamalı veya doğrudan ledger grant yazılmamalı. Güvenli owner cash-only benefits settlement + receipt/ACK replay, ayrıca gerçek telefon ağ kesintisi + retry, gerçek staff role ve blocked-confirm testleri yapılacak. Migration/backup/legacy ekleme.

## C20p-2y — zero-Puan paid cash earn uses the protected owner settlement (2026-10-31)

A regular Android `market_sale_complete` with `settlement=paid`, `payment_method=cash`, a linked customer and omitted/zero `requestedPointsMinor` now earns the active companion points rule inside the same owner `BEGIN IMMEDIATE` as the canonical sale, Finance, stock, durable receipt and action ACK. The route is selected only when `commerce.benefits` and points are enabled and an active Companion `points` `earn` rule exists; otherwise the ordinary cash/credit/customerless sale still succeeds without benefits rows.

Security boundaries:

- `prepareCompanionCashSaleRoute` is pre-BEGIN and requires the authenticated `LocalCompanionActionContext`, an established protected `CommerceBenefitsKey.load(false)`, a real customer, live device/epoch and `market_sale_complete` permission. It never requires or forges a Puan **spending** grant; earn is not spend authority.
- In-parent binding re-reads the action/customer, device grant/epoch, canonical prices/currency, rules and `commerce.benefits` capability. `Store.reserve` uses an explicit zero points tender (no point hold), then the canonical paid sale writes cash Finance/stock, `Store.settle` writes the real earn grant, and the settled zero-Puan receipt witness is materialized before the durable Android action/sale receipt/ACK rows.
- Any failure rolls back the entire parent. Replay returns the stored receipt only after revalidating ACK/mapping, settled reservation, snapshot, grant and cash Finance; a changed payload for the same action id fails closed. Zero-Puan receipts are still guarded by durable settled evidence when a benefits snapshot exists.

The production smoke `scripts/smoke-companion-points-production-path.mjs` exercises real loopback HTTPS/TLS and the real owner transaction: a 100 TRY customer cash sale with a 10% Companion earn rule grants exactly +1000 minor, books 10000 cash Finance, decrements stock by one, writes the zero-points receipt/ACK and replay/negative cases. Customerless and credit zero-tender sales continue through the generic route with no reservation, snapshot or grant.

**Still open:** physical Samsung cash-earn sale, real disconnect/retry, staff-role device and refund/reversal decisions. This slice did not install an APK, touch the live database or run full release/deploy verification.


### C20p-2z — Samsung local HTTPS geçici yanıt kaybı / gerçek outbox kurtarma PASS (2026-10-31)

20:18 kullanıcı görüntüsündeki Puan ₺5 / Nakit ₺95 **ONAYLA** modalı henüz gönderilmemişti: baseline 4 satış, 4 finans, 3 Android receipt, 6 stok, net 25 TL Puan. Süresi geçmiş onay kapatılıp gerçek müşteri için yeni canlı ₺25 kullanılabilir Puan/₺95 kalan nakit teklif alındı. Gerçek Samsung onay modalı açıkça 100 TL sale, 5 TL Puan, 95 TL nakit gösterdi. İşlem onayından hemen önce yalnız masaüstü Electron HTTPS işlemi **6 saniye SIGSTOP** ile yanıtsız bırakıldı; önceden hazırlanmış bağımsız watchdog SIGCONT ile otomatik kurtardı. Telefonun USB, LTE ve Android verisi değiştirilmedi. Companion önce **Gönderim bekliyor · 1 işlem telefonda** gösterdi; masaüstü dönünce kullanıcı tekrar satış onaylamadan **Satış masaüstünde kaydedildi** dedi; kuyruk uyarısı kalktı, 20:23 senkronu göründü.

Kalıcı DB: commerce_sales **4→5**, finance_entries **4→5**, stok **6→5**, Android action ve sale receipt **3→4**, nakit Finance +9500 minor TRY; son receipt pointsTenderMinor=500/cashPaidMinor=9500/TRY/actionId doğrulandı, Store settled reservation sayısı **4** ve son settlement 500+9500. Ledger spend -500 + grant +1000; bakiye **25→30 TL**. Tek işlem işlendi; sonradan tekrar kontrolde 5 satış/5 finans/4 receipt sabit. Bu **gerçek Android → gerçek HTTPS sunucusu kısa süre kapalı → telefonda kalıcı kuyruk → otomatik tek teslim** kanıtıdır. Kablo çıkarma veya commit sonrası ACK paketini özel olarak kaybettirme testi değildir. C20p-2y ayrı production-path smoke'unda aynı action idempotent replay ve mutasyon fail-closed zaten PASS idi. HEAD fca57c5a / 374 dirty yol korunur; programlar/eşleşme aktif, hiçbir yeni kaynak APK/migration/backup/deploy değişikliği yapılmadı. Detaylar continuation backlog C20p-2z'de.


### C20p-3a — gerçek staff Companion saha testleri (2026-10-31 22:02)

Staff market_sales/market_operations + ayrı customer_credit_view ve customer_credit_payment izinleriyle SM-J700F Android 13 gerçek testleri tamamlandı. Mobil personelin müşterili satış picker'ı boştu: `local-android-device-projection.ts` artık market.product.view + market.sale.complete + customer.view yetkilerinde **yalnız aktif işletme müşteri id/full_name** aktarır, kişisel/hassas alanlar sıfırdır; `android-operations-snapshot.ts` müşteri kaynağı aktif işletmeyle tenant-scoped yapıldı. Native `addSelectionDialog` ödeme türü, veresiye müşterisi, tahsilat para birimi seçimlerinin Android küçük ekranının alt gezinmeyle çakışmasını engeller. Regression tests + Android unit/assemble PASS, `adb install -r` Success, staff pairing preserved.

Gerçek personel veresiye 100 TRY `commerce_sales 5→6`, cari debit +10000 minor, stok 5→4, Puan aynı; cari görüntüleme yetkisi tek başına ödeme yapamıyor; customer_credit_payment ayrı açılınca 100 TRY nakit tahsilat credit -10000, Finance +10000, cari bakiye 0 ve mobil `Borç ₺0,00`. Mal Kabul 1×40 TRY stok 4→5, stok sayım 4 ile 5→4; kasada/Puan'da yan etkisi yok. Ardından staff müşterili 100 TRY normal nakit satış ve +1000 minor Puan kazanımı: satış 6→7, Finance 6→7, stok 4→3, net Puan 3000→4000 minor; Android receipt/action ACK başarılı. Final gerçek DB sales7, Finance7, android sale receipts6, action receipts9, stock3, Puan40 TRY, cari ledger iki kayıt/net0. Comp/desktop/OpenCode aktif; git HEAD fca57c5a +377 dirty path; reset/backup/migration/deploy yok.

**Açık kupon boşluğu**: Android Companion kupon kodu girişi ve HMAC permit-backed authorisation, protected Store coupon reserve/settle, discount-aware cash/points receipt sözleşmesi henüz yok; kasiyer manuel indirim ve payment modifier ayrı, kapsamı karıştırma. Phase1 read-only audit `ses_e6cb1ab08ffeVYuwfbRBJx9von` tamam; yeni implementation `ses_e6caaa8bcffe4DP8ER8bB3Xcp9` başladı. Kod veya testler tamamlanmadan Companion tam PASS diye raporlama. C20p-2x blocked confirm unit guard PASS ama gerçek cihaz aktif sync-onay yarışı henüz ayrı tetiklenmedi. Diğer ayrıntılar continuation backlog C20p-3a bölümünde.


### C20q — Companion kupon attempt permit + advisory quote, Phase 1 sunucu (2026-10-31)

Bu dilim yalnız **sunucu-tarafı kupon yetkilendirme/teklif** ekler; Android kupon girişi, kupon UI'ı ve gerçek kupon redemption/settlement **bilinçli olarak kapalı** bırakıldı. Yeni `POST /local/v1/coupon-attempt` yalnız HTTPS/TLS üzerinde, canlı cihaz token'ı ile çalışır; HTTP veya test-only düz listener dahi generic `403 {"code":"coupon_attempt_denied"}` döner. Gövde allowlist'i `actionId,couponCode,customerId,lines,paymentMethod`; tüm hatalar aynı generic yanıttır, kupon kodu yanıtta/logda/outbox'ta yoktur.

- **Yeni dosyalar:** `apps/desktop-app/electron/companion-coupon-permit.ts` ve `scripts/smoke-companion-coupon-permit.mjs`. **Değişen:** `local-companion-server.ts` (route + `readCouponAttempt`), `database.ts` (`readAndroidCouponAttempt`), `main.ts` (protected `CommerceBenefitsKey.load(false)` pre-BEGIN, hata fail-closed), `packages/sync-core/index.ts` (`couponAttempt` endpoint sabiti). Şema/migration/backup yok.
- **Yetki zinciri:** canlı `android_local_credentials` + aktif admin/staff cihaz, `service.android`/satış/fixture yetenekleri, aktif işletme, gerçek müşteri, `authorizeAndroidAction` ile `market_sale_complete` paid izni, sunucu fiyat/para birimi çözümü ve benzersiz satır/quantity doğrulaması. Kupon kodu yalnız istek ömründe `BenefitsCheckoutIntent` içinde taşınır.
- **Permit:** yeni tablo açılmadı; mevcut `CommerceBenefitsStore.authorizeCouponAttempt` ve `commerce_benefit_coupon_authorizations` satırı 60 saniyelik gerçek permit olarak kullanıldı. Intent HMAC cihaz/işletme/müşteri/`coupon_<sha256(device:action)>` kaynağı/satır-quantity/ödeme yöntemine bağlıdır; kupon kodu plaintext saklanmaz. Rate limit cihaz başına 20/dk + tenant 1000/dk olarak korunur; HMAC, expiry, max-uses ve business scoping değişmedi.
- **Quote:** `subtotalMinor - discountMinor - pointsTenderMinor = payableMinor`; fixture kanıtı **100000 - 10000 - 0 = 90000** minor TRY. `preview` yalnız advisory'dir; reservation/hold/redemption, sale, Finance, stok, Puan ledger veya receipt yazmaz. Replay yeni permit üretir ama kupon rezervasyonu/redemption'ı oluşturmaz.
- **Kanıt (gerçek çıkışlar):** `node scripts/smoke-companion-coupon-permit.mjs` **PASS** (gerçek TLS peer doğrulaması, permit/quote, no-store, replay, forged alanlar, yanlış token/müşteri/kupon, disabled/expired kod, düz HTTP reddi, 20 sonrası rate-limit reddi ve yalnız izin/rate-limit tablolarının değişmesi). `npx tsc --noEmit -p apps/desktop-app/tsconfig.electron.json` **exit 0**; hedefli ESLint **exit 0**; `node scripts/smoke-companion-points-production-path.mjs` **PASS**; `node scripts/smoke-market-android-sales.mjs` **PASS**; `node scripts/smoke-android-point-spend-quote-server.mjs` **PASS**; `git diff --check` **exit 0**.
- **Bilinen sınır / açık:** permit henüz **harcanamaz**. Android action payload'ı kupon/benefits alanlarını reddediyor ve canonical satış kaynağı rastgele allocate ediliyor; bu yüzden sale owner deterministic `coupon_<hash>` kaynağını benimsemeyip permit'i reserve/settle içinde tüketmeden gerçek kupon indirimi/receipt/ACK E2E **yoktur**. Fiyat bağlama, tüketim anında sunucu fiyatının yeniden çözülüp quote ile karşılaştırılmasıyla sağlanmalıdır; şu an yalnız advisory quote vardır. Android kupon UI'ı ve Bayi/web kanalı değişmedi; tam Companion kupon PASS iddiası yapılamaz.

### C20q Phase 2 güvenlik sınırı — incomplete / fail-closed (2026-10-31 22:17 +03)

- Phase1 TLS kupon deneme/quote/60 saniyelik opaque izin PASS; `CommerceBenefitsStore` Phase2 taslak `reserveCouponWithPermit` **üretim çağrıcısı olmadan** bırakıldı. Android `market_sale_complete` kupon permit ID'si gönderemez; dolayısıyla gerçek `Store.reserve+settle` kupon tüketimi, indirim ayrışımı ve discount-aware immutable receipt/ACK henüz yok. Kuponlu satış E2E **PASS değil**.
- DeepSeek ücretsiz kullanım kotası (429) Phase2 ajanını durdurdu; iki adet ara TS type hatası kaynak düzeyinde düzeltildi (`return CouponRow`, kod/HMAC sırrı izin tablosuna yazılmıyor). Electron tsc, HTTPS kupon permit, mevcut kanonik mobil puan/cash, finans boundary ve masaüstü benefits/preview/management smokes PASS. Testler gerçek Android kuponlu ödeme anlamına gelmez.
- Sonraki backend çalışma önce canonical sale allocation ID ile sentetik cihaz+action permit source binding'i ve price/quantity/method/customer/epoch/expiry tazeliğini doğrulamalı, sonra aynı owner BEGIN IMMEDIATE içinde hold, paid sale, Finance cash = subtotal - discount - tender, settle, durable discount-aware ACK, exact replay/forged deny kanıtını üretmeli. Android/Outbox yalnız opaque permitId taşır, plaintext kupon hiçbir durable payload/log/receipt'e girmez. Sahte puan veya indirim tahmininden finansa yazılmaz. Test tamamlanana dek redeem yolu açılmamalı.

### C20q Phase 2 — kupon permit tüketimi ve indirimli satış sözleşmesi (2026-10-31)

- Companion kupon akışı iki aşamalıdır: TLS `coupon-attempt` yalnız 60 sn opaque `permitId` + advisory quote üretir; asıl satış `market_sale_complete` payload'ında **yalnız** `couponPermitId` taşır. Plaintext kupon kodu ActionOutbox/payload/receipt/event/log/yanıtta yoktur. Permit `code_ids_json` alanı `{codes,request,quote}` mührünü taşır; redemption plaintext/HMAC yeniden üretmez.
- Permit kaynağı `coupon_<sha256(deviceId:actionId)>` yalnız issuance bağıdır. Kanonik sale owner kendi allocation ID'sini üretir; rezervasyon/satış kaynağı odur, permit kaynağı sale ID diye kullanılmaz. Bu iki kimlik `reserveCouponWithPermit` içinde ayrı ayrı doğrulanır.
- `applyAndroidActionTransaction` permit görünce generic router'ı atlar ve aynı `BEGIN IMMEDIATE` içinde şu zinciri çalıştırır: intent binding → C20k issuance/policy → one-use paid-writer authority → Store permit reserve + coupon hold → canonical discounted sale → Store settle (redemption + earn) → discount-aware receipt → durable ACK. Herhangi bir hata tüm parent'ı geri alır; indirimsiz satışa fallback yoktur.
- Zorunlu kapsam: müşterili, `paid`, `cash`, `requestedPointsMinor=0`. Kupon+Puan karışımı, customerless/veresiye, yanlış müşteri/miktar/ödeme/fiyat/snapshot, tüketilmiş/süresi geçmiş/mutasyonlu permit, yetkisiz cihaz/rol reddedilir. Kupon kodu bilgisine sahip personel kullanabilir; ek per-kupon tıklama/grant yoktur.
- Tutar değişmezleri: `subtotal = discount + pointsTender + cashPaid`; Finance yalnız gerçek `cash_received_minor` gelirini yazar. Aynı action'ın birebir replay'i kanonik receipt döndürür; hold/redemption/spend/grant/ACK ikinci kez yazılmaz. Değişmiş payload aynı action id ile reddedilir.
- Durable receipt/ACK artık opsiyonel `discountMinor` taşır (eski kayıtlar alan olmadan da replay edilir); `readSettledPointsSaleFacts` kupon hold↔redemption↔snapshot eşitliğini ve `discountMinor > 0` ise en az bir redemption olduğunu doğrular.
- Phase 2 backend kanıtı: `scripts/smoke-companion-coupon-sale.mjs` gerçek TLS permit+action ile 100000−10000=90000 cash, Finance 90000, 1 hold/1 redemption, tek 10% earn, exact retry ve tüm negatifleri PASS etti. Electron tsc, hedefli ESLint, kupon permit, Puan production, market Android sales, finans boundary, preview ve point-spend quote smoke'ları PASS; `git diff --check` 0.
- **Açık:** Android Java/UI henüz permit üretmez/göstermez; gerçek cihaz kupon E2E yoktur. Kupon+Puan birlikte harcama kapalıdır. Bayi/web kanalı kapsam dışıdır. Bu nedenle "Companion kupon tam E2E PASS" denemez; yalnız backend owner zinciri PASS'tir.

### C20q Phase 3 — Android kupon girişi, TLS permit ve indirim-aware fiş (2026-10-31)

Companion Android istemcisi artık Phase 1/2 sözleşmesine bağlı gerçek kupon girişini yapar; backend permit tüketimi ve indirimli kanonik satış değişmedi.

- **UI kapsamı:** Yalnız müşterili **nakit** satışta, Puan alanından ayrı `Kupon Kodu` alanı ve `Kuponu Doğrula/Yenile` düğmesi. `Kupon + Puan > 0` birlikte gönderilemez; açık hata verilir. Başarılı permit'te ara toplam, kupon indirimi ve ödenecek nakit gösterilir; tek onay `ui.confirmFinancial` ile alınır. Onaydan ve gönderimden hemen önce permit `isCurrent()` ve sepet/müşteri/ödeme kapsamı yeniden doğrulanır.
- **Kod ömrü:** Plaintext kupon kodu yalnız mevcut checkout belleğinde (`CouponPermitRequest`/`couponCode`) yaşar. Sepet, müşteri veya ödeme değişince, satış kullanılınca ve onay iptalinde silinir; `ActionOutbox`, action JSON, receipt, event, log ve tercihlere yazılmaz.
- **TLS permit:** `LocalCompanionProtocol.COUPON_ATTEMPT_PATH` ve `LocalDesktopOperationsTransport.fetchCouponAttempt` aynı pinned TLS/QR eşleşmesiyle `{actionId,customerId,lines,couponCode,paymentMethod}` gönderir. Yanıt yalnız 6 alan (`permitId,expiresAtMs,currency,subtotalMinor,discountMinor,payableMinor`) ise ve `discount > 0`, `subtotal = discount + payable`, `expires - now <= 60 sn` ise kabul edilir.
- **Exact action id:** Kupon denemesinde `ActionOutbox.createActionId()` ile üretilen id permit isteğine ve `AndroidActionDispatcher.Command.preassigned` ile gönderilen satış action'ına aynen taşınır; trim veya yeniden üretim yoktur. `onCouponPermitRequested`/`onSubmitWithActionId` yalnız kupon yolundadır; normal satışın id üretimi değişmedi.
- **Fail-closed:** `CompanionOperationsRouter` kupon payload'ını Web/hosting action yoluna düşürmez (`local_coupon_tls_required`). Süresi geçmiş veya kapsamı değişmiş permit `toCouponSalePayload` ve onayda reddedilir; satış tam fiyatla sessizce gönderilmez. Masaüstü kupon hatası "yeni kupon kodu girip yeniden onaylayın" mesajına eşlenir.
- **Outbox/fiş:** Outbox yalnız opaque `couponPermitId` taşır. `validateSaleReceiptFacts` kupon intent'inde **9 alanlı** fişi, `discountMinor > 0`, sıfır Puan, müşterili `paid/cash` ve `cashPaidMinor == subtotal - discountMinor` ile doğrular; kupon dışı **8 alanlı** eski doğrulama değişmeden korunur.
- **Kod:** yeni `CouponPermit.java`, `CouponPermitRequest.java`, `AndroidCouponCheckoutTest.java`; değişen `MarketCheckoutFlow`, `MarketUiRules`, `MarketWorkspace`, `MainActivity`, `LocalDesktopOperationsTransport`, `LocalCompanionProtocol`, `AndroidActionDispatcher`, `AndroidActionPolicy`, `CompanionOperationsRouter` ve Desktop'ta yalnız kupon hata mesajı.
- **PASS (bu dilim):** `testDebugUnitTest` hedefli beş sınıf **BUILD SUCCESSFUL**, `AndroidCouponCheckoutTest` **6/6 PASS**; `assembleDebug` **BUILD SUCCESSFUL** (kurulmadı); Electron `tsc --noEmit` **exit 0**; `smoke-companion-coupon-sale`, `smoke-companion-coupon-permit`, `smoke-companion-points-production-path`, `smoke-market-android-sales`, `smoke-android-benefits-financial-boundary` **PASS**; `git diff --check` **exit 0**.
- **MISSING / açık:** Fiziksel Samsung kupon E2E, APK kurulumu, gerçek kupon satışı ve süpervizör watchdog senaryosu yapılmadı. Kupon + Puan birlikte harcama kapalıdır; Bayi/web kupon kanalı yoktur. Tam Android suite'te bu dilimle ilgisiz, önceden var olan `SaleConfirmationLifecycleTest` metin beklentisi (`if (!next.equals(screen)) checkout.invalidateSale()`) snapshot-version tabanlı mevcut `MarketWorkspace` koduyla uyuşmadığı için 1 hata verir; test/kod bu dilimde değiştirilmedi. "Companion kupon tam E2E PASS" denemez.

### C22 fiziksel kupon doğrulaması: clock skew ve güvenli ret (2026-10-31 23:28 +03)

- Android Companion kupon izin yanıtı sunucuda 60sn deadline ile üretilir. Samsung J700F ile Desktop epoch clock arasında ~600ms sapma gözlendi. Native `LocalDesktopOperationsTransport.fetchCouponAttempt` ve `CouponPermit` parser katmanındaki ayrı ayrı `expires-now > 60000ms` denetimleri dürüst TLS server quote'u geçersiz sayabiliyordu. Her iki parser bounded `<=65000ms` ile 5sn aykırı saati kabul eder; `CouponPermit.isCurrent()` tam tersine `now+5000ms < expiresAtMs` gerektirir, **server deadline sonrası asla kabul etmez**, 5sn erken ret. Server permit 60sn süresi/holder/intent kapsamı değiştirilmedi; kupon kullanımında server expiry, canonic price, prepaid cash, reserve/settle ve replay kontrolleri devam eder.
- Yeni JVM regression `smallDesktopPhoneClockSkewIsAcceptedButExpiresLocallyEarly`, mevcut kupon intent, 8/9 receipt, ActionOutbox secrecy/idempotency testleriyle birlikte PASS. 31 suite / 215 JVM unit /0 failures /2 skipped; Android 2.1.0-debug APK build+install PASS, QR-pinned HTTPS resync PASS. Server E2E TLS coupon sale 10000 minor subtotal−1000 discount=9000 Finance PASS yalnız izole fixture'da.
- Fiziksel pilotta kupon doğrulamasının ilk iki çağrısı permit üretmiş ama Android fail-closed durumuyla sonuçlanmış; gerçek DB'de 0 redemption, 7 sale/7 finance, stok 3, Puan 4000 minor. Saat düzeltmelerini içeren son APK kuruldu fakat **fiziksel kuponlu satış/receipt/ACK henüz PASS değil**. Sonraki aşamada cihazdan kısa geçerlilik penceresinde bir adet test satışı ve exact replay/stok/Finance/kupon-ledger doğrulanmalı. Test kuponu `c22_coupon_10`, kod sadece kullanıcı bilgisayarında erişimi kısıtlı geçici `/tmp/c22_coupon_secret.txt` dosyasında. Web/Bayi/release kapsam dışı.

### C22 — Gerçek cihaz kuponlu satış ACK ve ledger kanıtı (2026-10-31)

- C20q Phase2/3 native Companion sınırlı saat kayması düzeltmesi sonrası Samsung SM-J700F üzerinden `10000 minor subtotal - 1000 minor discount = 9000 minor cash` gerçek satış **PASS**. Sale `sale_mvwv0t7a_4yu9zenr`; Finance gelir 9000 minor; stok 3→2; 1 coupon redemption.
- Aynı action/sale için `android_action_receipts` + `android_market_sale_result_receipts` + `commerce_market_sale_receipts` kayıtları 1'er adet. Sonuç fişinde `cashPaidMinor=9000`, `discountMinor=1000`, `pointsTenderMinor=0`, `TRY`, `cash`; telefon ACK mesajı “Satış masaüstünde kaydedildi.”. Gerçek cihazda 2. satış/replay yapılmadı; isolated TLS testlerinde exact-retry güvenliği PASS.
- Puan ledger 4000 minor değişmedi; aktif points earn kuralı kuponla stacking kapalı. Kupon tek kullanımlık 1/1 tüketildi, sır içeren yerel geçici dosya silindi. C20q fiziksel E2E tamamlandı; release/deploy ve Bayi ayrı aşama.
