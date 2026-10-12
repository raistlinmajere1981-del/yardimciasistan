# Android Companion v3 — kapsam ve sözleşme hazırlığı

Durum: **tasarım kararı / uygulama öncesi kontrol listesi**, çalışan kod değişikliği değildir.
Başlangıç incelemesi: 2026-10-12, `main` / `6f67f5b3`.
Hedef: Masaüstüyle **iş kuralı ve veri tutarlılığı**; masaüstünün bütün ekranlarını telefona kopyalamak değil.

## Ürün sınırı

- **Desktop**: kanonik veri, işletme/servis ayarları, kapsamlı yönetim, fiyat/ödeme/stok muhasebesi, kampanya editörü ve yayın motoru.
- **Companion**: Bugün/uyarılar, kısa saha işlemleri, müşteri iletişimi, sipariş kararı, stok/barkod işlemleri ve durum takibi.
- **Bayiye özel sipariş uygulaması**: ayrı ürün/kimlik/rol ve kullanıcı deneyimi; Companion içine bayi girişi eklenmeyecek.
- Ekran görünürlüğü **işletme capability'si AND cihazın etkin izni** ile belirlenir. Admin rolü kapalı capability'yi açamaz.
- Mevcut Java ekranları, bildirimler, kamera, action outbox, hosting ve yerel eşitleme yolları korunur. İşlevsel eşitleme sırasında geniş UI refactor yapılmaz.

## Kodda doğrulanan mevcut durum

| Kanonik alan | Mevcut kod | Durum |
| --- | --- | --- |
| Android operatör ekranları | `apps/android-app/src/main/java/com/yardimciasistan/android/{AndroidUiRules,AndroidShellController,AndroidWorkspaceCoordinator}.java` | Bugün, Müşteri, Pansiyon, Restoran, Market, Mesajlar var; kasa/rapor yetenekleri de kurallarda tanımlı. |
| Snapshot şeması | `packages/sync-core/index.ts` → `AndroidOperationsSnapshot` | Oda, rezervasyon, masa siparişi, müşteri, finans, rapor, market var; ticari sipariş/bayi/gönderi/pazarlama özeti yok. |
| Kaynak ve redaksiyon | `apps/desktop-app/electron/{android-operations-snapshot,android-capability-projection}.ts` | Mevcut domainler capability'ye göre kırpılıyor. Yeni domainler aynı koşulları karşılamalı. |
| Mutasyon | `packages/sync-core/android-policy.ts`, `apps/desktop-app/electron/android-action-router.ts` | Kalıcı outbox/receipt aksiyonları mevcut; commerce order ve marketing aksiyonları Android için tanımlı değil. |
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

## Önerilen mobil veri sözleşmesi (uygulama öncesi taslak)

1. Mevcut `AndroidOperationsSnapshot` geriye uyumlu kalır. Yeni **opsiyonel**, domain-isimli ve varsayılanı boş bir commerce/marketing mobil projeksiyonu seçilir; kesin alan adları uygulama sırasında tek kez kararlaştırılır.
2. Liste projeksiyonu kompakt ve sayıca sınırlı olur: ID, durum, kısa başlık, zaman, sipariş toplamı/para birimi ve kaynak. Kalemler, teslimat adresi, alıcı iletişimi ve gönderi detayları yalnız yetkili detay akışında sunulur. Tek snapshot'a sınırsız sipariş/kalem/medya gömülmez.
3. Ticari siparişlerde `commerce.orders` + `service.android`, bayi/toptan alanlarında ayrıca `commerce.wholesale`, online yayın/sipariş bilgisinde uygun `channel.online_sales` koşulları uygulanır. Gönderi görünürlüğü ilgili ticari sipariş iznine bağlanır; henüz bağımsız bir shipping business capability yoktur.
4. Pazarlama durumları `marketing.studio` ve gerekiyorsa `messaging.campaigns` ile kırpılır; SMS/WhatsApp alıcı listeleri, yayın sırları, müşteri segment içeriği, sağlayıcı kimlik bilgileri ve gereksiz kişisel veri **yayınlanmaz**.
5. Yeni işlemler için `AndroidPermission`, cihaz/rol grupları, capability matrisi, sunucu yetki reddi, Java permission kontrolü **birlikte** güncellenir. Önerilen ayrık izinler: commerce order view/manage, dealer view, shipment view, marketing status view. İsimleri kod öncesi kanonik hale getirilecek; genel `table_order`, `market` veya `customer.view` izni yeni mutasyonları otomatik açmayacak.
6. Sipariş onay/iptal ilk iki mobil mutasyon adayıdır. Kapsam: `placed→confirmed` ve mevcut backend'in izin verdiği `cancelled` geçişleri. Desktop kanonik service/store çağrılır; paralel iş kuralı Java/PHP'ye yazılmaz. `expected updatedAt/revision`, tekil action ID, kalıcı queue, receipt/idempotency, yeniden deneme, yetki revocation ve stale transition test edilir.
7. Snapshot sadece UI filtresi değildir: yetkisiz veri sunucudan/cihazdan alınmamalı. Hostingin işyeri-genel snapshot tüketiminde **cihaz bazlı alan yetkisi** ve veri minimizasyonunun nerede uygulandığı önce doğrulanır. Bu kontrol bitmeden ticari müşteri adresleri/iletişim bilgileri eklenmez.
8. Capability OFF veya Android bağlantısı OFF olduğunda yayınlanan domainler boş/tombstone olur, yeni action kabul edilmez. Local LAN + hosting + offline cached snapshot + geç gelen publication revizyonları aynı sınırları korur.

## Uygulama blokları ve tamamlanma ölçütü

### A — Sözleşme ve izin (ilk kod işi / Codex'e uygun)

- [ ] Yalnız yeni read-model türlerini tanımla; optional parse ve empty fallback ile eski Android sürümünü kırma.
- [ ] Desktop sipariş, gönderi, bayi ve pazarlama servislerinden **kırpılmış** projection üret; büyüklük sınırını ve last-updated bilgisini belirle.
- [ ] İzin/capability/security matrisi ve görünürlük testleri: Android OFF; ORDERS OFF; WHOLESALE OFF; ONLINE_SALES OFF; MARKETING OFF; staff/admin; revoked device; eksik eski snapshot.
- [ ] Hosting ve LAN yollarında read model redaksiyonunun sunucu sınırı testleri. Eski mobil sürümde bilinmeyen alanlar yok sayılmalı.

### B — İlk değerli mobil davranışlar

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

- Baseline: `main` temiz, testler kullanıcı tarafından temiz bildirildi. **Bu hazırlıkta tam test çalıştırılmaz.**
- Her blokta ilgili `packages/sync-core/tests`, Android Java unit/smoke, desktop/hosting capability ve action-path hedefli testler.
- Riskli domain mutation ve sözleşme değişikliklerinde idempotency, offline/retry, last-write/stale, role/capability, source-epoch/revision fencing ve eski sürüm uyumluluğu doğrulanır.
- Değişiklikler tek ana kopyada ilerler; gereksiz ikinci Android UI, Android'e ikinci iş mantığı veya büyük genel refactor yoktur.
