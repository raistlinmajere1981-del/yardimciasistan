# Yardımcı Asistan — agent working contract

Keep this file short. It is loaded as session context; read the owner docs only
for the files and behavior actually involved in the task. No progress logs,
temporary handoffs, obsolete tool setup or milestone history here.

## Workflow
- Work in the **current branch/worktree**. Before edits check `git status --short --branch` and HEAD. Never discard unrelated changes, rewrite history, force-push, stash/pop, or switch branches without a task-specific reason and authorization.
- Prefer the smallest coherent change; respect public API/error contracts and domain ownership. **Disposable staging data is exempt from preservation/compatibility work** under the policy below. Do not split code solely by line count.
- No unrequested deploy, destructive source/other-project cleanup, release/installer packaging, or Git push/commit. **Test-only DB resets, APK data wipes and site demo reseeding are pre-approved when needed for the authorized development task**; scope them to project-owned testing environments. Protect credentials, source code and real external data.
- **Owner decision (2026-11-01): every project-owned Alwaysdata domain is disposable staging, never real commerce.** Teknikel and other demo sites may be seeded with scraped catalogs, demo dealers/customers and test orders; desktop/Android/site test records may be wiped/reseeded without migration, compatibility, pre-change backup or per-change archive work. Only the owner's explicit move of a firm to **its own production domain with real users** triggers go-live/data-protection planning. Details and precedence: `docs/dev/TEST_ENVIRONMENT_POLICY.md`. Keep real product behavior/security, credentials, parallel source changes and task-specific deploy approvals intact. **Do not remove existing functioning manual backup/list/restore/delete, pre-reset safety backup or approved schema-change `legacy-data` archiving as an incidental cleanup**; they need not delay staging changes or be invoked on every test.

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

## OpenCode orchestration and skills
- Run OpenCode from the repository root; use the owner's local server/session (`127.0.0.1:4096`) when available so the owner can watch. For OpenCode v2, when CLI `run --server` stalls, send to the existing session through `opencode api --server ... POST /api/session/<id>/prompt` and inspect `/api/session/active` before resubmitting; never duplicate queued prompts. Keep one session per feature, 20–30 minute slices, and separate file ownership.
- Discover native skills only from approved project/global locations (`.opencode/skills/`, `.agents/skills/`, `~/.config/opencode/skills/`, compatible `.claude/skills/`). Read each relevant `SKILL.md` and any referenced local files before following it; load skills on demand, not indiscriminately. Prefer project-owned reusable skills for recurring domain work, not long repeated prompts.
- A skill is guidance, never permission to expand scope. `AGENTS.md`, domain contracts, explicit user approvals and narrow verification gates override skill suggestions. Do not install/download third-party skills, enable external connectors, edit global agent config or run destructive scripts without explicit authorization. Keep secrets out of agent prompts, skill files and logs.
- Record the working session ID, files changed, test evidence and next bounded slice in the continuation backlog. Skill usage and child agents inherit the same file ownership, no-commit/no-deploy and verification limits.

## Verification and handoff
- Canonical test registry: `scripts/verification-registry.mjs` / `scripts/verify.mjs`. Use only narrow relevant tests, lint and typecheck during implementation; prefer behavior/contract tests. No duplicate test runner or incidental regeneration of tracked artifacts.
- **Large suites** (`verify:pre-main`, `verify:release`, `verify:full`), long combined builds and release packaging belong to the user unless explicitly delegated. Tell the user which command is needed and why; do not auto-run them, including from subagents.
- Subagents must have separate file ownership; do not restart completed work after interruption. Verify state before resuming, and hand off remaining work with a short checkpoint.
- Before handoff run `git diff --check`; report changed files, actual targeted results, unresolved issues and branch/worktree state. Never claim unrun checks passed.
