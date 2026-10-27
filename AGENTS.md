# Yardımcı Asistan — agent working contract

Keep this file short. It is loaded as session context; read the owner docs only
for the files and behavior actually involved in the task. No progress logs,
temporary handoffs, obsolete tool setup or milestone history here.

## Workflow
- Work in the **current branch/worktree**. Before edits check `git status --short --branch` and HEAD. Never discard unrelated changes, rewrite history, force-push, stash/pop, or switch branches without a task-specific reason and authorization.
- Prefer the smallest coherent change; respect existing persisted/runtime data, public API/error contracts and domain ownership. Do not split code solely by line count.
- No live deploy, destructive cleanup, database reset, release/installer packaging, or Git push/commit unless the user explicitly requests that operation. Protect credentials and customer data.

## Read relevant contracts only
- Desktop feature/platform: `docs/architecture/APPLICATION_ARCHITECTURE_CONSTITUTION_V1.md`, `docs/FEATURE_DEVELOPMENT.md`
- Capabilities/domain: `docs/architecture/DOMAIN_DECISIONS_V1.md`, `docs/MODULAR_BUSINESS_FOUNDATION.md`
- UI/design: `docs/UI_RULES.md`, `docs/design-system/README.md`
- Publishing/restore: `docs/architecture/DESKTOP_HOSTING_PUBLICATION_PROTOCOL_V3.md`, `docs/architecture/DESKTOP_RESTORE_RECONCILIATION_V1.md`
- Web template: `docs/architecture/WEB_SITE_TEMPLATE_V1.md`, `docs/architecture/WEB_DATA_SERVICE_CONTRACT_V1.md`
- Admin/diagnostics: `docs/dev/ADMIN_CONSOLE_TARGET.md`, `docs/diagnostics/logging.md`
- Other areas: `docs/README.md`. Current constitution and decision register supersede historical notes.

## Non-negotiable boundaries
- Persisted capabilities, **not sector presets**, control runtime visibility and behavior; IPC and mutation owners enforce authorization independently of UI.
- UI Page, Entity Workspace, Operation and Projection remain distinct. Reuse canonical editors/operations; no duplicate mutation routes, nested modals or feature-specific appearance engine.
- Electron entrypoints compose lifecycle, not domain policy. Domain IPC delegates to services without importing `main`; services do not depend on IPC. Preserve preload/IPC signatures and lock/gate order.
- `DesktopDatabase` is a consumer facade; domain writers own transactions. Current schema owner: `apps/desktop-app/db/schema.sql`. Do not introduce historical migrations, startup backfills or compatibility shims without an explicit decision.
- Use the existing durable sync/publication outbox and acknowledgements; no parallel Android or best-effort publication path. Shared helpers must have clear ownership, not generic catch-all buses.
- Admin is `apps/admin-control-center/`, never the retired TUI; do not package it with customer apps. Preserve release/deploy preflights. Use structured diagnostics; never log tokens, credentials, customer messages or excess personal data.

## Verification and handoff
- Canonical test registry: `scripts/verification-registry.mjs` / `scripts/verify.mjs`. Use only narrow relevant tests, lint and typecheck during implementation; prefer behavior/contract tests. No duplicate test runner or incidental regeneration of tracked artifacts.
- **Large suites** (`verify:pre-main`, `verify:release`, `verify:full`), long combined builds and release packaging belong to the user unless explicitly delegated. Tell the user which command is needed and why; do not auto-run them, including from subagents.
- Subagents must have separate file ownership; do not restart completed work after interruption. Verify state before resuming, and hand off remaining work with a short checkpoint.
- Before handoff run `git diff --check`; report changed files, actual targeted results, unresolved issues and branch/worktree state. Never claim unrun checks passed.
