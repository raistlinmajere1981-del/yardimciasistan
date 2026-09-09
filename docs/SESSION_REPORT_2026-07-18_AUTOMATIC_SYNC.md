# Yardımcı Asistan Otomatik Senkronizasyon Oturum Raporu

**Tarih:** 17–18 Temmuz 2026  
**Kapsam:** Web sitesi, masaüstü uygulaması ve Android uygulaması arasındaki
iletişim noktalarının analiz edilmesi; manuel veri aktarımının otomatik, dayanıklı ve
ileride farklı bir bulut altyapısına taşınabilir bir senkronizasyon sistemine
dönüştürülmesi.  
**Sonuç:** Geliştirme, test ve Alwaysdata canlı geliştirme ortamına dağıtım
tamamlandı.

> **Baseline cleanup notu (2026-09-09):** Bu tarihsel raporun ilk bölümleri
> JSON tabanlı hosting ve çoklu migration dönemi için yazılmıştır. Güncel
> uygulama `001_baseline.sql` ile temiz SQLite kurar; eski JSON çalışma verisi,
> eski migration zinciri ve gövde içi sync kimlik doğrulaması desteklenmez.

## 1. Yönetici Özeti

Oturum başında web taleplerini çekme, QR menüyü yayınlama ve Android operasyon
verisini güncelleme işlemleri manuel tetikleniyordu. Hosting tarafında çalışma verileri
JSON dosyalarında tutuluyor ve masaüstü, web ile Android arasında ortak bir teslimat,
sürümleme ve yeniden deneme modeli bulunmuyordu.

Sistem local-first yaklaşımla yeniden düzenlendi:

- Operasyon verisinin ana kopyası masaüstü SQLite veritabanında kalır.
- PHP hostingindeki SQLite, web, masaüstü ve Android arasında ortak değişim
  noktasıdır.
- Masaüstü bilgisayara dışarıdan port açılmaz; tüm iletişim istemcilerin HTTPS
  üzerinden hostinge yaptığı dışa doğru bağlantılarla gerçekleşir.
- Web talepleri cursor ile, masaüstü yayınları kalıcı outbox ile, Android
  işlemleri ise kimlik korumalı action queue ile taşınır.
- Tekrar gönderimler cursor, `action_id`, `source_revision` ve `idempotency_key`
  kullanılarak güvenli hâle getirilmiştir.
- Hosting sağlayıcısına bağımlı kod `SyncTransport` arayüzünün arkasına
  alınmıştır. Bu sürümde PHP hosting adaptörü uygulanmış, ileride yönetilen
  bulut adaptörü eklenebilmesi için sınır hazırlanmıştır.

## 2. Uygulanan Mimari

```text
Web formu / Web AI ── yeni talep ──┐
QR menü ────────────── okuma ────├── PHP API + Hosting SQLite
Android ── action queue / snapshot ─┘                 ↑↓
                                              Masaüstü SQLite
                                           cursor + ack + outbox
```

Temel senkronizasyon süreleri:

- Masaüstü açıkken yaklaşık 15 saniyede bir web talebi ve Android action
  kontrolü.
- Yerel bir değişiklik sonrası outbox taraması yaklaşık 1 saniye, yayın
  debounce süresi 750 milisaniye.
- Android ön plandayken yaklaşık 15 saniyede bir revision kontrollü yenileme.
- Android arka planında sistem koşullarına bağlı, en az 15 dakikalık
  `JobScheduler` periyodu.
- QR menü sayfası görünürken 15 saniyede bir ETag kontrollü yenileme; sayfa
  tekrar görünür olduğunda veya odaklandığında anında kontrol.

## 3. Bileşen Bazında Yapılan Çalışmalar

### 3.1 PHP Hosting ve SQLite

`firm-template/web-module/lib/storage.php` ile PDO SQLite tabanlı ortak depo
oluşturuldu. Depoda aşağıdaki temel tablolar bulunur:

- `sync_meta`: şema ve sunucu revision bilgileri.
- `web_requests`: monoton `seq` değerine sahip web talepleri.
- `android_actions`: telefon işlem kuyruğu ve sonuçları.
- `publications`: menü ve Android snapshot yayınları.
- `publication_receipts`: idempotent yayın sonuçları.
- `sync_clients`: masaüstü istemci cursor ve son görülme bilgileri.

SQLite için WAL, foreign key, busy timeout ve atomik revision artırma desteği
eklendi. Yeni API protokolü şu yetenekleri sunar:

- `capabilities` ile protokol ve depolama keşfi.
- Cursor ile sayfalı talep çekme ve işlem tamamlandıktan sonra acknowledgement.
- Android action ekleme, çekme ve uygulandı/başarısız sonucunu kaydetme.
- Menü ve Android snapshot için revision/idempotency korumalı yayın.
- Android tarafında `known_server_revision` ile değişmeyen cevabı kısaltma.
- QR menü için ETag ve `304 Not Modified` desteği.

Güncel paket yalnız current SQLite storage kullanır. Eski JSON çalışma dosyaları
otomatik içe aktarılmaz; sonraki çalışma verisi yalnız SQLite'a yazılır.

### 3.2 Ortak Taşıma Katmanı

`packages/sync-core/index.ts` içine sağlayıcıdan bağımsız `SyncTransport`
arayüzü ve mevcut PHP sunucusu için `PhpHostingSyncTransport` eklendi. Arayüz;
capability sorgulama, talep cursor/ack, Android action ve sürümlü yayın
işlemlerini kapsar.

İstemciler senkron anahtarını yalnız `X-YA-Sync-Secret` başlığında gönderir. Anahtar
URL query parametresine veya request body'ye yazılmaz.

### 3.3 Masaüstü Uygulaması

`apps/desktop-app/electron/sync-coordinator.ts` içinde tek bir otomatik
senkronizasyon koordinatörü oluşturuldu. Koordinatör:

- Aynı anda yalnız bir senkron çevriminin çalışmasını sağlar.
- Web taleplerini cursor ile çeker.
- Talebi ve cursor'u aynı yerel SQLite transaction'ında kaydeder.
- Yerel kayıt tamamlandıktan sonra hosting cursor'unu onaylar.
- Android action'larını yerel veriye uygular ve action receipt oluşturur.
- Menü ve operasyon snapshot outbox'ını yayınlar.
- Ağ veya sunucu hatalarında yaklaşık 5, 15, 30, 60 ve en fazla 300
  saniyelik jitter'lı backoff uygular.

Masaüstü SQLite'a şu kalıcı senkron yapıları eklendi:

- `sync_runtime`: cursor, acknowledgement, son deneme/başarı ve hata bilgisi.
- `sync_outbox`: menü ve Android snapshot için bekleyen işler.
- `sync_outbox_revisions`: iş tamamlandıktan sonra da korunan monoton yayın
  revision sayacı.
- `auto_sync_enabled`: varsayılan olarak açık otomatik senkron ayarı.
- `sync_client_id`: kurulum boyunca sabit kalan masaüstü istemci kimliği.

Menü, talep, oda, masa, rezervasyon, günlük iş, müşteri, mesaj ve adisyon
değişiklikleri SQLite trigger'larıyla uygun outbox işini otomatik olarak günceller.
Arayüze otomatik senkronu açma/kapatma, anlık durum, bekleyen iş sayısı ve
`Şimdi Eşitle` işlemleri eklendi.

### 3.4 Android Uygulaması

- Başarılı son operasyon cevabı `OperationCache` ile telefonda saklanır.
- Uygulama ağ olmadan açıldığında son başarılı veri gösterilir.
- Ön planda 15 saniyelik otomatik yenileme eklendi.
- `SyncJobService` ile bekleyen action'ları gönderen ve snapshot cache'ini
  yenileyen arka plan işi eklendi.
- Snapshot indirme işlemi revision kontrollü hâle getirildi.
- Telefon action kimliği ilk ağ isteğinden önce üretilmeye devam eder; aynı
  işlem tekrar gönderilirse hosting ve masaüstü tarafında ikinci kez uygulanmaz.

### 3.5 QR Menü

`menu.html` görünürken periyodik ETag kontrolü yapacak şekilde güncellendi.
Arka plandaki sekme gereksiz istek yapmaz; tekrar görünür olduğunda hemen
yenilenir. Otomatik yenilemede seçili kategori artık mevcut değilse filtre güvenli
biçimde `Tümü` seçeneğine döner.

## 4. Doğrulama Sırasında Bulunan ve Giderilen Sorunlar

1. **Yayın revision'ının yeniden 1 olması:** Başarılı outbox satırı silinince
   sonraki işin revision'ı yeniden 1 olabiliyor ve sunucu bunu eski yayın olarak
   `409` ile reddediyordu. `011_persistent_sync_revisions.sql` ile kalıcı revision
   sayacı eklendi.
2. **Zamanlayıcıların aynı işi tetikleme riski:** Başlangıç, periyodik pull ve
   outbox debounce zamanlayıcıları single-flight davranışında birleştirildi.
   Çevrimdışı testinde backoff süresi boyunca yalnız tek deneme yapıldığı
   doğrulandı.
3. **Xvfb testinin Electron sürecini geride bırakması:** Test yalnız sarmalayıcıyı
   kapatıyor ve sonraki çalıştırma tek-instance kilidine takılıyordu. Test tüm
   süreç grubunu kapatacak ve erken `0` kodlu çıkışı hata sayacak şekilde
   düzeltildi.
4. **Canlı hostingin eski protokolde kalması:** Masaüstü ekranında
   `Güncelleme isteği anlaşılamadı. · 2 eşitleme bekliyor` mesajı görüldü.
   Yerel durum ve canlı endpoint sorgulandı; Alwaysdata sunucusunun
   `capabilities` isteğine HTTP 400 verdiği ve eski `sync.php` dosyasını
   çalıştırdığı kesinleştirildi.

## 5. Alwaysdata Canlı Geliştirme Dağıtımı

Kullanıcı onayıyla mevcut canlı geliştirme verisinin korunması zorunlu kabul
edilmeden güncel modül dağıtıldı.

Gerçekleştirilen işlemler:

- Kayıtlı SSH anahtarıyla `ssh-yardimciasistan.alwaysdata.net` bağlantısı
  doğrulandı.
- Sunucuda PHP 8.4.23 ve `PDO_SQLITE` desteğinin etkin olduğu kontrol edildi.
- Dağıtım paketi masaüstündeki mevcut sync anahtarıyla, anahtar ekrana veya
  loga yazılmadan yeniden üretildi.
- Paket önce staging dizinine yüklendi ve kritik PHP dosyaları sunucuda lint
  edildi.
- Yeni sürüm atomik dizin değişimiyle
  `/home/yardimciasistan/www/yardimci-asistan` konumuna alındı.
- Eski sürüm geri dönüş için web kökü dışında şu konumda saklandı:

```text
/home/yardimciasistan/backups/yardimci-asistan-pre-v2-20260718T103616Z
```

- Canlı `data/` dizini `0700`, SQLite dosyası ve `config/business.json` `0600`
  izinle oluşturuldu.
- Canlı endpoint son kontrolde HTTP 200, `protocol_version: 2`,
  `storage: "sqlite"` döndürdü.

Masaüstü, önceki yedi başarısız denemeden kaynaklanan backoff süresi dolunca
kendiliğinden yeniden bağlandı. Manuel müdahale olmadan iki bekleyen yayını
gönderdi ve durum şu hâle geldi:

```text
Bekleyen outbox işi: 0
Ardışık hata:      0
Son hata:             boş
```

Canlı doğrulamada:

- QR menü: 4 kategori, 5 ürün.
- Android snapshot: 1 talep, 2 oda, 2 masa.
- Hosting SQLite: 2 publication ve 2 idempotency receipt.
- Sunucu revision: 3.

## 6. Test ve Kalite Sonuçları

Aşağıdaki kontroller başarıyla tamamlandı:

- TypeScript typecheck, paket testleri ve tüm proje build'i.
- Sync core: 20 test başarılı.
- AI core: 16 test başarılı.
- Shared paket: 6 test başarılı.
- WhatsApp bridge: 8 test başarılı.
- Playwright masaüstü/mobil: 6/6 senaryo başarılı.
- PHP lint: tüm API, config ve storage dosyaları başarılı.
- Geçici PHP + SQLite ve masaüstü SQLite kullanan tam otomatik senkron smoke
  testi başarılı.
- Cursor/ack, Android action, idempotency, stale revision, ETag ve Android
  `not_modified` akışları başarılı.
- Web form API, QR menü, widget ve demo akış smoke testleri başarılı.
- Android debug APK derleme/doğrulama testi başarılı.
- Masaüstü veritabanı, renderer ve gerçek Electron/Xvfb başlangıç testi
  başarılı.
- Web modülü dağıtım paketi ve manifest doğrulaması başarılı.

Temel doğrulama komutu:

```bash
npm run smoke:automatic-sync
```

## 7. Başlıca Dosyalar

- `docs/AUTOMATIC_SYNC.md`: sistemin kullanım ve işletim dokümanı.
- `firm-template/web-module/lib/storage.php`: hosting SQLite katmanı.
- `firm-template/web-module/api/sync.php`: protokol v2 API uç noktası.
- `apps/desktop-app/electron/sync-coordinator.ts`: masaüstü otomatik senkron
  koordinatörü.
- `apps/desktop-app/db/migrations/001_baseline.sql`: güncel runtime/outbox,
  otomatik kuyruk trigger'ları ve kalıcı yayın revision şeması.
- `packages/sync-core/index.ts`: taşıma arayüzü ve PHP adaptörü.
- `apps/android-app/src/main/java/com/yardimciasistan/android/OperationCache.java`:
  Android offline cache.
- `apps/android-app/src/main/java/com/yardimciasistan/android/SyncJobService.java`:
  Android arka plan senkronu.
- `scripts/smoke-automatic-sync.mjs`: cihaz gerektirmeyen tam akış testi.

Dağıtıma hazır web paketi:

```text
artifacts/web-module-deploy/yardimci-asistan.tar.gz
```

## 8. Bilinen Sınırlar ve Sonraki Öneriler

- `SyncTransport` soyutlaması hazırdır ancak bu sürümde yalnız PHP hosting
  adaptörü bulunur; yönetilen cloud adaptörü henüz uygulanmamıştır.
- Sistem gerçek zamanlı WebSocket yerine kontrollü polling kullanır. Mevcut
  işletme ölçeği için bu daha basit ve yeterlidir; daha yüksek ölçekte push veya
  event stream ayrıca değerlendirilebilir.
- Android `JobScheduler` kesin dakikada çalışma garantisi vermez; Android'in pil
  ve arka plan politikaları gecikmeye neden olabilir.
- Üretim kullanımından önce hosting SQLite için periyodik yedekleme, saklama
  politikası, disk kotası izlemesi ve capability/health alarmı eklenmesi önerilir.
- Üretimde yalnız HTTPS kullanılmalı ve sync anahtarı düzenli döndürülmelidir.
- Eski body authentication uyumluluğu güncel baseline cleanup ile kaldırılmıştır.

## 9. Nihai Durum

Web, masaüstü ve Android arasındaki mevcut iş akışları artık otomatik,
local-first, tekrar gönderime dayanıklı ve çevrimdışı çalışmayı koruyan bir
senkronizasyon modeliyle çalışmaktadır. Sistem hem geçici test ortamında hem de
Alwaysdata canlı geliştirme kurulumunda uçtan uca doğrulanmıştır.
