# Web Module

Firma hostinginde çalışacak mini API ve gömülebilir widget dosyaları burada yer alır.

İlk hedef düz PHP hostinglerde çalışabilen, API key bilgisini frontend'e çıkarmayan sade bir yapı kurmaktır.

## Klasörler

```text
widget.js
menu.html
assets/
api/
  request.php
  chat.php
  menu.php
  sync.php
config/
  business.json
  ai.php
data/
  requests.json
  menu.json
  android-snapshot.json
  android-actions.json
  ai-conversations.json
  sync-state.json
  ai-settings.local.php (masaüstünden yayınlanınca oluşur)
knowledge/
  firma.md
  odalar.md
  restoran.md
  menu.md
  sik-sorulan-sorular.md
```

## Dosya İzinleri

Hosting kullanıcısının `data/` klasörüne yazabilmesi gerekir. Başlangıç için çoğu Linux hostingde şu izinler yeterlidir:

```text
config/ ve knowledge/ dosyaları: 644
api/ dosyaları: 644
data/ klasörü: 755 veya hosting gerektiriyorsa 775
data/*.json dosyaları: 664 veya hosting gerektiriyorsa 666
```

`config/`, `data/` ve `knowledge/` klasörlerinde Apache için doğrudan tarayıcı erişimini kapatan `.htaccess` dosyaları bulunur. Nginx kullanılan hostinglerde aynı kural sunucu panelinden eklenmelidir.

AI anahtarı tarayıcıdan erişilebilir bir dosyada gösterilmemelidir. Masaüstünden yayınlanan anahtar `data/ai-settings.local.php` içinde `0600` izinle tutulur; bu dosya deploy paketine ve Git'e dahil edilmez. `data/.htaccess` doğrudan erişimi kapatır; Nginx kullanılan hostingde aynı engel panelden tanımlanmalıdır.

## AI Chat Endpoint

Web AI sohbet endpointi:

```text
api/chat.php
```

AI varsayılan olarak kapalıdır. Kapalıyken endpoint müşteriye form veya WhatsApp yönlendirmesi yapan güvenli fallback cevap döndürür ve konuşmayı `data/ai-conversations.json` içine kaydeder. Kapalı ayar, eksik yapılandırma, kimlik doğrulama, model/adres, istek sınırı, zaman aşımı, ağ ve sağlayıcı kesintileri ayrı güvenli hata kodlarıyla döner; konuşma kaydında `error_code` saklanır.

Sohbet isteğinde `customer_name`, geçerli Türkiye cep telefonu `customer_phone` ve açık talep niyeti varsa endpoint ayrıca `data/requests.json` içine `source=web_ai`, `sync_status=pending` olan talep kaydı açar. Yanıtta `request_created`, `request_id` ve `request_missing_fields` alanları bulunur.

Normal kullanımda servis, bağlantı adresi, model ve anahtar masaüstü uygulamasındaki `Ayarlar → AI Bağlantısı` alanından girilir. Kaydetme, aynı ayarı HTTPS ve `sync_secret` ile web modülüne yayınlar. Hostingde son başarıyla yayınlanan ayar PC kapalıyken de kullanılmaya devam eder. Google AI Studio seçildiğinde yeni authorization key'lerle uyumlu `x-goog-api-key` doğrulaması kullanılır.

Eski kurulum ve geliştirme için ortam değişkenleri fallback olarak desteklenir:

```bash
YARDIMCI_ASISTAN_AI_ENABLED=1
YARDIMCI_ASISTAN_AI_BASE_URL=https://api.openai.com/v1
YARDIMCI_ASISTAN_AI_MODEL=...
YARDIMCI_ASISTAN_AI_API_KEY=...
```

Knowledge dosyaları `knowledge/*.md` altından okunur. AI promptu kesin rezervasyon, kesin müsaitlik veya bağlayıcı fiyat onayı vermeyecek şekilde sınırlandırılır.

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
pull_requests
android_summary
enqueue_android_action
pull_android_actions
mark_android_action_result
mark_requests_synced
update_request_status
publish_menu
publish_android_snapshot
publish_ai_settings
```

`publish_ai_settings` yalnız `POST` ve `X-YA-Sync-Secret` header'ı ile çalışır. API anahtarı hiçbir HTTP cevabına eklenmez.

Örnek `pull_requests` gövdesi:

```json
{
  "action": "pull_requests",
  "sync_secret": "change-this-secret",
  "limit": 50
}
```

Örnek `android_summary` gövdesi:

```json
{
  "action": "android_summary",
  "sync_secret": "change-this-secret",
  "device_id": "android-telefon-01",
  "limit": 10
}
```

Android uygulaması yerel veritabanına veya PC'ye doğrudan yazmaz. Kullanıcı işlemi
`enqueue_android_action` ile `data/android-actions.json` kuyruğuna eklenir. Masaüstü
uygulaması bekleyen işlemleri `pull_android_actions` ile çeker, yerel veritabanında
aynı action kimliğini yalnız bir kez uygular ve `mark_android_action_result` ile
`applied` ya da `failed` sonucunu yayınlar. Ardından tam operasyon snapshot'ını
yenileyerek Android ekranlarının güncel durumu çekmesini sağlar.

Örnek Android işlemi:

```json
{
  "action": "enqueue_android_action",
  "sync_secret": "change-this-secret",
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
  "sync_secret": "change-this-secret",
  "request_ids": ["request_001"]
}
```

Örnek `update_request_status` gövdesi:

```json
{
  "action": "update_request_status",
  "sync_secret": "change-this-secret",
  "request_id": "request_001",
  "status": "answered"
}
```

Örnek `publish_menu` gövdesi:

```json
{
  "action": "publish_menu",
  "sync_secret": "change-this-secret",
  "menu": {
    "categories": [],
    "items": [],
    "updated_at": "2026-07-10T10:00:00+03:00"
  }
}
```

Gerçek firma kurulumunda `change-this-secret` mutlaka değiştirilmelidir.

## QR Menü Sayfası

Müşteriye açık QR menü sayfası:

```text
menu.html
```

Sayfa menü verisini sadece `api/menu.php` üzerinden okur. Örnek menü verisi `data/menu.json` içindedir; pasif kategoriler ve mevcut olmayan ürünler API cevabına dahil edilmez.

Lokal smoke testi:

```bash
npm run smoke:web-module
```

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
