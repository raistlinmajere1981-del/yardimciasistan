const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS,
  ANDROID_PERMISSIONS,
  ANDROID_PERMISSION_GROUP_PERMISSIONS,
  ANDROID_STAFF_PERMISSIONS,
  LOCAL_COMPANION_API_PREFIX,
  LOCAL_COMPANION_DEVICE_ID_HEADER,
  LOCAL_COMPANION_ENDPOINTS,
  LOCAL_COMPANION_PROTOCOL_VERSION,
  LOCAL_COMPANION_SERVICE_TYPE,
  LOCAL_COMPANION_TOKEN_HEADER,
  androidPermissionsForGroups,
  acknowledgeRequests,
  createCompanionSourceKey,
  createSyncEndpointUrl,
  getSyncCapabilities,
  markAndroidActionResult,
  markRequestsSynced,
  pullAndroidActions,
  pushAiCatalog,
  pushAiSettings,
  pushBusinessContext,
  pushRoomCatalog,
  pushTableCatalog,
  pushAndroidSnapshot,
  pushMenu,
  pullRequests,
  resetHostingRuntime,
  PhpHostingSyncTransport,
  resolveAndroidActionPermission
} = require("../dist");

test("local companion protocol contract keeps discovery identity independent from address", () => {
  assert.equal(LOCAL_COMPANION_PROTOCOL_VERSION, 1);
  assert.equal(LOCAL_COMPANION_SERVICE_TYPE, "_yardimciasistan._tcp");
  assert.equal(LOCAL_COMPANION_API_PREFIX, "/local/v1");
  assert.deepEqual(LOCAL_COMPANION_ENDPOINTS, {
    status: "/local/v1/status",
    summary: "/local/v1/summary",
    action: "/local/v1/action",
    pair: "/local/v1/pair"
  });
  assert.equal(LOCAL_COMPANION_DEVICE_ID_HEADER, "X-YA-Device-Id");
  assert.equal(LOCAL_COMPANION_TOKEN_HEADER, "X-YA-Local-Token");
  assert.equal(createCompanionSourceKey("local", " desktop-123 "), "local:desktop-123");
  assert.equal(
    createCompanionSourceKey("hosting", "https://firma.example/yardimci-asistan///"),
    "hosting:https://firma.example/yardimci-asistan"
  );
  assert.equal(createCompanionSourceKey("local", "   "), "");
});

test("createSyncEndpointUrl creates the mini API sync endpoint", () => {
  assert.equal(
    createSyncEndpointUrl("https://firma.example/yardimci-asistan/"),
    "https://firma.example/yardimci-asistan/api/sync.php"
  );
});

test("resetHostingRuntime performs an authenticated destructive runtime reset", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      ok: true,
      message: "Web modülü çalışma verileri temizlendi.",
      reset_at: "2026-09-27T16:30:00Z",
      deleted: { web_requests: 4, android_actions: 2, publications: 5 },
      server_revision: 0
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await resetHostingRuntime({
    baseUrl: "https://firma.example/yardimci-asistan/",
    syncSecret: "secret",
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(result.server_revision, 0);
  assert.equal(result.deleted.web_requests, 4);
  assert.equal(calls[0].url, "https://firma.example/yardimci-asistan/api/sync.php");
  assert.equal(calls[0].headers["X-YA-Sync-Secret"], "secret");
  assert.deepEqual(calls[0].body, { action: "reset_runtime" });
});

test("pullRequests posts secret and returns request data", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body)
    });

    return new Response(JSON.stringify({
      ok: true,
      message: "Talepler alındı.",
      requests: [
        {
          id: "request_001",
          customer_id: "",
          source: "web_form",
          request_type: "pension_reservation",
          status: "new",
          customer_name: "Demo Misafir",
          customer_phone: "+905321234567",
          date_text: "12 Temmuz",
          start_date: "",
          end_date: "",
          time: "",
          guest_count: 2,
          adult_count: 0,
          child_count: 0,
          message: "Balkonlu oda",
          ai_summary: "",
          ai_suggested_reply: "",
          whatsapp_message: "",
          assigned_to: "",
          priority: "normal",
          sync_status: "pending",
          created_at: "2026-07-10T14:30:00+03:00",
          updated_at: "2026-07-10T14:30:00+03:00"
        }
      ],
      count: 1,
      pulled_at: "2026-07-10T14:31:00+03:00"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const result = await pullRequests({
    baseUrl: "https://firma.example/yardimci-asistan/",
    syncSecret: "secret",
    limit: 25,
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.requests[0].id, "request_001");
  assert.equal(calls[0].url, "https://firma.example/yardimci-asistan/api/sync.php");
  assert.equal(calls[0].headers["X-YA-Sync-Secret"], "secret");
  assert.equal(calls[0].body.action, "pull_requests");
  assert.equal(calls[0].body.limit, 25);
  assert.equal("sync_secret" in calls[0].body, false);
});

test("cursor pull and acknowledgement use the v2 request protocol", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return new Response(JSON.stringify(body.action === "pull_requests" ? {
      ok: true,
      message: "Talepler alındı.",
      requests: [],
      count: 0,
      pulled_at: "2026-07-17T20:00:00Z",
      next_cursor: 42,
      has_more: false,
      server_revision: 7
    } : {
      ok: true,
      message: "Talep cursor bilgisi onaylandı.",
      updated_count: 3,
      acknowledged_cursor: 42,
      acknowledged_at: "2026-07-17T20:00:01Z",
      server_revision: 8
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const pulled = await pullRequests({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "secret",
    clientId: "desktop-client-001",
    afterSeq: 12,
    limit: 30,
    fetchImpl
  });
  const acknowledged = await acknowledgeRequests({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "secret",
    clientId: "desktop-client-001",
    throughSeq: 42,
    fetchImpl
  });

  assert.equal(pulled.ok, true);
  assert.equal(pulled.next_cursor, 42);
  assert.equal(acknowledged.ok, true);
  assert.equal(calls[0].after_seq, 12);
  assert.equal(calls[0].client_id, "desktop-client-001");
  assert.equal(calls[1].action, "acknowledge_requests");
  assert.equal(calls[1].through_seq, 42);
});

test("capabilities and PhpHostingSyncTransport expose a provider-neutral boundary", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return new Response(JSON.stringify({
      ok: true,
      message: "Senkron özellikleri alındı.",
      protocol_version: 2,
      storage: "sqlite",
      schema_version: 1,
      features: ["request_cursor"],
      server_time: "2026-07-17T20:00:00Z",
      server_revision: 4
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const direct = await getSyncCapabilities({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "secret",
    fetchImpl
  });
  const transport = new PhpHostingSyncTransport({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "secret",
    clientId: "desktop-client-001",
    fetchImpl
  });
  const throughTransport = await transport.getCapabilities();

  assert.equal(direct.ok, true);
  assert.equal(direct.protocol_version, 2);
  assert.equal(throughTransport.ok, true);
  assert.deepEqual(calls.map((call) => call.action), ["capabilities", "capabilities"]);
});

test("markRequestsSynced sends processed ids", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      body: JSON.parse(init.body)
    });

    return new Response(JSON.stringify({
      ok: true,
      message: "Talepler güncellendi.",
      updated_count: 2,
      synced_at: "2026-07-10T14:32:00+03:00",
      request_ids: ["request_001", "request_002"],
      total_records: 4
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const result = await markRequestsSynced({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "secret",
    requestIds: ["request_001", "request_002"],
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(result.updated_count, 2);
  assert.deepEqual(calls[0].body.request_ids, ["request_001", "request_002"]);
  assert.equal(calls[0].body.action, "mark_requests_synced");
});

test("pullAndroidActions reads pending mobile commands", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      ok: true,
      message: "Telefon işlemleri alındı.",
      actions: [{
        id: "android_action_001",
        action_type: "room_status_update",
        payload: { room_id: "room_101", status: "cleaning" },
        created_at: "2026-07-17T10:00:00+03:00",
        device_id: "android-device-001",
        status: "pending",
        error_message: "",
        processed_at: ""
      }],
      devices: [{
        device_id: "android-device-001",
        device_name: "Test Telefonu",
        app_version: "0.1.0",
        first_seen_at: "2026-07-17T09:59:00+03:00",
        last_seen_at: "2026-07-17T10:00:01+03:00"
      }],
      count: 1,
      pulled_at: "2026-07-17T10:00:01+03:00"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await pullAndroidActions({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "secret",
    limit: 25,
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(result.actions[0].action_type, "room_status_update");
  assert.equal(result.devices[0].device_name, "Test Telefonu");
  assert.equal(calls[0].action, "pull_android_actions");
  assert.equal(calls[0].limit, 25);
});

test("markAndroidActionResult writes applied and failed outcomes", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return new Response(JSON.stringify({
      ok: true,
      message: "Telefon işlemi uygulandı.",
      action: {
        id: body.action_id,
        action_type: "room_status_update",
        payload: {},
        created_at: "2026-07-17T10:00:00+03:00",
        device_id: "android-device-001",
        status: body.status,
        error_message: body.error_message,
        processed_at: "2026-07-17T10:00:02+03:00"
      },
      updated_at: "2026-07-17T10:00:02+03:00"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await markAndroidActionResult({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "secret",
    actionId: "android_action_001",
    status: "failed",
    errorMessage: "Oda bulunamadı.",
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].action, "mark_android_action_result");
  assert.equal(calls[0].status, "failed");
  assert.equal(calls[0].error_message, "Oda bulunamadı.");
});

test("pushMenu sends QR menu data", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      body: JSON.parse(init.body)
    });

    return new Response(JSON.stringify({
      ok: true,
      message: "Menü yayınlandı.",
      published_at: "2026-07-10T14:33:00+03:00",
      updated_at: "2026-07-10T14:33:00+03:00",
      category_count: 1,
      item_count: 1
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const result = await pushMenu({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "secret",
    menu: {
      categories: [
        {
          id: "cat_breakfast",
          name: "Kahvaltı",
          description: "Sabah ürünleri",
          is_active: true,
          sort_order: 1,
          created_at: "2026-07-10T10:00:00+03:00",
          updated_at: "2026-07-10T10:00:00+03:00"
        }
      ],
      items: [
        {
          id: "item_001",
          category_id: "cat_breakfast",
          name: "Serpme Kahvaltı",
          description: "Yöresel kahvaltı",
          price: 450,
          currency: "TRY",
          image_url: "",
          is_available: true,
          is_featured: true,
          allergens: ["gluten"],
          tags: ["popüler"],
          sort_order: 1,
          created_at: "2026-07-10T10:00:00+03:00",
          updated_at: "2026-07-10T10:00:00+03:00"
        }
      ],
      updated_at: "2026-07-10T10:00:00+03:00"
    },
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(result.item_count, 1);
  assert.equal(calls[0].body.action, "publish_menu");
  assert.equal(calls[0].body.menu.items[0].name, "Serpme Kahvaltı");
  assert.equal("sync_secret" in calls[0].body, false);
});

test("pushAndroidSnapshot sends desktop operation summary", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      body: JSON.parse(init.body)
    });

    return new Response(JSON.stringify({
      ok: true,
      message: "Android özeti yayınlandı.",
      published_at: "2026-07-10T14:34:00+03:00",
      updated_at: "2026-07-10T14:34:00+03:00",
      task_count: 1
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const result = await pushAndroidSnapshot({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "secret",
    snapshot: {
      summary: {
        pending_daily_tasks: 2,
        available_rooms: 4,
        total_rooms: 8,
        available_tables: 6,
        pending_reservations: 1,
        prepared_whatsapp_messages: 3,
        active_menu_categories: 2,
        available_menu_items: 12,
        customer_count: 9
      },
      daily_tasks: [
        {
          id: "task_001",
          title: "Oda 101 giriş hazırlığı",
          description: "Misafir gelişi için kontrol.",
          task_type: "check_in",
          status: "pending",
          due_date: "2026-07-12",
          due_time: "14:00",
          related_type: "reservation",
          related_id: "reservation_001",
          updated_at: "2026-07-10T14:30:00+03:00"
        }
      ],
      customers: [{
        id: "customer_001",
        full_name: "Kimlik Testi",
        phone: "+905550001001",
        email: "",
        notes: "",
        tags: [],
        identity_type: "tc_identity_card",
        identity_number: "10000000146",
        nationality: "T.C.",
        birth_date: "1990-05-12",
        gender: "female",
        document_serial_number: "A12B34567",
        document_expiry_date: "2030-05-12",
        birth_place: "İstanbul",
        mother_name: "",
        father_name: "",
        issuing_authority: "",
        address: "",
        request_count: 0,
        reservation_count: 0,
        stay_count: 1,
        updated_at: "2026-07-10T14:30:00+03:00"
      }],
      customer_room_stays: [{
        id: "stay_001",
        customer_id: "customer_001",
        customer_name: "Kimlik Testi",
        customer_phone: "+905550001001",
        room_id: "room_001",
        room_name: "Oda 1",
        room_number: "101",
        reservation_id: "",
        status: "planned",
        check_in_date: "2026-07-12",
        check_out_date: "2026-07-14",
        guest_count: 1,
        notes: "",
        source: "manual",
        checked_in_at: "",
        checked_out_at: "",
        created_at: "2026-07-10T14:30:00+03:00",
        updated_at: "2026-07-10T14:30:00+03:00"
      }],
      admin_menu: {
        categories: [],
        items: [],
        updated_at: "2026-07-10T14:30:00+03:00"
      },
      deleted_request_ids: ["request_deleted_001"],
      androidPermissions: {
        "android-device-001": {
          role: "staff",
          is_active: true,
          permissions: [...ANDROID_STAFF_PERMISSIONS]
        }
      },
      updated_at: "2026-07-10T14:30:00+03:00"
    },
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(result.task_count, 1);
  assert.equal(calls[0].body.action, "publish_android_snapshot");
  assert.equal(calls[0].body.snapshot.summary.available_rooms, 4);
  assert.equal(calls[0].body.snapshot.daily_tasks[0].id, "task_001");
  assert.deepEqual(calls[0].body.snapshot.deleted_request_ids, ["request_deleted_001"]);
  assert.equal(calls[0].body.snapshot.customers[0].identity_number, "10000000146");
  assert.equal(calls[0].body.snapshot.customer_room_stays[0].id, "stay_001");
  assert.deepEqual(calls[0].body.snapshot.admin_menu.items, []);
  assert.equal(calls[0].body.snapshot.androidPermissions["android-device-001"].role, "staff");
  assert.equal("sync_secret" in calls[0].body, false);
});

test("Android role presets and action permission mapping stay explicit", () => {
  assert.deepEqual(ANDROID_STAFF_PERMISSIONS, [
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
    "menu.stock_view",
    "room.view",
    "room.update_status",
    "room_folio.view",
    "room_folio.checkout",
    "daily_task.view",
    "daily_task.create",
    "daily_task.update",
    "daily_task.complete",
    "daily_task.reopen"
  ]);
  assert.equal(resolveAndroidActionPermission("customer_request_mark_answered"), "customer.mark_answered");
  assert.equal(resolveAndroidActionPermission("customer_request_reopen"), "customer.respond");
  assert.equal(resolveAndroidActionPermission("customer_request_delete"), "request.delete");
  assert.equal(resolveAndroidActionPermission("customer_create"), "customer.manage");
  assert.equal(resolveAndroidActionPermission("customer_update"), "customer.manage");
  assert.equal(resolveAndroidActionPermission("customer_delete"), "customer.delete");
  assert.equal(resolveAndroidActionPermission("customer_room_assign"), "room.assign_customer");
  assert.equal(resolveAndroidActionPermission("customer_room_stay_status"), "room.assign_customer");
  assert.equal(resolveAndroidActionPermission("reservation_cancel"), "reservation.cancel");
  assert.equal(resolveAndroidActionPermission("table_order_set_preparing"), "table_order.set_preparing");
  assert.equal(resolveAndroidActionPermission("table_order_set_served"), "table_order.set_served");
  assert.equal(resolveAndroidActionPermission("table_order_set_payment_waiting"), "table_order.set_payment_waiting");
  assert.equal(resolveAndroidActionPermission("table_order_close_paid"), "table_order.close_paid");
  assert.equal(resolveAndroidActionPermission("table_order_cancel"), "table_order.cancel");
  assert.equal(resolveAndroidActionPermission("table_order_close"), null);
  assert.equal(resolveAndroidActionPermission("menu_stock_add"), "menu.stock_update");
  assert.equal(resolveAndroidActionPermission("menu_stock_set"), "menu.stock_update");
  assert.equal(resolveAndroidActionPermission("menu_stock_adjust"), "menu.stock_update");
  assert.equal(resolveAndroidActionPermission("menu_stock_image_import_apply"), "menu.stock_update");
  assert.equal(resolveAndroidActionPermission("menu_category_delete"), "menu.delete");
  assert.equal(resolveAndroidActionPermission("menu_item_delete"), "menu.delete");
  assert.equal(resolveAndroidActionPermission("message_delete"), "message.delete");
  assert.equal(resolveAndroidActionPermission("market_stock_count"), "market.stock_count");
  assert.equal(resolveAndroidActionPermission("market_purchase_receive"), "market.receiving");
  assert.equal(resolveAndroidActionPermission("market_product_create"), "market.product_create");
  assert.equal(resolveAndroidActionPermission("market_cart_draft_create"), "market.cart_draft");
  assert.equal(resolveAndroidActionPermission("market_barcode_scan"), "market.scan_to_desktop");
  assert.equal(ANDROID_STAFF_PERMISSIONS.includes("customer.delete"), false);
  assert.equal(ANDROID_STAFF_PERMISSIONS.includes("customer.manage"), false);
  assert.equal(ANDROID_STAFF_PERMISSIONS.includes("room.assign_customer"), false);
  assert.equal(ANDROID_STAFF_PERMISSIONS.includes("request.delete"), false);
  assert.equal(ANDROID_STAFF_PERMISSIONS.includes("menu.delete"), false);
  assert.equal(ANDROID_STAFF_PERMISSIONS.includes("message.delete"), false);
  assert.equal(resolveAndroidActionPermission("unsupported_action"), null);
});

test("Android staff permission groups produce only their documented effective permissions", () => {
  assert.deepEqual(ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS, {
    service_orders: true,
    cashier: false,
    rooms_tasks: true,
    customer_reservation: false,
    market_operations: false
  });
  assert.deepEqual(ANDROID_PERMISSION_GROUP_PERMISSIONS.market_operations, [
    "market.summary.view",
    "market.product.view",
    "market.stock_count",
    "market.receiving",
    "market.product_create",
    "market.cart_draft",
    "market.scan_to_desktop"
  ]);
  assert.deepEqual(ANDROID_PERMISSION_GROUP_PERMISSIONS.cashier, [
    "table.view",
    "table_order.view",
    "table_order.set_payment_waiting",
    "table_order.close_paid",
    "menu.stock_view",
    "finance.view",
    "finance.create",
    "room_folio.view",
    "room_folio.payment"
  ]);
  assert.deepEqual(ANDROID_PERMISSION_GROUP_PERMISSIONS.customer_reservation, [
    "customer.view",
    "customer.respond",
    "customer.mark_answered",
    "reservation.view",
    "reservation.create",
    "reservation.update",
    "reservation.approve"
  ]);

  const serviceOnly = androidPermissionsForGroups({
    service_orders: true,
    cashier: false,
    rooms_tasks: false,
    customer_reservation: false
  });
  assert.equal(serviceOnly.includes("table_order.open"), true);
  assert.equal(serviceOnly.includes("menu.stock_view"), true);
  assert.equal(serviceOnly.includes("menu.stock_update"), false);
  assert.equal(serviceOnly.includes("table_order.close_paid"), false);
  assert.equal(serviceOnly.includes("room.update_status"), false);

  const customerReservation = androidPermissionsForGroups({
    service_orders: false,
    cashier: false,
    rooms_tasks: false,
    customer_reservation: true
  });
  assert.equal(customerReservation.includes("reservation.approve"), true);
  assert.equal(customerReservation.includes("customer.reject"), false);
  assert.equal(customerReservation.includes("customer.convert_to_reservation"), false);
  assert.equal(customerReservation.includes("reservation.reject"), false);
  assert.equal(customerReservation.includes("reservation.cancel"), false);
  assert.equal(customerReservation.includes("menu.stock_view"), false);
  assert.equal(customerReservation.includes("menu.stock_update"), false);

  const roomsOnly = androidPermissionsForGroups({
    service_orders: false,
    cashier: false,
    rooms_tasks: true,
    customer_reservation: false
  });
  assert.equal(roomsOnly.includes("room.update_status"), true);
  assert.equal(roomsOnly.includes("menu.stock_view"), false);
  assert.equal(roomsOnly.includes("menu.stock_update"), false);
});

test("pushAiSettings sends the complete snake_case settings and strips the API key from its response", async () => {
  const calls = [];
  const apiKey = "sk-super-secret";
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body)
    });

    return new Response(JSON.stringify({
      ok: true,
      message: `AI ayarları yayınlandı. ${apiKey}`,
      published_at: "2026-07-12T16:30:00+03:00",
      enabled: true,
      provider: apiKey,
      service: apiKey,
      base_url: apiKey,
      model: apiKey,
      timeout_seconds: 30,
      has_api_key: true,
      api_key: apiKey
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const result = await pushAiSettings({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "sync-secret",
    aiSettings: {
      enabled: true,
      provider: "openai_compatible",
      service: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "demo-model",
      apiKey,
      timeoutSeconds: 30
    },
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result, {
    ok: true,
    message: "AI ayarları yayınlandı. [gizlendi]",
    published_at: "2026-07-12T16:30:00+03:00",
    enabled: true,
    provider: "openai_compatible",
    service: "openrouter",
    base_url: "https://openrouter.ai/api/v1",
    model: "demo-model",
    timeout_seconds: 30,
    has_api_key: true
  });
  assert.equal(JSON.stringify(result).includes(apiKey), false);
  assert.equal(calls[0].url, "https://firma.example/yardimci-asistan/api/sync.php");
  assert.equal(calls[0].headers["X-YA-Sync-Secret"], "sync-secret");
  assert.equal(calls[0].body.action, "publish_ai_settings");
  assert.equal("sync_secret" in calls[0].body, false);
  assert.deepEqual(calls[0].body.ai_settings, {
    enabled: true,
    provider: "openai_compatible",
    service: "openrouter",
    base_url: "https://openrouter.ai/api/v1",
    model: "demo-model",
    api_key: apiKey,
    timeout_seconds: 30
  });
});

test("pushAiSettings rejects insecure remote HTTP without calling fetch", async () => {
  let fetchCalled = false;
  const result = await pushAiSettings({
    baseUrl: "http://firma.example/yardimci-asistan",
    syncSecret: "secret",
    aiSettings: {
      enabled: true,
      provider: "openai_compatible",
      service: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "demo-model",
      apiKey: "secret",
      timeoutSeconds: 15
    },
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /HTTPS/);
  assert.equal(fetchCalled, false);
});

test("pushAiSettings allows HTTP for localhost, 127.0.0.1 and ::1", async () => {
  const targets = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://[::1]:8080"
  ];

  for (const baseUrl of targets) {
    let fetchCalled = false;
    const result = await pushAiSettings({
      baseUrl,
      syncSecret: "secret",
      aiSettings: {
        enabled: false,
        provider: "openai_compatible",
        service: "custom",
        baseUrl: "",
        model: "",
        apiKey: "",
        timeoutSeconds: 15
      },
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response(JSON.stringify({
          ok: true,
          message: "AI ayarları yayınlandı.",
          published_at: "2026-07-12T16:30:00+03:00",
          enabled: false,
          provider: "openai_compatible",
          service: "custom",
          base_url: "",
          model: "",
          timeout_seconds: 15,
          has_api_key: false
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    });

    assert.equal(result.ok, true, baseUrl);
    assert.equal(fetchCalled, true, baseUrl);
  }
});

test("pushAiSettings reports network and old web module failures", async (context) => {
  const options = {
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "secret",
    aiSettings: {
      enabled: true,
      provider: "openai_compatible",
      service: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "demo-model",
      apiKey: "secret",
      timeoutSeconds: 15
    }
  };

  await context.test("network failure", async () => {
    const result = await pushAiSettings({
      ...options,
      fetchImpl: async () => {
        throw new Error("network down");
      }
    });

    assert.equal(result.ok, false);
    assert.match(result.message, /Web modülüne ulaşılamadı/);
    assert.match(result.message, /firma\.example\/yardimci-asistan/);
    assert.equal(result.error, "network down");
  });

  await context.test("local server failure", async () => {
    const result = await pushAiSettings({
      ...options,
      baseUrl: "http://127.0.0.1:8080",
      fetchImpl: async () => {
        throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
      }
    });

    assert.equal(result.ok, false);
    assert.match(result.message, /Yerel web modülüne ulaşılamadı/);
    assert.match(result.message, /sunucusunu başlatın/);
    assert.equal(result.error, "fetch failed (ECONNREFUSED)");
  });

  await context.test("old module failure", async () => {
    const result = await pushAiSettings({
      ...options,
      fetchImpl: async () => new Response(JSON.stringify({
        ok: false,
        message: "Güncelleme isteği anlaşılamadı."
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.message, "Güncelleme isteği anlaşılamadı.");
  });
});

test("pullRequests returns a clear message when connection fails", async () => {
  const result = await pullRequests({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "secret",
    fetchImpl: async () => {
      throw new Error("network down");
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /Web modülüne ulaşılamadı/);
  assert.equal(result.error, "network down");
});

test("sync requests explain missing and invalid web module endpoints", async (context) => {
  await context.test("missing endpoint", async () => {
    const result = await pullRequests({
      baseUrl: "https://firma.example/yardimci-asistan",
      syncSecret: "secret",
      fetchImpl: async () => new Response("not found", { status: 404 })
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.match(result.message, /senkron uç noktası bulunamadı/);
    assert.match(result.message, /Hosting paketini güncelleyip/);
  });

  await context.test("invalid successful response", async () => {
    const result = await pullRequests({
      baseUrl: "https://firma.example/yardimci-asistan",
      syncSecret: "secret",
      fetchImpl: async () => new Response("<html></html>", { status: 200 })
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 200);
    assert.match(result.message, /geçerli bir senkron yanıtı vermedi/);
  });
});


test("pushBusinessContext publishes only profile-aware public business facts", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      ok: true,
      message: "İşletme AI bağlamı yayınlandı.",
      published_at: "2026-09-22T10:00:00+03:00",
      profile_id: "market",
      source_revision: 3,
      server_revision: 7,
      deduplicated: false
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await pushBusinessContext({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "sync-secret",
    clientId: "desktop-1",
    context: {
      version: 1,
      businessName: "Nehir Tekel",
      profileId: "market",
      profileLabel: "Market / Perakende",
      phone: "+903121112233",
      whatsapp: "",
      whatsappEnabled: false,
      email: "info@example.test",
      address: "Örnek Mahallesi",
      latitude: 41.1,
      longitude: 33.2,
      description: "Mahalle marketi.",
      directionsNote: "Ana caddeden ikinci sokak.",
      policyNote: "İade koşulları fiş üzerinde belirtilir.",
      paymentNote: "Nakit ve kart kabul edilir.",
      languages: ["Türkçe"],
      features: [],
      featureIds: [],
      socialLinks: [],
      checkInTime: "",
      checkOutTime: "",
      breakfastStartTime: "",
      breakfastEndTime: ""
    },
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].body.action, "publish_business_context");
  assert.equal(calls[0].body.client_id, "desktop-1");
  assert.equal(calls[0].body.business_context.profile_id, "market");
  assert.equal(calls[0].body.business_context.directions_note, "Ana caddeden ikinci sokak.");
  assert.deepEqual(calls[0].body.business_context.features, []);
  assert.deepEqual(calls[0].body.business_context.feature_ids, []);
  assert.deepEqual(calls[0].body.business_context.social_links, []);
  assert.equal(calls[0].body.business_context.latitude, 41.1);
  assert.equal(calls[0].body.business_context.longitude, 33.2);
  assert.equal("sync_secret" in calls[0].body, false);
});


test("pushAiCatalog publishes only compact public catalog fields", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      ok: true,
      message: "AI ürün kaynağı yayınlandı.",
      published_at: "2026-09-22T01:00:00+03:00",
      item_count: 1,
      source_revision: 1,
      server_revision: 8,
      deduplicated: false
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await pushAiCatalog({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "sync-secret",
    clientId: "desktop-1",
    catalog: {
      version: 1,
      updatedAt: "2026-09-22T00:59:00+03:00",
      items: [{
        id: "p1", source: "catalog", name: "Coca-Cola Zero", description: "330 ml",
        category: "İçecek", brand: "Coca-Cola", barcode: "5449000131805",
        price: 45, currency: "TRY", unit: "piece", available: true, featured: false, tags: []
      }]
    },
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].action, "publish_ai_catalog");
  assert.equal(calls[0].client_id, "desktop-1");
  assert.equal(calls[0].ai_catalog.items[0].name, "Coca-Cola Zero");
  assert.equal("purchase_price" in calls[0].ai_catalog.items[0], false);
  assert.equal("current_quantity" in calls[0].ai_catalog.items[0], false);
});

test("pushRoomCatalog publishes only customer-facing room data", async () => {
  const calls = [];
  const result = await pushRoomCatalog({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "sync-secret",
    clientId: "desktop-1",
    catalog: {
      version: 1,
      enabled: true,
      updatedAt: "2026-09-26T12:00:00Z",
      rooms: [{
        id: "room_101",
        name: "Oda 101",
        number: "101",
        capacity: 2,
        bedInfo: "1 çift kişilik yatak",
        floor: "1. kat",
        features: ["wifi", "private_bathroom"],
        description: "Deniz tarafında.",
        priceNote: "Sezona göre değişebilir.",
        nightlyPriceMinor: 250000,
        currency: "TRY",
        sortOrder: 1,
        media: []
      }]
    },
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        ok: true,
        message: "Oda kataloğu yayınlandı.",
        published_at: "2026-09-26T12:00:01Z",
        room_count: 1
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].action, "publish_room_catalog");
  assert.equal(calls[0].room_catalog.enabled, true);
  assert.equal(calls[0].room_catalog.rooms[0].name, "Oda 101");
  assert.equal("status" in calls[0].room_catalog.rooms[0], false);
});

test("pushTableCatalog publishes only customer-facing table data", async () => {
  const calls = [];
  const result = await pushTableCatalog({
    baseUrl: "https://firma.example/yardimci-asistan",
    syncSecret: "sync-secret",
    clientId: "desktop-1",
    catalog: {
      version: 1,
      enabled: true,
      updatedAt: "2026-09-29T18:00:00Z",
      tables: [{
        id: "table_1",
        name: "Teras 1",
        area: "Teras",
        capacity: 4,
        description: "Deniz tarafındaki masa.",
        features: ["outdoor", "sea_view"],
        smokingPolicy: "outdoor_only",
        sortOrder: 1,
        media: [{
          id: "table_media_1",
          kind: "cover",
          url: "/yardimci-asistan/media/tables/table_1/table_media_1.webp",
          mimeType: "image/webp",
          title: "Teras masası",
          sortOrder: 1
        }]
      }]
    },
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        ok: true,
        message: "Masa kataloğu yayınlandı.",
        published_at: "2026-09-29T18:00:01Z",
        table_count: 1
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].action, "publish_table_catalog");
  assert.equal(calls[0].table_catalog.enabled, true);
  assert.deepEqual(calls[0].table_catalog.tables[0], {
    id: "table_1",
    name: "Teras 1",
    area: "Teras",
    capacity: 4,
    description: "Deniz tarafındaki masa.",
    features: ["outdoor", "sea_view"],
    smoking_policy: "outdoor_only",
    sort_order: 1,
    media: [{
      id: "table_media_1",
      kind: "cover",
      url: "/yardimci-asistan/media/tables/table_1/table_media_1.webp",
      mime_type: "image/webp",
      title: "Teras masası",
      sort_order: 1
    }]
  });
  assert.equal("status" in calls[0].table_catalog.tables[0], false);
  assert.equal("current_customer_id" in calls[0].table_catalog.tables[0], false);
  assert.equal("current_reservation_id" in calls[0].table_catalog.tables[0], false);
  assert.equal("notes" in calls[0].table_catalog.tables[0], false);
});


test("web orders use dedicated actions and do not alter request cursor payloads", async () => {
  const calls = [];
  const transport = new PhpHostingSyncTransport({
    baseUrl: "https://example.test/module",
    syncSecret: "web-orders-secret",
    clientId: "desktop-test-orders",
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers["X-YA-Sync-Secret"], "web-orders-secret");
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, orders: [], count: 0, next_cursor: 7, has_more: false }), { status: 200 });
    }
  });
  assert.equal((await transport.pullWebOrders({ afterSeq: 7, limit: 12 })).ok, true);
  await transport.acknowledgeWebOrders({ throughSeq: 9 });
  await transport.pullRequests({ afterSeq: 3, limit: 5 });
  await transport.acknowledgeRequests({ throughSeq: 4 });
  assert.deepEqual(calls, [
    { action: "pull_web_orders", client_id: "desktop-test-orders", after_seq: 7, limit: 12 },
    { action: "acknowledge_web_orders", client_id: "desktop-test-orders", through_seq: 9 },
    { action: "pull_requests", limit: 5, include_synced: false, after_seq: 3, client_id: "desktop-test-orders" },
    { action: "acknowledge_requests", client_id: "desktop-test-orders", through_seq: 4 }
  ]);
});


test("web order transport rejects invalid page cursors and ordering before import", async () => {
  const { pullWebOrders } = require("../dist");
  for (const payload of [
    { orders: [{ syncSeq: 2 }, { syncSeq: 1 }], next_cursor: 2, count: 2, has_more: false },
    { orders: [{ syncSeq: 1 }], next_cursor: 2, count: 1, has_more: false },
    { orders: [], next_cursor: 1, count: 0, has_more: false },
    { orders: [], next_cursor: 0, count: 0, has_more: true },
    { orders: [{ syncSeq: 1 }], next_cursor: 1, count: 2, has_more: false }
  ]) {
    const result = await pullWebOrders({
      baseUrl: "https://example.test", syncSecret: "test-secret", clientId: "desktop-test", afterSeq: 0,
      fetchImpl: async () => Response.json({ ok: true, ...payload })
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "invalid_web_order_page");
  }
});

test("online catalog publication uses the versioned transport and a public field allowlist", async () => {
  const calls = [];
  const transport = new PhpHostingSyncTransport({
    baseUrl: "https://example.test/module", syncSecret: "online-catalog-secret", clientId: "desktop-catalog",
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return Response.json({ ok: true, product_count: 1, source_revision: 4, server_revision: 9, deduplicated: false });
    }
  });
  await transport.publishOnlineCatalog({ sourceRevision: 4, idempotencyKey: "desktop-catalog:online_catalog:4", value: {
    version: 1, enabled: true, updatedAt: "2026-10-04T00:00:00Z", products: [{
      productId: "p1", name: "Public product", description: "Public description", sku: "SKU-1", unit: "piece",
      price: 25, currency: "TRY", taxRate: 20, imageUrl: "", availability: "available", sortOrder: 0,
      purchasePrice: 10, dealerPriceA: 15, barcode: "private-barcode", internalNotes: "private"
    }]
  }});
  assert.deepEqual(calls[0], {
    action: "publish_online_catalog", client_id: "desktop-catalog", source_revision: 4,
    idempotency_key: "desktop-catalog:online_catalog:4", online_catalog: {
      version: 1, enabled: true, updated_at: "2026-10-04T00:00:00Z", products: [{
        product_id: "p1", name: "Public product", description: "Public description", sku: "SKU-1", unit: "piece",
        price: 25, currency: "TRY", tax_rate: 20, image_url: "", availability: "available", sort_order: 0
      }]
    }
  });
});
