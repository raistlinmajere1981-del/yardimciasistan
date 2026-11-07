# E-Ticaret V2 — mimari envanter ve doğrulama

2026-11-07. Durum: **kısmi uygulama; V2 kabulü ve yayın yapılmadı.**

## Mevcut sahipler

| Alan | Mevcut kaynak | Bulgu / yapılacak iş |
| --- | --- | --- |
| Canonical masaüstü veri | `apps/desktop-app/db/schema.sql`, `electron/commerce-order-store.ts` | Ürün, fiyat, müşteri ve sipariş sahibi. Web girişinde güncel fiyatı tekrar çözüyor. V2 için kabul edilen fiyatın ve teslimat koşullarının korunması henüz tamamlanmadı. |
| Hosting veri | `firm-template/web-module/lib/storage.php` | Tek SQLite; `web_orders`, kapsamlı idempotency receipt, sıra/cursor/ACK ve kaynak epoch fencing. İkinci site veritabanı kurulmadı. |
| Sipariş girişi | `lib/online-order.php`, `lib/dealer-order.php` | Perakende/müşteri ve yetkili bayi uçları aynı normalizasyon ve fiyat hesaplayıcısını kullanır. Henüz ödeme kesinleştiren satış sözleşmesi değildir. |
| Senkron | `electron/online-order-ingress-service.ts`, `WebSyncIngress`, publication v3 | Masaüstü kapalıyken kayıt tutulur. Mevcut durable outbox/exact ACK yolu korunur. Yeni ödeme olaylarının bu yola eklenmesi gerekiyor. |
| Tarayıcı | `web-site-template/public/assets/core/commerce.js` | `YaCommerce`, `YaAccount`, `YaCartDraft`; sahip kapsamı, belirsiz istek kurtarma, fiyat izolasyonu. Mini sepet için aynı controller örneğinin sayfa render bileşenlerince paylaşılması gerekiyor. |
| Teknikel sunumu | `teknikel_web/canonical/site/`, ortak `canonical/core/` | Ana sayfa kartları ortak kart renderer'ını kullanıyor. Ana sayfa ve katalogda ayrı sepet sunumları var; checkout halen form. Ayrı rotalar ve mini sepet yapılmadı. |
| Kimlik | `lib/customer-account*.php`, `api/account/` | Kayıt/doğrulama, Argon2id, parola sıfırlama, rotasyonlu oturum, profil, kendi siparişleri mevcut. SMTP yokken `passwordRegistration:false`; kayıt formunun gizlenmesinin nedeni bu. Yeni müşterinin Desktop bağlanmasını bekleyen `customer_link_pending` sınırı ayrıca çözülmeli. |
| E-posta | `customer-account-mail.php`, `commerce-mail.php` | Tek TLS SMTP transport. Hesap e-postaları halen senkron; perakende sipariş alındı olayı kalıcı kuyrukta. Diğer olay şablonları ve hesap token kuyruğu yapılmadı. |
| Hosting | `scripts/deploy-teknikel-web-module.sh` | Hedef Alwaysdata. Mevcut korumalı `config/account.local.php` sırları paketlenmez. Bu çalışmada uzaktaki ayarlar okunmadı/değiştirilmedi. |

## Bu uygulamada doğrulanan değişiklikler

- Perakende/bayi için tek `ya_commerce_quote`: sunucu yayınından fiyat, ürün ve miktar; adet/paket/kutu için tam sayı; karışık para birimlerini reddetme; tam sayı minor-unit satır hesabı ve aralık kontrolü. İlk destek TRY/EUR/USD/GBP (iki ondalık); farklı minor-unit ölçeğindeki para birimleri açık sözleşme eklenene kadar reddedilir.
- Kabul anı fiyat teklifi mevcut `web_orders.payload_json.quote` içinde saklanır. İstemcinin fiyat alanları bu kaynağa girmez. Tekrar kabul yanıtı eski tutarı korur. `quoted_total` **ürünler toplamıdır**; teslimat bedeli veya ödenmesi gereken kesin tutar değildir.
- Perakende sipariş/receipt/e-posta olayı aynı SQLite işleminde yazılır. Ağ üzerinden e-posta bu işlemin dışında gönderilir. Gönderim başarısızlığı siparişi silmez.
- `commerce_mail_outbox`: benzersiz olay/alıcı kimliği, içerik çatışması kontrolü, pending/sending/sent/failed, lease, bekleme ve sekiz deneme sınırı. Hata kayıtları alıcı/mesaj/sır içermez.
- CLI worker: `php /mutlak/modul/yolu/lib/commerce-mail-worker.php`. HTTP çağrısı 404. Kuyruk temiz kurulum şemasında ve runtime reset kapsamındadır; paketleme gerekli dosyaları doğrular.
- SMTP kabulü, gelen kutusuna teslim kanıtı değildir. `sent` SMTP sunucusunun DATA kabulünü ifade eder. Normal olay tekrarları mükerrer gönderim üretmez. SMTP'nin kabulünden sonra bağlantı/DB kaybında mutlak tek-gönderim garantisi yoktur; sabit Message-ID bu sınırlamayı ortadan kaldırmaz. Kesin sağlayıcı idempotency'si için gelecekte sağlayıcı API adaptörü gerekir.
- Hesap doğrulama/sıfırlama tokenları bu kuyruğa düz metin yazılmaz. Bu iletileri kuyruğa almak için süre/iptal denetimi ve sunucu anahtarıyla şifrelenmiş içerik tasarımı gereklidir.

## Aşamaların gerçek durumu

| Aşama | Durum |
| --- | --- |
| A — ortak mimari/veritabanı | Kısmi: fiyat teklifi ve mail outbox var; kesin satış, ödeme/teslimat sözleşmesi yok. |
| B — tek sepet/mini sepet/sepet sayfası | Yapılmadı. |
| C — hesap sunumu/ayrı checkout rotaları | Yapılmadı; mevcut hesap altyapısı regresyonla doğrulandı. |
| D — havale/masaüstü ödeme yönetimi | Yapılmadı. |
| E — e-posta | Kısmi: perakende sipariş alındı ve işletme bildirimi, tek transport ve worker. Banka/ödeme/kargo/iptal/iade olayları bağlı değil. Bayi sipariş bildirimi bağlı değil. |
| F — tam kabul/temiz kurulum/deploy/Git | Tamamlanmadı. Yerel dar testler aşağıda. |

Sonraki uygulama sırası: canonical siparişe sunucuda kabul edilen fiyat/teslimat ve okunabilir benzersiz numara; ayrı ödeme ve fulfillment durumları; yetkili/auditli/idempotent ödeme işlemleri; aynı publication/ingress ile senkron; ardından ortak controller ve checkout sayfaları. Hosting verisi ayrı bir Teknikel sipariş motoruna dönüştürülmemeli.

Gelecekteki banka ayarları işletme kaydı/publication'ından gelmeli. DEMO banka numarası açıkça geçersiz olmalı. Kart sağlayıcısı hosted/tokenized ödeme sunmalı; PAN/CVV toplanmamalı. Hukuki metin sürümü ve zorunlu kabul siparişe bağlanmalı; pazarlama izni ayrı alan olmalı. Bu çalışma hukuki metin hazırlamadı veya canlı ticaret uygunluğu iddia etmedi.

## Yerel doğrulama

Standart test dosyaları genişletildi; yeni test koşucusu eklenmedi:

- `node scripts/smoke-web-order-submission.mjs`: gerçek PHP/SQLite, fiyat enjeksiyonu, tam sayı miktar, yuvarlama, para birimi, fiyat değişimi sonrası tekrar, çift istek, receipt/outbox rollback, reset.
- `php scripts/smoke-web-orders-storage.php`: mail dedupe/çatışma, hata/backoff, başarı, tekrar, lease kurtarma, kalıcı failure ve transaction rollback.
- `node scripts/smoke-customer-accounts.mjs`: gerçek yerel TLS SMTP, kuyruk worker'ı, kayıt/doğrulama/oturum/şifre kurtarma ve yetki regresyonu.
- `node scripts/smoke-commerce-dealer-orders.mjs`, `node scripts/smoke-commerce-online-order-ingress.mjs`, `node scripts/test-account-order-receipt.mjs`: bayi/müşteri izolasyonu ve mevcut masaüstü ingress.
- `node scripts/smoke-web-data-service.mjs`: geçici temiz kurulumdan backend paketleri ve mevcut API sözleşmesi.
- `node scripts/php-lint.mjs`, `git diff --check`.

Bu liste test kapsamını tarif eder; son çalıştırma sonuçları devam kaydında tutulur. Mobil/klavye/ayrı checkout ve gerçek SMTP/DNS doğrulanmış değildir. Ortak sunum şablonu değiştirilmediği için Teknikel/Gündoğdu/Blacksea kopyalarına aktarım yapılmadı.
