# Web veri hizmeti sözleşmesi v1

D-050 kapsamında modül yalnız PHP API hizmetidir. Bu belge mevcut HTTP sözleşmesini
adlandırır; endpoint'lere yeni URL öneki, JSON zarfı veya migration eklemez. Ürün ve
web modülü sürümü `api/version.php` üzerinden okunmaya devam eder. Sunum değişikliği
veri sürümü değişikliği değildir.

## Sahiplik

- Desktop canonical kayıtları ve durable publication registry/outbox yayın niyetini sahiplenir.
- Hosting `api/`, `lib/`, korumalı `config/`, `data/`, `knowledge/` ve `media/` hizmetlerini sağlar.
- Her site HTML/CSS/JS, sayfa yapısı, navigasyon, widget ve etkileşim sunumunu kendisi sahiplenir.
- Demo sahibi yalnız `test-site/landing` dizinidir. Ortak pakette tasarım dosyaları bulunmaz.

## Korunan public veri uçları

| Uç | Veri ve görünürlük sözleşmesi |
| --- | --- |
| `GET api/business.php` | `ok`, `business`: kimlik/iletişim, profile ve public_surfaces, AI/WhatsApp/request/review kullanılabilirliği, about_text/gallery, konum/harita, özellik/dil/sosyal bilgiler. Mevcut alanlar korunur; renkler yalnız veri olarak kalır, stil uygulanmaz. |
| `GET api/menu.php` | Menü publication'ı, kategori/ürün alanları, fiyat/para birimi, kaynak/server revision ve ETag. QR yayını kapalıyken 404. |
| `GET api/rooms.php`, `api/tables.php` | `ok`, `version`, `enabled`, `updated_at`, rooms/tables, source_revision/server_revision ve ETag. Kapalıyken boş liste. Kapasite, özellik, açıklama, sıralama ve yayınlanmış medya alanları korunur. |
| `GET api/catalog.php` | v1 online catalog, enabled, delivery_methods, products ve revision/ETag. Delivery OFF kataloğu gizlemez; yeni siparişi kapatır. |
| `GET api/marketing.php` | `ok`, yayınlanmış publication listesi: placement/title/text/ordered images. Kapalı/yayından kaldırılmış içerik dönmez. Provider sırları ve yerel dosya yolları dönmez. |
| `GET api/availability.php` | Mevcut public oda müsaitlik projection'ı, tarih/kapasite ve freshness/unknown semantiği. Kesin rezervasyon onayı değildir. |
| `GET api/google-reviews.php` | Mevcut normalize yorumlar ve kullanılabilirlik; ek `reviews_uri` Google Maps yorum sekmesi bağlantısıdır, bulunmazsa `google_maps_uri` işletme sayfası fallback'idir. API anahtarı sunucuda kalır. |

Medya URL'leri `/yardimci-asistan/media/…` altında kalır; room/table/gallery/marketing
upload API'leri, MIME/boyut kontrolleri ve publication içindeki medya referansları değişmez.
Galeri, `business_context` yayınının mevcut sanitize edilmiş `gallery` alanıdır ve
`business.php` cevabında ek bir `business.gallery` listesi olarak okunur;
public profile ve galeri yayın sahibine ikinci veri yazma yolu eklenmez.

## Korunan işlemler

- `POST api/request.php`: mevcut request type/source/contact/resource/date alanları,
  zorunlu client idempotency_key, aynı niyette aynı sonuç ve değişen niyette 409.
- `POST api/order.php`: mevcut buyer/items/delivery alanları ve idempotent kabul sonucu.
  Güncel yöntem/fiyat/stok doğrulamasının canonical sahibi değişmez.
- `POST api/chat.php`, `api/audio-transcribe.php`: mevcut AI/voice sözleşmesi,
  güvenli fallback/error ve public abuse guard. Ham sağlayıcı cevabı/anahtar açılmaz.
  Site `chat.php` isteğine isteğe bağlı `response_language: 'en'` eklediğinde
  yanıt dili sunucu sistem talimatında İngilizce seçilir; alan yoksa/başka
  değerdeyse varsayılan Türkçe korunur. İşlem/rezervasyon kuralları değişmez.
- `api/account/`: ortak hesap oluşturma, doğrulama, giriş, bağımsız oturumlar,
  yenileme, çıkış, kurtarma, profil ve kendi siparişleri. Online Satış zorunludur;
  çıkış kapalıyken de çalışır. [Hesap sözleşmesi](CUSTOMER_ACCOUNTS_V1.md) SMTP/OAuth
  yapılandırmasını ve güvenlik sınırlarını tanımlar.
- `api/dealer/{session,logout,catalog,order,orders,receipt}.php`: ortak hesabın
  güncel ticari yetkisini denetler. HttpOnly/Secure/Lax cookie modül köküne gider;
  başka müşteri verileri yayınlanmaz. Tek Hesabım sunumunun sahibi mevcut sitedir.
- WhatsApp webhook/status API'leri ve Android/operasyon API'leri değişmez;
  mevcut secret/device/session/permission kontrolleri uygulanır.
- `api/sync.php` ve availability sync, [publication v3](DESKTOP_HOSTING_PUBLICATION_PROTOCOL_V3.md)
  exact receipt/source fencing ve [restore reconciliation](DESKTOP_RESTORE_RECONCILIATION_V1.md)
  yaşam döngüsünü korur. Site renderer'ı yayın veya canonical mutasyon sahibi değildir.

HTTP durumları, JSON hata mesajları, CORS ve cache kuralları endpoint bazında aynıdır;
site tüm endpoint'lerin aynı zarfı veya cross-origin yetkisi olduğunu varsayamaz.
Form hatasında kullanıcı taslağı korunur. AI sonucu kesin fiyat/müsaitlik/rezervasyon
onayı sayılmaz; WhatsApp gönderimini kullanıcı başlatır.

## Çok dilli public veri

Çoklu Dil bağımsız, sektörler arası bir servistir. Persist edilmiş
`public_translation_settings` etkinliği yetkilidir; AI capability'si yalnız AI
işlemini sınırlar. Kaynak dil `tr`, hedefler ayrı yayın dilleridir.
`business_public_profile.languages_json` yalnız işletmede konuşulan dillerdir.

Menu, room/table catalog, online catalog, business context/galeri ve Website
marketing publication'larına aşağıdaki **ek** alan taşınır. Public HTTP cevaplarında
`localization`, `business.php` dahil cevap kökündedir. Mevcut metin alanları her zaman
Türkçe kalır; ID, fiyat, para birimi, stok, tarih, özellik ve medya alanları değişmez.

```json
{
  "localization": {
    "version": 1,
    "source_language": "tr",
    "target_languages": ["en"],
    "translations": {
      "room": {
        "room_101": {
          "en": {"name": "Garden room", "description": "Quiet room"}
        }
      }
    }
  }
}
```

İç içe anahtarlar `kayıt türü → kayıt ID → hedef dil → alan` şeklindedir. Alan adı
public JSON kaynak alanıyla aynıdır. Bir yayında yalnız o yayının public kayıtları
ve aşağıdaki alanlar bulunabilir:

| Kayıt türü | Yayın / public uç | Alanlar |
| --- | --- | --- |
| `business` | business_context / business.php | description, about_text, directions_note, policy_note, payment_note |
| `gallery` | business_context / business.php | title |
| `room` | room_catalog / rooms.php | name, bed_info, description, price_note |
| `table` | table_catalog / tables.php | name, area, description |
| `menu_category`, `menu_product` | menu / menu.php | name, description |
| `catalog_category` | online_catalog / catalog.php | name |
| `catalog_product` | online_catalog / catalog.php | name, description |
| `marketing` | marketing_website / marketing.php | title, text |

Business kayıt ID'si Desktop business kimliğidir; Hosting config kimliğiyle eşitliği
varsayılmaz. Online catalog ek `categories:[{id,name}]` ve ürünlerde `category_id`
ilişkisini verir. Canonical ürün/category veya kanal sahipliği değişmez; katalog
başlık/açıklama override'ı varsa çeviri kaynağı bu public override'dır.

Site önce hedef dilin `target_languages` içinde olduğunu kontrol eder, ardından
alanın çevirisini arar; bulunmazsa mevcut Türkçe alanı kullanır. Aynı kaydın bazı
alanları çevrilmiş olabilir. Metadata'sız eski yayın, boş çeviri haritası ve boş hedef
dil listesi geçerlidir. Servis OFF, hedefleri ve çevirileri boşaltır; SQLite
çevirilerini silmez. Kaynak Türkçe hiçbir durumda AI sonucunu beklemez.

Desktop çevirileri `business_id + record_type + record_id + field + target_language`
anahtarıyla SQLite'ta tutar. Kaynak snapshot/hash, ready/failed durumu, manual/ai
kökeni ve zamanlar saklanır. Kaynakla hash uyuşmazsa efektif durum stale'dir;
önceki çeviri editörde korunur ama public veriye girmez. Manuel kayıt, stale olsa da
AI tarafından değiştirilmez; kullanıcı kaynakla birlikte gözden geçirip kaydeder.
AI dönüşünde kaynak hash'i, manuel sahiplik, servis/hedef dil ve oturum yeniden
denetlenir. Başarısız AI kayıtları otomatik olarak tekrar tekrar gönderilmez;
kullanıcı tekli/çoklu/filtreli işlemle yeniden deneyebilir. Aynı işletmede aynı kaynak
hash/hedef dil için mevcut hazır AI sonucu yeniden kullanılır; aynı batch içindeki
aynı metin/hata da ikinci sağlayıcı isteği üretmez. İstekler yalnız izinli
public metni ve hedef dili taşır; kişi, mesaj, rezervasyon, finans ve sağlayıcı
sırları/context'i eklenmez. JSON/fidelity, sayı, uzunluk ve geçersiz çıktı kontrolleri
uygulanır; bunlar anlam doğruluğunun matematiksel garantisi değildir.

Çeviri kaydı ve ilgili outbox invalidation'ı aynı SQLite transaction'ındadır.
Servis/hedef değişimi ilgili bütün yayınları invalidate eder. Sonradan hazır olan
çeviri normal source revision ile yayınlanır; `sync_publication_payloads` frozen
body'si yerinde değiştirilmez. Exact receipt, source fencing, bekleyen retry ve
revizyon eşleşmeli completion v3 sahibinde kalır. Kaynak değişiklikleri de mevcut
domain trigger/derived producer taramasıyla yeni yayına dönüşür. Web eşitlemesi
çeviri kuyruğunu beklemez. Görünürlük kaldırma Hosting'e ulaşana kadar önceki
onaylı yayın geçerlidir; offline anlık iptal iddiası yoktur.

PHP public kimlik/alan/dil allowlist'ini uygular; silinen, gizli ve yayından kaldırılan
kayıtlar için çeviri metadata'sı da dönmez. Menu/room/table/catalog ETag'i server
revision ile birlikte değişir ve eski ETag yeni metin için 304 üretmez.
Business/marketing mevcut `no-store` politikalarını korur. Kaynak hash'i, hata,
köken, API anahtarı ve yerel durum bilgileri public sözleşmeye girmez.

Demo sahibi `test-site/landing/assets/i18n/en.json`, Türkçe kaynak anahtarlarıyla
site arayüzü ve demo asistanının İngilizce sözlüğünü sahiplenir. PHP `inc/language.php`,
JS `assets/js/language.js` ve asistanın `assistant/site-language.ts` adaptörü aynı
sözlüğü kullanır. Sözlük yalnız siteye ait etiket, açıklama, doğrulama ve durum
metinlerine uygulanır; public kayıt metni, kullanıcı girdisi ve AI yanıtı sözlüğe
sokulmaz. Public alanlar yalnız `localization` içinden seçilir.

Site seçimi query/HttpOnly cookie ile sayfalar arasında korunur; HTML cevapları
`private, no-store` kullanır. Tarih ve sayı sunumu `tr-TR`/`en-GB` locale kullanır;
işlem kimlikleri, ISO tarihler, sayısal değerler ve idempotency sözleşmesi korunur.
Dil servisi kapalıyken site arayüzü İngilizce kalabilir; public kayıtlar Türkçe
kaynağa döner. API kullanıcının seçimine göre kaynak alanlarını yeniden yazmaz.
Ortak web paketinde dil seçici, HTML/CSS veya çeviri framework'ü bulunmaz.

## Paket ve doğrulama sınırı

`npm run pack:web-module` yalnız backend paketler; demo derlemesine bağımlı değildir.
Runtime SQLite, müşteri medyası, yerel sırlar ve konuşma geçmişi arşive alınmaz.
`npm run build:demo` yalnız `test-site/landing/assets/assistant/` üretir.
Paketleme izin verilen backend dosya türü/yollarını doğrular; site PHP şablonları,
CSS, JS ve görsel asset'leri ortak pakette reddedilir.

`web-data-service` paket/arşiv ve public veri sınırını; `showcase-website`,
`web-storefront`, `web-dealer-portal`, `web-widget-module` ve `marketing-website`
gerçek PHP API + site davranışını sınar. `publication-protocol` ve `web-form-api`
Desktop yayın/ingress zinciri ile exact acknowledgement regresyonlarını korur.
`public-translations`, `public-translations-ui`, `public-translations-web` sırasıyla
SQLite/AI/IPC/outbox, 10.000 kayıtlık gerçek SQLite + sınırlı DOM ve gerçek
Desktop → PHP → İngilizce demo/fallback zincirini doğrular.
