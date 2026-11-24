# Yardımcı Asistan — agent working contract

Loaded at session start. Keep this file about **current, durable rules**, not
milestone transcripts or old version instructions. Read only task-relevant
contracts from `docs/README.md`; use `product-version.json` for the version.

## Worktree and environment
- Before editing inspect `git status --short --branch` and HEAD. Keep all unrelated
  changes, other repos and agent file ownership intact. No unrequested
  commit/push, branch switch, stash/reset, history rewrite, deploy or installers.
- Small coherent changes; preserve API, authorization and error contracts.
  Do not refactor solely to reduce line count or regenerate unrelated assets.
- **Owner decision:** Project-owned Alwaysdata domains (including Teknikel),
  local Desktop/Android databases and demo records are disposable staging,
  **not production**, until the owner explicitly begins real use on a firm's
  own production domain. Authorized test resets/reseeding/`pm clear` need no
  historical migration, startup backfill or per-change backup. See
  `docs/dev/TEST_ENVIRONMENT_POLICY.md` for scope and precedence.
- Never casually remove existing manual backup/list/restore/delete, pre-reset
  safety backup or approved `legacy-data` archiving. Preserve credentials,
  real external data, production security, source code and unrelated changes.

## Architectural boundaries
- Persisted **capabilities**, not sector presets, determine visibility and
  behavior. IPC and mutation owners recheck permissions regardless of UI.
- Keep Page, Entity Workspace, Operation and Projection distinct. Reuse
  canonical editors and operations; no second mutation route, nested modal
  or feature-specific theme/appearance engine.
- Electron entrypoints compose lifecycle, not domain policy; IPC delegates to
  services without reverse import. Preserve preload signatures, lock/gates
  and the durable outbox/ACK flows.
- `DesktopDatabase` is a facade. Domain transaction owners are authoritative;
  `apps/desktop-app/db/schema.sql` is the single canonical schema. Do not add
  historical migrations/compat shims without an explicit requirement.
- Admin lives in `apps/admin-control-center/`, not a retired TUI; keep it out
  of customer packages. Protect release/deploy preflights and use structured,
  redacted diagnostics (`docs/diagnostics/logging.md`).

## OpenCode, skills and subagents
- Prefer the owner's existing local OpenCode server/session
  (`127.0.0.1:4096`) when available. Verify actual CLI/API, current model,
  quota and queued prompts before submitting. Do not assume old API endpoints,
  duplicate requests or silently change providers after quota exhaustion.
- One feature per bounded session. Parallel/subagent work requires disjoint
  file ownership and the same verification/deploy limits.
- Discover skills only from approved project/global roots
  (`.opencode/skills/`, `.agents/skills/`, `~/.config/opencode/skills/`,
  compatible `.claude/skills/`). Read the relevant `SKILL.md` on demand;
  a skill never expands permissions. No third-party skill installation,
  external connectors, global agent-config edits or destructive scripts
  without authorization. Never put secrets in prompts or logs.
- Handoff: report actual changed files/tests, blockers and next slice. Update
  the **current** checkpoint only when needed for collaboration. Never load
  or append old continuation logs as a default workflow.

## Verification
- Registry: `scripts/verification-registry.mjs` / `scripts/verify.mjs`.
  During implementation run narrow relevant tests, lint/typecheck and
  `git diff --check`. Report checks that were **not** run.
- `verify:pre-main`, `verify:release`, `verify:full`, long combined builds and
  packaging are owned by the user unless explicitly delegated. Do not
  trigger them indirectly from a subagent.
- Choose relevant contracts through `docs/README.md`. The constitution,
  domain decisions and current code outrank archived release, handoff and
  audit notes.
