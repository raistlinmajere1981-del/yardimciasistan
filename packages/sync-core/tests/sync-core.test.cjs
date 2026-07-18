const assert = require("node:assert/strict");
const test = require("node:test");
const {
  acknowledgeRequests,
  createSyncEndpointUrl,
  getSyncCapabilities,
  markAndroidActionResult,
  markRequestsSynced,
  pullAndroidActions,
  pushAiSettings,
  pushAndroidSnapshot,
  pushMenu,
  pullRequests,
  PhpHostingSyncTransport
} = require("../dist");

test("createSyncEndpointUrl creates the mini API sync endpoint", () => {
  assert.equal(
    createSyncEndpointUrl("https://firma.example/yardimci-asistan/"),
    "https://firma.example/yardimci-asistan/api/sync.php"
  );
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
      updated_at: "2026-07-10T14:30:00+03:00"
    },
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(result.task_count, 1);
  assert.equal(calls[0].body.action, "publish_android_snapshot");
  assert.equal(calls[0].body.snapshot.summary.available_rooms, 4);
  assert.equal(calls[0].body.snapshot.daily_tasks[0].id, "task_001");
  assert.equal("sync_secret" in calls[0].body, false);
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
