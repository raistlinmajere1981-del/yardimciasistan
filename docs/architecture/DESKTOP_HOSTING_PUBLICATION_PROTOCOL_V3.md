# Desktop → Hosting publication protocol v3

Baseline-only schema contract; there is no migration or revisionless publication path.
Hosting is tenant-scoped by its deployment database and authenticated sync secret.

## Revalidated inventory

| Hosting name | Previous lifecycle | Canonical intent owner |
| --- | --- | --- |
| `menu` | Outbox plus optional-revision manual POST | Menu invalidation triggers; shared durable publication lifecycle |
| `android_snapshot` | Outbox plus direct action/manual snapshot | Android invalidation triggers; shared durable publication lifecycle |
| `online_catalog` | Versioned outbox | Commerce publication invalidation triggers |
| `dealer_access_private` | Versioned outbox, transactional apply callback | Dealer aggregate `dealer_access` |
| `marketing_website` | Versioned outbox | Marketing desired-state triggers; prepared projection and sent metadata frozen together |
| `room_catalog` | Direct, in-memory payload comparison | Canonical public catalog reconstructed each cycle; persisted desired-body comparison |
| `table_catalog` | Direct, in-memory payload comparison | Canonical public catalog reconstructed each cycle; persisted desired-body comparison |
| `business_context` | Direct startup/settings POST | Canonical public context reconstructed each cycle and at manual/settings publication |
| `ai_catalog` | Direct, in-memory payload comparison | Canonical AI catalog reconstructed each cycle; persisted desired-body comparison |
| `public_room_availability` | Direct heartbeat, arrival-order revision | Each heartbeat ensures durable intent; a pending identical heartbeat retries its frozen body |
| `ai_settings` | Direct PHP file plus sync metadata | Settings/profile mutation triggers; explicit publication and automatic pending-job retry |
| `google_reviews_settings` | Direct private PHP file | Settings mutation trigger; same private config lifecycle as AI settings |

All aggregate job keys equal the hosting name except `dealer_access`, whose private
hosting name is `dealer_access_private`. Every key has **one** allocator:
`sync_outbox` + the permanent `sync_outbox_revisions` high-water mark.

## Preparation and retry

`publishDesktopProjection` uses the `DesktopDatabase` facade to prepare intent.
`sync_publication_payloads` retains the immutable prepared body and revision,
including after completion. This is not an in-memory ordering cache.

Trigger-owned aggregates freeze the first prepared body for a revision. A mutation
invalidates that revision atomically with its transaction. Derived catalogs/context
are reconstructable from canonical persistence: every cycle re-reads the canonical
producer and compares with persisted semantic content, excluding only aggregate
generation timestamps. A crash between canonical commit and application scheduling
is recovered by that scan. Changed desired content allocates a newer revision;
unchanged pending content retries the same body/key after restart.

The current publication target is persisted in `sync_runtime`. A target transition
atomically invalidates prepared aggregates, even for unchanged completed payloads
or when returning to a previously used target after restart. Target epochs stay
independent; this does not implicitly replace an existing hosting source.

An async Marketing media preparation carries the original expected outbox revision.
If a mutation committed during preparation, the older body is not attached to the
newer revision. Projection and exact sent publication metadata freeze together.

Manual Menu/Android publication makes durable intent due immediately and executes
this same lifecycle, without running unrelated ingress operations. No separate
manual transport, revision allocator, or ordering guarantee exists.

## Source activation and permanent fencing

`activate_publication_source` is authenticated, POST-only and separate from apply.
Its input is `(client_id, expected_epoch, activation_key)`.

Hosting serializes the operation under `BEGIN IMMEDIATE`, compares the current
epoch with `expected_epoch`, allocates `expected_epoch + 1`, and persists its
activation receipt in `publication_sources`. Exact activation retry is idempotent.
No publication POST activates or replaces a source. A random client ID's first
publication cannot take over.

Desktop bootstraps only against epoch zero with a stable activation key and persists
the returned epoch per target. Replacement must explicitly name the previous epoch
and a fresh source identity; retired client identities cannot activate again.
`publication_sources` history survives authenticated **runtime** reset. A late old
epoch, including a historic receipt replay, is rejected before any callback/receipt
lookup can claim success. Future restore work can use this explicit CAS primitive;
this change does not implement restore republish/reconciliation.

## Exact apply and receipt

Required identity:

```text
tenant database / publication name
+ client ID + source epoch + source revision
+ idempotency key + SHA-256 of immutable publication_body
```

Transport sends the exact JSON body string and its hash. Hosting checks that it
decodes to the domain candidate and verifies the hash before sanitizing/applying.
Fingerprinting the wire candidate avoids server-generated timestamp differences on
retry. The sanitized projection remains the consumer contract.

- Lower unapplied revision: `stale_publication_revision` (409), no side effects.
- Same revision/body: exact idempotent receipt/no-op.
- Same revision/different body: `publication_payload_conflict` (409).
- Same key with another identity/body: `publication_receipt_conflict` (409).
- Inactive or retired generation: `publication_source_fenced` (409).

Domain callback, projection row, hash, epoch, server revision and receipt commit in
the **same SQLite transaction**. Dealer apply still receives that exact PDO object.
Availability uses the same ordered primitive but intentionally does not bump the
Android operational cache revision for a freshness heartbeat.

Success includes publication name, source ID/epoch/revision, idempotency key, hash,
accepted/deduplicated status, server revision and the original apply timestamp.
`sync-core` validates every field against the sent wire identity before exposing
`ok:true`. Desktop additionally checks identity at the completion boundary. A
different/missing ack leaves the exact job pending and does not advance domain
published metadata. Completion deletes only the acknowledged job revision.

## Metadata and secrets

Menu acknowledgement compares exact sent row snapshots with current projected rows,
then marks only matching IDs/versions synced. It never changes `updated_at` as an
ack side effect. This also detects a same-timestamp in-flight edit. New/changed rows
retain their newer invalidation and are not marked published by an older snapshot.

AI/Google desired secrets are frozen with Electron safeStorage at rest on Desktop.
Hosting stores configuration in `private_publication_config`, not public projection
payloads; only an empty metadata projection plus fingerprints enter `publications`.
Private config and its receipt share SQLite commit/rollback, eliminating the
file-replace-versus-metadata crash gap. Database/WAL/SHM use restrictive permissions;
the hosting `data/` boundary remains protected. AI transport returns allowlisted
metadata, never raw secrets or untrusted response fields. Existing host-local defaults
are not Desktop publishers and cannot override applied private config.

An installed AI capability with missing provider configuration is unconfigured,
not a failure of unrelated automatic sync; its durable intent waits for configuration.
Explicit publication still reports invalid configuration. Metadata acknowledgement
does not clear a newer local settings mutation.

## Deliberately not changed

Availability producer limits and hosting truncation; Marketing capability-off
withdrawal; public request submission idempotency; restore full payload set and
post-restore Marketing/AI reconciliation; QR semantics; resource catalog visibility;
AI knowledge limits; coordinator decomposition; navigation and domain ownership.

## Regression evidence

`scripts/smoke-publication-protocol.mjs` exercises real PHP/HTTP and both SQLite
stores: ordering, same-revision conflict/replay, explicit replacement and retired
source fencing, disabled/empty direct producers, restart/lost response, wrong ack,
Menu same-timestamp in-flight mutation, manual Android/Menu lifecycle and private
config storage. `packages/sync-core/tests/sync-core.test.cjs` separately rejects
each mismatched receipt field and missing identity without relying on fixture
receipt enrichment.
