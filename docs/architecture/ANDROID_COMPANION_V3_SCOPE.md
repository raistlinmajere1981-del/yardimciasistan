# Android Companion v3 — kapsam ve sözleşme hazırlığı

Durum: **A veri/izin sözleşmesi ve sonraki aşamaların kapsamı**. B/C/D kullanıcı arayüzü ve ses çalışmaları ayrı bloklardır.
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

Serbest metin, firma/kişi adı, vergi kimliği, alıcı, telefon/e-posta, teslimat adresi,
not, sipariş kalemleri, takip kodu/URL, sağlayıcı hatasının ham metni, alıcı/segment
listesi, medya ve kimlik bilgileri bu sözleşmede **bulunmaz**. Siparişin optional
`customer_id` bağlantısı yalnız `dealer.view` ile çıkar. Kaynak yalnız
`desktop | web-online-sales | web-dealer | other` olabilir; özel kaynak metni ve
sourceReference dışarı çıkmaz. Bilinmeyen alanlar sunucu allowlist'inde atılır.

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

`web-dealer` siparişleri Wholesale OFF iken; `web-online-sales` siparişleri Online Sales
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
kimlik sınırını korur. Bu yüzden A yalnız yukarıdaki kişisel veri içermeyen özetleri
sunmaktadır. Müşteri/firma kimliği, iletişim/adres, takip detayları ve yetkili detay
endpoint'i bir sonraki güvenlik bloğuna kadar hazır değildir. Anında çevrimdışı
revocation veya güvenli hassas detay akışı iddia edilmez.

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

## Uygulama blokları ve tamamlanma ölçütü

### A — Sözleşme ve izin (ilk kod işi / Codex'e uygun)

- [x] Yalnız yeni read-model türlerini tanımla; optional parse ve empty fallback ile eski Android sürümünü kırma.
- [x] Desktop sipariş, gönderi, bayi ve pazarlama servislerinden **kırpılmış** projection üret; büyüklük sınırını ve last-updated bilgisini belirle.
- [x] İzin/capability/security matrisi ve görünürlük testleri: Android OFF; ORDERS OFF; WHOLESALE OFF; ONLINE_SALES OFF; MARKETING OFF; staff/admin; revoked device; eksik eski snapshot.
- [x] Hosting ve LAN yollarında read model redaksiyonunun sunucu sınırı testleri. Eski mobil sürümde bilinmeyen alanlar yok sayılmalı.

### B — İlk değerli mobil davranışlar

Confirm/cancel backend ve Java policy/outbox altyapısı A içinde hazırlanmıştır;
aşağıdaki checkbox kullanıcı arayüzüne bağlı tamamlanma ölçütüdür.

- [ ] Ticari sipariş listesi/detayı ve Bugün'de bekleyen sipariş sayısı.
- [ ] Yeni order confirm/cancel işlemleri **yalnız backend domain sahibi üzerinden**, permission+status+idempotency testleri ile.
- [ ] Müşteri/Bayi profilinde kısa salt-okunur alanlar; siparişin ilgili müşteriye bağlanması.
- [ ] Sipariş detayı içinde kargo takip ve durum; online kaynak ayrımı.
- [ ] Pazarlama plan/yayın/başarısızlık durumlarının güvenli salt-okunur özeti.
- [ ] Mevcut Restoran/Pansiyon/Market ekranlarının regresyonu; full suite aşama sonunda.

### C — Ses (ayrı, ortak servis aşaması)

- [ ] AI ayarlarına desteklenen bulut STT modeli seçimi, servis kapalı/model seçilmedi iken pasif durum.
- [ ] Servisler → Konuşma ve Yazma: yerel TTS motor/ses/dil keşfi; harici TTS fallback; STT ayarı.
- [ ] STT yalnız manuel basılan mikrofonla kaydet→çevir→metin alanına yerleştir; otomatik iş emri değil.
- [ ] TTS yalnız manuel hoparlör düğmesi; işlemler platform bağımsız sözleşme ile, kayıtlar geçici ve korunur.

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
