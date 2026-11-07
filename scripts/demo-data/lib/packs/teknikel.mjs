import { createRequire } from "node:module";
import path from "node:path";
import { FIXED_NOW, insertRow, isoAt, json, sha256Text, writeJson } from "../util.mjs";
import { loadTeknikelSources, TEKNIKEL_DATA_PROVENANCE, TEKNIKEL_PHOTO_PROVENANCE } from "../teknikel-sources.mjs";

const require = createRequire(import.meta.url);
const { synchronizeFinanceSourceInTransaction } = require("../../../../apps/desktop-app/dist-electron/finance.js");
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;

function seedOrders(ctx, customers, products) {
  const scenarios = [
    ["placed", customers[20], 0, [products[0], products[1]]],
    ["confirmed", customers[21], -1, [products[2], products[3]]],
    ["fulfilled", customers[0], -4, [products[4], products[5]]],
    ["cancelled", customers[22], -5, [products[6], products[7]]]
  ];
  scenarios.forEach(([status, customer, day, selected], index) => {
    const id = `order_tk_${index + 1}`;
    const placedAt = isoAt(day, 9, 15);
    const group = customer.dealerStatus === "active" ? customer.priceGroup : "retail";
    const items = selected.map((product, itemIndex) => {
      const quantity = itemIndex + 1;
      const unitPrice = group === "dealer_a" ? product.dealerPriceA : group === "dealer_b" ? product.dealerPriceB : product.salePrice;
      return { product, quantity, unitPrice, lineTotal: money(quantity * unitPrice) };
    });
    const total = money(items.reduce((sum, item) => sum + item.lineTotal, 0));
    insertRow(ctx.db, "commerce_orders", {
      id, business_id: ctx.pack.business.id, customer_id: customer.id, customer_name: customer.fullName,
      buyer_snapshot_json: json({ name: customer.fullName, phone: customer.phone, email: customer.email }),
      delivery_snapshot_json: json({ method: "pickup", address: null }),
      status, source: "desktop", source_reference: `DEMO-TK-${1001 + index}`,
      subtotal: total, discount_total: 0, total, currency: "TRY",
      note: "DEMO sentetik sipariş; gerçek satış/teslimat değildir. Kaynak ürünler ve demo fiyat senaryosu.",
      placed_at: placedAt,
      confirmed_at: ["confirmed", "fulfilled"].includes(status) ? isoAt(day, 10) : "",
      fulfilled_at: status === "fulfilled" ? isoAt(day + 1, 10) : "",
      cancelled_at: status === "cancelled" ? isoAt(day, 10) : "",
      created_at: placedAt, updated_at: status === "fulfilled" ? isoAt(day + 1, 10) : isoAt(day, 10), deleted_at: ""
    });
    items.forEach((item, itemIndex) => insertRow(ctx.db, "commerce_order_items", {
      id: `order_item_tk_${index + 1}_${itemIndex + 1}`, order_id: id,
      product_id: item.product.id, product_name: item.product.name, sku: item.product.sku,
      barcode: "", unit: "piece", unit_price: item.unitPrice, quantity: item.quantity,
      line_total: item.lineTotal, tax_rate: 20, created_at: placedAt
    }));
  });
}

function seedPurchaseAndCredit(ctx, customer, products) {
  const supplier = ctx.addSupplier({ key: "supplier", name: "DEMO Kombi Parça Tedarikçisi", phone: "+90 555 000 90 01", email: "teknikel.supplier@example.test" });
  const selected = products.slice(0, 3);
  const total = money(selected.reduce((sum, product) => sum + product.purchasePrice * 5, 0));
  insertRow(ctx.db, "purchase_orders", {
    id: "po_tk_1", business_id: ctx.pack.business.id, supplier_id: supplier, status: "draft",
    subtotal: total, total, currency: "TRY", notes: "DEMO taslak satın alma; sentetik maliyet, teslim alınmadı ve stok etkisi yok.",
    created_at: isoAt(-1, 10), updated_at: isoAt(-1, 10), deleted_at: ""
  });
  selected.forEach((product, index) => insertRow(ctx.db, "purchase_order_items", {
    id: `poi_tk_${index + 1}`, purchase_order_id: "po_tk_1", product_id: product.id, product_name: product.name,
    quantity: 5, unit_cost: product.purchasePrice, line_total: money(product.purchasePrice * 5), created_at: isoAt(-1, 10), updated_at: isoAt(-1, 10)
  }));

  const product = products[0];
  const creditTotal = money(product.dealerPriceB * 2);
  const paymentMinor = Math.round(creditTotal * 100 / 3);
  const soldAt = isoAt(-6, 13);
  insertRow(ctx.db, "commerce_sales", {
    id: "sale_tk_credit_1", business_id: ctx.pack.business.id, customer_id: customer.id, status: "credit",
    subtotal: creditTotal, total: creditTotal, currency: "TRY", source: "desktop-market-quick-sale",
    opened_at: soldAt, closed_at: soldAt, created_at: soldAt, updated_at: soldAt
  });
  insertRow(ctx.db, "commerce_sale_items", {
    id: "sale_item_tk_credit_1", sale_id: "sale_tk_credit_1", product_id: product.id, product_name: product.name,
    unit_price: product.dealerPriceB, quantity: 2, line_total: creditTotal, created_at: soldAt
  });
  ctx.db.prepare("UPDATE inventory_balances SET quantity = quantity - 2 WHERE product_id = ?").run(product.id);
  insertRow(ctx.db, "inventory_movements", {
    id: "mov_tk_credit_1", business_id: ctx.pack.business.id, product_id: product.id, location_id: ctx.primaryLocationId,
    movement_type: "sale", quantity_delta: -2, quantity_after: product.stock - 2, unit_cost: product.purchasePrice,
    reference_type: "sale", reference_id: "sale_tk_credit_1", note: "DEMO sentetik veresiye satışı", actor_source: "desktop", created_at: soldAt
  });
  for (const [id, direction, amountMinor, entryType, saleId, method, occurredAt, note] of [
    ["credit_tk_sale_1", "debit", Math.round(creditTotal * 100), "credit_sale", "sale_tk_credit_1", "", soldAt, "DEMO sentetik veresiye satışı"],
    ["credit_tk_payment_1", "credit", paymentMinor, "payment", null, "bank", isoAt(-2, 10), "DEMO sentetik kısmi tahsilat; gerçek ödeme değildir"]
  ]) insertRow(ctx.db, "customer_credit_entries", {
    id, business_id: ctx.pack.business.id, customer_id: customer.id, direction, amount_minor: amountMinor,
    currency: "TRY", entry_type: entryType, sale_id: saleId, payment_method: method, occurred_at: occurredAt,
    note, source: "desktop", created_at: occurredAt, updated_at: occurredAt
  });
  synchronizeFinanceSourceInTransaction(ctx.db, "customer_credit_payment", "credit_tk_payment_1");
  return Math.round(creditTotal * 100) - paymentMinor;
}

// Loading happens only after explicit --only d selection, before output is touched.
export function createTeknikelPack(options) {
  const source = loadTeknikelSources(options);
  return {
    id: "d-teknikel", key: "tk", folderName: "yardimci-asistan-demo-d-teknikel", title: "Teknikel Kombi — DEMO",
    extraCapabilities: ["commerce.wholesale", "channel.online_sales", "commerce.customer_credit"],
    business: {
      id: "biz_demo_teknikel", name: "Teknikel Kombi — DEMO", displayName: "Teknikel Kombi DEMO", profileId: "market",
      phone: "+90 555 000 00 04", whatsapp: "+90 555 000 00 04", email: "teknikel.demo@example.test",
      address: "DEMO Test Mah. Örnek Cad. No: 4, Ankara (gerçek adres değildir)",
      publishRoomsWeb: false, publishTablesWeb: false, publishQrMenuWeb: false,
      publicProfile: {
        description: "DEMO: Teknikel kaynak kataloğu ile sentetik bayi ve sipariş senaryoları.",
        about: `${TEKNIKEL_DATA_PROVENANCE} ${TEKNIKEL_PHOTO_PROVENANCE}`,
        directions: "DEMO adres; gerçek işletme konumu değildir.", policyNote: "Yalnız demo; satış ve davet gönderimi yapılmaz.",
        paymentNote: "Fiyatlar kaynak anlık görüntüsü veya sentetik demo türetimidir; gerçek teklif/tahsilat değildir."
      }
    },
    // Demo starts with pickup only; Aras credentials can never be seeded into a backup.
    // An enabled shipping method without main-process test evidence blocks every Settings save.
    settings: { dealerApplicationEnabled: false, dealerPortalEnabled: false, onlineSalesDelivery: true, onlineSalesPickup: true, onlineSalesShipping: false },
    seed(ctx) {
      const categories = new Map(source.catalog.categories.map((category, index) => [category.source_category_id,
        ctx.addCategory({ id: `cat_tk_${category.source_category_id === "__OTHER__" ? "other" : category.source_category_id}`, name: category.name, code: category.source_category_id, sortOrder: (index + 1) * 10 })]));
      const originals = [];
      let featuredCount = 0;
      const products = source.catalog.products.map((input, index) => {
        const salePrice = Number(input.sale_price_gross_try);
        const purchasePrice = money(salePrice * 0.6), dealerPriceA = money(salePrice * 0.9), dealerPriceB = money(salePrice * 0.85);
        const stock = 8 + (index * 7) % 45;
        const curated = input.source_category_id !== "__OTHER__";
        const originalAssets = input.image_files.map(name => source.images.get(name));
        const product = ctx.addProduct({
          key: input.sku, sku: input.sku, name: input.name, brand: input.brand ?? "", categoryId: categories.get(input.source_category_id),
          salePrice, purchasePrice, dealerPriceA, dealerPriceB, taxRate: 20, unit: "piece", sortOrder: (index + 1) * 10,
          minimumQuantity: 3, quickAccess: curated, quickAccessOrder: index + 1, originalAssets,
          description: `${input.description ?? input.name} — DEMO: stok, alış maliyeti, bayi A/B fiyatları ve %20 vergi sentetik yer tutucudur. Kaynak brüt TRY fiyatı gerçek teklif değildir.${curated ? "" : " Diğer: kategori incelemesi bekler; web yayını kapalıdır."}`,
          dataSource: "teknikel-public-catalog/demo-data-generator", dataLicense: TEKNIKEL_DATA_PROVENANCE,
          sourceProductUrl: input.source_url ?? "", imageSourceUrl: originalAssets[0]?.sourceUrl ?? "",
          imageLicense: originalAssets.length ? TEKNIKEL_PHOTO_PROVENANCE : ""
        });
        ctx.addInventory(product, stock, purchasePrice);
        for (const asset of originalAssets) originals.push({ productId: product.id, sku: input.sku, assetPath: `assets/products/${product.id}/${asset.fileName}`, hash: asset.hash, format: asset.format, sourceUrl: asset.sourceUrl });
        if (curated) {
          const featured = featuredCount < 4;
          insertRow(ctx.db, "commerce_product_publications", {
            product_id: product.id, business_id: ctx.pack.business.id, channel: "online_sales", is_published: 1,
            sort_order: (index + 1) * 10,
            is_featured: featured ? 1 : 0, featured_order: featured ? featuredCount * 10 : 0,
            created_at: FIXED_NOW, updated_at: FIXED_NOW
          });
          featuredCount++;
        }
        return { ...product, sku: input.sku, dealerPriceA, dealerPriceB, purchasePrice, stock, curated };
      });
      const customers = source.customers.map((input, index) => {
        const customer = ctx.addCustomer({ ...input, key: String(index + 1).padStart(2, "0"), notes: `${input.notes} · DEMO sentetik kayıt; e-posta example.test olarak normalleştirildi; web hesabı/davet yok.` });
        if (input.companyName) ctx.addCommercialProfile(customer.id, { ...input, paymentTermDays: Number(input.paymentTermDays) });
        return { ...input, ...customer };
      });
      const curated = products.filter(product => product.curated);
      seedOrders(ctx, customers, curated);
      const creditBalanceMinor = seedPurchaseAndCredit(ctx, customers[21], curated);
      // Opening movements precede the dated credit sale in the stock ledger.
      ctx.db.prepare("UPDATE inventory_movements SET created_at = ? WHERE reference_type = 'demo_seed'").run(isoAt(-14, 9));
      writeJson(path.join(ctx.folderPath, "assets", "TEKNIKEL_SOURCE_MANIFEST.json"), {
        format: "teknikel-demo-sources-v1", sourceHashes: source.sourceHashes,
        dataProvenance: TEKNIKEL_DATA_PROVENANCE, photoProvenance: TEKNIKEL_PHOTO_PROVENANCE,
        customerNotice: "30 synthetic CSV identities; example.com normalized to example.test; no web accounts, invitations or sends.",
        publicationNotice: "28 source-categorized products only; 151 Diğer records are desktop-only pending category review.",
        originalFileCount: originals.length, uniqueContentHashes: new Set(originals.map(asset => asset.hash)).size,
        duplicateNotice: "All 68 original files retained. The Kalisto board gallery has two filenames with identical bytes; the canonical reader deduplicates by hash.",
        originals
      });
      ctx.expected = {
        counts: { products: 179, categories: 25, productOriginals: 68, uniqueImageHashes: 67, photographedProducts: 35, customers: 30, retailCustomers: 10, activeDealers: 10, inactiveDealers: 10, commercialProfiles: 20, publishedProducts: 28, orders: 4, suppliers: 1, purchaseOrders: 1, creditEntries: 2 },
        readChecks: {
          catalogIdentitySha256: source.catalogIdentitySha256,
          customerIdentitySha256: sha256Text(json(customers.map(customer => [customer.fullName, customer.phone, customer.email]))),
          originalAssetsSha256: sha256Text(json(originals)), creditBalanceMinor
        },
        ids: { dealerA: customers[20].id, dealerB: customers[21].id, inactiveDealer: customers[10].id, retail: customers[0].id, priceProduct: curated[0].id }
      };
    }
  };
}
