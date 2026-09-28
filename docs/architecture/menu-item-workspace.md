# Menu Item Workspace — Stage 8C

Status: implementation on `refactor/menu-item-workspace-v2`; local verification is required before closure.

## Ownership

- The Menu page is the operational lens for category filtering, category maintenance, item discovery, stock-image import and new-item entry.
- Existing menu items open the canonical Menu Item Workspace.
- Menu Item remains distinct from Catalog Product. This stage does not merge Market/Product persistence or stock operations.
- Category maintenance stays on the Menu page because it has one bounded editor family and no competing entity editor.

## Workspace form

Existing menu items use the same canonical one-page form composition as the new-item dialog:

```text
Ürün bilgileri + görsel
Stok (capability-gated)
```

There are no separate Bilgiler / Stok / Görsel tabs. The entire item draft stays mounted in one workspace, so users can edit product details, image and stock without changing modes. Centered/full-canvas presentation preserves the same draft. Dirty or saving state blocks close and entity replacement.

The one-page editor uses an asymmetric 12-column layout at workspace widths: core identity fields form a compact top row, description owns the wider reading area, image controls occupy the right rail, and stock metrics share one operational row. Container queries collapse the same canonical form cleanly inside the narrower new-item dialog without duplicating form markup.

The new-item flow reuses the same field components and canonical form conversion. After the first save, the dialog unmounts before the created entity opens in Menu Item Workspace, preserving the single-modal contract.

Stock tracking is an explicit form state rather than an implicit “quantity is blank” convention. New items start with stock tracking enabled and a zero quantity; disabling tracking collapses the stock panel and persists the canonical untracked state with a null stock quantity.

Create and edit flows both keep the current image preview at the top-right of the product-information panel with adjacent file-select and clear actions. Image preparation and persistence still use the existing canonical menu image field.

Menu order is owned by the menu lists, not by numeric form fields. Categories are drag-reordered globally. Products are drag-reordered within their own category; the “Tüm kategoriler” view groups products by category and still allows same-category drag ordering without permitting accidental cross-category moves. Reorder persistence renumbers the affected records atomically in 10-step positions and marks them pending for the existing menu sync path.

## Operations

The menu controller exposes domain-oriented item operations:

- `saveItemForm(form)`
- `deleteItemById(itemId)`

Existing preload, IPC and SQLite contracts are unchanged.

## Verification

Run locally:

```fish
npm run verify:check -- workspace-platform
npm run verify:domain -- commerce
npm run verify:pre-main
```
