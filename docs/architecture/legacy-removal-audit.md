# Stage 10 — Legacy removal audit

Status: in progress on `refactor/legacy-doc-reset-v2`.

Stage 10 removes completed migration scaffolding and resets active documentation around Application Platform v2. Existing local user settings/data do not require migration compatibility for this cleanup; obsolete persisted shapes may safely fall back to current defaults.

## Classification

- **remove** — dead runtime/style/component code and obsolete compatibility
- **rename/reset** — behavior remains useful but a migration-era name or contract is misleading
- **archive** — historical evidence retained only when explicitly marked non-authoritative
- **replace** — source/DOM-structure assertions replaced by behavior/platform contracts

## Initial inventory

### Slice 10A — Appearance legacy cleanup

- Rename `smoke-desktop-easy-mode.mjs` to `smoke-desktop-appearance.mjs`.
- Remove legacy `theme/mode` preference migration. Only version 2 records are interpreted; other records fall back to Appearance v2 defaults.
- Remove stale `data-theme` / `data-mode` cleanup from runtime because v2 no longer writes those attributes.
- Keep malformed-record fallback and Appearance v2 persistence/interaction coverage.
- Update active agent guidance so easy/pro and dynamic plugin-framework rules no longer describe unfinished migrations.

### Slice 10B — Migration-era smoke cleanup

Removed:

- `smoke-stage2b-restaurant-menu.mjs`
- `smoke-stage2c-core-workspaces.mjs`
- `smoke-stage3a-messages-setup.mjs`
- `smoke-stage3b-final-legacy-surfaces.mjs`

Their useful behavior is already protected by current contracts:

- Menu editor/preview and core renderer flows → `smoke-desktop-renderer.mjs`
- Restaurant workspace/order/transfer lifecycle → `smoke-restaurant-workspace.mjs`
- Room-folio transfer accounting semantics → `smoke-room-folio-table-order-transfer.mjs`
- Dashboard projection/launchers → `smoke-dashboard-workspace.mjs`
- Calendar projection/context → `smoke-calendar-workspace.mjs`
- Finance ownership → `smoke-finance-workspace.mjs` plus finance domain smokes
- Market workspace/session contracts → Market workspace/session smokes
- Messages persistent guest + AI ownership → Messages lifecycle/staleness smokes
- Settings/first-setup category behavior → `smoke-settings-platform.mjs`
- Lock/shell/accessibility → desktop lock/shell smokes
- CSS/token/legacy-style restrictions → strict design audit

The removed files primarily reproduced migration-era screenshots, overflow matrices and old DOM/CSS structure. `pilot:check` now names current behavior contracts instead of historical migration stages.

Source-text cleanup in this slice:

- removed the source-only `smoke-operation-calendar.mjs`; `smoke-calendar-workspace.mjs` is the current behavior contract
- removed the source-only `smoke-market-workspace-contract.mjs`; Market browser/session/domain tests remain
- reduced `smoke-sector-feature-contributions.mjs` to executable type/condition/browser contracts instead of regex assertions over production source files

Mixed runtime/security checks such as capability-surface consistency remain until their source assertions can be separated without losing hard-boundary coverage.

### Slice 10C — Dead UI/CSS cleanup

Use Knip, design audit, import ownership and direct usage review together. Do not delete a component/style solely because its name sounds old.

Primary candidates include obsolete drawer/editor selectors, migration-only CSS guards and components superseded by canonical Workspaces.

### Slice 10D — Documentation reset

Completed:

- `AGENTS.md` now describes the completed Stage 9 static contribution model and Appearance v2.
- `docs/UI_RULES.md` was rewritten as current cross-surface UI guidance with Page/Workspace/Operation/Projection rules.
- `docs/desktop-frontend-architecture.md` was rewritten around the live App → View → Frame → Router/controller composition.
- `docs/design-system/README.md` was rewritten around the live token/appearance/component/layout tree.
- `docs/design-system/DESKTOP_UI_MIGRATION.md` was removed instead of being kept as a competing historical specification.

Historical migration evidence remains available in Git history; it is no longer active repository guidance.

## Non-goals

Stage 10 does not change business/domain semantics, database schema, Finance/Market/Messages lifetime ownership or introduce the Dashboard/operation registries deliberately deferred in Stage 9.
