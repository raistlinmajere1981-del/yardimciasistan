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
```

Önerilen:

```text
PHP CLI: mini API endpointlerini lokal test etmek için
ImageMagick: görselleri WebP'ye çevirmek için
Playwright Chromium: web ve widget ekranlarını otomatik test etmek için
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
npx playwright install chromium
npm run doctor
npm run build
npm test
```

## Demo Web Tasarım Döngüsü

Lokal tarayıcıda:

```bash
npm run dev:demo-web
```

Adres:

```text
http://127.0.0.1:5173/
```

Aynı Wi-Fi ağındaki telefondan veya başka cihazdan bakmak için:

```bash
npm run dev:demo-web:lan
```

Bu komuttan sonra terminalde görünen yerel ağ IP adresi telefonda açılabilir.

## Görsel Kontrol

Playwright ile temel web akışı:

```bash
npm run e2e
```

Masaüstü ve mobil ekran görüntüsü almak için önce demo web sunucusu açık olmalıdır:

```bash
npm run dev:demo-web
npm run screenshots:demo-web
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
http://127.0.0.1:8080
```

Gerçek mini API ile denemek için ayrı terminalde PHP CLI kurulu olmalıdır:

```bash
npm run dev:php-module
```

Desktop app ilk SQLite şema dosyaları:

```text
apps/desktop-app/db/migrations/001_initial_schema.sql
apps/desktop-app/db/seeds/001_demo.sql
```

Uygulama açılışında SQLite dosyası otomatik oluşturulur. Testlerde gerçek kullanıcı klasörüne yazmamak için `YA_DESKTOP_DATA_DIR` ortam değişkeni kullanılabilir.

İlk açılışta migration dosyaları uygulanır, demo seed verileri boş veritabanına eklenir ve ana ekrandaki talep/oda/masa/rezervasyon özetleri local SQLite üzerinden okunur.

Linux'ta Electron pencere açılışını sanal ekranla kontrol etmek için:

```bash
npm run smoke:desktop-renderer
npm run smoke:desktop:linux
```

`smoke:desktop-renderer` QR menü yönetim ekranını tarayıcı önizlemesiyle kontrol eder. `smoke:desktop:linux` desktop build sonrası local SQLite menü kaydetme smoke testini ve Electron Xvfb pencere açılışını birlikte çalıştırır.

PHP endpoint söz dizimi kontrolü:

```bash
npm run lint:php
```

QR menü sayfasını PHP server ve mobil Chromium viewport ile kontrol etmek için:

```bash
npm run smoke:web-module
```

Bu smoke testi QR menü yayınlama akışını ve `api/chat.php` AI fallback cevabını birlikte kontrol eder. AI provider gerçek anahtar olmadan kapalı kalır.

WhatsApp linkleri, manuel kopyalama ve ilerideki resmi API geçişi için ortak mantık `packages/whatsapp-bridge` içindedir. Web widget, demo web ve desktop app aynı paketi kullanır; paket testleri Türkiye cep telefonu normalizasyonunu, boş mesaj/telefon hatalarını ve WebView fallback aksiyonunu kontrol eder. Desktop app içinde WhatsApp sayfası WebView alanını, bağlantı durumunu ve manuel kopyalama alternatifini birlikte sunar.

AI endpointini gerçek OpenAI uyumlu provider ile denemek için PHP server açılmadan önce şu ortam değişkenleri verilebilir:

```bash
export YARDIMCI_ASISTAN_AI_ENABLED=1
export YARDIMCI_ASISTAN_AI_BASE_URL=https://api.openai.com/v1
export YARDIMCI_ASISTAN_AI_MODEL=<model-adı>
export YARDIMCI_ASISTAN_AI_API_KEY=<api-anahtarı>
```

Desktop uygulamada `AI Taslak Yenile` komutu da aynı ortam değişkenlerini okur.
Bu değişkenler verilmeden veya AI ayarı kapalıyken desktop güvenli yerel taslak
üretir; provider hata dönerse manuel WhatsApp akışı devam eder.

Anahtar frontend dosyalarına yazılmamalıdır.

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
npm run build:android
```

APK çıktısı:

```text
apps/android-app/build/outputs/apk/debug/yardimci-asistan-debug.apk
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

İlk Android build hattı Gradle'a bağlı değildir; kurulu Android SDK içindeki `aapt2`, `d8`, `zipalign` ve `apksigner` araçlarını kullanır. Debug imzası `apps/android-app/.debug/` altında yerel olarak korunur; böylece telefona tekrar kurulumda debug imzası değişmez. Bağlantı kararı için `docs/dev/ANDROID_CONNECTION_PLAN.md` dosyasına bakın.

## Tek Komut Kontrol

Geniş kontrol:

```bash
npm run check
```

Bu komut typecheck, unit test, build ve Playwright e2e testlerini çalıştırır.

Linux üzerinde tüm yerel zinciri kontrol etmek için:

```bash
npm run check:linux
```

Bu komut ortam doktoru, PHP lint, web modül QR menü smoke testi, genel kontrol, Android APK build, Android hosting hazırlık smoke testi, desktop renderer smoke testi, desktop menü DB smoke testi ve Electron Xvfb smoke testini birlikte çalıştırır.
