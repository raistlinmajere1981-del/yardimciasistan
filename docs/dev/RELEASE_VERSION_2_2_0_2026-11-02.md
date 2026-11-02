# 2.2.0 sürüm hattı — yayın öncesi eşitleme (2026-11-02)

- Kullanıcı 299/299 `verify:release` PASS bildirdi. `artifacts/verify/latest.json` içinden `selection.preset=release`, `result=passed`, `299 passed` doğrudan doğrulandı. Bu rapor **sürüm artırılmadan önceki kaynaklar içindir**.
- Tek ürün otoritesi `product-version.json`: ürün/Desktop **2.2.0**, web modülü **2.2.0**, ortak Android Companion+Bayi sürüm adı **2.2.0**, `androidVersionCode=23`. Yerinde yükseltme sınırı: test telefonunda Bayi **2.1.6/code22**, Companion **2.1.5/code21** kurulu. Varsayılan `version:set` 16→17 artırdığı için code23, kurulu sürümün üzerine çıkacak biçimde açıkça belirlendi ve `version:sync` ile yayımlanan tüm sürüm metadataları eşitlendi.
- Bağımsız ortak site şablonu **0.6.0**, 68 ortak dosya ve hash'li manifest ile hazırlandı. Sürümden etkilenen kanonik araç/README ve manifest senkronlandı; Demo `test-site/landing/deneme` ortak manifest kopyası 0.6.0. Teknikel'in bağımsız yerel canonical deposu üçlü `update-plan` sonucunda **5 ortak dosyada değişiklik, 0 conflict, 0 site-owned edit** ile 0.6.0'a eşitlendi. Gündoğdu/BlackSea/Market pilotları son deploy kapsamı dışında bırakıldı.
- Targeted gates: `node scripts/product-version.mjs check`, `node web-site-template/tools/manifest.mjs`, `node scripts/sync-demo-template.mjs --check`, `node scripts/test-product-version.mjs`, `node scripts/smoke-web-version.mjs`, `node scripts/test-admin-release-version.mjs`, `node --test scripts/test-release-artifacts.mjs`, `node scripts/smoke-showcase-website.mjs` PASS. `scripts/smoke-web-site-template.mjs` sonuç çıktısına göre ayrıca değerlendirilir.
- **Kaynak sürüm eşitlemesi paketleme değildir**: Eski `dist/desktop/YardimciAsistan-Setup-2.1.0*.exe` dosyaları 27 Ekim'den kalmıştır. Sürüm 2.2.0 çıktılarını yalnız yeniden `pack:release` ürettikten sonra `release:check` / deploy dry-run'a sok. 2.1.0 EXE'leri yeni sürüm diye sunma. `release:check` eski paket üzerinde `resources/native-image/image.win32-x64-msvc.node` kontrolünde başarısız oldu; 2.2.0 paket çıktısından önce beklenen bir sonuçtur.
- Tüm test verileri demo/staging; bu işlemde canlı domainlere yazılmadı, Android APK kurulmadı, Git push yapılmadı. Windows gerçek makine E2E, canlı Teknikel TTL, gerçek bağlantı kesintisi ayrıca açık.

## Paket ve yayın planı doğrulaması

- `npm run pack:release` **PASS**; yeni Windows x64/x86 NSIS, Android Companion ve Bayi kalıcı imzalı APK, web install ve Demo build aynı 2.2.0 sürümüyle üretildi. Bu işlem **canlı deploy yapmaz**.
- `release:check` paket sonunda **PASS** ve yeni dosyaların sürüm/kimlik/native image/manifest/SHA-256 sözleşmeleri doğrulandı:
  - Windows x64 `dist/desktop/YardimciAsistan-Setup-2.2.0.exe` (153396096 bayt)
  - Windows x86 `dist/desktop/YardimciAsistan-Setup-2.2.0-x86.exe` (130607092 bayt)
  - Android Companion `YardimciAsistan-Android-2.2.0.apk` (28102257 bayt)
  - Android Bayi `YardimciAsistan-Bayi-Android-2.2.0.apk` (3353798 bayt)
- Samsung telefondaki kurulu Companion code21 ve Bayi code22 APK'larının sertifika SHA-256 imzaları, yeni code23 release APK sertifikalarıyla **bire bir eşit**. Bu, Android yerinde güncelleme imza ön koşuludur; **gerçek kurulum testi yapılmadı**.
- `npm run deploy:landing -- --with-downloads --fresh-web-module --activate-updates --dry-run` **exit0 / PASS**; dört dosyanın uzak indirme konumları, Demo yayını ve dört Windows/Android stable feed'in 2.2.0 için planı salt okunur doğrulandı. `Dry-run tamamlandi; sunucuda degisiklik yapilmadi.`
- **Windows kod imzalama sertifikası ortamda yapılandırılmamış**; electron-builder EXE için `signing is skipped` uyarısı verdi. Kurucu üretim/byte-hash kontrolü PASS fakat Authenticode imzası yok; Windows SmartScreen/kurumsal uyarılar ayrıca gözlenmeli. Bu sertifika, doğrulanmış Android APK release imzasından farklıdır.
- `node scripts/smoke-web-site-template.mjs` hedefli 0.6.0 şablon testi **PASS**, Demo showcase, ürün sürüm ve web sürüm, Admin release version, release dry-run contract testleri **PASS**.
- Kullanıcının **299/299 `verify:release` PASS** raporu ürün sürümü değişikliğinden **önce** alınmıştı; bu sürüm artırma işleminden sonra 299 kontrol topluca tekrar çalıştırılmadı. Üstteki sürüm/şablon/paket hedefli doğrulamaları başarılıdır. Windows gerçek makine ve yeni sürümlerin canlı OTA kabulü hâlâ açık.
