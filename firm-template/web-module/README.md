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
  ai-conversations.json
  sync-state.json
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

`config/ai.php` içindeki API anahtarı tarayıcıdan erişilebilir bir dosyada gösterilmemelidir. PHP dosyası sunucu tarafında çalışır; yine de mümkünse anahtar ortam değişkeninden okunmalıdır.

## AI Chat Endpoint

Web AI sohbet endpointi:

```text
api/chat.php
```

AI varsayılan olarak kapalıdır. Kapalıyken endpoint müşteriye form veya WhatsApp yönlendirmesi yapan güvenli fallback cevap döndürür ve konuşmayı `data/ai-conversations.json` içine kaydeder.

Sohbet isteğinde `customer_name`, geçerli Türkiye cep telefonu `customer_phone` ve açık talep niyeti varsa endpoint ayrıca `data/requests.json` içine `source=web_ai`, `sync_status=pending` olan talep kaydı açar. Yanıtta `request_created`, `request_id` ve `request_missing_fields` alanları bulunur.

OpenAI uyumlu endpoint için ortam değişkenleri:

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
mark_requests_synced
update_request_status
publish_menu
```

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
  "limit": 10
}
```

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
