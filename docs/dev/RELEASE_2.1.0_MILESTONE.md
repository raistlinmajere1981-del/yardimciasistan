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
