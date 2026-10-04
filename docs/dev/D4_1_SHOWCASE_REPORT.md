# D4.1 — Alwaysdata showcase / çalışma merkezi

Doğrudan `main` üzerinde uygulandı; başlangıç HEAD: `848f482e02cfbceb7dc698ea15c44541e6eba32a`.
Başlangıç çalışma ağacı temizdi. Commit oluşturulmadı.

## Görsel karar

Superdesign üzerinde üç bağımsız HTML taslağı oluşturuldu:

- [A — Açık çalışma merkezi](https://p.superdesign.dev/draft/1e2c6497-1ea3-4382-a60f-ae5bed0e1eb2): seçilen yön.
- [B — Panoramik vitrin](https://p.superdesign.dev/draft/ae463636-e2c7-487e-8b64-889edf9d94c4): koyu, merkezî hero.
- [C — Sıcak editoryal](https://p.superdesign.dev/draft/31ca110a-cefb-4233-9716-9892d42064d7): krem/yeşil, daha geniş boşluklar.

[Canvas](https://superdesign.dev/teams/d43e8b12-551a-4b15-a10c-e48c388c4fc6/projects/1c0ce91d-1124-4573-a3c3-4f4e0cd9b24a).
Superdesign model kataloğunda GPT-6 Astra bulunmadığından becerinin doğrudan HTML import yolu kullanıldı.

A'nın okunaklı sans-serif başlıkları, mobilde tek kolona inen hero/kurulum düzeni,
sınırlı görsel yoğunluğu ve kampanyalara ayrılmış alanı bu çalışma merkezine en uygun yön oldu.
Sonuç PHP/HTML/CSS ve mevcut publication renderer'larıyla uygulandı.

BlackSea'den sticky header, responsive horizontal navigation/mobile disclosure,
kaçış tuşuyla kapanma ve sakin görsel hareket yaklaşımı referans alındı.
BlackSea dosyaları değiştirilmedi; işletme metni, domain veya kıyı görseli siteye taşınmadı.
Hero mevcut Yardımcı Asistan ekranıdır: izole `assets/showcase/workspace.webp` ve `site_hero_image()` sahipliği.
28 saniyelik küçük pan/zoom CSS transform kullanır; reduced-motion tamamen kapatır.

## Tek site ve route ağacı

```text
/
/odalar/
/odalar/oda/?id=…
/restoran/
/restoran/masa/?id=…
/qr-menu/
/yardimci-asistan/magaza/
/duyurular/
/yorumlar/
/iletisim/
/kurulum/
/kullanim-kilavuzu/
```

`test-site/landing/demo` kaynak ağacı kaldırıldı; çalışan PHP yüzeyleri köke taşındı.
Mağaza mevcut modül route'unu korur. Kılavuz yalnız sidebar/content placeholder shell'dir.
Ana sayfa hero → kurulum → aktif kampanyalar → kullanılabilir yüzeyler → oda önizlemesi
→ Google yorumları → ürün alanları → iletişim sırasını kullanır.
Kampanya yoksa bölüm gizlenir; oda önizlemesi boş katalogda büyük boş alan üretmez.

## Navigation publication

`WEBSITE_PAGES` typed, bounded registry'dir; PHP snapshot'ı davranış smoke'unda tam eşitlik kontrolünden geçer.
Bilinen page id dışında route/HTML/URL alınmaz. Published biçim:

```json
{"revision": 1, "items": [{"pageId": "rooms", "visible": true, "order": 10}]}
```

Desktop **Ayarlar → Servisler → Website → Menü** alanında görünürlük ve yukarı/aşağı sıralama bulunur.
Mevcut Services draft/dirty/discard/save akışı kullanılır; SQLite settings satırı ve outbox intent'i
aynı transaction içinde yazılır. Yeni bir Settings kayıt sistemi veya IPC ailesi yoktur.
Durable outbox, monoton revision ledger, idempotency ve eşleşen revision ack reuse edilir.
Menü kaydı explicit sync cycle ister; passive auto-sync tercihini değiştirmez.
Web resolver user visibility ile capability/publication availability'yi birlikte değerlendirir.
Kurulum ve kılavuz demoOnly'dir; generic host resolver bunları dışlar.

## Secret sınırı ve indirmeler

`inc/demo-installation.php` yalnız bu demo host'a aittir; yalnız `/` ve `/kurulum/` çağırır.
Anahtar backend business config'ten okunup escaped readonly input'a yazılır. Kaynakta hardcode,
window global, meta injection, fetch patch veya generic secret rendering yoktur.
Firm-template/BlackSea/customer paketlerine helper eklenmedi.

Windows x64/x86 ve Android download adları `release.json` ile belirlenir.
Canonical product-version scripti artık generated bundle yerine bu metadata'yı günceller.
Mevcut 2.0.2 kurulum paketleri korundu; üç canlı download URL'i HTTP 200 verdi.
Desktop kaynak/derleme yeni menüyü içerir; bu tur Windows/APK release paketleri yeniden üretilmedi.

## D4 marketing

Mevcut `marketing_website`, medya upload, snapshot, revision ve ack sözleşmeleri korunur.
Ana sayfada ilk üç publication, `/duyurular/` üzerinde tam liste gösterilir.
Shared `marketing.js` yalnız bounded preview limiti, optional heading ve empty-wrapper desteği aldı.
Gerçek PHP + Desktop publication servisleriyle iki görsel, text update, sıra değişimi,
görsel kaldırma/yeni görsel ve unpublish hem ana sayfada hem duyurularda doğrulandı.
Canlı runtime publication state değiştirilmeden korunmuştur; kabul akışı izole PHP test kurulumunda çalıştı.

## Cleanup ve deploy

Silinen: `index-t2kNTUv0.js`, `index-fcReLA3k.css`, eski root DOM/fetch/MutationObserver patch'leri,
artık kullanılmayan sekiz product-guide görseli ve ayrı demo wrapper/index.
Tek güncel screenshot hero sahipliğine taşındı. Ortak site CSS'inden 179 kullanılmayan kural temizlendi.
README, capability smoke route varsayımları, release-version testi ve deploy copy logic güncellendi.
D4 tarihsel raporuna yeni sahiplik notu eklendi.

Normal landing deploy yedek alır, helper/asset/route'ları yayınlar ve root index'i en son atomik değiştirir.
Yalnız bilinen eski bundle/product-guide/demo dosyalarını temizler; modül runtime/config'e dokunmaz.
Web deploy normal preservation semantiğini korur; `--fresh` kullanılmadı.

## Targeted doğrulamalar

Geçen kontroller:

- Desktop build; Electron typecheck.
- Showcase gerçek PHP/browser smoke: typed menu, varsayılanlar, visibility/order, kapalı sayfa,
  idempotent replay ve yanlış revision ack'te intent preservation.
- Website Menü staged save/discard/order ve Settings responsive geometri smoke'u.
- Ana sayfa/duyurular multi-image edit/reorder/remove/add/unpublish.
- Oda/liste-detay, masa/liste-detay, QR ürün, mağaza ürünü, iletişim telefon/harita.
- Mevcut Google normalizer ile ana sayfa rating/üç yorum ve yorumlar tam görünümü;
  sağlayıcı yanıtı tarayıcıda mock edildi, gerçek Google çağrısı yapılmadı.
- Mobil menü/Escape, 375/768/1440 overflow ve reduced-motion.
- D4 marketing website ve marketing UI regresyonları.
- Automatic sync; online catalog; dealer access/portal; storefront; web-module menu;
  capability-surface consistency.
- Web-module packaging, PHP lint, architecture audit, strict design audit.
- Verification registry ve product-version testleri: toplam 14 test.
- `git diff --check`.

Full Verify çalıştırılmadı. Yeni kontrol canonical verification registry'ye kaydedildi.
Regresyonlarda yeni navigation publication nedeniyle değişen sabit job-count/capability ve
mock transport allowlist beklentileri güncellendi; tekrar koşumlar geçti.
Önceden kalan test hatası gözlenmedi. Vite mevcut bundle-size uyarısını verdi; build geçti.

Önerilen commit: `feat(showcase): rebuild demo root and publish typed website navigation`

## Canlı sonuç

Normal web-module ve landing deploy tamamlandı; root yeni showcase açılıyor.
Yedekler: `yardimci-asistan-20261004T232358Z` ve `landing-20261004T232706Z`.
Canlı browser kontrolü root/route'lar, mobil menü, reduced-motion ve secret sınırını geçti.
Mevcut bir aktif marketing publication korundu ve ana sayfada gösterildi.
Deploy öncesi/sonrası business config, runtime SQLite ve Google local ayarlarının SHA-256 değerleri aynı.
Bu tur Desktop release installer/APK artefaktları değiştirilmedi.

## Git diff --stat

```text
 apps/desktop-app/db/schema.sql                     |   3 +-
 apps/desktop-app/electron/database-types.ts        |   5 +-
 .../electron/database/sync-runtime-store.ts        |   2 +-
 apps/desktop-app/electron/main.ts                  |   7 +
 apps/desktop-app/electron/setup-service.ts         |  11 +
 apps/desktop-app/electron/sync-coordinator.ts      |  16 ++
 apps/desktop-app/src/app/settings-draft-model.ts   |   6 +-
 apps/desktop-app/src/app/setup-model.ts            |   5 +
 .../src/components/settings/WebSettingsSection.tsx |   2 +
 .../settings/WebsiteNavigationFields.tsx           |  19 ++
 apps/desktop-app/src/styles/pages/settings.css     |   4 +
 docs/architecture/DOMAIN_DECISIONS_V1.md           |  18 ++
 docs/dev/D4_1_SHOWCASE_REPORT.md                   | 295 +++++++++++++++++++++
 docs/dev/D4_MARKETING_STUDIO_REPORT.md             |   2 +
 firm-template/web-module/api/sync.php              |  20 +-
 firm-template/web-module/config/website-pages.json |  85 ++++++
 firm-template/web-module/duyurular/marketing.js    |  10 +-
 firm-template/web-module/lib/storage.php           |   1 +
 .../web-module/lib/website-navigation.php          |  39 +++
 packages/shared/index.ts                           |   1 +
 packages/shared/types/website-navigation.ts        |  36 +++
 packages/sync-core/hosting-transport.ts            |  10 +-
 packages/sync-core/index.ts                        |   2 +
 scripts/php-lint.mjs                               |   4 +
 scripts/product-version.mjs                        |  51 +---
 scripts/smoke-automatic-sync.mjs                   |   3 +-
 scripts/smoke-capability-surface-consistency.mjs   |  10 +-
 scripts/smoke-commerce-online-catalog.mjs          |   2 +-
 scripts/smoke-settings-platform.mjs                |  20 ++
 scripts/smoke-showcase-website.mjs                 | 109 ++++++++
 scripts/test-product-version.mjs                   |  17 +-
 scripts/verification-registry.mjs                  |   5 +-
 test-site/landing/README.md                        | 198 ++++----------
 test-site/landing/assets/css/site.css              | 130 +++++++++
 test-site/landing/assets/index-fcReLA3k.css        |   1 -
 test-site/landing/assets/index-t2kNTUv0.js         |   9 -
 test-site/landing/{demo => }/assets/js/qr-menu.js  |   0
 test-site/landing/{demo => }/assets/js/rooms.js    |   2 +-
 test-site/landing/{demo => }/assets/js/site.js     |  10 +
 test-site/landing/{demo => }/assets/js/tables.js   |   2 +-
 .../assets/product-guide/android-restaurant.webp   | Bin 38566 -> 0 bytes
 .../assets/product-guide/android-today.webp        | Bin 40544 -> 0 bytes
 .../assets/product-guide/desktop-orders.webp       | Bin 57792 -> 0 bytes
 .../assets/product-guide/desktop-reports.webp      | Bin 49068 -> 0 bytes
 .../assets/product-guide/desktop-requests.webp     | Bin 48332 -> 0 bytes
 .../assets/product-guide/desktop-stock.webp        | Bin 43038 -> 0 bytes
 .../assets/product-guide/web-assistant.webp        | Bin 154160 -> 0 bytes
 .../landing/assets/product-guide/web-qr-menu.webp  | Bin 64580 -> 0 bytes
 .../workspace.webp}                                | Bin 78554 -> 78554 bytes
 test-site/landing/demo/assets/css/site.css         | 193 --------------
 test-site/landing/demo/iletisim/index.php          |   1 -
 test-site/landing/demo/inc/footer.php              |   3 -
 test-site/landing/demo/inc/header.php              |   8 -
 test-site/landing/demo/inc/site.php                |  87 ------
 test-site/landing/demo/index.php                   |  14 -
 test-site/landing/demo/odalar/index.php            |   1 -
 test-site/landing/demo/restoran/index.php          |   1 -
 test-site/landing/demo/yorumlar/index.php          |   1 -
 test-site/landing/duyurular/index.php              |   2 +
 test-site/landing/iletisim/index.php               |   1 +
 test-site/landing/inc/demo-installation.php        |  24 ++
 test-site/landing/inc/footer.php                   |   3 +
 test-site/landing/inc/header.php                   |  10 +
 test-site/landing/inc/site.php                     | 123 +++++++++
 test-site/landing/index.php                        | 226 +---------------
 test-site/landing/kullanim-kilavuzu/index.php      |   2 +
 test-site/landing/kurulum/index.php                |   2 +
 test-site/landing/odalar/index.php                 |   1 +
 test-site/landing/{demo => }/odalar/oda/index.php  |   2 +-
 test-site/landing/{demo => }/qr-menu/index.php     |  10 +-
 test-site/landing/release.json                     |   4 +
 test-site/landing/restoran/index.php               |   1 +
 .../landing/{demo => }/restoran/masa/index.php     |   2 +-
 test-site/landing/scripts/deploy.mjs               | 120 ++++-----
 test-site/landing/yorumlar/index.php               |   1 +
 75 files changed, 1172 insertions(+), 843 deletions(-)
```

## Git status --short

```text
 M apps/desktop-app/db/schema.sql
 M apps/desktop-app/electron/database-types.ts
 M apps/desktop-app/electron/database/sync-runtime-store.ts
 M apps/desktop-app/electron/main.ts
 M apps/desktop-app/electron/setup-service.ts
 M apps/desktop-app/electron/sync-coordinator.ts
 M apps/desktop-app/src/app/settings-draft-model.ts
 M apps/desktop-app/src/app/setup-model.ts
 M apps/desktop-app/src/components/settings/WebSettingsSection.tsx
 A apps/desktop-app/src/components/settings/WebsiteNavigationFields.tsx
 M apps/desktop-app/src/styles/pages/settings.css
 M docs/architecture/DOMAIN_DECISIONS_V1.md
 A docs/dev/D4_1_SHOWCASE_REPORT.md
 M docs/dev/D4_MARKETING_STUDIO_REPORT.md
 M firm-template/web-module/api/sync.php
 A firm-template/web-module/config/website-pages.json
 M firm-template/web-module/duyurular/marketing.js
 M firm-template/web-module/lib/storage.php
 A firm-template/web-module/lib/website-navigation.php
 M packages/shared/index.ts
 A packages/shared/types/website-navigation.ts
 M packages/sync-core/hosting-transport.ts
 M packages/sync-core/index.ts
 M scripts/php-lint.mjs
 M scripts/product-version.mjs
 M scripts/smoke-automatic-sync.mjs
 M scripts/smoke-capability-surface-consistency.mjs
 M scripts/smoke-commerce-online-catalog.mjs
 M scripts/smoke-settings-platform.mjs
 A scripts/smoke-showcase-website.mjs
 M scripts/test-product-version.mjs
 M scripts/verification-registry.mjs
 M test-site/landing/README.md
 A test-site/landing/assets/css/site.css
 D test-site/landing/assets/index-fcReLA3k.css
 D test-site/landing/assets/index-t2kNTUv0.js
 R test-site/landing/demo/assets/js/qr-menu.js -> test-site/landing/assets/js/qr-menu.js
 R test-site/landing/demo/assets/js/rooms.js -> test-site/landing/assets/js/rooms.js
 R test-site/landing/demo/assets/js/site.js -> test-site/landing/assets/js/site.js
 R test-site/landing/demo/assets/js/tables.js -> test-site/landing/assets/js/tables.js
 D test-site/landing/assets/product-guide/android-restaurant.webp
 D test-site/landing/assets/product-guide/android-today.webp
 D test-site/landing/assets/product-guide/desktop-orders.webp
 D test-site/landing/assets/product-guide/desktop-reports.webp
 D test-site/landing/assets/product-guide/desktop-requests.webp
 D test-site/landing/assets/product-guide/desktop-stock.webp
 D test-site/landing/assets/product-guide/web-assistant.webp
 D test-site/landing/assets/product-guide/web-qr-menu.webp
 R test-site/landing/assets/product-guide/desktop-dashboard.webp -> test-site/landing/assets/showcase/workspace.webp
 D test-site/landing/demo/assets/css/site.css
 D test-site/landing/demo/iletisim/index.php
 D test-site/landing/demo/inc/footer.php
 D test-site/landing/demo/inc/header.php
 D test-site/landing/demo/inc/site.php
 D test-site/landing/demo/index.php
 D test-site/landing/demo/odalar/index.php
 D test-site/landing/demo/restoran/index.php
 D test-site/landing/demo/yorumlar/index.php
 A test-site/landing/duyurular/index.php
 A test-site/landing/iletisim/index.php
 A test-site/landing/inc/demo-installation.php
 A test-site/landing/inc/footer.php
 A test-site/landing/inc/header.php
 A test-site/landing/inc/site.php
 M test-site/landing/index.php
 A test-site/landing/kullanim-kilavuzu/index.php
 A test-site/landing/kurulum/index.php
 A test-site/landing/odalar/index.php
 R test-site/landing/demo/odalar/oda/index.php -> test-site/landing/odalar/oda/index.php
 R test-site/landing/demo/qr-menu/index.php -> test-site/landing/qr-menu/index.php
 A test-site/landing/release.json
 A test-site/landing/restoran/index.php
 R test-site/landing/demo/restoran/masa/index.php -> test-site/landing/restoran/masa/index.php
 M test-site/landing/scripts/deploy.mjs
 A test-site/landing/yorumlar/index.php
```
