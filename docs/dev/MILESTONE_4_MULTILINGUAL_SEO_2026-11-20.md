# Aşama 4 — Çok Dilli SEO Yönetimi

Yerel geliştirme: 20 Kasım 2026. Full regresyon, canlı test, Windows kurulum kabulü
ve toplu deploy sonraki ortak kabul turuna bırakıldı.

## Kaynak ve sahiplik

- Tek yayın dili otoritesi: public_translation_settings (Dil Yönetimi). Kaynak TR;
  Dil Yönetimi kapalıyken yalnız TR. SEO Yönetimi farklı dil listesi saklamaz.
- Sabit site sayfaları için Türkçe SEO metni: seo_page_sources. Başlık,
  açıklama, Open Graph başlığı ve açıklaması. Özel oda/masa detayları başlıklarını
  kendi yayınlanan varlık kaydından alır, kategori/listesi başlığını kopyalamaz.
- Diğer diller: mevcut public_translation_sources/view ve public_translations
  tablosunda seo türü. Kaynak hash'i değişince stale çeviri yayına taşınmaz.
  Manuel çevirinin önceliği ve AI overwrite koruması ortaktır.
- AI SEO önerisi configured desktop metin modelinden gelir. Kaynak dildeki
  onaylı bilgiler ve işletme profilinden başka iddia uydurmamaya yönlendirilir.
  Taslak ekranda gösterilir, otomatik kaydedilmez. Kullanıcı taslağa uygular ve
  ayrıca Kaydet derse manuel metin olur.
- Yayın: aynı business_context_publish durable outbox → sync-core transport →
  web-module sanitizer → approved business publication → web-site-template
  projection. İkinci yayın kuyruğu veya webde çift veritabanı yok.
- Canonical ve hreflang kaynağı: site-owned public_origin, mevcut page registry
  ve yayınlanmış aktif diller. İçerik/girdi üzerinden harici canonical alınmaz.
- Web head: title, meta description, canonical, hreflang, Open Graph ve Twitter.
  Geçerli galeri görseli varsa sosyal resim olarak kullanılır.
- sitemap.xml xhtml:link dil alternatifleri taşır. Account, iç sayfalar,
  QR/table/room bearer token içeren sayfalar noindex durumunu korur.
- BlackSea özel layout: aynı SEO projection ve hreflang, mevcut Turkish home
  root canonical ve site-owned OG hero fallback korunur.

## Kod ve UI

- Ayarlar → Web bağlantısı → SEO Yönetimi; aynı modal/kaydet/vazgeç standardı.
- Sayfa ve dil seçici; kaynak metin/satır, kaynak-dil çeviri durumları,
  AI önerisi önizlemesi, kaynak değişti uyarısı.
- SEO değişikliği mevcut otomatik çeviri reconciling ve web publish kuyruğunu
  tetikler; deaktif dil yayında artık alternatif olarak çıkmaz.
- Güncel şemaya doğrudan eklenmiştir; tarihsel migration/backfill gerekmiyor
  (test ortamları disposable).

## Hedefli doğrulama

- scripts/test-seo-publication.mjs: aktif dil, kaynak doğrulama ve optimistik
  kayıt, manuel vs AI önceliği, stale yayın koruması (iki test).
- scripts/test-seo-head.php: doğru dilin title/meta/OG alanları, fallback,
  canonical/hreflang, x-default, QR noindex ve XML sitemap.
- Desktop TypeScript, hedefli ESLint, PHP lint, Git diff --check.
- Önceki aşamanın yedi hedefli masa rezervasyonu ve oda QR testi ayrıca
  çalıştırıldı; bu testler full/release verify yerine geçmez.

## Son kabul turunda

Yüklenen gerçek web modülüyle business_context push/ACK ve SEO localization
roundtrip; tam sayfa/site dil URL kontrolleri; BlackSea, Gündoğdu, Teknikel
ve demo şablonlarını güncelleme; tarayıcı DOM/OG/x-default ve arama motoru
indeksleme kontrolleri, full verify ve toplu canlı testler. Windows kurulum
kabulünü kullanıcı Windows üzerinde yapacak. Bu aşamada commit/push/deploy yok.
