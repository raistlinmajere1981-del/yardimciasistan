# E-Ticaret V2 — yerel uygulama ve kalan kabul

2026-11-07. **Çalışan yerel kontrol noktası; V2 tamamlandı / yayına hazır kabulü verilmedi.**
Oturum: `01a1b6d7-fc73-7793-ad7a-20cd5d2d244c`. Push ve canlı deploy yok.

## Tek ticaret sahipliği

| Alan | Sahip / sözleşme |
| --- | --- |
| Fiyat ve sipariş | Hosting `online-order.php`, `dealer-order.php`, ortak `commerce-quote.php` ve `commerce-checkout.php`; Desktop `commerce-order-store.ts`. |
| Ödeme ve teslimat | Desktop `commerce-order-payment.ts`, mevcut `commerce-order-fulfillment-service.ts`; müşteri bildirimi `commerce-order-payment.php`. |
| Kalıcı taşıma | Mevcut `web_orders` sequence/cursor/ACK ve publication v3. Ödeme bildirimi aynı inbox'a ayrı, idempotent olay olarak girer. İkinci Teknikel sipariş DB'si, poller veya outbox yoktur. |
| Banka/teslimat/sözleşme ayarları | `commerce_checkout_settings`; mevcut Teslimat ve Gönderim hizmetinin bağımsız draft, Kaydet/Vazgeç ve çıkış koruması. Aynı `online_catalog` durable publication'ına katılır. |
| Durum yayını | Mevcut özel `dealer_access_private` publication'ında `web_order_statuses`. Konuk/müşteri/bayi okuması hosting'deki özgün sipariş sahipliğini doğrular; bu alan halka açık kataloğa girmez. |
| Tarayıcı | `YaCommerce.shared()` aynı API kökü için sayfada tek controller. Ana sayfa, katalog, detay, mini sepet, cart, hesap ve checkout aynı sahip kapsamını / `YaCartDraft` kaydını kullanır. Hesaplar arasında özel taslak taşınmaz. |
| Hesap/e-posta | Mevcut `YaAccount`, Argon2id, tek kullanımlık tokenlar ve rotasyonlu oturum. Tek TLS SMTP transport ve `commerce_mail_outbox`. |
| Teknikel | Yalnız `canonical/site/` sunumu ve ortak şablonun `0.8.0` kopyası. Image Inspector, karşılaştırma, favoriler, vitrin ve slider korunur. |

## Kabul edilen checkout kaydı

`POST api/checkout-quote.php` ve yetkili `api/dealer/checkout-quote.php`, ürün ID/miktar ve normalize teslimat için sunucu teklifi döndürür. Bayi fiyatı yalnız yetkili özel katalogdan gelir. Kamuya açık fiyat endpoint'i bayi fiyatı seçmez.

`POST api/order.php` / `api/dealer/order.php` artık `paymentMethod: bank_transfer`, `quoteId`, `consent: {preliminary:true, agreement:true, marketing:boolean}` ister. Eski katalog formuna ikinci bir kabul yolu eklenmedi. Güncel fiyat/teslimat/banka/sözleşme özeti değişmişse `409 quote_changed`; yeni inceleme ve onay gerekir. Daha önce kabul edilmiş idempotency receipt, sonradan fiyat veya koşullar değişse de eski sonucu döndürür.

Hosting `payload_json.checkout` sürüm 2; para birimi, iki ondalık ölçeği, ürün adı/birim/SKU/vergi/miktar/birim fiyat/satır toplamları, `subtotal_minor`, ayrı `delivery_fee_minor`, kesin `total_minor`, teslimat yöntemi, banka talimatı, demo işareti, sözleşme metinleri/sürümü, kabul zamanı ve ayrılmış izinleri saklar. İstemci parası kullanılmaz. `quoted_total` ürün ara toplamıdır; ödeme tutarı `total_minor` alanıdır.

Okunabilir benzersiz numara: `YA-YYYYMMDD-XXXXXXXXXX`. SQLite benzersiz indeksi çakışmayı reddeder. Konuk yanıtındaki `order_access_token`, siparişe bağlı sunucu HMAC'idir; URL'ye veya publication'a yazılmaz. Kayıtlı müşterinin / bayinin sahipliği oturumdan çözülür.

Desktop, yetkili hosting snapshot'ının satır/miktar/tutar hesabını doğrular ve **yeniden fiyatlandırmaz**. Ürün fiyatı/aktifliği değişse bile kabul edilmiş tutar ve talimat korunur. Tekrarlanan ingress mevcut siparişi döndürür; sonradan bayi izni kalkması daha önce içe alınmış ödenmiş siparişi ikinci bir ret kaydına çeviremez. Yeni bayi taleplerinde ticari yetki yeniden doğrulanır.

Desktop şeması `commerce_orders` üzerinde `order_number`, `checkout_snapshot_json`, `delivery_fee`, `payment_status`, `delivery_status`; ayrıca `commerce_order_events` içerir. Satışa dönüşümde `commerce_sales.delivery_fee` ayrıdır. Kabul veya müşteri bildirimi satış/tahsilat oluşturmaz; mevcut fulfillment sahibi, doğrulanmış havaleyi bir defa satışa dönüştürür. Sipariş/ödeme/teslimat durumları ayrıdır.

## Akış ve güvenlik

- Rotalar: `cart`, `checkout-customer`, `checkout-delivery`, `checkout-payment`, `checkout-review`, `checkout-result`. `?page=...` mevcut router ile kullanılır. `/sepet/` cart'a gider. Bu rotalar nav/sitemap'e eklenmez, noindex'tir.
- Konuk checkout SMTP veya hesap URL ayarı olmadan çalışır. Teslimat seçenekleri yayından gelir; kargo bedeli `null` ise shipping checkout kapanır. Pickup bedeli açıkça sıfırdır. TRY/EUR/USD/GBP ve pozitif havale toplamı desteklenir; sıfır tutarlı checkout henüz ayrı bir ödeme sözleşmesine sahip değildir.
- Ana sayfa ayrı Sepetim bloğu ve katalog sağ formu kaldırıldı. Üst menü dialog'u masaüstünde kompakt panel, mobilde alt drawer; ayrı cart miktar/silme/boş/satıştan kalkmış ürün durumlarını gösterir. Eski yerel fiyat sipariş parası değildir.
- Review gerekli iki kabul ile isteğe bağlı pazarlama iznini ayırır. DEMO metinler ticari kullanıma hazır olarak sunulmaz. DEMO IBAN'ı geçersiz olmalıdır; gerçek modda IBAN biçim ve mod-97 doğrulaması vardır.
- `POST api/order-payment.php`, JSON/custom header ve sahiplik doğrulamasıyla `read` / `report` sunar. Konuk bearer siparişe bağlıdır. Müşteri/bayi için oturum gerekir. Bildirim `verification_pending` olur; `paid` yalnız yetkili Desktop owner işlemiyle verilir. Retten sonra yeni bildirim bir sonraki inceleme turuna bağlanır; aynı turdaki tekrar ikinci olay yaratmaz.
- Desktop mevcut Siparişler alanında numara araması, banka durumu, yetkili onay/ret, hazırlama, iptal öncesi/sonrası ödeme durumu ve olay geçmişi vardır. Onaylar trusted renderer + açık uygulama + owner yetkisi + persisted capability + güncel kayıt koşulunu doğrular. İşlem kimliği aynı niyetle tekrarlandığında olay çoğalmaz. Ret/iade açıklaması zorunludur.
- Mevcut sipariş onayı, ödeme onayından ayrıdır. V2 fulfillment, doğrulanmış banka ödemesi olmadan çalışmaz. Var olan İndirim/Puan motoru sabit web tutarına yeni indirim ekleyemez.
- Kart seçeneği Yakında/pasiftir; PAN/CVV toplanmaz. Duyuru afişlerinin indirim/taksit/Puan/ücretsiz kargo vaatleri etkin kural değildir; Teknikel bunu DEMO olarak açıklar.
- Hesap kayıt/doğrulama/reset güvenliği korunur. SMTP veya token şifreleme anahtarı eksikse `passwordRegistration:false`; misafir checkout açık kalabilir. Yeni doğrulanmış hesaplar mevcut customer-account ingress ile bağlanır. Aynı e-postalı mevcut müşteri çatışmasında otomatik yetki devri yapılmaz: Customer Workspace'teki açık eşleştirme gerekir. Böyle bir kaydın Desktop sipariş intake'ı bağlama kadar bekleyebilir.
- Hesap sayfasındaki Ürünlere göz at düğmesi kaldırıldı; kendi siparişindeki banka talimatı ve havale bildirimi gösterilir. Oturum yenileme/çıkış/diğer hesapların fiyatlarına erişim mevcut sınırlarla korunur.

## E-posta

Hesap doğrulama/reset dahil tüm iletiler aynı kalıcı outbox/worker'dadır. Token içeren gövde AES-256-GCM ile, SQLite dışında tutulan `YA_ACCOUNT_MAIL_ENCRYPTION_KEY` kullanılarak şifrelenir. Worker tokenın süre/tek kullanım/değiştirilme koşulunu, hesap sürümünü ve hesap kapısını gönderimden hemen önce denetler; geçersiz iletiler `cancelled` olur. Düz token/URL kuyrukta veya logda saklanmaz.

Sipariş alındı ve banka talimatı birlikte gönderilir; ödeme bildirimi, onay/ret, hazırlama, sipariş onayı/iptali, teslim ve kaydedilen banka iadesi olayları aynı kuyruğa bağlanır. İşletme alıcısı isteğe bağlı `YA_COMMERCE_NOTIFICATION_EMAIL` ayarıdır. Ağ üzerinden SMTP domain işleminin dışındadır; SMTP hatası kabul edilmiş siparişi silmez.

Pending/sending/sent/failed/cancelled, lease, geri çekilme ve sekiz deneme sınırı vardır. SMTP DATA kabulünden sonraki bağlantı/DB kaybında mutlak tek gönderim garantisi yoktur; sabit Message-ID bunu çözmez. Ayrıntı: [SMTP_SETUP.md](SMTP_SETUP.md).

## Aşamalar ve açık işler

| Aşama | Gerçek durum |
| --- | --- |
| A | Kabul anı tutar/banka/sözleşme, bağımsız durumlar ve yayın/ingress uygulandı; gerçek PHP/SQLite testleri var. Restore snapshot alanları genişletildi; V2 restore uçtan uca kabulü ayrıca tamamlanmalı. |
| B | Tek controller, mini sepet ve ayrı cart uygulandı; gerçek browser/API ve 46 Teknikel regresyonu geçti. |
| C | Ayrı checkout rotaları ve mevcut güvenli hesap akışı bağlandı. Kayıtlı müşteri API/SQLite + hesap SMTP regresyonu geçti. Kayıtlı müşteri ve bayi için bütün checkout'un yeni sayfalarda browser kabulü henüz tamamlanmadı; Hesabım son tasarım incelemesi de açık. |
| D | Müşteri bildirimi, mevcut Desktop yönetimi ve durum yayını uygulandı. Yetki/idempotency/onay/hazırlama/teslim servis zinciri test edildi. Yeni Desktop ödeme kontrollerinin Electron UI E2E'si; teslim sonrası iadenin stok/finans/ödeme ile tek işlemde tamamlanması **açık**. Yalnız iptal edilmiş, henüz fulfillment yapılmamış havalenin işletmede yapılmış iadesini kaydetme mevcut. |
| E | Şifreli token kuyruğu, SMTP transport, sipariş ve durum olayları bağlı; süre/iptal/lease/retry testleri var. Gerçek gönderen/DNS/cron ve dış alıcı doğrulaması yapılmadı. |
| F | Teknikel 46 görsel/etkileşim regresyonu, 390/768/1440 gerçek konuk checkout'u ve Settings platform regresyonu geçti. Tüm 20 kabul senaryosunun eksiksiz Desktop/Electron/browser matrisi henüz bitmedi. |
| G | Geçici temiz SQLite ve backend arşiv sözleşmesi test edildi. Mevcut çalışma/canlı DB silinmedi. Diğer şablon kopyalarının güncellenmesi, son temiz kurulum/restore kabulü ve uygulama release paketleri henüz hazırlanmadı. |

Bu kontrol noktası **V2 tamamlandı değildir**. Sonraki bounded slice: önce teslim sonrası iade sahibini mevcut stok/finans işlemiyle tamamla; ardından yeni Desktop ödeme/ayar UI'si, kayıtlı müşteri/bayi browser checkout ve V2 restore kabulünü bitir. Bunlar geçmeden installer / koordineli yayın kabulü verilmemeli.

## Kurulum ve koordineli yayın hazırlığı

- Desktop mevcut schema imzası değişmiştir; proje demo DB'si için açık temiz kurulum/reseed gerekir. Var olan backup/restore/legacy-data korumaları kaldırılmadı. Bu oturumda yalnız geçici test DB'leri kuruldu/silindi.
- Hosting eski `commerce_mail_outbox` tablosunda `message_kind` yoksa `commerce_v2_schema_reset_required` ile kapanır. Otomatik ALTER/backfill veya veri silme yoktur. Gerçek sunucudaki reset/reseed, korunan `account.local.php` sırları ve publication source kurulumu birlikte planlanmalıdır.
- Desktop yeni hosting `commerce_checkout_v2` / `commerce_payment_events_v1` yeteneklerini bekler. API/site/Desktop farklı sürümlerde kalıcı olarak kullanılmamalıdır.
- Ortak şablon kaynağı ve Teknikel yerel canonical kopyası `0.8.0` adayıdır. Bayi Android uygulamasının `dealer/order` isteği de yeni quote/consent sözleşmesine geçirilmeden APK/API birlikte yayımlanmamalıdır; bu istemci bu oturumda güncellenmedi. BlackSea, Gündoğdu ve demo kopyaları bu oturumda yükseltilmedi; onların publication/checkout tüketicileri de güncellenmelidir.
- Kalan kabul → diğer yerel şablon tüketicileri → temiz demo kurulum/restore → uygulama ve API/site paketlerinin preflight'ı → kullanıcının kabulü → açık onayla koordineli Desktop/API/Teknikel yayın sırası. Şu anda push veya canlı deploy yetkisi yoktur.

Test komutları ve gerçek son kanıtlar devam kaydında ve ilgili smoke dosyalarında tutulur. `verify:pre-main`, `verify:release`, `verify:full` bu oturumda çalıştırılmadı.
