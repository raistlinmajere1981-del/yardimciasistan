# Yardımcı Asistan showcase / çalışma merkezi

`https://yardimciasistan.alwaysdata.net/` kişisel demo ve kurulum merkezidir.
Tek aktif site kaynağı bu dizindir; Sayfa yapısı PHP'dir; asistan TypeScript kaynaklarından bu site için derlenir.

## Kaynak ve route sahipliği

- `index.php`: showcase; kurulum, kampanyalar, kullanılabilir canlı yüzeyler, ürün anlatımı ve iletişim.
- `inc/header.php`, `inc/footer.php`, `inc/site.php`: ortak PHP shell ve publication okunması.
- `assets/css`, `assets/js`: responsive site, oda/masa/QR menü ve normalize Google yorumları.
- `assets/showcase/workspace.webp`: mevcut uygulama ekranından seçilmiş statik hero. `site_hero_image()` ileride medya seçimini bağlamak için tek sahiplik noktasıdır.
- `/odalar/`, `/odalar/oda/?id=…`, `/restoran/`, `/restoran/masa/?id=…`, `/qr-menu/`, `/magaza/`, `/yorumlar/`, `/iletisim/` mevcut yüzeyleri korur.
- `/duyurular/`: D4 marketing yayınının tümünü siteye ait renderer ile gösterir; ana sayfa ilk üç yayını gösterir.
- `/kurulum/`: Windows x64/x86, Android, demo bağlantısı ve kısa kurulum adımları.
- `/kullanim-kilavuzu/`: sonraki ekran görüntülü bölümlere uygun sidebar/content shell.
- `/bayi/`: siteye ait bayi portalı; işlemler `/yardimci-asistan/api/dealer/` üzerinden yürür.

## Navigasyon sahipliği

Bu showcase kendi route listesini ve sırasını `inc/site.php` içinde sahiplenir. Opsiyonel sayfalar yalnız ilgili
capability/publication gerçekten kullanılabilir olduğunda header/footer'da görünür. Desktop müşteri sitelerinin
sayfa listesini, sırasını veya görünürlüğünü yayınlamaz; her müşteri sitesi kendi bilgi mimarisini korur.


## Demo anahtarı sınırı

**Yalnız bu site için** `inc/demo-installation.php`, `/yardimci-asistan/config/business.json` dosyasından
anahtarı okur. Yalnız `/` ve `/kurulum/` bu helper'ı çağırır. Değer HTML-escaped readonly input'ta gösterilir;
konfigürasyon yoksa temiz fallback kullanılır. Secret kaynakta, release metadata'da, JS bundle'da veya loglarda saklanmaz.
Bu helper firm-template, generic müşteri paketi veya BlackSea'ye taşınmaz. Secret rendering için ortak modül yoktur.

## Paketler ve deploy

`release.json` download adlarını belirleyen Desktop/Android sürümleridir.
`scripts/product-version.mjs` canonical ürün sürümü değiştiğinde bu metadata'yı günceller.

```bash
npm run build:demo
npm run deploy:landing -- --dry-run
npm run deploy:landing -- --yes
npm run deploy:landing -- --yes --with-downloads
```

Normal landing deploy yalnız root site kodu, sahip olunan route'lar, site asset'leri ve `release.json` yayınlar.
Önce timestamped yedek alınır; helper/asset/route upload'larından sonra root index atomik değiştirilir.
Bilinen eski bundle'lar, product-guide ve eski demo ağacı yedek sonrası temizlenir.
`/yardimci-asistan` modül kodu, business config, sync secret, data/SQLite, media ve publication state korunur.
Backend değişiklikleri ayrıca normal `npm run deploy:web -- --yes` ile yayınlanır.
Web deploy'un `--fresh` semantiği ayrı kalır; normal yayın runtime/config'i taşır.

`--with-downloads` güncel Windows x64/x86 ve release APK artefaktlarını SHA-256 doğrulayarak yayınlar;
normal site deploy download dosyalarını değiştirmez. Download sürümleri yayınlanmış paketlerle eşleşmelidir.

## Doğrulama

```bash
npm run verify:check -- showcase-website
npm run verify:check -- marketing-website
npm run verify:check -- package-web-module
```

Showcase smoke gerçek PHP/SQLite ve Desktop publication servisleriyle menü, availability, demo-only secret,
çoklu görsel, edit/reorder/remove/add/unpublish, route'lar, mobil menü ve reduced-motion davranışını doğrular.

Mağaza `/magaza/` sayfası `inc/storefront.php` ve `assets/css/storefront.css`,
`assets/js/storefront.js` dosyalarını kullanır. `data-api-base="/yardimci-asistan/api/"`
API sahibini belirtir. Duyuru, bayi ve harita renderer'ları da site asset'leridir.
`assistant/` TypeScript kaynakları `npm run build:demo` ile ignored
`assets/assistant/` altına derlenir. Footer yalnız bu site asset'ini yükler.
Ortak modülde mağaza/duyuru/bayi/widget rotası bulunmaz. Landing deploy asistanı
önce derler; API-only web deploy'dan bağımsızdır.

## Canlı demo doğrulaması

Yetkili yayın aşamasında önce `npm run deploy:web -- --dry-run` ve
`npm run deploy:landing -- --dry-run` farkları incelenir; API ve site ayrı
komutlarıyla yayınlanır. Normal güncellemede `--fresh` kullanılmaz.

1. Desktop'tan menü, oda/masa, galeri, online katalog ve Website kampanyası yayınlayın;
   publication işlerinin exact acknowledgement ile tamamlandığını kontrol edin.
2. `/yardimci-asistan/api/` uçları ile `/qr-menu/`, `/odalar/`, `/restoran/`,
   `/galeri/`, `/magaza/` ve `/duyurular/` sayfalarını karşılaştırın.
3. Talep, AI ve isteğe bağlı WhatsApp akışını; guest sipariş ve bayi davet/oturum/sipariş
   akışını test edin. Talep ve siparişin Desktop'a bir kez ulaştığını doğrulayın.
4. Yayını kapatma, kampanyayı kaldırma, teslimatı kapatma ve bayi erişimini iptal
   etme sonrası görünürlük/işlem reddini kontrol edin; mobil görünümü de inceleyin.
5. Modül altındaki eski `/magaza/`, `/duyurular/`, `/bayi/` ve `/widget.js` yolları
   404 dönmelidir. Site kendi asset'lerini yüklemeli; runtime veri ve medya korunmalıdır.

Çoklu Dil denemesinde Desktop'ta hedef `en` ekleyip public kayıtların çevirilerini
kaydedin ve normal eşitlemeyi çalıştırın. Üstteki site dili alanından English seçip
Uygula'ya basın; seçim sayfalar arasında korunur. Ürün, menü, oda/masa, galeri ve
kampanya metinleri `localization` verisinden seçilir; eksik/stale alanlar Türkçe kalır.
Site UI sözlüğü `assets/i18n/en.json` içindedir; PHP, JS ve demo asistanı aynı sözlüğü
kullanır. Kullanıcı notları ve AI yanıtları çevrilmez. Tarih ve sayı gösterimi
seçilen site dilini izler; ISO tarihler ve işlem değerleri değişmez. API metinleri
Türkçe kaynaklarını korur; servis OFF iken İngilizce seçili olsa da public içerik
Türkçe gösterilir. `npm run verify:domain -- translations` bu zinciri gerçek PHP ve
tarayıcıyla sınar.

Yerel manuel test için `npm run build:demo` ardından
`php -S 127.0.0.1:8080 -t test-site/landing` çalıştırın. Bu dizindeki
`yardimci-asistan/` yerel demo API kurulumunun mevcut olması gerekir; smoke testleri
kendi geçici API/SQLite kurulumlarını oluşturur ve çalışan işletme verisine dokunmaz.

1. `http://127.0.0.1:8080/?lang=en` açın. Yukarıdaki tüm public sayfalara menüden
   geçin; mobilde menü ve dil seçicisini, oda/masa detayında ID'nin korunmasını deneyin.
2. Asistanda tarih, kişi ve saat seçin; geçersiz telefon, gönderim hatası/yeniden
   deneme, başarılı talep ve bilgi sorusunu deneyin. Gerçek talep/sipariş oluşturmak
   için test işletmesini kullanın. AI testi mevcut sağlayıcının kullanılabilirliğine bağlıdır.
3. Bir alanı çevirisiz bırakın, başka bir alanın Türkçe kaynağını değiştirip eşitleyin.
   Yalnız bu alanların Türkçeye dönmesini kontrol edin. Servisi kapatıp eşitleyin;
   public içerik Türkçe, site düğmeleri seçilen dilde kalmalıdır.
4. Yayından kaldırdığınız içerikleri ve boş yüzeyleri kontrol edin. Dil Yönetimi'nde
   gerçek boş kaynak açıklaması ile okuma hatası/yenileme mesajı farklıdır.

`public-translations-web` gerçek PHP/TR-EN gezinme, mobil, asistan işlemleri ve
fallback testlerini; `public-translations-ui` 10.000 kayıt, boş/dolu SQLite fixture
ve ilk yükleme/yenileme hatalarını içerir. Her biri `npm run verify:check -- <id>`
ile çalıştırılır.
