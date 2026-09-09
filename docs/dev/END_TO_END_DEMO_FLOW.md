# İlk Uçtan Uca Demo Akışı

Bu akış Yardımcı Asistan v1 demosunda web sitesi, firma web modülü, PC
uygulaması, WhatsApp hazırlığı ve Android özet ekranını aynı senaryo içinde
göstermek için kullanılır.

## Otomatik Duman Testi

Tam yerel demo provası için:

```bash
npm run smoke:local-demo
```

Bu komut ortam doktoru, yerel web laboratuvarı, web/PC demo veri akışı,
desktop UI smoke testi ve bağlı Android cihaz UI smoke testini sırayla
çalıştırır. Telefonsuz hızlı deneme için `npm run smoke:local-demo -- --skip-android` kullanılabilir.

Sadece headless web/PC veri akışı için:

```bash
npm run smoke:demo-flow
```

`smoke:demo-flow` komutu:

- Web modülünün geçici bir kopyasını oluşturur ve güncel `001_baseline.sql` ile boş hosting SQLite'ı başlatır.
- PHP web modülünü geçici portta çalıştırır.
- `request.php` üzerinden demo sırasında yeni bir `source=web_form` talebi oluşturur.
- Web AI sohbet endpointiyle ek bir `source=web_ai` talep oluşturur.
- Yanlış sync anahtarıyla hata döndüğünü doğrular.
- Doğru anahtarla pending talepleri çeker.
- Talepleri desktop SQLite veritabanına işler.
- Yeni `web_form` ve `web_ai` taleplerinin desktop dashboard ve müşteri listesine işlendiğini doğrular.
- Web tarafında talepleri `synced` olarak işaretler.
- Desktop içinde talep için AI cevap taslağını yeniler.
- İlk talebi desktop tarafında rezervasyona çevirip onaylar.
- Desktop dashboard özetini Android snapshot olarak web modülüne yayınlar.
- Android için `android_summary` endpointinden sınırlı canlı özet, operasyon kartları ve günlük iş listesini alır.
- Android'in `update_request_status` aksiyonuyla talep durumunu güncelleyebildiğini doğrular.
- Aynı taleplerin ikinci kez çekilmediğini doğrular.
- Test sonunda geçici PHP/SQLite web modülünü tamamen kaldırır; kaynak template'e çalışma verisi yazmaz.

Web modülü için ayrı duman testi `npm run smoke:web-module` komutudur. Bu test QR menü yayınını, AI kapalıyken güvenli sohbet cevabını ve yeterli müşteri bilgisiyle `source=web_ai` talep oluşturmayı PHP sunucusu üzerinden doğrular. Widget'ın gerçek web modülünden yüklenip `api/request.php` ve `api/chat.php` akışlarını tarayıcıda kullanması `npm run smoke:web-widget-module` ile doğrulanır.

## Manuel Demo

1. Yerel demo laboratuvarını güncel SQLite ile başlat:

```bash
npm run dev:local
```

2. Web modülünü aç:

```bash
npm run dev:php-module
```

3. Başka terminalde demo web sitesini API bağlantısıyla aç:

```bash
VITE_YA_WEB_MODULE_URL=http://127.0.0.1:8080 npm run dev:demo-web
```

4. PC uygulamasını aç:

```bash
npm run dev:desktop
```

5. Yaklaşık 15 saniye içinde web taleplerinin otomatik geldiğini doğrula; beklemek istemezsen `Şimdi Eşitle` düğmesine bas.

6. Ana panelde `Yedek Al` ile demo öncesi yerel SQLite yedeğini oluştur.

7. PC'deki oda/masa/günlük iş özetinin outbox üzerinden Android'e otomatik yayınlandığını doğrula. `Android'e Yayınla` elle yeniden yayın için kullanılabilir.

8. Gelen talepte `WhatsApp'tan Yaz` ile hazır cevap çalışma alanını aç.

9. Aynı talepte `AI Taslak Yenile` ile işletme sahibi onay sınırını koruyan cevap taslağını yenile.

10. Aynı talepte `Rezervasyona Çevir` butonuyla talebi onaylanmış rezervasyona dönüştür.

11. Android companion ekranında web modül adresini ve sync anahtarını gir. İlk veri
hemen, uygulama açıkken sonraki değişiklikler yaklaşık 15 saniyede otomatik gelir;
`Canlı Veriyi Çek` elle kontrol için kullanılabilir.

Gerçek telefonda bu adımı otomatik hazırlamak için:

```bash
npm run android:phone-test
```

Komut PHP web modülünü LAN'da açık tutar, demo taleplerini yükler ve adb cihazı
bağlıysa Android uygulamasını doğru URL/anahtarla başlatır. Terminalde görünen
LAN adresi adb yokken uygulamaya elle girilebilir.

Smoke akışları geçici SQLite/web modülü kullandığı için kaynak template'te
temizlenecek demo JSON verisi bırakmaz.

## Demo Veri Seti

Web talepleri demo sırasında `api/request.php` ve `api/chat.php` üzerinden
oluşturulur; hosting SQLite'ında tutulur. Android başlangıç snapshot'ı için
`demo-data/android-operations-snapshot.json` kullanılır.

Desktop tarafındaki oda, masa, menü, rezervasyon, günlük iş ve WhatsApp örnekleri
`apps/desktop-app/db/seeds/001_demo.sql` içinde tutulur.

## Canlı Demo Doğrulamaları

- Android uygulamasının hosting hazırlığı `npm run smoke:android-hosting` ile cihazsız, gerçek telefon UI akışı `npm run smoke:android-device-ui` ve tam yerel demo provası `npm run smoke:local-demo` ile adb bağlı cihazda otomatik doğrulanır.
- Gerçek AI provider bağlantısı `npm run smoke:ai-live` ile ortam değişkenlerinden alınan OpenAI uyumlu endpoint üzerinde doğrulanır; test bağlantıyla birlikte Türkçe işletme bağlamı, bağlayıcı olmayan cevap dili ve provider JSON taslağı kalitesini de kontrol eder.
- Gerçek hosting üzerinde demo site, web modülü, PC uygulaması ve Android uygulamasını birlikte doğrulamak için `docs/dev/HOSTING_TEST_PLAN.md` kullanılır. Upload öncesi `npm run pack:hosting-demo` kök demo siteyi ve `/yardimci-asistan` web modülünü tek `public_html/` çıktısında hazırlar.
