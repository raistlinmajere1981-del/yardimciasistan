# Otomatik Senkronizasyon

Yardımcı Asistan local-first çalışır. Operasyon verisinin ana kopyası masaüstündeki
SQLite veritabanıdır; firma hostingindeki SQLite ise web, masaüstü ve Android arasında
güvenli değişim noktasıdır. PC'ye dışarıdan port açılmaz.

```text
Web formu / Web AI ── yeni talep ──┐
QR menü ─────────────── okuma ─────┤
                                   ▼
                         Firma hostingi
                         PHP API + SQLite
                                   ▲
Android ── action queue / snapshot ┤
                                   │
Masaüstü SQLite ◄── cursor/outbox ─┘
```

## Çalışma Aralıkları

- Masaüstü açıkken koordinatör yaklaşık her 15 saniyede web taleplerini ve Android
  işlem kuyruğunu kontrol eder.
- Yerel menü veya operasyon değişikliği SQLite trigger'larıyla kalıcı outbox'a eklenir.
  Hazır işler yaklaşık bir saniyede görülür ve kısa bir debounce sonrasında yayınlanır.
- Android ön plandayken yaklaşık her 15 saniyede özet yenilenir. Son başarılı özet
  telefonda saklanır; ağ yoksa ekran bu veriyi göstermeye devam eder.
- Android arka plan işi `JobScheduler` ile en az 15 dakikalık periyotta planlanır.
  Android güç tasarrufu kuralları işi daha geç çalıştırabilir.
- QR menü sayfası görünürken 15 saniyede bir ETag ile kontrol edilir. Sayfa yeniden
  görünür olduğunda veya pencere odaklandığında hemen kontrol edilir.

Otomatik eşitleme ilk kurulumda açıktır. `Ayarlar → Gelişmiş Ayarlar → Web Bağlantısı`
alanından kapatılabilir. `Şimdi Eşitle` düğmesi, ayar kapalı olsa bile tek çevrim çalıştırır.

## Güvenilirlik Modeli

Taşıma katmanı en az bir kez teslim varsayımıyla çalışır; uygulama düzeyindeki kimlikler
aynı işlemin iki kez uygulanmasını engeller:

- Her web talebinin monoton `sync_seq` değeri vardır. Masaüstü başarılı SQLite
  transaction'ından sonra cursor'u ilerletir, ardından hostingde aynı cursor'u onaylar.
- Menü ve Android snapshot yayınları `client_id`, `source_revision` ve
  `idempotency_key` taşır. Aynı yayın tekrarlanırsa mevcut sonuç döner; aynı istemciden
  gelen eski revision `409` ile reddedilir.
- Android action kimliği telefonda ağ çağrısından önce üretilir. Telefon outbox'ı,
  hosting kuyruğu ve masaüstü action receipt kaydı bu kimliği korur.
- Android özet isteği ve action gönderimi kalıcı cihaz kimliğiyle birlikte cihaz adı ve
  uygulama sürümünü bildirir. Hostingdeki görülme kayıtları masaüstüne taşınır; rol,
  aktiflik ve action yetkisi yalnız masaüstü SQLite'tan belirlenir.
- Masaüstü snapshot'ı cihaz bazlı etkili izin haritasını taşır. Android bu haritayla
  butonları gizler; masaüstü action apply katmanı aktiflik ve gerekli izni ayrıca kontrol
  ederek istemci UI'ını güvenlik sınırı olarak kabul etmez.
- Android bir kez çözümlenmiş cihaz profilini ayrıca yerelde saklar. Sonraki snapshot'ta
  profil geçici olarak eksikse aktif staff varsayımına geri dönmez; son güvenilir aktiflik
  ve izinleri koruyarak profil kaybını fail-open hale getirmez.
- Masaüstü outbox işi yalnız sunucu yayını kabul ettikten sonra silinir; kalıcı
  revision sayacı korunur. İş sırasında yeni yerel değişiklik gelirse daha yüksek
  revision'lı iş korunur.
- Başarısız yayınlar yaklaşık 5, 15, 30, 60 ve en fazla 300 saniyelik artan gecikmeyle
  yeniden denenir; küçük jitter aynı anda toplu yeniden denemeyi azaltır.

Yerel masaüstü işlemleri internet kesildiğinde devam eder. Web talebi hostingde, Android
işlemi telefon/hosting outbox'ında, masaüstü yayını ise yerel outbox'ta bekler.

## Hosting Deposu

Web modülü için `PDO` ve `pdo_sqlite` zorunludur. Çalışma anında aşağıdaki dosya oluşur:

```text
yardimci-asistan/data/yardimci-asistan.sqlite
```

SQLite; web taleplerini, Android action kuyruğunu, yayınları, idempotency receipt'lerini,
Android cihaz görülme kayıtlarını, istemci cursor'larını ve sunucu revision'ını tutar.
`data/` PHP kullanıcısı tarafından
yazılabilir olmalıdır ve tarayıcıdan doğrudan erişime kapatılmalıdır.

Güncel paket yalnız current SQLite storage ile başlar; eski JSON çalışma dosyaları
otomatik içe aktarılmaz. İlk açılışta storage şeması doğrulanır ve sonraki çalışma
verileri yalnız SQLite'a yazılır.

Kurulum kontrolü:

```bash
curl -X POST 'https://firma.example/yardimci-asistan/api/sync.php' \
  -H 'Content-Type: application/json' \
  -H 'X-YA-Sync-Secret: uzun-gizli-anahtar' \
  --data '{"action":"capabilities"}'
```

Başarılı cevapta `protocol_version: 2`, `storage: "sqlite"` ve `features` içinde
`android_device_sightings` ile `android_device_permissions` bulunmalıdır.
Masaüstü Android modülü açıkken bu capability'ler eksikse senkronu başarılı saymaz. Canlı
hostingde HTTPS kullanın; sync anahtarını URL query parametresine veya loglara yazmayın.

## Taşıma Katmanı

`packages/sync-core` içindeki `SyncTransport` iş akışını hosting sağlayıcısından ayırır.
Bugünkü adaptör `PhpHostingSyncTransport` sınıfıdır ve aynı arayüz üzerinden şunları yapar:

- özellik keşfi;
- cursor ile talep çekme ve onaylama;
- Android action çekme ve sonucunu tamamlama;
- revision/idempotency korumalı menü ve Android snapshot yayını.

İleride yönetilen cloud eklenirken koordinatör ve ekranlar değiştirilmeden yeni bir
`SyncTransport` adaptörü yazılabilir. Bu sürüm yalnız PHP hosting adaptörünü içerir;
yönetilen cloud tarafında henüz çift yazma veya veri taşıma yapılmaz.

## Doğrulama

Tam otomatik akışın cihazsız smoke testi:

```bash
npm run smoke:automatic-sync
```

Test; geçici PHP/SQLite hostingi ve geçici masaüstü SQLite'ı birlikte çalıştırır. Talep
cursor/ack akışını, Android action uygulamasını, outbox yayınlarını, idempotency'yi,
stale revision reddini ve değişmeyen Android özetini doğrular.
