# Sync Core

Firma hostingindeki mini API ile local PC uygulaması arasındaki veri alışverişi bu pakette geliştirilir.

PC dışarıya port açmaz; hostingdeki mini API'ye istek atarak yeni talepleri çeker. Bağlantı sorunlarında uygulama local çalışmaya devam etmelidir.

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
      available_rooms: 5,
      total_rooms: 8,
      available_tables: 7,
      pending_reservations: 1,
      prepared_whatsapp_messages: 3,
      active_menu_categories: 4,
      available_menu_items: 18,
      customer_count: 24
    },
    daily_tasks: [],
    updated_at: "2026-07-10T10:00:00+03:00"
  }
});
```

Başarısız bağlantı veya hatalı güvenlik anahtarı durumunda fonksiyonlar uygulamayı kilitlemez; `ok: false` ve kullanıcıya sade gösterilebilecek bir `message` döndürür.

`pushMenu()` PC'deki QR menü verisini `api/sync.php` içindeki `publish_menu` aksiyonuna gönderir. Başarılı yayın sonrası müşteri menüsü `menu.html` üzerinden güncel veriyi okur.

`pushAndroidSnapshot()` PC'deki local oda, masa, rezervasyon, günlük iş ve müşteri özetini `publish_android_snapshot` aksiyonuna gönderir. Android uygulama aynı veriyi `android_summary` cevabındaki `operations` ve `daily_tasks` alanlarından okur.

## Komutlar

```bash
npm run build
npm test
```
