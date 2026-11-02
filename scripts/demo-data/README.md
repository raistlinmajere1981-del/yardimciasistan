# Demo data generator (2.1.0)

Creates three synthetic Yardımcı Asistan backup packages from the **current**
`apps/desktop-app/db/schema.sql`, then verifies them through the real desktop
read paths.

Everything produced here is demo data. It contains no real customer, sale,
credential, `sync_secret`, `web_module_url` or Android token.

## Output

Running the generator writes only under `artifacts/demo-data/`:

| File | Business profile | Content |
| --- | --- | --- |
| `yardimci-asistan-demo-2.1.0-a-pension-restaurant.zip` | `pension_restaurant` | Rooms, stays, an open folio, table orders, QR menu, reservations, tasks, requests and Finance projections |
| `yardimci-asistan-demo-2.1.0-b-market.zip` | `market` | Catalog, barcode stock, suppliers, a purchase order, paid sales, one full refund, benefit rules and points |
| `yardimci-asistan-demo-2.1.0-c-market-dealer.zip` | `market` + wholesale/credit/online sales | Dealer profiles, dealer prices, web-linked dealer accounts, dealer orders, online catalog publication, customer credit and benefit rules |
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

Prerequisites:

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

The desktop app restores a **folder**, not the ZIP itself. The unzipped folder
must sit directly under the app's backup root:

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

Do not rename `backup.json` or `yardimci-asistan.sqlite`, and do not point the
app at the `.zip` file. Restoring replaces local data, so use a test machine or
a throwaway profile if you need the current data untouched.

## Intentional limitations

- **No 180/360 panorama imagery.** No genuine equirectangular local source
  file was available, so the generator does not pretend that its abstract
  gradient artwork is a panorama. Product images are original synthetic PNGs
  generated without external downloads; no real brand photography is used.
- Images are decorative placeholders, not photographs of the named dishes or
  products.
- Names, phones (`+90 555 ...`), e-mails (`*.example.test`), prices, orders,
  payments and tax values are synthetic.
- The dealer pack deliberately includes inactive dealers and a cancelled
  order; the market pack deliberately includes one fully refunded sale. These
  are there to exercise real read paths, not to imply real commerce.
