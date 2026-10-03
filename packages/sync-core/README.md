# Sync Core

Firma hostingindeki mini API ile local PC uygulaması arasındaki veri alışverişi bu pakette geliştirilir.

PC dışarıya port açmaz; hostingdeki mini API'ye istek atarak yeni talepleri çeker. Bağlantı sorunlarında uygulama local çalışmaya devam etmelidir.

## Taşıma Sınırı

Otomatik koordinatör doğrudan PHP fonksiyonlarına bağlı değildir. Sağlayıcıdan bağımsız
`SyncTransport` sözleşmesini kullanır. Güncel adaptör:

```ts
const transport = new PhpHostingSyncTransport({
  baseUrl: "https://firma.example/yardimci-asistan",
  syncSecret: "uzun-gizli-anahtar",
  clientId: "desktop-kalici-uuid"
});

await transport.getCapabilities();
const page = await transport.pullRequests({ afterSeq: 0, limit: 100 });
if (page.ok) {
  // Önce local SQLite transaction'ını tamamla.
  await transport.acknowledgeRequests({ throughSeq: page.next_cursor ?? 0 });
}
```

Menü ve Android snapshot yayınları `sourceRevision` ile `idempotencyKey` ister.
Bugünkü uygulama `PhpHostingSyncTransport` kullanır; yönetilen cloud için daha sonra
aynı arayüzü uygulayan ikinci bir adaptör eklenebilir.

## İlk Fonksiyonlar

```ts
pullRequests({
  baseUrl: "https://firma.example/yardimci-asistan",
  syncSecret: "change-this-secret"
});

markRequestsSynced({
  baseUrl: "https://firma.example/yardimci-asistan",
  syncSecret: "change-this-secret",
  requestIds: ["request_001"]
});

pushMenu({
  baseUrl: "https://firma.example/yardimci-asistan",
  syncSecret: "change-this-secret",
  menu: {
    categories: [],
    items: [],
    updated_at: "2026-07-10T10:00:00+03:00"
  }
});

pushAndroidSnapshot({
  baseUrl: "https://firma.example/yardimci-asistan",
  syncSecret: "change-this-secret",
  snapshot: {
    summary: {
      pending_daily_tasks: 2,
      today_tasks: 4,
      available_rooms: 5,
      total_rooms: 8,
      available_tables: 7,
      occupied_tables: 2,
      bill_waiting_tables: 1,
      active_table_orders: 3,
      pending_reservations: 1,
      prepared_whatsapp_messages: 3,
      waiting_responses: 2,
      active_menu_categories: 4,
      available_menu_items: 18,
      customer_count: 24
    },
    daily_tasks: [],
    requests: [],
    customers: [],
    reservations: [],
    rooms: [],
    tables: [],
    menu: {
      categories: [],
      items: [],
      updated_at: "2026-07-10T10:00:00+03:00"
    },
    table_orders: [],
    messages: [],
    updated_at: "2026-07-10T10:00:00+03:00"
  }
});

pushAiSettings({
  baseUrl: "https://firma.example/yardimci-asistan",
  syncSecret: "change-this-secret",
  aiSettings: {
    enabled: true,
    provider: "openai_compatible",
    service: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "provider/model-name",
    apiKey: "yalnız-main-process-değeri",
    timeoutSeconds: 30
  }
});
```

Başarısız bağlantı veya hatalı güvenlik anahtarı durumunda fonksiyonlar uygulamayı kilitlemez; `ok: false` ve kullanıcıya sade gösterilebilecek bir `message` döndürür.

Tüm güncel senkron çağrıları anahtarı `X-YA-Sync-Secret` header'ında gönderir; JSON
gövdesine veya query string'e eklemez. Canlı uzak hedefte HTTPS kullanılmalıdır.

`pushMenu()` PC'deki QR menü verisini `api/sync.php` içindeki `publish_menu` aksiyonuna gönderir. Başarılı yayın sonrası müşteri menüsü `api/menu.php` üzerinden güncel veriyi okur; web modülü ayrı bir `menu.html` taşımaz.

`pushAndroidSnapshot()` PC'deki local oda, masa, rezervasyon, günlük iş ve müşteri özetini `publish_android_snapshot` aksiyonuna gönderir. Android uygulama aynı veriyi `android_summary` cevabındaki `operations` ve `daily_tasks` alanlarından okur.

Snapshot ayrıca Android operasyon ekranlarının ihtiyaç duyduğu talepler, müşteriler,
rezervasyonlar, odalar, masalar, QR menü ürünleri, aktif adisyonlar ve hazır mesajları
içerir.

`pullAndroidActions()` hostingde bekleyen telefon işlemlerini masaüstüne çeker.
Masaüstü yerel işlemi uyguladıktan sonra `markAndroidActionResult()` ile sonucu
`applied` veya `failed` olarak kaydeder. Masaüstündeki action receipt kaydı aynı kimliğin
yeniden gelmesi halinde işlemin ikinci kez uygulanmasını engeller.

`getSyncCapabilities()` hostingin protokol ve depolama desteğini doğrular.
Otomatik koordinatör `protocol_version >= 2` ve `storage === "sqlite"` bekler.
`pullRequests()` çağrısındaki `afterSeq` kalıcı cursor'u, `acknowledgeRequests()` ise
başarılı yerel import sonrasındaki onayı temsil eder.

`publishOnlineCatalog()` mevcut `VersionedPublication` sözleşmesiyle
`publish_online_catalog` aksiyonunu çağırır. `online_catalog_v1` feature'ı bu protokolü
bildirir. Kalıcı `online_catalog` outbox revision'ı tamamlanan yayınlardan sonra da
monoton artar; aynı revision/idempotency key ile retry tekrar yayın üretmez.
`channel.online_sales` kapalıyken builder disabled/empty projection hazırlar. Hosting
public `GET /api/catalog.php` yalnız bu public-safe projection'ı okur; submission yapmaz.

`pushAiSettings()` masaüstünde kaydedilen AI bağlantısını `publish_ai_settings` aksiyonuna yollar. Uzak hedeflerde HTTPS zorunludur; HTTP yalnız loopback geliştirme adreslerinde kabul edilir. API anahtarı istekten sonra sonuç nesnesine veya hata mesajına geri taşınmaz.

## Komutlar

```bash
npm run build
npm test
```
