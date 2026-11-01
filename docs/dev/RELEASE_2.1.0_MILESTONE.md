# Yardımcı Asistan 2.1.0 — ortak şablon milestone

- Ürün / PHP web modülü: 2.1.0, Android versionCode: 16.
- Ortak site şablonu: 0.5.0, 67 ortak dosya.
- Teknikel, Gündoğdu, BlackSea canonical kaynakları ve demo mirror eşit.
- Web widget, tek müşteri/bayi hesap alanı, izin temelli yayın, çift siparişten
  korunma, çoklu dil ve yayın kökenli SEO sözleşmeleri tamamlandı.
- 27 Ekim release doğrulaması: 250/251 geniş PASS, Desktop Nexa geometrisi
  için sonrasında iki hedefli PASS; altı önceki kırık da hedefli PASS.
- `pack:release` ve `release:check` ürün sürümü ve Windows x64/x86,
  Companion ve Bayi Android APK imza/metadata/hash kontrollerini geçti.
- Canlı kurulum/uygulama kabulü, hedef web paketleri ve dağıtım doğrulamaları
  ayrıca yapılmalı; yerel build veya Git commit tek başına yayın değildir.
- Legacy site dosyaları, canlı işletme ayarları ve güvenlik anahtarları Git
  üzerinden kurulum otoritesi olarak kullanılmaz.

## 27 Ekim — Canlı site okuma adresi düzeltmesi

Gündoğdu Desktop yayını başarılı olsa da canlı canonical site önce api_origin
boş olduğu, ardından hosting web worker'ı kendi origin'ine zaman aşımına uğradığı
için işletme verilerini gösteremiyordu. Sunucuda business, 3 oda ve 8 masa
yayınlandığı doğrulandı. Site-owned api_origin explicit HTTPS origin,
local_api_root aynı sunucudaki canonical web modülü ve php_cli_binary
standart PHP CLI olarak ayarlandı. Ortak core/api.php public GET allowlist
sahibi değişmedi. Gündoğdu canlı ana sayfa, oda ve restoran artık aynı yayınları
gösteriyor. Teknikel ve market-pilot da aynı site katmanı ayarını aldı.

Yeni Alwaysdata site paketini canlıya taşımadan önce, ilgili stage üzerinde
hazırlık ve kontrol gerekir. Örnek komutlar:

    node scripts/prepare-site-api-transport.mjs --installation gundogdu --root /path/to/site-stage --write
    node scripts/prepare-site-api-transport.mjs --installation gundogdu --root /path/to/site-stage --check

Araç yalnız site-owned yapılandırmasını günceller, web modülüne veya
SQLite kayıtlarına dokunmaz, shared core'u fork etmez. Ayrıca bilinmeyen
kurulum kimliği, farklı domain veya yanlış sunucu kökü uyuşmazlığını reddeder.
market-pilot ve teknikel hedefleri de desteklenir.

## 1 Kasım 2026 — yeni oturum öncesi durum / Android güncelleme hedefi

- Companion kuponlu nakit satış: Samsung J700F ile gerçek 100 TRY → 10 TRY indirim → 90 TRY Finance, stok/kupon tek kullanım ve ACK **PASS** (bkz. `CONTINUATION_BACKLOG_2026-10-29.md` dosyasının son C22 kayıtları). Pilot veritabanı ve iki Android uygulama verisi sonrasında bilinçli olarak sıfırlandı; bu yeni test durumu boş işletmedir.
- Manuel backup/list/restore/delete, reset öncesi otomatik güvenlik yedeği ve şema uyumsuzluğunda onaylı `legacy-data` arşivine geçiş **korunacak**; C23'teki kaldırma denemesi C24'te geri alındı. Güncel uygulamada migration/fallback temizliği yalnız gerçek kullanım dışı kodu hedefler.
- Companion ve Bayi için **uygulama içi Android APK güncelleme V1 eklenecek** (henüz geliştirilmedi). Mevcut Windows manifest/HTTPS download/imza doğrulama altyapısı genişletilecek, imzalı APK sistem kurulumuyla kullanıcı onayına sunulacak; Play/ADB/root gerekmez. Plan: `docs/architecture/ANDROID_IN_APP_UPDATES_V1.md`.
- Yeni session işleri: pre-main hatalarının kapatılması (bu session), Android updater, Bayi Android Phase C gerçek hesap/özel fiyat/sepet/offline E2E, kalan desktop belge/baskı/STT/iade kontrolleri, web/test alanı ve sayfa UX düzeni, Windows kabulü; en son release/commit/deploy. Eski 27 Ekim doğrulama toplamları yeni kaynakların güncel sonucu olarak kullanılmaz.

## 1 Kasım 2026 — C27 kapanışı (pre-main hedefli düzeltmeler)

- `2026-10-31T21-40-11-627Z.json` tam pre-main raporu: 263 PASS / 8 FAIL / 0 SKIP; kaynak ve test fixture düzeltmelerinden sonra **aynı 8 kontrolün hedefli yeniden çalıştırması 8/8 PASS**. Yedi kontrolün yanı sıra Companion points ingress'in C20d–C20p sentetik akışı da PASS; gerçek HTTPS pozitif Puan, cash earn, kupon/ACK, Windows native image regresyonları PASS.
- Güncel registry planı 290 benzersiz kontrol; eklenen 19 smoke ayrı ayrı PASS ama **290'lık yeni tam pre-main topluca tekrar çalıştırılmadı**. Release öncesi kullanıcı tetiklemeli tam doğrulama zorunlu.
- Yeni oturum önceliği: `docs/architecture/ANDROID_IN_APP_UPDATES_V1.md` plana göre **Companion ve Bayi kullanıcı onaylı, imzalı APK güncelleme**, ardından Bayi E2E, desktop/sayfa/web görsel düzeni ve son yayın. Git commit, installer release, canlı deploy yok. Manuel backup/restore ve `legacy-data` arşiv mekanizması korunur. Ayrıntı: `docs/dev/CONTINUATION_BACKLOG_2026-10-29.md` C27.
