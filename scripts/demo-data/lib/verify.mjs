import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { FIXED_NOW, countFiles, sha256File } from "./util.mjs";
import { inspectDatabase } from "./integrity.mjs";
import { jpegSize } from "./panorama-media.mjs";

const require = createRequire(import.meta.url);
const shared = require("../../../packages/shared/dist/index.js");
const electron = (name) => require(`../../../apps/desktop-app/dist-electron/${name}.js`);

const { createDesktopDashboardData } = electron("desktop-dashboard-service");
const { getPublishedMenu } = electron("database/menu-store");
const { listTableOrders } = electron("database/table-order-store");
const { listCatalogProducts, getCommerceStoreSnapshot } = electron("commerce-store");
const { listCommercePurchaseOrders, getCommercePurchaseOrder } = electron("commerce-purchase-store");
const { listCommerceOrders, getCommerceOrder } = electron("commerce-order-store");
const { getCustomerCreditAccount } = electron("customer-credit-runtime");
const { getDealerWebAccess, createDealerAccessProjection } = electron("dealer-web-access-store");
const { resolveCommerceProductPrice } = electron("commerce-pricing-service");
const { loadCommerceBenefitsRules } = electron("commerce-benefits-rules");
const { readCommercePointBalance } = electron("commerce-benefits-points");
const { listMarketSaleHistory, getFullRefundMarketSalePreview } = electron("market-sale-full-refund");
const { DesktopRoomFolioService } = electron("room-folio");
const { readProductImageAsset } = electron("product-image-reader");
const { listRoomMedia, listPendingRoomMedia } = electron("room-media-service");
const { listTableMedia, listPendingTableMedia } = electron("table-media-service");

const REFUND_AUTHORITY = {
  actor: { id: "demo-data-verifier", role: "desktop_owner", assertAuthorized() {} }
};

function businessIdOf(db) {
  return String(db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get()?.id ?? "");
}

function publishCheckList() {
  const checks = [];
  const check = (name, read, expected) => {
    try {
      const actual = read();
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      checks.push({ name, pass, expected, actual });
    } catch (error) {
      checks.push({ name, pass: false, expected, error: error instanceof Error ? error.message : String(error) });
    }
  };
  return { checks, check };
}

function checkPanoramaMedia({ folderPath, expected, check }) {
  const media = expected?.media;
  if (!media) return;

  const rootFor = (scope) => (scope === "room" ? "room-media" : "table-media");
  const listFor = (scope) => (scope === "room" ? listRoomMedia : listTableMedia);
  const pendingFor = (scope) => (scope === "room" ? listPendingRoomMedia : listPendingTableMedia);
  const filesFor = (scope) => media.files.filter((item) => item.scope === scope);

  const pending = {
    room: pendingFor("room")(folderPath),
    table: pendingFor("table")(folderPath)
  };

  check("panorama.roomMedia.count", () => pending.room.length, filesFor("room").length);
  check("panorama.tableMedia.count", () => pending.table.length, filesFor("table").length);
  check("panorama.roomMedia.pendingOnly", () => pending.room.every((item) => item.remoteUrl === ""), true);
  check("panorama.tableMedia.pendingOnly", () => pending.table.every((item) => item.remoteUrl === ""), true);
  check("panorama.counts.360", () => media.files.filter((item) => item.kind === "panorama_360").length, media.counts.roomMedia360 + media.counts.tableMedia360);
  check("panorama.counts.180", () => media.files.filter((item) => item.kind === "panorama_180").length, media.counts.roomMedia180 + media.counts.tableMedia180);

  for (const target of media.targets) {
    check(`${target.scope}Media.list.${target.resourceId}`, () => {
      const items = listFor(target.scope)(folderPath, target.resourceId);
      return items.map((item) => `${item.id}:${item.kind}:${item.mimeType}:${item.remoteUrl === "" ? "pending" : "published"}`).sort();
    }, target.mediaIds.map((id) => {
      const record = media.files.find((item) => item.id === id);
      return `${id}:${record.kind}:image/jpeg:pending`;
    }).sort());
  }

  for (const manifestPath of media.manifests) {
    const scope = manifestPath.includes("room-media") ? "room" : "table";
    const idField = scope === "room" ? "roomId" : "tableId";
    const absolutePath = path.join(folderPath, manifestPath);
    check(`media.manifest.${scope}`, () => {
      const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
      return {
        version: parsed.version,
        count: Array.isArray(parsed.media) ? parsed.media.length : -1,
        idsMatch: Array.isArray(parsed.media)
          && parsed.media.map((item) => item.id).sort().join(",") === filesFor(scope).map((item) => item.id).sort().join(","),
        fieldsValid: Array.isArray(parsed.media) && parsed.media.every((item) => (
          typeof item[idField] === "string"
          && item.mimeType === "image/jpeg"
          && item.remoteUrl === ""
          && /^[a-f0-9]{64}$/.test(String(item.contentHash))
          && item.storedPath === `files/${item[idField]}/${item.id}.jpg`
        ))
      };
    }, { version: 1, count: filesFor(scope).length, idsMatch: true, fieldsValid: true });
  }

  for (const record of media.files) {
    const root = path.join(folderPath, "assets", rootFor(record.scope));
    const absolutePath = path.join(root, record.storedPath);
    const listed = listFor(record.scope)(folderPath, record.resourceId).find((item) => item.id === record.id);
    const pendingItem = pending[record.scope].find((item) => item.id === record.id);

    check(`media.${record.id}.listed`, () => listed
      ? { kind: listed.kind, mimeType: listed.mimeType, sizeBytes: listed.sizeBytes, sortOrder: listed.sortOrder, remoteUrl: listed.remoteUrl, title: listed.title }
      : null, {
      kind: record.kind,
      mimeType: "image/jpeg",
      sizeBytes: record.sizeBytes,
      sortOrder: record.sortOrder,
      remoteUrl: "",
      title: record.title
    });
    check(`media.${record.id}.titleAttribution`, () => Boolean(listed
      && listed.title.includes("CC BY 4.0")
      && listed.title.includes(record.author)
      && listed.title.includes("işletmenin kendi fotoğrafı değildir")), true);
    check(`media.${record.id}.storedFile`, () => fs.existsSync(absolutePath), true);
    check(`media.${record.id}.sha256`, () => (fs.existsSync(absolutePath) ? sha256File(absolutePath) : ""), record.contentHash);
    check(`media.${record.id}.pendingStoredPath`, () => pendingItem?.storedPath ?? "", record.storedPath);
    check(`media.${record.id}.pendingContentHash`, () => pendingItem?.contentHash ?? "", record.contentHash);
    check(`media.${record.id}.jpegDimensions`, () => {
      if (!fs.existsSync(absolutePath)) return null;
      const size = jpegSize(fs.readFileSync(absolutePath));
      return {
        width: size.width,
        height: size.height,
        ratio: Number((size.width / size.height).toFixed(3)),
        expectedRatio: record.kind === "panorama_360" ? 2 : 1
      };
    }, {
      width: record.width,
      height: record.height,
      ratio: record.kind === "panorama_360" ? 2 : 1,
      expectedRatio: record.kind === "panorama_360" ? 2 : 1
    });
  }

  const attributionPath = path.join(folderPath, media.attributionPath);
  check("panorama.attribution.exists", () => fs.existsSync(attributionPath), true);
  check("panorama.attribution.sha256", () => (fs.existsSync(attributionPath) ? sha256File(attributionPath) : ""), media.attributionSha256);
  check("panorama.attribution.content", () => {
    if (!fs.existsSync(attributionPath)) return {};
    const text = fs.readFileSync(attributionPath, "utf8");
    const normalized = text.replace(/\s+/g, " ");
    return {
      license: text.includes("CC BY 4.0"),
      ownerDisclaimer: normalized.includes("demo işletmesinin kendi çekimi değildir"),
      cropNotice: text.includes("kırp"),
      authors: [...new Set(media.files.map((item) => item.author))].every((author) => text.includes(author)),
      sources: [...new Set(media.files.map((item) => item.sourceUrl))].every((url) => text.includes(url))
    };
  }, { license: true, ownerDisclaimer: true, cropNotice: true, authors: true, sources: true });
}

function checkPensionRestaurant({ db, dbPath, folderPath, pack }) {
  const { checks, check } = publishCheckList();
  const dashboard = createDesktopDashboardData(db, dbPath, folderPath);
  const menu = getPublishedMenu(db, true);
  const store = getCommerceStoreSnapshot(dbPath);
  const catalog = listCatalogProducts(dbPath, { limit: 100 });
  const tableOrders = listTableOrders(db);
  const folio = new DesktopRoomFolioService(dbPath).getData().folios.find((item) => item.id === "folio_pr_current");
  const expected = pack.expected.readChecks;

  check("dashboard.rooms", () => dashboard.rooms.length, expected.dashboardRooms);
  check("dashboard.tables", () => dashboard.tables.length, expected.dashboardTables);
  check("dashboard.reservations", () => dashboard.reservations.length, expected.dashboardReservations);
  check("dashboard.customers", () => dashboard.customers.length, expected.customers);
  check("dashboard.paymentWaitingTableOrders", () => dashboard.paymentWaitingTableOrders.length, 1);
  check("menu.items", () => menu.items.length, expected.menuItems);
  check("tableOrders", () => tableOrders.length, expected.tableOrders);
  check("catalog.products", () => catalog.total, expected.menuItems);
  check("store.products", () => store.products.length, expected.menuItems);
  check("folio.open", () => folio?.status ?? "", "open");
  check("folio.remainingMinor", () => Number(folio?.remainingMinor ?? -1), 925000 + 64000 + 11000 + 12000 - 400000);
  check("folio.items", () => folio?.items.length ?? 0, 3);
  check("folio.payments", () => folio?.payments.length ?? 0, 1);
  checkPanoramaMedia({ folderPath, expected: pack.expected, check });
  return checks;
}

function checkMarket({ db, dbPath, pack }) {
  const { checks, check } = publishCheckList();
  const businessId = businessIdOf(db);
  const store = getCommerceStoreSnapshot(dbPath);
  const catalog = listCatalogProducts(dbPath, { limit: 100 });
  const purchases = listCommercePurchaseOrders(dbPath);
  const orders = listCommerceOrders(dbPath);
  const history = listMarketSaleHistory(dbPath, { limit: 50 }, REFUND_AUTHORITY);
  const refund = getFullRefundMarketSalePreview(dbPath, pack.expected.ids.sale3, REFUND_AUTHORITY);
  const rules = loadCommerceBenefitsRules(db, businessId);
  const points = readCommercePointBalance(db, businessId, pack.expected.ids.pointCustomer, "TRY", Date.parse(FIXED_NOW));
  const expected = pack.expected.readChecks;

  check("catalog.products", () => catalog.total, expected.catalogProducts);
  check("store.products", () => store.products.length, expected.catalogProducts);
  check("store.suppliers", () => store.suppliers.length, expected.suppliers);
  check("purchaseOrders", () => purchases.length, expected.purchaseOrders);
  const purchaseDetail = purchases[0] ? getCommercePurchaseOrder(dbPath, purchases[0].id) : null;
  check("purchaseOrder.totals", () => purchaseDetail
    ? Math.round(purchaseDetail.items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100
    : -1, purchaseDetail?.order?.total ?? -2);
  check("commerceOrders", () => orders.length, 0);
  check("saleHistory.items", () => history.items.length, expected.sales);
  check("saleHistory.totals", () => history.items.map((item) => item.totalMinor), [2000, 27500, 17500]);
  check("saleHistory.refunded", () => history.items.filter((item) => item.refunded).length, expected.refundedSales);
  check("refundPreview.refunded", () => refund.refunded, true);
  check("refundPreview.totalMinor", () => refund.totalMinor, 2000);
  check("benefitRules", () => rules.length, expected.benefitRules);
  check("pointBalance.available", () => points.availableMinor, expected.pointBalanceMinor);
  check("pointBalance.posted", () => points.postedMinor, expected.pointBalanceMinor);
  return checks;
}

function checkMarketDealer({ db, dbPath, pack }) {
  const { checks, check } = publishCheckList();
  const businessId = businessIdOf(db);
  const store = getCommerceStoreSnapshot(dbPath);
  const catalog = listCatalogProducts(dbPath, { limit: 100 });
  const purchases = listCommercePurchaseOrders(dbPath);
  const orders = listCommerceOrders(dbPath);
  const orderDetail = getCommerceOrder(dbPath, pack.expected.ids.orderPlaced);
  const access = getDealerWebAccess(db, pack.expected.ids.dealerA);
  const projection = createDealerAccessProjection(db);
  const price = resolveCommerceProductPrice(dbPath, {
    productId: pack.expected.ids.productUn,
    customerId: pack.expected.ids.dealerA
  });
  const rules = loadCommerceBenefitsRules(db, businessId);
  const points = readCommercePointBalance(db, businessId, pack.expected.ids.dealerA, "TRY", Date.parse(FIXED_NOW));
  const credit = getCustomerCreditAccount(dbPath, pack.expected.ids.dealerB);
  const published = Number(db.prepare("SELECT COUNT(*) AS count FROM commerce_product_publications WHERE business_id = ? AND channel = 'online_sales' AND is_published = 1").get(businessId)?.count ?? 0);
  const expected = pack.expected.readChecks;

  check("catalog.products", () => catalog.total, expected.catalogProducts);
  check("store.products", () => store.products.length, expected.catalogProducts);
  check("store.suppliers", () => store.suppliers.length, expected.suppliers);
  check("purchaseOrders", () => purchases.length, expected.purchaseOrders);
  const purchaseDetail = purchases[0] ? getCommercePurchaseOrder(dbPath, purchases[0].id) : null;
  check("purchaseOrder.totals", () => purchaseDetail
    ? Math.round(purchaseDetail.items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100
    : -1, purchaseDetail?.order?.total ?? -2);
  check("commerceOrders", () => orders.length, expected.orders);
  check("commerceOrders.placed", () => orders.filter((order) => order.status === "placed").length, 1);
  check("commerceOrders.fulfilled", () => orders.filter((order) => order.status === "fulfilled").length, 1);
  check("order.items", () => orderDetail?.items.length ?? 0, 3);
  check("order.totals", () => orderDetail
    ? Math.round(orderDetail.items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100
    : -1, orderDetail?.order.total ?? -2);
  check("dealerAccess.enabled", () => access?.enabled ?? false, expected.dealerAccessEligible);
  check("dealerAccess.accessId", () => access?.accessId ?? "", pack.expected.ids.dealerAccessA);
  check("dealerProjection.enabled", () => projection.enabled, true);
  check("dealerProjection.dealers", () => projection.dealers.filter((dealer) => dealer.enabled).length, 2);
  check("dealerProjection.catalog", () => projection.catalogs.length, 2);
  check("dealerProjection.catalogProducts", () => projection.catalogs[0]?.products.length ?? 0, expected.dealerCatalogProducts);
  check("dealerProjection.orderHistory", () => projection.order_history.find((entry) => entry.access_id === access?.accessId)?.orders.length ?? 0, expected.dealerOrders);
  check("price.dealerA", () => price.unitPrice, 520);
  check("price.group", () => price.appliedGroup, "dealer_a");
  check("creditBalanceMinor", () => credit.balances.find((balance) => balance.currency === "TRY")?.amountMinor ?? 0, expected.creditBalanceMinor);
  check("creditEntries", () => credit.entries.length, 2);
  check("benefitRules", () => rules.length, expected.benefitRules);
  check("pointBalance.available", () => points.availableMinor, expected.pointBalanceMinor);
  check("publishedProducts", () => published, expected.publishedProducts);
  return checks;
}

const PACK_CHECKS = {
  "a-pension-restaurant": checkPensionRestaurant,
  "b-market": checkMarket,
  "c-market-dealer": checkMarketDealer
};

function capabilityChecks(db) {
  const { checks, check } = publishCheckList();
  const profileRow = db.prepare("SELECT profile_id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
  const profileId = String(profileRow?.profile_id ?? "");
  const profile = shared.getBusinessProfile(profileId);
  const rows = db.prepare("SELECT capability_id, is_enabled FROM business_capabilities").all();
  const known = Object.values(shared.BUSINESS_CAPABILITIES);
  const enabled = rows.filter((row) => Number(row.is_enabled) === 1).map((row) => String(row.capability_id));

  check("capabilities.profile", () => Boolean(profile), true);
  if (!profile) return checks;
  check("capabilities.rows", () => rows.length, known.length);
  check("capabilities.known", () => enabled.every((capability) => known.includes(capability)), true);
  check("capabilities.valid", () => shared.validateBusinessCapabilitySet(enabled), []);
  check("capabilities.supported", () => enabled.every((capability) => shared.businessProfileSupportsCapability(profileId, capability)), true);
  check("capabilities.required", () => profile.requiredCapabilities.filter((capability) => !enabled.includes(capability)), []);
  check("capabilities.core", () => shared.CORE_BUSINESS_CAPABILITIES.filter((capability) => !enabled.includes(capability)), []);
  return checks;
}

export function verifyPackage({ folderPath, dbPath, pack }) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const integrity = inspectDatabase(db);
    const checks = integrity.ok ? (PACK_CHECKS[pack.id]?.({ db, dbPath, folderPath, pack }) ?? []) : [];
    const capabilities = integrity.ok ? capabilityChecks(db) : [];
    const assetFiles = fs.existsSync(`${folderPath}/assets`) ? countFiles(`${folderPath}/assets`) : 0;
    let imageError = "";
    const imageRows = db.prepare("SELECT id, image_asset_path FROM catalog_products WHERE deleted_at = '' AND image_asset_path <> ''").all();
    for (const row of imageRows) {
      try {
        if (!readProductImageAsset(dbPath, String(row.image_asset_path)).startsWith("data:image/")) {
          imageError = `empty image data for ${row.id}`;
          break;
        }
      } catch (error) {
        imageError = `${row.id}: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }
    }
    const manifest = JSON.parse(fs.readFileSync(`${folderPath}/backup.json`, "utf8"));
    const checksWithIntegrity = [
      { name: "quick_check", pass: integrity.quickCheck.toLowerCase() === "ok", actual: integrity.quickCheck },
      { name: "foreign_key_check", pass: integrity.foreignKeyViolations.length === 0, actual: integrity.foreignKeyViolations.length },
      { name: "secret_scan", pass: integrity.secretViolations.length === 0, actual: integrity.secretViolations },
      { name: "manifest.format", pass: manifest.format === "yardimci-asistan-backup-v2" },
      { name: "manifest.assets", pass: manifest.assets?.fileCount === assetFiles, expected: assetFiles, actual: manifest.assets?.fileCount },
      { name: "productImages.readable", pass: imageRows.length > 0 && !imageError, actual: imageError || imageRows.length },
      ...capabilities,
      ...checks
    ];
    return {
      packId: pack.id,
      ok: checksWithIntegrity.every((check) => check.pass),
      checks: checksWithIntegrity
    };
  } finally {
    db.close();
  }
}

export function formatVerification(result) {
  const lines = [`# ${result.packId}: ${result.ok ? "PASS" : "FAIL"}`];
  for (const check of result.checks) {
    lines.push(`${check.pass ? "PASS" : "FAIL"} ${check.name}${check.error ? ` (${check.error})` : ""}`);
  }
  return lines.join("\n");
}
