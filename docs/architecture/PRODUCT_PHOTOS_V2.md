# Canonical product photos

`product-photo-store.ts` owns ordered photo operations on the existing
`catalog_products.image_original_assets_json` archive. There is no second media
table or product editor. The first original is the cover; `image_asset_path`
remains the normalized JPEG display cover used by existing consumers and Android
Companion. Legacy cover-only rows are read as a virtual original without a
startup backfill. Their first mutation persists that identity.

Photo add appends and deduplicates original bytes by SHA256. JPEG, PNG and WebP
are decoded before acceptance, bounded to 5 MB and 25 million pixels per file,
with at most 12 unique originals per product. Archive paths belong to the product
and cannot contain symlinks. IPC accepts bytes as bounded data URLs and opaque
hash identities, never a renderer-supplied filesystem path. Mutations compare a
photo revision, use a product transaction, update `updated_at`, and retain the
existing schema-triggered publication intents. The commerce mutation callback
invalidates the current companion projection and wakes existing publication work.
Asynchronous additions recheck lock, active database and persisted capabilities
after preparation. CATALOG gates reads; CATALOG and ONLINE_SALES gate mutations.

Cover changes regenerate the normalized display asset from the selected original.
Removing a cover promotes the next original; removing the last clears the cover.
Removed/replaced files remain immutable on disk until the existing safe startup
garbage collector finds no references. SQL rollback never removes referenced
files. Original files and order survive ZIP export/import; CSV/XLSX retain a
single primary image. ZIP imports reject more than 12 unique photos per product.

ProductWorkspace shows the gallery for saved products while Online Sales is on.
Photo operations save immediately and preserve the metadata draft and its dirty
baseline. New products use the single picker until their first save. With Online
Sales off, the existing cover editor stays available; replacing/removing that
cover preserves the remaining originals. Disabling the capability itself never
changes stored photos. Photo-only revision conflicts do not silently replay.

## Retail publication integration

`PublishedCommerceProduct.imageUrls` and transport `image_urls` contain ordered
public HTTPS URLs, with the first equal to `image_url`. PHP allows at most 12,
deduplicates while preserving order, and rejects invalid URLs or inconsistent
covers. The storefront offers an expandable detail gallery with labelled native
thumbnail buttons, arrow/Home/End keyboard navigation and failed-image fallback.
List cards continue to use the primary cover.

Local archive files do **not** have public URLs in this branch. The default retail
projection safely uses the existing public `image_source_url`, or an empty image
list when no such URL is available. Local paths, bytes and private URLs never enter
the retail payload.

After the dealer media branch is committed and merged by its owner, wire its
existing `dealer-product-media-publication.ts` / `dealer-product-media-store.ts`
and `product-media.php` upload/acknowledgement pipeline to the optional
`RetailProductImageResolver` argument of `createCommerceOnlineCatalog`. Resolve
acknowledged URLs using product identity and the ordered original hashes. Preserve
an empty first slot while the cover upload is pending; the retail adapter then
uses the safe source fallback instead of promoting a secondary photo. Run media
preparation inside the existing publication preparation lifecycle, before freezing
the retail payload, with the expected outbox revision intact. Do not add another
uploader or direct publication path. The resolver is an integration seam, not a
claim that local-to-HTTPS publication is complete.

The dealer branch's shared type/transfer edits need a normal merge review against
the small `commerce.ts`, `hosting-transport.ts` and transfer changes here. No merge
is performed by this implementation. The separate Teknikel website and Dealer
Android require their own later consumers; neither is changed here.

## Focused verification

Registry checks: `product-photos`, `product-photos-ui`, `commerce-product-media`,
`data-transfer`, `commerce-online-catalog`, `commerce-online-catalog-ui`, and
`web-storefront`. Native photo checks use real Electron, SQLite and isolated image
files. Browser checks exercise the real ProductWorkspace/storefront with bounded
fixture transport; they do not prove native file dialogs or live media uploads.

In an environment that cannot start Electron, direct
`node scripts/smoke-product-photos.mjs --node-codec` and
`node scripts/smoke-data-transfer.mjs --node-codec` provide bounded service
evidence using a real NAPI decoder through a test adapter. Their explicit output
does not substitute for Electron's encoder, preload or Chromium evidence. The
default registry checks still require Electron. External pilot files are opt-in
via `--external-pilots`; ordinary fixtures never inspect another checkout or a
running crawler's files.
