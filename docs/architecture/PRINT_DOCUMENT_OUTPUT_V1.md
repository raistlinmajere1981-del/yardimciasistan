# Print / document output foundation v1

## P2c-5d atomic sale capture (2026-10-29)

New sale preparations read bounded scoped image bytes before taking the write lock,
then create the job, render snapshot and frozen images in one SQLite transaction.
Source and configuration are checked again under the lock, and the source is checked
again after capture, before commit. Nested snapshot/source savepoints participate in
the outer transaction. A failure rolls back all new evidence, so a later explicit
prepare can start afresh; independent connections cannot see intermediate stages,
including a scanless render. Committed identical replays retain the same job ID.
No preparation, retry or replay invokes printing or confirms a reprint.

Previously persisted incomplete jobs are not resumed or deleted: missing render or
image evidence still causes `DOCUMENT_SALE_JOB_CONFLICT`. The old operation ID did
not record uncaptured image bytes, so their original content cannot be proven. In
particular, legacy scanless jobs with an already committed render cannot be reliably
distinguished from completed jobs by this schema; the historical readiness gap for
those rows remains. Do not manually reconstruct or delete them, or interpret failure
as permission to print. Schema, immutable triggers and completed replay semantics are
unchanged; any legacy remediation requires a separate explicit policy.

## P2c-5c2 market receipt actions

After an explicitly prepared confirmed sale receipt, Market offers separate explicit
native preview and print actions for that frozen job, labelled non-fiscal. Neither
preparation, preview nor print is automatic. The native confirmation remains required.
`DOCUMENT_PRINT_CANCELLED` leaves the job ready; a successful null result means the
job was already attempted and is terminal, not a cancellation. Accepted means OS
spool acceptance only; failed, unknown, already-attempted and other ambiguous errors
are not automatically retried. Check Baskı Yönetimi and the printer before any
explicit recovery/reprint. Sale, business, capability and unmount invalidation apply.
The browser smoke uses mocked bridges; physical printing remains a separate host test.

## P2c-5c1 frozen ready-document preview

Ready jobs have a separate native preview action. Main accepts only kind and job ID,
derives business and installation, checks the exact non-fiscal manual native-print
job in awaiting-confirmation, and composes the validated frozen snapshot and complete
frozen images with the same HTML owner as PDF. The preview does not claim or print a
job, return its content to the UI, or use the representative template canvas.

The parented renderer has JavaScript, Node and devtools disabled, an isolated
in-memory partition, restrictive CSP and network denial. It initially fits the page
width and supports scrolling and Ctrl +/- zoom. Closing destroys the window, removes
its protocol/request handler and clears partition storage/cache. Authority and job
state are revalidated before showing and every 500ms while open; the parent closing
and a five-minute maximum lifetime also close it. This polling cannot observe a lock
or authority change that is reversed entirely between checks; an event-driven session
generation notification would be needed to eliminate that short interval. Electron
does not expose a partition-destruction API; the unique nonpersistent session is not
reused after its handlers and storage are cleared.

## P2c-5b3b market receipt request

The Market quick-sale screen offers **Fişi hazırla** only after a confirmed sale,
with persisted Sales and Printing capabilities and an available preparation bridge.
The user must request preparation; sale completion neither prepares nor prints.
The local result directs the user to Baskı Yönetimi > Hazır Belgeler, and preparation
failure does not change the sale's success message. Starting another checkout,
changing business or authority, and unmounting invalidate the old action or pending
result. Uncertain benefits settlement must first be resolved. The existing trusted
preparation owner provides replay identity; this UI does not create a print operation.

Focused browser verification uses `node scripts/smoke-market-sale-benefits-ui.mjs`:
existing benefits assertions remain intact alongside opt-in preparation, configuration
failure, replay payload, busy, authority/business change, unmount, new checkout and
missing bridge checks. This uses a mocked preparation bridge, not a physical printer
or CUPS; real preview remains a separate slice.

Status: P0 foundation + P1b revisioned templates/printer configuration + P2a local blank-form intake + P2b-1 manual preparation core (no preparation UI), 2026-10-28.
P1b-1 reads/saves document output rules; previews remain representative DOM samples; no output engine, workflow integration, output renderer,
PDF generation, physical print, provider connection or message delivery exists here.
User decisions in this document supersede earlier printing research proposals.
`print-system-invoice-module-analysis.md` was not found in the available workspace.

## Ownership and activation

`packages/shared/types/document-output.ts` owns the declarative contracts and
validation; `document-output-store.ts` owns bounded SQLite creation/policy writes.
The current installation schema is `apps/desktop-app/db/schema.sql`; no migrations,
startup backfills, compatibility layers or secondary stores are introduced.
`PRINTING` (`document.printing`) is optional for every business profile and default
OFF. It has no dependency that enables another sector. Runtime authorization uses
persisted capabilities, not profile IDs: receipts require Sales, table bills Orders,
stay statements Stays, product labels Labels. WhatsApp additionally requires its
persisted service capability. Disabling a capability retains historical jobs but
blocks enqueue and future execution. Completion evidence can still be recorded for
an already sending job after capability revocation.

Additional kinds, mirrored in TypeScript and current SQL checks/capability guards:

| Kind | Required capability | Compatible events (all also allow `manual`) |
| --- | --- | --- |
| `credit_statement` | `commerce.customer_credit` | `customer_statement_requested` |
| `shipping_label` | `commerce.orders` | `order_dispatched`, `shipment_created` |
| `kitchen_ticket` | `food_service.orders` | `order_created` |

These are declarative contracts, not wired event subscriptions. General retail does
not gain shipping labels unless Orders is explicitly active. Product labels still
require the existing `retail.labels` capability. Invoice copy remains manual-only in
P0 and is omitted from the P1a UI because no invoice issuance service exists.

Templates and jobs belong to a business. Printer bindings additionally belong to
an installation; jobs reference the composite business/installation/binding key.
Bindings cannot be edited under existing jobs: create a new binding ID. These local
records have no public publication, shared site payload or sync integration. Future
private synchronization must preserve installation ownership and exclude bindings
from public data. No provider credentials or recipient addresses are stored here.

## Rendering and channels

A document is independent of print/email/WhatsApp delivery. Each document + trigger
+ channel has its own OFF / ASK_CONFIRMATION / AUTOMATIC rule. Native print and SMTP
are prospective autonomous adapter kinds; WhatsApp Business API may support auto,
WhatsApp WebView always requires user confirmation. Adapter kind compatibility is
validated now; it does not establish installed/authorized/ready provider support.
The shared support gate additionally requires authoritative adapter availability
and autonomous-delivery support for AUTOMATIC, independent of the saved rule.
P0's domain transition function explicitly rejects `sending` because no adapter,
recipient validator, confirmation authority or autonomous delivery exists yet.

The whitelist covers business/document/customer/total/product fields and a bounded
repeatable line block. Fields are bindings, never arbitrary expressions, HTML or JS.
Dimensions use integer tenths of a millimetre (`mm10`, 10 = 1mm), pages 20–500mm wide
and 20–1000mm high, at most 100 fields per block, 200 repeated rows, 100 copies and
32KiB UTF-8 template snapshots. Fields and line blocks must fit their page/row.
Scan originals and processed images are separate opaque local asset references;
foreground placement is explicit. Assets, perspective correction and manual or
opt-in AI processing are future owners; no image processing runs in P0.
SQLite checks/triggers and the domain validator reject unsupported template fields,
units, geometry, scan references and channel combinations.

## Durable identity and delivery evidence

Template revisions are immutable and cannot be deleted. Each job freezes source ID,
operation ID, kind/trigger, channel/adapter/mode, layout, revision, copies, installation
and printer binding. A source field-value rendering snapshot and recipient selection
are deliberately deferred until an adapter/rendering slice; P0 cannot render a
historically accurate document from mutable current business data.

An event job is unique by business/source/document/trigger/channel, even when an event
replay supplies another operation ID. Deterministic IDs and SQLite uniqueness protect
against duplicate inserts. A manual command has a new durable user command ID;
transport retries reuse it, and changed template/copies/binding/lineage are rejected
as command conflicts. Explicit reprints link to the original job and use a new
command ID. They are allowed after accepted/failed/unknown; the user must review the
possibility of duplicate external delivery. There is no universal source-only
uniqueness constraint blocking manual reprints. Business identity scopes every key.

Initial state is queued for automatic rules, awaiting-confirmation otherwise.
Confirmation can move to queued; a future authoritative adapter may claim queued to
sending with a conditional update. Sending can finish accepted, failed or unknown.
Those are terminal. Unknown must never be silently requeued, including after crash
recovery; later recovery records uncertainty rather than blindly resending.
`accepted` means adapter acceptance only, never proof that paper physically printed
or that an email/WhatsApp recipient read anything. Jobs and snapshots cannot be
rewritten or deleted. P0 has no scheduler/retry loop.

Document work must be queued after the sale's successful independent transaction.
A document/output error must never roll back the sale. Future workflow integration
must reuse the existing durable event/outbox and ACK ownership; these job tables
are local output evidence, not a second business/publication outbox. If output cannot
be queued immediately, reconcile through that existing durable owner.

Every job is a `non_fiscal_copy`. Invoice copy is manual-only, and there is no issued
status, fiscal number, tax invoice issuance, signing or cancellation operation.
Digital PDF does not constitute a tax invoice. A later invoice service needs its own
immutable legal issuance semantics and optional INVOICING capability; it cannot
reuse print job state or automatically issue an invoice from a sale trigger.
Recipient selection, secure storage and validation are later adapter responsibilities;
recipient addresses, credentials, message bodies and batch lists must not enter logs.

## Next bounded phases

P1a checkpoint (bounded UI slice): one contextual Settings **Baskı Yönetimi** button
and search entry require initialized setup and the persisted runtime PRINTING
capability. The optional capability label is **Baskı ve Belge Paylaşımı**; draft
activation never opens the launcher. `PrintManagementWorkspace.tsx` is the single
full-canvas `WorkspaceFrame` owner. Its compact document list filters seven sample
kinds by persisted capabilities, including combined workflows without sector string
branches. A generous size-proportioned DOM preview and small informative right pane
share that one surface; narrow widths stack within its scroll owner. Native workspace
focus/close behavior is reused, and the Settings page leave guard includes this open
workspace. Capability revocation replaces content with the inactive state.

All preview identities, line items and amounts are representative NON-FISCAL SAMPLE
data. Selection changes only local UI state. There are no Save/Print/Send/Edit actions,
dropdown drafts, customer reads, template writes or delivery IPC. Print is a conceptual
unconnected channel; WhatsApp appears only with canonical service activation plus
its persisted capability, and explicitly requires user confirmation for Web delivery.
No authoritative SMTP configuration exists in this slice, so no email channel control
is shown. The surface never claims a provider is connected or a rule is saved.

The broader P1b roadmap (beyond the P1b-1 configuration checkpoint below) includes: typed secure read/write IPC with lock/capability
authorization, installation/device-local profile ownership, persisted rule/binding
reads and writes, and functional template editing with draft/close guards. Output
readiness must come from authoritative services. Image cleanup/perspective and sending
remain later work; no inert editing control should be introduced as a placeholder.

P2 supplies bounded rendering, field-value snapshots, secure recipient validation,
adapter readiness/autonomy checks, explicit confirmation and installation-aware
atomic claim/recovery. Print/email/WhatsApp stay modular providers. No renderer-only
PDF pipeline becomes the core. Reuse a barcode generator selectively later.

Replace the old `MarketLabelsWorkspace` and legacy label service completely once
the common engine and replacement flow work and pass their behavior checks. They
remain untouched during P0/P1a; preserving them permanently is not the target.

## Focused verification

`node scripts/smoke-document-output.mjs` compiles only the owned modules into a
temporary directory and uses disposable SQLite databases initialized from the
entire current schema. Registry check: `npm run verify:check -- document-output`.
Shared capability/profile/policy tests, shared TypeScript and scoped lint are the
other P0 checks. No pre-main/full/release suites or packaging are part of this slice.
This evidence does not prove a real printer, PDF, external provider or legal invoice.


P1a targeted evidence (2026-10-28):

- `npm run verify:check -- document-output`: 11/11 SQLite/domain tests passed,
  including new kinds, mirrored trigger whitelists, capability revocation and schema
  integrity. No production database was opened.
- Renderer/shared `tsc --noEmit` and scoped ESLint passed.
- `node scripts/smoke-print-management-ui.mjs --dom-only`: real React markup checks
  passed for inactive/missing snapshot/uninitialized/empty states, seven document
  capability filters, independent channel gates, no phantom actions and persisted
  Settings search visibility. This mode does not open a listener or browser.
- `node scripts/smoke-print-management-ui.mjs` is registered as
  `print-management-ui`, with no build prerequisites. It uses the existing real
  Settings fixture for unsaved-vs-persisted activation, launch/search/focus return and
  revocation, plus an independent React fixture for filtering, switching, single-modal
  bounds and narrow/light/dark/reduced-motion checks. Attempted locally; blocked by
  sandbox Vite `listen EPERM` before browser assertions. Coordinator must run
  `npm run verify:check -- print-management-ui` outside this sandbox. Browser layout,
  focus and interaction are therefore pending, not passed.
- `git diff --check` passed. No pre-main/full/release, packaging or deployment run.

P1a file scope (pre-existing changes in shared files were preserved):

- `apps/desktop-app/src/components/settings/PrintManagementWorkspace.tsx` (new)
- `apps/desktop-app/src/styles/pages/print-management.css` (new)
- `apps/desktop-app/src/styles/index.css` (CSS import)
- `apps/desktop-app/src/components/settings/SettingsWorkspace.tsx` (launcher/overlay/leave guard)
- `apps/desktop-app/src/app/settings-registry.ts` (persisted capability search entry)
- `apps/desktop-app/src/components/settings/BusinessCapabilitySettings.tsx` (human label)
- `packages/shared/types/document-output.ts` (three document kinds and triggers)
- `apps/desktop-app/db/schema.sql` (matching kind/trigger/capability checks only)
- `scripts/smoke-document-output.mjs` (extended-kind SQLite/domain test)
- `scripts/smoke-print-management-ui.mjs` (new browser/DOM modes)
- `scripts/fixtures/print-management.tsx` (new focused React fixture)
- `scripts/verification-registry.mjs` (UI smoke registration, no build prerequisites)
- `docs/architecture/PRINT_DOCUMENT_OUTPUT_V1.md` (this checkpoint)

Handoff state: current worktree remains `main`, HEAD `fca57c5a`; 232 dirty/untracked
paths at checkpoint, including other owners' work. No branch switch, reset, stash,
commit, push, live data mutation, legacy label replacement or out-of-scope edits.


## P1b-1 configuration checkpoint (2026-10-28)

Coordinator reported the P1a host UI smoke PASS before this slice. That prior
evidence does not cover the new P1b-1 interactions; their host rerun remains pending.

The existing one-surface Baskı Yönetimi now reads authoritative rules and stages
per-document, per-trigger print policies: Kapalı / Yazdırma onayı / Otomatik.
An absent row means OFF. A single event selector covers manual and the P0-compatible
domain events. The left list and sample canvas remain in the same WorkspaceFrame.
The right pane explicitly says **Yazıcı bağlantısı henüz yok. Ayarlar kaydedilir,
otomasyon çalışmaz.** Saving preferences never creates an output job, calls a
printer, generates PDF, dispatches messages or issues a fiscal invoice.

Ownership and files:

- `packages/shared/types/document-output-management.ts`: typed configuration-only
  bridge, independent of commerce; exported by shared and extended by DesktopBridge.
- `electron/document-output-management.ts`: local domain owner resolves the first
  active local business (same selection convention as setup), reads persisted
  PRINTING + document capabilities on every call, and writes using P0 validation
  inside BEGIN IMMEDIATE / COMMIT, with rollback on failure.
- `electron/ipc/document-output-ipc.ts`: `documentOutput:read` and
  `documentOutput:saveRule`; registered from `electron/main.ts` with its existing
  databasePath, assertUnlocked and trusted renderer URL predicate. Only trusted
  top-level native window frames with an unlocked local owner session are accepted.
  Preload invokes both through invokeWhenUnlocked; main rechecks independently.
- `src/components/settings/use-document-output-settings.ts` and
  `PrintManagementWorkspace.tsx`: authoritative snapshots, staged rules across
  document/event changes, functional dirty-only Save/Discard, inline failure/leave
  guard, and closeBlocked while dirty or saving. Existing Settings printOpen leave
  guard continues to prevent page navigation. Tenant changes cannot carry a staged
  preference into another business. Revocation/lock disables controls and late
  read responses cannot restore revoked controls.

Payloads accept exact allowlisted fields only. No renderer businessId, installation
path, SQL, template HTML, recipient, customer address or credential enters the
management contract. Invoice copy, SMTP/email, WhatsApp Business API and all sending
operations are rejected here. WhatsApp WebView has OFF/ASK only, requires persisted
C.WHATSAPP plus canonical activation and the existing persisted WebView mode; inactive
channel controls are absent. Canonical setup's whatsappEnabled is derived from that
persisted capability. No migrations, backup layer, pub/sub or public sync was added.
Runtime printer binding and template editing are outside P1b-1. Legacy
MarketLabelsWorkspace/label-printer are untouched.

Save applies one SQLite transaction per changed rule. If a later rule fails, earlier
successful rules remain saved and remaining drafts remain dirty, with an explicit
failure. There is no false all-saved notice on partial failure. The native owner
returns only a fixed safe error catalog; SQLite error text is not exposed.

Verification and host gate:

- `npm run verify:check -- document-output-management`: **8/8 PASS**, focused disposable real
  SQLite + actual IPC registration + actual preload methods, with fake Electron
  sender; owner/session/subframe/webview/untrusted/tenant/capability rejection,
  exact fields, mode/channel restrictions, valid independent document/event rules,
  rollback, no output jobs and no new sync jobs. The existing dev/file URL predicate
  is loaded directly for its tests. Zero build prerequisites.
- `npm run verify:check -- document-output`: **11/11 PASS**, P0 foundation.
- Direct shared, Electron and renderer `tsc --noEmit`, scoped ESLint, and
  `node scripts/smoke-print-management-ui.mjs --dom-only` cover static contracts and
  server-rendered markup. DOM-only does not prove interaction or browser layout.
- **Pending coordinator host test:** `npm run verify:check -- print-management-ui`.
  The existing browser fixture now mocks real bridge results for save/read/reopen,
  dirty-only controls, discard, document/event switching, save failure, lock,
  capability revocation, delayed stale reads and business switching, while retaining
  Settings launch/search/focus, dirty page-leave blocking, and narrow/light/dark checks. No Vite listener or
  browser was launched in the Codex sandbox for P1b-1.

Only the listed management/UI/bridge/test/doc files were edited for this slice;
pre-existing changes in shared/main/preload/registry were preserved. Current branch
and HEAD remain main / fca57c5a. No commit, push, deployment, packaging, broad suite,
real customer database mutation or actual output sending is part of this checkpoint.

P1b-1 edited paths (14 total, including existing P1a and concurrent-owned files):

- `packages/shared/types/document-output-management.ts`, `packages/shared/index.ts`
- `apps/desktop-app/electron/document-output-management.ts`
- `apps/desktop-app/electron/ipc/document-output-ipc.ts`
- `apps/desktop-app/electron/main.ts`, `apps/desktop-app/electron/preload.ts`
- `apps/desktop-app/src/components/settings/PrintManagementWorkspace.tsx`
- `apps/desktop-app/src/components/settings/use-document-output-settings.ts`
- `apps/desktop-app/src/styles/pages/print-management.css`
- `scripts/smoke-document-output-management.mjs`
- `scripts/smoke-print-management-ui.mjs`, `scripts/fixtures/print-management.tsx`
- `scripts/verification-registry.mjs`, `docs/architecture/PRINT_DOCUMENT_OUTPUT_V1.md`

Final local evidence: management 8/8, P0 11/11, all three direct TypeScript checks,
scoped ESLint, DOM-only smoke and git diff --check passed. Worktree remains main at
fca57c5a, with 237 dirty/untracked paths (232 pre-existing + 5 new P1b-1 paths).
Browser interaction is still pending the coordinator host command above.


## P1b-1 coordinator host confirmation

On 2026-10-28 the coordinator reran the final source outside the Codex sandbox:
`npm run verify:check -- print-management-ui` PASS (real Vite/Playwright browser,
including Settings leave guard, persisted rules, cancel, failures, lock, capability
revocation, stale reads and responsive layouts); `npm run verify:check --
document-output-management` 8/8 PASS; `npm run verify:check -- document-output`
11/11 PASS; `git diff --check` PASS. The sandbox Vite EPERM noted earlier is
resolved for these checks by running on the trusted host. No full/pre-main/release,
installer or production output operation was executed.

## P1b-2 revisioned template editing checkpoint (2026-10-28)

The existing single Baskı Yönetimi WorkspaceFrame now owns functional **Düzenle** /
**Önizlemeye dön** actions in its center pane. The inline editor lists fields with
human labels, supports changing whitelisted bindings, adding/removing fields,
pointer dragging, native 0.1mm X/Y/width/height inputs and 1mm move buttons. Geometry
is rounded into safe integer mm10 and constrained to the page. Paper proportions
and pointer coordinates use page dimensions and current bounding rectangles,
including responsive/zoom changes. Initial layouts cover each available document
kind; the explicit initial-layout action stages the first template. Existing page
size, repeatable lineBlock and scan references survive field changes and preset
resets. Line-block editing, scan rendering/processing and page-size editing are not
implemented; the UI explicitly describes the unsupported preserved portions.
Preview uses staged or saved layouts with sample placeholders only, falling back
to the previous sample document when no layout exists. This is no print rendering,
barcode generation, historical customer-data snapshot or physical output evidence.

`documentOutput:readTemplate` and `documentOutput:saveTemplate` reuse the existing
trusted top-level window / unlocked local owner gate and preload unlock preflight.
The domain owner derives local business identity and persisted PRINTING + kind
capabilities on every call; invoice_copy is rejected. Payloads have exact keys and
accept neither tenant identity nor paths. The fixed template identity is
`default:<documentKind>`, scoped by local business. Reads check revision, kind,
32KiB UTF-8 size, parsed JSON and the shared layout validator. Saves validate the
same bounds, then compare expectedRevision (null for absence) inside BEGIN
IMMEDIATE and append revision 1 or latest+1 through the P0 writer. A stale or racing
writer receives DOCUMENT_TEMPLATE_CONFLICT; existing revisions remain immutable.
Database failures return the fixed safe IPC catalog, without SQL details.
No schema changes, migrations, production DB writes, new output jobs or sync path.

The separate `use-document-template-settings.ts` hook loads available kinds and
stages drafts per kind. Changing document preserves drafts. Original expected
revisions remain attached to staged layouts across authority refreshes, including
null for an absent initial revision. Business changes block saving retained drafts;
revocation, stale responses and locked snapshots cannot restore edit authority.
Only dirty state exposes **Şablonları kaydet / Şablonlardan vazgeç** and **Kuralları
kaydet / Kurallardan vazgeç**. Each action affects its own drafts. Either draft or
save blocks the same workspace close owner; the existing Settings printOpen page
leave guard remains authoritative. Multi-kind saves are separate transactions:
earlier successes remain saved, and a failed remainder stays dirty with its error.

Changed paths for this slice (12; pre-existing edits preserved):

- `packages/shared/types/document-output-management.ts`
- `apps/desktop-app/electron/document-output-management.ts`
- `apps/desktop-app/electron/ipc/document-output-ipc.ts`
- `apps/desktop-app/electron/preload.ts` (two template bridge methods only)
- `apps/desktop-app/src/components/settings/PrintManagementWorkspace.tsx`
- `apps/desktop-app/src/components/settings/DocumentTemplateCanvas.tsx` (new)
- `apps/desktop-app/src/components/settings/use-document-template-settings.ts` (new)
- `apps/desktop-app/src/styles/pages/print-management.css`
- `scripts/smoke-document-output-management.mjs`
- `scripts/smoke-print-management-ui.mjs`
- `scripts/fixtures/print-management.tsx`
- `docs/architecture/PRINT_DOCUMENT_OUTPUT_V1.md`

Targeted local evidence:

- `node scripts/smoke-document-output-management.mjs`: **14/14 PASS** (the original
  management 8 plus 6 template tests). Disposable real SQLite, actual registered
  IPC and preload cover first creation/reopen, append-only history, stale revision,
  separate-process races for both absent and existing templates, exact payloads,
  invalid geometry/bindings/size, tenant isolation, owner/trust/lock/TOCTOU,
  persisted revocation, corrupted stored JSON/kind, safe rollback errors, preserved
  lineBlock/scan, and zero output jobs. No customer database was opened.
- `node scripts/smoke-document-output.mjs`: **11/11 PASS**, unchanged P0 suite.
- Shared, Electron and renderer direct `tsc --noEmit`: PASS; scoped ESLint: PASS.
- `node scripts/smoke-print-management-ui.mjs --dom-only`: PASS for existing
  capability/search states plus seven validated presets, integer geometry markup,
  disabled readonly controls, human labels and preserved line/scan references.
  This mode performs SSR markup assertions; it does not prove browser interaction.
- `git diff --check`: PASS.

**Remaining host gate:** coordinator runs `npm run verify:check --
print-management-ui` outside the sandbox. The extended real React browser fixture
now checks template save/reopen, numeric coordinates, drag, add/remove, simultaneous
rule/template drafts, document switching, dirty close/Settings leave blocking,
failed save retention, lock, revocation, business switching, single-modal bounds
and responsive editing. These new browser assertions have not been executed here;
P1b-1 host PASS does not establish P1b-2 interaction/layout correctness.
No manual user test was requested. Printing, printer discovery/bindings, sending,
image uploads/AI and legal invoice service remain later slices. Legacy
MarketLabelsWorkspace and label-printer, admin/effects/Android/web paths were not
edited. Worktree remains main / fca57c5a with shared dirty/untracked work retained;
239 paths were dirty/untracked at this checkpoint (237 initial + 2 new files).
No commit/push/deploy/packages or full/pre-main/release suite was run.

## P1b-3 device printer binding checkpoint (2026-10-28)

This bounded slice adds native system printer discovery and one saved printer per
business + installation + document, within the existing Baskı Yönetimi overlay.
The coordinator reports P1b-2 host UI PASS (including its narrow numeric-coordinate
fallback); that prior result does not establish P1b-3 browser behavior.

`documentOutput:getPrinters`, `documentOutput:readPrinterBinding` and
`documentOutput:savePrinterBinding` use the existing trusted top-level window,
unlocked local owner and persisted PRINTING/document capability gates. Discovery
calls **only the trusted event.sender.getPrintersAsync()** in Electron main.
Every save re-enumerates; printerRef must exactly match a currently available native
name, or be null to clear. Native names must be nonblank, free of control characters,
and at most 256 UTF-8 bytes and 256 JS characters. Invalid names are omitted,
duplicates collapse, and only name/displayName/isDefault are returned. Native
options, descriptions, addresses and credentials never enter the bridge or logs.
Explicit Windows OFFLINE status or CUPS offline-report reasons exclude a printer
from selectable results. Missing/offline saved bindings stay stored and appear as
a disabled missing option; no default selection, reassignment or output occurs.
System enumeration cannot establish physical connectivity or distinguish every
virtual driver. See the [Electron PrinterInfo contract](https://www.electronjs.org/docs/latest/api/structures/printer-info)
and [Windows status contract](https://learn.microsoft.com/en-us/windows/win32/printdocs/printer-info-2).
No physical device/driver status was verified in this sandbox.

`document-printer-installation.ts` exclusively creates a random UUID file named
`document-printer-installation-id` under Electron app.getPath("userData"), with wx
and mode 0600, then reads and validates that same file. An existing malformed file
fails closed; it is never overwritten or silently replaced. The ID comes through
a main composition closure, never from renderer input, and is not sent to a site
or stored as a business-wide identity. No migrations, backup changes or schema
changes were made. Bindings use id=documentKind; all reads/deletes/inserts scope
business_id + installation_id + id. Replacement is delete/insert in BEGIN IMMEDIATE
(the P0 immutable-update trigger remains intact). Native discovery awaits recheck
sender/lock/capability and the original tenant before binding access; a tenant
change during discovery is rejected. SQLite errors remain in the fixed safe error
catalog. No output job or sync mutation is created.

`use-document-printer-settings.ts` loads native lists and bindings asynchronously,
preserves per-document drafts through selection changes, rejects stale responses
and blocks cross-business draft saving. Refresh really reloads native discovery.
A missing binding may be cleared even when the native list is empty. An unbound
empty system displays **Sistem yazıcısı bulunamadı**, with no synthetic printer
option. The one right-pane native select is independent of rules and templates.
Printer and rule drafts share the existing footer action group, with explicit
labels; template actions retain their separate meaning. Each hook saves only its
own drafts and reports its own success/failure; multi-document and combined saves
are not one atomic operation. Earlier successful saves persist, failures retain
the remaining drafts. Either draft/saving state guards the same workspace close;
discard remains available after revocation. No nested surface was introduced.

Changed paths for P1b-3 (12; earlier dirty work preserved):

- `packages/shared/types/document-output-management.ts`
- `apps/desktop-app/electron/document-printer-installation.ts` (new)
- `apps/desktop-app/electron/document-output-management.ts`
- `apps/desktop-app/electron/ipc/document-output-ipc.ts`
- `apps/desktop-app/electron/main.ts`, `apps/desktop-app/electron/preload.ts`
- `apps/desktop-app/src/components/settings/use-document-printer-settings.ts` (new)
- `apps/desktop-app/src/components/settings/PrintManagementWorkspace.tsx`
- `scripts/smoke-document-output-management.mjs`
- `scripts/fixtures/print-management.tsx`, `scripts/smoke-print-management-ui.mjs`
- `docs/architecture/PRINT_DOCUMENT_OUTPUT_V1.md`

Targeted local results:

- Management: **22/22 PASS**, original 14 plus 8 printer tests, using disposable real
  SQLite, actual registered IPC/preload and mocked trusted getPrintersAsync. Covers
  native sanitization/duplicates/UTF-8 limits, UUID persistence and userData isolation,
  per-device/per-business/per-document isolation, clear/reopen/replacement, exact
  fields, invalid names, missing/offline retention, untrusted sender, unlock
  preflight/TOCTOU, persisted revocation, delayed tenant changes, rollback and zero
  output/sync jobs. This proves native API wiring with mocks, not hardware behavior.
- P0: **11/11 PASS**.
- Shared, Electron and renderer direct `tsc --noEmit`: PASS. Scoped ESLint: PASS.
- `node scripts/smoke-print-management-ui.mjs --dom-only`: PASS. SSR checks cover
  the loading state and absence of fabricated selection plus existing capability,
  template and search contracts; this is not browser interaction evidence.
- `git diff --check`: PASS.

**Pending host gate:** coordinator runs `npm run verify:check -- print-management-ui`.
The real React mock-bridge browser fixture now includes device binding selection,
reopen, switching documents, failed-save draft retention, dirty close, empty system,
missing disabled binding, clear, refresh, revocation, cross-business draft blocking
and delayed revoked reads. Those new interaction assertions were not run here;
Vite listener EPERM remains the stated sandbox constraint. Actual printing, PDF,
email/WhatsApp delivery and output jobs remain outside this checkpoint.

Worktree remains `main` / `fca57c5a`, with 242 dirty/untracked paths at this checkpoint.
Admin/effects/Android/web/market-refund/legacy-label work was not edited. No
stash/reset/branch switch/commit/push/deploy/packages or pre-main/full/release suite
was run. No production database was opened.


## P2a local blank-form original checkpoint (2026-10-28)

The existing central template editor now exposes **Boş form görseli seç** only in
edit mode and **Görseli kaldır** when a scan exists. A chosen blank JPG/PNG is shown
beneath the existing draggable mm fields in that same paper; no nested overlay or
new page is created. The product sequence is photo preparation before field
placement. P2a provides intake/preview only: no crop, rotate, four-corner perspective,
cleanup or AI. P2b will own the manual preparation step and a separate immutable
`processedImageRef`; it must never overwrite the original.

Selection stages `scan = { originalImageRef, processedImageRef: null,
foreground: false }` in the existing template hook. Choosing again replaces only
the draft reference. Removing clears that draft scan. Existing template Save appends
a revision; Discard restores the previous saved reference. Both use the existing
dirty close guard. Native chooser activity also blocks closing/saving; responses
after business/capability changes or unmount cannot stage a late selection. Cancel
returns null without creating an asset, template revision or output job. Discard
intentionally leaves immutable local originals in place; no cleanup sweep is added.

`document-form-images.ts` owns local original assets, with native dependencies at
the IPC boundary. `documentOutput:pickFormImage` and `documentOutput:readFormImage`
reuse the trusted top-level native-window, unlocked local owner gate and read
persisted PRINTING/document capabilities. The local business is derived internally;
renderer payloads accept only document kind (and opaque imageRef on reads), never
businessId or paths. `dialog.showOpenDialog` is parented to the trusted sender's
BrowserWindow and offers one JPG/PNG. After its asynchronous return, sender, lock,
persisted capabilities and original tenant are rechecked before reading/writing.

Sources are bounded to 12 MiB, checked by real PNG/JPEG signatures and encoded
dimensions before native decoding, and limited to 25 million decoded pixels.
Electron nativeImage decoding and PNG re-encoding sanitize the visual original;
SVG is rejected. Sanitized output is separately bounded to 12 MiB. The store uses
`userData/doc-form-images/<sha256(businessId)>/<documentKind>/<uuid>.png`, exclusive
`wx` writes and mode 0600. IDs are generated in main and originals are never
replaced. Reads validate UUIDs, scoped business + kind folders, regular files,
size/signature/dimensions and refuse final-component symlinks. The bridge returns
only an opaque reference and bounded PNG base64 data URL, without filesystem paths.
Unsaved originals are readable in their authorized scope; no template association
or schema change is needed for that read. No website/public sync or output job is
created. Formal invoice issuance and printing/sending remain unimplemented.

Changed files in this slice (13; pre-existing changes retained):

- `packages/shared/types/document-output-management.ts`
- `apps/desktop-app/electron/document-form-images.ts` (new)
- `apps/desktop-app/electron/document-output-management.ts`
- `apps/desktop-app/electron/ipc/document-output-ipc.ts`
- `apps/desktop-app/electron/preload.ts`
- `apps/desktop-app/src/components/settings/DocumentTemplateCanvas.tsx`
- `apps/desktop-app/src/components/settings/PrintManagementWorkspace.tsx`
- `apps/desktop-app/src/components/settings/use-document-template-settings.ts`
- `apps/desktop-app/src/styles/pages/print-management.css`
- `scripts/smoke-document-output-management.mjs`
- `scripts/fixtures/print-management.tsx`, `scripts/smoke-print-management-ui.mjs`
- `docs/architecture/PRINT_DOCUMENT_OUTPUT_V1.md`

Targeted checkpoint evidence:

- Management **27/27 PASS**: previous 22 plus five image tests. Actual IPC/preload,
  disposable real SQLite, valid small PNG bytes and injected decoder/chooser cover
  cancel, immutable IDs/content, explicit save only, no jobs/sync writes, exact
  payloads, source/output bounds, malformed/signature/dimension failures, tenant
  and document isolation before save, owner/frame/lock/capability gates and delayed
  chooser rechecks. Fake Electron also exercises the production default
  showOpenDialog/nativeImage/userData wiring and parent/filter options. This does
  not prove the native decoder or OS chooser on a physical host.
- P0 **11/11 PASS**. Shared, Electron and renderer direct `tsc --noEmit`: PASS.
  Scoped ESLint and existing DOM-only print smoke: PASS. DOM assertions do not
  exercise image loading or user interaction.
- `git diff --check`: PASS. Worktree remains `main` / `fca57c5a`, with the existing
  242+ unrelated dirty/untracked paths retained. Admin/effects/Android/web and
  legacy label paths were not edited by this slice. No production DB, migration,
  backup, commit/push/deploy/package or broad suite was used.

**Remaining coordinator host gate:** `npm run verify:check -- print-management-ui`.
The extended fake-picker/reader React browser fixture checks edit-only selection,
cancel without draft, actual PNG loading, draft dirty close, single modal,
save/reopen, replacement/discard and remove/discard of scan references. These new
browser assertions have not been run in the sandbox; the coordinator runs Vite and
Playwright on the remote host because of the known sandbox listener EPERM.
Perspective correction and image cleanup are not completed in P2a.

## P2b-1 manual preparation core checkpoint (2026-10-28)

Preparation is **not user-visible yet**. P2a's browser host smoke was reported PASS
by the coordinator for this task; the older pending P2a note above describes that
prior checkpoint. This slice adds no preparation controls or renderer image codec.

`src/app/form-image-perspective.ts` is a pure, offline TypeScript RGBA processor,
without Electron, DOM, AI or persistence dependencies. `prepareFormImage(source,
spec)` requires four normalized source pixel-centre corners in screen-clockwise
TL/TR/BR/BL order and the existing layout's `pageWidth`/`pageHeight` in mm10. It
rejects nonfinite/out-of-range points, reversed/misordered, crossed, concave,
collapsed and near-singular quads before allocating output. A rectangle-to-quad
homography inverse-samples the source with bilinear interpolation, genuinely
rectifying trapezoids. Source RGBA remains unchanged. Transparent taps composite
on white; returned RGBA is opaque. Inputs are bounded to 25 MP with exact byte
length and at least two pixels per axis. Output is bounded to 2200 pixels per side
and 4,000,000 pixels, retaining the final template page ratio within integer pixel
rounding. Optional clockwise 0/90/180/270 rotation follows rectification, followed
by bounded brightness/contrast and optional grayscale/luminance threshold. The
output is pixels, not an encoded PNG; Canvas decode/encode belongs to P2b-2.

`documentOutput:saveProcessedFormImage` has a typed preload method accepting only
`{documentKind, originalImageRef, pngBase64}` and returns `{imageRef, dataUrl}` in
the existing result envelope. It shares the trusted top-level owner/unlock and
persisted PRINTING/document gates. Main derives the business and verifies the
original is readable in that business + document-kind scope before accepting any
output. Base64 is canonical and bounded before decoding (12 MiB decoded maximum),
PNG signature/encoded dimensions are checked before native decode (25 MP maximum),
and nativeImage re-decodes/re-encodes the PNG through the existing sanitizer.
Normalized output receives another size/dimension check. Each call, including a
retry, writes a fresh UUID using exclusive `wx` in the same scoped asset folder;
no original or prior derivative is replaced/deleted. Arbitrary paths, foreign
scope IDs and extra fields are rejected. No schema, template, job or sync write
occurs. Only the existing explicit template revision save can persist
`scan.processedImageRef`; `scan.originalImageRef` remains the original reference.

Pending P2b-2 work is explicit: integrate image decoding and opaque PNG encoding,
manual corner/rotation/cleanup controls and preview into the existing editor;
retain preparation as draft state; **Apply** saves a new processed asset and stages
its reference; **Save Template** alone appends the template revision. Preserve the
original, discard/dirty close, capability/tenant changes and late-response guards.
Then extend/run the host browser test through decode -> real pixel rectification
-> Apply -> Save Template -> reopen, including discard/retry/original retention.
The production native codec/IPC roundtrip for processed PNGs also remains a host
gate; the management tests use mock Electron with real disposable SQLite. No
browser preparation test or physical-host codec proof is claimed in P2b-1.

Targeted P2b-1 tests: pure processor 7/7 (identity, analytic trapezoid interior grid,
asymmetric corners, all rotations, page ratio, cleanup/white compositing, invalid
geometry and independent side/area limits); management 30/30 (27 prior + three
processed tests for immutable retries, normalization/bounds, strict input,
scoped ownership, sender/lock/capabilities, explicit template save and no jobs).
P0 remains 11/11. The processor check is registered as
`node scripts/verify.mjs --check form-image-perspective` without build prerequisites.

Shared, Electron and renderer `tsc --noEmit`, focused ESLint and
`git diff --check`: PASS. Worktree remains `main` at `fca57c5a`; unrelated dirty
changes are retained. No broad suite, production database, commit, push, deploy or
package operation was used.

Files touched in P2b-1: `src/app/form-image-perspective.ts` (new),
`electron/document-form-images.ts`, `electron/ipc/document-output-ipc.ts`,
`electron/preload.ts` (all under `apps/desktop-app`),
`packages/shared/types/document-output-management.ts`,
`scripts/smoke-form-image-perspective.mjs` (new),
`scripts/smoke-document-output-management.mjs`, `scripts/verification-registry.mjs`,
`scripts/fixtures/print-management.tsx` (bridge type stub only), and this document.

## P2b-2 manual preparation UI checkpoint (2026-10-28)

The existing Baskı Yönetimi central editor now exposes **Görseli hazırla** after a
blank form is selected. It replaces the central placement content with manual
preparation in the same workspace: no modal, tab, popup or route is added.
The original photo has four normalized TL/TR/BR/BL handles and a polygon overlay.
Pointer dragging uses the displayed image rectangle, including responsive sizing
and zoom. A corner select, X/Y percentage inputs and arrow keys on handles provide
keyboard alternatives. Clicking the photo positions the selected corner.
Controls provide clockwise 90-degree rotation, brightness, contrast, grayscale
and optional black/white threshold. **Yerleşime dön** abandons preparation controls
without changing the template. Preparation controls themselves are transient;
returning or switching documents resets them. Applied image refs remain in the
existing per-document template draft.

**Önizle** explicitly decodes the original and runs the pure P2b-1 processor in a
local module Worker, then shows the resulting PNG in the same central area. Drags
and sliders only change controls and clear any obsolete preview; they never run
the processor. The source must be a bounded local PNG data URL. Canvas scales to
at most 2200 pixels per axis and 4 MP **before getImageData**; extremely thin images
that cannot retain two pixels per axis fail with a reselection action. The core
still validates every transform. Encoding uses putImageData/toBlob(PNG) and a
12 MiB bound before base64 transport. Duplicate processing is disabled, work has a
30-second timeout, and unmount terminates an active worker. There is no network,
AI, metadata lookup or new image-persistence route.

**Uygula** uses the same decode/worker/encode path and the existing secure
saveProcessedFormImage bridge, with the immutable original ref. Only successful
asset saving stages scan.processedImageRef and returns to placement. It leaves
originalImageRef intact and forces foreground=false. Errors retain preparation
controls, original and prior draft, with concise retry/reselection feedback.
The existing template hook owns pending Apply work, so saving, discarding,
document switching and workspace closing are blocked during it. Mounted/authority
generation guards reject late results after capability, lock or tenant changes,
including authority changing away and back before completion. Discard remains
available after the operation settles. A cancelled or discarded derivative may
remain an unused local asset; no cleanup was introduced.

Placement displays processedImageRef when present and otherwise originalImageRef,
including after an explicit template save and workspace reopen. The image stays
behind fields and serves only as an alignment reference. **Orijinali göster**
stages a null processed ref; template Discard restores the persisted processed
ref. Only the existing **Şablonları kaydet** appends a template revision. Apply and
Preview never save templates, create jobs or print a scan automatically.

Changed paths in this slice (9; existing dirty work preserved):

- apps/desktop-app/src/app/form-image-preparation.worker.ts (new)
- apps/desktop-app/src/components/settings/FormImagePreparation.tsx (new)
- apps/desktop-app/src/components/settings/DocumentTemplateCanvas.tsx
- apps/desktop-app/src/components/settings/use-document-template-settings.ts
- apps/desktop-app/src/components/settings/PrintManagementWorkspace.tsx
- apps/desktop-app/src/styles/pages/print-management.css
- scripts/fixtures/print-management.tsx
- scripts/smoke-print-management-ui.mjs
- docs/architecture/PRINT_DOCUMENT_OUTPUT_V1.md

Targeted local verification: processor **7/7**, management **30/30**, P0 **11/11**;
shared/Electron/renderer direct tsc --noEmit and scoped ESLint PASS. DOM-only smoke
covers existing behavior plus preparation control/readonly markup and original
reset availability; it does not execute a browser worker, codec or interaction.
git diff --check and explicit whitespace checks of all nine slice files,
including untracked files: PASS.

**Remaining coordinator host gate:** `npm run verify:check -- print-management-ui`
on the authorized host. The real Playwright fixture now uses a generated,
asymmetric four-colour PNG and mocks scoped processed-image saving/reading. It
adds numeric/drag/keyboard corners, real worker Preview without asset creation,
90-degree PNG pixel orientation/opacity and bounds, failed asset save/retry,
Apply without automatic template save, processed-ref inequality, original
retention, Discard, explicit Save/reopen, foreground=false, original reset/undo,
invalid geometry, grayscale/threshold pixels, delayed lock/relock and tenant
responses, one-modal bounds and 390px/125% numeric/footer behavior. These added
browser assertions have **not** run in this sandbox; the known Vite listen EPERM
constraint leaves interaction, narrow layout and worker/browser-codec proof to
the coordinator. Production Electron native codec/secure IPC roundtrip remains a
separate physical-host gate; management tests use mock native codecs with real
disposable SQLite. UI implementation is present, but P2b-2 host acceptance is pending.

Worktree remains main / fca57c5a with unrelated dirty/untracked work retained.
Admin/effects/Android/web and legacy labels were not edited. No production data,
commit/push/deploy/package, broad suite, AI, automated scan detection, physical
printing or emailing was used or implemented in this slice.


## P2b-2 coordinator host acceptance (2026-10-28)

Final real-browser `npm run verify:check -- print-management-ui`: **PASS**
(Vite/Playwright on the authorized desktop; source after P2b-2 fixes).
Coverage includes four-corner pointer and numeric editing, keyboard fallback,
real browser Worker homography and PNG encode/decode, 90-degree orientation,
near-binary grayscale/threshold (allowing only a one-level browser PNG
quantization), manual preview without asset creation, failed processed image
save/retry, explicit Apply vs template revision Save, original/processed
reference preservation, Discard, reopened preview, 390px/125% zoom, and
late locked/tenant authority rejection. The test does not invoke the native
operating-system file picker or a physical printer; both remain separate
integration gates.

Additional focused host gates: `form-image-perspective` **7/7 PASS**,
`document-output-management` **30/30 PASS**, `document-output` **11/11 PASS**,
`settings-ui-correctness` **3/3 PASS** (includes its targeted renderer builds),
renderer TypeScript **PASS**, scoped modal/test ESLint **PASS** and
`git diff --check` **PASS**. No pre-main/full/release suite, installer,
commit/push/deploy or production data mutation was performed.

A shared ModalSurface issue was caught during late-lock/tenant browser tests:
Escape could dismiss a dirty workspace even while its close button was
disabled. Added a capture-phase Escape guard when `closeBlocked` is true,
in addition to the native cancel guard. Both the print browser suite and
existing Settings UI correctness regression passed with this fix.

Next isolated milestones: manual real-printer/PDF output engine with explicit
confirmation and no duplicate automatic retries; then optional AI-assisted
blank-form cleanup and independently gated document sharing. Fatura fiscal
issuance remains a separate domain.

## P2c-1 render snapshot core

`electron/document-output-render-snapshot.ts` prepares a detached, deterministic
non-fiscal snapshot from the existing validated layout and explicitly supplied
whitelisted strings. Missing/null values are empty; rows cannot exceed the template
limit. Individual values are bounded to 4 KiB UTF-8, templates to 32 KiB and the
result to 256 KiB. Geometry is resolved in mm10. Text is literal, not HTML: a
future output consumer must escape for its actual context and visibly render the
mandatory non-fiscal notice independently of the template. Scan references remain
opaque references, not frozen image bytes. No job or database is modified here.

P2c-2 must decide authorized acquisition and durable atomic storage of snapshot
and scan assets with job identity, safely consume literal text and the notice,
and integrate explicit-confirmation PDF/printing without duplicate retries. This
core alone does not deliver a document or issue a fiscal invoice.

## P2c-2 durable render payload

`document-output-snapshot-store.ts` is an internal trusted-owner API, not an IPC
endpoint. Its caller must derive business and installation from the unlocked local
session and supply authoritative operation-time values; this slice does not bind
events or acquire source data. It scopes an existing non-fiscal job and persisted
capabilities before capture/read, uses the job's frozen layout and the P2c-1
validator, and inserts the bounded payload in BEGIN IMMEDIATE. A repeat is accepted
only when the generated payload is byte-identical; conflicting retries fail. Reads
rebuild and validate the canonical payload against the job layout. A missing payload
on a P0 job returns null. SQL rejects orphan, wrong-installation, update, delete and
replacement records. There is no migration or backfill; this schema is for new
installations. Capture is separate from job creation: the future trusted workflow
must invoke it at the operation boundary, not reconstruct late from mutable data.

## P2c-3 local snapshot image bytes

The internal snapshot owner captures original and optional processed roles from
`DocumentFormImages.readBytes` using only the snapshot's scoped opaque references.
Each role is a bounded (12 MiB) SQLite BLOB with SHA-256; reads require the exact
role/reference set, validate PNG signature/IHDR and pixel bounds, and recompute the
hash. This is the existing image owner's encoded-header validation, not a full PNG
codec/CRC validation or protection against a database attacker changing both hash
and bytes. The trusted caller must construct the local owner and derive scope; no
renderer path or IPC is accepted. No-scan snapshots have an empty image set.

Image insertion for both roles is one BEGIN IMMEDIATE transaction after the P2c-2
snapshot already exists. Failure rolls back all image rows; crashes between the two
separate snapshot and image transactions leave an incomplete job that image reads
reject. The filesystem read and SQLite commit are not a joint transaction; capture
freezes the bytes actually read, not necessarily the earlier template-save bytes.
Later source modifications cannot alter stored bytes; repeat capture compares the
current source and conflicts if different. SQLite triggers prevent ordinary row
update, delete and replacement. New-install schema only; no migration, sync, backup,
source acquisition workflow, rendering or physical output is added. Future output
must require successful image-set reads rather than treating P2c-2 alone as ready.

P2c-4 should connect authoritative operation-time acquisition to the trusted
snapshot and image capture owners, then introduce deterministic, safe non-fiscal
PDF rendering with a mandatory visible notice. Real native printing, explicit
confirmation and no-duplicate dispatch remain separate integration gates.
No fiscal invoice issuance, email or WhatsApp delivery is implemented here.


## P2c-4a actual PDF rendering and Linux virtual-printer acceptance (2026-10-28)

Added `electron/document-output-html.ts` (literal field escaping, mm10 page
geometry, text line breaks, frozen image selection/foreground and non-fiscal
notice) and `electron/document-output-pdf.ts` (scoped owner reads, native PNG
decoding guard and an isolated hidden Electron BrowserWindow using printToPDF).
No IPC, auto-dispatch, physical printer job, fiscal issuance, source acquisition
or share adapter was added. The future trusted owner must derive the job scope.

Focused `scripts/smoke-document-output.mjs` **17/17 PASS**. New
`scripts/smoke-document-output-pdf.mjs` actually launched Electron, generated
PDF bytes, checked Turkish text, multiline rows, literal HTML-looking input,
mandatory notice, scanned PNG, wrong-installation rejection and the 80 x 200 mm
page; **PASS**. Electron TypeScript and scoped ESLint **PASS**; git diff --check
**PASS**. No full/pre-main/release/packaging/commit/push/deploy.

Coordinator manually produced `/tmp/yardimci-p2c4a-rendered.pdf` on Linux.
`pdfinfo` confirmed **1 page, 80 x 200 mm** and `pdftotext` confirmed
readable Turkish fields and legal notice. CUPS printer
`Yardimci_Test_PDF` accepted and completed jobs #2 and #3; PDF output
appeared under `~/PDF/`. **CUPS-PDF driver converted both output jobs to A4**
(including one submitted with `media=Custom.80x200mm`), and re-encoded text
as Type 3 glyphs with unreliable PDF text extraction. These are driver-stage
limitations; do not treat the virtual printer's output as proof of 80 mm
physical-paper layout. Check the source Electron PDF separately for dimensions
and text. Physical printer behavior remains untested.

Next bounded tasks: authoritative operation-time source acquisition into
P2c-2/3 frozen captures; user-confirmed PDF/export/native printing with
correct paper selection and no silent duplicate dispatch or unsafe retries.
Fiscal issuance and channel adapters remain separate.


## P2c-4b manual print claim and native adapter (2026-10-28)

The internal document-output-print-claim owner claims a previously frozen,
explicitly user-confirmed manual print job once via scoped SQLite transitions:
awaiting-confirmation -> queued -> sending. It requires existing render data,
complete frozen images, current persisted business capabilities and an existing
per-installation printer binding matching a currently discovered system printer.
It rejects wrong business/installation/job, missing capture and stale access.
Only a separate new manual command may represent an intentional reprint.

The native Electron host document-output-native-print adapter prepares the
validated document through the existing secure isolated page renderer, requests
explicit user confirmation through a trusted callback and discovers the printer
from Electron's system list. Only after these gates does it claim and call
webContents.print. Callback success means accepted by the print subsystem, not
paper delivered. Failed and unknown results are terminal; timeout/destroy/uncertain
transport never silently retries. Repeating the same job never submits again.
No UI/IPC trigger and no sales-event acquisition is attached at this point:
these are trusted internal APIs awaiting an authorized operation-time workflow.

Targeted document-output smoke **20/20 PASS**, Electron TypeScript **PASS**,
scoped ESLint **PASS**, and git diff --check **PASS**. The coordinator also
observed actual Electron native-print delivery to the ONLY authorized Linux
virtual printer Yardimci_Test_PDF as completed CUPS job #4, with its PDF under
~/PDF/Belge___R.pdf; repeat did not produce job #5. This CUPS-PDF output is A4,
not proof of 80x200mm physical ticket layout; the separate source Electron PDF
was checked at 80x200mm in P2c-4a. Real paper/mechanical/device-specific
testing, user-facing UI confirmation integration and actual sale/other-domain
source capture remain outstanding. No full/release suites, installers, git
commit/push/deploy or unrelated parallel feature files were touched.

## P2c-5a ready-job connection

The existing workspace lists only scoped manual jobs with validated frozen render
and complete image sets. The sample canvas remains a design sample and is never
passed to printing. Main derives business and installation, checks the selected
kind and owner/session on each operation, and uses a parented native confirmation
with cancel as default. Only the existing native adapter can claim and spool;
acceptance means OS queue acceptance, not physical delivery. Cancel creates no
claim. Terminal and already-attempted jobs are not retried.

Actual document preview is not connected in this slice. P2c-5b must acquire and
freeze authoritative operation-time sale data; until then no ready sale job is
invented. No fiscal issuance or automatic sale listener is introduced.


## P2c-5b1/2 canonical market-sale source and frozen manual job (2026-10-28)

The trusted main-process sale source owner reads a completed, non-deleted
commerce_sales record scoped by business and the historical
commerce_sale_items rows. It never reconstructs old names or prices from
mutable catalog_products. It validates payment status, close timestamp,
currency, monetary precision, line arithmetic and the sale subtotal after
discount, with bounded texts and at most 200 line items. No unknown customer
is invented. Its literal values use the existing non-fiscal field whitelist;
discount and barcodes are retained for validation but current layout bindings
do not display a separate discount field or per-row barcode.

The trusted sale-job owner requires persisted PRINTING/SALES capabilities,
the saved default:sale_receipt template/revision, manual ASK_CONFIRMATION
native_print rule and the matching local installation's sale_receipt printer
binding. It creates a single stable manual output job for a requested
completed sale, then captures the validated render snapshot and, if configured,
frozen original/processed form image bytes. A repeat with identical historical
data returns the same immutable job and never prints, while conflicting changes
or missing/invalid settings fail closed. The P2c-5a ready list can expose
only successfully frozen/complete manual jobs. There is no automatic sale
completion listener, checkout rollback or user-facing source selection yet.

The immutable job, render snapshot, and image rows have separately committed
SQLite transactions; a crash between them can leave an incomplete, hidden
job. Replays do not silently repair or requeue that job; an explicit
recovery policy is outstanding. The sale source is snapshotted when this
internal preparation API is called, not atomically with the sale transaction.
The merchant's name is sourced from the current business record at capture
time; finished output values do not change afterward.

Disposable SQLite smoke tests for sale source **3/3 PASS** and frozen sale
jobs/images **3/3 PASS**, including stale catalog edits, repeat safety,
scope rejection, failed configuration and incomplete capture. New tests
are registered in scripts/verification-registry.mjs and use platform-neutral
temporary directories. Electron typecheck and scoped lint PASS.
No renderer IPC/UI trigger, automatic printing, fiscal invoice issuance,
email/WhatsApp or release/deployment was added. Next bounded step:
authorization-gated user invocation after successful sale, plus real
document preview and explicit print; never treat the sample canvas
as a production receipt.


## P2c-5b3 user-invoked market sale receipt preparation (2026-10-28)

The desktop main process now exposes a narrow trusted
`documentOutput:prepareSaleReceipt({saleId})` IPC. It validates the
top-level owner renderer and unlocked session, derives business identity
from persisted print capabilities and installation identity from the host,
then calls the P2c-5b2 canonical sale-job capture with the local image
owner. It does not accept user-supplied document contents, tenant,
printer/path, checkout totals, or HTML. A setup failure returns a
non-fiscal, non-destructive message and never rolls back the sale.

Market Quick Sale shows an opt-in "Fişi hazırla" action only after a
confirmed completed sale with the PRINTING/SALES capability available.
The button calls preparation only when clicked, shows a short instruction
to find the resulting job under Baskı Yönetimi > Hazır Belgeler, and
does not start native printing. Pending result/authority changes and a
subsequent checkout hide stale receipt actions. The existing sample
template canvas remains explicitly non-production.

The actual IPC/SQLite management smoke **32/32 PASS**; the market sale
benefits UI smoke (including opt-in receipt, uncertain sale replay,
no automatic preparation, configuration failure, repeated requests and
tenant/capability change) **PASS** on an independent rerun. Electron and
renderer typecheck and targeted lint are verification gates.
No CUPS job was submitted by this work.

Remaining bounded work: add a real frozen-document preview and provide
a direct preview/confirmation route without conflating the sample canvas
with a sale receipt. Atomicity between sale transaction and capture,
partial frozen job recovery policy and physical-printer page-size checks
remain separate. No fiscal invoice/email/WhatsApp behavior is implied.


## P2c-5c1 real immutable document preview (2026-10-28)

Baski Yonetimi > Hazir Belgeler now exposes a separate 'Onizle' action
for each tenant/installation-scoped non-fiscal manual print job with fully
frozen render and scanned image evidence. This does not display or print
the representative template canvas. The trusted IPC accepts only document
kind and opaque job id, validates top-level unlocked owner, current
capabilities, installation, job state and immutable source integrity, and
never returns HTML, filesystem paths or image bytes to the renderer.

The preview host reuses the same escaped HTML/paper geometry and isolated
network-denied Electron browser as PDF and native printing. It opens a
read-only child window with JavaScript/node/devtools disabled; has no
automatic print/dispatch; closes on parent shutdown or authorization loss,
and limits lifetime to 5 minutes. Zoom and scrolling are screen-only
adjustments. Native 'Yazdir' remains a distinct explicit-confirmation action.

Targeted management IPC tests **32/32 PASS**; real Electron PDF+preview
smoke **PASS**, including native child visibility, sandbox flags, disabled
devtools and lock/parent-close teardown. Electron and renderer TypeScript,
scoped ESLint and git diff --check **PASS**. No CUPS job, release/build,
commit/push or unrelated parallel file change was requested here.

Remaining: optionally expose a direct preview and confirm-print route from
the most recent sale result; user can already use Baskı Yönetimi for the
manual ready-job workflow. Preview is not a fiscal invoice. Physical printer
paper layout and recovery for interrupted multi-transaction capture remain
separate verification gates.


## P2c-5c2 recent-sale inline preview and confirmed print (2026-10-28)

Market Quick Sale now keeps only the most recent successfully prepared
non-fiscal receipt job, scoped to the current completed sale and business
capability generation. The opt-in "Fişi hazırla" action does not
automatically render, print or dispatch. After successful preparation,
separate "Önizle" and "Yazdır" actions call only the existing trusted
previewReadyDocument and printReadyDocument IPC APIs using the frozen
sale_receipt job id. The preview opens the real read-only Electron window;
the print action still requires the native explicit confirmation dialog.
The market checkout, payment and benefit transaction logic is untouched.

Native refusal DOCUMENT_PRINT_CANCELLED preserves the ready job and allows
the user to decide later; it is distinct from an already-attempted
null result. Accepted means only OS spool acknowledgement. Failed,
unknown, already attempted and transport-ambiguous print results disable
another attempt for this job; no implicit retry exists. A different sale,
unverified/uncertain checkout, new cart or business/capability change
invalidates the prior quick-sale actions. The mandatory 'MALI BELGE
DEGILDIR' non-fiscal distinction appears in the UI and source document.

The focused market sale/benefits browser smoke **PASS**, covering
opt-in invocation, separate preview and print, explicit refusal,
single accepted print, duplicate suppression, capability/tenant switch,
benefit handling and stale results. Targeted renderer TS, scoped lint
and git diff --check are release-independent gates; no full/pre-main,
installer, deploy, commit, push or CUPS job is part of this slice.

Remaining gates: real printer hardware confirmation (Linux virtual printer
cannot certify actual printed paper dimensions), fiscal invoices remain
a separate regulated service, and interrupted source-to-snapshot
multi-transaction capture still requires its explicit recovery policy.


## 2026-10-28 live pilot receipt preparation bugfix

In a non-destructive read-only diagnosis of the live Linux pilot database,
the paid 22.00 TRY sale (one row, quantity two) and manual print rule,
local Yardimci_Test_PDF printer binding, and template revision 2 were all
valid, but the saved 80x160 mm sale_receipt layout had lineBlock=null and
included document.number with no source binding. The render therefore
failed before creating an output job, independently of printer availability.
The recorded sale was preserved and no spool job was submitted.

The sale source now supplies deterministic non-fiscal SAT-* reference
from stored sale identity; the template editor offers an explicit
'Ürün satırlarını ekle' action that preserves saved header/scan/size
while staging item description, quantity and line-total rows. Default
sale receipt presets include these rows. Invalid/insufficient line
blocks fail before job creation with DOCUMENT_SALE_JOB_LINES_MISSING
and targeted UI guidance. Historical template revisions remain immutable;
the operator explicitly saves the repaired layout as a new revision.

Verified: sale source 3/3, sale job 5/5 (including 22 TRY / quantity 2
and revision 2-to-3 on disposable DB), output IPC 32/32, renderer snapshot
6/6, Electron/renderer typechecks, scoped lint, and diff --check PASS.
Print Management and Market Quick Sale browser smoke PASS when run outside
Codex's network-denied sandbox. No live data edits, commit/push/deploy,
full suite, desktop restart or printer job in this fix.
