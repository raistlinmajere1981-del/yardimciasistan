import { FIXED_NOW, isoAt, json } from "../util.mjs";
import { DEMO_PALETTES } from "../png.mjs";

const requireModule = (await import("node:module")).createRequire(import.meta.url);
const finance = requireModule("../../../../apps/desktop-app/dist-electron/finance.js");
const benefitRules = requireModule("../../../../apps/desktop-app/dist-electron/commerce-benefits-rules.js");

function addPaidSale(ctx, input) {
  const { db } = ctx;
  const saleId = input.id;
  const subtotal = input.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal - (input.discountTotal ?? 0);
  const now = input.now ?? FIXED_NOW;
  db.prepare(`INSERT INTO commerce_sales
    (id, business_id, customer_id, status, subtotal, discount_total, total, currency, payment_method,
     source, opened_at, closed_at, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, 'paid', ?, ?, ?, 'TRY', ?, 'desktop-market-quick-sale', ?, ?, ?, ?, '')`)
    .run(saleId, ctx.pack.business.id, input.customerId ?? null, subtotal, input.discountTotal ?? 0,
      total, input.paymentMethod, now, now, now, now);

  for (const item of input.items) {
    db.prepare(`INSERT INTO commerce_sale_items
      (id, sale_id, product_id, product_name, barcode, unit_price, quantity, line_total, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(item.id, saleId, item.product.id, item.product.name, item.product.barcode,
        item.unitPrice, item.quantity, item.lineTotal, now);
    if (item.product.trackInventory) {
      const balanceRow = db.prepare("SELECT quantity FROM inventory_balances WHERE product_id = ? AND location_id = ?")
        .get(item.product.id, ctx.primaryLocationId);
      const nextQuantity = Number(balanceRow?.quantity ?? 0) - item.quantity;
      db.prepare(`INSERT INTO inventory_movements
        (id, business_id, product_id, location_id, movement_type, quantity_delta, quantity_after,
         unit_cost, reference_type, reference_id, note, actor_source, created_at)
        VALUES (?, ?, ?, ?, 'sale', ?, ?, ?, 'commerce_sale', ?, ?, 'desktop-market-quick-sale', ?)`)
        .run(`mov_${saleId}_${item.id}`, ctx.pack.business.id, item.product.id, ctx.primaryLocationId,
          -item.quantity, nextQuantity, item.product.purchasePrice, saleId,
          `${item.product.name} demo satışı`, now);
      db.prepare("UPDATE inventory_balances SET quantity = ?, updated_at = ? WHERE product_id = ? AND location_id = ?")
        .run(nextQuantity, now, item.product.id, ctx.primaryLocationId);
    }
  }

  const cashMinor = Math.round(total * 100);
  db.prepare(`INSERT INTO commerce_sale_settlements
    (sale_id, business_id, customer_id, payment_method, cash_received_minor, points_tender_minor, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)`)
    .run(saleId, ctx.pack.business.id, input.customerId ?? null, input.paymentMethod, cashMinor, now);
  finance.synchronizeFinanceSourceInTransaction(db, "commerce_sale", saleId);
  return { saleId, total, cashMinor, now };
}

function seedMarketBenefits(db, businessId, nowMs) {
  const baseScope = {
    channels: ["desktop_cart", "web"],
    customerIds: [],
    customerGroups: [],
    priceGroups: [],
    productIds: [],
    categoryIds: [],
    excludedProductIds: [],
    excludedCategoryIds: []
  };
  benefitRules.withCommerceBenefitsTransaction(db, nowMs, (tx) => {
    benefitRules.configureCommerceBenefits(tx, businessId, {
      coupon: true,
      points: true,
      payment_modifier: false
    });
    benefitRules.saveCommerceBenefitsRule(tx, businessId, {
      schemaVersion: 1,
      id: "rule_mk_points_1",
      version: 1,
      family: "points",
      status: "active",
      currency: "TRY",
      startsAt: Date.parse("2026-10-01T00:00:00.000Z"),
      endsAt: null,
      priority: 10,
      scope: baseScope,
      minSpendMinor: 5000,
      maxBenefitMinor: 5000,
      percentBps: 500,
      fixedMinor: 0,
      allowCouponStacking: false,
      combinesWith: [],
      paymentMethodIds: [],
      points: { operation: "earn", earnBase: "after_discounts", expiryDays: 365 }
    });
    benefitRules.saveCommerceBenefitsRule(tx, businessId, {
      schemaVersion: 1,
      id: "rule_mk_coupon_1",
      version: 1,
      family: "coupon",
      status: "active",
      currency: "TRY",
      startsAt: Date.parse("2026-10-01T00:00:00.000Z"),
      endsAt: Date.parse("2027-12-31T00:00:00.000Z"),
      priority: 20,
      scope: baseScope,
      minSpendMinor: 15000,
      maxBenefitMinor: 3000,
      percentBps: 1000,
      fixedMinor: 0,
      allowCouponStacking: false,
      combinesWith: [],
      paymentMethodIds: [],
      points: null
    });
  });
}

export const marketPack = {
  id: "b-market",
  key: "mk",
  folderName: "yardimci-asistan-demo-b-market",
  title: "Market / Perakende",
  extraCapabilities: ["channel.online_sales", "commerce.benefits"],
  business: {
    id: "biz_demo_market",
    name: "Örnek Mahalle Marketi",
    displayName: "Örnek Mahalle Marketi",
    profileId: "market",
    phone: "+90 555 000 00 02",
    whatsapp: "+90 555 000 00 02",
    email: "market.demo@example.test",
    address: "Örnek Mah. Deneme Cad. No: 12, Kadıköy / İstanbul",
    publishRoomsWeb: false,
    publishTablesWeb: false,
    publishQrMenuWeb: false,
    publicProfile: {
      description: "Sentetik demo mahalle marketi.",
      about: "Bu market kaydı yalnız demo veri paketi içindir. Gerçek ürün, müşteri veya satış verisi değildir.",
      latitude: 40.9901,
      longitude: 29.0277,
      directions: "Demo meydanın yanında.",
      features: ["wifi", "parking"],
      policyNote: "Sentetik demo kaydıdır.",
      paymentNote: "Nakit ve kart kabul edilir."
    }
  },
  settings: { onlineSalesPickup: true, onlineSalesDelivery: true },
  seed(ctx) {
    const { db } = ctx;
    const categories = {
      breakfast: ctx.addCategory({ id: "cat_mk_breakfast", name: "Kahvaltılık", code: "KAH", sortOrder: 10 }),
      drink: ctx.addCategory({ id: "cat_mk_drink", name: "İçecek", code: "ICE", sortOrder: 20 }),
      staple: ctx.addCategory({ id: "cat_mk_staple", name: "Temel Gıda", code: "TEM", sortOrder: 30 }),
      home: ctx.addCategory({ id: "cat_mk_home", name: "Ev ve Temizlik", code: "EVC", sortOrder: 40 }),
      gift: ctx.addCategory({ id: "cat_mk_gift", name: "Hediye ve Ambalaj", code: "HED", sortOrder: 50 })
    };

    const productInputs = [
      ["sut-1l", "Tam Yağlı Süt 1 L", categories.drink, 32.5, 24, 1, "2000000000011", 60],
      ["yumurta-10", "Yumurta 10'lu", categories.breakfast, 75, 56, 1, "2000000000028", 40],
      ["ekmek", "Köy Ekmeği", categories.breakfast, 15, 8, 1, "2000000000035", 30],
      ["beyaz-peynir", "Beyaz Peynir 250 g", categories.breakfast, 95, 68, 1, "2000000000042", 24],
      ["zeytin", "Yeşil Zeytin 500 g", categories.breakfast, 120, 86, 1, "2000000000059", 20],
      ["bal", "Yerel Bal 850 g", categories.breakfast, 240, 175, 1, "2000000000066", 18],
      ["cay-1kg", "Siyah Çay 1 kg", categories.staple, 185, 132, 1, "2000000000073", 32],
      ["kahve-100g", "Türk Kahvesi 100 g", categories.staple, 160, 110, 1, "2000000000080", 25],
      ["su-5l", "Doğal Kaynak Suyu 5 L", categories.drink, 45, 28, 1, "2000000000097", 50],
      ["deterjan", "Bulaşık Deterjanı 750 ml", categories.home, 90, 58, 1, "2000000000103", 26],
      ["hediye-paketi", "Hediye Paketi", categories.gift, 20, 4, 0, "2000000000110", 0],
      ["karton-kutu", "Karton Taşıma Kutusu", categories.gift, 35, 18, 0, "2000000000127", 0]
    ];
    const products = productInputs.map(([key, name, categoryId, salePrice, purchasePrice, trackInventory, barcode, stock], index) => {
      const product = ctx.addProduct({
        key,
        name,
        categoryId,
        salePrice,
        purchasePrice,
        taxRate: 10,
        sortOrder: (index + 1) * 10,
        palette: DEMO_PALETTES.market,
        paletteVariant: index,
        sku: `DEMO-MK-${String(index + 1).padStart(3, "0")}`,
        barcode,
        brand: "Demo Marka",
        description: `${name} — sentetik demo market ürünü.`,
        trackInventory: trackInventory === 1,
        minimumQuantity: trackInventory ? 5 : 0,
        quickAccess: index < 4,
        quickAccessOrder: index + 1
      });
      if (trackInventory === 1) ctx.addInventory(product, stock, purchasePrice);
      return { ...product, trackInventory: trackInventory === 1, purchasePrice, stock };
    });
    const byKey = new Map(products.map((product) => [product.id.split("_").at(-1), product]));

    const supplierA = ctx.addSupplier({
      key: "gida",
      name: "Örnek Gıda Dağıtım A.Ş.",
      phone: "+90 555 000 20 01",
      email: "tedarik.demo@example.test",
      taxNumber: "2000000001",
      notes: "Sentetik demo tedarikçisi."
    });
    ctx.addSupplier({
      key: "ambalaj",
      name: "Demo Ambalaj Ltd. Şti.",
      phone: "+90 555 000 20 02",
      email: "ambalaj.demo@example.test",
      taxNumber: "2000000002"
    });

    db.prepare(`INSERT INTO purchase_orders
      (id, business_id, supplier_id, status, ordered_at, received_at, subtotal, total, currency, notes,
       created_at, updated_at, deleted_at)
      VALUES ('po_mk_1', ?, ?, 'received', ?, ?, 1020, 1020, 'TRY', 'Sentetik demo alımı.', ?, ?, '')`)
      .run(ctx.pack.business.id, supplierA, isoAt(-8, 10), isoAt(-7, 9), FIXED_NOW, FIXED_NOW);
    const purchaseItems = [
      ["poi_mk_1", byKey.get("sut-1l"), 24, 24],
      ["poi_mk_2", byKey.get("beyaz-peynir"), 4, 68],
      ["poi_mk_3", byKey.get("zeytin"), 2, 86]
    ];
    for (const [id, product, quantity, unitCost] of purchaseItems) {
      db.prepare(`INSERT INTO purchase_order_items
        (id, purchase_order_id, product_id, product_name, quantity, unit_cost, line_total, created_at, updated_at)
        VALUES (?, 'po_mk_1', ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, product.id, product.name, quantity, unitCost, quantity * unitCost, FIXED_NOW, FIXED_NOW);
    }

    const customers = [
      ["aylin", "Aylin Arslan", "30 01", "demo.aylin.arslan@example.test"],
      ["kerem", "Kerem Yalçın", "30 02", "demo.kerem.yalcin@example.test"],
      ["melis", "Melis Güneş", "30 03", "demo.melis.gunes@example.test"],
      ["onur", "Onur Polat", "30 04", "demo.onur.polat@example.test"],
      ["ece", "Ece Erdem", "30 05", "demo.ece.erdem@example.test"]
    ].map(([key, fullName, suffix, email]) => ctx.addCustomer({
      key,
      fullName,
      phone: `+90 555 000 ${suffix}`,
      email,
      birthDate: key === "aylin" ? "1991-05-14" : ""
    }));
    const customerByKey = new Map(customers.map((customer) => [customer.id.split("_").at(-1), customer]));

    const sale1 = addPaidSale(ctx, {
      id: "sale_mk_1",
      customerId: customerByKey.get("aylin").id,
      paymentMethod: "cash",
      now: isoAt(-1, 17, 20),
      items: [
        { id: "sale_item_mk_1", product: byKey.get("sut-1l"), unitPrice: 32.5, quantity: 2, lineTotal: 65 },
        { id: "sale_item_mk_2", product: byKey.get("ekmek"), unitPrice: 15, quantity: 1, lineTotal: 15 },
        { id: "sale_item_mk_3", product: byKey.get("beyaz-peynir"), unitPrice: 95, quantity: 1, lineTotal: 95 }
      ]
    });
    const sale2 = addPaidSale(ctx, {
      id: "sale_mk_2",
      customerId: null,
      paymentMethod: "card",
      now: isoAt(0, 11, 5),
      items: [
        { id: "sale_item_mk_4", product: byKey.get("cay-1kg"), unitPrice: 185, quantity: 1, lineTotal: 185 },
        { id: "sale_item_mk_5", product: byKey.get("su-5l"), unitPrice: 45, quantity: 2, lineTotal: 90 }
      ]
    });
    const sale3 = addPaidSale(ctx, {
      id: "sale_mk_3",
      customerId: customerByKey.get("kerem").id,
      paymentMethod: "cash",
      now: isoAt(0, 12, 10),
      items: [
        { id: "sale_item_mk_6", product: byKey.get("hediye-paketi"), unitPrice: 20, quantity: 1, lineTotal: 20 }
      ]
    });

    // A fully refunded non-stock sale, recorded with the same evidence contract the app reads.
    const refundId = "sale_refund_mk_1";
    const itemsJson = json([{ id: "sale_item_mk_6", product_id: byKey.get("hediye-paketi").id, product_name: byKey.get("hediye-paketi").name, quantity: 1, unit_price: 20, line_total: 20 }]);
    db.prepare(`INSERT INTO commerce_sale_full_refunds
      (id, business_id, sale_id, customer_id, snapshot_id, operation_id, command_json, actor_id, source, currency,
       cash_minor, points_minor, payment_method, items_json, stock_movements_json, created_at)
      VALUES (?, ?, ?, ?, NULL, 'demo-op-mk-refund-1', ?, 'demo_owner', 'desktop-market-quick-sale', 'TRY',
       2000, 0, 'cash', ?, '[]', ?)`)
      .run(refundId, ctx.pack.business.id, sale3.saleId, customerByKey.get("kerem").id,
        json({ saleId: sale3.saleId, operationId: "demo-op-mk-refund-1", kind: "full" }), itemsJson, isoAt(0, 12, 30));
    db.prepare(`INSERT INTO commerce_sale_full_refund_receipts (refund_id, receipt_json)
      VALUES (?, ?)`)
      .run(refundId, json({
        version: 1,
        refundId,
        saleId: sale3.saleId,
        businessId: ctx.pack.business.id,
        customerId: customerByKey.get("kerem").id,
        cashMinor: 2000,
        pointsMinor: 0,
        currency: "TRY",
        paymentMethod: "cash",
        stockMovementIds: [],
        benefits: null
      }));
    finance.synchronizeFinanceSourceInTransaction(db, "commerce_sale_refund", refundId);

    // Benefits: canonical rules written through the production validator after commit.
    const nowMs = Date.parse(FIXED_NOW);
    ctx.runAfterCommit(() => seedMarketBenefits(db, ctx.pack.business.id, nowMs));

    const pointCustomer = customerByKey.get("melis");
    db.prepare(`INSERT INTO commerce_benefit_point_ledger
      (business_id, id, customer_id, currency, kind, amount_minor, source_kind, source_id, operation_key,
       linked_entry_id, expires_at_ms, created_at_ms)
      VALUES (?, 'point_mk_grant_1', ?, 'TRY', 'grant', 1250, 'demo', 'opening', 'demo-op-mk-points-1',
       NULL, ?, ?)`)
      .run(ctx.pack.business.id, pointCustomer.id, Date.parse("2027-11-30T00:00:00.000Z"), nowMs);

    ctx.expected = {
      counts: {
        products: products.length,
        customers: customers.length,
        suppliers: 2,
        paidSales: 3,
        refunds: 1,
        purchaseOrders: 1
      },
      readChecks: {
        catalogProducts: products.length,
        suppliers: 2,
        purchaseOrders: 1,
        sales: 3,
        refundedSales: 1,
        benefitRules: 2,
        pointBalanceMinor: 1250
      },
      ids: { sale1: sale1.saleId, sale2: sale2.saleId, sale3: sale3.saleId, refundId, pointCustomer: pointCustomer.id }
    };
  }
};
