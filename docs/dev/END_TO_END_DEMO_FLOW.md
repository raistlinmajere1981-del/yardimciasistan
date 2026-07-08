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

- `demo-data/web-module-requests.json` içindeki örnek talepleri web modülüne yükler.
- PHP web modülünü geçici portta çalıştırır.
- Web AI sohbet endpointiyle ek bir `source=web_ai` talep oluşturur.
- Yanlış sync anahtarıyla hata döndüğünü doğrular.
- Doğru anahtarla pending talepleri çeker.
- Talepleri desktop SQLite veritabanına işler.
- Web tarafında talepleri `synced` olarak işaretler.
- Desktop içinde talep için AI cevap taslağını yeniler.
- İlk talebi desktop tarafında rezervasyona çevirip onaylar.
- Desktop dashboard özetini Android snapshot olarak web modülüne yayınlar.
- Android için `android_summary` endpointinden sınırlı canlı özet, operasyon kartları ve günlük iş listesini alır.
- Android'in `update_request_status` aksiyonuyla talep durumunu güncelleyebildiğini doğrular.
- Aynı taleplerin ikinci kez çekilmediğini doğrular.
- Test sonunda `requests.json`, `ai-conversations.json`, `android-snapshot.json` ve `sync-state.json` dosyalarını eski haline getirir.

Web modülü için ayrı duman testi `npm run smoke:web-module` komutudur. Bu test QR menü yayınını, AI kapalıyken güvenli sohbet cevabını ve yeterli müşteri bilgisiyle `source=web_ai` talep oluşturmayı PHP sunucusu üzerinden doğrular.

## Manuel Demo

1. Web modülünü aç:

```bash
npm run dev:php-module
```

2. Başka terminalde demo web sitesini API bağlantısıyla aç:

```bash
VITE_YA_WEB_MODULE_URL=http://127.0.0.1:8080 npm run dev:demo-web
```

3. Demo verisini web modülüne yükle:

```bash
npm run demo:data:apply
```

4. PC uygulamasını aç:

```bash
npm run dev:desktop
```

5. PC uygulamasında `Web Taleplerini Çek` butonuna bas.

6. Ana panelde `Yedek Al` ile demo öncesi yerel SQLite yedeğini oluştur.

7. Ana panelde `Android'e Yayınla` ile PC'deki oda/masa/günlük iş özetini web modülüne gönder.

8. Gelen talepte `WhatsApp'tan Yaz` ile hazır cevap çalışma alanını aç.

9. Aynı talepte `AI Taslak Yenile` ile işletme sahibi onay sınırını koruyan cevap taslağını yenile.

10. Aynı talepte `Rezervasyona Çevir` butonuyla talebi onaylanmış rezervasyona dönüştür.

11. Android companion ekranında web modül adresini ve sync anahtarını girip
`Canlı Veriyi Çek` butonuyla aynı demo talep listesini, operasyon kartlarını,
günlük işleri ve hızlı arama/WhatsApp aksiyonlarını göster.

Gerçek telefonda bu adımı otomatik hazırlamak için:

```bash
npm run android:phone-test
```

Komut PHP web modülünü LAN'da açık tutar, demo taleplerini yükler ve adb cihazı
bağlıysa Android uygulamasını doğru URL/anahtarla başlatır. Terminalde görünen
LAN adresi adb yokken uygulamaya elle girilebilir.

Demo sonunda template verisini temizlemek için:

```bash
npm run demo:data:clear
```

## Demo Veri Seti

Web modülü için örnek talep kaynağı:

```text
demo-data/web-module-requests.json
```

Bu dosya pansiyon rezervasyonu, masa rezervasyonu ve kahvaltı talebini birlikte
gösterir. Kayıtlar gerçek kişi bilgisi içermez.

Desktop tarafındaki oda, masa, menü, rezervasyon, günlük iş ve WhatsApp örnekleri
`apps/desktop-app/db/seeds/001_demo.sql` içinde tutulur.

## Kalan Canlı Demo Genişletmeleri

- Android uygulamasının hosting hazırlığı `npm run smoke:android-hosting` ile cihazsız doğrulanır; gerçek telefonda canlı web modül testi `npm run android:phone-test` ile hazırlanır ve cihaz üzerinde ekran/ağ davranışı manuel doğrulanır.
- Gerçek AI provider bağlantısı `npm run smoke:ai-live` ile ortam değişkenlerinden alınan OpenAI uyumlu endpoint üzerinde denenir.
