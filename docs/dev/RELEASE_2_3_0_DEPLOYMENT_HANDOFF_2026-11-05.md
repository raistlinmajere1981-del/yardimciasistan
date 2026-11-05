# Yardımcı Asistan — 2.3.0 kurulum ve yayın kanıtları

2026-11-05 · Durum: Üç boş test sitesi ve ana demo/indirme sitesi 2.3.0 yayında; dört paket HTTPS/SHA-256 PASS; dört stabil güncelleme manifesti HTTP 200 (2.3.0).

## Sürüm / doğrulama kararı

- Ürün **2.3.0**, web modülü **2.3.0**, Android **versionCode 25**, ortak işletme sitesi şablonu **0.7.0**.
- Son tam `verify:release`: 304/307 PASS, üç başarısız kontrol daha sonra tek tek ve registry üzerinden **PASS**. Kullanıcı tam suite'in yeniden çalıştırılmamasına karar verdi. Resmî raporun 307/307 olmadığını saklama.
- Hedefli sürüm testleri 6/6, şablon/site parity 5/5, dağıtım hazırlığı 7/7, Teknikel 8/8, Gündoğdu 9/9, BlackSea 4/4 PASS.
- Windows installer'lar imzasızdır (Electron Builder signing cert configured değil); Windows SmartScreen uyarısı oluşabilir.

## Yerel paketler

- `dist/desktop/YardimciAsistan-Setup-2.3.0.exe` x64
- `dist/desktop/YardimciAsistan-Setup-2.3.0-x86.exe` x86
- `apps/android-app/build/outputs/apk/release/yardimci-asistan-release.apk`
- `apps/dealer-android-app/build/outputs/apk/release/yardimci-asistan-bayi-release.apk`
- `npm run pack:desktop:windows`, `npm run dealer:android:release-apk`, `npm run build:demo`, `npm run release:check` PASS.
- Tam SHA-256 ve boyutlar `/tmp/ya-230-release-check.log` ve uygulama tarafından oluşturulan release manifestlerindedir.

## Canlı temiz kurulumlar — içerik bağlantısı kullanıcıya devredildi

1. Teknikel `https://yardimciasistantoptanci.alwaysdata.net`, yeni boş site + modül, `2.3.0/0.7.0`. HTTPS sürüm ve `teknikel-site` katalog kimliği PASS. Eski `www` komple `/home/yardimciasistantoptanci/backups/site-clean-before-2.3.0-teknikel-397790` özel yedeğine taşındı. Windows eşleştirme anahtarı yerelde **özel**: `artifacts/clean-site-release-2.3.0/teknikel/private/install-info.txt`.
2. Gündoğdu `https://yardimciasistangunduodu.alwaysdata.net`, yeni boş site + modül, `2.3.0/0.7.0`. HTTPS sürüm ve `gundogdu-site` kimliği PASS. Eski site `/home/yardimciasistangunduodu/backups/site-clean-before-2.3.0-gundogdu-398030`. Özel bağlantı dosyası `artifacts/clean-site-release-2.3.0/gundogdu/private/install-info.txt`.
3. BlackSea `https://blackseapansiyon.com`, temiz Natro `fresh-install` 2.3.0, ortak 0.7.0; HTTPS sürüm, `blacksea-pansiyon` kimliği PASS, korumalı `template-manifest.json` HTTP403. Özel bağlantı bilgileri `../blacksea_web/artifacts/natro/fresh-install/install-info.txt` veya `../blacksea_web/.deploy/yardimci-asistan-install-info.txt`.

BlackSea FTP önceden şifresizdi. Sunucu `pls09.srvpanel.com` TLS1.2 destekliyor, eksik Sectigo R36 ara sertifikası sistem CA ile zincir doğrulanarak `/tmp/ya-230-ftps-trust/ca-chain.pem` hazırlanmış. `blacksea_web/scripts/deploy-natro-ftp.sh` canlı bağlantıda FTPS sertifika doğrulamasını zorunlu kılıyor; `NATRO_VERIFIED_FTPS_HOST=pls09.srvpanel.com NATRO_FTPS_CA_BUNDLE=/tmp/ya-230-ftps-trust/ca-chain.pem` ile şifreli temiz yayın `natro-deploy-ok`. Bu geçici CA dosyası yeniden başlanırsa AIA'dan ve güvenilen root'tan doğrulanarak yeniden oluşturulmalıdır. **Güvenlik anahtarları ve FTP şifreleri Git'e, sohbet yanıtına veya web sayfasına koyulmaz.**

## Ana indirme ve güncelleyici

`https://yardimciasistan.alwaysdata.net`: temiz 2.3.0 web modülü HTTPS sürüm yanıtı PASS. Ana yayın işlemi: `node test-site/landing/scripts/deploy.mjs --yes --with-downloads --fresh-web-module --activate-updates`. Dry-run PASS; ana süreç logu `/tmp/ya-230-landing-deploy.log`, PID 401222 (2026-11-05 03:16 TRT başlangıcı). Windows x64/x86, Android Companion/Bayi: 4/4 HTTPS gerçek download + SHA-256 PASS. Dört stable update feed: 4/4 HTTP 200 + 2.3.0 PASS. Yayın betiği `Yayin tamamlandi.` ile bitti; işlem artık çalışmıyor. 2026-11-05 03:45 TRT bağımsız HTTPS kontrolünde ana modül, üç site modülü ve dört update feed `2.3.0` yanıtı verdi.

## Devam eden kullanıcı adımları

Kullanıcı Windows 2.3.0 kurulumuyla Teknikel, Gündoğdu ve BlackSea'ye ayrı ayrı bağlanıp demo ZIP'i içe aktarır, görünmesini istediği servisleri etkinleştirip yayını ACK ile tamamlar, sonra site bağlantısını kaldırır; ardından fotoğraflara Efekt Atölyesi efektlerini ekleyip kendisi test eder. Asistan bu içerik/servis kabul turunu yapmayacak.

## Git / kalan sınır

Beş ana çalışma ağacında paralel oturumlardan gelen çok sayıda dirty dosya var. Toplu `git add -A` veya reset/clean yok. Kontrollü sürüm commit/push ve demo indirme linklerinin son SHA-256 kontrolü daha sonra yapılmalı. Bu notta yazmayan canlı kabul senaryoları çalıştırılmadı.
