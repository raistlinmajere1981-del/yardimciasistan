# Domain ownership revalidation — M1–M5

Date: 2026-10-06. Baseline: `main`, `6ae6cd736e1bbbe700f3648e98ab19ed106ecaf4`,
equal to fetched `origin/main`, clean worktree. This is a source revalidation, not
acceptance of the earlier audit's MUST labels. No migration, UI change, generic
repository/event framework, commit or push is part of this work.

| Finding | Verdict | Change |
| --- | --- | --- |
| M1 | CONFIRMED MUST | Replace nine canonical ledger triggers across four source families with the finance owner's transaction-aware primitive. |
| M2 | CONFIRMED SHOULD | Remove the shipment store's direct registration receipt UPDATE; delegate it to the registration owner within the existing transaction. The claimed mutual mutation/circular ownership does not exist. |
| M3 | INTENTIONAL BOUNDARY | No change: authoritative transactional customer/access reads and canonical pricing delegation. |
| M4 | CONFIRMED MUST | Eliminate overwriting the currently referenced file. Complete immutable files before a product/image-reference transaction; recover abandoned files on startup. |
| M5 | FALSE POSITIVE | No change: campaign queue/recipient orchestration and provider message delivery have different identities, state graphs and owners; transports use the same canonical message primitives. |

## M1 — canonical ledger writes

### Exact baseline symbols and ownership

All nine baseline symbols were in `apps/desktop-app/db/schema.sql`:

| Exact trigger | Source table/event | Ledger identity/category | Semantics |
| --- | --- | --- | --- |
| `trg_customer_credit_payment_finance_insert` | `customer_credit_entries`, payment INSERT | `customer_credit_payment` / `other_income` | Actual collection, not a credit-sale projection. |
| `trg_paid_table_order_finance_insert` | `table_orders`, paid INSERT | `restaurant_order` / `restaurant` | Restaurant income, excludes folio transfers. |
| `trg_paid_table_order_finance_update` | `table_orders`, paid UPDATE | Same | Upserts amount, currency, time, note; reactivates soft-voided income. |
| `trg_unpaid_table_order_finance_update` | Paid → non-paid | Same | Soft-voids income. |
| `trg_zero_paid_table_order_finance_update` | Paid total ≤ 0 | Same | Soft-voids income. |
| `trg_pension_payment_finance_insert` | Live `pension_payments` INSERT | `pension_payment` / `pension` | Reservation collection/deposit. |
| `trg_pension_payment_finance_update` | `pension_payments` UPDATE | Same | Mirrors collection edits/soft deletion. |
| `trg_room_folio_payment_finance_insert` | Direct live `room_folio_payments` INSERT | `room_folio_payment` / `pension` | Direct collection; copied reservation deposits excluded. |
| `trg_room_folio_payment_finance_update` | Direct `room_folio_payments` UPDATE | Same | Mirrors collection edits/soft deletion. |

These mutate the persisted ledger consumed by `DesktopFinanceService.getData`;
they are not a cache/index/projection. They provided real atomicity on the source
connection. That atomicity was correct and has been retained. The four-family
claim is correct, the four-trigger count is not.

Complete normal-runtime ledger writer inventory after the change:

- `apps/desktop-app/electron/finance.ts::saveManualFinanceEntryInTransaction`:
  manual INSERT, including the Android wrapper; active category validation.
- `finance.ts::DesktopFinanceService.deleteManualEntry`: manual soft DELETE via
  UPDATE; rejects automatic source types with the existing user message.
- `finance.ts::synchronizeFinanceSourceInTransaction`: automatic INSERT/upsert and
  restaurant soft-void UPDATE. Requires the caller's active transaction.
- No ledger SQL writer remains in another Electron domain module or in schema
  triggers. Fixture SQL is test seeding, and explicit backup/reset/restore is
  database lifecycle, not another ordinary business ledger writer. No physical
  runtime DELETE operation exists for ledger rows.

Automatic collection categories are fixed source policy. Manual category
availability was never the policy for these automatic collections. For example,
removing `other_income` from manual choices must not block an actual credit
collection. This is preserved explicitly in the finance owner. There is no
account-selection policy to bypass in the current ledger model.

### Exact call chains and canonical owners

- Restaurant IPC/Android → `DesktopDatabase.closeTableOrder` →
  `electron/table-order-service.ts::closeTableOrder` → source status write →
  `finance.ts::synchronizeFinanceSourceInTransaction("restaurant_order", id)`.
  TableOrder owns `table_orders`/items; finance owns `finance_entries`. The exposed
  `electron/database/table-order-store.ts::recalculateTableOrderTotal` also
  delegates via `recalculateTableOrderTotalInTransaction` when recalculating an
  already paid order, including zero-total void/reactivation.
- Finance IPC → `finance.ts::DesktopFinanceService.addPensionPayment` →
  `pension_payments` INSERT → the finance primitive. Reservation deposits retain
  their current service and source identity.
- Room-folio IPC or Android/application payment →
  `electron/room-folio.ts::addRoomFolioPaymentInTransaction` → direct payment
  INSERT → finance primitive. `DesktopRoomFolioService.addPayment` now opens the
  transaction; Android/checkout retain their enclosing transaction.
- `room-folio.ts::DesktopRoomFolioService.voidPayment` → source soft deletion →
  finance primitive → one commit. Imported reservation-origin payments still
  cannot be voided through this operation.
- Commerce IPC/Android → `electron/customer-credit-runtime.ts::recordCustomerCreditPayment`
  → `insertEntry` → finance primitive, inside `withCreditDatabase`.
  Credit account entries remain owned by customer credit, separate from folio.

The unique `(source_type, source_id)` partial index and deterministic ledger IDs
remain unchanged. Amounts, currencies, descriptions, timestamps, notes,
restaurant transfers, deposit-copy exclusion and visible reporting totals remain
source-derived. The primitive upserts the same ledger identity on source replay.
The source owner writes first, finance writes next, and the enclosing transaction
commits both. It never commits a caller's transaction.

### Failure evidence and classification limits

Before this change, raw SQL source writes invoked the ledger without passing
through the finance owner. That is the confirmed ownership bypass. No existing
runtime duplicate income or rollback failure was inferred from using triggers:
the original unique index/transaction already prevented those failures. The
change makes ledger policy and mutation authority explicit; it does not invent a
new payment/domain decision.

Failure injection now proves that a rejected finance INSERT restores source,
source projections/outbox and reporting state for all four families. A rejected
source INSERT/status UPDATE leaves no ledger income. Folio void failure restores
both payment and visible ledger. Repeated synchronization of one source produces
one row. Paid-order recalculation failure restores order totals; successful
recalculation updates the same income, zero total voids it, and a later positive
total reactivates it. Separate intentional manual payments still have different identities;
no new generic operation-idempotency API has been introduced.

Existing coverage: `scripts/smoke-finance-db.mjs`, `smoke-finance-service.mjs`,
`smoke-room-folio-service.mjs`, `smoke-storage-correctness.mjs`,
`smoke-room-folio-table-order-transfer.mjs`, `smoke-market-customer-credit-foundation.mjs`,
`smoke-android-finance-actions.mjs`, `smoke-android-room-folio-actions.mjs`, and
`smoke-domain-mutation-ownership.mjs`. Direct SQL source fixtures in finance-db and
room-folio-service now invoke the finance owner in their fixture transaction.
New coverage: `scripts/smoke-finance-source-ownership.mjs`, including the narrow
repository/schema writer guard plus executable rollback/identity/void checks.

Non-ledger triggers remain: remaining-payment/ownership/immutability guards,
reservation payment-status projection, outbox invalidation and other unrelated
domain invariants. Only the nine ledger triggers were removed. Current canonical
schema changes require the existing explicit clean-schema/reset or a future
pilot-specific one-off conversion; no migration/automatic data deletion was added.

## M2 — shipment and provider registration

Exact files/symbols:

- `electron/commerce-shipment-store.ts::{createShipmentForOrder, updateShipmentStatusInTransaction, applyShipmentProviderResult}`:
  owns `commerce_shipments`, local monotonic lifecycle, timestamps,
  provider binding, tracking receipt fields and order-cancellation constraints.
- `electron/shipping-registration-store.ts::{prepareShipmentRegistration, markShipmentRegistrationSubmitted, getShipmentRegistration}`:
  owns `commerce_shipment_registrations`, immutable provider/integration/account
  identity and `prepared → submitted → registered` integration lifecycle.
- `electron/shipping-provider-service.ts::ShippingProviderService.operation`:
  orchestrates facade calls, provider account checks and adapter I/O.
- `electron/database.ts::{prepareShipmentRegistration, markShipmentRegistrationSubmitted, applyShipmentProviderResult}`:
  facade/capability/business boundary, not a second provider engine.

Baseline registration store performs no shipment UPDATE/INSERT/DELETE. Its
conditional submission UPDATE reads shipment/order eligibility in SQL to close
the race between an earlier service/facade preflight and actual submission.
That re-read is the authoritative durable fence, not duplicate independent
business validation. No mutual mutation or circular store import existed.

One direct private-table writer did exist:
`commerce-shipment-store.ts::applyShipmentProviderResult` updated registration
`state='registered'` as well as shipment binding/tracking/local status. This is
an ownership SHOULD, not evidence of two canonical shipment engines or a current
split commit. Both writes already shared `BEGIN IMMEDIATE`.

It now delegates receipt identity validation and the conditional state write to
`shipping-registration-store.ts::confirmShipmentRegistrationInTransaction`.
The existing shipment transaction still owns the entire local receipt commit.
Shipment and registration never mutate each other's private tables directly.

Call chain: shipment IPC → `ShippingProviderService.registerShipment` /
`refreshShipmentStatus` → `DesktopDatabase` → capability-guarded commerce runtime
→ shipment transaction → registration primitive + shipment binding/status writes.
Provider submission remains a separate pre-I/O durable commit; it must not be
rolled back merely because receipt persistence later fails.

Concrete failure surface: provider succeeds, either local receipt owner fails.
Baseline atomicity was already correct; future bypassed registration validation
was the ownership risk. New failure injections verify both owner failures keep
shipment unchanged and registration `submitted`, then restart/retry queries the
existing remote registration without another `SetOrder`. Registered does not
mean dispatched; tracking/local lifecycle advancement remains monotonic.

Coverage: `scripts/smoke-commerce-shipments.mjs`, `smoke-commerce-shipment-ipc.mjs`,
`smoke-commerce-aras-provider.mjs`, `smoke-commerce-aras-ui.mjs`.
The Aras provider smoke now injects both registration and shipment persistence
failures and checks the same-provider retry/status/fence consistency.

## M3 — order → customer/dealer reads

Exact file/symbol: `electron/commerce-order-store.ts::createCommerceOrder`.
The only direct customer/dealer SQL is:

1. Access/revision + active customer/dealer + portal setting read under the
   order's `BEGIN IMMEDIATE`; capability read via `readEnabledBusinessCapabilities`.
2. Current pickup/shipping availability read for dealer ingress.
3. Current business-owned active customer ID/name read for the order snapshot.

The store writes `commerce_orders` and `commerce_order_items`, never `customers`,
`customer_commercial_profiles` or `commerce_dealer_web_access`. Buyer/delivery
normalization delegates to shared authoritative normalizers. Price/group/fallback
policy delegates to `electron/commerce-pricing-service.ts::resolveCommerceProductPriceInDatabase`;
the order store does not implement dealer A/B pricing independently.

Call chain: commerce IPC → `commerce-runtime.ts::createRuntimeOrder` →
`createCommerceOrder`; dealer web ingress → facade/runtime with access ID/revision
→ same operation. Canonical customer/profile mutations live in customer ownership;
access mutations live in `electron/dealer-web-access-store.ts::changeDealerWebAccess`.
Order placement must re-read current access state on its own transaction, rather
than trust an older web projection or a preflight from another connection.

Real failure scenario guarded by these reads: dealer revoked/inactivated or
access revision changes after web submission but before Desktop import. The order
must reject stale authority; customer/dealer reads prevent that failure. Similar
query predicates in an access projection do not constitute another mutation owner
or an independently chosen pricing decision. No confirmed correctness violation;
no resolver/repository abstraction was added solely to hide SQL reads.

Coverage: `scripts/smoke-commerce-orders.mjs`, `smoke-commerce-dealer-orders.mjs`,
`smoke-commerce-wholesale-pricing.mjs`, `smoke-commerce-wholesale-order-flow.mjs`,
`smoke-commerce-online-order-ingress.mjs` and publication/restore protocol coverage.

## M4 — product/image consistency

Baseline end-to-end call chain:

`src/components/market/ProductWorkspace.tsx::saveProduct` (and product creation
in `MarketProductsWorkspace.tsx`) →
`electron/preload.ts::commerce.saveProduct` / `invokeCommerceMutation` →
`electron/commerce-ipc.ts::registerCommerceIpcHandlers`, `commerce:product:save` →
`commerce-runtime.ts::saveRuntimeCatalogProduct` →
`commerce-store.ts::{saveCatalogProduct, saveCatalogProductInTransaction}` →
product transaction commits →
`product-data-service.ts::{archiveManualProductImage, archiveExternalProductImage, clearProductImage}`
→ image DB update/file work → response.

The product owner is the commerce store (`catalog_products`, including canonical
image identity). Acquisition/normalization and files belong to product media.
The baseline fixed `front.jpg` writer copied over an already referenced file
before a separate media DB UPDATE. Interrupted copy could leave truncated bytes
under the current reference. A rejected media DB UPDATE could leave new bytes
under the old reference/provenance. This is the confirmed MUST; SQLite being
separate from a filesystem is not itself an ownership violation.

Current chain:

IPC/session gate → `commerce-runtime.ts::prepareRuntimeCatalogProductImage`
(capability/inventory/category preflight) →
`product-data-service.ts::prepareProductImageForSave` → normalization/download →
unique temporary file, file fsync, rename to immutable `image_<uuid>.jpg`, directory
fsync where supported → recheck session/database/capabilities →
`commerce-store.ts::saveCatalogProductInTransaction` commits product fields and
prepared image identity together → projection notification and truthful response.
No post-commit filesystem finalize is required. Filesystem and SQLite are not
represented as one atomic transaction. A prepared file can be orphaned; it cannot
replace the previous file or become a missing DB reference through this workflow.
Clear is part of the product transaction; physical orphan cleanup follows later.

A/B/C/D outcomes:

| Injection/critical point | Product/reference result | File result |
| --- | --- | --- |
| DB save rejected | Previous product/reference preserved | New completed file is unreferenced; startup cleanup removes it. |
| Decode/download prepare rejected | Non-image product fields may save; previous image and its URL/license preserved | Previous bytes unchanged. |
| Rename/finalize rejected | Occurs before DB attachment; optional save returns previous image | Temporary file cleanup; possible unreferenced completed file if a later sync fails. |
| SIGKILL after staged-file fsync, before rename | Previous canonical product/reference | Temporary orphan, collected on restart. |
| SIGKILL after immutable file completion, before DB commit | Previous canonical product/reference | Completed orphan, collected on restart. |
| SIGKILL after DB commit | New product/reference, file already exists | Referenced immutable file retained. |
| Clear succeeds, later unlink fails | Empty canonical reference | Orphan only; later cleanup retries. |

`product-data-service.ts::cleanupOrphanProductImages` runs in `main.ts` after
successful database initialization and before background work starts. It locks
SQLite, retains every referenced asset (including references on soft-deleted
products), removes only our generated UUID images/temporary files, and does not
follow symlinks. Cleanup failure logs WARN without inventing a reference. This is
startup-only under the existing single-instance runtime, not a concurrent sweeper.
Legacy/unmanaged file names are deliberately left alone.

Image acquisition remains optional, preserving the established UX: failed image
acquisition does not reject otherwise valid product data. Stable structured WARN
events report the image failure, and the returned image identity reflects actual
canonical state. No new renderer contract or UI warning flow was introduced. The logging smoke
now checks archive diagnostics in the media owner instead of the former IPC
location, and includes that owner in its structured-logging guard.

The Android late-download wrapper `product-data-service.ts::archiveExternalProductImage`
now delegates reference mutation to
`commerce-store.ts::attachCatalogProductImageInTransaction`; it attaches only when
the current source URL still matches and the canonical image is empty. A late
provider response cannot overwrite a newly chosen manual image. This changes only
the image attachment guard, not Android/web synchronization architecture.

Prior coverage: `scripts/smoke-market-product-data-contract.mjs` was predominantly
source/bridge/UI contract assertions; it did not execute copy/crash failures.
New `scripts/smoke-commerce-product-media.mjs` launches the repository's installed
Electron and `apps/desktop-app/scripts/fixtures/commerce-product-media.cjs` executes
real native decoding, actual compiled IPC/runtime/store, SQLite and files. It
injects decode, download, rename, DB and cleanup failures, kills subprocesses with
SIGKILL at all three phases, reopens/cleans up, checks previous bytes/provenance,
late-provider-response fencing, and session lock arriving during asynchronous I/O.
No real provider network call occurs.

Limits: these tests prove application process-crash consistency, not arbitrary
external file deletion, media/disk corruption or hardware power-loss guarantees
on every filesystem/platform. SQLite/file fsync and pre-reference rename are
used, but a cross-resource hardware transaction is not claimed. Product data
backup/restore remains owned by the existing maintenance flow.

## M5 — separate campaign orchestration and message delivery

Exact owner comparison:

| Exact file/symbol | Identity / owned state | Network/retry responsibility |
| --- | --- | --- |
| `messaging-campaigns/service.ts::MessagingCampaignService` | Campaign draft/prepared/running/paused/completed/cancelled; prepare/start/pause/cancel | Template discovery and explicit campaign operations; no send POST. |
| `messaging-campaigns/dispatch-service.ts::CampaignDispatchService.runBatch` | Local outbox claim, lease, due time, attempt limit, completion | One canonical dispatch worker/backoff policy, transport delegation. |
| `messaging-campaigns/dispatch-store.ts::{claimDispatchBatch, beginCampaignSubmission, finishDispatchClaim, recoverDispatchClaims}` | `messaging_outbox`, recipient orchestration, shared rate permit | Transactional consent/current-contact check, message attachment and lease fence. |
| `business-messaging/service.ts::BusinessMessagingService.dispatchCampaignItem` | WhatsApp transport adapter | Calls canonical submission primitive, WhatsApp POST, canonical status apply/rejection release. |
| `business-messaging/sms-service.ts::SmsMessagingService.dispatchCampaignItem` | SMS transport adapter | Same canonical submission/status/release primitives, different provider protocol. No separate queue/backoff graph. |
| `business-messaging/store.ts::{claimBusinessMessageInTransaction, refreshUnsubmittedBusinessMessageInTransaction, releaseRejectedBusinessMessageInTransaction, applyBusinessMessageStatus, failBusinessMessage}` | `business_messages`, `business_message_provider_bindings`, durable submitted fence, delivery evidence | Canonical message API owner; guarded schema cancellation invariant also applies; no independent campaign message UPDATE implementation. |
| `business-messaging/status-sync-service.ts` / provider webhook ingress | Provider delivery observation | Reconcile canonical status; never restart campaign POST. |
| Marketing share/publication/scheduler services | Editorial target/publication/occurrence identity | Delegate canonical campaign/message operations; website/Instagram publication is a distinct protocol. |

Composition: `main.ts`'s `CampaignDispatchTransport.dispatchCampaignItem` selects
SMS or WhatsApp transport by the already canonical claim channel. Both call
`DesktopDatabase.beginCampaignSubmission` → the same dispatch store → canonical
BusinessMessage attachment/claim. Both apply receipts through
`DesktopDatabase.applyBusinessMessageStatus`. Proven rejection calls
`releaseRejectedCampaignMessage` → lease-checked dispatch wrapper →
`releaseRejectedBusinessMessageInTransaction`. They do not implement separate
message state transitions. The campaign preparation store never performs SMS POST.

The outbox graph is `pending → claimed → dispatched/skipped/failed/cancelled`,
with controlled lease/backoff. Message state is
`draft → queued → accepted → delivered/read` or failed, with submitted fencing.
Recipient state is membership/suppression/delivery projection. Campaign completion
means local audience dispatch has terminalized, not that every provider delivery
succeeded. A late delivery failure must not enqueue another campaign send.
Similar provider error handling is transport adaptation around the same mutation
primitives, not two independent pending/sending/sent implementations.

The retained `db/schema.sql::trg_campaign_outbox_terminal_message` is a narrow
cross-record invariant: skipped/cancelled transport intent cancels only its
certainly unsent marketing message (`draft`, `submitted=0`). It does not claim,
release a submitted fence, retry, POST, accept or advance provider delivery. It
cannot cancel submitted/accepted/delivered/read messages. Its existence is not a
second dispatch implementation; D-037 and existing suppression/terminal-state
regressions explicitly cover this contract. It was not changed.


Real guarded failure scenarios: POST uncertainty, lost receipt, stale worker,
concurrent dispatch, proven rejection with retry, provider delivery failure after
outbox completion. Existing canonicalization already addresses these. No confirmed
second state machine was removed and no messaging source file was changed.

Coverage: `scripts/smoke-messaging-dispatch.mjs` (34 executable scenarios),
`smoke-messaging-dispatch-lifecycle.mjs`, `smoke-messaging-campaigns.mjs`,
`smoke-business-messaging-provider.mjs`, `smoke-marketing-multichannel.mjs`,
`smoke-marketing-share.mjs`, `smoke-marketing-schedules.mjs`,
`smoke-publication-protocol.mjs`. The existing regression suite includes rejected
release/refresh rollback, terminal-state protection, late webhook evidence,
concurrency, provider failure and no duplicate uncertain POST.

## Verification and remaining risk

Focused checks passed for finance source commit/rollback/void/idempotent ledger,
finance DB/service and folio fixtures, Aras receipt failures/retry, native product
media crash/recovery and the existing 34 campaign dispatch scenarios. Electron
typecheck and strict lint passed during iteration. New smoke leaves are registered
in `scripts/verification-registry.mjs`; the canonical runner remains the only gate.

Final gate result is recorded in the accompanying verification report. Release
inherits full and pre-main, so it includes workspace/Electron typecheck, strict lint,
Knip, current-schema authority, mutation ownership, finance/commerce/shipment/media,
messaging/campaign/publication, whitespace, packaging and Android release gates.

No unresolved second ledger writer, shipment/private registration writer, duplicated
order price policy, workflow-produced missing image reference, or duplicate campaign
state-machine owner remains. Provider uncertainty/exactly-once limits and external
filesystem damage remain the established boundary, not a new ownership defect.

## Changed files

Production changes:

- `apps/desktop-app/db/schema.sql`
- `apps/desktop-app/electron/finance.ts`
- `apps/desktop-app/electron/customer-credit-runtime.ts`
- `apps/desktop-app/electron/room-folio.ts`
- `apps/desktop-app/electron/table-order-service.ts`
- `apps/desktop-app/electron/database/table-order-store.ts`
- `apps/desktop-app/electron/shipping-registration-store.ts`
- `apps/desktop-app/electron/commerce-shipment-store.ts`
- `apps/desktop-app/electron/commerce-store.ts`
- `apps/desktop-app/electron/product-data-service.ts`
- `apps/desktop-app/electron/commerce-runtime.ts`
- `apps/desktop-app/electron/commerce-ipc.ts`
- `apps/desktop-app/electron/main.ts`

Tests/registry/report:

- `scripts/smoke-finance-source-ownership.mjs` (new)
- `scripts/smoke-finance-db.mjs`
- `scripts/smoke-room-folio-service.mjs`
- `scripts/smoke-commerce-aras-provider.mjs`
- `scripts/smoke-commerce-product-media.mjs` (new)
- `apps/desktop-app/scripts/fixtures/commerce-product-media.cjs` (new)
- `scripts/smoke-market-product-data-contract.mjs`
- `scripts/smoke-desktop-logging-contract.mjs`
- `scripts/verification-registry.mjs`
- `docs/architecture/DOMAIN_OWNERSHIP_AUDIT_M1_M5.md` (new)

Suggested commit title: `fix(desktop): centralize ledger ownership and preserve product media on failure`.
No commit or push was performed.

## Final verification result

`npm run verify:release`: **181 passed, 0 failed, 0 skipped**. The registry's
Release preset inherits Full and Pre-main and executes each leaf once per run.
Report: [`2026-10-06T18-55-44-357Z.json`](../../artifacts/verify/2026-10-06T18-55-44-357Z.json).
Focused finance ownership and native product/media checks each passed **3/3**,
including their registry-owned build prerequisites. The final Release run includes
the corrected logging owner guard and the normal image-metadata edit regression.
No known pre-existing failure and no unresolved new failure remain.

The tracked widget template is unchanged. `HEAD` and fetched `origin/main` remain
`6ae6cd736e1bbbe700f3648e98ab19ed106ecaf4`. No commit/push occurred.

Final `git diff --stat` (untracked additions are listed separately by status):

```text
 apps/desktop-app/db/schema.sql                     | 240 ---------------------
 apps/desktop-app/electron/commerce-ipc.ts          |  58 +----
 apps/desktop-app/electron/commerce-runtime.ts      |  23 +-
 .../electron/commerce-shipment-store.ts            |  14 +-
 apps/desktop-app/electron/commerce-store.ts        |  46 ++--
 .../electron/customer-credit-runtime.ts            |   4 +-
 .../electron/database/table-order-store.ts         |   5 +-
 apps/desktop-app/electron/finance.ts               |  53 ++++-
 apps/desktop-app/electron/main.ts                  |   2 +
 apps/desktop-app/electron/product-data-service.ts  | 152 +++++++------
 apps/desktop-app/electron/room-folio.ts            |  13 +-
 .../electron/shipping-registration-store.ts        |   9 +
 apps/desktop-app/electron/table-order-service.ts   |   2 +
 scripts/smoke-commerce-aras-provider.mjs           |  21 ++
 scripts/smoke-desktop-logging-contract.mjs         |   4 +-
 scripts/smoke-finance-db.mjs                       |  14 +-
 scripts/smoke-market-product-data-contract.mjs     |  12 +-
 scripts/smoke-room-folio-service.mjs               |   4 +
 scripts/verification-registry.mjs                  |   2 +
 19 files changed, 282 insertions(+), 396 deletions(-)
```

Final `git status --short`:

```text
 M apps/desktop-app/db/schema.sql
 M apps/desktop-app/electron/commerce-ipc.ts
 M apps/desktop-app/electron/commerce-runtime.ts
 M apps/desktop-app/electron/commerce-shipment-store.ts
 M apps/desktop-app/electron/commerce-store.ts
 M apps/desktop-app/electron/customer-credit-runtime.ts
 M apps/desktop-app/electron/database/table-order-store.ts
 M apps/desktop-app/electron/finance.ts
 M apps/desktop-app/electron/main.ts
 M apps/desktop-app/electron/product-data-service.ts
 M apps/desktop-app/electron/room-folio.ts
 M apps/desktop-app/electron/shipping-registration-store.ts
 M apps/desktop-app/electron/table-order-service.ts
 M scripts/smoke-commerce-aras-provider.mjs
 M scripts/smoke-desktop-logging-contract.mjs
 M scripts/smoke-finance-db.mjs
 M scripts/smoke-market-product-data-contract.mjs
 M scripts/smoke-room-folio-service.mjs
 M scripts/verification-registry.mjs
?? apps/desktop-app/scripts/fixtures/commerce-product-media.cjs
?? docs/architecture/DOMAIN_OWNERSHIP_AUDIT_M1_M5.md
?? scripts/smoke-commerce-product-media.mjs
?? scripts/smoke-finance-source-ownership.mjs
```

Final ownership answers, scoped to the ordinary managed application workflows:

- Cross-domain canonical finance writer outside its application/domain owner: **NO**.
- Two independent canonical mutation owners for the same shipment/provider lifecycle: **NO**.
- Independent dealer/customer policy implementation in order persistence: **NO**.
- Product save leaving a missing canonical image reference at the tested failure/crash points: **NO**.
- Two independent implementations of the same campaign/provider dispatch lifecycle: **NO**.
