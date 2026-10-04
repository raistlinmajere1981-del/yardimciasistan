# Yardımcı Asistan showcase / çalışma merkezi

`https://yardimciasistan.alwaysdata.net/` kişisel demo ve kurulum merkezidir.
Tek aktif site kaynağı bu dizindir; React/Vite bundle veya ayrı `/demo` uygulaması yoktur.

## Kaynak ve route sahipliği

- `index.php`: showcase; kurulum, kampanyalar, kullanılabilir canlı yüzeyler, ürün anlatımı ve iletişim.
- `inc/header.php`, `inc/footer.php`, `inc/site.php`: ortak PHP shell ve publication okunması.
- `assets/css`, `assets/js`: responsive site, oda/masa/QR menü ve normalize Google yorumları.
- `assets/showcase/workspace.webp`: mevcut uygulama ekranından seçilmiş statik hero. `site_hero_image()` ileride medya seçimini bağlamak için tek sahiplik noktasıdır.
- `/odalar/`, `/odalar/oda/?id=…`, `/restoran/`, `/restoran/masa/?id=…`, `/qr-menu/`, `/yorumlar/`, `/iletisim/` mevcut yüzeyleri korur.
- `/duyurular/`: D4 marketing yayınının tümünü ortak renderer ile gösterir; ana sayfa ilk üç yayını gösterir.
- `/kurulum/`: Windows x64/x86, Android, demo bağlantısı ve kısa kurulum adımları.
- `/kullanim-kilavuzu/`: sonraki ekran görüntülü bölümlere uygun sidebar/content shell.
- `/yardimci-asistan/magaza/`: mevcut mağaza sözleşmesi korunur; modülün canonical route'u.

## Website Menü

Desktop **Ayarlar → Servisler → Website → Menü** mevcut staged Services kayıt akışını kullanır.
`packages/shared/types/website-navigation.ts` bilinen page id, label, path, availability ve varsayılan sırayı tanımlar.
PHP registry snapshot'ı `firm-template/web-module/config/website-pages.json` içindedir; smoke tam eşitliğini doğrular.

`website_navigation` yalnız `{revision, items: [{pageId, visible, order}]}` taşır. Ham URL/HTML kabul edilmez.
Mevcut durable sync outbox, monoton revision ledger, idempotency receipt ve revision-qualified ack kullanılır.
Gizli veya yayın/capability açısından kullanılamayan sayfalar header/footer'da gösterilmez.
`demoOnly` kurulum/kılavuz sayfaları müşteri hostlarında registry resolver tarafından dışlanır.

## Demo anahtarı sınırı

**Yalnız bu site için** `inc/demo-installation.php`, `/yardimci-asistan/config/business.json` dosyasından
anahtarı okur. Yalnız `/` ve `/kurulum/` bu helper'ı çağırır. Değer HTML-escaped readonly input'ta gösterilir;
konfigürasyon yoksa temiz fallback kullanılır. Secret kaynakta, release metadata'da, JS bundle'da veya loglarda saklanmaz.
Bu helper firm-template, generic müşteri paketi veya BlackSea'ye taşınmaz. Secret rendering için ortak modül yoktur.

## Paketler ve deploy

`release.json` download adlarını belirleyen Desktop/Android sürümleridir.
`scripts/product-version.mjs` canonical ürün sürümü değiştiğinde bu metadata'yı günceller.

```bash
npm run deploy:landing -- --dry-run
npm run deploy:landing -- --yes
npm run deploy:landing -- --yes --with-downloads
```

Normal landing deploy yalnız root site kodu, sahip olunan route'lar, site asset'leri ve `release.json` yayınlar.
Önce timestamped yedek alınır; helper/asset/route upload'larından sonra root index atomik değiştirilir.
Bilinen eski bundle'lar, product-guide ve eski demo ağacı yedek sonrası temizlenir.
`/yardimci-asistan` modül kodu, business config, sync secret, data/SQLite, media ve publication state korunur.
Yeni sync action/shared renderer değişiklikleri ayrıca normal `npm run deploy:web -- --yes` ile yayınlanır.
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
