const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createSyncEndpointUrl,
  markRequestsSynced,
  pushAndroidSnapshot,
  pushMenu,
  pullRequests
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
  assert.equal(calls[0].body.sync_secret, "secret");
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
  assert.equal(calls[0].body.sync_secret, "secret");
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
  assert.equal(calls[0].body.sync_secret, "secret");
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
  assert.match(result.message, /Bağlantı/);
  assert.equal(result.error, "network down");
});
