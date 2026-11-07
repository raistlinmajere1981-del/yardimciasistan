# E-Ticaret V2 — yerel uygulama ve kalan kabul

2026-11-07. **Teknikel + ortak API + Desktop satış akışı yerelde doğrulandı. Koordineli V2 yayın paketi henüz tamamlanmadı.**
Oturum: `01a1b6d7-fc73-7793-ad7a-20cd5d2d244c`. Push ve canlı deploy yok.

## Tek ticaret sahipliği

| Alan | Sahip / sözleşme |
| --- | --- |
| Fiyat ve sipariş | Hosting `online-order.php`, `dealer-order.php`, ortak `commerce-quote.php` ve `commerce-checkout.php`; Desktop `commerce-order-store.ts`. |
| Ödeme sağlayıcısı | Hosting `YaCommercePaymentProvider`; etkin uygulama `YaCommerceBankTransferProvider`. Gelecek hosted kart entegrasyonu bu sınırda tasarlanır; şu an kart/PAN/CVV ve başarılı kart ödemesi yoktur. |
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
- Teslim edilmiş web siparişinin tam iadesi `market-sale-full-refund.ts` içindeki mevcut satış iadesi yazarını kullanır. İstemci yalnız sipariş ID, idempotent işlem ID ve gerekçe verir; satış, tutar, müşteri, depo ve özgün maliyet DB’den çözülür. Owner + Satış/Sipariş/Online Satış yetkileri yeniden denetlenir. Özgün gelir/satış korunur, teslimat dahil tek finans çıkışı ve özgün stok hareketinin tersi aynı transaction’da kaydedilir. Sipariş `cancelled`, ödeme `refunded`, teslimat `returned` olur; `order_refunded` olayı yetkili/gerekçe ile kalır. İşletme ürünlerin geri alındığını ve banka iadesinin gerçekten yapıldığını onaylar; uygulama bankadan para göndermez. Sonucu belirsiz komut ekran kapanıp açılsa da korunur. Mevcut hızlı satış iade API’si web siparişlerini kabul etmez. Kısmi iade bu sürümün kapsamında değildir.
- Mevcut sipariş onayı, ödeme onayından ayrıdır. V2 fulfillment, doğrulanmış banka ödemesi olmadan çalışmaz. Var olan İndirim/Puan motoru sabit web tutarına yeni indirim ekleyemez.
- Kart seçeneği Yakında/pasiftir; PAN/CVV toplanmaz. Duyuru afişlerinin indirim/taksit/Puan/ücretsiz kargo vaatleri etkin kural değildir; Teknikel bunu DEMO olarak açıklar.
- Hesap kayıt/doğrulama/reset güvenliği korunur. SMTP veya token şifreleme anahtarı eksikse `passwordRegistration:false`; misafir checkout açık kalabilir. Yeni doğrulanmış hesaplar mevcut customer-account ingress ile bağlanır. Aynı e-postalı mevcut müşteri çatışmasında otomatik yetki devri yapılmaz: Customer Workspace'teki açık eşleştirme gerekir. Böyle bir kaydın Desktop sipariş intake'ı bağlama kadar bekleyebilir.
- Hesabım giriş/kayıt/kurtarma seçeneklerinde tek form gösterir; alanlar görünüm değişiminde korunur. Ürünlere göz at düğmesi kaldırıldı; kendi siparişindeki Türkçe ödeme/teslimat durumu, kesin tutar, banka talimatı, kopyalama ve havale bildirimi gösterilir. Bildirim sonrası detay yeniden okunur. Oturum yenileme/çıkış/diğer hesapların fiyatlarına erişim mevcut sınırlarla korunur.

## E-posta

Hesap doğrulama/reset dahil tüm iletiler aynı kalıcı outbox/worker'dadır. Token içeren gövde AES-256-GCM ile, SQLite dışında tutulan `YA_ACCOUNT_MAIL_ENCRYPTION_KEY` kullanılarak şifrelenir. Worker tokenın süre/tek kullanım/değiştirilme koşulunu, hesap sürümünü ve hesap kapısını gönderimden hemen önce denetler; geçersiz iletiler `cancelled` olur. Düz token/URL kuyrukta veya logda saklanmaz.

Sipariş alındı ve banka talimatı birlikte gönderilir; ödeme bildirimi, onay/ret, hazırlama, sipariş onayı/iptali, teslim ve kaydedilen banka iadesi olayları aynı kuyruğa bağlanır. İşletme alıcısı isteğe bağlı `YA_COMMERCE_NOTIFICATION_EMAIL` ayarıdır. Ağ üzerinden SMTP domain işleminin dışındadır; SMTP hatası kabul edilmiş siparişi silmez.

Pending/sending/sent/failed/cancelled, lease, geri çekilme ve sekiz deneme sınırı vardır. SMTP DATA kabulünden sonraki bağlantı/DB kaybında mutlak tek gönderim garantisi yoktur; sabit Message-ID bunu çözmez. Ayrıntı: [SMTP_SETUP.md](SMTP_SETUP.md).

## Aşamalar ve açık işler

| Aşama | Gerçek durum |
| --- | --- |
| A | Kabul anı tutar/banka/sözleşme, bağımsız durumlar ve yayın/ingress uygulandı; gerçek PHP/SQLite testleri var. V2 restore testi gerçek SQLite/PHP ve normal coordinator ile numara/banka/sözleşme/tutar snapshot’ının yedekten farklı olsa da korunmasını doğruladı. Mevcut restore canonical karar sahipliği değişmedi. |
| B | Tek controller, mini sepet ve ayrı cart uygulandı; gerçek browser/API ve 46 Teknikel regresyonu geçti. |
| C | Ayrı checkout rotaları ve mevcut güvenli hesap akışı bağlandı. Kayıtlı müşteri (390px) ve bayi (1440px) gerçek browser/SQLite/TLS SMTP ile kayıt/doğrulama, giriş, checkout, özel fiyat, geçmiş, talimat ve bildirim kabulünü geçti. Şifre sıfırlama ve yeni parola ile giriş browser’da geçti. Hesabım görünümü gözden geçirildi. |
| D | Müşteri bildirimi, mevcut Desktop yönetimi ve durum yayını uygulandı. Yetki/idempotency/onay/hazırlama/teslim servis zinciri test edildi. Gerçek Electron + IPC + preload ile kilitli onayın reddi, ödeme doğrulama, sipariş onayı, hazırlama, teslim, tam iade ve kayıp commit yanıtından ekran değişimi/yenileme sonrası aynı işlemle kurtarma geçti. Teslimat bedeli dahil iade ve audit hatasında bütün işlemin rollback’i gerçek DB testinde geçti. |
| E | Şifreli token kuyruğu, SMTP transport, sipariş ve durum olayları bağlı; süre/iptal/lease/retry testleri var. Gerçek gönderen/DNS/cron ve dış alıcı doğrulaması yapılmadı. |
| F | Teknikel 46 görsel/etkileşim regresyonu, 390/768/1440 gerçek konuk checkout'u ve Settings platform regresyonu geçti. Ek olarak Image Inspector/karşılaştırma/storefront 12 testi, 46 satış iade regresyonu ve 331 korumalı IPC’nin üretim lock taraması geçti. Ayrıntılı kabul eşlemesi aşağıda; her akışın her cihazda çapraz kombinasyonu çalıştırılmadı. |
| G | Geçici SQLite ve hosting arşiv sözleşmesi test edildi; çalışma/canlı DB silinmedi. Linux AppImage/API/Teknikel inceleme adayları yerelde. QR Menü–Masa Siparişi geliştirmesinden önce Bayi Android V2 quote/consent, havale bildirim/okuma kodu ve BlackSea/Gündoğdu/demo ortak 0.8.0 şablonları **yerelde** hazırlandı. Yeni Windows installer, sürüm artırımı, demo reseed ve koordineli deploy sonraki QR Menü şema/şablon değişiklikleriyle birlikte yapılacak. |

Teknikel’in temel müşteri/işletme kabul zinciri çalışıyor. Bayi Android ve tüm yerel şablon tüketicilerinin V2 **geliştirme uyumu** sağlandı. **Bütün V2 yayın paketi tamamlandı değildir.** Sürüm yükseltimi, Windows x64/x86 release kurulumları, demo veri/ZIP yeniden üretimi, tam pre-main/release kontrolü, gerçek SMTP/DNS/worker ve sunucu kurulum kabulü, QR Menü–Masa Siparişi geliştirmesinin DB/şablon değişikliklerinden **sonra** yapılacak. Bu engeller kapanmadan push/deploy yok.

## QR Menü geliştirmesi için hazır yerel sınır — 7 Kasım 2026

- Tek ticaret sahibi, sunucu fiyat teklifi ve kalıcı sipariş kuyruğu değişmeden korunacak. Masa siparişi sisteme eklenirken paralel «masa sipariş DB» veya ikinci checkout motoru türetilmemeli; masa kimliği, QR güvenliği, onay ve sunucu otoritesi için yeni bir sözleşme ayrıca tasarlanacak.
- Bayi Android V2 API sözleşmesi için **76/76 JVM birim testi** ve bağlı telefonda `scripts/smoke-dealer-android-device.mjs` **PASS** (gerçek izole HTTPS/PHP/SQLite): teklif, bayi fiyatı, zorunlu onay, teslimat, kabul, idempotent receipt, havale bildirimi/okuma, fiyat güncellemesi, erişim düşürme, cookie yenileme, çevrimdışı taslak ve yeniden başlatma. Fiziksel fixture özel `com.yardimciasistan.dealer.fixture` paketini iş bitiminde kaldırır, mevcut Bayi APK'sını değiştirmez. Fotoğraf motorunun ayrıntılı cihaz testi `packages/image-inspector/test/device.mjs` tarafından **ayrı** yapılır; kamera gerçek sahibiyle çekilip insan/TalkBack kabulü yapıldı iddiası yoktur.
- Yerelde BlackSea `622fd18`, Gündoğdu `723085d`, demo `89d2b68a` kontrol noktaları hazır. İlgisiz Admin ve BlackSea yerel değişiklikleri korunur.
- QR Menü değişikliği muhtemelen `schema.sql` ve ortak şablon manifestini değiştireceğinden **bu aşamada** mevcut canlı DB, demo ZIP, uygulama sürümleri, installer ve hosting dosyalarını yeniden kurma.

## Bu devam diliminde çalıştırılan kabul

| Senaryolar | Kanıt |
| --- | --- |
| 1–4: home/katalog/mini sepet, miktar/silme/boş, bağımsız cart | `node scripts/smoke-commerce-checkout.mjs --desktop-ui`; 390/768 browser ve gerçek PHP/SQLite. Önceki 1440 kabulü de geçti. |
| 5: misafir checkout | Aynı test; SMTP ve hesap URL’si olmadan sipariş ve havale bildirimi. |
| 6–8: müşteri/bayi checkout, hesap kayıt/doğrulama/reset | `node scripts/smoke-commerce-checkout.mjs --members --mobile-only`; gerçek browser + TLS SMTP + SQLite; müşteri 390, bayi 1440. |
| 9: teslimat ve kesin toplam | `node scripts/smoke-commerce-checkout.mjs --shipping`: 246,90 ürün + 14,99 kargo = 261,89; aynı tutarın stok/finans tam iadesi. Yapılandırılmış fixture taşıyıcı test hesabı kullanılır; gerçek kargo servisine gönderim yapılmaz. |
| 10–12: havale, numara/talimat/bildirim | Checkout ve üyeli browser testleri; bildirim `verification_pending`, kabul anı banka/tutar korunur. |
| 13–14: owner ödeme onayı, çevrimdışı intake | `--desktop-ui`: gerçek Electron/IPC/preload + PHP/SQLite; masaüstü intake’tan önce kayıt hosting’de tutulur, ACK tekrarı sıfırdır. |
| 15–16: e-posta/tekrar isteği | SMTP yapılandırılmamışken sipariş korunur; `smoke-web-order-submission.mjs`, `smoke-web-orders-storage.php` ve hesap/outbox regresyonlarının önceki sonuçları; bu dilimde sunucu sipariş regresyonu tekrar geçti. |
| 17–18: bayi fiyatı izolasyonu / pasif kart | Üyeli browser testi 123,45 perakende ve 90,00 bayi fiyatı; ayrı geçmişler. API kart reddi `smoke-web-order-submission.mjs`, browser kart disabled. |
| 19–20: duyarlı düzen ve mevcut özellikler | Teknikel `canonical-theme.mjs` 46/46 (320/390/768/1024/1440); `canonical-live-entry.mjs` 390/1440; Inspector/karşılaştırma/storefront 12/12. |
| İade/idempotency/rollback | Checkout SQLite testi + `--desktop-ui`; önceki satış/Puan iadesi sınırları `node --test scripts/smoke-market-sale-full-refund.mjs scripts/smoke-market-sale-full-refund-preview.mjs` 46/46. |
| Restore / temiz paket | `node scripts/smoke-publication-protocol.mjs`; `smoke-web-data-service.mjs`; `smoke-desktop-package.mjs --package-root artifacts/commerce-v2-review-elrbptew/desktop/linux-unpacked`. |

Renderer ve Electron TypeScript, hedefli ESLint/PHP lint ve renderer Vite build geçti. Büyük doğrulama grupları çalıştırılmadı. Teste özel arıza enjeksiyonları dışında gerçek satış/fiyat/stok/finans/SMTP yolları kullanılır; gerçek iyzico/PayTR/kargo/harici SMTP teslim kabulü iddia edilmez.

## Yerel inceleme paketleri

`artifacts/commerce-v2-review-elrbptew/` altında:

- `desktop/YardimciAsistan-2.3.1-x86_64.AppImage`, ayrıca `desktop/linux-unpacked/`: Linux yerel adayı; temiz açılış smoke’u geçti. Windows installer değildir. Paketlenen Companion APK mevcut sürüm kaynağıdır; yeni Bayi Android sürümü değildir.
- `api/yardimci-asistan.zip` ve `.tar.gz`: resmi paketleyiciyle hazırlanmış 115 API dosyası; özel kurulum sırları ve çalışma DB’si dahil değildir. Kurulum hedef ayarları dışarıda tamamlanır.
- `teknikel-site.zip`: canonical ortak dosya/asset hash kontrolleri ve site paket preflight’ı uygulanmış sunum adayı.
- `shared-template-common.zip`: ortak `0.8.0` dosyaları ve manifest; korunan site/locale alanları için otomatik üzerine yazma paketi değildir.
- `MANIFEST.json`: yerel aday kimliği ve SHA-256 dosya kayıtları. Diğer tüketicilerin salt okunur üç yönlü güncelleme planları da aynı dizindedir.

Bu arşivler yerel inceleme içindir; upload/push/deploy yapılmadı.

## Kurulum ve koordineli yayın hazırlığı

- Desktop mevcut schema imzası değişmiştir; proje demo DB'si için açık temiz kurulum/reseed gerekir. Var olan backup/restore/legacy-data korumaları kaldırılmadı. Bu oturumda yalnız geçici test DB'leri kuruldu/silindi.
- Hosting eski `commerce_mail_outbox` tablosunda `message_kind` yoksa `commerce_v2_schema_reset_required` ile kapanır. Otomatik ALTER/backfill veya veri silme yoktur. Gerçek sunucudaki reset/reseed, korunan `account.local.php` sırları ve publication source kurulumu birlikte planlanmalıdır.
- Desktop yeni hosting `commerce_checkout_v2` / `commerce_payment_events_v1` yeteneklerini bekler. API/site/Desktop farklı sürümlerde kalıcı olarak kullanılmamalıdır.
- Ortak `0.8.0` dosyaları Teknikel, BlackSea, Gündoğdu ve demo siteye yerelde eşitlendi; gerçek site konumlarında kaynak/asset/çeviri paritesi **5/5 geçti**. Siteye özel Türkçe `cart.checkout` değerleri korunurken yeni checkout anahtarları eklendi. Demo üç yönlü planın 45 «çatışması» gerçek içerik sapması değil, demo'nun farklı kök yolundan kaynaklanan eski hash eşleştirme hatasıydı; her eski ortak dosyanın hash'i kendi eski manifestine uyuyordu, kör kopyalama yapılmadı.
- Bayi Android, yetkili `dealer/checkout-quote` ile banka ve yasal koşulları alır, iki zorunlu sözleşme kabulünden önce kalıcı pending oluşturmaz. Onay sonrası `quoteId`/`paymentMethod`/`consent` ile **aynı idempotency** kimliğini dondurur; kayıp ağ yanıtında mevcut `dealer/receipt` kurtarma yolunu kullanır. `order-payment` ortak sahiplik endpoint'inden havale bildirim/okuma da yapar; işletme onayı olmadan «ödendi» demez. Bu istemci şu anda sadece yerel geliştirmedir; yeni API ile **birlikte** yayınlanmalıdır.
- **QR Menü öncesi yerel kapanış:** Bayi Android/siteler/ortak API geliştirme uyumu ve regresyonlar; ürün sürümü hâlâ `2.3.1`. Final yeni sürüm çalışmalarına girme.
- **QR Menü sonrası tek yayın hattı:** Yeni DB/şablon sözleşmesi → yeni ürün sürümü ve Android versionCode → güncel demo ZIP/DB → Windows x64/x86 installer ve Android release APK → tam pre-main/release → SMTP/DNS/worker ve açık temiz sunucu kurulum planı → kullanıcı kabulü → koordineli Desktop/API/Teknikel/diğer siteler yayınları. Burada push/canlı deploy yok.

Test komutları ve gerçek son kanıtlar devam kaydında ve ilgili smoke dosyalarında tutulur. `verify:pre-main`, `verify:release`, `verify:full` bu oturumda çalıştırılmadı.
