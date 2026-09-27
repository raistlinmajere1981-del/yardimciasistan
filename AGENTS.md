# AGENTS.md

## Scope

This file defines repository-wide working rules for coding agents. Prefer the narrowest change that preserves current behavior and architecture.

## Repository

- Monorepo root: `~/YardimciAsistan`
- Default branch: `main`
- Create a focused branch for maintenance/refactor work; do not develop directly on `main`.
- Do not use force-push, history rewrites, stash/pop, or discard unrelated working-tree changes.
- Treat existing unrelated changes as owned by another task unless explicitly instructed otherwise.

## Application Platform v2

Authoritative target architecture for new desktop feature/UI/platform work:

- `docs/architecture/APPLICATION_ARCHITECTURE_CONSTITUTION_V1.md`
- `docs/architecture/DOMAIN_DECISIONS_V1.md`
- `docs/FEATURE_DEVELOPMENT.md`

Rules:

- Read the Constitution before new desktop UI/feature work.
- Preserve the Page / Entity Workspace / Operation distinction.
- Do not create a new feature-specific editor for the same entity.
- Do not create a second independent implementation of the same business operation.
- When an old UI doc or smoke test conflicts with the target architecture, the old presentation contract is not authoritative.
- Do not change business/domain behavior without an explicit domain decision.
- Keep new sector/settings/feature work compatible with the long-term extension model.
- Stage 9 provides static typed navigation, staged Settings and entity-workspace contribution seams. Keep them internal/static; do not add runtime plugin discovery, a service locator or a generic operation bus without new evidence.
- Appearance v2 is the only desktop appearance model: scheme + density + scale + accent + font + motion. Do not add legacy easy/pro, data-theme/data-mode or feature-specific theme branches.
- New staged Settings fields must use the existing category ownership/contribution model. Immediate preferences and operational actions keep their explicit lifecycles; do not create a second Settings persistence path.

See the current architecture documents and feature guide for details.

## Architecture

### Electron main process

`apps/desktop-app/electron/main.ts` is intentionally a composition/runtime root.

Keep these kinds of responsibilities there when they depend on process-wide mutable state or Electron lifecycle:
- app/window lifecycle
- service/coordinator construction
- BrowserWindow notifications
- Android action-queue runtime state
- Android snapshot publish/runtime state
- sender/webContents lifecycle
- thin bootstrap/shell/dashboard handlers

Do not extract code only to reduce LOC.

### IPC modules

Domain IPC handlers live under:

`apps/desktop-app/electron/ipc/`

Rules:
- IPC modules must not import `main.ts`.
- Keep handlers thin: capability/session gates, argument routing, and service/facade delegation.
- Preserve channel names, argument order, sync/async behavior, return shapes, gate order, and user-visible messages.
- Do not change preload/renderer IPC contracts during behavior-preserving refactors.

### Services

Focused orchestration/services live under:

`apps/desktop-app/electron/`

Rules:
- Services must not import `main.ts`.
- Services must not import IPC modules.
- Avoid generic context objects with many callbacks.
- Prefer narrow dependencies and explicit domain ownership.
- Do not create replacement god files.

### Database

`DesktopDatabase` is the compatibility facade for desktop persistence.

Rules:
- Prefer facade methods from `apps/desktop-app/electron/database.ts`.
- Do not bypass the facade with new store imports unless the existing architecture explicitly requires it.
- Do not add desktop schema creation outside `apps/desktop-app/db/schema.sql`.
- The desktop database supports only the current schema. Do not add historical migration chains or compatibility upgrades without an explicit new requirement.

## Shared utilities

Do not create catch-all files such as `utils.ts`, `helpers.ts`, or `common.ts`.

Centralize a helper only when:
- semantics are genuinely identical,
- it is pure or has a clearly defined platform boundary,
- there are preferably 3+ real call sites.

Placement:
- cross-package and browser-safe helpers: `packages/shared`
- Electron-only pure helpers: small thematic modules under `apps/desktop-app/electron/`
- test-only helpers: `scripts/test-helpers/`

Prefer names such as `object-utils.ts`, `date-utils.ts`, or another domain-specific filename over generic utility buckets.

## Logging and diagnostics

Desktop diagnostics are a repository contract, not an ad-hoc debugging aid.

- Persistent desktop diagnostics live under `data/logs/sessions/<session-id>/` as `session.json` plus JSONL event chunks.
- New persistent diagnostics must use the structured desktop diagnostics API. Do not add new long-lived `console.log/warn/error` calls for application behavior.
- Every new record should have a stable `scope` and stable machine-readable `event` name such as `product-data.image-preview.failed`.
- Use `INFO` for meaningful operation milestones, `WARN` for recoverable abnormal states, and `ERROR` for failed operations or lost functionality. Do not log every function entry/exit.
- Pass caught `Error` values to the diagnostics API instead of manually flattening stack traces.
- Never log API keys, passwords, sync secrets, authorization headers, cookies, tokens, customer message bodies, or other unnecessary customer PII. The logger redacts defensively, but callers must still avoid collecting sensitive data.
- Use an `operationId` to correlate multi-step flows such as sync cycles, product lookup, Android actions, AI calls, backup/restore, and imports when one is already available or naturally created.
- When investigating a desktop failure, inspect the latest session's WARN/ERROR events before adding speculative debug output. Start with `npm run logs:errors`; use `npm run logs:latest -- --scope <scope>` when the domain is known.
- Renderer diagnostics must go through the isolated preload bridge; renderer code must not access log files directly.
- Diagnostic reads are locked behind the application session lock. Do not create alternate file-reading IPC paths that bypass that gate.
- See `docs/diagnostics/logging.md` for the event format and investigation workflow.

## Generated artifacts

Normal build/test commands must not leave tracked generated files modified.

`firm-template/web-module/widget.js` is a tracked template snapshot, not a normal build output target.

Rules:
- `npm run build -w @yardimci-asistan/web-widget` writes only `packages/web-widget/dist/widget.js`.
- `npm run pack:web-module` packages the current `dist/widget.js` without modifying tracked template files.
- Refresh the tracked template snapshot only with `npm run sync:web-widget-template`, and review that generated diff intentionally.
- Do not hide, stash, or discard unrelated worktree changes while handling generated artifacts.

## Tests and checks

Use the narrowest useful checks during a stage, then full checkpoints at meaningful milestones.

Important command nesting:
- `npm run check:linux` already runs `npm run check`.
- Do not run `npm run check` separately when running `check:linux`.
- Inside `check:linux`, `npm run check` is the shared build barrier; dependent smoke/package steps after it should reuse those outputs through `:no-build` variants instead of rebuilding packages/apps.
- Standalone smoke/package commands should remain self-contained and may keep their own build step.
- `pilot:check` preflight builds packages before web-module packaging, so its packaging step should reuse the existing widget build.
- Local checks must use the installed Electron runtime directly; do not invoke Electron through `npx` or let `electron-builder` redownload the Electron distribution when `node_modules/electron/dist` is available.
- Local test/dev CLIs such as Vite must use repository-installed binaries directly; do not use `npx` paths that can implicitly download missing packages.
- Do not additionally run `npm run quality:strict` when the unique strict gates below are run individually.

Milestone gate:

```bash
npm run pre-main
```

`pre-main` is the repository-level merge gate. It composes the Linux product checks,
strict lint/Knip/design/architecture audits, the full pilot gate, current platform/domain
regressions, Android action regressions, and `git diff --check`.

Run individual gates while diagnosing a failure; do not manually maintain a second
merge checklist beside `pre-main`.

For Electron refactors, normally include:
- `npm run typecheck:electron`
- targeted smoke tests for the touched domain
- `git diff --check`

Prefer behavior/contract tests over tests that parse a specific function body or source-file location. If a source-structure assertion is unavoidable, keep it minimal and update it when ownership moves.

## Refactor discipline

Before editing:
```bash
git status --short --branch
git rev-parse HEAD
git diff --check
```

During behavior-preserving refactors:
- preserve messages and error codes exactly,
- preserve ordering where side effects are involved,
- keep runtime mutable state with its natural owner,
- avoid unrelated cleanup,
- do not optimize or redesign behavior unless explicitly requested.

Before finishing:
- report changed files,
- report targeted tests,
- report any known pre-existing failure separately,
- report `git diff --stat` and `git status --short`.

If a change would broaden scope, stop and explain the dependency instead of silently expanding the task.
