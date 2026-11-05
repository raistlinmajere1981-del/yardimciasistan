import { FIXED_NOW, isoAt, json } from "../util.mjs";
import { DEMO_PALETTES } from "../png.mjs";

const requireModule = (await import("node:module")).createRequire(import.meta.url);
const finance = requireModule("../../../../apps/desktop-app/dist-electron/finance.js");
const benefitRules = requireModule("../../../../apps/desktop-app/dist-electron/commerce-benefits-rules.js");

function accessIdForCustomer(db, customerId) {
  const row = db.prepare("SELECT id FROM customer_web_access WHERE customer_id = ?").get(customerId);
  if (!row) throw new Error(`customer_web_access missing for ${customerId}`);
  return String(row.id);
}

function addOrder(ctx, input) {
  const { db } = ctx;
  const subtotal = input.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = Math.round((subtotal - (input.discountTotal ?? 0)) * 100) / 100;
  db.prepare(`INSERT INTO commerce_orders
    (id, business_id, customer_id, customer_name, buyer_snapshot_json, delivery_snapshot_json,
     status, source, source_reference, subtotal, discount_total, total, currency, note,
     placed_at, confirmed_at, fulfilled_at, cancelled_at, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'TRY', ?, ?, ?, ?, ?, ?, ?, '')`)
    .run(
      input.id,
      ctx.pack.business.id,
      input.customerId,
      input.customerName,
      json(input.buyerSnapshot),
      json(input.deliverySnapshot),
      input.status,
      input.source ?? "web-dealer",
      input.sourceReference,
      subtotal,
      input.discountTotal ?? 0,
      total,
      input.note ?? "Sentetik demo bayi siparişi.",
      input.placedAt,
      input.status === "placed" ? "" : input.placedAt,
      input.status === "fulfilled" ? input.fulfilledAt : "",
      input.status === "cancelled" ? input.cancelledAt : "",
      input.placedAt,
      input.status === "fulfilled" ? input.fulfilledAt : input.status === "cancelled" ? input.cancelledAt : input.placedAt
    );

  for (const item of input.items) {
    db.prepare(`INSERT INTO commerce_order_items
      (id, order_id, product_id, product_name, sku, barcode, unit, unit_price, quantity, line_total, tax_rate, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        item.id,
        input.id,
        item.product.id,
        item.product.name,
        item.product.sku,
        item.product.barcode,
        item.unit ?? "piece",
        item.unitPrice,
        item.quantity,
        item.lineTotal,
        item.taxRate ?? 10,
        input.placedAt
      );
  }
  return { id: input.id, total };
}

function seedDealerBenefits(db, businessId, nowMs) {
  const baseScope = {
    channels: ["desktop_cart", "web"],
    customerIds: [],
    customerGroups: [],
    priceGroups: ["dealer_a", "dealer_b"],
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
      id: "rule_md_points_1",
      version: 1,
      family: "points",
      status: "active",
      currency: "TRY",
      startsAt: Date.parse("2026-10-01T00:00:00.000Z"),
      endsAt: null,
      priority: 10,
      scope: baseScope,
      minSpendMinor: 100000,
      maxBenefitMinor: 25000,
      percentBps: 300,
      fixedMinor: 0,
      allowCouponStacking: false,
      combinesWith: [],
      paymentMethodIds: [],
      points: { operation: "earn", earnBase: "after_discounts", expiryDays: 365 }
    });
    benefitRules.saveCommerceBenefitsRule(tx, businessId, {
      schemaVersion: 1,
      id: "rule_md_coupon_1",
      version: 1,
      family: "coupon",
      status: "active",
      currency: "TRY",
      startsAt: Date.parse("2026-10-01T00:00:00.000Z"),
      endsAt: Date.parse("2027-12-31T00:00:00.000Z"),
      priority: 20,
      scope: { ...baseScope, channels: ["web"] },
      minSpendMinor: 250000,
      maxBenefitMinor: 15000,
      percentBps: 500,
      fixedMinor: 0,
      allowCouponStacking: false,
      combinesWith: [],
      paymentMethodIds: [],
      points: null
    });
  });
}

export const marketDealerPack = {
  id: "c-market-dealer",
  key: "md",
  folderName: "yardimci-asistan-demo-c-market-dealer",
  title: "Market + Bayi / Toptan",
  extraCapabilities: ["channel.online_sales", "commerce.wholesale", "commerce.customer_credit", "commerce.benefits"],
  business: {
    id: "biz_demo_market_dealer",
    name: "Ege Toptan Market ve Bayi Deposu",
    displayName: "Ege Toptan Market",
    profileId: "market",
    phone: "+90 555 000 00 03",
    whatsapp: "+90 555 000 00 03",
    email: "toptan.demo@example.test",
    address: "Örnek Sanayi Mah. Demo Bulvarı No: 24, Bornova / İzmir",
    publishRoomsWeb: false,
    publishTablesWeb: false,
    publishQrMenuWeb: false,
    publicProfile: {
      description: "Sentetik demo toptan market ve bayi işletmesi.",
      about: "Bu kayıt yalnız demo veri paketi içindir. Gerçek bayi, müşteri, borç veya sipariş verisi içermez.",
      latitude: 38.4621,
      longitude: 27.2164,
      directions: "Demo sanayi girişinden 200 metre.",
      features: ["parking", "loading_dock"],
      policyNote: "Sentetik demo kaydıdır.",
      paymentNote: "Bayi siparişleri demo amaçlıdır; gerçek tahsilat yapılmaz."
    }
  },
  settings: {
    dealerApplicationEnabled: true,
    dealerPortalEnabled: true,
    onlineSalesPickup: true,
    onlineSalesDelivery: true,
    onlineSalesShipping: false // No carrier credentials in a public demo; enable after an explicit provider test.
  },
  seed(ctx) {
    const { db } = ctx;
    const categories = {
      staple: ctx.addCategory({ id: "cat_md_staple", name: "Temel Gıda", code: "TEM", sortOrder: 10 }),
      beverage: ctx.addCategory({ id: "cat_md_beverage", name: "İçecek", code: "ICE", sortOrder: 20 }),
      cleaning: ctx.addCategory({ id: "cat_md_cleaning", name: "Temizlik", code: "TEMZ", sortOrder: 30 }),
      packaging: ctx.addCategory({ id: "cat_md_packaging", name: "Ambalaj", code: "AMB", sortOrder: 40 })
    };

    const productInputs = [
      ["un-25kg", "Buğday Unu 25 kg", categories.staple, 620, 470, 520, 500, "2000000001001", 40],
      ["seker-5kg", "Toz Şeker 5 kg", categories.staple, 210, 168, 185, 175, "2000000001018", 60],
      ["pirinc-5kg", "Baldo Pirinç 5 kg", categories.staple, 340, 275, 300, 288, "2000000001025", 35],
      ["zeytinyagi-5l", "Zeytinyağı 5 L", categories.staple, 1250, 980, 1120, 1050, "2000000001032", 24],
      ["su-19l", "Damacana Su 19 L", categories.beverage, 95, 62, 78, 72, "2000000001049", 80],
      ["cola-24", "Kola 24 × 330 ml", categories.beverage, 480, 380, 420, 405, "2000000001056", 30],
      ["cay-5kg", "Siyah Çay 5 kg", categories.beverage, 1150, 920, 1020, 985, "2000000001063", 20],
      ["deterjan-5l", "Endüstriyel Deterjan 5 L", categories.cleaning, 390, 290, 340, 325, "2000000001070", 28],
      ["sabun-12", "Sıvı Sabun 12 × 500 ml", categories.cleaning, 540, 410, 470, 450, "2000000001087", 18],
      ["pecete-24", "Kağıt Peçete 24'lü", categories.packaging, 320, 230, 275, 262, "2000000001094", 26],
      ["poset-1000", "Market Poşeti 1000'li", categories.packaging, 280, 190, 240, 225, "2000000001100", 32],
      ["karton-50", "Karton Koli 50'li", categories.packaging, 850, 640, 745, 710, "2000000001117", 14]
    ];

    const products = productInputs.map(([key, name, categoryId, salePrice, purchasePrice, dealerPriceA, dealerPriceB, barcode, stock], index) => {
      const product = ctx.addProduct({
        key,
        name,
        categoryId,
        salePrice,
        purchasePrice,
        dealerPriceA,
        dealerPriceB,
        taxRate: 10,
        sortOrder: (index + 1) * 10,
        palette: DEMO_PALETTES.market,
        paletteVariant: index + 2,
        sku: `DEMO-MD-${String(index + 1).padStart(3, "0")}`,
        barcode,
        brand: "Demo Toptan",
        description: `${name} — sentetik demo toptan ürünü.`,
        unit: key.includes("kg") ? "kg" : key.includes("l") ? "l" : "piece",
        trackInventory: true,
        minimumQuantity: 4,
        quickAccess: index < 5,
        quickAccessOrder: index + 1
      });
      ctx.addInventory(product, stock, purchasePrice);
      return { ...product, trackInventory: true, purchasePrice, stock, dealerPriceA, dealerPriceB, sortOrder: (index + 1) * 10, sku: `DEMO-MD-${String(index + 1).padStart(3, "0")}` };
    });
    const byKey = new Map(products.map((product) => [product.id.split("_").at(-1), product]));

    const supplierA = ctx.addSupplier({
      key: "toptan",
      name: "Demo Toptan Tedarik A.Ş.",
      phone: "+90 555 000 40 01",
      email: "toptan.tedarik@example.test",
      taxNumber: "3000000001"
    });
    ctx.addSupplier({
      key: "ambalaj",
      name: "Demo Ambalaj Sanayi Ltd.",
      phone: "+90 555 000 40 02",
      email: "ambalaj.sanayi@example.test",
      taxNumber: "3000000002"
    });

    db.prepare(`INSERT INTO purchase_orders
      (id, business_id, supplier_id, status, ordered_at, received_at, subtotal, total, currency, notes,
       created_at, updated_at, deleted_at)
      VALUES ('po_md_1', ?, ?, 'received', ?, ?, 35920, 35920, 'TRY', 'Sentetik demo toptan alımı.', ?, ?, '')`)
      .run(ctx.pack.business.id, supplierA, isoAt(-12, 9), isoAt(-10, 14), FIXED_NOW, FIXED_NOW);
    const purchaseItems = [
      ["poi_md_1", byKey.get("un-25kg"), 20, 470],
      ["poi_md_2", byKey.get("seker-5kg"), 30, 168],
      ["poi_md_3", byKey.get("zeytinyagi-5l"), 16, 980],
      ["poi_md_4", byKey.get("deterjan-5l"), 20, 290]
    ];
    for (const [id, product, quantity, unitCost] of purchaseItems) {
      db.prepare(`INSERT INTO purchase_order_items
        (id, purchase_order_id, product_id, product_name, quantity, unit_cost, line_total, created_at, updated_at)
        VALUES (?, 'po_md_1', ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, product.id, product.name, quantity, unitCost, quantity * unitCost, FIXED_NOW, FIXED_NOW);
    }

    const customers = [
      ["dealer_a", "Mavi Kıyı Market Ltd.", "50 01", "demo.mavi.kiyi@example.test", "Mavi Kıyı Market Ltd.", "dealer_a", "active", 30],
      ["dealer_b", "Yeşil Vadi Bakkaliyesi", "50 02", "demo.yesil.vadi@example.test", "Yeşil Vadi Bakkaliyesi", "dealer_b", "active", 15],
      ["dealer_passive", "Eski Çarşı Gıda", "50 03", "demo.eski.carsi@example.test", "Eski Çarşı Gıda", "dealer_a", "inactive", 0],
      ["retail", "Hale Yılmaz", "50 04", "demo.hale.yilmaz@example.test", "", "retail", "inactive", 0]
    ].map(([key, fullName, suffix, email, companyName, priceGroup, dealerStatus, paymentTermDays]) => {
      const customer = ctx.addCustomer({
        key,
        fullName,
        phone: `+90 555 000 ${suffix}`,
        email,
        birthDate: key === "retail" ? "1987-02-09" : "",
        address: key === "retail" ? "Örnek Mah. Demo Sok. No: 8, Bornova / İzmir" : ""
      });
      if (companyName) {
        ctx.addCommercialProfile(customer.id, {
          companyName,
          taxOffice: "Demo Vergi Dairesi",
          taxNumber: `30000000${suffix.replace(/\s+/g, "")}`,
          authorizedPerson: fullName,
          dealerStatus,
          priceGroup,
          paymentTermDays
        });
      }
      return { ...customer, key, fullName, phone: `+90 555 000 ${suffix}`, email, dealerStatus, priceGroup };
    });
    const customerByKey = new Map(customers.map((customer) => [customer.key, customer]));

    // Link two dealer customers to synthetic web accounts so the dealer publication is consumable.
    const linkedCustomers = [customerByKey.get("dealer_a"), customerByKey.get("dealer_b")];
    const accounts = linkedCustomers.map((customer, index) => {
      const accountId = `acct_demo_md_${index + 1}`;
      db.prepare("INSERT INTO web_customer_accounts (account_id, email, full_name, customer_id, status) VALUES (?, ?, ?, ?, 'linked')")
        .run(accountId, customer.email, customer.fullName, customer.id);
      db.prepare("UPDATE customer_web_access SET account_id = ?, updated_at = ? WHERE customer_id = ?")
        .run(accountId, FIXED_NOW, customer.id);
      return { accountId, customerId: customer.id, accessId: accessIdForCustomer(db, customer.id) };
    });

    // Online catalog publication for part of the catalog.
    let publicationCount = 0;
    for (const product of products) {
      if (publicationCount >= 9) break;
      db.prepare(`INSERT INTO commerce_product_publications
        (product_id, business_id, channel, is_published, title_override, description_override, sort_order, created_at, updated_at)
        VALUES (?, ?, 'online_sales', 1, '', '', ?, ?, ?)`)
        .run(product.id, ctx.pack.business.id, product.sortOrder, FIXED_NOW, FIXED_NOW);
      publicationCount += 1;
    }

    const dealerA = customerByKey.get("dealer_a");
    const dealerB = customerByKey.get("dealer_b");
    const shippingSnapshot = {
      method: "shipping",
      address: {
        recipientName: dealerA.fullName,
        addressLine1: "Örnek Sanayi Mah. Demo Bulvarı No: 24",
        addressLine2: "Depo 3",
        district: "Bornova",
        city: "İzmir",
        postalCode: "35000",
        countryCode: "TR",
        note: "Sentetik demo teslimat adresi."
      }
    };
    const pickupSnapshot = { method: "pickup", address: null };

    const order1 = addOrder(ctx, {
      id: "order_md_1",
      customerId: dealerA.id,
      customerName: dealerA.fullName,
      buyerSnapshot: { name: dealerA.fullName, phone: dealerA.phone, email: dealerA.email },
      deliverySnapshot: shippingSnapshot,
      status: "placed",
      sourceReference: "WEB-DEMO-1001",
      placedAt: isoAt(0, 9, 15),
      items: [
        { id: "order_item_md_1", product: byKey.get("un-25kg"), unitPrice: 520, quantity: 10, lineTotal: 5200 },
        { id: "order_item_md_2", product: byKey.get("seker-5kg"), unitPrice: 185, quantity: 20, lineTotal: 3700 },
        { id: "order_item_md_3", product: byKey.get("su-19l"), unitPrice: 78, quantity: 12, lineTotal: 936 }
      ]
    });
    const order2 = addOrder(ctx, {
      id: "order_md_2",
      customerId: dealerA.id,
      customerName: dealerA.fullName,
      buyerSnapshot: { name: dealerA.fullName, phone: dealerA.phone, email: dealerA.email },
      deliverySnapshot: pickupSnapshot,
      status: "confirmed",
      sourceReference: "WEB-DEMO-1002",
      placedAt: isoAt(-1, 11, 40),
      items: [
        { id: "order_item_md_4", product: byKey.get("cola-24"), unitPrice: 420, quantity: 6, lineTotal: 2520 },
        { id: "order_item_md_5", product: byKey.get("pecete-24"), unitPrice: 275, quantity: 4, lineTotal: 1100 }
      ]
    });
    const order3 = addOrder(ctx, {
      id: "order_md_3",
      customerId: dealerA.id,
      customerName: dealerA.fullName,
      buyerSnapshot: { name: dealerA.fullName, phone: dealerA.phone, email: dealerA.email },
      deliverySnapshot: shippingSnapshot,
      status: "fulfilled",
      sourceReference: "WEB-DEMO-1003",
      placedAt: isoAt(-3, 15, 5),
      fulfilledAt: isoAt(-2, 10, 30),
      items: [
        { id: "order_item_md_6", product: byKey.get("zeytinyagi-5l"), unitPrice: 1120, quantity: 4, lineTotal: 4480 }
      ]
    });
    const order4 = addOrder(ctx, {
      id: "order_md_4",
      customerId: dealerB.id,
      customerName: dealerB.fullName,
      buyerSnapshot: { name: dealerB.fullName, phone: dealerB.phone, email: dealerB.email },
      deliverySnapshot: pickupSnapshot,
      status: "cancelled",
      sourceReference: "WEB-DEMO-1004",
      placedAt: isoAt(-4, 16, 20),
      cancelledAt: isoAt(-4, 17, 0),
      items: [
        { id: "order_item_md_7", product: byKey.get("deterjan-5l"), unitPrice: 340, quantity: 3, lineTotal: 1020 }
      ]
    });

    // A credit sale for the wholesale customer with a partial collection.
    const creditTotal = 1500;
    db.prepare(`INSERT INTO commerce_sales
      (id, business_id, customer_id, status, subtotal, discount_total, total, currency, payment_method,
       source, opened_at, closed_at, created_at, updated_at, deleted_at)
      VALUES ('sale_md_credit_1', ?, ?, 'credit', ?, 0, ?, 'TRY', '',
       'desktop-market-quick-sale', ?, ?, ?, ?, '')`)
      .run(ctx.pack.business.id, dealerB.id, creditTotal, creditTotal, isoAt(-6, 13, 10), isoAt(-6, 13, 25), FIXED_NOW, FIXED_NOW);
    db.prepare(`INSERT INTO commerce_sale_items
      (id, sale_id, product_id, product_name, barcode, unit_price, quantity, line_total, created_at)
      VALUES ('sale_item_md_credit_1', 'sale_md_credit_1', ?, ?, ?, 300, 5, 1500, ?)`)
      .run(byKey.get("pirinc-5kg").id, byKey.get("pirinc-5kg").name, byKey.get("pirinc-5kg").barcode, FIXED_NOW);
    db.prepare(`INSERT INTO customer_credit_entries
      (id, business_id, customer_id, direction, amount_minor, currency, entry_type, sale_id, payment_method,
       occurred_at, note, source, created_at, updated_at)
      VALUES ('credit_md_sale_1', ?, ?, 'debit', 150000, 'TRY', 'credit_sale', 'sale_md_credit_1', '',
       ?, 'Sentetik demo veresiye satışı.', 'desktop', ?, ?)`)
      .run(ctx.pack.business.id, dealerB.id, isoAt(-6, 13, 25), FIXED_NOW, FIXED_NOW);
    db.prepare(`INSERT INTO customer_credit_entries
      (id, business_id, customer_id, direction, amount_minor, currency, entry_type, sale_id, payment_method,
       occurred_at, note, source, created_at, updated_at)
      VALUES ('credit_md_payment_1', ?, ?, 'credit', 50000, 'TRY', 'payment', NULL, 'bank',
       ?, 'Sentetik demo kısmi tahsilat.', 'desktop', ?, ?)`)
      .run(ctx.pack.business.id, dealerB.id, isoAt(-2, 14, 0), FIXED_NOW, FIXED_NOW);
    finance.synchronizeFinanceSourceInTransaction(db, "customer_credit_payment", "credit_md_payment_1");

    // Benefits rules are written through the production validator after commit.
    const nowMs = Date.parse(FIXED_NOW);
    ctx.runAfterCommit(() => seedDealerBenefits(db, ctx.pack.business.id, nowMs));

    db.prepare(`INSERT INTO commerce_benefit_point_ledger
      (business_id, id, customer_id, currency, kind, amount_minor, source_kind, source_id, operation_key,
       linked_entry_id, expires_at_ms, created_at_ms)
      VALUES (?, 'point_md_grant_1', ?, 'TRY', 'grant', 5000, 'demo', 'opening', 'demo-op-md-points-1',
       NULL, ?, ?)`)
      .run(ctx.pack.business.id, dealerA.id, Date.parse("2027-11-30T00:00:00.000Z"), nowMs);

    const dealerAccess = {
      dealerA: accessIdForCustomer(db, dealerA.id),
      dealerB: accessIdForCustomer(db, dealerB.id)
    };

    ctx.expected = {
      counts: {
        products: products.length,
        customers: customers.length,
        suppliers: 2,
        purchaseOrders: 1,
        orders: 4,
        creditEntries: 2,
        publishedProducts: publicationCount
      },
      readChecks: {
        catalogProducts: products.length,
        suppliers: 2,
        purchaseOrders: 1,
        orders: 4,
        dealerOrders: 3,
        dealerAccessEligible: true,
        dealerCatalogProducts: products.length,
        creditBalanceMinor: 100000,
        benefitRules: 2,
        pointBalanceMinor: 5000,
        publishedProducts: publicationCount
      },
      ids: {
        dealerA: dealerA.id,
        dealerB: dealerB.id,
        dealerAccessA: dealerAccess.dealerA,
        productUn: byKey.get("un-25kg").id,
        orderPlaced: order1.id,
        orderConfirmed: order2.id,
        orderFulfilled: order3.id,
        orderCancelled: order4.id,
        saleCredit: "sale_md_credit_1",
        accounts
      }
    };
  }
};
