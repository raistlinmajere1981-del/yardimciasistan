# Android Operasyon Paneli

Yardımcı Asistan Android uygulaması, işletme sahibinin telefondan hızlı takip ve
karar vermesi için tasarlanmış koyu temalı companion uygulamadır. Masaüstü ana veri
kaynağı olmaya devam eder.

## Ekranlar

Alt navigasyon işletmenin capability ve cihaz izinlerine göre ilgili operasyon
ekranlarını gösterir:

- **Bugün:** kompakt sayaç şeridi ile yeni talep, rezervasyon, günlük iş, hesap ve
  kritik stok kayıtlarından oluşan tek bir öncelikli işler listesi. Yetkiye göre
  ticari sipariş, gönderi ve pazarlama başarısızlık sayaçları ile salt-okunur özetlere
  bağlantılar; bu özetler Market ekranı olmayan işletmelerde de erişilebilirdir.
- **Müşteri:** `Yeni Talepler`, `Müşteriler` ve `Cevap Bekleyenler` segmentleri;
  karttaki kısa iletişim aksiyonlarından sonra karar ve uzun içerik tam ekran detayda.
- **Pansiyon:** yetkiye göre gösterilen `Rezervasyonlar`, `Odalar` ve `İşler`
  modları. Aynı anda yalnız seçilen modun sayaçları ve listesi görünür.
- **Restoran:** yetkiye göre gösterilen `Masalar`, `Açık Adisyon` ve `Stok` modları.
  Masa kartları en fazla iki ana aksiyon taşır; stok düzenleme ayrıca açılan işlem
  yüzeyindedir.
- **Market:** kamera ile barkod/ürün arama, mutlak fiziksel stok sayımı, çok satırlı mal
  kabul, masaüstüne gönderilen sepet taslağı, doğrudan katalog ürünü oluşturma ve gerçek
  Market özeti.
- **Mesajlar:** `Hazır Mesajlar` ve `Cevap Bekleyenler` segmentleri. Kartlar kısa
  önizleme gösterir, uzun mesaj tam ekran detayda açılır.

Her operasyon sayfası 72 dp'lik ortak üst çubuğu kullanır: sayfa adı, rol/son senkron
bilgisi ve sağda yenile ile ayar ikonları. Büyük ortak hero ve sayfa bazında tekrarlanan
metrik kartları kullanılmaz. Kompakt sayaç şeritleri gerektiğinde yatay kayar; ana ekran
içerikleri son kartı alt navigasyondan uzak tutan güvenli alt boşlukla biter.

Masa siparişi tam ekran açılır; ürün arama ve kategori filtrelerinden sonra menü ile
aktif adisyon satırları gösterilir. Servis, hesap ve yetkili cihazdaki kapatma aksiyonları
ekranın altında en fazla iki sütunlu satırlara bölünerek sabit kalır. Stokta olmayan
takipli ürünün ekleme aksiyonu devre dışıdır.

Companion ticari özetleri ayrı `commerce_order.view`, `shipment.view`,
`online_sales.view` ve `marketing.status.view` izinlerini kullanır. Online satış/bayi
filtreleri mevcut capability sınırlarına bağlıdır; restoran adisyonlarıyla karışmaz.
Siparişler en fazla 100, pazarlama türleri 50 kayıt gösterir. Sipariş ayrıntısı canonical
alıcı, kalem, tutar, adres ve notu gösterir; güncel müşteri iletişimi `customer.view`
veya etkin `dealer.view`, firma/yetkili alanları `dealer.view` gerektirir. Gönderi izni
olan cihazlar mevcut takip numarası ve doğrulanmış HTTP(S) bağlantısını kullanabilir.
Vergi/servis/ödeme kimlik bilgileri veya ilgisiz müşteriler aktarılmaz.

Ürünler sipariş başına 500, snapshot toplamında 2000 satır ve ayrıntılar toplamda
1 MiB ile sınırlıdır. Eski veya eksik ayrıntı salt-okunurdur. Tam ayrıntıda domainin
ilan ettiği Onayla/İptal Et kararları, ayrı `commerce_order.confirm`/`commerce_order.cancel`
izinleriyle açık onay ardından mevcut kalıcı outbox'a yazılır. Fulfillment, satış,
tahsilat veya stok hareketi üretmez.

Bağlantı adresi, güvenlik anahtarı, son senkron zamanı ve telefon işlem sonuçları ayrı
`Ayarlar` ekranında gösterilir.

## Ortak native UI ailesi

`UiKit.workspaceHeader` başlık, alt açıklama ve isteğe bağlı hızlı eylemin;
`UiKit.recordHeader` kayıt kimliği ile domainin sağladığı durum göstergesinin
ortak yerleşim sahibidir. `UiKit.filterBar` yatay chip kaydırmasını ve seçili
öğenin görünmesini yönetir; yetkili seçenekler ve seçim callback'i ekranda kalır.
Chip ve kart eylemleri en az 48dp yüksekliğindedir, büyük yazıda büyüyebilir.

`NativeSearchList.attachTo` yalnız önceden yetkilendirilmiş satırları yerel olarak
süzer. Aramayı temizleme odağı alanda tutar; `showNoMatchesIn` boş sorguyu boş
kayıt listesiyle karıştırmaz. Ağ, capability, kalıcı seçim veya mutation sahibi
değildir. Boş/yetkisiz veri yüzeyleri `UiKit.emptyCard`; etiketli form alanları
`UiKit.labeledInput` kullanır. Alan türü, doğrulama ve taslak ekranın sorumluluğudur.

Manuel cihaz kontrolü: `npm run verify:check -- android-native-ui-family --include-manual`.
Bu kontrol gerçek native görünümleri 360/393/840dp ve %100/%150 yazı matrisinde ölçer;
geçici debug fixture'ını ayrı `com.yardimciasistan.android.uifamily` kimliğiyle
kurup kaldırır. Müşteri uygulamasını başlatmaz/değiştirmez, gerçek bağlantı anahtarı
kullanmaz ve hosting'e bağlanmaz. Geniş pencere ölçümü ayrı fiziksel tablet,
TalkBack, sistem geri hareketi veya gerçek IME kullanım testinin yerine geçmez.
API29+ cihazda aynı fixture Market sayım/mal kabul/sepet/ürün/satış/tahsilat
formlarının gerçek kontrollerini, reddedilen gönderimde taslak korunmasını,
izin sonucu ve tarama callback sırasını da sınar. Kamera izni kontrollü registry
sonucuyla sınanır; gerçek kamera uygulaması veya hosting açılmaz.

## Native ekran ve akış sahipliği

`MainActivity` uygulama bileşimi, Android yaşam döngüsü ve controller callback'lerinin
bağlandığı köktür. Senkronizasyon `AndroidOperationsSyncController`, gönderim
`AndroidActionDispatcher`, gezinme `AndroidNavigationState` ve harici kamera Activity
sonuçları `AndroidImageCaptureController` tarafından yönetilir. Ekran ayrıştırması
bu sahipleri veya kayıt/senkronizasyon hattını çoğaltmaz.

Market'in geçici ekran durumu aşağıdaki sınırlarda tutulur:

| Sahip | Sorumluluk |
| --- | --- |
| `MarketWorkspace` | Tek güncel snapshot, ekran seçimi/geri dönüşü, yetkiyle route düzeltme, giriş ve barkod sonucu bileşimi |
| `MarketBarcodeFlow` | Kamera izni launcher'ı, bekleyen tarama amacı, manuel/kamera girişi ve kasa barkod geri bildirimi |
| `MarketProductEditor` | Ürün oluşturma taslağı, isteğe bağlı lookup sonucu ve kaynak bilgisi |
| `MarketCatalogBrowser` | Yetkili snapshot'tan ürün seçimi, lazy önizleme cache'i |
| `MarketInventoryFlow` | Fiziksel sayım formu ve tek `ReceivingDraft` |
| `MarketCheckoutFlow` | Sepet ile satış ekranlarının paylaştığı tek `CartDraft`, ödeme formu |
| `MarketCreditFlow` | Cari hesap seçimi ve tahsilat formu; borç snapshot'tan okunur |
| `MarketSubmissionFeedback` | Yerel/outbox bekleme durumu, form hatası ve Desktop acknowledgement sunumu |
| `MarketFormUi` | Market form çizimi/biçimlendirmesi; domain state veya transport içermez |

Akışlar snapshot kopyası saklamaz; workspace'in güncel verisini okur. Payload
kuralları ve taslak modelleri `MarketUiRules`, kalıcı gönderim mevcut Listener →
`AndroidActionDispatcher` → outbox hattında kalır. Formlar yalnız kabul edilen
gönderimde temizlenir; sayım, satış ve tahsilat snapshot'taki stok/borcu değiştirmez.
Ürün lookup'u yalnız aynı barkodun boş alanlarını doldurur; başka barkodun sonucu
aktif formu bitirmez. Ürün oluşturma başka bir Market action'ı bekliyor diye kilitlenmez.
Market düğmelerinin mevcut yükseklikleri minimum olarak korunur; büyük yazıda
metin sığmadığında içerik yüksekliğine büyürler. Renk ve etkileşim `UiKit` ailesindedir.

Barkod izin launcher'ı workspace oluşturulurken, Activity STARTED olmadan önce
kaydedilir. İzin sonucu bekleyen amacı alıp temizler; ret durumunda aynı amaçla
manuel giriş açılır. Manuel giriş ve ürün seçici yönlendirmeden önce kapanır;
mal kabul satırı da mevcut kapatma/render sırasını korur. Satış ve tahsilat onayı,
onay düğmesine basıldığında güncel bekleyen işlem durumunu tekrar denetler.

`AndroidOperationCards` yetkili projection'ları eylem callback'leriyle birleştirir;
oda, konaklama ve masa kartlarının domain sahipleri ayrıdır. `UiKit` native kontrol
çizim ailesidir. Bu iki sınıf kalıcı mutation, ağ veya bağımsız form taslağı sahibi
olmadığından yalnız boyutları için ikinci bir katmana bölünmez.

## Market Companion (M7.2)

Market için ürün rolü şöyledir:

```text
Desktop = source of truth
Android = retail handheld companion
```

M7.1'in veri, izin, action queue ve persistence temeli telefon odaklı Market
ekranlarıyla kullanılır. Uygulama masaüstü POS'unu kopyalamaz: sayım fiziksel miktarı
mutlak değer olarak yollar, mal kabul mevcut purchase runtime'ını kullanır ve yeni ürün
yetkili telefondan doğrudan katalog kaydı olarak gönderilir. Sepet ise ödeme ve gerçek
satış kaydı masaüstünde tamamlanacağı için hazır sepet olarak bekler. Telefonda satış,
ödeme veya finance mutation oluşturulmaz.

Masaüstündeki tek `Market / El Terminali` görev grubu ilgili `market.*` izinlerini verir.
İzinler cihaz rolünden sonra persisted business capability'lerle tekrar kesişir; admin
rolü kapalı commerce/retail capability'sini aşamaz. Hosting kuyruğu aşağıdaki sözleşmeleri
taşımaya hazırdır:

```text
market_stock_count       → absolute fiziksel stok sayımı
market_purchase_receive  → mevcut atomik purchase + stock-in akışı
market_product_create    → doğrudan catalog_products kaydı
market_cart_draft_create → satış/stok/ödeme üretmeyen hazır sepet
```

Snapshot'ın `market` alanı ürün, tedarikçi, yakın mal kabul ve hazır sepet listelerini
ilgili capability kapalıyken kırpar. `retail.barcode` yoksa barkodlar yayınlanmaz. Satın alma
modelinde bekleyen sipariş workflow'u bulunmadığından yalnız gerçek `received` kayıtları
yakın mal kabul bilgisi olarak taşınır. Alan hiç yoksa Java parser boş Market modeliyle
devam eder; eski ve Market dışı snapshot'lar geçerliliğini korur.

Market barkod akışı CameraX + ML Kit ile cihaz üzerinde barkod çözer; aynı altyapı kasa
barkod modu, ürün arama, stok, mal kabul, sepet ve yeni ürün ekranlarında kullanılır.
Kamera izni verilmezse elle giriş geri dönüşü korunur. Elle yazılan sayısal barkodlarda
boşluk, tire, nokta ve benzeri görsel ayraçlar otomatik temizlenir. `retail.barcode`
kapalıysa genel `Barkod Tara` CTA'ları gizlenir; ürün seçme/arama akışı açık kalır.

`Ürün Verisi` servisi açıksa bilinmeyen barkodlar Open Food Facts üzerinden
tanımlanabilir. Ayardaki otomatik arama açıksa sorgu bilinmeyen barkoddan sonra kendiliğinden
başlar; kapalıysa `Ürün Bilgilerini Ara` düğmesi kullanılır. Ad, marka, ambalaj bilgisi,
kaynak/provenance ve isteğe bağlı ürün görseli yeni ürün formuna gelir. Görsel ürün
kaydedilmeden önce telefonda önizlenir; masaüstü action'ı uyguladığında aynı kaynak görseli
yerel ürün asset arşivine alır ve normal backup/restore kapsamına girer.

Full mobile POS, telefonda ödeme, iadeler, fatura OCR, telefondan serbest ürün fotoğrafı
çekme, bekleyen satın alma siparişi ve local LAN transport kapsam dışıdır.

Uygulama ön plandayken canlı özet yaklaşık 15 saniyede bir otomatik kontrol edilir.
Sunucu revision'ı değişmediyse tam snapshot indirilmez. Son başarılı JSON özeti
`SharedPreferences` cache'inde tutulduğu için uygulama ağ yokken de son veriyi açabilir.
`JobScheduler`, uygulama kapalıyken bekleyen action outbox'ını göndermek ve özeti
yenilemek için en az 15 dakikalık periyotta çalışır; kesin zaman Android'in pil ve ağ
politikasına bağlıdır.

## Yerel Bildirimler

Yeni snapshot, telefondaki son cache ile karşılaştırılır. Yeni müşteri talebi, onay
bekleyen rezervasyon, masa siparişi veya hesap bekleme durumu ile oda/günlük iş uyarıları
yalnız cihazın güncel effective permission listesi izin veriyorsa Android yerel bildirimi
üretir. Cihazın kendi başarısız işlemi yetki reddi olsa bile kullanıcı dostu biçimde
gösterilebilir. Uzun süreli bağlantı hataları yalnız yönetici/ayar görme yetkili cihazlarda
gösterilir; Firebase veya başka bir push servisi kullanılmaz.

Aynı olay anahtarı kalıcı yerel ledger'da `first_seen_at`, `notified_at` ve `cleared_at`
alanlarıyla tutulur. Böylece foreground ve `JobScheduler` aynı snapshot'ı görse bile
bildirim tekrarlanmaz; talep, rezervasyon, masa veya iş çözüldüğünde aktif bildirim
kapatılır. Bildirime dokunmak yalnız ana sekmeyi değil ilgili yeni modu da açar; örneğin
rezervasyon `Pansiyon / Rezervasyonlar`, oda `Pansiyon / Odalar`, günlük iş
`Pansiyon / İşler`, hesap bekleyen masa `Restoran / Masalar` moduna gider.

Tek `Ayarlar` ekranı müşteri/rezervasyon, restoran/masa, oda/günlük iş ve işlem hatası
bildirim tercihlerini gösterir. Teknik sync tercihi ile bağlantı ayrıntıları yetkisiz
personelden gizlenir. Yerel tercihler cihaz yetkilerini hiçbir zaman genişletmez.

Telefon kimliği normal APK güncellemelerinde uygulamanın kalıcı ayarlarında korunur.
Bu ayar henüz yoksa kimlik, Android'in uygulama/imza/cihaz kapsamlı `ANDROID_ID`
değerinin tek yönlü özetinden üretilir. Bu sürümle oluşturulan kararlı kimlikten sonra
aynı paket ve aynı imzalama anahtarıyla yapılan güncelleme, veri temizleme veya yeniden
kurulum aynı fiziksel telefon için yeni bir masaüstü kaydı oluşturmaz. Eski rastgele
kimliğe sahip kurulum normal APK güncellemesinde mevcut kaydını korur; yalnız uygulama
verisi ayrıca silinirse kararlı kimliğe bir kez geçer. Fabrika ayarları, Android
kullanıcısının değişmesi ya da APK imzalama anahtarının değişmesi yeni cihaz kabul
edilir. Dağıtım APK'larının imzalama anahtarını yedekleyin ve sonraki sürümlerde mutlaka
aynı anahtarı kullanın.

## Veri Akışı

Android SQLite'a veya PC'ye doğrudan bağlanmaz:

```text
Android → hosting action queue → Desktop uygular
        → Desktop güncel snapshot yayınlar → Android canlı veriyi çeker
```

Gönderilen işlem önce `Bekliyor` görünür. Masaüstü uyguladıktan sonra `Uygulandı`,
uygulayamazsa kullanıcı dostu hata metniyle `Uygulanamadı` olur. Masaüstündeki receipt
tablosu aynı action kimliğinin iki kez uygulanmasını engeller.

İşlem kimliği ağ çağrısından önce üretilir ve işlem telefondaki kalıcı outbox'a yazılır.
Yanıt kaybolur veya uygulama kapanırsa aynı kimlik ve payload yeniden gönderilir; sunucu
ve masaüstü idempotency kontrolleri işlemin iki kez uygulanmasını engeller. Aynı sipariş
masaüstünü beklerken yeni karar alınmaz. Farklı ticari siparişler bağımsız bekleyebilir;
diğer operasyonların mevcut bekleme bariyerleri korunur.
Outbox kaydı normalize hosting endpoint'inin mantıksal işlem hedefine bağlıdır;
bekleyen işlem varken bağlantı başka bir firmaya değiştirilirse eski işlem yeni hedefe
gönderilmez.

Değiştirilebilir kayıtların payload'ı snapshot'taki `updated_at` değerini beklenti olarak
taşır. Kayıt masaüstünde bu sırada değişmişse işlem uygulanmaz ve kullanıcıdan eşitlenen veriyi
yenilemesi istenir. Sipariş kararları hem updated_at hem expected_status taşır.

Son yetkili sipariş ayrıntısı internet veya Desktop olmadan mevcut kalıcı önbellekten
açılabilir; snapshot zamanı ile son senkron zamanı ayrı gösterilir. Desktop sonradan
güncel izin ve durumu doğrular. Hosting henüz öğrenmediği izin iptalini uygulayamaz;
önceden indirilmiş çevrimdışı verinin uzaktan anında silindiği varsayılmaz.
Kendi kararlarının en fazla 40 minimal sonucu mevcut cache içinde korunur. Uygulandı
sonucu eski sipariş yayınıyla eşleşiyorsa yeni karar, normal sipariş güncellemesi gelene
kadar kapalıdır. Sonuç kaydı Hosting retention nedeniyle bulunamıyorsa açıkça belirtilir.

### Görselden stok girişi

`Restoran → Stok` ekranındaki `AI ile Stok Ekle` kartı yalnız `menu.stock_update`
yetkisi olan aktif cihazlarda görünür. Kamera sistem kamera uygulaması ve güvenli
`FileProvider` URI'siyle, galeri ise sistem Photo Picker/OpenDocument akışıyla açılır;
uygulama geniş kamera veya depolama izni istemez. JPG, PNG ve WebP içerikleri gerçek
dosya imzasıyla doğrulanır, EXIF yönü düzeltilir, en uzun kenar 2400 px ile sınırlandırılır
ve geçici cache dosyaları işlem sonunda silinir.

Analiz aynı hostingdeki kimlik doğrulamalı `api/stock-image-analysis.php` endpoint'ine
gider. AI anahtarı APK'ya veya action payload'ına eklenmez. Sonuç bir öneri taslağıdır:
ürün, stok birimi ve pozitif tam sayı miktar kullanıcı tarafından kontrol edilip
onaylanmadan stok değişmez. Adet ürünleri adet, gram ürünleri gram olarak gösterilir;
açık kilogram miktarı analizde grama çevrilebilir. Onay,
`menu_stock_image_import_apply` action'ı olarak kalıcı outbox'a yazılır;
masaüstü aktif cihazı ve `menu.stock_update` iznini yeniden doğrular, tüm satırları tek
SQLite transaction içinde uygular ve aynı import kimliğini iki kez çalıştırmaz. Aynı
görsel hash'i yeniden seçilirse uyarı gösterilir; bu uyarıyı yalnız yönetici aşabilir.

Yeni masa için `adisyon aç + ürün ekle` iki bağlı action olarak saklanır. Ürün action'ı,
adisyon açma action'ının masaüstü receipt kaydı ve o action kimliğinden türetilen aktif
adisyon olmadan uygulanmaz.

## Komutlar

Kök dizinden geliştirme/debug APK üretmek için:

```bash
npm run android:debug
```

Pilot release APK ve Google Play release AAB üretmek için:

```bash
npm run android:release-apk
npm run android:release-aab
```

USB hata ayıklaması açık bağlı telefona debug APK'yı tek komutta derleyip kurmak
veya mevcut kurulumu verisini koruyarak güncellemek için depo kökünde çalıştırın:

```bash
npm run android:install
```

Birden fazla bağlı cihaz varsa `npm run android:install -- --serial <cihaz-serisi>`,
mevcut APK'yı yeniden derlemeden kurmak için `-- --no-build`, imzalı release APK
için `-- --release` kullanılabilir. Tüm seçenekler `-- --help` ile görülebilir.

Release komutları repo dışındaki kalıcı keystore için environment veya
git-ignored Gradle properties ister. Keystore kurulumu, sürüm artırma, USB
debugging gerektirmeyen APK kurulumu ve Play checklist'i
[`docs/ANDROID_DISTRIBUTION.md`](../../docs/ANDROID_DISTRIBUTION.md) içindedir.

Android debug ve release APK'ları işletmeden bağımsız derlenir. Web modülü adresi
ve paylaşılan güvenlik anahtarı APK içine gömülmez. Masaüstü uygulamasında
**Ayarlar → Android → Telefon eşleştir · QR göster** ile Companion'ı eşleştirin.
Telefon QR üzerinden bağlantı bilgilerini ve cihaz yetkilerini güvenli olarak edinir.

Önceki sürümlerden kalma `apps/android-app/connection.local.json` ve
`YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET` derleme ayarları artık kullanılmaz.
`npm run android:install` kurulum öncesinde anahtarın canlı hostla eşleşmesini
değil, üretilen APK'nın işletme anahtarı ve adresi içermediğini doğrular.
Genel dağıtım ve geliştirme için aynı kimlikten bağımsız APK kullanılır.

Test sırasında telefonun mevcut eşleşmesi korunur; sıfırdan başlamak için
masaüstünde yeni QR eşleştirmesi başlatılabilir.

Çıktılar:

```text
apps/android-app/build/outputs/apk/debug/yardimci-asistan-debug.apk
apps/android-app/build/outputs/apk/release/yardimci-asistan-release.apk
apps/android-app/build/outputs/bundle/release/yardimci-asistan-android-release.aab
```

Proje Android Gradle Plugin ile native Java APK/AAB üretir. Debug build standart
debug anahtarıyla, release build yalnız dışarıdan sağlanan kalıcı release
keystore ile imzalanır. Signing değerleri build loguna yazılmaz; eksikse release
build unsigned çıktı üretmek yerine hata verir.

Fiziksel geliştirme cihazında aynı uygulama verisini ve telefon kimliğini koruyarak
debug APK güncellemek için isteğe bağlı
`apps/android-app/.debug/yardimci-asistan-debug.keystore` kullanılabilir. Dosya Git
tarafından yok sayılır; varsa debug build otomatik olarak bu kararlı geliştirme
anahtarıyla, yoksa Android'in standart kullanıcı debug anahtarıyla imzalanır. Bu dosyayı
paylaşmayın veya commit etmeyin.

Hosting ve demo operasyon verisiyle komut satırı smoke testi:

```bash
npm run smoke:android-hosting
```

Bağlı telefonda gerçek UI ve action queue smoke testi:

```bash
npm run smoke:android-device-ui
```

Saf Market profili, kamera barkod akışları, ekran dönüşünde sepet state'i ve doğrudan
ürün kaydı için odaklı fiziksel cihaz smoke testi:

```bash
npm run smoke:android-market-device-ui
```

Companion sipariş/gönderi/pazarlama özetleri, izin kaybı, eski/boş snapshot ve
çevrimdışı gösterim için odaklı cihaz testi (önceden başlatılmış debug uygulaması
gerektirir; mevcut tercih klasörünü cihaz içinde
korur ve sonuçta geri yükler; kesilirse `files/companion-ui-original-preferences`
klasörü özgün tercihleri saklar):

```bash
npm run verify:check -- android-companion-device-ui --include-manual
```

Canonical sipariş ayrıntısı, müşteri/bayi bağlantısı, takip bağlantısı, çevrimdışı
kuyruk/restart/retry ve stale/izin iptali için aynı korumalı cihaz düzeneği:

```bash
npm run verify:check -- android-companion-commerce-device-ui --include-manual
```

ADB üzerinden ekran görüntüsü, UI ağacı ve aynalama:

```bash
npm run android:screenshot
npm run android:dump
npm run android:mirror
```

Telefonun yerel PHP sunucusuna erişmesi için script mümkünse `adb reverse` kullanır;
aksi halde aynı ağdaki PC adresini verir. Web modül alanına modül kökü, `/api` klasörü
veya tam `/api/sync.php` adresi girilebilir.

Canlı hostingde HTTPS kullanın. Senkron anahtarı JSON gövdesine veya URL'ye değil,
`X-YA-Sync-Secret` header'ına gönderilir.


## Desktop üzerinden USB kurulum

Desktop Ayarlar > Android bölümündeki **Telefon Kurulumu** alanı, ADB üzerinden bağlı
Android cihazları uygulama kurulu olmasa bile gösterebilir. Cihazda USB hata ayıklaması
açık ve bilgisayar yetkilendirilmişse:

- uygulama yoksa **Uygulamayı Kur**,
- desktop paketindekinden eski sürüm varsa **Güncelle**,
- aynı sürüm varsa **Güncel**

durumu gösterilir. Uygulama zaten kuruluysa **İşletmeye Bağla** işlemi APK'yı veya
telefon verisini silmeden mevcut desktop web bağlantısı için yeni tek kullanımlık
bootstrap bileti gönderir. Böylece telefon daha önce başka bir firma/hosting adresine
bağlanmış olsa bile aynı cihaz kimliği korunarak yeni işletmeye geçirilebilir. Normal
APK güncellemesi de başarılı kurulumdan sonra mevcut desktop işletme bağlantısını yeniden
provision eder.

İlk kurulumda desktop ortak `sync_secret` değerini telefona göndermez. Bunun yerine
kısa ömürlü, tek kullanımlık `yab1...` kurulum bileti oluşturur ve ADB intent extras
ile uygulamayı açar. Android bu bileti `api/android-bootstrap.php` üzerinden kişisel
`yat_...` cihaz tokenına çevirir. Cihaz normal masaüstü onay sınırını korur.

Production desktop paketleri Android release APK ve hedef platformun ADB dosyalarını
`resources/android` altında taşır. Aynı platformda Android SDK bulunuyorsa staging
otomatik yapılır. Linux'tan Windows paketi hazırlanırken Windows Platform-Tools klasörü
`YA_ANDROID_PLATFORM_TOOLS_WIN32` ile verilmelidir. Linux kaynağı gerektiğinde
`YA_ANDROID_PLATFORM_TOOLS_LINUX` kullanılabilir.

Release APK ortak işletme anahtarını içermez; mevcut release signing yapılandırmasıyla
önceden imzalanmış APK desktop paketine eklenir.
