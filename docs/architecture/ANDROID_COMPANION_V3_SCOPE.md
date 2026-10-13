# Android Companion v3 — kapsam ve sözleşme hazırlığı

Durum: **A veri/izin sözleşmesi, B1 operasyon özetleri ve B2 çevrimdışı sipariş detayı/kararı**. C/D çalışmaları ayrı bloklardır; milestone tam doğrulaması ayrıca yapılır.
Başlangıç incelemesi: 2026-10-12, `main` / `6f67f5b3`.
Hedef: Masaüstüyle **iş kuralı ve veri tutarlılığı**; masaüstünün bütün ekranlarını telefona kopyalamak değil.

## Ürün sınırı

- **Desktop**: kanonik veri, işletme/servis ayarları, kapsamlı yönetim, fiyat/ödeme/stok muhasebesi, kampanya editörü ve yayın motoru.
- **Companion**: Bugün/uyarılar, kısa saha işlemleri, müşteri iletişimi, sipariş kararı, stok/barkod işlemleri ve durum takibi.
- **Bayiye özel sipariş uygulaması**: ayrı ürün/kimlik/rol ve kullanıcı deneyimi; Companion içine bayi girişi eklenmeyecek.
- Ekran görünürlüğü **işletme capability'si AND cihazın etkin izni** ile belirlenir. Admin rolü kapalı capability'yi açamaz.
- Mevcut Java ekranları, bildirimler, kamera, action outbox, hosting ve yerel eşitleme yolları korunur. İşlevsel eşitleme sırasında geniş UI refactor yapılmaz.

## Kanonik sahipler ve mevcut sınırlar

| Kanonik alan | Mevcut kod | Durum |
| --- | --- | --- |
| Android operatör ekranları | `apps/android-app/src/main/java/com/yardimciasistan/android/{AndroidUiRules,AndroidShellController,AndroidWorkspaceCoordinator}.java` | Bugün, Müşteri, Pansiyon, Restoran, Market, Mesajlar var; kasa/rapor yetenekleri de kurallarda tanımlı. |
| Snapshot şeması | `packages/sync-core/index.ts` → `AndroidOperationsSnapshot` | Mevcut alanlar korunur; optional commerce/marketing durum modelleri A sözleşmesidir. |
| Kaynak ve redaksiyon | `apps/desktop-app/electron/{android-operations-snapshot,android-capability-projection}.ts` | Capability ve yeni domainlerde cihaz izni/server allowlist kırpması vardır. |
| Mutasyon | `packages/sync-core/android-policy.ts`, `apps/desktop-app/electron/android-action-router.ts` | Kalıcı outbox/receipt korunur; commerce confirm/cancel domain sahibine bağlıdır, marketing mutasyonu yoktur. |
| Ticari sipariş | `packages/shared/types/commerce.ts`, `apps/desktop-app/electron/commerce-order-store.ts` | `placed → confirmed`, uygun durumdan `cancelled`; `fulfilled` satış/finans/stok hattına bağlı, mobil ilk turun dışında. |
| Gönderi | `apps/desktop-app/electron/commerce-shipment-store.ts` | Siparişe bağlı ayrı yaşam döngüsü; ilk aşamada yalnız durum/takip bilgisi. |
| Bayi profili | `packages/shared/types/wholesale.ts`, `apps/desktop-app/electron/database/customer-store.ts` | Ticari kimlik/fiyat grubu kanonik müşteri alanı; mobilde ilk aşama salt-okunur. |
| Pazarlama | `packages/shared/types/{marketing,marketing-schedules,messaging-campaigns}.ts` | Desktop çalışma alanı ve takvim var; mobilde ilk aşamada yalnız yayın/işlem durumu ve hata. |
| Market | `apps/desktop-app/electron/{market-android-snapshot,android-capability-projection}.ts` | Mevcut 500 ürün sınırı ve retail-workspace görünürlük şartı yeni commerce sipariş veri akışının yerine kullanılmamalı. |

## Kararlaştırılan yetenek matrisi

| Alan | Companion v3 | Kapsam dışı / Desktop |
| --- | --- | --- |
| Bugün | Açık ticari sipariş, teslimat/gönderi uyarısı; başarısız pazarlama yayınına işaret; mevcut rezervasyon/iş uyarıları | Tüm raporlama ve ayrıntılı analiz |
| Müşteri/Bayi | Firma/unvan, bayi durumu, fiyat grubu, iletişim ve sipariş geçmişi **görüntüleme** | Bayi fiyatı/grubu, vergi ve ticari sözleşme düzenleme |
| Ticari Sipariş | Liste, detay, kalemler, kaynak ve teslimat bilgisi; yetkili kullanıcı için **onaylama / iptal** | Sıfırdan karmaşık toptan sipariş oluşturma, tahsilat, fulfillment, satış/ledger/stok kaydı |
| Kargo | Sipariş içinden gönderi durumu, takip kodu/bağlantısı, ilgili gecikme/başarısızlık bilgisi | Kargo sağlayıcısı bağlantısı, etiket, kayıt/iptal, gönderi oluşturma |
| Online Satış | İlgili yeni sipariş ve yayın durumunu izleme | Ürün yayınlama, katalog/fiyat toplu düzenleme |
| Pazarlama/Kampanya | Planlanan/gerçekleşen paylaşımın özeti, yayın başarısızlığı, taslak önizlemesi (yalnız güvenli özet) | Kampanya tasarımı, AI görsel üretimi, kanal kimlik bilgisi, otomatik yayın kararı, tam editör |
| Market/Restoran/Pansiyon | Çalışan operasyonlar, barkod, stok sayımı, mal kabul, adisyon ve rezervasyon akışları korunur | Tam mobil POS veya Desktop yönetim ekranlarının kopyası |
| Finans/Rapor | Yetkili kullanıcıya sınırlı günlük özet | Ayrıntılı cari hesap/ledger yönetimi, yeni genel finans yetkileri |
| Ses | Sonraki ayrı aşamada seçili alanlarda manuel STT/TTS | Her alanı otomatik dinleme/seslendirme |

**Terminoloji:** `food_service.orders` = masa adisyonu; `commerce.orders` = ticari sipariş. Aynı `order` etiketi altında yetki veya aksiyon karıştırılmaz. Mevcut ticari sipariş sisteminde ayrı `rejected` durumu bulunmadığı için mobilde `Reddet` adıyla gizli `cancelled` yazılmaz; mevcut domain dilinde `İptal` kullanılır.

## A — Uygulanan mobil veri ve işlem sözleşmesi

Kanonik taşıma türleri `packages/sync-core/android-companion.ts` içindedir.
`AndroidOperationsSnapshot.commerce` ve `.marketing` **optional** alanlardır.
Eksik alanlar Desktop/LAN/Hosting/Java'da boş model olur; eski istemciler bilinmeyen
alanları yok sayar. Restoranın `table_orders` alanı ve `table_order.*` izinleri ayrıdır.

| Projection | Kaynak sahibi | Mobil alanlar / sınır |
| --- | --- | --- |
| `commerce.orders` | `commerce-order-store` | ID, durum, kaynak enum'u, toplam/para birimi, teslimat yöntemi, placed/updatedAt; en fazla 100; açık siparişler önce |
| `commerce.customer_profiles` | `database/customer-store` | Opaque müşteri ID, bayi durumu, fiyat grubu, updatedAt; en fazla 100 |
| `commerce.shipments` | `commerce-shipment-store` | ID, ilgili sipariş ID, mevcut gönderi durumu, takip kaydı var/yok, updatedAt; görünür sipariş penceresinde en fazla 100 |
| `commerce.online_catalog` | `commerce-product-publication-store` | Aktif ürünlerin **yayın niyeti** sayısı (`desired_product_count`), mevcut durable yayının pending durumu, niyet updatedAt; ürün listesi yok |
| `marketing.publications` | `marketing/companion-status-store` / kanonik publication tabloları | ID, website/instagram, durum, revision/publishedRevision, desiredPublished, updatedAt; en fazla 50 |
| `marketing.schedules` | Aynı marketing sahibi / schedule-execution tabloları | ID, kanal/hedef türü, durum, nextRunAt, son execution durumu, updatedAt; en fazla 50 |
| `marketing.campaigns` | Kanonik campaign/outbox tabloları | ID, kanal, durum, pending+claimed ve failed sayıları, updatedAt; en fazla 50 |

**A aşamasındaki özet sınırı:** Serbest metin, firma/kişi adı, vergi kimliği, alıcı, telefon/e-posta, teslimat adresi,
not, sipariş kalemleri, takip kodu/URL, sağlayıcı hatasının ham metni, alıcı/segment
listesi, medya ve kimlik bilgileri bu sözleşmede **bulunmaz**. Siparişin optional
`customer_id` bağlantısı yalnız `dealer.view` ile çıkar. Kaynak yalnız
`desktop | web-online-sales | web-dealer | other` olabilir; özel kaynak metni ve
sourceReference dışarı çıkmaz. Bilinmeyen alanlar sunucu allowlist'inde atılır.
B2'nin aşağıdaki optional ayrıntıları bu ilk özet sözleşmesini genişletir.

`summary`/Android cevabının `operations` alanına eklenen optional sayaçlar:
`pending_commerce_orders`, `open_commerce_orders`, `pending_shipments`,
`online_catalog_pending`, `recent_failed_marketing_operations`.
Commerce sayıları kaynak/durum başına sınırlı aggregate satırlarından hesaplanır ve
100 kayıt liste sınırından bağımsızdır; kapalı kaynak ve cihaz izinleri sayacı da
kapatır. Gönderi pending sayısı draft/ready/dispatched kayıtlarıdır; mevcut domainde
gecikme/başarısız teslimat durumu olmadığı için yeni durum veya gecikme kuralı
üretilmez. Pazarlama hata sayacı **son 50'şer kayıttaki** başarısız yayın, son execution'ı
başarısız plan ve failed outbox'ı olan kampanya sayısıdır; işletme-genel analiz değildir.

### İzinler ve taşıma güvenliği

Her izin ayrıca `service.android` gerektirir. Yeni staff grupları varsayılan OFF'tur;
eski kayıt/input'ta eksik yeni grup anahtarı OFF kabul edilir. Admin mevcut rol
sözleşmesi gereği etkin capability izinlerini alır; kapalı capability'yi aşamaz.

| Ayrı izin / grup | Capability ve ek sınır |
| --- | --- |
| `commerce_order.view` / `commerce_orders_view` | `commerce.orders` |
| `commerce_order.confirm`, `commerce_order.cancel` / `commerce_orders_manage` | `commerce.orders` + ayrıca order view; genel customer/table/market izni yeterli değildir |
| `dealer.view` / `dealer_view` | `core.customers` + `commerce.orders` + `commerce.wholesale` |
| `shipment.view` / `shipment_view` | `commerce.orders` + ayrıca order view |
| `online_sales.view` / `online_sales_view` | `commerce.orders` + `channel.online_sales` + ayrıca order view |
| `marketing.status.view` / `marketing_status_view` | `marketing.studio`; audience campaign/plan için ayrıca `messaging.campaigns` + `core.customers` |

`web-dealer` ve `desktop-wholesale` siparişleri Wholesale OFF iken; `web-online-sales` siparişleri Online Sales
OFF veya cihaz online view izni yokken kaldırılır. Gönderiler görünür sipariş ID'lerine
bağlanır. LAN response güncel cihaz profiline göre kırpılır. Hosting aynı allowlist ve
capability/permission kesişimini **cevap üretirken** uygular; yalnız Android UI filtresi
değildir. Hosting'teki yeni veriler ve commerce queue işlemleri sadece `android.php`
üzerinden doğrulanmış **kişisel cihaz tokenı** ile erişilebilir. Header tokenının
kimliği body device ID'sine bağlanır; request-local authentication bayrağını body
üretemez. Eski shared-secret bootstrap ve genel `sync.php` summary cevapları yeni
alanlar için boş model döndürür; eski bağlantı sözleşmesi korunur.

Aktif olmayan/bilinmeyen cihaz boş model alır. Aktif olmayan cihaz için
`not_modified` ile eski cache'i saklama yolu kapalıdır. Java parse ve sonradan
permission profile uygulama yeni alanları/sayaçları tekrar kırpar; hatırlanan bir
profil, profilsiz snapshot'ın yeni alanlarını açamaz. OperationCache aynı kaynak
anahtarında daha düşük server revision'ı kabul etmez. LAN ve Hosting revision'ları
birbirleriyle karşılaştırılmaz; farklı kaynakların sayıları farklı otoritelerdir.

**Kalan güvenlik sınırı:** Hosting yalnız son kabul edilmiş Desktop yayınının cihaz
profilini bilir. Desktop'ın çevrimdışı yaptığı permission/capability iptali, Hosting'e
ulaşmadan uygulanamaz; önceden indirilmiş çevrimdışı cache uzaktan silinemez. Kaynak
başına revision fencing bu iletişim yokluğunu çözmez; LAN→Hosting geçişinde daha eski
otorite bilgisi de mümkündür. Shared-secret bootstrap eski alanlar için ayrıca legacy
kimlik sınırını korur. B2 ürün kararı bu gecikmeyi kabul eder: yetkili cihazın son
eşitlediği ayrıntılar çevrimdışı kullanılabilir. Ayrı canlı detay endpoint'i veya sürekli
canlı yetki doğrulaması gerekmez. Yeni yayın gelince izin/capability redaksiyonu uygulanır;
anında çevrimdışı revocation veya uzaktan cache silme iddia edilmez (D-049).

### Ticari sipariş karar altyapısı

`commerce_order_confirm` ve `commerce_order_cancel` payload'u:
`{order_id, expected_updated_at, expected_status}`. Action ID tekil ve kalıcı outbox'a
aittir. updatedAt ve **durum** birlikte zorunludur; durum önkoşulu aynı milisaniyede
olan Desktop değişikliğini de yakalar. Java yalnız erişim/önkoşul altyapısını bilir;
durum geçişlerini ikinci kez uygulamaz.

`updateCommerceOrderStatusInTransaction` aynı kanonik store içindeki tek transition
uygulamasıdır; Desktop wrapper ve Android receipt transaction'ı onu kullanır.
Mevcut placed→confirmed, uygun durum→cancelled ve terminal/no-op davranışı korunur.
Mutasyon, domain event ve receipt tek `BEGIN IMMEDIATE` transaction'ında commit olur.
Mevcut receipt tablosuna eklenen `intent_hash` alanı yalnız ID/status
önkoşullarından üretilen SHA-256 hash'i tutar; aynı receipt ID'sinin farklı
cihaz/sipariş/kararda kullanılmasını reddeder ve event history temizliğinden
bağımsızdır. Eski action receipt davranışı değişmez; yeni receipt tablosu veya
tarihsel migration yoktur. Aynı intent retry'ı receipt'i replay eder,
updatedAt kontrolünü tekrar çalıştırıp başarılı retry'ı stale diye bozmaz. Replay'de
bile güncel cihaz/capability/permission kontrol edilir. PHP queue aynı ID için farklı
intent'i 409 ile reddeder; eşzamanlı insert sonucu da kontrol edilir. LAN ve Hosting
aynı Desktop owner'a ulaşır.

Fulfillment, satış, tahsilat, finans/stock/credit mutation action'ı eklenmemiştir.
Bu domainlere ticari kararın yan etkisi yoktur.

### Yayın yaşam döngüsü

Commerce order/shipment/profile/publication ve marketing publication/schedule/
execution/campaign/outbox değişiklikleri şemadaki trigger'larla mevcut
`android_snapshot` invalidation kaydını yükseltir. Retry/backoff reseti, durable
revision ledger, frozen payload, exact ack ve source epoch fencing aynı sahiplerde
kalır; ikinci registry veya yayın yolu yoktur. Online catalog pending durumunu
kapatmak için yalnız **eşleşen tamamlanmış** online outbox kaydı Android'i yeniden
invalidates eder; henüz freeze edilmemiş pending Android işi yeni durumu kendi
revizyonunda okur. Stale completion ve restore/reset'in ham DELETE işlemi bunu yapmaz.
Current-schema-only politikası geçerlidir; tarihsel migration/startup backfill yoktur.

## B1 — Güvenli özetlerin Android ekran sözleşmesi

Bugün içindeki `today:commerce`, `today:shipments` ve `today:marketing`
alt görünümleri mevcut UiKit ve navigasyonu kullanır; yeni alt navigasyon sekmesi
yoktur. Ticari sipariş erişimi Market capability'sine bağlı değildir.
Bugün, yetkili cihazlarda bekleyen ticari sipariş/gönderi ve son kayıt penceresindeki
pazarlama başarısızlık sayaçlarını gösterir. Özet bağlantıları sıfır kayıtta da erişilebilirdir.

Sipariş kartı ID, canonical durum, kaynak, tarih, tutar/para birimi ve teslimat
yöntemini gösterir. Online satış ve bayi filtreleri A izin/capability kesişimini
kullanır; bayi siparişi filtresi ayrıca müşteri profili izni istemez.
Gönderi görünümü yalnız görünür siparişlere bağlı kayıtları ve takip kaydı var/yok
bilgisini gösterir. Pazarlama görünümü yayın/plan/kampanya durumlarını, mevcut son
çalıştırma sonucunu ve başarısız adetlerini kullanır; hata nedeni üretmez.
Online katalog durumu yayın niyeti ve pending bilgisidir; başarılı kanal yayını
olarak yorumlanmaz. Liste sınırları ekranda belirtilir, işletme-genel sayaçlardan ayrıdır.

Java, her çizimde canonical `CompanionData.redact` uygular. İzin/capability kaybı
açık alt görünümü kapatır ve Bugün'e döndürür. Eksik optional alan henüz alınmamış
özet olarak gösterilir; A sunucusunun eski snapshot'ı boş modele normalize ettiği
durumda boş özet gösterilir. Özetin güncelleme zamanı ve son senkron zamanı ayrı
gösterilir; yeni bir pull eski yayını güncelmiş gibi göstermez. Bağlantı hatasında son alınan özet,
senkronizasyon ve mevcut telefon kuyruğunun bekleme durumu kullanılır.
İkinci cache veya eşitleme hattı yoktur; A'nın çevrimdışı revocation sınırları geçerlidir.

Sipariş onay/iptal düğmesi B1'de bulunmaz; B1 snapshot'ının ayrıntıları olmayan
siparişleri B2 istemcisinde de salt-okunurdur.

## B2 — Çevrimdışı sipariş detayı ve karar

Liste → ayrıntı akışı B1'in Bugün alt görünümlerinde kalır. Tam ayrıntı alıcıyı,
ürün kalemlerini, sipariş tutarını, teslimat adresini ve notu gösterir. Sipariş anındaki
immutable alıcı/adres ile güncel bağlı müşteri kaydı ayrı başlıklardır; güncel iletişim
alanları sipariş geçmişinin üzerine yazılmaz. Bayi filtreleri web ve masaüstü bayi
siparişlerini kapsar. Gönderi alanları salt-okunurdur; doğrulanmış HTTP(S) takip bağlantısı
telefonun normal bağlantı açma mekanizmasını kullanır, uygulama kimlik bilgileri eklenmez.

| Optional genişletme | Alanlar / erişim |
| --- | --- |
| `commerce.orders[].details` | Siparişteki müşteri adı, buyer adı/telefon/e-posta, immutable teslimat adresi, subtotal/discount, note, ürün ID/ad/birim/miktar/birim fiyat/satır toplamı; görünür siparişin `commerce_order.view` izni |
| `details.items_total_count`, `items_complete`, `available_actions` | Tamlık bilgisi ve canonical order store'un mevcut geçişlerden ürettiği kararlar; ayrıca confirm/cancel izinleriyle kırpılır |
| `commerce.customers` | Yalnız görünür siparişlerin bağlı mevcut müşteri ID/ad/telefon/e-posta/updatedAt; `customer.view` veya etkin `dealer.view` |
| `commerce.customer_profiles` | Yukarıdaki bayi özeti + firma unvanı/yetkili adı; yalnız bağlı müşteri ve `dealer.view` |
| `commerce.shipments` | Sağlayıcı adı, mevcut takip numarası/HTTP(S) bağlantısı ve not; görünür sipariş + `shipment.view` |
| `orders[].dealer_order`, aggregate `dealer_count`/`dealer_pending` | `desktop-wholesale` için eski dört değerli source enum'unu koruyan bayi işareti; Wholesale OFF redaksiyonu sayaçlardan bayi kısmını da çıkarır |

Sipariş/gönderi/müşteri/profil penceresi en fazla 100 kayıttır. Ürün kalemleri sipariş
başına 500, snapshot toplamında 2000 satır; sanitize edilmiş sipariş ayrıntılarının toplam
UTF-8 JSON bütçesi 1 MiB'dır. Serbest metinler alan bazlı sınırlanır. Bütçeyi aşan ayrıntı
atlanır; eksik kalemli siparişte karar düğmeleri açılmaz. Kalemler için ikinci veri servisi
veya sınırsız ürün/medya aktarımı yoktur. Vergi kimliği, kimlik bilgileri, ödeme/servis
sırları, ham provider hatası, sourceReference, iç sistem alanları ve ilgisiz müşteriler
allowlist dışında kalır. Pazarlamanın A/B1 özet sınırı değişmez.

Son yetkili snapshot mevcut `OperationCache` içinde kalır; internet ve Desktop kapalıyken
ayrıntılar açılır. Açık onay diyaloğunun ardından karar önce mevcut kalıcı `ActionOutbox`'a
yazılır. Aynı siparişte bekleyen karar tekrar gönderilemez; farklı ticari siparişler
bağımsız bekleyebilir. Önceki bağlantıya ait kuyruk ve diğer domainlerin mevcut işlem
bariyerleri korunur. Retry aynı action ID ve expected_updated_at/expected_status ile yapılır.
Desktop güncel cihaz iznini, capability'yi ve canonical sipariş durumunu receipt transaction'ında
yeniden doğrular. Java/PHP sipariş durum makinesi üretmez; Java yalnız domainin ilan ettiği
kararları, tamlık/izin/sürüm ve taşıma bariyerlerini kontrol eder.

İşlem sonucu Bekliyor / Uygulandı / Uygulanamadı olarak ayrıntıda gösterilir. Hosting'in
normal summary cevabı cihazın istediği en fazla 40 kendi karar sonucunu, `not_modified`
cevabında da döndürür; başka cihazın sonucu paylaşılmaz. Mevcut cache facade'ında en fazla
40 minimal receipt kimliği/sürüm/durum tutulur, müşteri veya ürün payload'u kopyalanmaz.
Bilinen Uygulandı sonucu, sonraki retry'ın yetki reddiyle geri alınmış gibi gösterilmez.
Uygulandı receipt'i sipariş yayını gelmeden ulaşırsa eski expected tuple ile eşleşen
ayrıntıda yeni karar kapalıdır ve sipariş güncellemesinin beklendiği belirtilir; sipariş
durumu tahmin edilmez. Hosting retention nedeniyle sonuç bulunamazsa açıkça sonuç kaydının
bulunmadığı gösterilir, başarı uydurulmaz. Kaynak başına revision fencing, yayın source epoch,
frozen payload, exact acknowledgement ve canonical idempotent receipt yaşam döngüsü korunur.

## Uygulama blokları ve tamamlanma ölçütü

### A — Sözleşme ve izin (ilk kod işi / Codex'e uygun)

- [x] Yalnız yeni read-model türlerini tanımla; optional parse ve empty fallback ile eski Android sürümünü kırma.
- [x] Desktop sipariş, gönderi, bayi ve pazarlama servislerinden **kırpılmış** projection üret; büyüklük sınırını ve last-updated bilgisini belirle.
- [x] İzin/capability/security matrisi ve görünürlük testleri: Android OFF; ORDERS OFF; WHOLESALE OFF; ONLINE_SALES OFF; MARKETING OFF; staff/admin; revoked device; eksik eski snapshot.
- [x] Hosting ve LAN yollarında read model redaksiyonunun sunucu sınırı testleri. Eski mobil sürümde bilinmeyen alanlar yok sayılmalı.

### B — Mobil davranışlar (B1 özet, B2 güvenli detay/karar)

Confirm/cancel backend ve Java policy/outbox altyapısı A içinde hazırlanmıştır;
aşağıdaki checkbox kullanıcı arayüzüne bağlı tamamlanma ölçütüdür.

- [x] Ticari siparişlerin güvenli durum listesi ve Bugün'de bekleyen sipariş sayısı (B1).
- [x] Güvenli alıcı/kalem detayı (B2).
- [x] Yeni order confirm/cancel işlemleri **yalnız backend domain sahibi üzerinden**, permission+status+idempotency testleri ile.
- [x] Müşteri/Bayi profilinde kısa salt-okunur alanlar; siparişin ilgili müşteriye bağlanması.
- [x] Sipariş özetinde gönderi durumu ve takip kaydı var/yok; online/bayi kaynak ayrımı (B1).
- [x] Takip kodu/URL için güvenli detay erişimi (B2).
- [x] Pazarlama plan/yayın/başarısızlık durumlarının güvenli salt-okunur özeti (B1).
- [x] Mevcut Restoran/Pansiyon/Market/Mesajlar için hedefli Java, Android domain ve Companion regresyonları.
- [ ] Milestone tam doğrulaması: `verify:pre-main` ayrı aşamada çalıştırılacak.

### C — Ses (ayrı, ortak servis aşaması)

**S1 Desktop:** Servisler → Konuşma ve Yazma, yalnız OS/Electron Web Speech
yerel seslerini (`localService`) keşfeder. `src/app/tts/tts-adapter.ts` sağlayıcı
sözleşmesidir; şu an tek gerçek adaptör sistem motorudur. Ses adı/dili motorun
verisidir; cinsiyet tahmin edilmez. Web Speech motor bazında ton desteği bildirmediği
için S1 ton kontrolü sunmaz; hız 0,5–1,5 ve volume 0–100 utterance'a uygulanır.
Bu değerler OS tercihini değiştirmez. Varsayılan seçim Türkçe yerel ses, ardından
yerel sistem varsayılanıdır; dil/ses kaybında gerçek kullanılan ses panelde belirtilir.

Cihaz tercihleri `src/tts-preferences.ts` ile uygulamanın mevcut localStorage
tercih alanında saklanır; DB/Setup, eşitleme, sektör veya abonelik capability'si yoktur.
Servisler'in kategori Kaydet/Geri Al/çıkış korumasına bağlı bağımsız resource
taslağıdır. Sesi Dene taslağı kullanır; mevcut kimlik kamerası bildirimleri kayıtlı
tercihi aynı playback sahibinden okur. Boş/geç ses listesi, kaybolan ses, 500 ms
başlama sınırı, utterance hatası ve iptal açık sonuç üretir. Başarısız kamera
konuşması mevcut audio sinyalini korur; otomatik genel anlatım eklenmez. Playback
kısa düz metinle sınırlıdır (500 karakter, markup yok), 30 saniye tamamlanma sınırı
vardır. `npm run verify:check -- desktop-tts` adaptör/tercih/kamera davranışını mock
Web Speech/audio cihazıyla; `npm run verify:check -- desktop-tts-ui` gerçek Settings
renderer'ı ve kategori taslak lifecycle'ını sınar. Gerçek OS sesi/duyulabilirlik
cihazda ayrıca sınanır.

**Sonraki ayrı aşamalar:** isteğe bağlı harici Freya adaptörü ve ayrı dependency/
updater kurulumu; sonra manuel STT'nin sağlayıcı/model/izin sözleşmesi. S1'de
Freya kurulumu/indirmesi veya sahte kurulu motor, gömülü ses/model paketi, uzak TTS
API'si ve STT bulunmaz. Android TTS/STT ve telefonun kendi ses tercihleri ayrı
cihaz işidir; Desktop tercihi telefona aktarılmaz. STT ileride yalnız manuel
mikrofonla kaydet→çevir→metin alanına yerleştir akışı olabilir; otomatik iş emri
veya her alanı dinleme/seslendirme yoktur.

### D — SuperDesign / Android UI

- [ ] İşlevsel eşitleme bitince UI ekran görüntüleri + akış envanteri + Git tag (`android-ui-before-superdesign`) al.
- [ ] Masaüstü kopyası olmayan mobil navigasyon: Bugün, İşlemler, Müşteriler, Mesajlar; etkin capability'lere göre iç yüzey.
- [ ] Erişilebilir dokunma hedefleri, belirgin durumlar, kesilmeyen alt gezinme, STT/TTS manuel düğmeleri, cihazda sınama.
- [ ] Tek çalışan Android UI; eski kullanılmayan sınıfları temizle. Sync, bildirim, kamera, action queue ve izin temellerini sakla.

## Test ve geliştirme disiplini

A için kayıtlı hedefli gate: `npm run verify:check -- android-companion-v3`.
Gerçek SQLite transaction/receipt rollback ve retry, PHP/HTTP cihaz tokenı ve
sunucu redaksiyonu, LAN parity, bounded projection ve ordered withdrawal/replay
senaryolarını çalıştırır. Paket ve Java unit testleri optional parse, capability/izin
kesişimi, kalıcı action ID ve kaynak başına cache fencing'ini ayrıca korur.
Publication protocol restore testi, yeni domain invalidation'larını normal
coordinator turlarıyla drain eder ve en son Android projection'ında replay edilen
siparişlerin bulunduğunu doğrular.

- Baseline: `main` temiz, testler kullanıcı tarafından temiz bildirildi. **Bu hazırlıkta tam test çalıştırılmaz.**
- Her blokta ilgili `packages/sync-core/tests`, Android Java unit/smoke, desktop/hosting capability ve action-path hedefli testler.
- Riskli domain mutation ve sözleşme değişikliklerinde idempotency, offline/retry, last-write/stale, role/capability, source-epoch/revision fencing ve eski sürüm uyumluluğu doğrulanır.
- Değişiklikler tek ana kopyada ilerler; gereksiz ikinci Android UI, Android'e ikinci iş mantığı veya büyük genel refactor yoktur.
