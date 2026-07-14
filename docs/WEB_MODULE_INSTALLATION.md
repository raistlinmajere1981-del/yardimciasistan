# Firma Web Modülü Kurulumu

Bu rehber, mevcut bir web sitesine Yardımcı Asistan web modülünü eklemek içindir. Modül PHP destekli standart hostinglerde çalışır ve merkezi cloud servisine ihtiyaç duymaz.

## 1. Kopyalanacak Dosyalar

Hosting panelinde sitenin herkese açık klasörünü bulun. Bu klasör çoğu hostingde `public_html`, `www` veya site alan adıyla aynı isimde olur.

Önerilen kurulum:

```text
public_html/
  yardimci-asistan/
    widget.js
    menu.html
    assets/
      yardimci-asistan-symbol.png
    api/
    config/
    data/
    knowledge/
```

Kopyalanacak kaynak klasör:

```text
firm-template/web-module/
```

Bu klasörün içeriğini hostingdeki `yardimci-asistan/` klasörüne kopyalayın.
Yükleme öncesi doğrulanmış bir kopya üretmek için:

```bash
npm run pack:web-module
```

Bu komut `packages/web-widget` çıktısını günceller, web modül dosyalarını kontrol eder ve hosting paneline yüklenebilecek klasörü şurada hazırlar:

```text
artifacts/web-module-deploy/yardimci-asistan/
```

Yanındaki `artifacts/web-module-deploy/manifest.json` dosyası paketlenen dosyaların boyut, SHA-256 özetlerini, canlı kurulum uyarılarını ve üretilen arşivleri içerir. Komut her zaman `yardimci-asistan.tar.gz` üretmeye çalışır; sistemde `zip` komutu varsa ayrıca `yardimci-asistan.zip` oluşturur.

Hosting panelinde arşiv çıkarma desteği varsa `yardimci-asistan.zip` veya `yardimci-asistan.tar.gz` dosyasını yükleyip açabilirsiniz. Destek yoksa `yardimci-asistan/` klasörünün içeriğini FTP veya dosya yöneticisiyle kopyalayın.

Kaynak template dosyasını değiştirmeden, sadece üretilecek deploy paketindeki `config/business.json` değerlerini doldurmak için şu ortam değişkenleri kullanılabilir:

```bash
YARDIMCI_ASISTAN_DEPLOY_DISPLAY_NAME="Firma Adı" \
YARDIMCI_ASISTAN_DEPLOY_WHATSAPP="+90 532 123 45 67" \
YARDIMCI_ASISTAN_DEPLOY_PHONE="+90 532 123 45 67" \
YARDIMCI_ASISTAN_DEPLOY_WEBSITE="https://firma.com" \
YARDIMCI_ASISTAN_DEPLOY_ALLOWED_ORIGINS="https://firma.com" \
YARDIMCI_ASISTAN_DEPLOY_SYNC_SECRET="uzun-ve-tahmin-edilemeyen-bir-anahtar" \
npm run pack:web-module
```

Desteklenen ek alanlar: `YARDIMCI_ASISTAN_DEPLOY_EMAIL`, `YARDIMCI_ASISTAN_DEPLOY_ADDRESS`, `YARDIMCI_ASISTAN_DEPLOY_PRIMARY_COLOR`, `YARDIMCI_ASISTAN_DEPLOY_ACCENT_COLOR`. Bu değerler sadece `artifacts/web-module-deploy/yardimci-asistan/config/business.json` içine yazılır; repo içindeki kaynak template değişmez. Hâssas `sync_secret` değerini commit etmeyin.

## 2. Config Ayarları

Ana firma ayarı:

```text
yardimci-asistan/config/business.json
```

Değiştirilecek temel alanlar:

```json
{
  "display_name": "Firma Adı",
  "phone": "+90 5xx xxx xx xx",
  "whatsapp": "+90 5xx xxx xx xx",
  "email": "info@firma.com",
  "website": "https://firma.com",
  "address": "Firma adresi",
  "primary_color": "#2F6F5E",
  "accent_color": "#E47863",
  "sync_secret": "uzun-ve-tahmin-edilemeyen-bir-anahtar",
  "allowed_origins": [
    "https://firma.com"
  ]
}
```

`sync_secret` değerini kurulumda mutlaka değiştirin. Bu anahtar PC uygulamasının hostingdeki talepleri çekmesi ve QR menüyü yayınlaması için kullanılır.

`allowed_origins` içine sitenin gerçek alan adını yazın. Geliştirme sırasında `http://localhost:5173` ve `http://127.0.0.1:5173` kalabilir; canlı kurulumda gerekli değilse kaldırın.

## 3. WhatsApp Numarası

WhatsApp numarası `business.json` içindeki `whatsapp` alanından okunur.

Desteklenen örnekler:

```text
+90 532 123 45 67
0532 123 45 67
905321234567
```

Türkiye cep telefonu formatı kullanın. Sabit hatlar WhatsApp linki için uygun değildir.

## 4. Widget Ekleme

Müşteri talep formu ve hızlı WhatsApp butonu için `widget.js` dosyası siteye eklenir.
`data-api-base-url` verildiğinde widget bilgi panelindeki kısa soru alanı da
`api/chat.php` üzerinden güvenli AI cevabı gösterebilir.

### Düz HTML Site

Sitenin `</body>` kapanış etiketinden hemen önce ekleyin:

```html
<script
  src="/yardimci-asistan/widget.js"
  data-business-name="Firma Adı"
  data-whatsapp-phone="+90 532 123 45 67"
  data-api-base-url="/yardimci-asistan"
  data-menu-url="/yardimci-asistan/menu.html"
  data-logo-url="/yardimci-asistan/assets/yardimci-asistan-symbol.png"
  data-primary-color="#2F6F5E"
  data-accent-color="#E47863"
></script>
<script>
  window.YardimciAsistanWidget?.init();
</script>
```

Site farklı bir alt klasörde çalışıyorsa `src`, `data-api-base-url`, `data-menu-url` ve `data-logo-url` yollarını tam URL olarak yazabilirsiniz:

```text
https://firma.com/yardimci-asistan/widget.js
https://firma.com/yardimci-asistan
https://firma.com/yardimci-asistan/menu.html
https://firma.com/yardimci-asistan/assets/yardimci-asistan-symbol.png
```

### WordPress Site

En güvenli yöntem WordPress yönetim panelinde tema ayarları veya bir "header/footer script" alanı kullanmaktır.

1. WordPress panelinde tema veya script ekleme alanını açın.
2. Yukarıdaki HTML kodunu footer bölümüne ekleyin.
3. Cache eklentisi varsa cache temizleyin.
4. Siteyi gizli pencerede açıp sağ altta Yardımcı Asistan butonunu kontrol edin.

Tema dosyasından eklemek gerekiyorsa kod `footer.php` içinde `</body>` öncesine konur. Tema güncellemelerinde kaybolmaması için child theme kullanın.

## 5. QR Menü Linki

Müşteriye açık QR menü sayfası:

```text
https://firma.com/yardimci-asistan/menu.html
```

QR kod bu adrese üretilebilir. Menü verisi `api/menu.php` üzerinden okunur; PC uygulamasından yayınlanan menü `data/menu.json` dosyasına yazılır. Android companion için PC uygulamasından yayınlanan oda/masa/günlük iş özeti `data/android-snapshot.json` dosyasında tutulur ve `api/sync.php` içindeki `android_summary` aksiyonuyla okunur.

## 6. AI Ayarları

AI varsayılan olarak kapalıdır. Kapalıyken `api/chat.php` güvenli fallback cevap döndürür. Endpoint AI sorunlarını `ai_disabled`, `configuration_incomplete`, `provider_authentication_failed`, `provider_model_or_endpoint_not_found`, `provider_rate_limited`, `provider_timeout`, `provider_connection_failed` ve `provider_unavailable` gibi güvenli hata kodlarıyla ayırır. Widget açıklamayı, varsa sağlayıcı HTTP durumunu ve yeniden deneme bilgisini gösterir; API anahtarı ve ham sağlayıcı cevabı frontend'e gönderilmez.

`api/chat.php`, sohbet yanıtını üretirken konuşmayı `data/ai-conversations.json` içine kaydeder. İstek gövdesinde veya mesaj içinde talep niyeti bulunduğunda ve `customer_name` ile geçerli Türkiye cep telefonu geldiğinde ayrıca `data/requests.json` içine `source=web_ai`, `sync_status=pending` olan müşteri talebi açar. Tarih, saat ve kişi sayısı varsa kayda eklenir; eksik bilgiler işletme sahibi tarafından konuşmada tamamlanabilir.

AI anahtarı frontend dosyalarına veya `widget.js` içine yazılmamalıdır. Ana kullanım yolu masaüstü uygulamasındaki `Ayarlar → AI Bağlantısı` alanıdır:

1. Kullanılacak servisi seçin veya özel OpenAI uyumlu bağlantı adresini girin.
2. Model adını, gizli erişim anahtarını ve yanıt bekleme süresini girin.
3. `Bağlantıyı Dene` ile masaüstü bağlantısını kontrol edin.
4. Ayarları kaydedin. Uygulama aynı ayarı web modülüne otomatik uygular.

Canlı web modül adresi HTTPS olmalıdır. HTTP üzerinden gizli anahtar yayını yalnız yerel geliştirmede `localhost`, `127.0.0.1` veya `::1` için kabul edilir. Web yayını başarısız olursa masaüstü ayarı kaybolmaz; Ayarlar ekranında hata gösterilir ve kaydetme tekrar denenebilir.

Başarılı yayından sonra hostingde şu ignored runtime dosyası oluşur:

```text
yardimci-asistan/data/ai-settings.local.php
```

Dosya `0600` izinle oluşturulur, API anahtarı hiçbir sync cevabında dönmez ve paketleme sırasında deploy arşivine alınmaz. `data/` klasörü PHP tarafından yazılabilir olmalıdır.

Eski kurulumlar ve geliştirme ortamı için ortam değişkenleri fallback olarak desteklenir:

```bash
YARDIMCI_ASISTAN_AI_ENABLED=1
YARDIMCI_ASISTAN_AI_BASE_URL=https://api.openai.com/v1
YARDIMCI_ASISTAN_AI_MODEL=<model-adı>
YARDIMCI_ASISTAN_AI_API_KEY=<api-anahtarı>
```

Varsa `config/ai.local.php` da fallback olarak okunur. Masaüstünden başarıyla yayınlanan runtime ayarı bunların üzerinde önceliğe sahiptir. Masaüstü yönetimine geçerken eski anahtarı frontend dosyalarından mutlaka kaldırın.

AI bilgi dosyaları:

```text
knowledge/firma.md
knowledge/odalar.md
knowledge/restoran.md
knowledge/menu.md
knowledge/sik-sorulan-sorular.md
```

Bu dosyalara kesin müsaitlik veya değişken fiyat gibi bağlayıcı bilgiler yazmayın; işletmenin kontrol edeceği bilgileri yazın.

## 7. Dosya İzinleri

Önerilen başlangıç izinleri:

```text
api/*.php: 644
config/*.json ve config/*.php: 644
knowledge/*.md: 644
data/ klasörü: 755
data/*.json: 664
data/ai-settings.local.php: uygulama tarafından 600
```

Bazı paylaşımlı hostinglerde PHP'nin `data/*.json` dosyalarına yazabilmesi için `data/` klasörü `775`, JSON dosyaları `666` gerekebilir. Daha geniş izin gerekiyorsa yalnızca `data/` klasöründe kullanın; `config/` klasörünü yazılabilir yapmayın.

Apache hostinglerde `config/`, `data/` ve `knowledge/` klasörlerinde gelen `.htaccess` dosyaları doğrudan tarayıcı erişimini kapatır. Nginx veya özel panel kullanılan hostinglerde aynı engelleme sunucu ayarından yapılmalıdır.

## 8. Hızlı Test

Kurulumdan sonra şu adresleri kontrol edin:

```text
https://firma.com/yardimci-asistan/menu.html
https://firma.com/yardimci-asistan/api/menu.php
```

Talep formunu test etmek için sitedeki Yardımcı Asistan widget'ını açın ve örnek talep gönderin. Başarılıysa:

```text
yardimci-asistan/data/requests.json
```

dosyasında yeni kayıt oluşur.

## 9. PC Uygulamasıyla Eşleştirme

PC uygulamasında kullanılacak iki bilgi:

```text
Web modül adresi: https://firma.com/yardimci-asistan
Sync güvenlik anahtarı: business.json içindeki sync_secret
```

Canlı kurulumda `sync_secret` değerini kimseyle paylaşmayın. Anahtar sızarsa `business.json` içinde değiştirip PC uygulamasında yeni değeri kullanın.

## 10. Sık Hatalar

Widget görünmüyor:

- `widget.js` yolu yanlış olabilir.
- Cache eklentisi eski sayfayı gösteriyor olabilir.
- `window.YardimciAsistanWidget.init()` çağrısı eklenmemiş olabilir.

Talep kaydedilmiyor:

- `data/requests.json` yazılabilir olmayabilir.
- `data/` klasör izni hosting kullanıcısı için yetersiz olabilir.
- `data-api-base-url` yanlış olabilir.

AI cevap vermiyor:

- AI varsayılan olarak kapalıdır.
- Masaüstü Ayarlar ekranında AI bağlantısının açık, modelin ve anahtarın kayıtlı olduğunu kontrol edin.
- Web'e uygulama başarısızsa web modül adresinin HTTPS olduğunu, `sync_secret` değerini ve `data/` yazma iznini kontrol edin.
- Eski web modülü `publish_ai_settings` aksiyonunu tanımayabilir; güncel web modül paketini yükleyin.
- API anahtarı frontend dosyasına yazılmışsa kaldırılmalıdır.

AI sohbetinden talep oluşmuyor:

- `customer_name` ve Türkiye cep telefonu formatında `customer_phone` gönderildiğini kontrol edin.
- Mesajda rezervasyon, oda, masa, kahvaltı, fiyat veya benzeri açık talep niyeti bulunmalı ya da `create_request=true` gönderilmelidir.
- `data/requests.json` ve `data/ai-conversations.json` dosyaları hosting kullanıcısı tarafından yazılabilir olmalıdır.
