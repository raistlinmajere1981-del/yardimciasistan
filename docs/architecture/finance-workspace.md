# Finance Workspace — Stage 8D

Status: closed and verified on `refactor/finance-workspace-v2`.

## Ownership

- Finance remains the canonical operational workspace for daily cash tracking.
- No separate FinanceEntry entity workspace was introduced.
- Manual income and expense entry are bounded FormDialog subflows launched from Finance Workspace.
- Room Folio, pension payment and restaurant transaction ownership remain in their existing domain services.
- Automatic finance entries remain read-only projections in Finance Workspace; they must be corrected through their source transaction.
- The existing `reports` route remains the host surface and is presented as `Kasa` when Finance is enabled.
- Kasa and Detaylı Raporlar are sibling tabs; detailed reporting is no longer a hidden/collapsible panel below the daily cash workspace.
- AI report actions live in the daily Kasa side rail so they remain reachable without scrolling through detailed reports.
- Finance categories are persisted in `finance_categories`. System source categories are protected; user categories can be added or deactivated directly inside the income/expense dialogs.

## Persistent controller lifetime

`useFinanceController` lives above page presentation in `DesktopAppView`.

It owns:

- authoritative Finance snapshot
- Room Folio outstanding projection
- manual-entry draft
- shared save/delete mutation lock
- Finance and Folio load generations
- Finance capability epoch
- hidden mutation completion
- refresh-after-mutation intent

This keeps operation lifetime independent from `FinanceWorkspace` mount/unmount.

`FinanceWorkspace` owns only presentation-local state such as:

- delete confirmation presentation
- recent-entry expansion
- entry-dialog category text input

## Manual mutation contract

Save and delete share one synchronous ref lock.

The lock is acquired before the first asynchronous boundary. Therefore:

- same-turn duplicate save cannot start a second IPC request
- save/delete cannot overlap
- delete/delete cannot overlap
- page navigation does not release the operation lock
- only the operation that acquired the lock may release it

Successful mutation results remain authoritative even when Finance Workspace is hidden.

## Draft lifetime

The manual Finance draft survives ordinary page navigation.

During a Finance mutation:

- opening another manual-entry draft is blocked
- closing the current draft is blocked
- draft field changes are blocked

A successful save ends the draft. A failed save preserves it.

Finance capability removal clears Finance presentation state and invalidates the previous capability epoch. Ordinary navigation does not.

## Async and stale-result safety

Finance and Room Folio reads use independent generation counters.

A Finance mutation invalidates older Finance reads before the request begins. A successful mutation invalidates them again before applying `result.data`.

This prevents:

```text
old getFinanceData snapshot
→ manual mutation commits
→ authoritative result.data is applied
→ old read completes
```

from restoring stale Finance state.

Finance and Folio projections are published independently; no shared `Promise.all` barrier remains.

A failed Folio projection refresh does not roll back or hide a committed Finance mutation.

## Capability boundaries

- Finance capability changes invalidate Finance load generations and capability epoch.
- A mutation already in flight is not unlocked early when a capability changes.
- A completion from an obsolete Finance epoch is not directly applied to the new projection.
- When needed, a fresh authoritative Finance read is scheduled after the operation settles.
- Folio capability changes clear only the Folio projection and its generation; they do not invalidate Finance mutation results or unrelated draft fields.
- Capability-dependent income categories normalize to a valid fallback when their source capability disappears.

## Domain boundaries preserved

Stage 8D does not change:

- `apps/desktop-app/electron/finance.ts`
- `apps/desktop-app/electron/finance-ipc.ts`
- `apps/desktop-app/electron/room-folio.ts`
- `apps/desktop-app/electron/room-folio-ipc.ts`
- preload Finance contracts
- Room Folio and restaurant schemas/triggers
- Room Folio transaction ownership
- restaurant transaction ownership

Money remains minor-unit integer data and existing domain services remain authoritative.

## Verification

Stage closure passed locally:

```text
npm run typecheck
npm run smoke:finance-workspace
node scripts/smoke-finance-service.mjs
node scripts/smoke-finance-db.mjs
node scripts/smoke-room-folio-service.mjs
node scripts/smoke-stage2c-core-workspaces.mjs

npm run smoke:desktop-renderer
npm run lint:strict
npm run knip:strict
npm run architecture:audit
npm run design:audit:strict
npm run pilot:check
git diff --check
npm run check:linux
```

Final Astra review: `STAGE8D_FINAL=pass`.

## Current category lifecycle

The clean schema contains `finance_categories`. The Finance service also ensures the table exists for the single-working-copy development database and seeds only missing defaults. Removing a user category marks it inactive, so historical `finance_entries.category` values keep resolving to their original label. System categories such as Pansiyon and Restoran cannot be removed.

## Deferred, non-blocking follow-ups

The following were explicitly not required for Stage 8D closure:

- pagination beyond the current bounded Finance history snapshot
- replacing the delete confirmation modal with an inline confirmation
- persistence-level idempotency across application crash/restart
- broader accounting/reporting expansion
- additional adversarial smoke variants for capability epochs, lock-screen integration and delayed Folio races

These remain follow-up opportunities rather than Stage 8D blockers.
