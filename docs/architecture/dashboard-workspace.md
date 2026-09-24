# Dashboard Workspace — Stage 8F

Status: closed and verified on `refactor/dashboard-workspace-v2`.

## Ownership

Dashboard remains a projection and launcher surface.

It does not become a canonical editor for Customer, Reservation, Daily Task, Messages, Finance or any other domain entity.

Stage 8F keeps the existing Dashboard composition and makes its state ownership explicit:

- `DesktopSyncController` owns the authoritative dashboard projection and automatic sync status.
- `SetupController` owns setup/configuration state used by system-health projections.
- `OperationController` continues to own Daily Task mutations.
- `MessagingController` continues to own reply, AI and birthday-message operations.
- Dashboard receives capability-projected data from `projectDesktopDashboardData()`.
- `DashboardPage` and `SystemHealthPanel` remain presentation/projection components.

No new Dashboard-specific persistence layer, entity editor, mutation service or cache was introduced.

## System Health ownership

Before Stage 8F, `SystemHealthPanel` independently read and subscribed to application state through:

```text
getSetupData()
getSyncStatus()
onSyncStatusChanged()
runSyncNow()
```

That created a second renderer owner for setup/sync state already owned by the application controllers.

Stage 8F removes that duplicate lifecycle.

The panel now receives:

```text
SetupController.setupData
DesktopSyncController.automaticSyncStatus
global sync busy state
app-level sync operation callback
```

through the existing app/router hierarchy.

Therefore System Health is now a pure projection of already-owned application state.

## Sync operation convergence

Dashboard's "Şimdi eşitle" action no longer starts a local sync lifecycle.

It delegates to the same `DesktopSyncController.pullRequests()` operation used by the application shell.

That preserves one operation path for:

- running the sync cycle
- refreshing Dashboard data
- refreshing capability state
- updating global sync feedback
- applying the existing error handling contract

The Dashboard sync button also reflects the shared busy state, including both the global transient sync state and automatic coordinator `syncing` phase.

## Dashboard projection contract

The Dashboard consumes only the capability-safe projection returned by `projectDesktopDashboardData()`.

This keeps hidden domains out of the visible Dashboard model:

- requests require Customers + Requests capability
- room and table capacity follows their domain capabilities
- reservations are filtered through reservation availability rules
- operational tasks are filtered through task/domain capability rules
- WhatsApp prepared-message counts require Customers + WhatsApp
- AI-derived request fields are hidden when AI is disabled

Dashboard does not recover hidden raw-domain records from the source snapshot.

## Launcher and operation boundaries

Dashboard actions continue to converge on existing canonical owners.

### Customer request

A request action routes to the existing messaging or customer flow:

```text
WhatsApp enabled → existing WhatsApp handoff
AI enabled      → existing AI reply workspace
otherwise       → Customer Work
```

Dashboard does not implement a request editor.

### Reservation

Reservation inspection keeps the existing domain-aware routing:

- a linked customer request opens the canonical Customer Work context
- food-service reservations route to Restaurant
- accommodation reservations route to Pension
- unavailable capability/domain combinations return explicit feedback

Dashboard does not implement a reservation editor.

### Daily Task

"Tamamla" calls the existing `OperationController.handleUpdateDailyTaskStatus()` path.

No Dashboard-specific task mutation was added.

### AI

"Günü değerlendir" opens the existing Messages / AI Workspace in daily mode.

Dashboard does not host a second AI editor.

### Birthday message

Birthday preparation delegates to the existing MessagingController operation and retains the Stage 8E ownership/capability guarantees.

## Priority and schedule projection

`app/dashboard.ts` remains a pure projection/formatting layer.

It owns:

- waiting-request selection
- pending task/reservation selection
- priority rank calculation
- schedule ordering
- date urgency projection
- Turkish display formatting

It does not perform IPC, persistence or domain mutation.

Stage 8F intentionally leaves the existing ranking policy unchanged.

## Regression coverage

`smoke-dashboard-workspace` protects the Stage 8F architectural boundary.

The fixture renders Dashboard without a `window.yardimciDesktop` bridge and verifies that:

- Dashboard and System Health render solely from supplied controller/projection state
- system-health sync delegates to the supplied app-level operation
- request actions remain launcher callbacks
- task completion remains an operation callback
- reservation inspection remains a launcher callback
- Customer Work and daily AI actions remain external launchers

The smoke is included in both `smoke:desktop-renderer` and `pilot:check`.

## Domain boundaries preserved

Stage 8F does not change:

- SQLite schema or migrations
- reservation, task, customer or messaging services
- capability definitions
- WorkspaceHost/entity workspace definitions
- Dashboard priority policy
- Calendar behavior
- notification ownership
- automatic sync coordinator semantics

The change is an ownership cleanup, not a Dashboard redesign.

## Verification

Stage closure passed locally:

```text
npm run typecheck
npm run typecheck:electron
npm run smoke:dashboard-workspace
npm run smoke:desktop-renderer

node scripts/smoke-stage2c-core-workspaces.mjs
node scripts/smoke-operation-calendar.mjs

npm run lint:strict
npm run knip:strict
npm run architecture:audit
npm run design:audit:strict
npm run pilot:check

git diff --check
git status --short --branch
npm run check:linux
```

No high-risk persistence or transaction boundary was introduced, so Stage 8F did not require an Astra architecture checkpoint.

## Deferred, non-blocking follow-ups

The following remain outside Stage 8F:

- changing Dashboard priority ranking policy
- adding new sector contribution registries before Stage 9
- merging Dashboard and Calendar projection models
- redesigning Dashboard visual composition
- adding Dashboard-specific cached state
