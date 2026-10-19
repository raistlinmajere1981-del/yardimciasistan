# Yardımcı Asistan Web Veri Hizmeti

Bu dizin yalnız PHP veri, medya, yayın ve işlem servisidir. HTML/CSS, widget,
sayfa yapısı, navigasyon, hazır mağaza/duyuru/bayi veya harita renderer'ı içermez.
Her müşteri sitesi kendi sunum koduyla API'leri tüketir. Tek demo sunum kaynağı
`test-site/landing` dizinidir ve müşteri paketine girmez.

- `api/`: public veri ve işlemler; sync-secret/device/dealer korumalı hizmetler.
- `lib/`: canonical Hosting storage, projection, submission ve provider kitaplıkları.
- `config/`, `data/`, `knowledge/`: korumalı yapılandırma, SQLite ve AI bağlamı.
- `media/`: yayınlanmış medya; mevcut URL, MIME ve boyut kuralları korunur.

`npm run pack:web-module` build gerektirmeden backend arşivlerini üretir.
Site tasarım dosyaları ve runtime verileri pakete giremez. `config/business.json`
içindeki sync_secret ve allowed_origins yalnız üretilen kurulum paketinde ayarlanır.
PHP/PDO_SQLITE gerekir; config/data/knowledge erişim kuralları korunmalıdır.

Public veri uçları: business (galeri dahil), menu, rooms, tables, catalog, marketing,
availability, google-reviews. İşlemler: request, order, chat, audio-transcribe,
dealer claim/session/logout/catalog/order. WhatsApp webhook/status, medya yüklemeleri,
Android ve Desktop publication/restore hizmetleri mevcut yetki kurallarını korur.

Bayi davet sayfası sitenin modüle kardeş `bayi/` yoludur. Davet fragment'i site
kodunca hemen temizlenir; claim/logout aynı-origin JSON ve X-YA-Dealer gerektirir.
HttpOnly/Secure/Strict session cookie yalnız modülün api/dealer/ yoluna gönderilir.

Ayrıntılar: [veri sözleşmesi v1](../../docs/architecture/WEB_DATA_SERVICE_CONTRACT_V1.md),
[kurulum](../../docs/WEB_MODULE_INSTALLATION.md),
[publication v3](../../docs/architecture/DESKTOP_HOSTING_PUBLICATION_PROTOCOL_V3.md).

## Dosya İzinleri

Hosting kullanıcısının `data/` klasörüne yazabilmesi gerekir. Başlangıç için çoğu Linux hostingde şu izinler yeterlidir:

```text
config/ ve knowledge/ dosyaları: 644
api/ dosyaları: 644
data/ klasörü: 755 veya hosting gerektiriyorsa 775
data/yardimci-asistan.sqlite: uygulama tarafından 600
```

PHP'de `PDO` ve `pdo_sqlite` zorunludur. SQLite dosyası çalışma anında `0600`
izinle oluşturulur. Güncel storage eski JSON çalışma dosyalarını içe aktarmaz;
talep, action ve yayın yazımları SQLite'a gider.

`config/`, `data/` ve `knowledge/` klasörlerinde Apache için doğrudan tarayıcı erişimini kapatan `.htaccess` dosyaları bulunur. Nginx kullanılan hostinglerde aynı kural sunucu panelinden eklenmelidir.

AI anahtarı tarayıcıdan erişilebilir bir dosyada gösterilmemelidir. Masaüstünden yayınlanan anahtar korumalı SQLite `private_publication_config` içinde exact publication receipt ile atomik tutulur; runtime veritabanı deploy paketine ve Git'e dahil edilmez. `data/.htaccess` doğrudan erişimi kapatır; Nginx kullanılan hostingde aynı engel panelden tanımlanmalıdır.

## Google yorumları

Google yorumları yapılandırması masaüstü uygulamasındaki `Ayarlar → İşletme → Google Yorumları`
alanından yönetilir. Place ID ve Places API (New) anahtarı `sync_secret` ile korunan
`api/sync.php` üzerinden web modülüne yayınlanır. API anahtarı public business bağlamına,
HTML'e veya JavaScript'e eklenmez; hosting SQLite `private_publication_config` içinde tutulur.

Public site yalnız normalize edilmiş yorumu aşağıdaki endpoint'ten okur:

```text
api/google-reviews.php
```

Ayar kapalı veya eksikse endpoint `available=false` döndürür. Google Places yorum içeriği
kalıcı olarak önbelleklenmez; public endpoint her içerik isteğinde güncel veriyi Google Places'tan
okur ve `Cache-Control: no-store` döndürür. Kalıcı tutulan yalnız işletmenin Place ID ayarı ve
sunucu tarafında korunan API credential'ıdır. Runtime özel ayarları deploy paketine dahil edilmez.

## AI Chat Endpoint

Web AI sohbet endpointi:

```text
api/chat.php
```

AI varsayılan olarak kapalıdır. Kapalıyken endpoint müşteriye form veya WhatsApp yönlendirmesi yapan güvenli fallback cevap döndürür ve konuşmayı `data/ai-conversations.json` içine kaydeder. Kapalı ayar, eksik yapılandırma, kimlik doğrulama, model/adres, istek sınırı, zaman aşımı, ağ ve sağlayıcı kesintileri ayrı güvenli hata kodlarıyla döner; konuşma kaydında `error_code` saklanır.

Sohbet isteğinde `customer_name`, geçerli Türkiye cep telefonu `customer_phone` ve açık talep niyeti varsa endpoint ayrıca hosting SQLite'ında `source=web_ai`, `sync_status=pending` olan talep kaydı açar. Yanıtta `request_created`, `request_id` ve `request_missing_fields` alanları bulunur.

Normal kullanımda servis, bağlantı adresi, model ve anahtar masaüstü uygulamasındaki `Ayarlar → AI Bağlantısı` alanından girilir. Kaydetme, aynı ayarı HTTPS ve `sync_secret` ile web modülüne yayınlar. Hostingde son başarıyla yayınlanan ayar PC kapalıyken de kullanılmaya devam eder. Google AI Studio seçildiğinde yeni authorization key'lerle uyumlu `x-goog-api-key` doğrulaması kullanılır.

Eski kurulum ve geliştirme için ortam değişkenleri fallback olarak desteklenir:

```bash
YARDIMCI_ASISTAN_AI_ENABLED=1
YARDIMCI_ASISTAN_AI_BASE_URL=https://api.openai.com/v1
YARDIMCI_ASISTAN_AI_MODEL=...
YARDIMCI_ASISTAN_AI_API_KEY=...
```

Masaüstündeki firma adı, sektör tipi ve “Müşteriye Açık Bilgiler” alanları ayrıca güncel `business_context` yayını olarak hosting SQLite’ına gönderilir. Web AI bu bağlamı birincil kaynak kabul eder; `knowledge/*.md` dosyaları yalnız ek bilgi kaynağıdır ve sektör tipine göre filtrelenir. Böylece örneğin Market / Perakende profilinde oda, giriş-çıkış veya kahvaltı bilgileri AI bağlamına taşınmaz.

Ürün ve menü verisi ayrı `ai_catalog` yayınıyla güncellenir. Bu yayında yalnız müşteriye güvenle gösterilebilecek ad, kategori, marka, barkod, satış fiyatı, birim ve bulunabilirlik gibi alanlar vardır; alış fiyatı veya ham stok miktarı yayınlanmaz. AI tüm kataloğu prompta dökmez, müşterinin mesajıyla eşleşen küçük bir ürün/menü grubunu kullanır. AI promptu kesin rezervasyon, kesin müsaitlik veya bağlayıcı fiyat onayı vermeyecek şekilde sınırlandırılır.

## Canlı Oda Müsaitliği

Demo sitesinin asistanı oda müsaitliği sorularını genel AI cevabına bırakmadan önce salt-okunur
canlı availability hattında kontrol eder:

```text
api/availability.php
api/availability-sync.php
```

Masaüstü otomatik senkron döngüsü, yalnız oda kimliği/adı/numarası/kapasitesi/durumu ile
anonim tarih bloklarını içeren `public_room_availability` publication'ını yayınlar.
Müşteri adı, telefon, not, rezervasyon kimliği, konaklama kimliği ve diğer operasyonel
PII bu payload'a dahil edilmez. Bu heartbeat Android snapshot'ından ayrıdır ve global
operasyon `server_revision` değerini artırmaz.

Availability girdisi dashboard listesi değil, canonical DB'deki aktif odalar ve
bu odaların tüm pending/approved rezervasyonları ile planned/checked-in Stay
aralıklarıdır. Presentation limitleri authority yolunda kullanılmaz. Hosting 500
oda veya 5000 blok sınırını aşan yayını 422 ile reddeder; sessiz kesme yapmaz ve
önceki state/freshness/receipt'i değiştirmez.

`api/availability.php` yalnız `POST` kabul eder ve public chat hız sınırını kullanır.
Doğal dilde tarih aralığı ve kişi sayısı deterministik olarak çözümlenir; eksik alanlar
tahmin edilmez, kullanıcıdan istenir. Tarih çakışmaları yarı açık aralık mantığıyla
hesaplanır; çıkış günü yeni giriş günü olabilir.

Masaüstü otomatik senkron açıkken heartbeat normal senkron döngüsünde yenilenir.
Publication veya masaüstünde üretilen veri 15 dakikadan eskiyse endpoint fail-closed
davranır ve kesin müsaitlik iddiası üretmez. Bu yol rezervasyon oluşturmaz, güncellemez
ve silmez; yalnız güncel müsaitliği okur.

### Public talep retry sözleşmesi

`POST api/request.php` gövdesinde client tarafından üretilmiş `idempotency_key`
zorunludur (16–128 ASCII harf/rakam, `_` veya `-`). Bir logical submission'ın tüm
retry'ları aynı key'i taşır. Aynı key + normalize edilmiş aynı intent, ilk kabulün
aynı `request_id` ve response'unu döndürür; farklı intent 409 `idempotency_conflict`
olur. Yeni key yeni taleptir. Request ID hâlâ server-generated'dır. Request kuyruğu
ve receipt aynı SQLite transaction'ında yazılır. Mevcut capability/abuse guard'ları
korunur; rate limit idempotency yerine geçmez. Site formu key'i başarısız retry
boyunca memory'de tutar; otomatik page-reload retry sözleşmesi yoktur.

Marketing capability OFF, editorial `desired_published` tercihini silmeden ordered
`enabled:false, publications:[]` withdrawal yayınlar. Web görünürlüğünün tek gate'i
marketing projection'dır. ON, korunmuş editorial intent'i normal publication yolunda
yeniden yayınlar. Offline durumda withdrawal job'ı kalıcı olarak bekler; remote
görünürlük hosting withdrawal'ı kabul ettiğinde kapanır.

Odaklı sözleşme testleri Pilot Core içinde şu smoke'larla çalışır:

```text
scripts/smoke-public-room-availability.php
scripts/smoke-public-room-availability-publication.mjs
```

## Stok Görseli Analiz Endpoint'i

Masaüstü ve Android stok girişleri aynı sunucu tarafı endpoint'i kullanır:

```text
api/stock-image-analysis.php
```

Endpoint yalnız `POST multipart/form-data` ve doğru `X-YA-Sync-Secret` header'ını
kabul eder. Android isteklerinde yayınlanmış cihaz profilinin aktif olması ve
`menu.stock_update` iznini içermesi ayrıca zorunludur. Aday listesi yalnız stok takibi
açık menü ürünlerinden oluşur; Android'in gönderdiği adaylar sunucudaki güncel snapshot
ile kesiştirilir. AI anahtarı masaüstü renderer'ına, Android'e veya HTTP cevabına çıkmaz.

JPG, PNG ve WebP desteklenir. Gerçek MIME ve görüntü yapısı sunucuda doğrulanır; uygulama
sınırı 10 MB'dir. Hosting PHP ayarlarında multipart ek yükü için en az şu değerleri
kullanın:

```ini
upload_max_filesize = 10M
post_max_size = 12M
```

Endpoint mevcut `config/ai.php` yapılandırmasını kullanır; bu dosya masaüstünden
yayınlanan `data/ai-settings.local.php` ayarını da yükler. OpenAI/OpenRouter uyumlu
vision modelleri ve Gemini yolu desteklenir. Seçili model/hizmet görsel kabul etmiyorsa
ayar ekranından görsel destekli bir model seçilmesini isteyen yönlendirici bir cevap
döner. Gemini'de genel amaçlı güncel modeller kullanılır; görsel üretim, TTS, Live,
embedding ve kapanmış model aileleri stok analizi için kabul edilmez. Stok birimi adet
olan ürünlerde koli, paket, ağırlık veya hacim bilgisi tahminle adede çevrilmez. Gram
takipli ürünlerde açık `GR` miktarı korunur, açık `KG` miktarı güvenli biçimde 1000 ile
çarpılarak grama dönüştürülür. AI'nın izinli liste dışında ürettiği ürün kimlikleri
temizlenir.

Fatura/fiş çıkarımı için düşük gecikmeli `gemini-3.5-flash-lite` uygundur. Google kotası
model ve proje bazında uygulanır; seçili model HTTP 429 döndürürse bağlantı kontrolü
listedeki sonraki kararlı görsel modele geçebilir. Yeni Gemini sürümleriyle uyumluluk için
kullanımdan kaldırılan sampling parametreleri gönderilmez. Hosting IPv6 çıkışı Google
tarafından desteklenmeyen konum olarak sınıflandırılırsa yalnız bu özel hata için istek
IPv4 üzerinden bir kez güvenli biçimde yeniden denenir.

Yüklenen görsel yalnız istek süresince PHP geçici dosyasında bulunur ve başarı/hata
sonucundan sonra silinir. Görsel, base64 içeriği ve ham sağlayıcı cevabı uygulama
loglarına yazılmaz. Endpoint yalnız yapılandırılmış AI sağlayıcısına analiz amacıyla
görsel gönderir.

Odaklı güvenlik ve sözleşme smoke testi:

```bash
npm run smoke:stock-image-analysis
```

## Kimlik Görseli Analiz Endpoint'i

Masaüstü ve yönetici Android uygulamasındaki müşteri kartı formu şu endpoint'i
kullanır:

```text
api/identity-image-analysis.php
```

Endpoint stok görseli akışıyla aynı güvenli AI ayarını, `X-YA-Sync-Secret` doğrulamasını
ve 10 MB JPG/PNG/WebP sınırını kullanır. Android isteği için cihazın yayınlanmış profili
aktif `admin` olmalı ve `customer.manage` iznini içermelidir. Sonuç yalnız
yapılandırılmış kimlik alanları ve kullanıcıya gösterilecek uyarılardır.

Kimlik görseli müşteri kaydına, hosting SQLite'ına, Android snapshot'ına veya loglara
yazılmaz. Multipart geçici dosyası başarı ve hata sonunda silinir; OpenAI uyumlu
sağlayıcılara yapılan istekte sağlayıcı tarafı kalıcı saklama kapatılır. AI sonucu
doğrudan kaydedilmez, müşteri formuna öneri olarak aktarılır ve kullanıcı kontrol eder.
Stok ve kimlik görseli sözleşmeleri birlikte şu testte doğrulanır:

```bash
npm run smoke:stock-image-analysis
```

## Sürüm Endpoint'i

Canlı web modülünün sürümü public ve salt-okunur endpoint'ten alınabilir:

```text
api/version.php
```

Cevap `product_version` ve bağımsız `web_module_version` alanlarını döndürür.
Canonical kaynak repo kökündeki `product-version.json` dosyasıdır; `npm run version:sync`
`config/version.json` dosyasını günceller. Web modülü tek başına ilerletilecekse
`npm run version:web:bump -- patch` veya `npm run version:web:set -- <x.y.z>`
kullanılır. Endpoint secret veya installation credential bilgisi döndürmez.

## Sync Endpoint

PC uygulaması web taleplerini dışarıdan port açmadan şu endpoint üzerinden çeker:

```text
api/sync.php
```

Güvenlik anahtarı:

```text
config/business.json → sync_secret
```

Desteklenen aksiyonlar:

```text
capabilities
pull_requests
acknowledge_requests
android_summary
enqueue_android_action
pull_android_actions
mark_android_action_result
mark_requests_synced
update_request_status
publish_menu
publish_android_snapshot
publish_ai_settings
publish_business_context
publish_ai_catalog
```

`publish_ai_settings` yalnız `POST` ve `X-YA-Sync-Secret` header'ı ile çalışır. API anahtarı hiçbir HTTP cevabına eklenmez.

Örnek `pull_requests` gövdesi:

```json
{
  "action": "pull_requests",
  "after_seq": 0,
  "limit": 50
}
```

Güvenlik anahtarı `X-YA-Sync-Secret` HTTP header'ında gönderilir. Eski istemcilerin
gövdedeki anahtarı geçici olarak desteklenir; yeni entegrasyonlarda anahtarı gövdeye,
query string'e veya loglara yazmayın.

Masaüstü başarılı local transaction sonrasında cursor'u onaylar:

```json
{
  "action": "acknowledge_requests",
  "client_id": "desktop-uuid",
  "through_seq": 42
}
```

`capabilities` cevabında otomatik senkron için `protocol_version: 2` ve
`storage: "sqlite"` bulunur. Menü ve Android snapshot yayınlarındaki revision ile
idempotency anahtarı ağ tekrarlarında çift yazımı, eski revision ise güncel verinin
üzerine yazılmasını engeller.

Örnek `android_summary` gövdesi:

```json
{
  "action": "android_summary",
  "device_id": "android-telefon-01",
  "known_server_revision": 42,
  "limit": 10
}
```

Android uygulaması yerel veritabanına veya PC'ye doğrudan yazmaz. Kullanıcı işlemi
`enqueue_android_action` ile hosting SQLite action kuyruğuna eklenir. Masaüstü
uygulaması bekleyen işlemleri `pull_android_actions` ile çeker, yerel veritabanında
aynı action kimliğini yalnız bir kez uygular ve `mark_android_action_result` ile
`applied` ya da `failed` sonucunu yayınlar. Ardından tam operasyon snapshot'ını
yenileyerek Android ekranlarının güncel durumu çekmesini sağlar.

Örnek Android işlemi:

```json
{
  "action": "enqueue_android_action",
  "action_id": "act_android-telefon-01_1752746400000_a1b2c3",
  "action_type": "room_status_update",
  "payload": {
    "room_id": "room_101",
    "status": "cleaning"
  },
  "device_id": "android-telefon-01"
}
```

Kuyruk; müşteri talebi, rezervasyon, oda, günlük iş, masa durumu ve masa
adisyonu işlemlerini kabul eder. Aynı `id` tekrar gönderildiğinde yeni kayıt
oluşturulmaz. Başarısız işlemler hata mesajıyla korunur; teknik ayar veya gizli
anahtar operasyon ekranlarında gösterilmez.

Örnek `mark_requests_synced` gövdesi:

```json
{
  "action": "mark_requests_synced",
  "request_ids": ["request_001"]
}
```

Örnek `update_request_status` gövdesi:

```json
{
  "action": "update_request_status",
  "request_id": "request_001",
  "status": "answered"
}
```

Örnek `publish_menu` gövdesi:

```json
{
  "action": "publish_menu",
  "client_id": "desktop-uuid",
  "source_revision": 12,
  "idempotency_key": "desktop-uuid:menu:12",
  "menu": {
    "categories": [],
    "items": [],
    "updated_at": "2026-07-10T10:00:00+03:00"
  }
}
```

Gerçek firma kurulumunda `change-this-secret` mutlaka değiştirilmelidir.

## QR Menü Yayını

Web modülü bağımsız bir müşteri sayfası üretmez. QR menünün public sayfası firma
sitesinin kendi şablonunda tutulur ve menü içeriğini `api/menu.php` üzerinden okur.
Böylece firma sitesi kendi header/footer, tema ve alan adı yapısını korurken Yardımcı
Asistan yalnız menü verisinin yayın sahibi olur.

Menü yayını current SQLite storage'dan okunur; eski JSON menü dosyası içe aktarılmaz.
Pasif kategoriler ve mevcut olmayan ürünler API cevabına dahil edilmez. Site tarafındaki
QR menü görünümü ETag kullanarak güncelliği periyodik kontrol edebilir.

Lokal smoke testi:

```bash
npm run smoke:web-module
```

Yeni kurulumda sync secret'ı otomatik üretmek ve canlı deploy paketini hazırlamak için:

```bash
npm run prepare:web-install -- --url https://firma.com/yardimci-asistan --name "Firma Adı"
```

Komut masaüstünde kullanılacak anahtarı terminalde ve
`artifacts/web-module-deploy/install-info.txt` içinde gösterir.

Hosting paneline yükleme öncesi doğrulanmış klasör üretmek için:

```bash
npm run pack:web-module
```

Çıktı:

```text
artifacts/web-module-deploy/yardimci-asistan/
artifacts/web-module-deploy/yardimci-asistan.tar.gz
artifacts/web-module-deploy/manifest.json
```

Sistemde `zip` komutu varsa aynı klasörde `yardimci-asistan.zip` de oluşturulur.
Manifest canlı kurulum öncesi değiştirilmesi gereken varsayılan `sync_secret`,
geliştirme origin değerleri ve örnek alan adı gibi uyarıları listeler.
Deploy paketindeki `config/business.json` değerleri, kaynak template'i değiştirmeden
`YARDIMCI_ASISTAN_DEPLOY_*` ortam değişkenleriyle doldurulabilir. Örnek:

```bash
YARDIMCI_ASISTAN_DEPLOY_ALLOWED_ORIGINS="https://firma.com" \
YARDIMCI_ASISTAN_DEPLOY_SYNC_SECRET="uzun-gizli-anahtar" \
npm run pack:web-module
```

Ayrıntılı canlı kurulum adımları için:

```text
docs/WEB_MODULE_INSTALLATION.md
```

## Siteye ait mağaza

Public catalog/order API'lerini kullanan demo mağaza `test-site/landing/magaza/`
altındadır. Şablon `inc/storefront.php`, renderer ve CSS site asset'leridir.
Sepet, retry, teslimat ve checkout davranışı `web-storefront` ile sınanır.
Backend paketi hazır mağaza sayfası veya JS/CSS içermez.

## Sipariş teslimatı (B1)

Desktop Servisler kategorisindeki Online Satış Teslimatı staged ayarları,
`channel.online_sales` altında işletmeden teslim/kargo izinlerini yönetir.
Varsayılan pickup açık, shipping kapalıdır; en az biri açık olmalıdır. Katalog
publication’ı yalnız public-safe `delivery_methods: ["pickup", "shipping"]`
alt kümesini yayınlar. Kapalı kanalda yöntemler ve ürünler boş kalır.

Checkout yalnız yayınlanan yöntemleri sunar. Tek yöntemde seçim göstermez;
kargoda structured adres ister. Ülke iki harfli koddur (varsayılan TR; TR-only
kısıtı yoktur). POST’ta `delivery: {method: "pickup"}` veya
`delivery: {method: "shipping", address: {recipientName, addressLine1,
addressLine2?, district, city, postalCode?, countryCode, note?}}` bulunur.
Hosting normalize edilmiş delivery/adresi idempotency fingerprint’ine dahil
eder. Yeni gönderimde kapatılmış yöntemi `422 delivery_method_unavailable`
ile reddeder; checkout kataloğu yeniler ve formu korur. Önceden kabul edilmiş
siparişin aynı key ile replay’i sonradan değişen izinlerden bağımsızdır.

Delivery buyer/contact’tan ayrı, immutable Commerce Order snapshot’ıdır.
Ingress geçersiz adresli kaydı import/ack etmez. Guest Customer/address-book
oluşturulmaz; kargo ücreti, provider, takip ve otomatik fulfillment yoktur.
Sipariş toplamı yalnız ürün toplamıdır. Manual sipariş yöntem verilmezse pickup
kullanır. Desktop Siparişler detayında teslimat bilgileri read-only gösterilir.


### Dealer portal (C1 / D-033)

The site-owned sibling `/bayi/` page supplies the dealer identity shell. Wholesale + the Desktop Services setting
“Bayi Web Erişimi” enable invitations from the canonical Customer Workspace. Manually
share the one-time HTTPS fragment link; the invitation expires in 72 hours. The link is
shown only at creation and must not be entered into analytics or request-body logging.
The page has no analytics/external assets and removes the fragment immediately.

`POST api/dealer/claim.php` accepts `{ "invite_token": "…" }`; claim/logout require
`Content-Type: application/json` and `X-YA-Dealer: 1` from the same origin. Claim returns
only `{ "ok": true }` and sets a HttpOnly cookie; `GET api/dealer/session.php` returns
only `{ "authenticated": true, "dealer": { "access_id": "…", "display_name": "…" } }`
or 401 `{ "authenticated": false }`. `POST api/dealer/logout.php` revokes the session.
Cookies are Secure in production, Strict, scoped to `/api/dealer/`, and expire in 8 hours.
Only the loopback PHP development server permits HTTP cookies; production requires HTTPS.

The sync-secret-protected POST `publish_dealer_access` action uses the existing versioned
publication/receipt contract, private `dealer_access_private` storage and transactional
`dealer_access` projection application. There is no public dealer list endpoint. Deploy
must deny direct access to `data/` and `config/` using their packaged access rules.
Revocation/rotation becomes effective after successful Desktop sync; no online round trip
means no guarantee that remote sessions have already ended. Claimed status is hosting
state and is not inferred from Desktop's “Davet hazır” label. Runtime reset clears both
dealer access and sessions. Customer contacts/tax/notes and price groups are not published.

WhatsApp Business Cloud outbound status webhooks use `api/whatsapp-webhook.php`.
Set hosting environment secrets `YA_WHATSAPP_VERIFY_TOKEN` and `YA_WHATSAPP_APP_SECRET`
without putting them in `business.json` or publications. The isolated status inbox is
pulled/acknowledged by desktop with the existing sync credential; no inbound conversation
storage exists. See [Business Messaging deployment](../../docs/architecture/business-messaging.md).

### Website pazarlama verisi

Desktop Pazarlama Website yayını `api/marketing.php` üzerinden okunur.
Sıralı görseller mevcut `media/marketing/` yollarında kalır. Site kendi şablon ve
renderer'ını sağlar; demo sahibi `test-site/landing/assets/js/marketing.js` dosyasıdır.
Boş/yayından kaldırılmış içerik görünmez. Public API provider sırları, yerel dosya
yolları ve Content/AI metadata yayınlamaz. Desktop intent revision ve kalıcı sync
outbox ile yayınlar; tekrarlar idempotenttir. Publication binary medya içermez.
