# Ortak web sitesi şablonu v1

## Amaç ve sahiplik

`web-site-template/`, işletme sitesine kopyalanabilen bağımsız sunum dağıtımıdır.
D-050 korunur: `firm-template/web-module` veri/medya/işlem hizmetidir; şablon PHP/HTML/CSS/JS,
navigasyon ve sunum entegrasyonunun sahibidir. Backend paketi şablonu içermez/enjekte etmez.
Desktop publication producer/outbox/exact ACK, session ve capability sahipliği korunur.
Çeviri kataloğu mevcut temiz kurulum şemasını genişletir; migration/backfill eklenmez.

Çalıştırma, dosya, dil, efekt ve güncelleme sözleşmesi şablonun
[`README.md`](../../web-site-template/README.md) dosyasındadır. Ortak sürüm hash manifestiyle
izlenir. Tema/override/görsel/sahne ve dil kataloğu kuruluma aittir. Güncelleme eski manifest,
mevcut dosya ve yeni sürümü karşılaştıran salt okunur plan, staging ve elle kontrollü aktarım
kullanır. Kurulu siteler kendiliğinden değişmez.

## Salt okunur kaynak incelemesi

| Kaynak | Korunan sınır |
| --- | --- |
| `test-site/landing` | Public işlemler ortak widget/portal bundle'ını kullanır; demo showcase/secret/kurulum indirmesi ayrı üst katmanda kalır. |
| `firm-template/web-module` | Business/menu/rooms/tables/catalog/marketing/reviews HTTP, medya ve operasyon API'leri authority'dir; PHP/SQLite internalleri include edilmez. |
| `blacksea_web` | Public business üzerinden iletişim/konum ve siteye ait bilgi mimarisi; marka, fotoğraf ve yerel iletişim sabitleri taşınmaz. |
| `teknikel_web` | Public surface + etkin yayın + veri kullanılabilirliği; profil adı sayfa açmaz. Private bayi state'i public projection'a taşınmaz. |
| `gundogdu_web` | Tema/public API ayrımı; marka ve hakları o siteye bağlı görseller taşınmaz. Eager engine import'u ortak adaptöre alınmaz. |
| `EfektAtolyesi` | Canonical 1.1.0 runtime/model/registry byte-identical kopyadır; editör ve örnek işletme fotoğrafları dağıtılmaz. |

## Sunum ve yayın kullanılabilirliği

Ana sayfa her zaman açılır. Hakkında, odalar, restoran, QR Menü, ürünler, galeri, duyurular,
yorumlar ve iletişim mevcut public veriden açılır. Surface'i backend belirler; şablon yalnız
kısıtlar. Boş/kapalı/hatalı yüzey navigasyonda yoktur; doğrudan sayfa isteği 404'tür.
Public metin HTML-escaped sunulur. Şablonda yerel business JSON, seed, ikinci dil,
temsili içerik veya başka sitenin kaynak klasörüne runtime bağımlılığı yoktur.

Tema layout/sayfa/bileşen override'larıyla değişir. Sabit Türkçe UI metni `locales/tr.json`
içindedir; PHP/JS aynı kataloğu kullanır. Public çeviri kendi publication metadata'sından
seçilir. Runtime Node/derleme gerektirmez. Efekt opt-in'dir: sahne yoksa adaptör/motor,
Canvas/scheduler yoktur. Sahne canonical parser/compiler/overlay ile çalışır; her hata
statik görseli korur. Motor siteye özel fork edilmez.

## Sonraki aşama için API ve mimari ihtiyaçlar

Aşağıdaki sınırlar frontend tahmini veya ikinci authority ile kapatılmaz:

1. `business.php`, `business_context` publication yokluğunu açık `enabled`/revision ile
   belirtmiyor; config/default kimliği döndürebiliyor. Public publication varlığı ve normalize
   capability kullanılabilirliği mevcut persisted runtime snapshot'ından çözülür;
   eksik yayın kapalıdır. Public `request_types` ile request mutation aynı bounded
   policy'yi kullanır; profil/config request yetkisi kazandırmaz. Şablon bu public
   kararları tüketir. `business_publication` artık business_context yayınının enabled/server_revision ve güvenli yayımlanmış alan adlarını taşır; SEO bootstrap/config kimliğini bu yayınla karıştırmaz.
   İleride aynı projection'ın yayın kayıt sayısı/revision bilgilerini sağlaması, her sayfa
   isteğinde navigasyon için bütün public listelerin okunması maliyetini azaltabilir.
2. Business translation record ID'si Desktop ID'sidir; `localization.business_id` bunu
   Hosting config kimliğinden bağımsız taşır. Eşleşme yoksa Türkçe alan korunur.
3. Public uçların CORS kuralları aynı değil; hesap/bayi cookie yolu modül köküdür.
   Tarayıcı medya/işlemleri aynı origin'dedir. Çok origin'li kurulum ayrı
   güvenlik/sahiplik çalışmasıdır; ortak Hesabım/bayi/widget mevcut aynı-origin
   HTTP sahiplerini kullanır.
4. Widget, public sepet/checkout ve müşteri/bayi hesabı ortak `public/assets/core/` ve
   `core/views/pages/` üzerinden çalışır. Aynı kaynak kataloğu PHP ve etkileşim metinlerini
   besler. İşlem kimliği/taslak, sunucu fiyatı, capability, hesap ve session authority'si
   mevcut HTTP sahiplerindedir. Kayıt parolası posta kutusu doğrulamasında belirlenir.
   Web hesabı tek Hesabım/profil ve sipariş liste/detayını kullanır; hesap içinde ayrı
   bayi kataloğu/checkout bulunmaz. Ortak katalog, backend oturum cevabına göre mevcut
   yetkili kataloğu tüketir; frontend rol/fiyat grubu seçemez. `account-session.js`
   özel görünümün doğrulama/fencing, `cart-draft.js` yalnız ürün kimliği/miktar
   taslaklarının hesap kapsamı ve temizliği sahibidir. Sayfa geçişinde taslaklar
   korunur, fiyatlar saklanmaz ve yeniden doğrulama öncesi private DOM açılmaz.
   `api/account/receipt.php` aynı hesabın belirsiz kabul sonucunu salt okunur kurtarır.
5. Query URL'leri temel akışı sağlar. Siteye özgü SEO/detail yolları, canonical domain/sitemap,
   farklı kadrajlı efekt eşlemesi ve otomatik update apply sonraki kapsamlardır.

## Dinamik dil sözleşmesi

Şablon kaynak endpoint'i `?resource=translation-source`, tek `locales/tr.json` kataloğundan
sürüm/hash üretir; tema anahtarları aynı kaynaktadır. Desktop mevcut PublicTranslationService,
SQLite kayıtları ve business_context publication'ıyla çevirir/yayınlar. Yeni çeviri servisi,
yerel hedef dil dosyası, config dil listesi veya ziyaretçi AI çağrısı yoktur. Site dil seçenekleri,
ad/locale/yön bilgisi Desktop'un merkezi dil registry projection'ından gelir. Anahtar hash'i
uyuşmadığında Türkçe korunur; manuel çeviri AI tarafından değiştirilmez. Kaynak keşfi API
modülünün bir üst dizinindeki siteyi kullanır. Ayrıntı ve sınırlar şablon README'sindedir.

Şablonun dinamik dilleri güncel Desktop ve Hosting localization sözleşmesini gerektirir.
Şablon güncellemesi kurulu siteleri kendiliğinden taşımaz veya deploy etmez.

## Doğrulama sınırı

`web-site-template` registry kontrolü geçici bağımsız kopyada gerçek PHP API/SQLite,
publication açma/kapatma, boş yayın/kesinti, responsive/no-JS, dil fallback'i, vendor
bütünlüğü, update çatışması ve efekt pasif/aktif yaşam döngüsünü sınar. İzole Desktop
veritabanında otomatik de/fr/ar, kaynak değişimi, manuel öncelik, hata, RTL ve dil
çekilmesi de doğrulanır; prerequisite Desktop build'idir. Gerçek AI sağlayıcısı, fiziksel
cihaz, Google, üretim hosting veya site taşıması kanıtı değildir.
`verify:pre-main` ayrı entegrasyon kapısıdır.

## Demo iki katmanlı kurulum

`test-site/landing/` tanıtım, kılavuz ve indirme katmanıdır; işletme kayıtlarını göstermez.
Tanıtım avatarı `showcase.js` yalnız mevcut Nexa selamlamasıdır; AI işlemi veya widget açmaz.
Gerçek widget, hesap, sepet ve sipariş `/deneme/` altındaki ortak şablonda çalışır.
Üst katman yalnız public HTTP localization metadata'sını okur; storage/DB include etmez.
API origin'i `YA_SITE_API_ORIGIN` veya demo config'indeki sabit origin'dir; Host'tan türetilmez.

İki katman tek demo `locales/tr.json` kaynağını ve aynı `YaSite\language_context` çözücüsünü
kullanır. Dil listesi merkezi registry publication'ından gelir; zorunlu İngilizce yoktur.
Katalog kimliği, her anahtarın kaynak hash'i ve placeholder eşleşmesi gerekir. OFF, çekilen
hedef dil, eksik metadata veya eski hash Türkçe fallback üretir. Kök kapsamlı dil cookie'si
katmanlar arasında paylaşılır. Kaynak keşfi her iki kökte aynı revision'ı döndürür.

Demo yerleşiminde canonical `public/index.php` → `deneme/entry.php`, `public/assets/` →
`deneme/assets/`, `core/` → `deneme/core/` eşlenir. `deneme/index.php` yalnız composition
wrapper'ıdır. Tema, config ve demo kaynak metinleri siteye aittir. Ortak dosyalarda yerel
özelleştirme yapılmaz. Bilinçli şablon bakımı sonrasında manifest yazılır; ardından
`node scripts/sync-demo-template.mjs --write` ile demo kaynak kopyası güncellenir.
`--check` ve testler salt okunur hash/baseline/katalog bütünlüğünü doğrular; build bu
kaynak kopyasını yeniden üretmez. Standart bağımsız kurulumların üç yönlü güncelleme planı
`web-site-template/tools/update-plan.mjs` ile devam eder.

Demo'nun web kökünde kalması gereken `core/`, `site/`, `locales/`, entry ve manifest
Apache `.htaccess` kurallarıyla kapalıdır. PHP core/config dosyaları doğrudan script isteğinde
ayrıca 404 döndürür. Standart şablonda document root yalnız `public/` olmaya devam eder.
Apache dışı hosting aynı korumayı sunucu config'inde uygulamalıdır. Canlı deploy HTTP smoke'u
hem özel kaynakları hem iki kaynak endpoint'ini sınar.

Eski işletme sayfaları 308 ile `/deneme/?page=…` adreslerine gider. Oda/masa detayları yeni
liste sayfalarında emekliye ayrılmıştır; ayrı eski renderer çalışmaz. Dil, kayıt kimliği ve
hesap action parametresi korunur; `page` parametresi sabit hedefi değiştiremez. Hesap posta ve
OAuth adresi query içermeyen `/deneme/hesabim/` olmalıdır; bu alias token fragment'ini ve
`action` değerini hesap sayfasına taşır.

`node test-site/landing/scripts/deploy.mjs --plan-local` hiçbir uzak bağlantı açmadan demo
build'ini, tam allowlist paketini, hash'leri, korunan backend/download/update yollarını ve
sınırlı eski dosya temizleme listesini çıkarır. Normal yayın önce eski dosyaları www dışında
yedekler; yeni inc/rotaları eşitler, HTTP smoke sonrasında yalnız listedeki eski sayfa/asset
kalıntılarını kaldırır. Backend config/data, indirmeler ve diğer siteler bu paketin dışındadır.
Kaynak ağacındaki eski sunum yardımcıları yeni pakete alınmaz.

## Tanıtım keşfi ve kılavuz

Üst katmanın `inc/discovery.php` dosyası yalnız sunum açıklamalarını, platform ipuçlarını
ve doğrulanmış AI örneklerini sahiplenir. Sektör üyelikleri, required/optional ayrımı ve
bağımlılıklar `business-capabilities.ts`; servislerin OR sahiplikleri
`business-service-ownership.ts` kaynaklarından gelir. `assistant/capability-projection.ts`,
aynı canonical fonksiyonları demo build'inde çalıştırır ve yalnız ignored
`assets/assistant/capability-projection.json` okuma projection'ını üretir. PHP bunu
sunucu tarafında render eder; hosting Node gerektirmez. Ayrı capability politikası veya
çalışan işletmenin etkinlik durumunu taklit eden bir motor yoktur. Kaynak değişikliğinde
`npm run build:demo` gerekir; registry build prerequisite'i ve deploy paketi aynı çıktıyı kullanır.

Sektör bağlantıları JavaScript olmadan sunucu tarafında filtreler; detaylar native
`details` kullanır. JavaScript aynı projection'dan gelen üyeliklerle filtreyi, URL geçmişini
ve bağımlılık bağlantılarını iyileştirir. Bu seçim çalışan uygulamanın ayarlarını değiştirmez.
AI işaretleri ilgili işlem ve sağlayıcı/model ön koşullarıyla sunulur. Yerel Companion,
web/uzak bağlantı ve internet isteyen bulut AI yolları ayrı açıklanır. Bayi Android'in
kalıcı imzalı release dağıtımı kurulum metadata'sından sunulur; kesin rezervasyon, otomatik finans işlemi veya
sınırsız ücretsiz AI iddiası bulunmaz.

Tanıtım Nexa'sı shared rig, doğal hareket ve balon sınıflarını yeniden kullanır; hazır
metinler merkezi katalogdan gelir. Konu düğmeleri AI isteği veya sahte işlem state'i
üretmez. Shared viewport/visibility/reduced-motion durdurması korunur; düşük bellek,
az çekirdek ve veri tasarrufu koşullarında hareket kapalıdır. Sayfa ayrılışında controller
bırakılır ve geri dönüşte tekrar kurulur. Gerçek widget yalnız `/deneme/` katmanındadır.

Kılavuz araması mevcut dildeki metni yerel olarak süzer. Native dialog görsel büyütme,
Escape, odak sınırı ve tetikleyiciye dönüş sağlar; JS kapalıyken görsel bağlantısı çalışır.
`assets/guide/` mevcut doğrulanmış uygulama görüntülerini değiştirmeden yeniden kullanır;
`sources.json` kaynak ve örnek test verisi bilgisini korur. Bu görseller yeni sürüm veya
fiziksel cihaz kanıtı değildir; kapsamlı içerik yenilemesi yeni sürüm sonrasına aittir.

Site-owned editorial page extensions use config `extensions` with `editorial: true`,
a `theme.*` catalog key and a matching `site/views/pages/<id>.php`. Core route IDs
cannot be replaced; extensions do not grant business publications. Room detail uses
the same gated room projection (`page=rooms&id=...`); missing/withdrawn IDs return 404.
Photo/video and 180/360 panorama URLs use the canonical media allowlist; WebGL or
CORS failure retains the static image and original link.

## Müşteri görünür alan sözleşmesi

Şablon 0.4.0'da About kullanılabilirliği yalnız `about_text` değildir: bağımsız
politika/ödeme notu, konuşulan diller, olanak ID'leri veya geçerli saatlerden biri
sayfayı açar. Saatler Desktop'un mevcut konaklama koşuluyla public API'ye gelir.
İşletme olanakları zaten yayımlanan `feature_ids` ile tek Türkçe katalogdan
etiketlenir; bilinmeyen ID için yayımlanmış kaynak etiketi korunabilir.

Oda public number/floor, masa feature/smoking/media ve QR menü image/allergen/tag/
featured alanları ortak görünümde tüketilir. Alanların tam sunum listesi şablon
README'sindedir. Oda/masa güvenli medya görünümü ortaktır; operasyonel/internal
notlar bu sözleşmeye girmez. Boş alan temsili içerikle tamamlanmaz.

`account/config.enabled` hesap sayfasının bağımsız kapısıdır. Teslimat veya ürün
boşluğu yeni siparişi kapatır, açık müşteri hesabını kapatmaz. Widget'ın ilk
composition'ı request türleri ve public surface'leri script metadata'sıyla da
taşır; yeniden okunan API cevabı aynı kararları yeniler. Açık boş yüzey listesi
profil preset'ine dönmez. Genel talep tarih istemez; rezervasyon türleri kendi
optional capability'lerini ve mevcut alan doğrulamalarını korur.

Backend release manifestindeki `deployment_target`, kurulum/module URL/origin
bağını taşır. Demo ve BlackSea fresh preflight'ları beklenen hedefi uzak işlemden
önce karşılaştırır; BlackSea staging target sidecar'ı HTTP kökü dışında kalır.
Hedef metadata'sı secret içermez; config secret'ı rapor/loglara taşınmaz.

## Gündoğdu ikinci tur ortak sunum ekleri

Ortak dosya sayısı 67 korunarak masa detayı (`restaurant&id`), no-JS QR kategori
GET filtresi ve public `updated_at`, sabit origin'li canonical/sitemap/public
JSON-LD, eski masa/menü/detail alias'ları eklendi. Aynı resource/medya/talep ve
publication sahipleri kullanılır. Hesap/private durum SEO'ya girmez. Yeniden
ziyarette 60 saniye sonrası açık yenileme önerisi state'i korur; ikinci polling
hattı veya otomatik rezervasyon/müsaitlik sonucu yoktur. Bu kaynak değişikliği
sürüm bump veya diğer site/demo kurulumlarının kendiliğinden güncellenmesi değildir;
son ortak eşitleme ve sürüm/hash sabitlemesi milestone kapısında yapılır.
