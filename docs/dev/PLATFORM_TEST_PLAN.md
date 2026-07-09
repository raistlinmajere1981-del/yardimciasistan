# Platform Test Planı

Bu plan Yardımcı Asistan'ın Linux'ta rahat geliştirilebilmesi, Android telefonda denenebilmesi ve Windows'ta son testlerinin yapılabilmesi için kullanılır.

## Linux Ana Testleri

- `npm run smoke:local-lab` ile PHP web modülü, demo web bağlantısı ve Android summary endpointi hızlı doğrulanır.
- `npm run dev:local` ile PHP web modülü ve demo web sitesi aynı yerel test oturumunda açık tutulur.
- `npm run smoke:local-demo` ile web modülü, PC demo veri akışı, desktop UI ve bağlı Android cihaz tek demo provasında kontrol edilir.
- Demo web sitesi Vite ile açılır.
- Web widget build edilir ve `firm-template/web-module/widget.js` dosyasına kopyalanır.
- Mini API PHP built-in server ile denenir.
- `sync-core` ile mini API talep çekme akışı test edilir.
- Desktop sync akışında `sync.completed`, `sync.failed`, QR menü yayında `menu.published` ve Android snapshot yayınında sync event kayıtları kontrol edilir.
- QR menü sayfası PHP server üzerinden mobil viewport ile denenir.
- Web AI `chat.php` endpointi AI kapalıyken güvenli fallback cevapla denenir; yeterli müşteri bilgisi geldiğinde `source=web_ai` talebinin `requests.json` içine yazıldığı doğrulanır.
- Web widget gerçek PHP server'dan yüklenir; `data-logo-url` görseli, bilgi paneli AI kısa soru formu, `api/chat.php` fallback cevabı ve `ai-conversations.json` kaydı doğrulanır.
- Desktop app Electron ile Linux üzerinde çalıştırılır.
- Desktop app ana paneli, web talebi çekme butonu ve local-first uyarı metinleri kontrol edilir.
- Desktop app talep kartındaki `AI Taslak Yenile` komutu ve WhatsApp hazır mesaj akışı kontrol edilir.
- Desktop app `Talepler`, `Müşteriler`, `Raporlar`, `Günlük İşler`, `Odalar`, `Masalar` ve `Rezervasyonlar` yan menü ekranları açılır; manuel talep formunun SQLite'a `source=manual` kayıt açtığı, müşteri arama/geçmiş görünümü, basit rapor metrikleri, hızlı durum aksiyonlarının SQLite'a yazdığı, günlük iş tamamlamanın dashboard sayısını güncellediği, rezervasyon tarih/durum filtresinin çalıştığı ve onay sonrası WhatsApp onay taslağının hazırlandığı kontrol edilir.
- Desktop app ana panelindeki `Yedek Al` komutu ile `backups/` altında SQLite yedeği oluştuğu, `Android'e Yayınla` komutu ile web modülüne operasyon snapshot gönderildiği kontrol edilir.
- Desktop app QR menü yönetim ekranında kategori/ürün düzenleme ve local SQLite kaydı kontrol edilir.
- Playwright ile masaüstü ve mobil viewport kontrolleri yapılır.

## Android Telefon Testleri

- İlk aşamada Android app iskeleti telefonda açılır.
- Sonra yeni talepler, PC'den yayınlanan oda/masa/günlük iş özeti ve arama/WhatsApp kısayolları test edilir.
- `npm run android:phone-test` ile demo web modülü LAN'da açılır, demo talepleri yüklenir ve adb cihazı bağlıysa APK kurularak uygulama otomatik başlatılır.
- `npm run android:screenshot`, `npm run android:dump` ve `npm run android:control -- tap <x> <y>` ile ekran durumu ve temel kontrol komutları doğrulanır.
- `npm run smoke:android-device-ui` ile gerçek telefonda canlı veri butonu ve talep listesi akışı otomatik doğrulanır.
- `npm run android:mirror` ile scrcpy canlı ekran aynalama açılır.
- USB bağlantısında `adb reverse`, aynı Wi-Fi ağında ise yazdırılan LAN adresi denenir.
- Hosting üzerinden sınırlı takip modu gerçek firma alan adıyla ayrıca test edilir.

## Windows Son Testleri

- Electron uygulama Windows'ta açılır.
- SQLite veri dosyası doğru kullanıcı klasörüne yazılır.
- Ana panelden manuel SQLite yedeği alınır ve `backups/` klasöründe dosya oluştuğu kontrol edilir.
- WhatsApp WebView ve manuel kopyalama akışı denenir.
- Installer ve ilk kurulum sihirbazı test edilir.
- Web widget ve mini API tarafı Windows'a bağımlı olmamalıdır.

## Her Büyük Değişiklikte Çalışacak Kontroller

```bash
npm run doctor
npm run typecheck
npm test
npm run build
npm run e2e
```

Desktop app için ayrıca:

```bash
npm run dev:desktop
npm run build -w @yardimci-asistan/desktop-app
npm run smoke:desktop-renderer
npm run smoke:desktop-package
npm run smoke:desktop:linux
```

`smoke:desktop-renderer` ana paneldeki `Web Taleplerini Çek` komutunu da sahte preload köprüsüyle dener; boş talep listesinden web talebi çekme, sonuç mesajı ve yeni talep kartının görünmesi doğrulanır.

Web modülü için ayrıca:

```bash
npm run smoke:local-lab
npm run smoke:web-module
npm run smoke:web-widget-branding
npm run smoke:web-widget-module
```

Android gerçek cihaz hazırlığı için:

```bash
npm run smoke:android-hosting
npm run android:phone-test
npm run smoke:android-device-ui
npm run smoke:local-demo
```

Linux tam zincir:

```bash
npm run check:linux
```

PHP CLI kuruluysa ayrıca:

```bash
php -l firm-template/web-module/api/request.php
php -l firm-template/web-module/api/menu.php
php -l firm-template/web-module/api/chat.php
php -l firm-template/web-module/api/sync.php
```

Mini API sync akışı için:

```text
1. request.php ile talep kaydedilir.
2. sync.php action=pull_requests ile talep çekilir.
3. PC işledikten sonra sync.php action=mark_requests_synced çağrılır.
4. Aynı talep tekrar çekilmemelidir.
```

Mini API QR menü yayın akışı için:

```text
1. PC uygulaması local SQLite menü verisini hazırlar.
2. sync.php action=publish_menu ile menü yayınlanır.
3. api/menu.php aktif kategori ve mevcut ürünleri döndürür.
4. menu.html güncel menüyü gösterir.
```

Mini API AI chat akışı için:

```text
1. chat.php POST mesajı alır.
2. knowledge markdown dosyalarını prompt bağlamına ekler.
3. AI kapalıysa güvenli fallback cevap döner.
4. AI açıksa OpenAI uyumlu /chat/completions endpointine sunucu tarafından istek atar.
5. Konuşma ai-conversations.json içine kaydedilir.
6. Ad, geçerli telefon ve talep niyeti varsa source=web_ai talep requests.json içine pending olarak yazılır.
```
