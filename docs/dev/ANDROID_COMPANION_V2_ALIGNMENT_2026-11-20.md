# Android Companion — Masaüstü V2 uyumluluk paketleri

Tarih: 20 Kasım 2026. Çalışma biçimi: tek paket = kısa, kendi başına test edilebilir
yerel geliştirme turu. Paketler arası kullanıcıyla kısa değerlendirme; eşzamanlı
arka plan işi yok. Fiziksel APK kurulum, Windows test, toplu full verify ve
her türlü deploy milestone sonunda yapılacak. Masaüstündeki henüz commit edilmemiş
diğer özellikler değiştirilmez.

## Paket A — Android ürün oluşturma / kategori KDV [YEREL TAMAMLANDI]
- AndroidMarketSnapshot içinde yalnız aktif katalog kategorileri, kimlik ve
  varsayılan KDV oranı; katalog yetkisi yokken bu liste de boş.
- Android ürün oluştururken katalog seçimi kimlik üzerinden. Kategori oranı
  görünür; manuel KDV ayrı açık seçim. Varsayılan oranı Android zorlamaz.
- Masaüstü market_product_create eylemi seçili kategorinin tenant/aktif
  durumunu doğrular. Geçersiz kategori reddedilir, eski sessiz kategorisiz
  kaydetme kaldırıldı. Manuel oran 0–100 değilse reddedilir; oran gönderilmezse
  kanonik ürün kayıt katmanı kategori KDV'sini, kategori yoksa %20'yi kullanır.
- Eski telefonda gönderilmiş istekte kategori adı eşleştirilebiliyorsa kabul edilir,
  eşleşmiyorsa reddedilir. Android APK'sında eski çalışan kopya olmadığı bildirildi.
- Hedefli doğrulama: AndroidMarketUiTest, smoke-market-android-foundation
  (gerçek SQLite, yetki, eski ürün eylemleri, varsayılan/manüel KDV, stale),
  smoke-market-android-ui-contract, smoke-market-product-data-contract,
  TS, ESLint, git diff --check.
- Sınırlama: gerçek Android cihazında manuel form/IME kontrolü sonraki kabul
  turunda. APK/release/deploy/commit yapılmadı.

## Paket B — QR talep veri sözleşmesi / telefon görünümü [YEREL TAMAMLANDI]
- Yeni android-qr-order-preview.ts; AndroidSnapshotRequest içinde yalnız
  gösterim amaçlı qr_order. Kaynak türü, oda/masa kimliği ve adı, azami 20
  kalem, miktar, not, birim fiyat ve toplam. Yalnız geçerli sayı, para birimi,
  miktar ve metin sınırları; geçersiz veri uydurularak gösterilmez.
- Sipariş token'ı, token SHA, stay id veya doğrulama bilgileri hiç taşınmaz.
- Kaynak kapasitesi: room/table siparişleri ancak QR_MENU + FOOD_MENU +
  FOOD_ORDERS ve kendi oda/masa yetenekleri etkinse Android'e girer;
  işletme Android/REQUESTS/CUSTOMERS kapalıysa hiç taşınmaz.
- Android'de Masa QR siparişi / Oda QR siparişi kartları, kaynak etiketi,
  kalem/miktar/not/tutar önizlemesi. Eski snapshots için güvenli boş durum.
- Genel Onayla, Reddet, Cevaplandı, Yeniden Aç ve Sil işlemleri QR sipariş
  detaylarında kapalı. Masaüstünün gerçek kabul/ret ve ACK akışı Paket C.
- Hedefli testler: AndroidMarketFoundationTest JUnit; TS tip denetimi;
  QR preview+yetki çekme testi; capability-surface-consistency;
  test-qr-room-order-v2 (3 test); odaklı ESLint ve git diff --check.
- Bu turda commit, push, APK kurulum ve canlı web deploy yok.


## Paket C — QR sipariş kabul/ret ve ACK [YEREL TAMAMLANDI]
- Android'de bekleyen QR siparişleri için onaylı önizleme üzerinden
  "Siparişi kabul et" ve ayrı "Reddet" kararları; çift onay diyaloğu.
  Kalemleri veya geçerli kaynağı olmayan siparişler kabul edilemez.
- Üç eylem: qr_table_order_accept, qr_room_order_accept, qr_order_reject.
  Telefon yalnız request_id+expected_updated_at gönderir; fiyat, stok, QR
  token/secret, folio veya adisyon kimliği istem üzerinden belirlenmez.
- Masaüstü işleminin tek BEGIN IMMEDIATE + android_action_receipts
  zincirinde kanonik QR masa/oda kabulü SAVEPOINT içinde çağrılır. Masa
  adisyonuna / aktif konaklamanın açık oda hesabına tek sefer aktarım.
  Masaüstünün bağımsız kabul yolu kendi BEGIN IMMEDIATE davranışını korur.
- QR kabulünde mevcut 2 saat, oturum/konaklama, QR token/digest, para birimi,
  fiyat, stok ve yayınlanmış menü doğrulamaları aynen uygulanır.
- Ret yalnız bekleyen, aktarılmamış doğru türdeki QR siparişini "rejected"
  durumuna geçirir; herhangi bir finans/stok/adisyon kaydı üretmez.
- Masaüstü ve Android işlem politikaları, PHP web modülü: tür + yetenekler
  + cihaz izni + hedef hesap görüntüleme hakkı; sürüm uyuşmazlığı ve
  desteklenmeyen payload reddi. Genel talep işlemleri QR kararını aşamaz.
- Kaybolan ACK sonrası aynı işlem kimliği yalnız aynı cihaz/eylem/sipariş/
  sürüm ile tekrar kullanılabilir. PHP kuyruğunda da farklı yeniden kullanım
  reddedilir; normal işlem ACK/tekrar sorgulaması korunur.
- PHP Android snapshot'taki qr_order önizlemesini güvenle korur. Henüz
  masaüstüne çekilmemiş web QR taleplerinde yalnız public kalemlerden
  sınırlı önizleme üretir. Gizli token/hash/folio aktarılmaz; özellik devre
  dışıyken web kaynaklı eski QR talepleri telefonda gösterilmez.
- Önizlemedeki decision_ready yalnız masaüstünün sürümlü QR kaydından
  gelir. Hosting-only taleplerde false; telefon yalnız gösterir ve
  masaüstüne alınıncaya kadar kabul/ret düğmesini açmaz. Eski snapshot
  alanı eksikse güvenli varsayılan false.
- Web modülünün action listesi/permission/capability kontrolleri de bu üç
  işlem için senkronize. Hosting sırasındaki aynı işlem ID'sinin başka QR
  kararına çevrilmesi reddedilir; ayrıca yeni import edilmiş kayıtlar için
  güncel bekleyen statü/sürüm ve hedef hesap görüntüleme denetlenir.
- Hedefli testler: smoke-android-qr-order-actions gerçek SQLite, Android
  JUnit QR kararı, smoke-android-hosting-contract, cihaz onay/hosting smoke,
  test-qr-room-order-v2 ve smoke-qr-table-order-web; TS+ESLint+PHP lint.
  Bekleyen fiziksel cihaz, hosting sync roundtrip ve full verify son kabule ait.
- Commit, APK yayınlama, deploy yok.

## Paket D — Android ticari müşteri [YEREL TAMAMLANDI]
- AndroidSnapshotCustomer.commercial_profile: firma unvanı, vergi dairesi,
  vergi numarası, yetkili kişi ve toptancı yeteneğine bağlı bayi durumu,
  fiyat grubu, ödeme vadesi. Eski snapshotlarda alan yoksa kişisel müşteri.
- Android müşteri liste/arama, detay ve oluştur/düzenle formu güncellendi.
  Firma kaydı perakende işletmede de yapılır; bayi/fiyat/vade yalnız
  commerce.wholesale etkinse görünür ve telefon bunları gönderir.
- Android customer_create/update ile ticari profil kanonik saveCustomer'a
  gider: eksik alan mevcut profili korur, explicit null profili kaldırır.
  Alan uzunlukları, vergi no tekilliği, bayi/grup/vade enum ve sınırları,
  stale sürüm ve yetkiler masaüstünde denetlenir.
- Saldırgan mobil istemci toptancı modülü kapalıyken bayi/fiyat/vade alanı
  gönderirse reddedilir. Toptancı modülü kapatılmış mevcut müşterinin
  gizli bayi/grup/vade kayıtları düzenleme sırasında korunur; görünümde
  inactive/retail/0 ile maskelenir.
- Local projection ve PHP hosting müşteri verisi yalnız aktif, yetkili
  admin + customer.manage cihazına taşınır. Satış personeline müşteri
  seçici dışında vergi/ticari profil sızmaz. Eski kimlik/seri redaksiyonu korunur.
- Hedefli kontroller: gerçek SQLite commercial-customer smoke (perakende
  oluşturma, toptan aktivasyon, izin çekme, stale, duplicate vergi,
  eski Android payload, profil kaldırma, Android ACK); PHP sanitization
  + hosting parity, Android JUnit, TypeScript ve ESLint.
- Fiziksel telefon UI/IME, APK, tam verify, canlı hosting sync son kabule ait.
  Bu pakette deploy veya commit yapılmadı.

## Paket E — İdeal stok / öneri ve paylaşım [YEREL TAMAMLANDI]
- Masaüstü stock-replenishment SQL sorgusu ortak hesap kaynağı olarak korundu.
  Mobil için aynı sorgunun read-only 1.200 satır limiti + truncated işareti;
  minimum stok uyarı, ideal stok eksik tamamlama hedefi; bütün aktif
  envanter konumları toplu hesapta. Masaüstü 10.000 satır limiti değişmedi.
- Market AndroidSnapshot: replenishment içinde kategoriler, ürün/SKU, birim,
  mevcut/minimum/ideal ve eksik miktar. Stok/satın alma/finans yazması yok.
  commerce.inventory+commerce.catalog ve market.product.view izni dışında
  stok önerisi yayımlanmaz. Yetki iptalinde Android seçimleri temizlenir.
- Android Market ekranında İdeal Stok Eksikleri; kategori ve ürün/SKU araması,
  tek tek seçim, filtrelenenleri seçme, seçimi temizleme. Seçili/tüm eksikler
  için metin paylaşımı ve FileProvider üzerinden gerçek text/csv dosyası.
  CSV UTF-8 BOM/semicolon/escaping; e-posta/WhatsApp/Paylaş menüsü.
- Mobil sınırı aşılmışsa tüm eksikler paylaşımı kapalı; masaüstünün tam
  listesinin kullanılması gerektiği gösterilir. Görünüm ilk 180 satırı
  çizse de filtreleme/seçim/çıktı 1.200 satırlık projeksiyona uygulanır.
- PHP sync sanitizer ve auth/permission katmanı, replenishment + kategoriyi
  güvenli alanlardan korur; gizli depo/satın alma detayları dışarı çıkmaz.
- Hedefli testler: Android MarketUiTest CSV/filtre/izin, SQLite
  smoke-market-android-foundation (iki aktif depo, sadece okuma, cap toggles),
  test-customer-stock-v2 (7/7, ayrıca 1203 ürünle truncate),
  smoke-android-hosting-contract (PHP whitelist/capabilities),
  smoke-market-android-ui-contract, TS/ESLint/PHP lint/diff check.
- APK, fiziksel paylaşım/CSV görüntüleyici, tam verify ve canlı deploy
  son kabulde; bu turda commit veya deploy yapılmadı.

## Paket F — Rezervasyon süresi, ürün fotoğraf yüzeyi [YEREL TAMAMLANDI]
- Android masa rezervasyonunda 30–480 dakika arasında herhangi bir tam
  dakika seçilebilir; varsayılan 120. Form oluşturma ve güncellemede açık
  duration_minutes gönderir, rezervasyon detayında mevcut süreyi gösterir.
  Pansiyon/oda rezervasyonunda alan ve payload yoktur.
- desktop Android reservation action layer yeni süreyi 30–480 tamsayı
  olarak doğrular ve mevcut saveManualRestaurantReservation'a aktarır.
  Oturum çakışma, masa kapasitesi, doluluk, sürüm ve yetki kontrollerini
  masaüstünün kanonik servisi uygular. Eski Android create eksik duration
  için 120, eski update için mevcut süreyi korur; oda payload'ına masa
  süresi eklenmesi açıkça reddedilir.
- AndroidSnapshotReservation + PHP sync projection/whitelist:
  sadece table/breakfast rezervasyonlarında süre; eski/hatalı değerlerde
  güvenli 120 dakika. Oda kayıtlarına süre eklenmez; gereksiz özel
  reservation alanları taşınmaz.
- MarketFormUi.productImageView temadan bağımsız #F5F5F4 açık/nötr
  zemin ve #E7E5E4 çerçeve kullanır. MarketCatalogBrowser ürün listesi
  yer tutucusu da aynı yüzeyi kullanır; görüntü ve ürün oluşturma
  önizlemeleri tek bileşenden yararlanır. Bitmap, kaynak görsel, netlik,
  en-boy veya piksel dönüşümü yapılmadı.
- Hedefli test: gerçek SQLite Android rezervasyon smoke (30–480, eski
  istemci, aralık çakışması, stale, invalid, oda alanı reddi),
  AndroidReservationRulesTest + MarketUiTest JUnit; PHP hosting whitelist,
  Market Android UI sözleşmesi, TS/ESLint/PHP lint ve git diff --check.
- Fiziksel cihaz önizleme/IME ve son kabul turu ayrı; APK/push/deploy/
  commit bu aşamada yok.
- Android servis otomatik kayıt, çok dilli SEO ve efekt motoru açısından
  APK tarafında ayrıca yeni geliştirme gerekmiyor.

## Son kabul [BEKLİYOR]
- Java/JUnit + hedefli Android/snapshot/action senaryoları, ardından toplu full verify.
- Android debug APK, Android fiziksel cihaz, yerel QR bağlantısı, hosted sync,
  offline action retry/ACK, capability toggles.
- Windows kurulumu fiziksel Windows kullanıcısında; gerçek site deploy ayrı onaylı aşama.
