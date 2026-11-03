# Explicit Desktop backup restore reconciliation v1

Current-schema-only; single working copy. Built on publication protocol v3, not a new
protocol, backup framework, background sync engine or multi-device conflict policy.

## Ownership

| State | Restore authority |
| --- | --- |
| Desktop business/public profile, capabilities, menu, rooms/tables, catalogs, dealer desired access, marketing desired/editorial/media state, AI/Google desired config, availability inputs | Backup canonical state; regenerate through current producers |
| Web public request and guest/dealer submission facts/receipt history | Retain Hosting history; same remote identities replay |
| Restored local request/order decisions, links and tombstones | Restored canonical owners win; ingress replay cannot overwrite them |
| Web customer identities, provider methods, sessions, registration inbox, request/order receipts, rate limits | Never rewind/reset; normal access apply may revoke sessions |

Business Messaging webhook/status replay, Android action replay, provider deliveries,
shipment execution, cloud backup and multi-device arbitration are not extended here.

## Durable lifecycle

1. Existing maintenance drains runtime operations and creates the safety backup.
2. Copy the selected current-schema backup to the **staged** restore DB. Before the
   relaunch marker, atomically clear publication runtime, rotate to a fresh client identity,
   reset local request/order consumption cursors, insert `sync_restore_reconciliation`
   (`activation_pending`) and queue **every** `DESKTOP_PUBLICATIONS` kind. Preserve all
   backed-up business desired state. No network call or remote runtime reset.
3. Copy locally retained Web-origin canonical price/ingress snapshots and terminal dealer
   rejections from the current same-business database into the staged recovery journal.
   Only price/item/buyer/delivery ingress facts survive, not post-backup operational decisions.
   Restoring an earlier backup again carries this evidence forward. No public/diagnostic
   API exposes the journal.
4. Existing startup swaps the staged DB/assets. The DB itself already carries all recovery
   state; there is no post-swap best-effort job-list builder.
5. Normal coordinator reads authenticated remote `restore_sync_state`: current source epoch
   and retained request/order sequence bounds. Persist these before CAS activation. Use the
   existing `activate_publication_source` with a stable operation activation key.
   If the operator uses Settings → Web → Bağlan first, this action must resume **the same**
   pending restore activation operation/key, never claim a separate explicit-connect epoch:
   Hosting rejects reactivation of a retired client identity.
6. Atomically persist the exact new epoch and `reconciliation_pending`. Ordinary publishers
   regenerate/freeze canonical bodies, preserving v3 exact identity/hash/receipt semantics.
7. Mark each kind applied only after its exact receipt and conditional current-revision
   completion under this epoch. Mark bounded replay exhausted only after import and ACK
   succeed. Complete when every registry kind applied, no tracked outbox work remains,
   and both inbound replays completed. `complete`/completed timestamp remain status history.

`local_restore_complete` is the local file swap. `activation_pending` and
`reconciliation_pending` are **not** Web completion. The existing sync status includes
`restoreReconciliation` (state, epoch, remaining-kind count, bounded replay completion);
an otherwise healthy partial cycle reports that reconciliation is still pending.
This explicit user operation resumes even when passive automatic sync is OFF, without
changing that preference; after completion normal passive semantics return.

## Publication coverage and runtime cleanup

`apps/desktop-app/electron/desktop-publication-registry.ts` is the static inventory:
menu, Android/capability snapshot, online catalog, dealer private access/catalog,
marketing website, room catalog, table catalog, business context/public profile, AI
catalog, room availability, private AI settings and private Google reviews settings.

Job type is derived from registry keys. Preparation/retry routing and receipt names also
use it. Restore queues/tracks its keys, including empty/OFF withdrawal bodies. The real
SQLite/PHP/HTTP coordinator roundtrip asserts that the registry's full set appears under
the new epoch; an entry without a real apply path fails, as does a schema that cannot
queue it. No source-regex test or second hardcoded restore list is authoritative.

Old outbox jobs/high-water revisions, frozen payloads, saved epochs, attempts/backoff/error
and last-success metadata are discarded, not historical authority. Per-kind revisions start
at 1 through the normal allocator. Old general sync event history remains diagnostic only.
Hosting historic receipts remain stored, but retired-epoch requests cannot apply/replay them.
Business desired state, including marketing `desired_published`, commerce publication flags,
QR publication preference and canonical dealer authorization, is not rewritten.

Private settings retain safeStorage/private Hosting boundaries. An installed but
unconfigured AI provider withdraws effective remote availability without changing Desktop
desired capability/configuration. An unreadable existing AI credential (or invalid Google
configuration) remains pending, not a secret-clearing guess. No secrets enter public
projections or logs.

## Inbound replay and acknowledgement

Requests: Hosting retains payloads after ACK. Normal `after_seq` already bypasses the
global synced filter. Explicit restore reads only through the saved bound from cursor 0,
with active-source authentication, using existing same-ID upsert and owner preservation.
Ordinary startup never resets cursors. Local import commits before ACK.

Orders: normal pull excludes globally `imported_at` records. Explicit restore pull includes
retained records through the saved bound and indicates previous acknowledgement. It is
authenticated/fenced to the new active source. It does **not** clear global imported flags,
client ACKs or submission receipts. A fresh consumer identity gets its own ACK line.

Replay checks `source + source_reference` including restored tombstones first, then retained
canonical ingress evidence. Missing orders insert canonical Order/items transactionally
with original amounts and snapshots, in placed state. No current dealer authorization or
current catalog price can reject/reprice a previously canonical accepted order. Existing
orders keep restored status, links and owner decisions. Terminal dealer rejections replay
as terminal outcomes, not fabricated orders. A record without historical canonical evidence
and not previously imported still follows normal first-import validation/pricing.

After bounded replay, normal cursor consumption continues beyond its bound. Submissions
accepted during restore are not truncated or reset. Retention is essential: an operator's
external deletion of Hosting payloads or local canonical evidence is not reconstructible
from idempotency hashes alone. Missing acknowledged-order price evidence blocks/retries and
does not ACK loss or reprice; recover evidence rather than manufacture business state.

## Recovery contracts

| Boundary | Durable continuation |
| --- | --- |
| Queue staging fails halfway | Entire transaction rolls back; no relaunch marker/half registry; current DB untouched |
| Local restore succeeds offline / activation fails | `activation_pending`; all jobs/journal retained; no old-epoch publication; normal retry |
| Activation accepted but response lost / crash before local epoch save | Persisted expected epoch + operation key replay exact CAS activation |
| Crash after epoch save | Registry was already queued atomically before restore; no remaining-kind reconstruction gap |
| Some applies succeed, connection fails | Exact completed kinds remain applied; remaining frozen jobs retry on normal coordinator |
| Old epoch publish arrives late | v3 rejects it, including historic receipt replay |
| New epoch exact receipt lost | Same frozen body/revision/key/hash safely retries |
| Same recovery operation runs twice | Begin is a no-op by operation id; imports are identity-idempotent |
| A new explicit restore of the same backup | New operation/source epoch; same submission identities replay without duplicate effects |

An authenticated competing source activation or target change blocks continuation rather
than silently taking over/replaying another tenant. Existing producer validation limits,
missing media, unavailable credentials, authorization and permanent remote outages remain
visible prerequisites for convergence. Offline withdrawal cannot revoke disconnected Web
content until its ordered apply is accepted.

## Verification

`scripts/smoke-windows-demo-restore.mjs` also exercises the extracted Windows demo
ZIP, backup listing without setup/Web, prior normal publication and the exact
Settings Connect → restored publication flow against disposable local PHP Hosting.

`scripts/smoke-publication-protocol.mjs` invokes the real restore behavior helper at
`scripts/test-helpers/restore-reconciliation.mjs`: A→B→restore A, actual maintenance staging,
registry/schema/apply coverage, queue rollback injection, offline and lost activation response,
reopen after partial applies, lost exact receipt, old epoch fencing, restored marketing/media,
OFF withdrawal, private config clearing without public leakage, canonical room availability,
acknowledged public requests and both order sources with different historical prices, repeat
restore, owner decisions, retained shared-account bindings and old sessions. Existing focused
request/order/portal/automatic-sync/schema/marketing/availability regressions remain gates.
