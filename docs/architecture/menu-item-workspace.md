# Menu channel in Product Workspace

Status: current-schema consolidation under [D-011](DOMAIN_DECISIONS_V1.md#d-011--menu-and-online-sales-share-one-canonical-catalog-product).
This supersedes the Stage 8C presentation/persistence contract; there is no Menu Item entity editor.

## Ownership

- Menu remains a Page for category maintenance, product discovery, linking/creation,
  ordering, QR preview and stock-image import.
- Existing entries open Product Workspace using canonical `product_id` and contextual
  `menuEntryId`. Product details, images and inventory use the same shared controls as Commerce.
- `MenuProductEntryFields` owns only the channel relation. Its separate explicit save/reset
  lifecycle participates in the workspace dirty/busy guard; it does not own Product identity.
- New Product creation reuses `ProductFormFields`; the backend commits Product + Menu entry
  atomically. The “Yeni ürün” dialog prefills the selected Menu category and exposes no
  Product source/link selector or internal identity terminology. Availability remains editable
  in Product Workspace; new entries are available by default. Price validation is silent until
  the sale price is touched or save is attempted.
  Existing Product linking remains supported by the domain operation without duplicate rows;
  it is not part of this dialog, and Menu currently has no separate unlinked-product picker.
  After save, the
  create dialog unmounts before the Product Workspace opens.
- Restaurant contexts hide unrelated retail/purchasing fields, not canonical data or domain
  authority. CATALOG/SALES/INVENTORY dependencies do not enable Restaurant Sales navigation.

## Persistence and operations

- `saveMenuProductEntry` / `menu:saveEntry` create or update `menu_product_entries`.
- `deleteMenuProductEntry` / `menu:removeEntry` unlink Menu only.
- Nullable `price_override` falls back to canonical `sale_price` in the backend.
- Category/order/availability/featured/allergens/tags/hide policy/consumption belong to Menu.
- Stock counts and consumption delegate to canonical inventory. Table/Folio consumption and
  location are frozen with monetary/name snapshots; transfer never consumes twice.
- Images are read from the canonical immutable Product archive, not duplicated in a Menu field.
- Menu order remains category-local drag/keyboard reorder; inactive Products remain manageable
  in the admin projection but cannot be sold or publicly published.
- Public QR `id` remains the Menu entry identity. Android current contracts distinguish
  `product_id` and `menu_entry_id`; no historical conversion or compatibility API is provided.

## Verification

```bash
npm run verify:domain -- product-identity
npm run verify:check -- desktop-renderer
npm run verify:check -- build-android-debug
```
