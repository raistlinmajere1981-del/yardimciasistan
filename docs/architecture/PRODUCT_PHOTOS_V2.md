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

`product-media-publication.ts` prepares the same canonical originals for retail
and dealer publication through the existing `product-media.php` uploader. The
existing `catalog_product_media_publications` table stores acknowledgements by
target, product and SHA256; there is no channel copy. Concurrent transfers share
the same upload, completed transfers survive restart, and retries upload only
unacknowledged hashes. Channel changes never delete these reusable receipts.

Preparation checks canonical product paths without symlinks, the 5 MB byte limit,
decoded JPEG/PNG/WebP content, MIME/extension agreement, pixel bounds and SHA256.
The uploader sends those exact verified bytes without reopening their path.
Receipts must identify the configured public HTTPS origin and exact module path,
product, hash and image extension. Cached receipts are validated again on read.
The retail resolver projects acknowledged URLs in original order; the first is
always the cover. Missing/corrupt originals, including secondary photos, fail the
whole preparation and leave the existing job retryable. Safe public source URLs
are fallback only for products with no original or legacy local cover reference.
The default synchronous projection does not guess public URLs for local files.

Preparation runs inside the existing `online_catalog` / `dealer_access` outbox
lifecycle before freezing, with the expected revision preserved. Photo mutations
use existing catalog triggers to invalidate both applicable jobs. A mutation,
capability withdrawal, target change or maintenance suspension during preparation
prevents the superseded body from being sent. Frozen retries reuse their exact
body without reading the archive again. Online Sales OFF uploads nothing; retail
prepares only explicitly published, active, nondeleted products. Local paths,
bytes and private URLs never enter the public projection. The separate Teknikel
website and Dealer Android consumers have independent owners.

## Focused verification

Registry checks: `product-photos`, `product-photos-ui`, `commerce-product-media`,
`data-transfer`, `commerce-online-catalog`, `commerce-product-media-publication`, `commerce-online-catalog-ui`, and
`web-storefront`. Native photo checks use real Electron, SQLite and isolated image
files. Browser checks exercise the real ProductWorkspace/storefront with bounded
fixture transport; they do not prove native file dialogs or live media uploads.
The media publication smoke uses real SQLite/reopen and the outbox with a bounded
upload adapter, plus a multipart writer test with fixture HTTP streams for verified byte identity. It
covers channel cache reuse, gallery ordering/limits, partial and frozen retries,
invalid archives/URLs and revision/target/capability fencing; it does not contact
a live hosting service.

In an environment that cannot start Electron, direct
`node scripts/smoke-product-photos.mjs --node-codec` and
`node scripts/smoke-data-transfer.mjs --node-codec` provide bounded service
evidence using a real NAPI decoder through a test adapter. Their explicit output
does not substitute for Electron's encoder, preload or Chromium evidence. The
default registry checks still require Electron. External pilot files are opt-in
via `--external-pilots`; ordinary fixtures never inspect another checkout or a
running crawler's files.
