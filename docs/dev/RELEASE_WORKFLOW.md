# Release paketleme ve toplu temiz yayın

Sürüm otoritesi `product-version.json`; Desktop/Companion package metadata'sı,
lock kayıtları, Bayi Gradle sürümü, web modülü ve demo `release.json` bu kaynağa
bağlıdır. Mevcut `version:set`, `version:bump`, `version:web:set` ve Admin Control
Center işlemleri korunur. Web modülü sürümü bağımsız ilerleyebilir.
**Bu belge sürümden bağımsız iş akışını anlatır; 2.0.11/Android 15 tarihsel
örnekleri geçerli sürüm olarak kullanmayın.** Güncel sürümü her zaman
`npm run version:show` / `product-version.json` üzerinden alın.
Yeni wire protocol, migration, backfill veya eski APK imzasına uyumluluk
katmanı yalnız ayrı açık kararla eklenir.

`pack:release`, Windows x64/x86 ve Companion release hattını, Bayi release APK'sını,
mevcut `prepare:web-install --installation ya --no-print-secret` paketini, demo
build'ini ve aynı artifact doğrulamasını kullanır. Hazırlanan web paketinin yeni
anahtarı yalnız ignored install-info ve paket config dosyalarında bulunur; loga
basılmaz. Yeniden `pack:release` çalıştırmak yeni temiz web kurulum anahtarı üretir;
yayınlanacak son paketin bilgileri kullanılmalıdır.

AppImage otomatik bu plana dahil değildir. Mevcut Linux paketleme kodu kalır;
isteğe bağlı `npm run pack:desktop:linux` elle çalıştırılabilir. Kurulum sayfası
AppImage için yalnız “Sonra yayınlanacak” gösterir ve bağlantı üretmez.

## Operatör sırası — fish

Depo kökünde çalıştırın. Bir adım başarısızsa sonraki adıma geçmeyin.

```fish
cd /home/raistlin/YardimciWorkspace/YardimciAsistan
```

1. Entegrasyon kapısı:

   ```fish
   npm run verify:pre-main
   ```

   Başarı: seçilen tüm registry kontrolleri geçer, exit code 0 ve temiz verify raporu.

2. Release ön kontrolü:

   ```fish
   npm run verify:release
   ```

   Başarı: release registry planı geçer. Bu pahalı kapı mevcut artifact prerequisite'lerini
   ve Companion/Bayi release APK görevlerini de çalıştırır; AppImage üretmez.

3. Dağıtılacak paketler:

   ```fish
   npm run pack:release
   ```

   Başarı: iki Windows installer, iki kalıcı imzalı APK, temiz web modülü paketi ve
   iki katmanlı demo build'i oluşur; son `release:check` geçer. Bayi dosyasının
   yayın adı `YardimciAsistan-Bayi-Android-<ürün-sürümü>.apk` olur
   (`product-version.json` esas alınır).

4. Paket doğrulamasını bağımsız tekrarlayın:

   ```fish
   npm run release:check
   ```

   Başarı: canonical sürümler, EXE'nin PE version resource'u, APK iç kimliği/sürümü,
   Gradle metadata'sı, gerçek release imzası, tüm SHA-256/boyutlar, web paketinin
   dosya/arşiv hashleri ve ortak demo şablon bütünlüğü doğrulanır. Eksik veya eski
   dosya başarı sayılmaz; değerler için hata mesajı ve exit code 1 üretilir.

   Windows kontrolü ayrıca her NSIS EXE içindeki mimariye ait 7z payload'undan
   `app.asar` ve native image dosyasını doğrudan okur; eski `win-unpacked` dizinine
   güvenmez. Native dosya, paketleme sırasında indirilen ve lockfile SHA-512 ile
   doğrulanan tarball ile karşılaştırılır. Bu nedenle ignored
   `apps/desktop-app/resources/native-image/` önbelleği kontrol sırasında mevcut
   olmalıdır; eksikse Windows paket hazırlığını yeniden çalıştırın. 7-Zip aracı
   electron-builder toolset'inden sağlanır.

   Windows 2.4 hazırlığında Microsoft Visual C++ Redistributable x64/x86
   kurucuları NSIS içeriğine çevrimdışı eklenir. Dosyalar
   apps/desktop-app/resources/vc-runtime/ altına önceden indirilir ve
   scripts/prepare-desktop-windows-vc-runtime.mjs içindeki sabit SHA-256
   değerleriyle doğrulanır. Yayımlanacak kurucu, Microsoft'un imzalı
   yeniden dağıtım lisans/dağıtım koşullarına uygun paketlenmelidir.
   Kurulum mevcut çalışma zamanını HKLM VC Runtimes kaydından kontrol eder;
   eksikse x64/x86 mimarisine uygun VC_redist dosyasını sessiz çalıştırır.
   Çalışma zamanı kurulamazsa uygulama kurulumunu durdurur. NSIS kurucusunun
   içinden redist paketi de açılarak SHA-256 ve mimari eşitliği doğrulanır.

   Visual C++ kaynak pinleri değişirse önce Microsoft kaynağı ve dosya imzası
   yeniden incelenip SHA-256 değerleri kontrollü olarak güncellenmelidir.
   Kullanıcının Windows makinesindeki runtime'ın gerçekten kurulabildiğini
   ve startup'ta native image modülünü yüklediğini temiz Windows 11
   testiyle kabul edeceğiz.

   Bu statik denetim Windows'ta açılışı kanıtlamaz: yayın öncesi her iki mimariyi
   uygun temiz Windows ortamında kurup uygulama açılışını ve görsel işlemesini elle
   doğrulayın. `--dir` paketi ve Linux üstündeki testler bu kontrolün yerine geçmez.

5. Aynı toplu planın dry-run'ı:

   ```fish
   npm run deploy:landing -- --with-downloads --fresh-web-module --activate-updates --dry-run
   ```

   Başarı: artifact kontrolleri ve hem web modülü hem site için uzak farkların
   salt okunur kontrolü geçer; “Dry-run tamamlandi” ve exit code 0 görülür. Gerçek
   sunucuya SSH okuması/rsync dry-run bağlantısı kurar; hiçbir upload, mv veya
   temizleme işlemi yapmaz.

6. Aynı planın gerçek toplu yayını — yalnız operatör çalıştırır:

   ```fish
   npm run deploy:landing -- --with-downloads --fresh-web-module --activate-updates --yes
   ```

   Başarı: mevcut `deploy-web.sh --fresh --skip-pack` web modülünü temiz kurar;
   tanıtım, `/deneme/`, metadata ve dört indirme dosyası yayınlanır. Son site/API
   ve dosya HTTP+SHA-256 doğrulamaları geçer; ancak ardından Windows feed'leri
   atomik olarak etkinleşir ve doğrulanır. Tamamlanma mesajı ve exit code 0 gerekir.

## Yayın sınırları ve etkinleştirme

Ayrı bir downloads-only modu veya ikinci deploy sistemi yoktur. Mevcut landing
script'i mevcut backend script'ini açık `--fresh-web-module` seçimiyle orkestre eder.
Modül temiz kurulur; eski test runtime/config verileri yeni kurulumda kullanılmaz.
Mevcut backend script'inin yedek/staging ve hata davranışı korunur. Bu çok adımlı
bir yayındır; bütün sunucu kökleri için tek bir transaction veya otomatik toplu
rollback iddiası yoktur. Bir hata sonraki adımları ve feed etkinleştirmesini durdurur.

`--activate-updates` verilmezse mevcut Windows feed'lerine yazılmaz ve onların
kullandığı eski dosyalar temizlenmez. `--activate-updates` seçildiğinde tüm yeni
installer/APK dosyaları uzak SHA-256 ile, ardından HTTP GET üzerinden yeniden
hash'lenir; site/API smoke geçtikten sonra `/updates/stable/win-x64/release.json`
ve `win-x86/release.json` atomik etkinleşir. `release.json`, dört dosya yüklendikten
sonra atomik değiştirilir; yeni site ve yeni metadata aynı toplu plana dahildir.
Eski pilot dosya adı alias'ı veya eski indirme sayfası için fallback bulunmaz.

Yerel, bağlantısız inceleme (paketler hazırsa):

```fish
npm run deploy:landing -- --plan-local --with-downloads --fresh-web-module --activate-updates
```

Bu seçenek aynı planı JSON olarak verir; uzak bağlantı kurmaz. Normal site-only
bakım akışı korunur; `--fresh-web-module` yoksa backend değiştirilmez. BlackSea,
Teknikel ve Gündoğdu bu release planının hedefleri değildir.

## Gereksinimler

Kalıcı Android keystore ve harici ayarları, JDK/SDK Build Tools (`aapt2`,
`apksigner`), Gradle cache/bağımlılıkları ve Windows çapraz paketlemenin Wine/
electron-builder araçları gerekir. Windows installer'a Companion eklemek için
Windows Platform-Tools (`adb.exe`, `AdbWinApi.dll`, `AdbWinUsbApi.dll`) mevcut
staging keşfinde veya `YA_ANDROID_PLATFORM_TOOLS_WIN32` yolunda bulunmalıdır.
Upload için SSH erişimi, scp, rsync ve uzak PHP; web paketi için PHP ve arşiv
araçları gerekir. Anahtar, parola ve sertifika bilgileri loga veya kaynaklara
kopyalanmaz. Test telefonundaki temiz kurulum için Android dağıtım rehberine bakın.

Admin Control Center aynı `pack:release` ve toplu deploy seçeneklerini kullanır;
yeni sürüm hazırlama, canlı ilerleme çıktısı, hata görünümü ve yayın onayı korunur.
