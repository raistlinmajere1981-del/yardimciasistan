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

Arka plan eşitlemesi aktif sayfayı yeniden açmaz. Masaüstünde aynı içerikli snapshot
alanları referanslarını korur. Sayfalı müşteri listesinin canonical invalidation
okuması arka planda devam eder; mevcut liste ve kontroller yükleme durumuna
döndürülmez, aynı sonuç tekrar state'e yazılmaz. Revision sıralama koruması sürer.
Android'de değişmeyen snapshot ekran gövdesini yeniden oluşturmaz; bağlantı düğmesi
ve son eşitleme bilgisi kabukta güncellenir. Sunucu revision'ı veya okuma zamanları
ilerlediğinde tam yanıtta da mevcut redakte cache içeriği karşılaştırılır;
kalıcı cache/revision kaydı ve kaynak sıralama kontrolleri atlanmaz. `not_modified`
yanıtındaki işlem sonucu, bekleyen işlem sayısı veya ses kullanılabilirliği
değişirse ilgili görünüm yenilenir. Android bağlantı ayarlarının durum satırları
yerinde güncellenir; gerçek veri değişimi nedeniyle ekran yeniden oluşturulursa
açık bağlantı taslağı mevcut ayarlar sahibi üzerinden korunur.

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
- Android oda hesabına menü ürünü (`room_folio_menu_item_add`) ve manuel ek ücret
  (`room_folio_manual_charge_add`) ekleme, açık hesap ve giriş yapılmış geçerli
  konaklama gerektirir. `rooms_tasks` grubunun ayrı `room_folio.add_menu_item` ve
  `room_folio.add_manual_charge` izinleri, `room_folio.view` ile birlikte kontrol
  edilir; menü kalemi ayrıca `menu.view` gerektirir. Kalem ekleme tahsilat değildir.
  Menü/stok özeti cihazın okuma izinleri ve işletmenin etkin capability'leriyle süzülür.
- Yeni oda hesabı kalemleri `expected_folio_version` taşır; sürüm hesap, kalem,
  ödeme ve konaklama durumundan üretilir. Menü kalemi ayrıca menü güncelleme zamanı,
  minor-unit fiyat ve para birimi beklentisi taşır. Eski veri sessizce yeniden
  fiyatlandırılmaz. Kanonik kalem, stok tüketimi, snapshot outbox işi ve action receipt
  aynı transaction'da commit edilir; tekrar teslim ikinci kalem veya stok düşümü üretmez.
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

### Mobil KBS bildirim yönetimi

Bugün kartı ve Pansiyon → KBS, yalnız aktif yönetici cihazında `kbs.view`,
`service.android`, `accommodation.rooms`, `accommodation.stays` ve etkin KBS
kesişiminde görünür. Personel grupları KBS izni vermez. Hosting kişisel cihaz
anahtarı ister; ortak sync anahtarıyla KBS özeti veya işlem açılamaz. KBS ayarı,
kurum şifresi, tesis/kullanıcı bilgisi, kimlik/belge numarası ve ham sağlayıcı
yanıtı taşınmaz. İzinli snapshot; enabled/configured/provider, durum/kimlik
hazırlığı sayıları ve en fazla 500 minimal bildirim kaydını taşır. Sayılar tüm
kayıtlara aittir; LOCAL, HOSTING ve Android parse/disk cache ayrı allowlist uygular.
Müşteri snapshot'ındaki kimlik/belge numaraları da boş döner; mobil düzenlemede
boş/eksik değerler masaüstündeki mevcut numaraları silmez.

`kbs_send_request` yalnız bildirim kimliği, beklenen durum ve sağlayıcı taşır.
KBS'nin `kbs_delivery_requests` kaydı, immutable intent hash ve Android receipt
aynı transaction'da commit olur. Yerel işleyici başlangıçta, commit sonrasında
ve periyodik taramada çalışır; Hosting bağlantısına veya otomatik yayın ayarına
bağımlı değildir. Provider I/O açık Android/SQLite transaction'ında çalışmaz.
Güncel yetki, capability, KBS ayarı, sağlayıcı, durum ve kimlik yeniden kontrol
edildikten sonra mevcut `KbsDeliveryService.deliver` kullanılır. I/O öncesindeki
kalıcı `submission_unknown` fence hiçbir restart veya iş tamamlama hatasında
silinmez; belirsiz sonuç yeniden POST edilmez. Kesin ret sonrasındaki iş tamamlama
hatası da otomatik tekrar gönderim üretmez.

`kbs_retry_prepare` için `kbs.retry`, failed durum ve kalıcı kesin ret kanıtı
gerekir; sent/submission_unknown veya kanıtsız eski failed kayıtları reddedilir.
Bu eylem gönderim yapmaz. `kbs_mark_sent_externally`, `kbs.reconcile_external`
ve resmi portalda bu kaydın bulunduğunu belirten iki açık kullanıcı onayı ister;
mevcut harici gönderim operasyonunu kullanır. Portal kontrolü veya sent geçişi
otomatik yapılmaz.

Android “Kuyruğa alındı”, “Masaüstüne ulaştı”, “Resmi olarak gönderildi” ve
“Sonuç belirsiz” durumlarını ayırır. Yerel işlemenin gönderim koşulları/yetki
nedeniyle durması da minimal request state ile görünür; action applied resmi
gönderim onayı değildir. Bildirim değişiklikleri, KBS ayarı ve istek sonuçları
mevcut android_snapshot outbox'ını transaction içinde invalid eder; aynı kalıcı
yayın, revision ve exact acknowledgement hattı kullanılır.

`android-kbs` ve `android-kbs-hosting` registry kontrolleri geçici SQLite/PHP
fixture'ları ve mock provider kullanır. Gerçek EGM/Jandarma giriş, WSDL, gönderim,
bağlantı veya kurum kayıt doğrulaması bu kontrollerin parçası değildir.

### Mobil Market satış ve cari işlemleri

`market_sale_complete`, mevcut sepetin ürün kimlikleri, miktarları, stok konumu,
`paid|credit` settlement ve ödeme türünü taşır. Her satırın `expected_unit_price`,
`expected_currency` ve `expected_updated_at` alanları yalnız beklentidir.
Masaüstü `completeMarketSaleInTransaction` üzerinden güncel müşteri/katalog fiyatını
ve stoğu doğrular; farklı fiyat/sürümde yeni onay ister. Satış, stok ve varsa cari
debit ile source action ID makbuzu tek SQLite transaction'ında kaydedilir.
Mevcut `market_cart_draft_create` ayrı taslak akışı olarak kalır.

`customer_credit_payment_add`, pozitif integer `amount_minor`, currency ve
`expected_balance_minor` ister. Cari owner'ın transaction içi ödeme operasyonu
güncel borcu doğrular; ledger credit, finance income ve Android makbuzu birlikte
commit olur. Aynı action ID retry yeni hareket üretmez; cihaz/tür/içerik değişimi
reddedilir. `cash|card|bank|other` alınmış ödemenin kaydıdır; kart için
`external_payment_confirmed=true` zorunludur. Telefon harici POS'a tahsilat göndermez.

Personelin `market_sales`, `customer_credit_view`, `customer_credit_payment`
grupları ayrı ve varsayılan kapalıdır. Cari erişim Market çalışma alanı ile
`commerce.customer_credit`, Customers, Sales/Catalog ve Finance kesişimindedir.
Hosting kişisel cihaz token'ı gerektirir; Hosting ve LAN izin/capability redaksiyonu
cari müşteri adı, ayrı döviz bakiyeleri ve son 10 hareketle sınırlıdır. Telefon/kimlik,
not ve satış detayları bu projection'a girmez. Sonuçlar mevcut cache/outbox içinde
saklanır; offline veya Hosting'e kabul edilmiş `pending` işlemler **Masaüstünde onay
bekliyor** olarak görünür. Tamamlanma yalnız `applied` sonucu geldikten sonra gösterilir.

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
