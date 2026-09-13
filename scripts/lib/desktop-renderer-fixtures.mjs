function createReportFixture() {
  return {
    period: {
      preset: "last7",
      label: "Son 7 Gün",
      startDate: "2026-07-13",
      endDate: "2026-07-19"
    },
    generatedAt: "2026-07-19T12:00:00+03:00",
    summary: {
      restaurantRevenue: 6400,
      closedOrders: 8,
      averageOrder: 800,
      approvedReservations: 2,
      newRequests: 6,
      pendingTasks: 1
    },
    restaurant: {
      revenue: 6400,
      closedOrders: 8,
      averageOrder: 800,
      soldItemCount: 24,
      cancelledOrders: 1,
      dailyRevenue: [
        { date: "2026-07-13", revenue: 500, closedOrders: 1 },
        { date: "2026-07-14", revenue: 900, closedOrders: 1 },
        { date: "2026-07-15", revenue: 0, closedOrders: 0 },
        { date: "2026-07-16", revenue: 1200, closedOrders: 2 },
        { date: "2026-07-17", revenue: 800, closedOrders: 1 },
        { date: "2026-07-18", revenue: 1400, closedOrders: 2 },
        { date: "2026-07-19", revenue: 1600, closedOrders: 1 }
      ],
      topItems: [
        { name: "Türk Kahvesi", quantity: 8, revenue: 1200 },
        { name: "Ev Yapımı Limonata", quantity: 6, revenue: 1320 },
        { name: "Serpme Kahvaltı", quantity: 4, revenue: 2300 }
      ]
    },
    pensionAndRequests: {
      incomingReservations: 4,
      approvedReservations: 2,
      pendingReservations: 1,
      cancelledOrRejectedReservations: 1,
      accommodationNights: 5,
      newRequests: 6,
      answeredRequests: 3,
      waitingRequests: 3
    },
    stock: {
      topConsumed: [
        { menuItemId: "item_coffee", name: "Türk Kahvesi", quantity: 8, unit: "piece" }
      ],
      manualMovementCount: 2,
      imageMovementCount: 1,
      manualMovements: [
        {
          id: "movement_manual",
          menuItemId: "item_coffee",
          itemName: "Türk Kahvesi",
          type: "add",
          quantityChange: 10,
          quantityAfter: 18,
          unit: "piece",
          sourceType: "desktop",
          sourceLabel: "Masaüstü manuel",
          note: "Sayım",
          createdAt: "2026-07-19T10:00:00+03:00"
        }
      ],
      imageMovements: [
        {
          id: "movement_image",
          menuItemId: "item_lemonade",
          itemName: "Ev Yapımı Limonata",
          type: "image_import_add",
          quantityChange: 12,
          quantityAfter: 12,
          unit: "piece",
          sourceType: "stock_image_import",
          sourceLabel: "Görsel / fatura",
          note: "Fatura",
          createdAt: "2026-07-18T10:00:00+03:00"
        }
      ],
      recentMovements: []
    },
    attention: {
      pendingRequests: 3,
      pendingReservations: 1,
      paymentWaitingTables: 1,
      overdueTasks: 1,
      incompleteTasks: 1,
      outOfStockItems: 1,
      lowStockItems: 1,
      totalCount: 8,
      items: [
        { kind: "pending_request", title: "3 müşteri talebi cevap bekliyor", detail: "Yanıt sırasını kontrol edin." },
        { kind: "out_of_stock", title: "Türk Kahvesi stokta yok", detail: "Stok girişini kontrol edin." }
      ]
    }
  };
}

function createSetupFixture() {
  return {
    setupRequired: true,
    appPasswordConfigured: false,
    businessName: "Deniz Çiçeği Pansiyon & Kafe",
    profileId: "pension_restaurant",
    phone: "+905321234567",
    whatsapp: "+905321234567",
    email: "merhaba@denizcicegi.example",
    address: "Sahil Yolu No: 18, Akyaka / Muğla",
    webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
    syncSecret: "change-this-secret",
    aiEnabled: true,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "smoke-model",
    aiTimeoutSeconds: 30,
    aiApiKeyConfigured: true,
    aiLastPublishedAt: "",
    servicePreferences: {
      whatsapp: true,
      android: true
    },
    initialCounts: {
      rooms: 2,
      tables: 2
    },
    tableCategories: [
      { name: "Bahçe", tableCount: 1 },
      { name: "Salon", tableCount: 1 }
    ]
  };
}

function createDashboardFixture() {
  return {
    databasePath: "/tmp/yardimci-asistan.sqlite",
    backupPath: "/tmp/yardimci-asistan/backups",
    webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
    requests: [],
    rooms: [
      {
        id: "room_smoke_101",
        name: "Smoke Balkonlu Oda",
        number: "101",
        capacity: 2,
        bedInfo: "1 çift kişilik yatak",
        floor: "1. Kat",
        status: "available",
        features: ["Klima", "Balkon"],
        description: "Renderer smoke oda kaydı.",
        priceNote: "",
        isActive: true,
        sortOrder: 1,
        activeReservationTitle: "Smoke Misafir - 2 gece",
        updatedAt: "2026-07-11T10:00:00+03:00"
      },
      {
        id: "room_smoke_102",
        name: "Smoke Aile Odası",
        number: "102",
        capacity: 4,
        bedInfo: "1 çift kişilik yatak + 2 tek kişilik yatak",
        floor: "1. Kat",
        status: "reserved",
        features: ["Klima"],
        description: "Aktif rezervasyonu olmayan smoke oda kaydı.",
        priceNote: "",
        isActive: true,
        sortOrder: 2,
        activeReservationTitle: "Eski rezervasyon başlığı",
        updatedAt: "2026-07-11T10:00:00+03:00"
      }
    ],
    tables: [
      {
        id: "table_smoke_001",
        name: "Smoke Bahçe Masası",
        area: "Bahçe",
        capacity: 4,
        status: "available",
        currentCustomerId: "",
        currentReservationId: "reservation_smoke_001",
        activeReservationTitle: "Smoke Misafir - akşam",
        notes: "",
        isActive: true,
        sortOrder: 1,
        updatedAt: "2026-07-11T10:00:00+03:00"
      }
    ],
    reservations: [
      {
        id: "reservation_smoke_001",
        requestId: "request_smoke_001",
        customerId: "customer_smoke_001",
        customerName: "Smoke Misafir",
        customerPhone: "+905321234567",
        reservationType: "room",
        status: "pending",
        title: "Smoke Misafir - 2 gece",
        startDate: "2026-07-18",
        endDate: "2026-07-20",
        time: "",
        guestCount: 2,
        adultCount: 2,
        childCount: 0,
        roomIds: ["room_smoke_101"],
        tableIds: [],
        notes: "Balkonlu oda istedi.",
        priceNote: "Fiyat işletme sahibi tarafından verilecek.",
        paymentStatus: "not_required",
        updatedAt: "2026-07-11T10:15:00+03:00"
      }
    ],
    dailyTasks: [
      {
        id: "task_smoke_001",
        title: "Oda 101 giriş hazırlığı",
        description: "Smoke Misafir için giriş hazırlığı.",
        taskType: "check_in",
        status: "pending",
        dueDate: "2026-07-18",
        dueTime: "14:00",
        relatedType: "reservation",
        relatedId: "reservation_smoke_001",
        updatedAt: "2026-07-11T10:15:00+03:00"
      },
      {
        id: "task_smoke_002",
        title: "Bahçe masası kontrolü",
        description: "Akşam servisi öncesi masa kontrolü.",
        taskType: "table_reservation",
        status: "pending",
        dueDate: "2026-07-18",
        dueTime: "18:00",
        relatedType: "table",
        relatedId: "table_smoke_001",
        updatedAt: "2026-07-11T10:15:00+03:00"
      }
    ],
    customers: [
      {
        id: "customer_smoke_001",
        fullName: "Smoke Misafir",
        phone: "+905321234567",
        email: "",
        source: "web_form",
        notes: "Balkonlu oda için bilgi almak istiyor.",
        tags: ["smoke", "pansiyon"],
        lastContactAt: "2026-07-11T10:15:00+03:00",
        identityType: "",
        identityNumber: "",
        nationality: "",
        birthDate: "",
        gender: "",
        documentSerialNumber: "",
        documentExpiryDate: "",
        birthPlace: "",
        motherName: "",
        fatherName: "",
        issuingAuthority: "",
        address: "",
        requestCount: 1,
        reservationCount: 1,
        stayCount: 0,
        updatedAt: "2026-07-11T10:15:00+03:00"
      }
    ],
    customerRoomStays: [],
    androidDevices: [
      {
        id: "android_device_smoke_001",
        deviceId: "android-smoke-device-001",
        deviceName: "Smoke Personel Telefonu",
        appVersion: "0.1.0-smoke",
        role: "staff",
        isActive: true,
        permissionGroups: {
          service_orders: true,
          cashier: false,
          rooms_tasks: true,
          customer_reservation: false
        },
        permissions: [
          "room.view",
          "room.update_status",
          "daily_task.view",
          "daily_task.complete",
          "daily_task.reopen",
          "table.view",
          "table.update_status",
          "table_order.view",
          "table_order.open",
          "table_order.add_item",
          "table_order.update_item",
          "table_order.remove_item",
          "table_order.set_preparing",
          "table_order.set_served",
          "table_order.set_payment_waiting",
          "menu.view",
          "menu.stock_view"
        ],
        firstSeenAt: "2026-07-18T08:00:00+03:00",
        lastSeenAt: "2026-07-18T12:30:00+03:00",
        createdAt: "2026-07-18T08:00:00+03:00",
        updatedAt: "2026-07-18T12:30:00+03:00",
        revokedAt: ""
      }
    ],
    paymentWaitingTableOrders: [
      {
        id: "table_order_smoke_001",
        tableId: "table_smoke_001",
        tableName: "Smoke Bahçe Masası",
        openedAt: "2026-07-18T11:30:00+03:00",
        total: 450,
        currency: "TRY",
        updatedAt: "2026-07-18T12:20:00+03:00"
      }
    ],
    androidActionFailures: [
      {
        id: "android_action_smoke_failed_001",
        actionType: "table_order_close_paid",
        deviceId: "android-smoke-device-001",
        message: "Bu cihazın hesap kapatma yetkisi yok.",
        targetPage: "restaurant",
        relatedId: "table_order_smoke_001",
        createdAt: "2026-07-18T12:25:00+03:00"
      }
    ],
    menu: {
      categories: [],
      items: [],
      updated_at: "2026-07-10T10:00:00+03:00"
    },
    summary: {
      newRequests: 0,
      waitingRequests: 0,
      pendingDailyTasks: 0,
      availableRooms: 0,
      totalRooms: 0,
      availableTables: 0,
      pendingReservations: 0,
      preparedWhatsAppMessages: 0,
      activeMenuCategories: 0,
      availableMenuItems: 0
    }
  };
}

function createDashboardConversionFixture() {
  return {
    ...createDashboardFixture(),
    requests: [
      {
        id: "request_smoke_001",
        customer_id: "",
        source: "web_form",
        request_type: "pension_reservation",
        status: "new",
        customer_name: "Smoke Misafir",
        customer_phone: "+905321234567",
        date_text: "18-20 Temmuz",
        start_date: "2026-07-18",
        end_date: "2026-07-20",
        time: "",
        guest_count: 2,
        adult_count: 2,
        child_count: 0,
        message: "Balkonlu oda için bilgi almak istiyorum.",
        ai_summary: "2 kişilik balkonlu oda talebi.",
        ai_suggested_reply: "Merhaba, müsaitliği kontrol edip dönüş yapacağız.",
        whatsapp_message: "Merhaba, müsaitliği kontrol edip dönüş yapacağız.",
        assigned_to: "",
        priority: "normal",
        sync_status: "synced",
        created_at: "2026-07-11T10:15:00+03:00",
        updated_at: "2026-07-11T10:15:00+03:00"
      }
    ],
    menu: {
      categories: [
        {
          id: "category_local_preview",
          name: "Yerel Kahvaltı",
          description: "Henüz webde yayınlanmamış yerel kategori.",
          is_active: true,
          sort_order: 10,
          created_at: "2026-07-16T10:00:00+03:00",
          updated_at: "2026-07-16T10:30:00+03:00"
        },
        {
          id: "category_hidden_preview",
          name: "Pasif Kategori",
          description: "Önizlemede gösterilmemeli.",
          is_active: false,
          sort_order: 20,
          created_at: "2026-07-16T10:00:00+03:00",
          updated_at: "2026-07-16T10:30:00+03:00"
        }
      ],
      items: [
        {
          id: "item_local_preview",
          category_id: "category_local_preview",
          name: "Yerel Serpme Kahvaltı",
          description: "Yalnızca uygulamadaki güncel kayıttan gelen ürün.",
          price: 525,
          currency: "TRY",
          image_url: "",
          is_available: true,
          is_featured: true,
          allergens: ["süt"],
          tags: ["yerel", "yeni"],
          stock_quantity: 5,
          stock_min_quantity: 2,
          stock_unit: "piece",
          stock_consumption_quantity: 1,
          hide_when_out_of_stock: false,
          stock_note: "Smoke stok takibi",
          sort_order: 10,
          created_at: "2026-07-16T10:00:00+03:00",
          updated_at: "2026-07-16T10:30:00+03:00"
        },
        {
          id: "item_gram_preview",
          category_id: "category_local_preview",
          name: "Kaşarlı Köfte",
          description: "200 gramlık porsiyon, stok gram üzerinden izlenir.",
          price: 760,
          currency: "TRY",
          image_url: "",
          is_available: true,
          is_featured: false,
          allergens: ["süt"],
          tags: ["köfte", "gram"],
          stock_quantity: 6000,
          stock_min_quantity: 1200,
          stock_unit: "gram",
          stock_consumption_quantity: 200,
          hide_when_out_of_stock: true,
          stock_note: "Bir porsiyonda 200 g kullanılır.",
          sort_order: 20,
          created_at: "2026-07-16T10:00:00+03:00",
          updated_at: "2026-07-16T10:30:00+03:00"
        },
        {
          id: "item_hidden_preview",
          category_id: "category_local_preview",
          name: "Gizli Menü Ürünü",
          description: "Mevcut olmadığı için önizlemede gösterilmemeli.",
          price: 100,
          currency: "TRY",
          image_url: "",
          is_available: false,
          is_featured: false,
          allergens: [],
          tags: [],
          stock_quantity: null,
          stock_min_quantity: null,
          stock_unit: "piece",
          stock_consumption_quantity: 1,
          hide_when_out_of_stock: false,
          stock_note: "",
          sort_order: 30,
          created_at: "2026-07-16T10:00:00+03:00",
          updated_at: "2026-07-16T10:30:00+03:00"
        }
      ],
      updated_at: "2026-07-16T10:30:00+03:00"
    },
    summary: {
      ...createDashboardFixture().summary,
      newRequests: 1,
      waitingRequests: 1,
      activeMenuCategories: 1,
      availableMenuItems: 2
    }
  };
}

function createCompactUiFixture() {
  const base = createDashboardConversionFixture();
  const requestTemplate = base.requests[0];
  const reservationTemplate = base.reservations[0];
  const roomTemplate = base.rooms[0];
  const tableTemplate = base.tables[0];
  const taskTemplate = base.dailyTasks[0];
  const statuses = ["new", "answered", "new", "rejected", "new", "answered", "new", "closed"];
  const requests = Array.from({ length: 8 }, (_, index) => ({
    ...requestTemplate,
    id: `compact_request_${index + 1}`,
    customer_id: `compact_customer_${index + 1}`,
    request_type: index % 2 === 0 ? "pension_reservation" : "restaurant_reservation",
    status: statuses[index],
    priority: index === 0 ? "high" : "normal",
    customer_name: `Kompakt Misafir ${index + 1}`,
    customer_phone: `+9053212300${String(index + 1).padStart(2, "0")}`,
    date_text: index % 2 === 0 ? "18-20 Temmuz" : "Bu akşam 20:30",
    guest_count: (index % 4) + 1,
    message: "Uzun talep notunun liste kartını büyütmeden ilk satırda kesilmesi ve detay alanında okunabilmesi kontrol ediliyor.",
    ai_summary: "Tarih, kişi sayısı ve tercih bilgilerini içeren iki satırı geçmeyen kompakt AI özeti.",
    created_at: `2026-07-${String(10 + index).padStart(2, "0")}T10:15:00+03:00`,
    updated_at: `2026-07-${String(10 + index).padStart(2, "0")}T10:15:00+03:00`
  }));
  const rooms = Array.from({ length: 4 }, (_, index) => ({
    ...roomTemplate,
    id: `compact_room_${index + 1}`,
    name: index % 2 === 0 ? "Balkonlu Standart Oda" : "Aile Odası",
    number: String(101 + index),
    capacity: index % 2 === 0 ? 2 : 4,
    status: index === 3 ? "cleaning" : "available",
    description: "Odanın uzun açıklaması kartı büyütmeden tek satırda gösterilir.",
    sortOrder: index + 1
  }));
  const reservations = Array.from({ length: 3 }, (_, index) => ({
    ...reservationTemplate,
    id: `compact_reservation_${index + 1}`,
    requestId: requests[index].id,
    customerId: requests[index].customer_id,
    customerName: requests[index].customer_name,
    customerPhone: requests[index].customer_phone,
    status: index === 1 ? "approved" : "pending",
    title: `${requests[index].customer_name} - ${index + 1} gece`,
    startDate: `2026-07-${18 + index}`,
    endDate: `2026-07-${20 + index}`,
    time: index === 0 ? "00:01" : "",
    guestCount: index + 2,
    roomIds: [rooms[index].id],
    notes: "Balkon tercihi ve geç giriş notu uzun kart oluşturmadan özetlenir."
  }));
  const tables = Array.from({ length: 4 }, (_, index) => ({
    ...tableTemplate,
    id: `compact_table_${index + 1}`,
    name: `${index % 2 === 0 ? "Bahçe" : "Salon"} Masası ${index + 1}`,
    area: index % 2 === 0 ? "Bahçe" : "Salon",
    capacity: index % 2 === 0 ? 4 : 2,
    status: ["available", "occupied", "reserved", "payment"][index],
    currentReservationId: index === 2 ? reservations[0].id : "",
    activeReservationTitle: index === 2 ? `${requests[0].customer_name} - akşam` : "",
    notes: "Servis öncesi kısa masa notu.",
    sortOrder: index + 1
  }));
  const dailyTasks = Array.from({ length: 6 }, (_, index) => ({
    ...taskTemplate,
    id: `compact_task_${index + 1}`,
    title: index < 3 ? `Oda ${101 + index} hazırlığı` : `${tables[index - 3].name} kontrolü`,
    description: "Operasyon notu liste satırında tek satır olarak kalır ve gerektiğinde detay açılır.",
    taskType: index < 3 ? "check_in" : "table_reservation",
    status: index === 2 ? "done" : "pending",
    dueDate: "2026-07-18",
    dueTime: `${String(14 + index).padStart(2, "0")}:00`,
    relatedType: index < 3 ? "reservation" : "table",
    relatedId: index < 3 ? reservations[index].id : tables[index - 3].id
  }));
  const categories = Array.from({ length: 6 }, (_, index) => ({
    id: `compact_category_${index + 1}`,
    name: ["Kahvaltı", "Sıcaklar", "Atıştırmalıklar", "Tatlılar", "Sıcak İçecekler", "Soğuk İçecekler"][index],
    description: "Kompakt kategori açıklaması.",
    is_active: index !== 5,
    sort_order: (index + 1) * 10,
    created_at: "2026-07-10T10:00:00+03:00",
    updated_at: "2026-07-10T10:00:00+03:00"
  }));
  const items = Array.from({ length: 10 }, (_, index) => ({
    id: `compact_item_${index + 1}`,
    category_id: categories[index % categories.length].id,
    name: `Menü Ürünü ${index + 1}`,
    description: "Uzun ürün açıklaması kendi alanında kaydırılabilir kalır.",
    price: 90 + index * 15,
    currency: "TRY",
    image_url: "",
    is_available: index !== 9,
    is_featured: index < 2,
    allergens: index % 2 === 0 ? ["gluten"] : [],
    tags: ["smoke"],
    sort_order: (index + 1) * 10,
    created_at: "2026-07-10T10:00:00+03:00",
    updated_at: "2026-07-10T10:00:00+03:00"
  }));

  return {
    ...base,
    requests,
    rooms,
    tables,
    reservations,
    dailyTasks,
    customers: requests.map((request, index) => ({
      id: request.customer_id,
      fullName: request.customer_name,
      phone: request.customer_phone,
      email: `misafir${index + 1}@example.test`,
      source: request.source,
      notes: request.message,
      tags: ["kompakt", index % 2 === 0 ? "pansiyon" : "restoran"],
      lastContactAt: request.updated_at,
      requestCount: 1,
      reservationCount: index < reservations.length ? 1 : 0,
      updatedAt: request.updated_at
    })),
    menu: { categories, items, updated_at: "2026-07-15T10:00:00+03:00" },
    summary: {
      ...base.summary,
      newRequests: requests.filter((request) => request.status === "new").length,
      waitingRequests: requests.filter((request) => ["new", "seen", "waiting_owner", "pending", "in_progress"].includes(request.status)).length,
      pendingDailyTasks: dailyTasks.filter((task) => task.status === "pending").length,
      availableRooms: 1,
      totalRooms: rooms.length,
      availableTables: tables.filter((table) => table.status === "available").length,
      pendingReservations: reservations.filter((reservation) => reservation.status === "pending").length,
      preparedWhatsAppMessages: requests.length,
      activeMenuCategories: categories.filter((category) => category.is_active).length,
      availableMenuItems: items.filter((item) => item.is_available).length
    }
  };
}

function createPulledRequestFixture() {
  return {
    id: "request_web_pull_smoke_001",
    customer_id: "customer_web_pull_smoke_001",
    source: "web_form",
    request_type: "restaurant_reservation",
    status: "new",
    customer_name: "Web Sync Smoke",
    customer_phone: "+905551112233",
    date_text: "Bu akşam",
    start_date: "2026-07-18",
    end_date: "",
    time: "20:30",
    guest_count: 4,
    adult_count: 4,
    child_count: 0,
    message: "Bahçe masa için canlı web talebi.",
    ai_summary: "",
    ai_suggested_reply: "",
    whatsapp_message: "Merhaba, masa talebinizi aldık. Uygunluğu kontrol edip size dönüş yapacağız.",
    assigned_to: "",
    priority: "normal",
    sync_status: "synced",
    synced_at: "2026-07-11T10:45:00+03:00",
    created_at: "2026-07-11T10:44:00+03:00",
    updated_at: "2026-07-11T10:45:00+03:00"
  };
}

export { createReportFixture, createSetupFixture, createDashboardFixture, createDashboardConversionFixture, createCompactUiFixture, createPulledRequestFixture };
