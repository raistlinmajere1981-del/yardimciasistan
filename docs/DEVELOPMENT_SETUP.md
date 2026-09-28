# Yardımcı Asistan — Geliştirme Kurulumu

Bu proje Linux üzerinde geliştirilecek, Windows uyumluluğu baştan korunacak ve Android companion gerçek telefonda test edilecek şekilde ilerler.

## Ana Çalışma Düzeni

Günlük geliştirme ortamı:

```text
Linux ana sistem
  Web page ve web widget tasarımı
  Firma hosting mini API şablonu
  Local PC masaüstü uygulaması
  Otomatik build, typecheck ve tarayıcı testleri

Android telefon
  Android companion gerçek cihaz testi

Windows ikinci işletim sistemi
  Son masaüstü uygulama testleri
  Paketleme ve kurulum testi
```

## Linux Gereksinimleri

Zorunlu:

```text
Node.js 22 veya üzeri
npm 10 veya üzeri
PHP CLI + PDO_SQLITE (web modülü ve senkron testleri için)
```

Önerilen:

```text
ImageMagick: görselleri WebP'ye çevirmek için
Brave / Chromium / Chrome: Playwright tabanlı web ve widget testleri için
Android Studio + platform-tools: telefonda Android testleri için
JDK 17 veya üzeri: Android build zinciri için
```

Kurulum kontrolü:

```bash
npm run doctor
```

## İlk Kurulum

```bash
npm install
npm run doctor
npm run build
npm test
```

## Görsel Kontrol

Playwright testleri ayrı bir tarayıcı indirmeyi zorunlu tutmaz. Test launcher sırası:

1. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` ile verilen mevcut tarayıcı
2. sistemde kurulu Brave
3. sistemde kurulu Chromium / Chrome
4. varsa daha önce kurulmuş Playwright Chromium

Bu nedenle normal geliştirme kurulumunda `npx playwright install chromium` çalıştırmayın.
Sistemde Chromium tabanlı bir tarayıcı yoksa test açık bir hata ile durur; otomatik browser
indirme yapılmaz.

Playwright ile temel web akışı:

```bash
npm run e2e
```

Ekran görüntüleri `artifacts/screenshots/` altına yazılır. Bu klasör repoya dahil edilmez.

## Firma Hosting Mini API

PHP CLI kuruluysa:

```bash
npm run dev:php-module
```

Adres:

```text
http://127.0.0.1:8080/
```

Mini API endpointleri `firm-template/web-module/api/` altında bulunur. AI anahtarları frontend dosyalarına yazılmamalıdır.
`php -m` çıktısında `PDO` ve `pdo_sqlite` bulunmalıdır; hosting runtime deposu
`data/yardimci-asistan.sqlite` olarak otomatik oluşturulur.

### Talep Çekme Test Mantığı

PC uygulaması ileride mini API'ye şu yönde istek atacaktır:

```text
PC uygulaması → firm-template/web-module/api/sync.php
```

Kullanılan güvenlik anahtarı `firm-template/web-module/config/business.json` içindeki `sync_secret` alanıdır. Bu alan gerçek firma kurulumunda değiştirilmelidir.

`packages/sync-core` şu ilk fonksiyonları sağlar:

```text
pullRequests()
markRequestsSynced()
```

Bu sayede web tarafındaki talep PC'ye çekilir; PC başarılı işledikten sonra talep hosting tarafında `synced` olarak işaretlenebilir.

## Desktop App Tasarım Döngüsü

Linux üzerinde Electron uygulamasını açmak için:

```bash
npm run dev:desktop
```

Bu komut önce ortak paketleri derler, sonra masaüstü uygulamanın Vite renderer sunucusunu ve Electron penceresini başlatır.

Varsayılan web modül adresi:

```text
https://yardimciasistan.alwaysdata.net/yardimci-asistan
```

Normal geliştirme akışında masaüstü bu HTTPS kurulumuyla haberleşir.
Hostingdeki `sync_secret` masaüstü Ayarlar ekranına girilmelidir; bu değer kaynak
koda veya paketlere gömülmez.

Desktop app SQLite şema dosyası:

```text
apps/desktop-app/db/schema.sql
```

Uygulama açılışında SQLite dosyası otomatik oluşturulur. Testlerde gerçek kullanıcı klasörüne yazmamak için `YA_DESKTOP_DATA_DIR` ortam değişkeni kullanılabilir.

İlk açılışta güncel `schema.sql` doğrudan uygulanır. Tarihsel veritabanı upgrade zinciri desteklenmez; temiz kurulum gerçek kullanıcı verisi olmadan başlar ve hazır demo işletme/veri yüklenmez.

Linux'ta Electron pencere açılışını sanal ekranla kontrol etmek için:

```bash
npm run smoke:desktop-renderer
npm run smoke:desktop:linux
```

`smoke:desktop-renderer` QR menü yönetimi, WhatsApp çalışma alanı, web talebi çekme, kurulum ekranı ve ana panel işlemlerini tarayıcı önizlemesiyle kontrol eder. `smoke:desktop:linux` desktop build sonrası local SQLite menü kaydetme smoke testini ve Electron Xvfb pencere açılışını birlikte çalıştırır.

PHP endpoint söz dizimi kontrolü:

```bash
npm run lint:php
```

Hosting'e kopyalanacak web modül klasörünü üretmek ve dosya listesini doğrulamak için:

```bash
npm run pack:web-module
```

Bu komut `artifacts/web-module-deploy/yardimci-asistan/` klasörünü, `manifest.json`
dosyasını ve sistem destekliyorsa yükleme arşivlerini üretir.
Canlı firma değerleri sadece deploy paketine yazılacaksa `YARDIMCI_ASISTAN_DEPLOY_*`
ortam değişkenleri kullanılabilir; kaynak template dosyaları değişmez.

QR menü sayfasını PHP server ve mobil Chromium viewport ile kontrol etmek için:

```bash
npm run smoke:web-module
npm run smoke:automatic-sync
npm run smoke:web-widget-branding
npm run smoke:web-widget-module
```

`smoke:web-module` QR menü yayınını, AI kapalı fallback'ini, yetkili `publish_ai_settings` akışını ve yayınlanan ayarla mock OpenAI uyumlu servise giden model/Authorization bilgisini birlikte kontrol eder. `smoke:automatic-sync` geçici PHP/SQLite hostingi ile masaüstü SQLite'ı birlikte çalıştırarak cursor/ack, Android action, kalıcı outbox, revision ve idempotency akışlarını doğrular. `smoke:web-widget-branding` widget bundle çıktısında logosuz `YA` fallback'ini, `data-logo-url`/`logoUrl` ile görsel marka kullanımını ve bilgi panelindeki AI cevap alanını mock API ile Playwright üzerinden doğrular. `smoke:web-widget-module` ise build edilmiş `firm-template/web-module/widget.js` dosyasını gerçek PHP server'dan yükler; widget rezervasyon formunun `api/request.php` üzerinden hosting SQLite'ında kayıt açtığını, WhatsApp taslak linkini hazırladığını, AI kısa soru formunun `api/chat.php` fallback cevabını gösterdiğini ve `ai-conversations.json` içine kayıt açtığını kontrol eder.

WhatsApp linkleri, manuel kopyalama ve ilerideki resmi API geçişi için ortak mantık `packages/whatsapp-bridge` içindedir. Web widget ve desktop app aynı paketi kullanır; paket testleri Türkiye cep telefonu normalizasyonunu, boş mesaj/telefon hatalarını ve WebView fallback aksiyonunu kontrol eder. Web widget `data-logo-url` ile firma veya Yardımcı Asistan marka sembolünü gösterebilir. Desktop app içinde WhatsApp sayfası WebView alanını, bağlantı durumunu ve manuel kopyalama alternatifini birlikte sunar.

AI endpointini gerçek OpenAI uyumlu provider ile denemek için PHP server açılmadan önce şu ortam değişkenleri verilebilir:

```bash
export YARDIMCI_ASISTAN_AI_ENABLED=1
export YARDIMCI_ASISTAN_AI_BASE_URL=https://api.openai.com/v1
export YARDIMCI_ASISTAN_AI_MODEL=<model-adı>
export YARDIMCI_ASISTAN_AI_API_KEY=<api-anahtarı>
```

Provider bağlantısını PHP veya desktop açmadan hızlı denemek için:

```bash
npm run smoke:ai-live
```

Bu komut aynı ortam değişkenleriyle `packages/ai-core` üzerinden gerçek
`/chat/completions` isteği atar, kısa web sohbet cevabını ve işletme sahibi cevap
taslağını doğrular. Test yalnızca bağlantıyı değil, cevabın Türkçe işletme
bağlamında kalmasını, bağlayıcı rezervasyon/fiyat onayı vermemesini ve desktop
owner taslağının provider JSON cevabından gelmesini de kontrol eder. API anahtarı
dosyaya yazılmamalı, sadece ortam değişkeni olarak verilmelidir.

Desktop uygulamada normal bağlantı kaynağı Ayarlar ekranıdır. Servis, bağlantı adresi,
model, anahtar ve zaman aşımı SQLite + işletim sistemi güvenli saklama alanında tutulur;
anahtar renderer'a geri okunmaz. AI servis profillerinin tek kalıcı kaynağı `ai_service_profiles` tablosudur; eski Settings/env anahtar fallback'i yoktur. AI kapalıyken desktop
güvenli yerel taslak üretir; provider hata dönerse manuel WhatsApp akışı devam eder.

Anahtar frontend dosyalarına yazılmamalıdır.

## Yerel Test Laboratuvarı

Linux üzerinde demo web sitesi ve firma web modülünü birlikte açmak için:

```bash
npm run dev:local
```

Bu komut demo web modülü verisini hazırlar, PHP server'ı başlatır, demo web
sitesini `VITE_YA_WEB_MODULE_URL` ile yerel web modülüne bağlar ve terminalde
desktop/Android testlerinde kullanılacak adresleri yazdırır. Bitirmek için
terminalde Ctrl+C kullanılır.

Kısa doğrulama için:

```bash
npm run smoke:local-lab
```

Bu smoke testi PHP web modülünü ve demo web sitesini kısa süre açar,
`android_summary` endpointini doğrular, sonra sunucuları kapatır ve demo veri
dosyalarını eski haline alır.

Canlı demo modülüyle desktop uygulamayı başlatmak için:

```bash
npm run dev:desktop
```

Farklı bir kurulum deneniyorsa `YA_WEB_MODULE_URL` ve `YA_SYNC_SECRET` ortam
değişkenleriyle açıkça override edilebilir. Yerel PHP laboratuvarı yalnız izole
smoke testleri ve web modülü geliştirmesi için tutulur; uygulama varsayılanı değildir.

Android telefonu hazırlamak için:

```bash
npm run android:phone-test -- --once --hold-ms 12000
```

Demo hosting ve domain kararı firma sunumu aşamasına bırakılmıştır; günlük
geliştirme hattı Linux yerel sunucuları ve adb bağlı Android telefondur.

## Desktop Yerel Yedek

Desktop ana panelindeki `Yedek Al` komutu mevcut SQLite veritabanını uygulama
veri klasörü altındaki `backups/` klasörüne kopyalar. Dosya adı ISO zaman damgası
içerir ve işlem `system.backup_created` event kaydıyla izlenir.

## Windows Uyumluluk Kuralları

Linux'ta geliştirirken şu kurallara dikkat edilecek:

- Dosya yolları kod içinde `/home/...` gibi sabit yazılmayacak.
- Node tarafında yol birleştirmek için `path.join` veya URL tabanlı Vite yolları kullanılacak.
- Desktop app verisi ileride işletim sistemi uygun veri klasöründe tutulacak.
- Electron paketleme `electron-builder` ile hazırlanacak; Linux'ta `npm run smoke:desktop-package`, Windows'ta `npm run pack:desktop:win` kullanılacak.
- SQLite dosya konumu ve yedek klasörü platforma göre çözülecek.
- Manuel SQLite yedeği ana panelden alınacak ve `backups/` altında oluştuğu kontrol edilecek.
- WhatsApp WebView çalışmazsa manuel kopyalama modu devam edecek.

## Android Gerçek Cihaz Testi

Android companion geliştirme başladığında telefon testi için:

```text
Telefonda Geliştirici seçenekleri açılır.
USB hata ayıklama açılır.
Telefon USB ile Linux'a bağlanır.
adb devices komutu ile cihaz görünür.
```

İlk Android hedefi, masaüstü uygulamanın küçük kopyası değil; yeni talepler, PC'den web modülüne yayınlanan bugünkü işler/oda/masa özeti, ara ve WhatsApp'tan yaz akışlarıdır.

Android debug APK üretmek için:

```bash
npm run android:debug
```

APK çıktısı:

```text
apps/android-app/build/outputs/apk/debug/yardimci-asistan-debug.apk
```

USB debugging gerektirmeyen pilot release APK, Play Store AAB, signing ve sürüm
yönetimi için `docs/ANDROID_DISTRIBUTION.md` rehberini kullanın:

```bash
npm run android:release-apk
npm run android:release-aab
```

Gerçek telefonda yerel canlı test için:

```bash
npm run android:phone-test
```

Bu komut demo taleplerini web modülüne yükler, PHP server'ı `0.0.0.0:8080`
üzerinden açar, erişilebilir LAN adreslerini yazdırır ve adb cihazı bağlıysa
APK'yı kurup uygulamayı web modül URL'si ve sync anahtarıyla başlatır. USB
bağlantısında mümkünse `adb reverse` kullanır; bu çalışmazsa telefon ve PC aynı
Wi-Fi ağındayken yazdırılan LAN adresi uygulamadaki `Web modül adresi` alanına
girilir.

Scripti sadece hızlı doğrulamak için:

```bash
npm run android:phone-test -- --once --no-adb --no-build
```

ADB ile uygulamayı açıp sunucuyu kısa süre canlı tutmak için:

```bash
npm run android:phone-test -- --once --hold-ms 12000
```

ADB üzerinden ekran görme ve kontrol:

```bash
npm run android:control -- info
npm run android:screenshot
npm run android:dump
npm run android:control -- tap 360 640
npm run android:control -- swipe 360 1050 360 300 450
npm run android:control -- key back
```

Ekran görüntüleri ve UI dump dosyaları `artifacts/android-control/` altına
yazılır ve git'e eklenmez. Canlı ekran aynalama ve fare/klavye kontrolü için:

```bash
npm run android:mirror
```

Bağlı telefonda kurulum, canlı veri butonu, ekran görüntüsü, UI dump ve talep
listesi görünürlüğünü birlikte doğrulamak için:

```bash
npm run smoke:android-device-ui
```

Web modülü, PC demo veri akışı, desktop UI ve bağlı Android telefonu tek demo
provasında kontrol etmek için:

```bash
npm run smoke:local-demo
```

Telefonsuz hızlı prova gerektiğinde:

```bash
npm run smoke:local-demo -- --skip-android
```

İlk Android build hattı Gradle'a bağlı değildir; kurulu Android SDK içindeki `aapt2`, `d8`, `zipalign` ve `apksigner` araçlarını kullanır. Debug imzası `apps/android-app/.debug/` altında yerel olarak korunur; böylece telefona tekrar kurulumda debug imzası değişmez. Bağlantı kararı için `docs/dev/ANDROID_CONNECTION_PLAN.md` dosyasına bakın.

## Doğrulama Komutları

Günlük hızlı kontrol:

```bash
npm run verify:dev
```

Belirli bir alan üzerinde çalışırken yalnız ilgili domain ve prerequisite'leri çalıştırın:

```bash
npm run verify:domain -- hospitality
npm run verify:domain -- android
npm run verify:domain -- web
```

Tüm portable ürün kontrolü:

```bash
npm run verify:full
```

Merge öncesi tek repository kapısı:

```bash
npm run verify:pre-main
```

Release artifact doğrulamaları için:

```bash
npm run verify:release
```

Runner build/typecheck prerequisite'lerini tek kez çalıştırır ve aynı smoke farklı kapsamlardan seçilse bile tekrar koşturmaz. `npm run verify:list` mevcut preset/domain/kontrol id'lerini gösterir.
