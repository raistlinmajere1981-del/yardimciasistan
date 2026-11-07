import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { FIXED_NOW, countFiles, json, sha256File, sha256Text } from "./util.mjs";
import { catalogIdentitySha256, TEKNIKEL_DATA_PROVENANCE, TEKNIKEL_PHOTO_PROVENANCE } from "./teknikel-sources.mjs";
import { inspectDatabase } from "./integrity.mjs";
import { jpegSize } from "./panorama-media.mjs";

const require = createRequire(import.meta.url);
const shared = require("../../../packages/shared/dist/index.js");
const electron = (name) => require(`../../../apps/desktop-app/dist-electron/${name}.js`);

const { createDesktopDashboardData } = electron("desktop-dashboard-service");
const { getPublishedMenu } = electron("database/menu-store");
const { listProductPhotos } = electron("product-photo-store");
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
const { readProductImageAsset, readProductOriginalAssets } = electron("product-image-reader");
const { createCommerceOnlineCatalog } = electron("commerce-online-catalog-publication");
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

function pngSize(bytes) {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("Not a PNG file (missing signature).");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
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

  check("media.roomMedia.count", () => pending.room.length, filesFor("room").length);
  check("media.tableMedia.count", () => pending.table.length, filesFor("table").length);
  check("media.roomMedia.pendingOnly", () => pending.room.every((item) => item.remoteUrl === ""), true);
  check("media.tableMedia.pendingOnly", () => pending.table.every((item) => item.remoteUrl === ""), true);
  check("media.counts.360", () => media.files.filter((item) => item.kind === "panorama_360").length, media.counts.roomMedia360 + media.counts.tableMedia360);
  check("media.counts.180", () => media.files.filter((item) => item.kind === "panorama_180").length, media.counts.roomMedia180 + media.counts.tableMedia180);
  check("media.counts.roomCovers", () => media.files.filter((item) => item.scope === "room" && item.kind === "cover").length, media.counts.roomCovers);
  check("media.counts.tableCovers", () => media.files.filter((item) => item.scope === "table" && item.kind === "cover").length, media.counts.tableCovers);
  check("media.counts.roomPhotos", () => media.files.filter((item) => item.scope === "room" && item.kind === "photo").length, media.counts.roomPhotos);
  check("media.counts.tablePhotos", () => media.files.filter((item) => item.scope === "table" && item.kind === "photo").length, media.counts.tablePhotos);

  for (const target of media.targets) {
    check(`${target.scope}Media.list.${target.resourceId}`, () => {
      const items = listFor(target.scope)(folderPath, target.resourceId);
      return items.map((item) => `${item.id}:${item.kind}:${item.mimeType}:${item.remoteUrl === "" ? "pending" : "published"}`).sort();
    }, target.mediaIds.map((id) => {
      const record = media.files.find((item) => item.id === id);
      return `${id}:${record.kind}:${record.mimeType}:pending`;
    }).sort());
  }

  const coverTargets = media.targets.filter((target) => target.mediaIds.some((id) => media.files.find((item) => item.id === id)?.kind === "cover"));
  check("media.covers.everyTarget", () => coverTargets.length, media.targets.length);
  const fullSets = media.targets.filter((target) => {
    const kinds = new Set(target.mediaIds.map((id) => media.files.find((item) => item.id === id)?.kind));
    return ["cover", "photo", "panorama_180", "panorama_360"].every((kind) => kinds.has(kind));
  });
  check("media.fullSet.everyTarget", () => fullSets.length, media.targets.length);

  for (const manifestPath of media.manifests) {
    const scope = manifestPath.includes("room-media") ? "room" : "table";
    const idField = scope === "room" ? "roomId" : "tableId";
    const absolutePath = path.join(folderPath, manifestPath);
    check(`media.manifest.${scope}`, () => {
      const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
      const records = new Map(filesFor(scope).map((item) => [item.id, item]));
      return {
        version: parsed.version,
        count: Array.isArray(parsed.media) ? parsed.media.length : -1,
        idsMatch: Array.isArray(parsed.media)
          && parsed.media.map((item) => item.id).sort().join(",") === filesFor(scope).map((item) => item.id).sort().join(","),
        fieldsValid: Array.isArray(parsed.media) && parsed.media.every((item) => {
          const record = records.get(item.id);
          return Boolean(record)
            && typeof item[idField] === "string"
            && item.mimeType === record.mimeType
            && item.remoteUrl === ""
            && /^[a-f0-9]{64}$/.test(String(item.contentHash))
            && item.storedPath === record.storedPath;
        })
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
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      sortOrder: record.sortOrder,
      remoteUrl: "",
      title: record.title
    });
    check(`media.${record.id}.title`, () => Boolean(listed
      && listed.title.includes(record.license)
      && listed.title.includes(record.author)
      && listed.title.includes("işletmenin kendi fotoğrafı değildir")), true);
    check(`media.${record.id}.storedFile`, () => fs.existsSync(absolutePath), true);
    check(`media.${record.id}.sha256`, () => (fs.existsSync(absolutePath) ? sha256File(absolutePath) : ""), record.contentHash);
    check(`media.${record.id}.pendingStoredPath`, () => pendingItem?.storedPath ?? "", record.storedPath);
    check(`media.${record.id}.pendingContentHash`, () => pendingItem?.contentHash ?? "", record.contentHash);
    if (record.mimeType === "image/png") {
      check(`media.${record.id}.pngDimensions`, () => {
        if (!fs.existsSync(absolutePath)) return null;
        const size = pngSize(fs.readFileSync(absolutePath));
        return { width: size.width, height: size.height };
      }, { width: record.width, height: record.height });
    } else {
      check(`media.${record.id}.jpegDimensions`, () => {
        if (!fs.existsSync(absolutePath)) return null;
        const size = jpegSize(fs.readFileSync(absolutePath));
        return {
          width: size.width,
          height: size.height,
          ratio: Number((size.width / size.height).toFixed(3)),
          expectedRatio: Number((record.width / record.height).toFixed(3))
        };
      }, {
        width: record.width,
        height: record.height,
        ratio: Number((record.width / record.height).toFixed(3)),
        expectedRatio: Number((record.width / record.height).toFixed(3))
      });
    }
  }

  if (media.attributionPath) {
    const attributionPath = path.join(folderPath, media.attributionPath);
    check("media.attribution.exists", () => fs.existsSync(attributionPath), true);
    check("media.attribution.sha256", () => (fs.existsSync(attributionPath) ? sha256File(attributionPath) : ""), media.attributionSha256);
    check("media.attribution.content", () => {
      if (!fs.existsSync(attributionPath)) return {};
      const text = fs.readFileSync(attributionPath, "utf8");
      const normalized = text.replace(/\s+/g, " ");
      return {
        licenses: [...new Set(media.files.map((item) => item.license))].every((license) => text.includes(license)),
        ownerDisclaimer: normalized.includes("demo işletmesinin kendi çekimi değildir"),
        cropNotice: text.includes("kırp"),
        authors: [...new Set(media.files.map((item) => item.author))].every((author) => text.includes(author)),
        sources: [...new Set(media.files.map((item) => item.sourceUrl))].every((url) => text.includes(url))
      };
    }, { licenses: true, ownerDisclaimer: true, cropNotice: true, authors: true, sources: true });
  }
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
  // The current QR-table-order schema is part of backup-v2. Importing a demo
  // must not accidentally publish bearer tokens or turn on guest ordering.
  const qrSettings = db.prepare("SELECT publish_qr_menu_web, qr_table_orders_enabled, qr_table_order_secret FROM business WHERE deleted_at = '' LIMIT 1").get();
  check("qrTableOrder.menuPublished", () => Number(qrSettings?.publish_qr_menu_web), 1);
  check("qrTableOrder.offByDefault", () => Number(qrSettings?.qr_table_orders_enabled), 0);
  check("qrTableOrder.tokenCreatedOnEnable", () => String(qrSettings?.qr_table_order_secret ?? ""), "");
  check("qrTableOrder.activeTables", () => Number(db.prepare("SELECT COUNT(*) AS count FROM tables WHERE deleted_at = '' AND is_active = 1").get().count), expected.dashboardTables);
  check("qrTableOrder.menuItemsReady", () => menu.items.filter((item) => item.is_available && menu.categories.some((c) => c.id === item.category_id && c.is_active)).length, expected.menuItems);
  check("menu.originalPhotoArchive.validMimes", () => db.prepare("SELECT id FROM catalog_products WHERE deleted_at = ''").all()
    .every(({ id }) => listProductPhotos(dbPath, String(id)).photos.every((photo) =>
      ["image/jpeg", "image/png", "image/webp"].includes(photo.format))), true);

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

function checkTeknikel({ db, dbPath, folderPath, pack }) {
  const { checks, check } = publishCheckList();
  const { readChecks: expected, ids } = pack.expected;
  const count = table => Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  const rows = db.prepare("SELECT * FROM catalog_products ORDER BY sort_order, id").all();
  const store = getCommerceStoreSnapshot(dbPath);
  const first = listCatalogProducts(dbPath, { activeOnly: true, limit: 100 });
  const second = listCatalogProducts(dbPath, { activeOnly: true, limit: 100, offset: 100 });
  const caps = db.prepare("SELECT capability_id FROM business_capabilities WHERE is_enabled = 1").all().map(row => String(row.capability_id));
  const online = createCommerceOnlineCatalog(db, caps);
  check("sqlite.integrity_check", () => Object.values(db.prepare("PRAGMA integrity_check").get())[0], "ok");
  check("business.market", () => db.prepare("SELECT profile_id FROM business").get().profile_id, "market");
  check("capabilities.teknikel", () => ["commerce.wholesale", "channel.online_sales", "commerce.customer_credit"].every(cap => caps.includes(cap)), true);
  check("catalog.products", () => first.total, 179);
  check("catalog.browseAll", () => [first.items.length, first.nextOffset, second.items.length, second.nextOffset, new Set([...first.items, ...second.items].map(p => p.id)).size], [100, 100, 79, null, 179]);
  check("catalog.sourceNamesAndSkus", () => catalogIdentitySha256(store.products), expected.catalogIdentitySha256);
  check("catalog.categories", () => count("catalog_categories"), 25);
  check("catalog.other", () => listCatalogProducts(dbPath, { categoryId: "cat_tk_other", activeOnly: true }).total, 151);
  check("catalog.syntheticLabels", () => rows.every(row => row.data_license === TEKNIKEL_DATA_PROVENANCE && row.description.includes("DEMO") && row.tax_rate === 20 && row.purchase_price > 0 && row.dealer_price_b < row.dealer_price_a && row.dealer_price_a < row.sale_price), true);
  check("inventory.balances", () => count("inventory_balances"), 179);
  check("inventory.ledger", () => db.prepare(`SELECT COUNT(*) AS count FROM inventory_balances b WHERE b.quantity <> (SELECT SUM(m.quantity_delta) FROM inventory_movements m WHERE m.product_id = b.product_id AND m.location_id = b.location_id)`).get().count, 0);
  check("online.enabled", () => online.enabled, true);
  check("online.deliveryMethods", () => online.deliveryMethods, ["pickup"]);
  check("settings.shippingDisabledUntilConfigured", () => db.prepare("SELECT online_sales_delivery_enabled AS delivery, online_sales_pickup_enabled AS pickup, online_sales_shipping_enabled AS shipping FROM settings").get(), { delivery: 1, pickup: 1, shipping: 0 });
  check("online.curated", () => [online.products.length, online.categories.length, online.products.every(p => p.categoryId !== "cat_tk_other")], [28, 24, true]);
  check("online.featured", () => online.products.filter(p => p.isFeatured).map(p => p.featuredOrder).sort((a,b)=>a-b), [0, 10, 20, 30]);
  check("online.featuredSeparated", () => online.products.filter(p => p.isFeatured).every(p => p.categoryId !== "cat_tk_other"), true);
  check("online.noUnacknowledgedImages", () => online.products.every(p => !p.imageUrl && p.imageUrls.length === 0), true);
  check("customers.count", () => count("customers"), 30);
  check("customers.sourceIdentities", () => sha256Text(json(db.prepare("SELECT full_name, phone, email FROM customers ORDER BY id").all().map(c => [c.full_name, c.phone, c.email]))), expected.customerIdentitySha256);
  check("customers.profiles", () => count("customer_commercial_profiles"), 20);
  check("customers.retail", () => db.prepare("SELECT COUNT(*) AS count FROM customers c LEFT JOIN customer_commercial_profiles p ON p.customer_id = c.id WHERE p.customer_id IS NULL").get().count, 10);
  check("customers.tiers", () => db.prepare("SELECT dealer_status, price_group, COUNT(*) AS count FROM customer_commercial_profiles GROUP BY dealer_status, price_group ORDER BY dealer_status, price_group").all().map(p => [p.dealer_status, p.price_group, p.count]), [["active", "dealer_a", 5], ["active", "dealer_b", 5], ["inactive", "dealer_a", 5], ["inactive", "dealer_b", 5]]);
  check("accounts.none", () => count("web_customer_accounts"), 0);
  check("accounts.noBindings", () => db.prepare("SELECT COUNT(*) AS count FROM customer_web_access WHERE account_id <> ''").get().count, 0);
  check("accounts.portalDisabled", () => createDealerAccessProjection(db).enabled, false);
  for (const [customerId, group, priceColumn] of [[ids.dealerA, "dealer_a", "dealer_price_a"], [ids.dealerB, "dealer_b", "dealer_price_b"], [ids.inactiveDealer, "retail", "sale_price"], [ids.retail, "retail", "sale_price"]]) {
    const product = rows.find(p => p.id === ids.priceProduct);
    check(`price.${customerId}`, () => {
      const price = resolveCommerceProductPrice(dbPath, { productId: ids.priceProduct, customerId });
      return [price.appliedGroup, price.unitPrice];
    }, [group, product[priceColumn]]);
  }
  const orders = listCommerceOrders(dbPath);
  check("orders.statuses", () => orders.map(order => order.status).sort(), ["cancelled", "confirmed", "fulfilled", "placed"]);
  check("orders.demo", () => orders.every(order => order.source === "desktop" && order.sourceReference.startsWith("DEMO-TK-") && order.note.includes("DEMO")), true);
  for (const order of orders) {
    check(`order.${order.id}.items`, () => {
      const detail = getCommerceOrder(dbPath, order.id);
      return detail.items.length === 2 && Math.round(detail.items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) === Math.round(order.total * 100)
        && detail.items.every(item => {
          const product = rows.find(row => row.id === item.productId);
          return product && item.productName === product.name && item.sku === product.sku && item.taxRate === 20
            && Math.round(item.lineTotal * 100) === Math.round(item.unitPrice * item.quantity * 100);
        });
    }, true);
  }
  check("suppliers", () => store.suppliers.length, 1);
  const purchases = listCommercePurchaseOrders(dbPath);
  check("purchases", () => purchases.map(p => p.status), ["draft"]);
  check("purchase.totals", () => {
    const detail = getCommercePurchaseOrder(dbPath, "po_tk_1");
    return Math.round(detail.items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) === Math.round(detail.order.total * 100);
  }, true);
  const credit = getCustomerCreditAccount(dbPath, ids.dealerB);
  check("credit.entries", () => credit.entries.length, 2);
  check("credit.balanceMinor", () => credit.balances.find(b => b.currency === "TRY")?.amountMinor, expected.creditBalanceMinor);
  const attribution = JSON.parse(fs.readFileSync(path.join(folderPath, "assets", "TEKNIKEL_SOURCE_MANIFEST.json"), "utf8"));
  check("source.provenance", () => [attribution.dataProvenance, attribution.photoProvenance], [TEKNIKEL_DATA_PROVENANCE, TEKNIKEL_PHOTO_PROVENANCE]);
  check("source.originalManifest", () => sha256Text(json(attribution.originals)), expected.originalAssetsSha256);
  const allAssets = rows.flatMap(row => JSON.parse(row.image_original_assets_json).map(asset => ({ ...asset, productId: row.id, sku: row.sku })));
  check("images.counts", () => [allAssets.length, new Set(allAssets.map(asset => asset.hash)).size, rows.filter(row => row.image_asset_path).length], [68, 67, 35]);
  check("images.fileCount", () => countFiles(path.join(folderPath, "assets", "products")), 68);
  check("images.sourceAssociations", () => allAssets.every(asset => attribution.originals.some(original => ["assetPath", "hash", "format", "productId", "sku"].every(key => original[key] === asset[key]))), true);
  for (const row of rows.filter(row => row.image_asset_path)) {
    check(`images.${row.id}.gallery`, () => {
      const stored = JSON.parse(row.image_original_assets_json);
      const readable = readProductOriginalAssets(dbPath, row.id, row);
      return stored[0].assetPath === row.image_asset_path && readable.length === new Set(stored.map(asset => asset.hash)).size && row.image_license === TEKNIKEL_PHOTO_PROVENANCE;
    }, true);
  }
  for (const asset of allAssets) {
    check(`images.${path.basename(asset.assetPath)}.bytes`, () => {
      const dataUri = readProductImageAsset(dbPath, asset.assetPath);
      return asset.assetPath.startsWith(`assets/products/${asset.productId}/`) && dataUri.startsWith(`data:${asset.format};base64,`) && sha256File(path.join(folderPath, asset.assetPath)) === asset.hash;
    }, true);
  }
  return checks;
}

const PACK_CHECKS = {
  "a-pension-restaurant": checkPensionRestaurant,
  "b-market": checkMarket,
  "c-market-dealer": checkMarketDealer,
  "d-teknikel": checkTeknikel
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
