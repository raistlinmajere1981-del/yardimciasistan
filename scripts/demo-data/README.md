# Demo data generator (current product version)

Creates three default synthetic Yardımcı Asistan backup packages and an opt-in
Teknikel catalog demo from the **current**
`apps/desktop-app/db/schema.sql`, then verifies them through the real desktop
read paths.

Everything produced here is for demonstration. Teknikel D retains real source
product names/SKUs, gross TRY prices and catalog photography. Packages contain
no real customer, sale,
credential, `sync_secret`, `web_module_url` or Android token.

## Licensed QR menu photographs

The Pansiyon + Restoran demo now bundles 14 real, locally stored sample food photographs
instead of the old synthetic palette tiles. Every product thumbnail is tied to a
verified SHA-256, Commons source, author, license and image-modification note in
`scripts/demo-data/assets/menu-products/MENU_IMAGE_MANIFEST.json`. The downloadable
backup also includes `assets/MENU_IMAGE_ATTRIBUTION.json` and the separate
`qr-menu-images/` files; no image-host connection is required after installation.
These photographs are **representative demo images**, not real photographs of
Gündoğdu or any restaurant dishes. The associated Creative Commons/share-alike
terms and attribution must be respected when displaying or redistributing them.

Generating or uploading an updated ZIP never overwrites existing businesses or
site publications. To replace previously published placeholder menu images,
reimport the sample into a disposable desktop test profile and republish its
QR menu (or update each product photo through the desktop UI).

## Output

Running the generator writes only under `artifacts/demo-data/`:

| File | Business profile | Content |
| --- | --- | --- |
| `yardimci-asistan-demo-<version>-a-pension-restaurant.zip` | `pension_restaurant` | Rooms, stays, an open folio, table orders, QR menu, reservations, tasks, requests, Finance projections and a four-piece media set (cover, photo, 180° and 360° panorama) for every room and table |
| `yardimci-asistan-demo-<version>-b-market.zip` | `market` | Catalog, barcode stock, suppliers, a purchase order, paid sales, one full refund, benefit rules and points |
| `yardimci-asistan-demo-<version>-c-market-dealer.zip` | `market` + wholesale/credit/online sales | Dealer profiles, dealer prices, web-linked dealer accounts, dealer orders, online catalog publication, customer credit and benefit rules |
| `yardimci-asistan-demo-<version>-d-teknikel.zip` (opt-in) | `market` + wholesale/credit/online sales | 179 source products, 25 categories, 68 original image files, 30 synthetic customers, 28 curated publications, four demo orders, draft purchase and customer credit; no linked web accounts |
| `demo-data-manifest.json` | — | SHA-256 hashes, sizes, expected counts, read checks and limitations |

Each ZIP contains exactly one backup folder:

```
yardimci-asistan-demo-<pack>/
  backup.json
  yardimci-asistan.sqlite
  assets/
  qr-menu-images/        # may be absent/empty when the pack has no QR menu
```

The folder is a valid `yardimci-asistan-backup-v2` package. `backup.json` uses
the same manifest shape the desktop backup reader validates:
`format`, `createdAt`, `kind`, `databaseFile`, `qrMenuImages`
(`directory`, `count`, `files`) and `assets` (`directory`, `fileCount`).

## Commands

From the repository root:

```bash
# Build the three packages and the overall manifest.
node scripts/demo-data/generate-demo-data.mjs

# Useful during iteration:
node scripts/demo-data/generate-demo-data.mjs --only a
node scripts/demo-data/generate-demo-data.mjs --output /tmp/opencode/demo-out
# Optional: freeze the calendar day for a reproducible dated fixture.
YA_DEMO_DATE=2026-11-02 node scripts/demo-data/generate-demo-data.mjs

# Verify existing ZIPs from scratch: hash, ZIP layout, backup.json,
# SQLite quick_check, foreign keys, secret scan and read paths.
node scripts/demo-data/verify-demo-data.mjs

# Targeted node:test run; generates into an isolated temporary directory.
node --test scripts/demo-data/demo-data.test.mjs
```

## Optional Teknikel pack D

**Teslimat güvenliği:** Teknikel ve genel bayi demo paketleri işletmeden teslim ile başlar. Kargo ile gönderim, doğrulanmış Aras Kargo hesap bilgileri içermedikleri için varsayılan olarak kapalıdır. Bu sayede demo geri yüklendikten sonra ilgisiz ayarlar kaydedilebilir; kargo servisi ancak gerçek test hesabı yapılandırılıp bağlantı sınaması geçtiğinde etkinleştirilir.

The default remains **A, B, C** and does not read Teknikel sources. Explicitly
select D (or `d-teknikel`) to generate the new ZIP:

```bash
node scripts/demo-data/generate-demo-data.mjs --only d
node scripts/demo-data/verify-demo-data.mjs

# Local source overrides; no catalog/media downloads occur.
node scripts/demo-data/generate-demo-data.mjs --only d \
  --teknikel-source-root /path/to/teknikel_catalog_prep \
  --teknikel-customers /path/to/teknikel-demo-musteriler-30.csv

# Targeted integration tests, including desktop ZIP import and image tampering.
node --test scripts/demo-data/teknikel.test.mjs
```

The default catalog root is `/home/raistlin/teknikel_catalog_prep`, containing
`import-review-catalog.json`, `image-manifest.json` and `images-original/`.
Override it with `--teknikel-source-root` or `YA_TEKNIKEL_SOURCE_ROOT`. The default
customer file is
`/home/raistlin/YardimciWorkspace/teknikel_web/data-import/teknikel-demo-musteriler-30.csv`;
override it with `--teknikel-customers` or `YA_TEKNIKEL_CUSTOMERS`. CLI paths take
precedence over environment paths. Missing files or invalid source/image hashes
fail before the output manifest/work directory is changed. Source-dependent
tests skip when these local inputs are unavailable; run them with the inputs
present for full integration coverage.

The ZIP contains `yardimci-asistan-demo-d-teknikel/` with canonical backup-v2
files. `assets/TEKNIKEL_SOURCE_MANIFEST.json` records source JSON/CSV SHA-256
digests, every image's source URL, SKU, destination, hash and MIME format, and
the demo/source distinction. Original images are copied only into generated,
Git-ignored artifacts, never into tracked source assets. The overall
`demo-data-manifest.json` hashes the ZIP and database. Each generation replaces
that manifest with **the selected packs only**; it does not list older ZIPs
left in the output directory. Use `--only a,b,c,d` for a manifest covering all four.

- All **179 original names/SKUs** and source gross TRY prices are retained. All
  products are active and browsable through desktop pagination. There are 24
  source categories plus **Diğer**. Only the 28 already categorized products
  are marked published; the other 151 remain desktop-only for category review.
- The **68 original files** cover 35 products, including multiple-image
  galleries. They contain **67 distinct SHA-256 values**: two Kalisto board
  filenames have identical bytes. Both files and their metadata are preserved;
  the canonical image reader deduplicates gallery contents by hash.
- **Photography comes from Teknikel's public catalog. It is neither synthetic
  nor open-licensed.** Original owners retain rights. Source/license fields,
  the packaged source manifest and the business profile state this provenance.
  Media upload/acknowledgement still belongs to the application's existing
  publication owner; generating a ZIP performs no upload/publication.
- Stock is a deterministic demo opening quantity; purchase cost is 60% of the
  source gross price and dealer A/B prices are 90%/85%, rounded to kuruş.
  Descriptions, stock, costs, dealer prices and **placeholder 20% tax** are
  explicitly synthetic, not validated commercial terms. Source gross prices
  are snapshots, not live offers or tax-exclusive values.
- The BOM/semicolon CSV supplies **30 synthetic customers**: 10 retail, 10
  inactive dealers, 10 active dealers. Each dealer group has five A and five B
  profiles. Names, phones, companies and addresses are retained; reserved
  `example.com` e-mails are normalized to `example.test` for the canonical demo
  scanner. Four clearly labelled desktop DEMO orders use real product IDs and
  placed/confirmed/fulfilled/cancelled statuses with day-relative dates and
  retail/A/B prices. A dummy supplier, draft purchase, credit sale and partial
  collection demonstrate purchase/credit read paths.
- No linked web accounts, invitations, credentials or message/email sends are
  created. Schema-generated customer access rows stay unbound; dealer portal
  and dealer applications are off. Capabilities enable desktop wholesale,
  customer credit and online sales. Sync credentials/URL remain empty and
  automatic sync is off.
- The integration test imports the generated ZIP through the real desktop
  backup import IPC into temporary paths, checks duplicate protection and
  SQLite/assets, and never restores or opens live application SQLite.

Site copying, download links and deployment are a separate step.

## Prerequisites

- Node with `node:sqlite` (`DatabaseSync`).
- `zip` and `unzip` on `PATH`.
- Compiled SDK artifacts: `packages/shared/dist` and
  `apps/desktop-app/dist-electron`. If they are stale, run
  `npm run build:packages` and
  `npm run build -w @yardimci-asistan/desktop-app` first.

The default fixture date is the current **Europe/Istanbul calendar day**, and
its day-relative sales/reservations keep dashboard and 7-day reporting views
populated when the ZIP is regenerated later. Set `YA_DEMO_DATE=YYYY-MM-DD`
for a fixed calendar date in repeatable tests. A ZIP already published does
not update itself; regenerate and re-verify the packages for a later release.

The generator is the only writer. It does not touch `data/`, `backup/`, the
sync coordinator, hosting transport, the landing site or the web template.

## What is verified

For every package the generator and the standalone verifier check:

- the ZIP contains only the expected top-level folder and no `..` entries;
- `backup.json` matches the backup v2 contract;
- `PRAGMA quick_check` returns `ok`;
- `PRAGMA foreign_key_check` returns no rows;
- the secret scan finds no credential-like column values, private-key markers,
  bearer tokens or non-`example.test` e-mail addresses;
- `settings.web_module_url`, `settings.sync_secret` and the app-password
  verifier stay empty; automatic sync stays off;
- every demo room and table exposes exactly four pending media kinds — `cover`,
  `photo`, `panorama_180` and `panorama_360` — with JPEG dimensions and hashes
  matching the packaged files;
- the combined `assets/MEDIA_ATTRIBUTION.txt` names every author, license,
  source URL and modification used by the packaged media;
- profile capability rows are present and consistent with
  `packages/shared`;
- real read paths return the expected data, for example
  `createDesktopDashboardData`, `getPublishedMenu`, `listTableOrders`,
  `listCatalogProducts`, `getCommerceStoreSnapshot`,
  `listCommercePurchaseOrders`, `listCommerceOrders`, `getDealerWebAccess`,
  `createDealerAccessProjection`, `resolveCommerceProductPrice`,
  `loadCommerceBenefitsRules`, `readCommercePointBalance`,
  `listMarketSaleHistory`, `getFullRefundMarketSalePreview` and
  `DesktopRoomFolioService.getData`.

The invoice/finance rows are written through the production
`synchronizeFinanceSourceInTransaction`, benefit rules through the production
validator, and table-order tender evidence through the same canonical snapshot
contract the app reads.

## Restore on Windows

Current desktop builds offer **Yedekler → ZIP içe aktar**: select the ZIP to
add it to the backup list, then explicitly restore the imported backup. Import
alone does not replace local data.

For folder-based restore, the unzipped folder must sit directly under the
app's backup root:

```
<backup root>\
  yardimci-asistan-demo-a-pension-restaurant\   <- this folder
    backup.json
    yardimci-asistan.sqlite
    assets\
    qr-menu-images\
```

Steps:

1. Copy the ZIP to the Windows machine.
2. Extract it. Do **not** double-nest it; the path above must contain
   `backup.json` directly inside the demo folder.
3. Place that folder in the backup root the app uses:
   - packaged app: `<userData>\backups`;
   - development checkout: the repository `backup/` directory.
   The app's **Yedekler / Backups** screen lists the root it actually uses.
4. Open the app, refresh the backup list, select the demo folder and restore.
5. The app takes a safety backup of the current data first. This is expected.

Do not rename `backup.json` or `yardimci-asistan.sqlite`. Use ZIP import for an
archive or folder-based restore for an extracted backup. Restoring replaces
local data, so use a test machine or a throwaway profile if you need the current
data untouched.

## Intentional limitations

- **Open-licensed placeholder media.** Every demo room and table gets a real
  JPEG cover and detail photo from Wikimedia Commons (CC BY 4.0, CC BY 2.0,
  CC0 1.0 or public domain) plus representative CC BY 4.0 180° and 360°
  panoramas. The same source image may be reused across records; the 180° files
  are centre crops of the matching 360° sources. Sources, authors, licenses,
  changes and local file paths are listed in `ASSET_ATTRIBUTION.md` and in the
  packaged `assets/MEDIA_ATTRIBUTION.txt`. Product images are still original
  synthetic PNGs in A-C. Optional D uses the attributed Teknikel source photos
  described above.
- A-C images are decorative placeholders, not photographs of the named dishes,
  rooms or products.
- A-C names and prices are synthetic. All packs use synthetic customer contacts,
  orders, payments and tax values; D retains source product identities and gross
  price snapshots as described above.
- The dealer pack deliberately includes inactive dealers and a cancelled
  order; the market pack deliberately includes one fully refunded sale. These
  are there to exercise real read paths, not to imply real commerce.
