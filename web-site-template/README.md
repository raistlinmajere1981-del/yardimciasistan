# Ortak işletme sitesi şablonu 0.7.0

Public yayınları ve Desktop kaynaklı dinamik çevirileri gösteren bağımsız PHP/CSS/JavaScript temeli.
İşletme verisi, örnek içerik, seed, secret, kurulum indirme veya demo tanıtımı içermez.
`firm-template/web-module` paketinden ayrı dağıtılır; API paketine sunum eklemez.

## Kopyalama ve çalıştırma

PHP 8.2+ ve public API'ye HTTP(S) erişimi gerekir. Node yalnız bakım/test içindir;
ziyaretçi runtime'ı derleme veya npm paketi gerektirmez.

1. Bu dizinin **tamamını** yeni site dizinine kopyalayın. Sadece `public/` yeterli değildir.
2. Web sunucusunun document root'unu `public/` olarak ayarlayın. `core/`, `site/`,
   `locales/`, bakım araçları ve manifest HTTP üzerinden sunulmaz.
3. `site/config.php` içindeki `api_origin` veya `YA_SITE_API_ORIGIN` ortam değişkeni
   public API hizmetinin origin'idir; yalnız şema/host/port içerir. `api_base_path`
   varsayılanı `/yardimci-asistan`dır. Config'e işletme verisi veya secret yazılmaz.
4. Mevcut backend paketi ayrıca `public/yardimci-asistan/` altında kurulur. Site yalnız
   public HTTP uçlarını okur; backend PHP/SQLite/config dosyasını include etmez.
5. Yerel boş başlangıç: `php -S 127.0.0.1:8099 -t public`.

Origin tanımlı değilse site açılır, içerik okunamadığını bildirir; yalnız Ana Sayfa vardır.
API erişilebilir fakat listeler boşsa ayrı boş yayın durumu gösterilir. Telefon, fiyat,
fotoğraf, oda veya kampanya üretilmez. İşletme kimliği API'den gelir; yerel business JSON
veya başka sitenin kimliği/görseli fallback olmaz.

Tek worker'lı PHP sunucu kendi HTTP isteğini cevaplayamayabilir. Normal kuruluma
API'yi ayrı PHP sürecinde/portta verip `api_origin` ayarlayın. Aynı hostta ayrı
worker bulunmayan kurulumlarda (demo gibi) site sahibi açıkça
`local_api_root` (web modülünün mutlak klasörü) ve `php_cli_binary` tanımlayabilir.
Bu yol sadece allowlist'li **mevcut public GET PHP endpoint'lerini** ayrı, sabit
CLI sürecinde çalıştırır; API yayın/projeksiyon kurallarını kopyalamaz, secret
veya doğrudan SQLite erişimi içermez. Özellik site ayarında açıkça seçilmedikçe
kullanılmaz. Tarayıcı medya/işlemleri için `api_base_path` aynı origin'de
erişilebilir olmalıdır; gizli cross-origin proxy kurulmaz.

Rotalar `/?page=rooms&lang=tr` biçimindedir; rewrite gerekmez. Alt dizine kurulumda
`base_path` ve gerçek `api_base_path` açıkça ayarlanır. API'nin mutlak medya yollarının
sunucudaki sahipliği korunur.

## Sorumluluklar ve görünürlük

| Alan | Görev |
| --- | --- |
| `core/api.php` | Allowlist'li public GET, zarf farkları, timeout/boyut sınırı, request-local okuma. Redirect ve kalıcı cache yok. |
| `core/publication.php` | Public cevap → görünür/yerelleştirilmiş projection. Veri veya yayın yazmaz. |
| `core/pages.php` | Siteye ait sayfa tanımları, veriyle kullanılabilirlik ve navigasyon. |
| `core/i18n.php`, `locales/tr.json` | PHP/JS için tek Türkçe UI kataloğu ve dil sözleşmesi. |
| `core/views/` | Ortak layout, sayfa ve bileşenler. |
| `public/assets/core/` | Navigasyon, yapı CSS'i, HTTP ve opsiyonel efekt adaptörü. |
| `site/`, `public/assets/site/` | Kuruluma ait ayarlar, override, tema, davranış, görseller, sahneler. |
| `public/assets/vendor/effect-engine/` | Değiştirilmemiş canonical Efekt Atölyesi runtime/model/registry; sürüm ve SHA-256 envanteri `provenance.json` içinde. |

Profil adı sayfa açmaz. Backend `public_surfaces` içinde profil/capability/yayın kararını
taşır. Oda/restoran/ürün için surface + `enabled:true` + gerçek kayıt gerekir. QR Menü
için `qr_menu` + başarılı menü cevabı + kategoriyle bağlı ürün gerekir. Kapalı menü API'si
404 verir. Diğer sayfalar kendi public veri/etkinlik koşullarıyla açılır. Boş listeler
navigasyonda sayfa üretmez; kullanılamayan sayfaya doğrudan istek 404'tür.
`page_order` ve `hidden_pages` yalnız sıralar/kısıtlar. Kesintide eski başarılı veri
gösterilmez. Yayından kaldırma sonraki sayfa isteğinde uygulanır; açık sekmede polling yoktur.

Servis kararları persisted Desktop runtime capability yayınına dayanır; eksik yayın
kapalıdır. `business.request_types` kullanılabilir talep türlerini açıkça listeler;
oda/masa talepleri kendi optional rezervasyon capability'lerini gerektirir.
Widget canonical `rooms/restaurant/store` yüzeylerini okur; açık boş listeyi profil
varsayımıyla doldurmaz. AI, Talepler, WhatsApp ve yol tarifi bağımsızdır. Genel bilgi
talebi tarih istemez; kapalı talep türü mutation endpoint'inde de reddedilir.
Hesabım'ın tek kullanılabilirlik kaynağı `api/account/config.php.enabled`dır;
ürün sayısı ve teslimat yöntemi hesap erişimini belirlemez.

## Müşteriye gösterilen yayın alanları

| Public kayıt | Sunum |
| --- | --- |
| Business | Açıklama; Hakkımızda'dan bağımsız politika/ödeme notları, konuşulan diller, `feature_ids` etiketleri; geçerli giriş/çıkış/kahvaltı saatleri. Saatler Desktop'un mevcut konaklama capability koşulunu korur. |
| Oda | Ad, numara, kat/konum, kapasite, yatak, açıklama, fiyat notu/gecelik fiyat, özellikler ve yayınlanmış medya. |
| Masa | Ad, alan, kapasite, açıklama, özellikler, belirtilmiş sigara politikası ve sıralı tüm yayınlanmış medya. |
| QR Menü | Kategori adı/açıklaması; ürün adı/açıklaması/fiyatı, güvenli görsel, alerjenler, etiketler ve öne çıkan işareti. |

Boş alan etiket veya temsili içerik üretmez. About sayfası bu bilgilerin herhangi
biri varsa açılır. Fotoğraf/video/180–360 panorama yalnız güvenli yayın URL'lerini
kullanır; özgün medya bağlantısı ve statik fallback korunur. Masa medyası aynı
sunum bileşenini kullanır; ayrı eski renderer veya ikinci medya sahibi yoktur.
Bilinen işletme olanak ID'leri aynı Türkçe UI kataloğundan çevrilir; yeni/bilinmeyen
ID'nin yayımlanmış kaynak etiketi varsa Türkçe korunur. ID veya etiket uydurulmaz.

## Tasarım giydirme

Renk, font, boşluk, görsel oranı ve grid başlangıç değerleri `assets/site/theme.css`
içindedir. Ortak CSS'ten sonra yüklenir; site CSS'iyle değiştirilebilir. Yapısal tasarım
için `core/views/` göreli yolunu `site/views/` altında oluşturun: ör.
`site/views/components/hero.php`, `site/views/pages/rooms.php`, `site/views/layout.php`.
Override aynı `$view` projection'ını ve `$site` sunum bağlamını alır.
`\YaSite\render_view()` ortak/site alt bileşenini çözer. Core düzenlemek gerekmez.
Özel layout ortak CSS/JS, `site-context` JSON ve erişilebilir navigasyon sözleşmesini korur.

Tema veri kaynağı açmaz, gizlenmiş sayfayı açmaz, kayıtları uydurarak tamamlamaz.
Projection veya hakları kurulum sahibinde olan siteye ait statik görseli sunar.
Özel etkileşim `assets/site/theme.mjs` içindeki
`mount({language, integrations, features})` fonksiyonuna yazılır.

## Dil ve entegrasyon

Şimdilik yalnız `locales/tr.json` vardır. Bütün sabit Türkçe UI metinleri semantik
anahtarla bu dosyadadır. PHP `t()` ve JS `language.text(key, values)` aynı kataloğu
kullanır. Katalog HTML içermez. Public kayıt/kullanıcı girdisi/AI cevabı UI sözlüğüne sokulmaz.

Hedef dil dosyası veya config dil listesi yoktur. Masaüstünde Çoklu Dil açılır, adıyla dil
seçilir, Ekle ve Kaydet kullanılır. Eksik public veri ve site metinlerini mevcut AI servisi
arka planda hazırlar. Manuel kayıtlar korunur; başarısız alanlar Dil Yönetimi'nden yeniden
denenebilir. AI/site bağlantısı yokken Türkçe yayın sürer. Hazırlama Desktop'ta, yayın
normal durable outbox/exact ACK akışındadır; dil ayarı/çeviri yazımı pasif otomatik senkron
kapalıyken de aynı coordinator üzerinden yayın denenmesini ister; ziyaret sırasında AI çağrısı yoktur.

`GET /?resource=translation-source` yalnız `locales/tr.json` kaynağını okur; işletme
API'sine gitmez. `_meta.catalog_id` isteğe bağlı sabit katalog kimliğidir (varsayılan
`yardimci-site`); anahtar kimlikleri kararlı tutulur. Tema metni `theme.*` anahtarıyla
**aynı Türkçe kataloğa** eklenir, override PHP/JS tarafından `t()`/`language.text()` ile
okunur. İkinci elle eşleştirilmiş liste, tema çeviri servisi veya hedef JSON oluşturulmaz.

Kaynak yanıtı v1 `id`, otomatik `revision`, `source_language:tr`, `entries` içerir.
Her entry `{text,hash}` taşır. Hash UTF-8 metnin SHA-256'sıdır; revision, anahtarlar ASCII
sırasındayken `key:hash\n` dizisinin SHA-256'sıdır. Metin/anahtar değişince otomatik
fark edilir. En çok 1000 anahtar ve 512 KiB HTTP yanıtı kabul edilir. HTML yoktur.
Desktop, kurulu API modül URL'sinin **bir üst dizinindeki** bu endpoint'i salt okunur,
kimlik bilgisi/cookie göndermeden, redirect izlemeyerek okur (örn. `/otel/yardimci-asistan`
→ `/otel/?resource=translation-source`). Kurulumda site ve API modülü bu komşuluk
sözleşmesini korur. Mevcut şablonsuz siteye katalog enjekte edilmez.

Katalog SQLite'ta işletme ve yayın hedef URL'sine bağlıdır. Servis açıldığında ve 30 saniyelik
kontrolde kaynak yenilenir; eksik işler sırayla tamamlanır. Değişmemiş metin yeniden
çevrilmez. Katalog, merkezi dil kayıtları ve hazır çeviriler aynı `business_context`
yayınındaki `localization` ile gelir. Site yalnız buradaki `target_languages` ve `languages`
kayıtlarını gösterir. Konuşulan diller yayın dili değildir. Dil adları/locale/RTL yönünün
tek sahibi `packages/shared/types/public-languages.ts` kaydıdır; ülkesiz dil için bayrak
uydurulmaz. Yeni dil yalnız bu kayda veri eklenerek desteklenir.

Site, her anahtarın yayınlanan kaynak hash'ini kendi güncel Türkçe kaynağıyla karşılaştırır.
Hash veya çeviri yoksa **yalnız o anahtar** Türkçe kalır; placeholder'lar da korunur.
Public içerik kendi publication metadata'sını kullanır. Business localization kimliği
Hosting config ID'sinden bağımsızdır. Dil kaldırma/OFF sonraki kabul edilmiş yayından sonra
seçenekleri kaldırır; SQLite çevirileri silinmez. Query, bütün navigasyon URL'leri ve
HttpOnly/SameSite cookie tercihi bütün sayfalarda korur; geçersiz/kaldırılmış dil Türkçeye döner.

PHP `number_text`, `price_text`, `date_text`, `time_text` locale'i kullanır; sunucuda tam ICU formatı için
PHP `intl` önerilir. Olmazsa kaynak sayı/ISO tarih korunur. JS ortak `language` adaptörünün
`number`, `currency`, `date` metotları standart `Intl` kullanır; işaretli sayı/fiyatlar
tarayıcıda da biçimlenir. `lang`, `dir`, mantıksal CSS ve mobil menü RTL'yi destekler.
Tema `mount({language, integrations, features})` ile aynı bağlamı alır;
ortak widget/hesap/sepet aynı kataloğa `interaction-language.js` ile bağlanır.
`language.requestContext` sözleşmesi v1 `{version,language,locale,direction}`
ve `ya:language` olayı hazırdır; `integrations.send` seçili dil kodunu taşır. Sohbet backend'inin mevcut
dil desteği ayrıca geçerlidir; bu aşamada sohbet yanıtları genişletilmez.

`integrations.read(endpoint)` public GET uçlarını;
`integrations.send(endpoint, body, {signal})` mevcut `chat`, `request`, `order`,
`availability` POST uçlarını kullanır. POST'lar projection'ın bayraklarıyla kısıtlanır;
asıl yetki/doğrulama backend'dedir. Fiyat hesaplamaz, idempotency key değiştirmez,
otomatik retry yapmaz. Form sahibi taslağı ve aynı niyette aynı key'i korumalıdır.
Ortak widget, genel talep/rezervasyon/bayi formu, hesap ve sepet bu mevcut HTTP
sahiplerini kullanır. Bayi formu ve sepet erişilebilir adları da aynı kaynak
kataloğuna bağlıdır; ikinci hedef dil sözlüğü yoktur.

## Efekt Atölyesi

Varsayılan `effects: []` ve manifest yok: adaptör, sahne, motor, Canvas veya animasyon döngüsü
yoktur. Statik `<img>` normal çalışır. Canonical kaynak `EfektAtolyesi/src/{runtime,registry,model}`
dizinleridir; başka sitedeki vendor kopyası kullanılmaz.

Efekt yalnız site sahibinin hard-coded statik tasarım görselinde kullanılır. Ürün, oda/masa,
dinamik galeri, API'den gelen/uzak görsel, online yükleme ve ekran görüntüsü kapsam dışıdır.
Dinamik galeri kayıtlarına efekt slotu yazılmaz.

1. Atölye'de sabit site görselini seçin, efekt sahnesini hazırlayıp kaydedin.
   Aktif sitedeki `public/assets/site/scenes/` altına hem sahne JSON'u hem de
   `effects-manifest.json` yazılır; bu işlem sunucuya yükleme yapmaz.
2. Her kayıt yalnız siteye ait tam sabit fotoğraf yoluyla bir sahneyi eşler:

   ```json
   {"version": 1, "bindings": [
     {"source": "site/media/hero.jpg", "slot": "hero", "scene": "hero.scene.json"}
   ]}
   ```

   `source`, `public/assets/` altındaki tam dosya yoludur; yalnız
   `site/img/` veya `site/media/` altında bulunan jpg/jpeg/png/webp/avif
   dosyaları kabul edilir. Manifest en fazla 16 KiB ve 32 kayıt olabilir.
   Geçersiz/eksik yol, uzak API URL, aynı fotoğraf ya da slotun tekrar
   kullanılması veya bozuk sahne tüm manifesti reddeder. Görselin yazılı
   `src` adresiyle **tam** eşleşme aranır; ayrı HTML işareti veya config
   `effects` yaması gerekmiyor. Birden fazla aynı DOM görseli varsa efekt
   uygulanmaz.
3. Şablonda artık yalnız bu manifest sözleşmesi vardır. Eski
   `data-effect-slot` + `config.effects` uyumluluk yolu kaldırılmıştır.
   Resimlerin ve kullanıcı verilerinin dinamik listeleri bu sisteme dahil
   edilmez. Canlıya alma, site deploy ve doğrulama aşamasıdır.
4. Eksik/geçersiz JSON, eşleşen görsel yokluğu, etkin layer yokluğu, azaltılmış hareket,
   veri tasarrufu ve çok düşük donanım statik kalır. JSON, görselin `src` değerini değiştirmez.
5. Canonical `importProject` → `compileScene` → `createOverlay` kullanılır. Motor
   viewport/sekme, FPS/DPR/piksel bütçesi ve yavaş çizim fallback'ini sahiplenir.
   Tercih değişimi/pagehide döngüyü temizler; pageshow yeniden kurabilir.
6. İlk sürüm aynı en-boy oranlı responsive resimleri destekler; farklı kadraj/oran statik
   kalır. Özel crop eşlemesi sonraki aşamanın site adaptörü işidir.

Bakımda motor kopyasını yenileme:

```bash
node tools/sync-effect-engine.mjs /path/to/EfektAtolyesi
node tools/sync-effect-engine.mjs --check /path/to/EfektAtolyesi
```

İlk komut açık kaynak yazarlığı adımıdır; build/test tarafından çağrılmaz. Araç kaynak
`ENGINE_VERSION` değerini okur; desteklenen semantik major 1 yanında gerçek API, v1 fotoğraf
ve v2 objectScene şemalarını ve sceneObject flame/glow/smoke kayıtlarını doğrular. Sürüm
etiketi içerik eşitliği sayılmaz. Üç ağacın tüm `.mjs` dosyaları byte-identical kopyalanır;
symlink, kapsam dışı import ve beklenmeyen dosyalar reddedilir. Önce geçici kardeş dizin
hazırlanıp doğrulanır, eski hedef rename ile korunur, yeni hedef yayınlanır; rename hatasında
geri alınır. Bu işlem crash-atomic exchange değildir. Eski modüller yeni hedefte kalmaz.

Provenance format 2; zaman damgası/makine yolu içermez. `files` deterministik yol → SHA-256
envanteridir; `fingerprint`, envanter sırasındaki her `path:sha256\n` satırının birleşiminin
SHA-256'sıdır. `--check` kaynak, envanter ve provenance'ın tam eşitliğini salt okunur sınar;
bozuk hash, eksik/fazla modül veya aynı sürümde değişen baytlar hata verir.

Yardımcı Asistan kökünden Admin ve şablonu birlikte kontrol edin:

```bash
node apps/admin-control-center/scripts/sync-effect-studio.mjs --check
node --test scripts/test-effect-engine-sync.mjs
```

CI'da canonical checkout yolu `EFEKT_ATOLYESI_ROOT` ile verilebilir; Admin'in Git dışı
snapshot'ı önce açık `npm run effect:sync -w @yardimci-asistan/admin-control-center` adımıyla
üretilir. Bu adım tam editörü (`scene.html`, `scene.css`, `src`, `assets`, `examples` dahil)
kopyalar; yerel editör değişikliklerini önce inceleyin. Zaten aynı motoru taşıyan snapshot
için `node apps/admin-control-center/scripts/sync-effect-studio.mjs --write-provenance`
yalnız Admin `effect-engine-provenance.json` kaydını yazar, editöre dokunmaz. Admin'in dev/build
kancaları yalnız `--check` çalıştırır. Kontroller otomatik onarım yapmaz. Bilinçli kaynak
yenilemesinden sonra son adım `node tools/manifest.mjs --write`, ardından
`node tools/manifest.mjs` olmalıdır (şablon dizininden); sürüm otomatik artırılmaz.

Vendor v2 nesne runtime'ını içerir; statik fotoğraf adaptörünün bağlama sözleşmesi hâlâ v1
fotoğraf sahnesidir. V2 DOM nesne bağlama ve siteye yayın ayrı entegrasyon işidir; v2 JSON
fotoğraf gibi tahmin edilmez, statik kalır. Siteye özel motor fork'u yoktur. Canonical kaynak
bakım ve CI eşitlik kontrolünde gereklidir; site runtime'ında gerekmez. Vendor'ın Türkçe
şema/parametre tanımları canonical kaynaktır; UI'de ham hata olarak gösterilmez.

## Kontrollü güncelleme

`template-manifest.json` ortak sürüm ve dosya hash'lerini taşır. Core, giriş dosyası,
ortak asset'ler, vendor ve araçlar ortaktır. `site/`, `locales/`, `assets/site/` kuruluma
aittir. Backend, müşteri medyası ve runtime verisi bu manifestin dışındadır.

1. Kurulu dosyaları/mevcut manifesti yedekleyin; staging kopyası oluşturun.
2. Yeni sürümde `node tools/manifest.mjs` ve aşağıdaki salt okunur planı çalıştırın:

   ```bash
   node tools/update-plan.mjs /path/to/new-template /path/to/installed-copy
   ```

   Eski manifest → mevcut dosya → yeni hash karşılaştırılır. Ekle/değiştir/sil listesi,
   yerel core çatışmaları ve elle birleştirilecek katalog anahtarları çıkar. Site dosyaları
   kopyalanmaz. Symlink ve kapsam dışı manifest yolları reddedilir.
3. Çatışmaları inceleyin; özelleştirmeleri mümkünse `site/` altına taşıyın. Yalnız plandaki
   ortak dosyaları staging'de aktarın. Tema/override/medya korunur. Yeni anahtarları aynı
   kataloğa elle birleştirin; yeni manifesti staging'e alın.
4. Bütünlük, şablon smoke'u ve sitenin testlerini çalıştırın; site sahibinin yayın akışıyla
   aktarın. Hosting'in normal PHP opcode cache yenilemesini uygulayın. Otomatik apply/deploy,
   backend güncelleme veya DB migration bu aşamada yoktur.

Şablon bakımında bilinçli kaynak değişikliklerinden sonra `node tools/manifest.mjs --write`
ile manifest hazırlanır. Build/test manifesti yeniden üretmez.

## Doğrulama

Yardımcı Asistan kökünden:

```bash
node scripts/smoke-web-site-template.mjs --contracts-only
node scripts/smoke-web-form-api.mjs --capabilities-only
node scripts/smoke-web-widget-module.mjs --capabilities-only
node scripts/smoke-web-widget-module.mjs --language-only
npm run verify:check -- web-site-template
npm run verify:check -- verification-registry-tests
```

Smoke bağımsız geçici kopyada gerçek PHP API/SQLite publication, boş/açık/kapalı yayın,
kesinti, XSS escaping, mobil/masaüstü/no-JS, dil, pasif/aktif efekt ve scheduler temizliğini
sınar. İzole Desktop SQLite ve sahte AI sağlayıcı yanıtları kullanılır; gerçek anahtar/canlı veri kullanılmaz. Görüntüler `artifacts/web-site-template/`
altındadır. Kopya bütünlüğü bakım ortamında `node tools/manifest.mjs` ile kontrol edilir.

İnceleme ve API ihtiyaçları: Yardımcı Asistan deposunda
`docs/architecture/WEB_SITE_TEMPLATE_V1.md`.

## Ortak işlemler

Web müşterisi ve bayi aynı Hesabım, ürün detay/katalog, sepet/checkout ve sipariş
liste/detayını kullanır. Bayi için yalnız hesapta ibare ve backend'in yetkilendirdiği
fiyatlar farklıdır; ayrı mod veya ikinci portal yoktur. `account-session.js` ortak
oturum/doğrulama sahibidir. Arama, kategori, SKU ve marka filtreleri mevcut katalog
alanlarını kullanır; QR Menü kategorileri mağazaya taşınmaz. `?page=catalog&id=…`
aynı katalogdaki ürün detayını, `?page=account&order=…` yalnız kendi siparişini açar.
Karşılaştırma aynı yetkili katalogdan en fazla iki ürün alır; cihaz fotoğrafı yalnız
tarayıcıda kalır. Özel fiyatlar ve müşteri iletişim bilgileri browser storage'a yazılmaz.
Belirsiz siparişte aynı key/gövde korunur; hesap receipt okuması yeni sipariş üretmez.

`/katalog/`, `/magaza/`, `/urun/?id=…`, `/sepet/`, `/hesabim/` ve `/bayi/` sabit
allowlist alias'ları canonical query sayfalarına gider. Filtre/dil ve account action
parametreleri korunur; query hedef sayfayı değiştiremez. Hesap token fragment'i
HTTP'ye gönderilmez ve istemci tüketince URL'den temizlenir. PHP geliştirme sunucusu
index fallback'ini kullanır; production sunucu bu eski yolları `public/index.php`'ye
yönlendirmelidir. Backend API yolları bu fallback'e alınmaz.

Hesap sayfası mevcut `api/account/` ve yetkili kullanıcıda `api/dealer/` uçlarını kullanır.
Kayıtta yalnız ad/e-posta istenir; parola posta kutusundaki tek kullanımlık bağlantı ile
belirlenir. Şablon frontend'i yeni kimlik, fiyat, sipariş veya yayın authority'si kurmaz.
Katalog sipariş yöntemiyle yayımlanmışsa ortak sepet/checkout açılır. İstek hatasında aynı
idempotency anahtarı ve kullanıcı taslağı korunur. Widget kullanılabilir AI/talep/
WhatsApp/yol tarifi işlemlerinden bağımsızca açılır. İşlem yoksa normal launcher
gizlidir; demo'nun açık görünürlük tercihinde anlamlı boş durum gösterilir.
Üst demo tanıtım avatarı bu bileşenden ayrıdır.

`interaction-language.js` mevcut etkileşim bileşenlerini PHP'nin aynı hash kontrollü
kataloğuna bağlar. Türkçe kaynak ifadeler `sourceKeys` ile mevcut katalog kimliklerine
çözülür; hedef dil dosyası veya runtime çeviri çağrısı yoktur. Public kayıtlar kendi
publication metadata'sıyla çevrilir; müşteri metni/AI yanıtı ve fiyat/ID değiştirilmez.
Widget kaynak sahibi `test-site/landing/assistant/` olmaya devam eder. Bilinçli widget
bakımında `npm run build:demo` çıktısındaki widget bundle'ı bu şablonun
`public/assets/core/widget.js` sürümüne alınır; manifest ve demo kopyası açıkça güncellenir.
Build/test ortak sürüm dosyalarını yazmaz; showcase smoke kaynak build'inin bundle ile
bütünlüğünü denetler. Yalnız widget bakımında showcase build'ini çalıştırmadan:

```sh
cd test-site/landing
npx vite build --config vite.config.ts
cd ../..
cp test-site/landing/assets/assistant/widget.js web-site-template/public/assets/core/widget.js
node --test --test-isolation=none scripts/test-widget-direct-request-focus.mjs
node scripts/test-panorama-focus.mjs
```

Son komut 390/1440px ortak panorama ve widget odak testidir; izole fixture kullanır,
canlı API'ye bağlanmaz. Sandbox HTTP/tarayıcıyı engellerse host üzerinde çalıştırılır.
Panorama genişletmesi WebGL ve görsel hazır olduğunda görünür; native fullscreen
kullanılamazsa aynı kapatma/Escape/odak davranışı modal dialog'da devam eder.
 Demo yerleşimi ve yayın planı canonical mimari sözleşmesindedir.

## Siteye ait editoryal sayfalar ve oda detayı

`site/config.php` içindeki `extensions` sözlüğü, örneğin
`'guide' => ['key' => 'theme.guide.title', 'editorial' => true]`, yalnız
`site/views/pages/guide.php` mevcutsa ek sayfa açar. Kimlik yalnız küçük harf ve
kısa çizgi içerir; ortak sayfa kimliği değiştirilemez. `hidden_pages` bu sayfaları da
kısıtlar. API/capability kapılarını genişletmez; işletme verisi taşımaz. Uzantının
bütün metinleri aynı Türkçe kaynak kataloğunda bulunur.

`?page=rooms&id=<published-id>` aynı oda projection'ından detay açar; bilinmeyen
veya yayından kaldırılmış kimlik 404 verir. Fotoğraf, video ve 180/360 equirectangular
panorama yalnız güvenli yayın URL'lerinden gelir. WebGL/CORS sorunu varsa statik
fotoğraf ve özgün medya bağlantısı kalır. Panorama yalnız etkileşim/resize sırasında
çizer; video kullanıcı başlatmadan oynamaz.

## Oda/masa, menü, eski URL ve yayın güncelliği

`?page=restaurant&id=<published-id>` mevcut masa projection'ını ve ortak resource
medya/özellik/talep bileşenlerini kullanır. Listede başlık/kapak detaya gider;
kapalı/bilinmeyen kimlik 404'tür. Oda ve masa dil değişiminde kimliğini korur.
`/restoran/masa/`, `/odalar/oda/`, `/qr-menu/` ve bilinen diğer alias'lar (isteğe
bağlı `index.php` dahil) allowlist query parametreleriyle aynı kapılara yönlenir.
Sunucunun mevcut olmayan dosyaları `public/index.php` front controller'ına
iletmesi gerekir; hosting rewrite/router site sahibine aittir. Bilinmeyen path
404'tür. Site alt dizinde ise `base_path` ve rewrite hedefi birlikte ayarlanır.

QR Menü `category` GET filtresini aynı yayınlı kategori/ürün kümesi üzerinde
uygular; boş/kapalı/bilinmeyen kategori 404'tür. Form no-JS çalışır. `updated_at`
yalnız geçerli public timestamp ise gösterilir; istemci saati yayın zamanı olarak
üretilmez. Masa talebi, QR yayını ve katalog sipariş kapıları bağımsızdır.

`site/config.php` içindeki isteğe bağlı `public_origin` yalnız HTTPS origin'idir;
Host/X-Forwarded-Host'tan türetilmez. Tanımlanırsa canonical link, public
projection'dan JSON-LD ve `?resource=sitemap` / `/sitemap.xml` üretilebilir.
Hesap sayfası noindex'tir, private kayıtlar sitemap/JSON-LD'ye girmez. Eksik sayfa
canonical/JSON-LD üretmez. API kesintisi veya eksik origin sitemap'te 503 boş XML
verir. Sitemap metadata'sı için son güncelleme zamanı uydurulmaz; yalnız açık
sayfalar ve geçerli oda/masa/kategori kimlikleri ile yayınlı dil listesi kullanılır.

Canonical projection her sayfa isteğinde yeniden okunur. Sekmeye/BFCache sayfasına
dönüşte otomatik uyarı, reload veya ek poller çalışmaz; mevcut form/sepet/widget
state'i korunur. Menü sayfasındaki manuel “Yayınları yenile” bağlantısı kalır.
İşlem anındaki yetki/fiyat/müsaitlik denetimi mevcut API sahiplerindedir; açık
sayfa içeriğinin kendiliğinden güncellendiği varsayılmamalıdır.
