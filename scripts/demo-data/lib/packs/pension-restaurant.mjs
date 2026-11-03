import { FIXED_NOW, isoAt, isoDate, json } from "../util.mjs";
import { DEMO_PALETTES } from "../png.mjs";

const requireModule = (await import("node:module")).createRequire(import.meta.url);
const finance = requireModule("../../../../apps/desktop-app/dist-electron/finance.js");
const benefitRules = requireModule("../../../../apps/desktop-app/dist-electron/commerce-benefits-rules.js");

export const pensionRestaurantPack = {
  id: "a-pension-restaurant",
  key: "pr",
  folderName: "yardimci-asistan-demo-a-pension-restaurant",
  title: "Pansiyon + Restoran",
  extraCapabilities: [],
  // Representative CC BY 4.0 panoramas, not photographs of this synthetic business.
  // One genuine 360° and one genuine 180° file per source image.
  panoramaMedia: [
    { scope: "room", resourceId: "room_pr_101", id: "room_media_demo_pr_101_360", sourceKey: "room-360", sortOrder: 1 },
    { scope: "room", resourceId: "room_pr_102", id: "room_media_demo_pr_102_180", sourceKey: "room-180", sortOrder: 1 },
    { scope: "table", resourceId: "tbl_pr_m1", id: "table_media_demo_pr_m1_360", sourceKey: "restaurant-360", sortOrder: 1 },
    { scope: "table", resourceId: "tbl_pr_m2", id: "table_media_demo_pr_m2_180", sourceKey: "restaurant-180", sortOrder: 1 }
  ],
  // Original synthetic covers guarantee that every restored room and table has
  // a real image even before any optional panorama is published.
  coverMedia: [
    { scope: "room", resourceId: "room_pr_101", id: "room_media_demo_pr_101_cover", palette: DEMO_PALETTES.roomSea, variant: 0, sortOrder: 0, title: "Deniz Manzaralı Oda" },
    { scope: "room", resourceId: "room_pr_102", id: "room_media_demo_pr_102_cover", palette: DEMO_PALETTES.roomGarden, variant: 0, sortOrder: 0, title: "Bahçe Odası" },
    { scope: "room", resourceId: "room_pr_201", id: "room_media_demo_pr_201_cover", palette: DEMO_PALETTES.roomOlive, variant: 0, sortOrder: 0, title: "Zeytin Odası" },
    { scope: "room", resourceId: "room_pr_202", id: "room_media_demo_pr_202_cover", palette: DEMO_PALETTES.roomSuite, variant: 0, sortOrder: 0, title: "Manzara Süiti" },
    { scope: "table", resourceId: "tbl_pr_m1", id: "table_media_demo_pr_m1_cover", palette: DEMO_PALETTES.tableIndoor, variant: 0, sortOrder: 0, title: "Masa M1" },
    { scope: "table", resourceId: "tbl_pr_m2", id: "table_media_demo_pr_m2_cover", palette: DEMO_PALETTES.tableIndoor, variant: 1, sortOrder: 0, title: "Masa M2" },
    { scope: "table", resourceId: "tbl_pr_m3", id: "table_media_demo_pr_m3_cover", palette: DEMO_PALETTES.tableIndoor, variant: 2, sortOrder: 0, title: "Masa M3" },
    { scope: "table", resourceId: "tbl_pr_b1", id: "table_media_demo_pr_b1_cover", palette: DEMO_PALETTES.tableGarden, variant: 0, sortOrder: 0, title: "Masa B1" },
    { scope: "table", resourceId: "tbl_pr_b2", id: "table_media_demo_pr_b2_cover", palette: DEMO_PALETTES.tableGarden, variant: 1, sortOrder: 0, title: "Masa B2" },
    { scope: "table", resourceId: "tbl_pr_b3", id: "table_media_demo_pr_b3_cover", palette: DEMO_PALETTES.tableGarden, variant: 2, sortOrder: 0, title: "Masa B3" }
  ],
  business: {
    id: "biz_demo_pension_restaurant",
    name: "Yamaç Konak ve Sofra",
    displayName: "Yamaç Konak & Sofra",
    profileId: "pension_restaurant",
    phone: "+90 555 000 00 01",
    whatsapp: "+90 555 000 00 01",
    email: "pansiyon.demo@example.test",
    address: "Örnek Mah. Test Sok. No: 1, Kaş / Antalya",
    publishRoomsWeb: true,
    publishTablesWeb: true,
    publishQrMenuWeb: true,
    publicProfile: {
      description: "Deniz manzaralı sentetik demo pansiyon ve restoran işletmesi.",
      about: "Bu kayıt, Yardımcı Asistan demo veri paketi için üretilmiş tamamen sentetik bir işletmedir. Gerçek müşteri, rezervasyon veya ödeme bilgisi içermez.",
      latitude: 36.2015,
      longitude: 29.6417,
      directions: "Demo otogarından Örnek Mahallesi yönüne 5 dakika.",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      breakfastStartTime: "08:30",
      breakfastEndTime: "10:30",
      features: ["wifi", "parking", "garden", "family_friendly"],
      policyNote: "Sentetik demo kaydıdır; gerçek konaklama taahhüdü içermez.",
      paymentNote: "Demo ödeme notu: nakit, kart ve havale kabul edilir."
    }
  },
  settings: {},
  seed(ctx) {
    const { db } = ctx;

    const categoryIds = {
      breakfast: ctx.addCategory({ id: "cat_pr_breakfast", name: "Kahvaltı", code: "KAH", sortOrder: 10 }),
      starter: ctx.addCategory({ id: "cat_pr_starter", name: "Başlangıçlar", code: "BAS", sortOrder: 20 }),
      main: ctx.addCategory({ id: "cat_pr_main", name: "Ana Yemekler", code: "ANA", sortOrder: 30 }),
      dessert: ctx.addCategory({ id: "cat_pr_dessert", name: "Tatlılar", code: "TAT", sortOrder: 40 }),
      drink: ctx.addCategory({ id: "cat_pr_drink", name: "İçecekler", code: "ICE", sortOrder: 50 })
    };

    const products = [
      ["serpme-kahvalti", "Serpme Kahvaltı", categoryIds.breakfast, 320, 128, 10, DEMO_PALETTES.breakfast, 1, 25],
      ["menemen", "Kaşarlı Menemen", categoryIds.breakfast, 145, 52, 10, DEMO_PALETTES.breakfast, 2, 40],
      ["coban-salata", "Çoban Salata", categoryIds.starter, 95, 30, 10, DEMO_PALETTES.salad, 3, 30],
      ["yaprak-sarma", "Zeytinyağlı Yaprak Sarma", categoryIds.starter, 120, 44, 10, DEMO_PALETTES.salad, 4, 20],
      ["izgara-levrek", "Izgara Levrek", categoryIds.main, 380, 190, 10, DEMO_PALETTES.fish, 5, 12],
      ["tavuk-sis", "Tavuk Şiş", categoryIds.main, 290, 132, 10, DEMO_PALETTES.chicken, 6, 20],
      ["manti", "Fırın Mantı", categoryIds.main, 210, 76, 10, DEMO_PALETTES.pasta, 7, 18],
      ["sutlac", "Fırın Sütlaç", categoryIds.dessert, 85, 26, 10, DEMO_PALETTES.dessert, 8, 15],
      ["ev-keki", "Ev Yapımı Kek", categoryIds.dessert, 90, 28, 10, DEMO_PALETTES.dessert, 9, 12],
      ["ayran", "Ayran", categoryIds.drink, 40, 12, 10, DEMO_PALETTES.drink, 10, 50],
      ["limonata", "Ev Limonatası", categoryIds.drink, 65, 18, 10, DEMO_PALETTES.drink, 11, 40],
      ["turk-kahvesi", "Türk Kahvesi", categoryIds.drink, 55, 14, 20, DEMO_PALETTES.coffee, 12, 100],
      ["kasarli-tost", "Kaşarlı Tost", categoryIds.breakfast, 110, 38, 10, DEMO_PALETTES.pasta, 13, 24],
      ["mevsim-meyvesi", "Mevsim Meyvesi", categoryIds.dessert, 75, 22, 10, DEMO_PALETTES.fruit, 14, 16]
    ].map(([key, name, categoryId, salePrice, purchasePrice, taxRate, palette, sortOrder, stock]) => {
      const product = ctx.addProduct({
        key,
        name,
        categoryId,
        salePrice,
        purchasePrice,
        taxRate,
        sortOrder,
        palette,
        paletteVariant: sortOrder,
        sku: `DEMO-PR-${String(sortOrder).padStart(3, "0")}`,
        brand: "Demo Mutfak",
        description: `${name} — sentetik demo menü ürünü.`,
        trackInventory: true,
        minimumQuantity: 4,
        quickAccess: sortOrder <= 3,
        quickAccessOrder: sortOrder
      });
      ctx.addInventory(product, stock, purchasePrice);
      return { ...product, stock, categoryId, sortOrder, trackInventory: true };
    });
    const byKey = new Map(products.map((product) => [product.id.split("_").at(-1), product]));

    const menuCategoryIds = {
      breakfast: "menu_cat_pr_breakfast",
      starter: "menu_cat_pr_starter",
      main: "menu_cat_pr_main",
      dessert: "menu_cat_pr_dessert",
      drink: "menu_cat_pr_drink"
    };
    const menuCategories = [
      [menuCategoryIds.breakfast, "Kahvaltı", "Günün ilk öğünü", 10],
      [menuCategoryIds.starter, "Başlangıçlar", "Paylaşmalık başlangıçlar", 20],
      [menuCategoryIds.main, "Ana Yemekler", "Sıcak ana yemekler", 30],
      [menuCategoryIds.dessert, "Tatlılar", "Ev yapımı tatlılar", 40],
      [menuCategoryIds.drink, "İçecekler", "Sıcak ve soğuk içecekler", 50]
    ];
    for (const [id, name, description, sortOrder] of menuCategories) {
      db.prepare(`INSERT INTO menu_categories
        (id, name, description, is_active, sort_order, created_at, updated_at, deleted_at, sync_status)
        VALUES (?, ?, ?, 1, ?, ?, ?, '', 'local_only')`)
        .run(id, name, description, sortOrder, FIXED_NOW, FIXED_NOW);
    }

    const menuCategoryForProduct = {
      breakfast: menuCategoryIds.breakfast,
      starter: menuCategoryIds.starter,
      main: menuCategoryIds.main,
      dessert: menuCategoryIds.dessert,
      drink: menuCategoryIds.drink
    };
    const menuEntries = new Map();
    for (const product of products) {
      const key = product.id.split("_").at(-1);
      const entryId = `menu_pr_${key}`;
      const categoryId = menuCategoryForProduct[
        product.categoryId === categoryIds.drink ? "drink" : product.categoryId === categoryIds.dessert ? "dessert" : product.categoryId === categoryIds.main ? "main" : product.categoryId === categoryIds.starter ? "starter" : "breakfast"
      ];
      db.prepare(`INSERT INTO menu_product_entries
        (id, product_id, category_id, is_available, is_featured, price_override, allergens_json, tags_json,
         hide_when_out_of_stock, stock_consumption_quantity, sort_order, created_at, updated_at, deleted_at, sync_status)
        VALUES (?, ?, ?, 1, ?, NULL, ?, ?, ?, 1, ?, ?, ?, '', 'local_only')`)
        .run(
          entryId,
          product.id,
          categoryId,
          ["serpme-kahvalti", "izgara-levrek"].includes(key) ? 1 : 0,
          json(key.includes("sutlac") || key.includes("kek") ? ["süt", "gluten", "yumurta"] : key.includes("levrek") ? ["balık"] : key.includes("manti") ? ["gluten", "süt"] : []),
          json(key.includes("salata") || key.includes("sarma") ? ["vejetaryen"] : key.includes("levrek") ? ["deniz ürünü"] : []),
          product.trackInventory ? 1 : 0,
          product.sortOrder,
          FIXED_NOW,
          FIXED_NOW
        );
      menuEntries.set(key, entryId);
    }

    // Rooms and stays.
    const rooms = [
      ["room_pr_101", "Deniz Manzaralı Oda", "101", 2, "1 çift kişilik yatak", "1. Kat", "occupied", 185000, ["wifi", "air_conditioning", "sea_view"], "Deniz manzarasına bakan geniş bir odadır. Sabah kahvaltısı ana binadaki sofrada servis edilir; gün batımını balkondan izleyebilirsiniz. Bu kayıt tamamen sentetik demo verisidir ve gerçek bir konaklama taahhüdü içermez."],
      ["room_pr_102", "Bahçe Odası", "102", 2, "2 tek kişilik yatak", "1. Kat", "available", 165000, ["wifi", "air_conditioning", "garden_view"], "Bahçeye açılan sakin bir odadır. İki tek kişilik yatak, çalışma köşesi ve özel banyo bulunur. Kahvaltı dahil değildir; sentetik demo kaydıdır."],
      ["room_pr_201", "Zeytin Odası", "201", 3, "1 çift kişilik + 1 tek kişilik yatak", "2. Kat", "available", 210000, ["wifi", "air_conditioning", "balcony"], "Üç kişilik aile odasıdır. Balkonunda oturma alanı, içinde geniş bir banyo ve bagaj dolabı vardır. Demo amaçlı üretilmiş örnek bir odadır."],
      ["room_pr_202", "Manzara Süiti", "202", 4, "1 çift kişilik + 2 tek kişilik yatak", "2. Kat", "available", 275000, ["wifi", "air_conditioning", "balcony", "mini_fridge"], "İki odalı süittir; geniş balkonu ve oturma alanıyla uzun konaklamalar için uygundur. Mini buzdolabı ve çay-kahve köşesi bulunur. Sentetik demo süitidir."]
    ];
    for (const [id, name, number, capacity, bedInfo, floor, status, nightlyPriceMinor, features, description] of rooms) {
      db.prepare(`INSERT INTO rooms
        (id, name, number, capacity, bed_info, floor, status, features_json, description, price_note,
         is_active, sort_order, created_at, updated_at, deleted_at, sync_status, nightly_price_minor, price_currency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, '', 'local_only', ?, 'TRY')`)
        .run(id, name, number, capacity, bedInfo, floor, status, json(features), description,
          `${nightlyPriceMinor / 100} TL / gece`, Number(number), FIXED_NOW, FIXED_NOW, nightlyPriceMinor);
    }

    const tables = [
      ["tbl_pr_m1", "Masa M1", "İç Salon", 4, "occupied", "non_smoking"],
      ["tbl_pr_m2", "Masa M2", "İç Salon", 2, "available", "non_smoking"],
      ["tbl_pr_m3", "Masa M3", "İç Salon", 4, "reserved", "non_smoking"],
      ["tbl_pr_b1", "Masa B1", "Bahçe", 4, "available", "outdoor_only"],
      ["tbl_pr_b2", "Masa B2", "Bahçe", 6, "available", "outdoor_only"],
      ["tbl_pr_b3", "Masa B3", "Bahçe", 2, "available", "outdoor_only"]
    ];
    for (const [id, name, area, capacity, status, smoking] of tables) {
      const description = area === "Bahçe"
        ? `${name}, bahçe katında gölgelik altında konumlanır. ${capacity} kişilik oturma düzeni ve geniş servis alanı vardır. Bu kayıt sentetik demo verisidir.`
        : `${name}, iç salonda pencereden uzakta sakin bir köşede yer alır. ${capacity} kişiliktir ve akşam yemeği için uygundur. Bu kayıt sentetik demo verisidir.`;
      db.prepare(`INSERT INTO tables
        (id, name, area, capacity, public_description, public_features_json, smoking_policy, status,
         current_customer_id, current_reservation_id, notes, is_active, sort_order, created_at, updated_at, deleted_at, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, 1, ?, ?, ?, '', 'local_only')`)
        .run(id, name, area, capacity, description, json(area === "Bahçe" ? ["outdoor", "garden_view"] : ["indoor"]), smoking, status,
          status === "reserved" ? "res_res_pr_table" : "", "", Number(name.match(/\d+/)?.[0] ?? 0), FIXED_NOW, FIXED_NOW);
    }

    const customers = [
      ["zeynep", "Zeynep Demir", "10 01", "demo.zeynep.demir@example.test", "1988-04-12", "Örnek Mah. Test Sok. No: 11, Kaş / Antalya"],
      ["ayse", "Ayşe Yıldız", "10 02", "demo.ayse.yildiz@example.test", "1992-09-23", "Örnek Mah. Deneme Cad. No: 4, Kaş / Antalya"],
      ["mehmet", "Mehmet Kaya", "10 03", "demo.mehmet.kaya@example.test", "1985-01-30", "Örnek Mah. Test Sok. No: 7, Kaş / Antalya"],
      ["selin", "Selin Aydın", "10 04", "demo.selin.aydin@example.test", "1996-07-08", "Örnek Mah. Demo Cad. No: 2, Kaş / Antalya"],
      ["emre", "Emre Şahin", "10 05", "demo.emre.sahin@example.test", "1990-12-17", ""],
      ["burak", "Burak Çetin", "10 06", "demo.burak.cetin@example.test", "1979-03-05", ""],
      ["nur", "Nur Aksoy", "10 07", "demo.nur.aksoy@example.test", "1998-11-11", ""],
      ["deniz", "Deniz Koç", "10 08", "demo.deniz.koc@example.test", "1983-06-19", ""]
    ].map(([key, fullName, suffix, email, birthDate, address]) => ctx.addCustomer({
      key,
      fullName,
      phone: `+90 555 000 ${suffix}`,
      email,
      birthDate,
      address
    }));
    const customerByKey = new Map(customers.map((customer) => [customer.id.split("_").at(-1), customer]));

    const reservations = [
      ["res_pr_room_stay", "zeynep", "room", "approved", "Zeynep Demir konaklaması", isoDate(-3), isoDate(2), "", 2, 2, 0, ["room_pr_101"], [], 925000],
      ["res_pr_room_future", "ayse", "room", "approved", "Ayşe Yıldız kasım konaklaması", isoDate(3), isoDate(6), "", 2, 2, 0, ["room_pr_201"], [], 555000],
      ["res_pr_table_today", "mehmet", "table", "approved", "Mehmet Kaya akşam yemeği", isoDate(0), isoDate(0), "19:30", 4, 4, 0, [], ["tbl_pr_m3"], 0],
      ["res_pr_table_weekend", "selin", "table", "pending", "Selin Aydın hafta sonu rezervasyonu", isoDate(4), isoDate(4), "20:00", 2, 2, 0, [], ["tbl_pr_b1"], 0]
    ];
    for (const [id, customerKey, type, status, title, startDate, endDate, time, guestCount, adultCount, childCount, roomIds, tableIds, agreedTotalMinor] of reservations) {
      db.prepare(`INSERT INTO reservations
        (id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
         guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
         payment_status, created_at, updated_at, deleted_at, sync_status, agreed_total_minor, currency)
        VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, '', 'local_only', ?, 'TRY')`)
        .run(id, customerByKey.get(customerKey).id, type, status, title, startDate, endDate, time,
          guestCount, adultCount, childCount, json(roomIds), json(tableIds),
          "Sentetik demo rezervasyonu.", "Demo fiyat notu", FIXED_NOW, FIXED_NOW, agreedTotalMinor);
    }

    // Pension deposit for the checked-in stay.
    db.prepare(`INSERT INTO pension_payments
      (id, reservation_id, amount_minor, currency, payment_method, paid_at, note, created_at, updated_at, deleted_at, sync_status)
      VALUES ('pay_pr_deposit_001', 'res_pr_room_stay', 300000, 'TRY', 'card', ?, 'Demo ön ödeme', ?, ?, '', 'local_only')`)
      .run(isoAt(-5, 11), FIXED_NOW, FIXED_NOW);
    finance.synchronizeFinanceSourceInTransaction(db, "pension_payment", "pay_pr_deposit_001");

    db.prepare(`INSERT INTO customer_room_stays
      (id, customer_id, room_id, reservation_id, status, check_in_date, check_out_date, guest_count, notes,
       source, checked_in_at, checked_out_at, created_at, updated_at, deleted_at, sync_status)
      VALUES ('stay_pr_current', ?, 'room_pr_101', 'res_pr_room_stay', 'checked_in', ?, ?, 2,
       'Sentetik demo konaklaması.', 'manual', ?, '', ?, ?, '', 'local_only')`)
      .run(customerByKey.get("zeynep").id, isoDate(-3), isoDate(2), isoAt(-3, 14), FIXED_NOW, FIXED_NOW);

    db.prepare(`INSERT INTO customer_room_stays
      (id, customer_id, room_id, reservation_id, status, check_in_date, check_out_date, guest_count, notes,
       source, checked_in_at, checked_out_at, created_at, updated_at, deleted_at, sync_status)
      VALUES ('stay_pr_future', ?, 'room_pr_201', 'res_pr_room_future', 'planned', ?, ?, 2,
       'Sentetik demo planlanan konaklama.', 'manual', '', '', ?, ?, '', 'local_only')`)
      .run(customerByKey.get("ayse").id, isoDate(3), isoDate(6), FIXED_NOW, FIXED_NOW);

    // Open room folio with lodging, menu charges and a partial card payment.
    db.prepare(`INSERT INTO room_folios
      (id, stay_id, room_id, customer_id, reservation_id, status, guest_count, check_in_date,
       planned_check_out_date, nightly_price_minor, currency, lodging_total_minor, lodging_manual_override,
       opened_at, closed_at, note, created_at, updated_at, deleted_at, sync_status)
      VALUES ('folio_pr_current', 'stay_pr_current', 'room_pr_101', ?, 'res_pr_room_stay', 'open', 2, ?,
       ?, 185000, 'TRY', 925000, 0, ?, '', 'Sentetik demo folyosu.', ?, ?, '', 'local_only')`)
      .run(customerByKey.get("zeynep").id, isoDate(-3), isoDate(2), isoAt(-3, 14), FIXED_NOW, FIXED_NOW);

    const folioItems = [
      ["folio_item_pr_1", "menu", byKey.get("serpme-kahvalti").id, menuEntries.get("serpme-kahvalti"), 32000, 2, 64000, "Serpme Kahvaltı", "Kahvaltı folyo kaydı"],
      ["folio_item_pr_2", "menu", byKey.get("turk-kahvesi").id, menuEntries.get("turk-kahvesi"), 5500, 2, 11000, "Türk Kahvesi", "Kahve folyo kaydı"],
      ["folio_item_pr_3", "manual_charge", null, null, 12000, 1, 12000, "Minibar", "Sentetik minibar kullanımı"]
    ];
    for (const [id, kind, productId, menuEntryId, unitPriceMinor, quantity, lineTotalMinor, label, note] of folioItems) {
      db.prepare(`INSERT INTO room_folio_items
        (id, folio_id, kind, product_id, menu_entry_id, inventory_quantity_per_item, inventory_location_id,
         label, unit_price_minor, quantity, line_total_minor, note, created_at, updated_at, deleted_at, sync_status)
        VALUES (?, 'folio_pr_current', ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?, ?, ?, '', 'local_only')`)
        .run(id, kind, productId, menuEntryId, label, unitPriceMinor, quantity, lineTotalMinor, note, FIXED_NOW, FIXED_NOW);
    }
    db.prepare(`INSERT INTO room_folio_payments
      (id, folio_id, amount_minor, currency, payment_method, paid_at, note, origin, reference_id,
       created_at, updated_at, deleted_at, sync_status)
      VALUES ('folio_pay_pr_1', 'folio_pr_current', 400000, 'TRY', 'card', ?, 'Demo kısmi tahsilat', 'direct', '', ?, ?, '', 'local_only')`)
      .run(isoAt(0, 10), FIXED_NOW, FIXED_NOW);
    finance.synchronizeFinanceSourceInTransaction(db, "room_folio_payment", "folio_pay_pr_1");

    // Open table order.
    const openItems = [
      ["toi_pr_1", "serpme-kahvalti", 320, 1, 320, "served"],
      ["toi_pr_2", "turk-kahvesi", 55, 2, 110, "served"]
    ];
    db.prepare(`INSERT INTO table_orders
      (id, table_id, status, opened_at, closed_at, subtotal, discount_total, total, note, created_at, updated_at)
      VALUES ('tbl_order_pr_open', 'tbl_pr_m1', 'payment', ?, '', 430, 0, 430, 'Sentetik açık adisyon.', ?, ?)`)
      .run(isoAt(0, 12, 30), FIXED_NOW, FIXED_NOW);
    for (const [id, productKey, unitPrice, quantity, lineTotal, status] of openItems) {
      const product = byKey.get(productKey);
      db.prepare(`INSERT INTO table_order_items
        (id, order_id, product_id, menu_entry_id, inventory_quantity_per_item, inventory_location_id,
         product_name, unit_price, quantity, line_total, note, status, created_at, updated_at, currency)
        VALUES (?, 'tbl_order_pr_open', ?, ?, 0, NULL, ?, ?, ?, ?, '', ?, ?, ?, 'TRY')`)
        .run(id, product.id, menuEntries.get(productKey), product.name, unitPrice, quantity, lineTotal, status, FIXED_NOW, FIXED_NOW);
    }

    // Paid table order with tender evidence and Finance projection.
    const paidItems = [
      ["toi_pr_3", "tavuk-sis", 290, 2, 580],
      ["toi_pr_4", "ayran", 40, 2, 80],
      ["toi_pr_5", "sutlac", 85, 1, 85]
    ];
    db.prepare(`INSERT INTO table_orders
      (id, table_id, status, opened_at, closed_at, subtotal, discount_total, total, note, created_at, updated_at)
      VALUES ('tbl_order_pr_paid', 'tbl_pr_b2', 'paid', ?, ?, 745, 0, 745, 'Sentetik ödenmiş adisyon.', ?, ?)`)
      .run(isoAt(-1, 19), isoAt(-1, 20, 15), FIXED_NOW, FIXED_NOW);
    for (const [id, productKey, unitPrice, quantity, lineTotal] of paidItems) {
      const product = byKey.get(productKey);
      db.prepare(`INSERT INTO table_order_items
        (id, order_id, product_id, menu_entry_id, inventory_quantity_per_item, inventory_location_id,
         product_name, unit_price, quantity, line_total, note, status, created_at, updated_at, currency)
        VALUES (?, 'tbl_order_pr_paid', ?, ?, 0, NULL, ?, ?, ?, ?, '', 'served', ?, ?, 'TRY')`)
        .run(id, product.id, menuEntries.get(productKey), product.name, unitPrice, quantity, lineTotal, FIXED_NOW, FIXED_NOW);
    }
    db.prepare(`INSERT INTO table_order_settlements
      (order_id, business_id, table_id, customer_id, source_kind, channel, operation_key, request_hmac,
       payment_method, currency, subtotal_minor, discount_minor, order_total_minor, cash_received_minor,
       points_tender_minor, items_json, created_at)
      VALUES ('tbl_order_pr_paid', ?, 'tbl_pr_b2', NULL, 'table_order', 'desktop_desk',
       'demo-op-pr-table-paid', ?, 'cash', 'TRY', 74500, 0, 74500, 74500, 0, ?, ?)`)
      .run(ctx.pack.business.id, "a".repeat(64), benefitRules.canonicalBenefitsJson(paidItems.map(([id, productKey, unitPrice, quantity, lineTotal]) => {
        const product = byKey.get(productKey);
        return {
          id,
          productId: product.id,
          currency: "TRY",
          status: "served",
          unitPriceMinor: Math.round(unitPrice * 100),
          quantityTenThousandths: Math.round(quantity * 10000),
          lineTotalMinor: Math.round(lineTotal * 100)
        };
      })), FIXED_NOW);
    finance.synchronizeFinanceSourceInTransaction(db, "restaurant_order", "tbl_order_pr_paid");

    db.prepare(`INSERT INTO daily_tasks
      (id, title, description, task_type, status, due_date, due_time, related_type, related_id,
       created_at, updated_at, deleted_at, sync_status)
      VALUES ('task_pr_1', 'Kahvaltı büfesini kontrol et', 'Sentetik demo görevi.', 'manual_pension', 'pending', ?, '08:00', 'room', 'room_pr_101', ?, ?, '', 'local_only')`)
      .run(isoDate(0), FIXED_NOW, FIXED_NOW);
    db.prepare(`INSERT INTO daily_tasks
      (id, title, description, task_type, status, due_date, due_time, related_type, related_id,
       created_at, updated_at, deleted_at, sync_status)
      VALUES ('task_pr_2', 'Akşam rezervasyon masasını hazırla', 'Sentetik demo görevi.', 'manual_restaurant', 'pending', ?, '18:30', 'table', 'tbl_pr_m3', ?, ?, '', 'local_only')`)
      .run(isoDate(0), FIXED_NOW, FIXED_NOW);
    db.prepare(`INSERT INTO daily_tasks
      (id, title, description, task_type, status, due_date, due_time, related_type, related_id,
       created_at, updated_at, deleted_at, sync_status)
      VALUES ('task_pr_3', 'Minibar stok sayımı', 'Sentetik demo görevi.', 'manual_pension', 'in_progress', ?, '16:00', 'room', 'room_pr_202', ?, ?, '', 'local_only')`)
      .run(isoDate(1), FIXED_NOW, FIXED_NOW);

    db.prepare(`INSERT INTO requests
      (id, dealer_application_json, documents_json, dealer_customer_id, customer_id, source, request_type,
       status, customer_name, customer_phone, date_text, start_date, end_date, time, guest_count,
       adult_count, child_count, message, ai_summary, ai_suggested_reply, whatsapp_message, assigned_to,
       priority, created_at, updated_at, deleted_at, sync_status)
      VALUES ('req_pr_1', 'null', '[]', '', ?, 'manual', 'reservation', 'new', ?, ?,
       '', ?, ?, '', 2, 2, 0, 'Sentetik demo talebi: iki kişilik hafta sonu konaklaması.',
       '', '', '', '', 'normal', ?, ?, '', 'local_only')`)
      .run(customerByKey.get("nur").id, customerByKey.get("nur").fullName, "+90 555 000 10 07", isoDate(9), isoDate(11), FIXED_NOW, FIXED_NOW);

    ctx.expected = {
      counts: {
        rooms: rooms.length,
        tables: tables.length,
        customers: customers.length,
        reservations: reservations.length,
        menuItems: products.length,
        openTableOrders: 1,
        paidTableOrders: 1,
        openFolios: 1
      },
      readChecks: {
        dashboardRooms: rooms.length,
        dashboardTables: tables.length,
        dashboardReservations: reservations.length,
        menuItems: products.length,
        tableOrders: 2,
        customers: customers.length,
        folioAccounts: 1
      }
    };
  }
};
