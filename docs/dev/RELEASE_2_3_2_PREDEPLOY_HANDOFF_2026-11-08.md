# Yardımcı Asistan 2.3.2 — Deploy Öncesi Devir Notu

**Tarih:** 8 Kasım 2026. **Durum:** Yerel hazırlık büyük ölçüde tamam; Windows EXE paketlemesi engelli, canlı deploy yapılmadı.

## Kaynak ve kabul
- Resmî release doğrulaması: `artifacts/verify/2026-11-08T09-57-12-806Z.json` — **314/314 PASS, 0 FAIL, 0 SKIP** (sürüm metadata değişiminden önce).
- Sürüm otoritesi: ürün **2.3.2**, web modülü **2.3.2**, Android **versionCode 27**. Sürüm metadata commit'i `b127f7ce`; 11/11 sözleşme testi ve `version:check` PASS.
- Git: Yardımcı Asistan `main` içinde altı yerel commit henüz push edilmedi. Teknikel `a3e9414` (origin'den ileride 1), BlackSea `db2e292` (önceden var olanlar dahil ileride 4), Gündoğdu `2bed392` (temiz). Yeniden kontrol etmeden bu sayıları kesin kabul etme.
- Paralel oturumlara ait dirty dosyalar: Admin/BirDeSenGör servisleri ve testleri, `scripts/lib/demo-deployment.mjs`, demo üst katman site dosyaları; BlackSea `scripts/prepare-natro-release.sh`. **Toplu add/commit/reset yapma.** İşlerin sahibiyle tamamlanma durumunu kontrol et.

## Tamamlanmış yerel hazırlık
- A/B/C/D 2.3.2 demo ZIP paketleri yeniden üretildi ve 4/4 SHA/SQLite/secret/read-path PASS. A/B/C `test-site/landing/downloads/` altına yeni sürüm isimleriyle `stage-demo-packages --stage` üzerinden alındı. Download kart kontrolü 1/1 PASS.
- Gündoğdu `bash scripts/check.sh` PASS. BlackSea `bash scripts/check.sh` ve `prepare-natro-release.sh update --dry-run` PASS; BlackSea site-only staging: `../blacksea_web/artifacts/natro/site-update` (141 site dosyası, API değil). Teknikel `bash scripts/deploy-site.sh --dry-run` PASS; aktif site ortak şablon parity 5/5 PASS.
- Gündoğdu ve Tekel Market pilotu `npm run deploy:* -- --dry-run` ile uzak SSH salt okunur ön kontrol PASS. Bu kontroller sunucuda yazma işlemi yapmadı.
- Beş canlı kurulumun `api/version.php` yanıtı kontrol edildi: ana demo, Gündoğdu, Teknikel, Tekel Market pilotu, BlackSea — tamamı hâlen 2.3.1.
- Android Companion release APK **2.3.2 / versionCode 27**, imza doğrulandı, SHA-256: `a701e1ef8f5965f72ffd344b14f33a7f1c2e2fbae5ab809413e232e68e5ff87c`.
- Android Bayi release APK **2.3.2 / versionCode 27**, imza doğrulandı, SHA-256: `aef3ae5e7549f1f64f863bc9fd81dd83140ea126cc0503e00c0bba78a19a3f88`.
- Ana 2.3.2 web modülü `prepare:web-install --installation ya --no-print-secret` ile hazır; `validatePreparedWebModule` PASS, **116 dosya**, versiyon/manifest/hash ve kurulum secret kontrolü PASS. Özel install-info loglara veya Git'e taşınmadı.
- `npm run build:demo` PASS.

## Kalan release engeli
- `npm run pack:release` Windows x64 `electron-builder` (Electron 44.7.0) adımında `downloaded progress=100%` sonrasında ilerlemedi. x64 EXE dosyası üretilmeden paketleyici kontrollü sonlandırıldı. Log: `/tmp/ya-232-pack-release-20261108.log`.
- Bu yüzden **2.3.2 Windows x64/x86 EXE henüz yok**; `release:check` ve 2.3.2 için bütünleşik dağıtım doğrulaması **başarılı kabul edilemez**. Devam oturumunda önce `npm run pack:desktop:windows` (gerekirse x64/x86 ayrı) ve sonra `npm run release:check` çalıştır. Yeni bir `pack:release` ana kurulum paketinin özel anahtarını yeniden üretebilir; gerektiğinde son paket üzerindeki install-info'yu esas al.
- Windows gerçek makinede x64/x86 kurulum kabulü ve ZIP import/restore #87 fiziksel Windows testi hâlâ ayrı bir manuel kabul.
- BlackSea'de QR masa siparişi gerçek kabul/operatör onayı akışıyla hazırlandı; masa rezervasyonu mevcut `restaurant_reservation` **talep** akışından geçer. Otomatik doluluk/slot rezervasyon motoru olarak sunma.

## Sonraki oturum: dağıtım kapısı ve sıra
1. Paralel oturumların değişikliklerinin tamamlandığını ve Git durumlarının sabitlendiğini kontrol et. Windows kurulumlarını üret, statik EXE/native/Android/web `npm run release:check` ile doğrula.
2. Ana demoda son landing kaynakları için hedefli smoke ve indirme SHA karşılaştırması yap. `npm run deploy:landing -- --with-downloads --fresh-web-module --activate-updates --dry-run` ile **önce** salt okunur uzak farkları incele.
3. Teknikel, Gündoğdu ve Market Pilot web modüllerini **veri koruyan update** ile; gerekiyorsa site ön yüzlerini ayrıca güncelle. BlackSea için `prepare-natro-release.sh update` + doğrulanmış FTPS yayın yolu kullan; **fresh-install kullanma**, `config/business.json` ve `data/` korunmalı.
4. Ana demo/indirme site yayınını, Windows ve Android stable güncelleme manifestlerini bütün paketler hazır ve HTTP/SSH smoke temiz olunca etkinleştir. 5 web modülü version.php, site fonksiyonları, 4 dağıtım dosyası HTTPS+SHA-256 ve 4 update feed'i kontrol et.
5. Yalnız ilgili sahibin commit'lerini seçerek push et; diğer paralel çalışmaların dirty dosyalarını commit'e katma.

**Bu not yayın onayı değildir.** Bu turda upload, canlı güncelleme, Git push veya sunucu temizliği yapılmadı.
