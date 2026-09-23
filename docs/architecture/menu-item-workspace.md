# Menu Item Workspace — Stage 8C

Status: implementation on `refactor/menu-item-workspace-v2`; local verification is required before closure.

## Ownership

- The Menu page is the operational lens for category filtering, category maintenance, item discovery, stock-image import and new-item entry.
- Existing menu items open the canonical Menu Item Workspace.
- Menu Item remains distinct from Catalog Product. This stage does not merge Market/Product persistence or stock operations.
- Category maintenance stays on the Menu page because it has one bounded editor family and no competing entity editor.

## Workspace modes

```text
Bilgiler | Stok (capability-gated) | Görsel
```

Draft state is local to the entity workspace. Changing tabs or centered/full-canvas presentation keeps the same draft. Dirty or saving state blocks close and entity replacement.

The new-item flow reuses the same field components and canonical form conversion. After the first save, the dialog unmounts before the created entity opens in Menu Item Workspace, preserving the single-modal contract.

## Operations

The menu controller exposes domain-oriented item operations:

- `saveItemForm(form)`
- `deleteItemById(itemId)`

Existing preload, IPC and SQLite contracts are unchanged.

## Verification

Run locally:

```fish
npm run typecheck
npm run smoke:workspace-platform
npm run smoke:desktop-renderer
npm run lint:strict
npm run architecture:audit
npm run design:audit:strict
git diff --check
```
