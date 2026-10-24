# Firma Web Modülü Kurulumu

Bu rehber, mevcut bir web sitesine Yardımcı Asistan web modülünü eklemek içindir. Modül PHP, PDO ve `pdo_sqlite` destekli standart hostinglerde çalışır ve merkezi cloud servisine ihtiyaç duymaz.

Hosting panelinde PHP SQLite eklentisinin açık olduğunu kurulumdan önce doğrulayın.
`PDO::getAvailableDrivers()` çıktısında `sqlite` yoksa senkron endpoint'i bilinçli olarak
`503 pdo_sqlite_missing` döndürür.

Fatura/fiş görselinden stok taslağı kullanılacaksa PHP yükleme sınırını da kontrol edin.
Uygulama görsel başına 10 MB sınır uygular; multipart ek yükü için önerilen alt sınırlar:

```ini
upload_max_filesize = 10M
post_max_size = 52M
```

## 1. Kopyalanacak Dosyalar

Hosting panelinde sitenin herkese açık klasörünü bulun. Bu klasör çoğu hostingde `public_html`, `www` veya site alan adıyla aynı isimde olur.

Önerilen kurulum:

```text
public_html/
  yardimci-asistan/
    lib/
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

Bu komut yalnız PHP API hizmetini doğrular ve paketler; site tasarımı, widget veya demo derlemesi içermez. Hosting paneline yüklenebilecek klasör:

```text
artifacts/web-module-deploy/yardimci-asistan/
```

Yanındaki `artifacts/web-module-deploy/manifest.json` dosyası paketlenen dosyaların boyut, SHA-256 özetlerini, canlı kurulum uyarılarını ve üretilen arşivleri içerir. Komut her zaman `yardimci-asistan.tar.gz` üretmeye çalışır; sistemde `zip` komutu varsa ayrıca `yardimci-asistan.zip` oluşturur.

Hosting panelinde arşiv çıkarma desteği varsa `yardimci-asistan.zip` veya `yardimci-asistan.tar.gz` dosyasını yükleyip açabilirsiniz. Destek yoksa `yardimci-asistan/` klasörünün içeriğini FTP veya dosya yöneticisiyle kopyalayın.

### Önerilen: anahtarı otomatik üretip kurulum paketi hazırlama

Yeni bir site kurulurken sync anahtarını elle uydurmak yerine şu komutu kullanın:

```bash
npm run prepare:web-install -- \
  --url https://firma.com/yardimci-asistan \
  --name "Firma Adı"
```

Komut 256-bit rastgele bir güvenlik anahtarı üretir, canlı origin değerini ayarlar ve
web modül arşivini hazırlar. Anahtar terminalde gösterilir ve yalnız yerelde:

```text
artifacts/web-module-deploy/install-info.txt
```

dosyasına `0600` izinle yazılır. Masaüstünde `Ayarlar → Web Bağlantısı` bölümüne
bu dosyadaki **Web modül adresi** ve **Web güvenlik anahtarı** değerlerini girin.
Anahtarı Git'e, site HTML'ine, widget koduna veya herkese açık bir dosyaya koymayın.

Site web modülünden farklı bir origin'de çalışıyorsa ek olarak bir veya daha fazla
`--origin https://site.example` parametresi verilebilir.

### SSH ile canlı güncelleme

Alwaysdata üzerindeki mevcut kurulumu güncellemek için proje kökünde önce farkları
kontrol edin:

```bash
npm run deploy:web -- --dry-run
```

Ardından etkileşimli onayla yayınlayın:

```bash
npm run deploy:web
```

CI veya başka bir etkileşimsiz terminalde `npm run deploy:web -- --yes` kullanılabilir.
Script varsayılan olarak `yardimciasistan@ssh-yardimciasistan.alwaysdata.net` hedefindeki
`/home/yardimciasistan/www/yardimci-asistan` dizinini günceller. Farklı bir kurulum için
`--help` çıktısındaki ortam değişkenlerini kullanın.

Her yayında paket yeniden üretilir ve PHP dosyaları hem yerelde hem sunucudaki geçici
alanda doğrulanır. Canlı `data/` dizini, `config/business.json`, yerel AI ayarları,
`knowledge/`, `media/` ve `.env*` dosyaları yeni sürüme taşınır. Önceki sürüm runtime
verileriyle birlikte `/home/yardimciasistan/backups/` altında saklanır; bu yedekler API
anahtarı ve sync secret içerebileceği için herkese açık bir dizine taşınmamalıdır.

Paket daha önce üretildiyse yalnız kod dağıtımını tekrar denemek için:

```bash
npm run deploy:web -- --skip-pack
```

### Temiz web modülü kurulumu

Sunucuda saklanması gereken runtime veri yoksa önce yukarıdaki
`prepare:web-install` komutuyla yeni paket ve yeni anahtar üretin. Alwaysdata gibi SSH
erişimi olan kurulumlarda ardından:

```bash
npm run deploy:web -- --fresh --skip-pack
```

kullanın. `--fresh`, eski `data/`, `config/business.json`, local config,
knowledge, media ve `.env*` dosyalarını yeni sürüme taşımaz. Buna rağmen eski canlı
kurulum önce normal yedek dizinine alınır; yani yanlışlık durumunda geri dönüş kopyası
bulunur. `--fresh` mevcut paket içinde gerçek bir `sync_secret` yoksa çalışmayı
reddeder.

Yetkili `reset_runtime` aksiyonu da aynı “temiz runtime” anlamını taşır: SQLite
yayın/istek/action kayıtlarını, Android cihaz token ve bootstrap noncelarını, public
rate-limit kayıtlarını, AI/Google yerel ayarlarını, AI konuşma geçmişini, eski JSON
backup kalıntılarını ve oda/masa medyasını temizler. `config/business.json` içindeki
kurulum kimliği ve sync secret bu API resetinde korunur; yeni secret gereken devirlerde
`prepare:web-install + deploy:web -- --fresh` kullanılmalıdır.

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

Desteklenen ek alanlar: `YARDIMCI_ASISTAN_DEPLOY_EMAIL`, `YARDIMCI_ASISTAN_DEPLOY_ADDRESS`, `YARDIMCI_ASISTAN_DEPLOY_PRIMARY_COLOR`, `YARDIMCI_ASISTAN_DEPLOY_ACCENT_COLOR`. Bu değerler sadece `artifacts/web-module-deploy/yardimci-asistan/config/business.json` içine yazılır; repo içindeki kaynak template değişmez. Hâssas `sync_secret` değerini commit etmeyin ve YARDIMCI_ASISTAN_DEPLOY_LOGO_URL (aynı HTTPS sitede /assets/logo.webp gibi PNG/JPEG/WebP yolu).

## 2. Config Ayarları

Ana firma ayarı:

```text
yardimci-asistan/config/business.json
```

Değiştirilecek temel alanlar:

```json
{
  "display_name": "Firma Adı",
  "logo_url": "/assets/logo.webp",
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

`sync_secret` değerini kurulumda mutlaka değiştirin. Bu anahtar PC uygulamasının hostingdeki talepleri ve Android işlem kuyruğunu çekmesi, QR menüyü ve Android operasyon snapshot'ını yayınlaması için kullanılır.

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

## 4. Site entegrasyonu

Modül HTML/CSS, widget, navigasyon veya hazır mağaza/duyuru/bayi sayfası sağlamaz.
Müşteri sitesi kendi tasarımını ve etkileşimlerini koruyarak API'leri tüketir.
Alanlar, görünürlük, medya ve işlem kuralları
[Web veri hizmeti sözleşmesi v1](architecture/WEB_DATA_SERVICE_CONTRACT_V1.md) içindedir.
Örneğin işletme bilgileri ve galeri `api/business.php`, ürünler `api/catalog.php`,
kampanyalar `api/marketing.php` üzerinden okunur. Talepler `api/request.php`,
siparişler `api/order.php` üzerinden gönderilir. `sync_secret` tarayıcıya verilmez.

Tek demo kaynağı `test-site/landing` dizinidir. Demo kendi mağaza, kampanya, bayi,
harita ve asistan kodunu barındırır. `npm run build:demo` yalnız demo asset'lerini
üretir; müşteri web modülünün paketi veya deploy'u bu derlemeye bağlı değildir.
Site tek `/hesabim/` alanını sağlar. Online Satış görünürlük ve API erişiminin
ön koşuludur. SMTP/OAuth dış ayarları için [ortak müşteri hesapları](architecture/CUSTOMER_ACCOUNTS_V1.md) sözleşmesini izleyin.

## 5. QR Menü Sayfası

Web modülü artık ayrı bir `menu.html` sayfası taşımaz. Müşteriye açık QR menü
sayfasını firmanın mevcut web sitesi kendi şablonunda sunar. Bu sayfa yalnız menü
içeriğini şu API'den okur:

```text
https://firma.com/yardimci-asistan/api/menu.php
```

QR kod firmanın bu menüyü yerleştirdiği site sayfasına yönlendirilir. PC uygulamasındaki
değişiklik kalıcı outbox üzerinden hosting SQLite'ına otomatik yayınlanır. Site tarafı
ETag ile menü yayınının güncelliğini periyodik kontrol edebilir.

QR Menü için iki ayrı durum vardır: Ayarlar'daki `channel.qr_menu` modülü ana
aç/kapat anahtarıdır; modül kapalıysa uygulamadaki QR araçları ve web QR yüzeyi
kapanır. Menü çalışma alanındaki “QR Menü webde aktif” anahtarı ise modülü
değiştirmez, yalnız firmanın web sitesindeki QR Menü yüzeyinin yayın görünürlüğünü
yönetir. Yerel menü kayıtları her iki durumda da `food_service.menu` kapsamında
çalışmaya devam eder.

Android companion için PC uygulamasından yayınlanan talepler, müşteriler,
rezervasyonlar, odalar, masalar, menü, aktif adisyonlar, günlük işler ve hazır
mesajlar hosting SQLite'ında sürümlü `android_snapshot` yayını olarak tutulur;
`api/sync.php` içindeki `android_summary` aksiyonuyla okunur. Telefonda yapılan
işlemler SQLite action kuyruğuna eklenir. PC kuyruğu açıkken yaklaşık 15 saniyede
bir çeker, her action kimliğini yerel veritabanına yalnız bir kez uygular, sonucu
hostingde işaretler ve güncel snapshot'ı outbox üzerinden yeniden yayınlar.
Telefonun PC'ye doğrudan ağ erişimi gerekmez.

## 6. AI Ayarları

AI varsayılan olarak kapalıdır. Kapalıyken `api/chat.php` güvenli fallback cevap döndürür. Endpoint AI sorunlarını `ai_disabled`, `configuration_incomplete`, `provider_authentication_failed`, `provider_model_or_endpoint_not_found`, `provider_rate_limited`, `provider_timeout`, `provider_connection_failed` ve `provider_unavailable` gibi güvenli hata kodlarıyla ayırır. Site kendi sunumunda açıklamayı, varsa sağlayıcı HTTP durumunu ve yeniden deneme bilgisini gösterebilir; API anahtarı ve ham sağlayıcı cevabı frontend'e gönderilmez.

`api/chat.php`, sohbet yanıtını üretirken konuşmayı `data/ai-conversations.json` içine kaydeder. İstek gövdesinde veya mesaj içinde talep niyeti bulunduğunda ve `customer_name` ile geçerli Türkiye cep telefonu geldiğinde ayrıca hosting SQLite'ında `source=web_ai`, `sync_status=pending` olan müşteri talebi açar. Tarih, saat ve kişi sayısı varsa kayda eklenir; eksik bilgiler işletme sahibi tarafından konuşmada tamamlanabilir.

AI anahtarı frontend dosyalarına veya `widget.js` içine yazılmamalıdır. Ana kullanım yolu masaüstü uygulamasındaki `Ayarlar → AI Bağlantısı` alanıdır:

1. Kullanılacak servisi seçin veya özel OpenAI uyumlu bağlantı adresini girin.
2. Model adını, gizli erişim anahtarını ve yanıt bekleme süresini girin.
3. `Bağlantıyı Dene` ile masaüstü bağlantısını kontrol edin.
4. Ayarları kaydedin. Uygulama aynı ayarı web modülüne otomatik uygular.

Canlı web modül adresi HTTPS olmalıdır. HTTP üzerinden gizli anahtar yayını yalnız yerel geliştirmede `localhost`, `127.0.0.1` veya `::1` için kabul edilir. Web yayını başarısız olursa masaüstü ayarı kaybolmaz; Ayarlar ekranında hata gösterilir ve kaydetme tekrar denenebilir.

Başarılı yayından sonra ayarlar hosting SQLite içindeki korumalı
`private_publication_config` kaydında publication receipt ile atomik saklanır.
API anahtarı public/sync cevaplarına veya deploy arşivine girmez.
`data/` klasörü PHP tarafından yazılabilir olmalıdır.

Masaüstü ve Android'deki `AI ile Stok Ekle` akışı aynı ayarı
`api/stock-image-analysis.php` üzerinden kullanır. Endpoint `X-YA-Sync-Secret`
header'ını, Android cihaz profilini ve `menu.stock_update` iznini doğrular. Yüklenen
JPG/PNG/WebP yalnız istek boyunca PHP geçici alanında tutulur; sonuçtan sonra silinir.
Seçili servis veya model görsel girişini desteklemiyorsa kullanıcıya yapılandırmayı
değiştirmesi gerektiğini belirten güvenli hata döner.

Müşteri kartındaki `Kimlik Görselinden AI ile Doldur` akışı aynı ayarı
`api/identity-image-analysis.php` üzerinden kullanır. Android tarafında yalnız aktif
yönetici cihaz ve `customer.manage` izni kabul edilir. Kimlik görseli yalnız istek
süresince geçici dosyada tutulur, analiz sonunda silinir ve müşteri kartına görsel olarak
kaydedilmez. Okunan alanlar kullanıcı onayından önce düzenlenebilir.

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
data/yardimci-asistan.sqlite: uygulama tarafından 600
data/*.json: yalnız AI konuşma geçmişi için 664
data/ai-settings.local.php: uygulama tarafından 600
```

Bazı paylaşımlı hostinglerde PHP'nin SQLite veritabanını, WAL/SHM yardımcı dosyalarını
ve konuşma JSON'unu oluşturabilmesi için `data/` klasörü `775` gerekebilir. Daha geniş
izin gerekiyorsa yalnızca `data/` klasöründe kullanın; `config/` klasörünü yazılabilir
yapmayın. SQLite dosyasını önceden elle oluşturmanız gerekmez.

Apache hostinglerde `config/`, `data/` ve `knowledge/` klasörlerinde gelen `.htaccess` dosyaları doğrudan tarayıcı erişimini kapatır. Nginx veya özel panel kullanılan hostinglerde aynı engelleme sunucu ayarından yapılmalıdır.

Güncel web modülü eski JSON çalışma dosyalarını içe aktarmaz. İlk API çağrısı current
SQLite storage'ı doğrudan oluşturur. Kurulumdan önce eski veriler gerekiyorsa ayrı bir
dışa aktarma/temiz veri hazırlama işlemi yapılmalıdır.

## 8. Hızlı Test

Kurulumdan sonra web modülünün menü API'sini kontrol edin:

```text
https://firma.com/yardimci-asistan/api/menu.php
```

Firmanın QR menü sayfası ayrı olarak kendi site rotasında kontrol edilir.

Senkron deposunu test etmek için güvenlik anahtarını header'da gönderin:

```bash
curl -X POST 'https://firma.com/yardimci-asistan/api/sync.php' \
  -H 'Content-Type: application/json' \
  -H 'X-YA-Sync-Secret: uzun-ve-tahmin-edilemeyen-bir-anahtar' \
  --data '{"action":"capabilities"}'
```

Başarılı yanıtta `protocol_version: 3` ve `storage: "sqlite"` görünmelidir. Ardından
sitenin kendi talep formundan örnek talep gönderin; `data/yardimci-asistan.sqlite` oluşur ve
masaüstündeki `Şimdi Eşitle` komutundan sonra talep panelde görünür.

## 9. PC Uygulamasıyla Eşleştirme

PC uygulamasında kullanılacak iki bilgi:

```text
Web modül adresi: https://firma.com/yardimci-asistan
Sync güvenlik anahtarı: business.json içindeki sync_secret
```

Otomatik eşitleme yeni kurulumda açıktır. Masaüstü açıkken talep ve Android kuyruğu
yaklaşık 15 saniyede bir kontrol edilir; menü ve operasyon değişiklikleri outbox'tan
otomatik yayınlanır. Ayar `Gelişmiş Ayarlar → Web Bağlantısı → Otomatik eşitle`
alanından değiştirilebilir.

Canlı kurulumda `sync_secret` değerini kimseyle paylaşmayın. Anahtar sızarsa `business.json` içinde değiştirip PC uygulamasında yeni değeri kullanın.

## 10. Sık Hatalar

Site verileri görünmüyor:

- Sayfanın kendi API yolunu, HTTP durumunu ve yayın `enabled` bilgisini kontrol edin.
- Modülün içinde hazır sayfa veya `widget.js` aranmaz; sunum kodu siteye aittir.
- Cache eklentisi eski site dosyalarını gösteriyor olabilir.

Talep kaydedilmiyor:

- Hostingde `pdo_sqlite` etkin olmayabilir.
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
- `data/` klasörü SQLite ve `data/ai-conversations.json` için hosting kullanıcısı tarafından yazılabilir olmalıdır.

Online Bayi Başvurusu belgeleri için PHP kullanıcısı HTTP belge kökünün üst dizininde
özel bir klasör oluşturabilmelidir. Dosyalar bu klasörde 0600, klasör 0700 izinleriyle
saklanır; web URL'si üretilmez. Modülün `.user.ini` dosyası yükleme sınırlarını tanımlar;
hosting panelindeki daha düşük PHP sınırları da yukarıdaki değerlere yükseltilmelidir.
Beş dosyanın toplamı için `post_max_size` en az 52M olmalıdır.
