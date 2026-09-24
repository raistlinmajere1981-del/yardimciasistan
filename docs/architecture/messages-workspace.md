# Messages / AI Workspace — Stage 8E

Status: closed and verified on `refactor/messages-workspace-v2`.

## Ownership

Messages remains a persistent operational surface rather than a new entity editor.

The Stage 8E ownership model is:

- `useMessagingController` owns durable messaging and AI operation state above presentation lifetime.
- `MessagesPage` owns safe/web presentation mode and the user-takeover barrier.
- `WhatsAppWorkspace` owns presentation-local copy/send/webview UI state.
- the Electron WhatsApp driver owns the single persistent WhatsApp guest used by both user and automatic birthday delivery flows.
- existing AI services, prepared-message persistence and birthday delivery services remain authoritative.
- no second WhatsApp webview, generic global store or command bus was introduced.

The existing persistent Messages host remains mounted across ordinary page navigation so the WhatsApp guest survives:

```text
Safe mode ↔ WhatsApp mode
Messages → another page → Messages
```

The guest uses the existing `persist:yardimci-whatsapp` partition.

## Shared WhatsApp guest takeover

Automatic birthday delivery and interactive WhatsApp mode share one real Electron guest. Stage 8E makes ownership explicit.

When the user enters WhatsApp mode:

```text
renderer requests takeover
→ main marks userBusy=true
→ active automatic owner is permanently invalidated
→ active automatic run reaches a guarded settle point
→ guest is returned to the WhatsApp home URL
→ takeover Promise resolves
→ only then is the interactive webview surface revealed
```

An old automatic owner cannot become valid again when `userBusy` later returns to false.

The automatic driver checks ownership around asynchronous boundaries including:

- target navigation
- inspection polling
- message fill
- pre-send approval boundary
- final send-script start

A send script that has already begun is not treated as retrospectively cancellable; its real result is allowed to flow back through the delivery service.

## Takeover retry lifetime

Renderer takeover retries use a sequence/disposal guard.

The guard is checked:

- before every takeover request
- after every takeover result
- after retry sleep

Therefore leaving Web mode, navigating away or losing the WhatsApp capability invalidates the retry loop before it can issue a stale takeover IPC that would leave `userBusy=true`.

A fresh entry to WhatsApp mode receives a new takeover sequence.

## Webview registration lifecycle

Webview registration is tied to the guest element lifecycle, not to `webViewUrl`.

Consequences:

- URL changes do not detach/re-attach the automatic driver.
- the same guest ID is registered idempotently.
- a genuinely new guest can still register.
- teardown remembers the last registered guest ID and can unregister it even if `getWebContentsId()` is no longer readable.
- repeated `dom-ready` events do not intentionally create duplicate attach/evaluate cycles for the same guest.

Manual customer navigation explicitly loads the selected customer URL when needed; registration no longer depends on URL state changes to cause navigation.

## AI Workspace async ownership

AI Workspace generation uses two distinct concepts:

- workspace context revision
- synchronous generate owner/token

The generate owner is acquired before the first asynchronous boundary, preventing same-turn duplicate generation calls.

Workspace context changes invalidate older generation results. Relevant changes include:

- workspace mode
- selected request
- instructions
- history selection
- content editing
- opening a new AI tools context

The revision is monotonic, so an A → B → A sequence does not make the original A operation current again.

A successful Workspace generation advances the revision when its result is applied. This establishes ownership over the visible Workspace result and prevents an older WhatsApp rewrite from overwriting it later.

## WhatsApp rewrite ownership

Rewrite captures:

- target request
- WhatsApp selection revision
- rewrite generation
- AI capability epoch
- WhatsApp capability epoch
- current Workspace revision

After AI generation returns, staleness is checked before `saveAiWorkspaceResult` starts.

After save returns, staleness is checked again.

If the WhatsApp selection changed, the old rewrite cannot:

- save a stale generated result after the selection change
- move the UI back to its old request
- overwrite newer feedback state

Rewrite and owner suggestion share request-scoped mutation ownership, so both cannot write the same request concurrently.

When a rewrite legitimately takes ownership of the AI Workspace surface, it:

- advances the Workspace revision
- releases any older Workspace generate owner
- applies its reply result
- leaves Workspace state in `success`

This prevents a generate-before/rewrite-after ordering from leaving the Workspace permanently stuck in `loading`.

## Owner reply suggestion ordering

Owner reply suggestions use separate suggestion generations plus request-scoped mutation ownership.

Different requests may run independently.

Only the most relevant/current renderer completion may apply its dashboard snapshot or change the selected WhatsApp request. An older completion cannot overwrite a newer dashboard projection or selection merely because its backend operation finished later.

## Capability normalization

### AI

Turning AI off:

- invalidates pending AI ownership
- invalidates history loads
- clears active AI entry/content/history/instructions
- closes the active AI tools surface
- prevents stale completions from repopulating disabled AI state

Persistent AI history in the database is not deleted.

### Customers

Turning Customers off:

- invalidates request-scoped AI and messaging operations
- clears selected customer request and prepared customer handoffs
- normalizes real AI Workspace mode to `daily`
- clears request ID and request-scoped content/instructions
- projects only daily AI history entries
- prevents request fallback from selecting `dashboard.requests[0]`

### WhatsApp

Turning WhatsApp off:

- invalidates pending rewrite ownership
- clears selected/prepared WhatsApp presentation state
- invalidates pending birthday preparation
- releases birthday loading/presentation ownership
- does not clear an independent AI Workspace result

### Customer Credit

Turning Customer Credit off clears only credit handoff state.

It does not invalidate an unrelated pending birthday preparation.

## Birthday preparation ownership

Manual birthday preparation has a separate operation generation and active owner.

If Customers or WhatsApp is disabled while preparation is pending:

- the operation generation is invalidated
- the active owner is released
- `birthdayPreparingId` is cleared
- the related loading state is left
- the stale operation cannot later restore or clear a newer operation's state

This prevents capability off/on from leaving the birthday action permanently disabled.

## Domain boundaries preserved

Stage 8E does not change:

- SQLite schema or migrations
- AI workspace service/store persistence model
- prepared-message store transaction semantics
- birthday delivery database lifecycle
- generic application state architecture
- customer, reservation or finance ownership
- WhatsApp Web user confirmation policy

The user still owns the final interactive send action. Automatic birthday delivery continues to use its existing delivery service and ownership checks.

## Verification

Stage closure passed locally:

```text
npm run typecheck
npm run typecheck:electron
npm run smoke:messages-ai-staleness
npm run smoke:messages-takeover-lifecycle
npm run build -w @yardimci-asistan/desktop-app

node scripts/smoke-birthday-automatic.mjs
node scripts/smoke-stage3a-messages-setup.mjs
node scripts/smoke-market-customer-credit-whatsapp.mjs

npm run smoke:desktop-renderer
npm run lint:strict
npm run knip:strict
npm run architecture:audit
npm run design:audit:strict
npm run pilot:check
git diff --check
npm run check:linux
```

Architecture review sequence:

```text
Stage 8E contract arbitration: ready
Stage 8E final review: three concrete blockers found
Targeted blocker re-review: two closed, one inverse-order lifecycle regression found
Single-blocker recheck: pass
```

Final Astra result: `STAGE8E_SINGLE_RECHECK=pass`.

## Regression coverage added

Stage 8E adds explicit behavioral coverage for:

- Workspace A → B stale generation
- Workspace A → B → A stale generation
- same-turn duplicate generation
- stale rewrite before save
- owner suggestion completion ordering
- pending AI completion after AI capability removal
- Customers capability normalization
- rewrite pending → newer Workspace generate
- Workspace generate pending → later rewrite takeover
- automatic birthday owner invalidation during user takeover
- stale WhatsApp takeover retry after Safe/navigation transition
- pending birthday preparation during WhatsApp off/on

## Deferred, non-blocking follow-ups

The following are not required for Stage 8E closure:

- a second WhatsApp guest dedicated to automation
- broader AI history pagination
- cancellation of provider-side AI requests after renderer ownership becomes stale
- deeper full-Electron DOM automation beyond the existing ownership/renderer contracts
- broader redesign of Messages visual composition
