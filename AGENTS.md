# AGENTS.md

Repository-wide rules for coding agents. This is a **short working contract**, not a progress log or a duplicate of domain documentation. Read linked contracts only for the area being changed.

## Workflow and safety

- Repository: `~/YardimciAsistan`; normal sequential work uses `main`. Use a focused branch for parallel, risky or isolated work.
- Never force-push, rewrite history, stash/pop, discard or overwrite unrelated changes. Check `git status --short --branch` and `git rev-parse HEAD` before editing.
- Make the smallest coherent change that preserves runtime behavior, persisted data, message/error contracts and domain ownership. Do not split files solely to reduce LOC.
- Keep architectural decisions and current contracts in their owner docs; do not add milestone reports, session handoffs or dated status lists to this file.

## Read the relevant contract before changing an area

| Area | Canonical reference |
| --- | --- |
| New desktop UI/feature/platform | `docs/architecture/APPLICATION_ARCHITECTURE_CONSTITUTION_V1.md`, `docs/FEATURE_DEVELOPMENT.md` |
| Business decisions and capability semantics | `docs/architecture/DOMAIN_DECISIONS_V1.md`, `docs/MODULAR_BUSINESS_FOUNDATION.md` |
| UI layout and styling | `docs/UI_RULES.md`, `docs/design-system/README.md` |
| Desktop ↔ hosting publication/restore | `docs/architecture/DESKTOP_HOSTING_PUBLICATION_PROTOCOL_V3.md`, `docs/architecture/DESKTOP_RESTORE_RECONCILIATION_V1.md` |
| Admin Control Center | `docs/dev/ADMIN_CONSOLE_TARGET.md` |
| Diagnostics | `docs/diagnostics/logging.md` |
| Other domain docs | `docs/README.md` |

The architecture constitution and decision register take precedence over historical UI notes. Existing domain/persistence/security invariants still require an explicit decision before changing behavior.

## Architecture boundaries

- **UI:** Page, Entity Workspace, Operation and Projection are distinct. Reuse canonical entity editors and business operations; no parallel editor or second mutation path. No nested modal pattern or feature-specific appearance engine.
- **Capabilities:** persisted capability state is the runtime visibility/behavior authority; profile names are presets, not runtime gates. Frontend visibility does not replace session/capability checks at IPC and mutation boundaries.
- **Electron:** `main.ts`/`main-entry.ts` are process composition/lifecycle roots, not default owners for domain policy. Keep runtime state with its actual coordinator/service owner. Domain IPC modules in `apps/desktop-app/electron/ipc/` must not import main; handlers should gate and delegate. Services must not import main or IPC modules. Preserve preload, IPC channel/argument/result contracts and gate ordering during refactors.
- **Data:** `DesktopDatabase` is the desktop consumer facade; canonical domain writers and transaction boundaries retain ownership. Schema lives in `apps/desktop-app/db/schema.sql`. This is a current-schema-only working copy; do not invent historical migrations, compatibility shims or startup backfills.
- **Shared code:** no catch-all `utils.ts`/`helpers.ts` bucket or generic service locator/operation bus. Extract genuinely shared, well-bounded logic only.
- **Sync:** use the canonical durable publication registry/outbox and exact acknowledgement lifecycle. Never add direct best-effort publication paths or an independent Android snapshot workflow.
- **Admin:** the supported developer application is `apps/admin-control-center/`, **not** the retired `tools/admin/` TUI. It orchestrates existing verification/release/deploy scripts; it does not duplicate their implementation. Never package admin with customer builds. Keep credentials out of committed config, renderer responses and logs. Remote/destructive actions need explicit preflight and confirmation.

## Logging, security and generated artifacts

- Use the structured desktop diagnostics API with stable `scope`/`event` and meaningful severity. Start investigations with `npm run logs:errors`; consult `docs/diagnostics/logging.md`. Renderer logs use the preload bridge and must honor the session lock.
- Never record secrets, credentials, auth headers, tokens, customer message bodies or unnecessary personal data; defensive redaction is not permission to collect them.
- Build/test must not modify tracked generated files. The API-only web module contains no presentation assets. Demo assistant build writes only to ignored `test-site/landing/assets/assistant/` via `npm run build:demo`. Do not conceal incidental worktree changes.

## Verification

- One verification authority: `scripts/verification-registry.mjs` and `scripts/verify.mjs`. Add new smoke scripts to the registry (or classify as helpers); no second aggregate runner, duplicated build prerequisites or downloadable `npx` binaries.
- Iterate with the narrowest relevant `npm run verify:check -- <id>` / `npm run verify:domain -- <domain>`, plus affected typecheck, lint and targeted tests. Use `npm run verify:list` to find IDs. Do **not** run the expensive `verify:pre-main` on every small lint/type-only iteration.
- `npm run verify:pre-main` is the integration/merge or milestone gate; `npm run verify:release` is the release-artifact gate. Device/live-service checks remain explicitly manual where required.
- Prefer behavioral and contract assertions over source-text/LOC/geometry tests. For an Electron boundary change, normally include `npm run verify:check -- typecheck-electron` and the touched domain's tests.
- Before handoff, run `git diff --check`; report changed files, focused checks, known pre-existing failures and branch/worktree state. Do not claim unrun checks passed.
