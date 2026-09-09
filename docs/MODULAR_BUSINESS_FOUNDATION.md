# Yardımcı Asistan — Modüler İşletme Temeli ve Market Handoff

> Güncellik: 2026-09-08
> Amaç: Pansiyon/restoran odaklı ilk üründen, farklı küçük işletme türlerinin aynı çekirdeği paylaşabildiği capability-first mimariye geçişte alınan kararların tek referansı olmak.

## 1. Ürün yönü

Yardımcı Asistan yalnız pansiyon/restoran yazılımı değildir.

Hedef ürün:

> **Tek lokasyonlu küçük fiziksel işletmeler için modüler, local-first işletme sistemi.**

Ortak çekirdek; sektör çalışma alanlarından bağımsız kalır. İşletme profili yalnız ilk kurulum için bir preset/provenance bilgisidir. Uygulamanın gerçek çalışma alanları `business_capabilities` üzerinden belirlenir.

```text
Business
  ↓
Profile = ilk yetenek preset'i
  ↓
Persisted Capabilities = gerçek runtime source of truth
  ↓
Workspaces / Services / Devices
```

Bu nedenle yeni sektörler için `market_pension`, `market_cafe_pension` gibi kombinasyon tipleri üretilmez. Kullanıcı gerekli capability'leri profile ekleyerek hibrit işletme oluşturabilir.

## 2. Ortak çekirdek

Her işletmede bulunan çekirdek capability'ler:

```text
core.customers
core.tasks
core.calendar
core.notifications
core.finance
core.reports
core.web
core.sync
core.backups
core.devices
```

Bağlı servisler:

```text
service.whatsapp
service.ai
service.android
```

Sektör domain'leri:

```text
accommodation.*
food_service.*
commerce.*
retail.*
channel.qr_menu
```

Canonical capability registry:

- `packages/shared/types/business-capabilities.ts`

Yeni workspace veya servis görünürlüğü için `businessType` kontrolü eklenmemelidir. Runtime kararında persisted capability kullanılmalıdır.

## 3. Mevcut profiller

### Kullanılabilir

- `pension_restaurant`
- `pension`
- `restaurant`
- `cafe`
- `market`

### Planlı

- `other`

`market` minimum günlük perakende akışı tamamlandığı için normal kurulum seçicisinde kullanılabilir durumdadır. Kurulum seçicisi authoritative `getAvailableBusinessProfiles()` registry çıktısını kullanır; yeni profil açılışları ikinci bir hardcoded sektör listesine bağlanmamalıdır.

Market varsayımları:

```text
core.*
service.whatsapp
service.android
commerce.catalog
commerce.inventory
commerce.sales
commerce.customer_credit
retail.barcode
retail.purchasing
retail.suppliers
retail.labels
```

## 4. Capability dependency graph

Capability'ler bağımsızdır fakat geçersiz kombinasyonlara izin verilmez.

Önemli bağımlılıklar:

```text
accommodation.reservations → accommodation.rooms
accommodation.stays        → accommodation.rooms
accommodation.folio        → accommodation.rooms + accommodation.stays + core.finance

food_service.reservations  → food_service.tables
food_service.orders        → food_service.tables + food_service.menu
channel.qr_menu             → food_service.menu

commerce.inventory         → commerce.catalog
commerce.sales             → commerce.catalog
commerce.customer_credit   → core.customers + commerce.sales + core.finance
retail.barcode              → commerce.catalog
retail.purchasing           → commerce.catalog + commerce.inventory
retail.labels               → commerce.catalog
```

Kullanıcı override'ları profil değişiminde korunabilir; korunmaları yeni profile göre geçersiz dependency set oluşturuyorsa transaction reddedilir.

## 5. Persisted capability runtime

SQLite:

```text
business_capabilities
  business_id
  capability_id
  is_enabled
  source
```

Runtime kaynakları:

```text
system  → zorunlu çekirdek
profile → seçilen profil varsayımı
user    → açık kullanıcı override'ı
```

Eski `legacy` kaynak ve eski module alanları yalnız geçiş uyumluluğu içindir; yeni kod bunları runtime karar kaynağı olarak kullanmamalıdır.

Ana servisler:

- `apps/desktop-app/electron/business-capability-store.ts`
- `apps/desktop-app/electron/business-capability-runtime.ts`
- `apps/desktop-app/electron/business-capability-ipc.ts`

Renderer capability snapshot'ı preload/IPC üzerinden okur. Sidebar, workspace görünürlüğü, AI/WhatsApp davranışı ve bazı backend guard'lar persisted capability'lere bağlıdır.

## 6. Setup sözleşmesi

Renderer'ın controller-owned setup state'i artık `rooms/tables/qrMenu` module boolean'larını taşımaz.

Gerçek renderer DTO:

- `CapabilitySetupData`
- `CapabilitySetupFormState`
- `SaveCapabilitySetupInput`

Temel Ayarlar'da yalnız doğrudan kullanıcı tercihi olan bağlı servis kontrolleri görünür:

- WhatsApp
- Android

Domain yetenekleri `Ayarlar → Özel Yetenekler` alanından yönetilir. Burada Konaklama, Yiyecek & İçecek, Ticaret Çekirdeği ve Perakende grupları ayrı görünür; böylece Market + Pansiyon gibi hibritler profil çoğaltmadan kullanıcı override'larıyla kurulabilir.

Eski büyük `LegacySetupWizard` henüz tamamen parçalanmadığı için setup save yolunda Electron-side geçici compatibility adapter vardır. Görsel sektör seçicisinin statik legacy seçenekleri de capability-first `SetupWizard` boundary'sinde `getAvailableBusinessProfiles()` çıktısıyla senkronlanır. Bu projection yeni source of truth değildir; authoritative kaynak shared profile registry'dir.

**Kural:** Yeni renderer kodu `DesktopSetupData.modules` okumamalı ve yeni setup alanı eski `modules` sözleşmesine eklenmemelidir.

## 7. Commerce foundation

Market UI'den bağımsız sektör ortak commerce omurgası oluşturuldu.

Shared tipler:

- `packages/shared/types/commerce.ts`

SQLite tabloları:

```text
catalog_categories
catalog_products
inventory_locations
inventory_balances
inventory_movements
commerce_suppliers
purchase_orders
purchase_order_items
commerce_sales
commerce_sale_items
```

Bu tablolar restoranın mevcut `menu_items`, `tables`, `table_orders` yapısından bağımsızdır. Amaç food-service ve retail domain'lerinin commerce kavramlarını paylaşabilmesi, birbirine sıkı bağlanmamasıdır.

Store/runtime sınırları:

- `apps/desktop-app/electron/commerce-store.ts`
- `apps/desktop-app/electron/commerce-category-store.ts`
- `apps/desktop-app/electron/commerce-purchase-store.ts`
- `apps/desktop-app/electron/commerce-runtime.ts`
- `apps/desktop-app/electron/commerce-ipc.ts`
- `apps/desktop-app/electron/commerce-ipc-contract.ts`

Renderer akışı:

```text
Market Workspace
  ↓
preload bridge
  ↓
commerce IPC
  ↓
commerce-runtime
  ↓
commerce stores / SQLite
```

Runtime kuralları:

```text
commerce.catalog    → katalog işlemleri
commerce.inventory  → stok işlemleri
commerce.sales      → satış işlemleri
retail.barcode      → barkod lookup
retail.purchasing   → satın alma / stock-in
retail.suppliers    → tedarikçi yönetimi
retail.labels       → etiket workspace görünürlüğü
```

### Stok sayımı kararı

`count` bir UI delta girişi değildir. Kullanıcı gerçek fiziksel miktarı girer.

Örnek:

```text
Sistem miktarı: 10
Fiziksel sayım: 6
→ movement type=count
→ quantity_delta=-4
→ quantity_after=6
```

Aynı miktar yeniden sayılırsa anlamsız `0` hareketi oluşturulmaz.

## 8. Market cihaz abstraction durumu

Market workspace donanım markasına bağlanmaz.

Mevcut sınırlar:

```text
BarcodeInput
  Simulator             → available
  USB Keyboard Scanner  → available
  Camera Scanner        → reserved / later

LabelPrinter
  Preview               → available
  PNG                    → available
  PDF                    → available
  ZPL                    → planned
  TSPL                   → planned
  System printer        → planned
```

USB keyboard-wedge scanner hızlı karakter dizisi + `Enter` terminator davranışıyla normal kullanıcı yazımından ayrılır. Tarama sonucu mevcut capability-guarded exact barcode lookup hattına gider.

Etiket motoru aynı `LabelPrintJob` sözleşmesini Preview, PNG ve PDF adaptörlerinde kullanır. Code 128-B barkod üretimi, label-size preset'leri ve çoklu PDF kopyası desteklenir. ZPL/TSPL/sistem yazıcısı gerçek saha donanımı belli olduğunda aynı `LabelPrinterAdapter` sınırına takılacaktır.

İlk Market MVP donanım zorunluluğu getirmez. Android kamera scanner daha sonra hosting/LAN transport tercihiyle eklenebilir ve mevcut desktop Market kullanımını bloke etmez.

## 9. Kalite kapıları

Repo yalnız build/test ile kontrol edilmez.

Aktif kalite katmanları:

```text
ESLint
Knip
Design system debt audit
Architecture boundary audit
TypeScript typecheck
Workspace tests
Capability/commerce/Market smokes
```

Önemli komutlar:

```bash
npm run lint
npm run knip
npm run design:audit:strict
npm run architecture:audit
npm run quality:strict
```

Tam modüler temel checkpoint'i:

```bash
node scripts/check-modular-foundation.mjs
```

Başarı çıktısı:

```text
modular-foundation-check-ok
```

Runner'ın kritik smoke zinciri:

```text
business-capabilities-smoke-ok
capability-runtime-v2-smoke-ok
setup-capability-contract-smoke-ok
commerce-foundation-smoke-ok
commerce-runtime-smoke-ok
commerce-ipc-contract-smoke-ok
market-workspace-contract-smoke-ok
market-quick-sale-contract-smoke-ok
market-sale-runtime-smoke-ok
market-barcode-input-contract-smoke-ok
market-label-printer-contract-smoke-ok
market-profile-availability-smoke-ok
market-android-foundation-smoke-ok
```

## 10. Architecture audit tarafından korunan sınırlar

- `packages/*` uygulama katmanına import yapamaz.
- Desktop renderer Electron runtime modüllerini doğrudan import edemez; Electron tipleri yalnız `import type` ile alınabilir.
- Sandboxed preload, `electron` dışında uygulama runtime modülü yüklememelidir.
- Renderer → preload/IPC → Electron main sınırı korunmalıdır.

Market kodu bu kuralları gevşetmemelidir.

## 11. Bilinçli olarak kalan geçiş borcu

Aşağıdaki eski alanlar bazı backend/setup compatibility yollarında hâlâ fiziksel olarak bulunabilir:

```text
business.modules_json
settings.rooms_enabled
settings.tables_enabled
settings.qr_menu_enabled
```

Bunlar **runtime source of truth değildir**. Capability tablosu authoritative'dir.

Bu alanları fiziksel olarak kaldırmak, çok büyük `database.ts` setup persistence metodunu daha küçük repository/service parçalarına ayırma işiyle birlikte yapılmalıdır. Market workspace'i bunlara bağlanmadığı sürece bu temizlik Market mimarisini bloke etmez.

Aynı şekilde `LegacySetupWizard` ismi ve compatibility form shape'i yeni özellik geliştirme yüzeyi değildir. Statik sektör `<option>` listesinin registry projection'ı da geçici bir compatibility katmanıdır; wizard parçalandığında normal React profile selector doğrudan shared registry'yi kullanmalıdır.

## 12. Market MVP tamamlanma durumu

### M1 — Commerce backend zinciri — CLOSED

- repository/store primitives
- kategori yönetimi
- ürün arama + exact barcode lookup
- inventory balance + movement history + fiziksel count
- supplier CRUD
- atomik purchasing/stock-in
- capability-guarded runtime
- IPC + preload contract

### M2 — Market workspace/navigation — CLOSED

Capability-driven Market route ve günlük yönetim alanları:

```text
Hızlı Satış
Ürünler
Stok
Tedarikçiler / Alım
Etiketler
```

Workspace `businessType` ile değil persisted capabilities ile açılır.

### M3 — Hızlı Satış — CLOSED

- ürün arama / sepet
- adet değiştirme
- indirim
- nakit/kart/havale/diğer ödeme
- backend-authoritative fiyat/toplam
- tek transaction paid sale + stok düşümü
- başarısız satışta rollback

### M4 — Barcode Input abstraction — CLOSED

- simulator
- USB keyboard-wedge scanner
- exact guarded lookup
- camera/Android extension point reserved

### M5 — Label MVP — CLOSED

- Preview
- PNG
- PDF
- 58×40 / 50×30 / 40×30 mm presets
- Code 128-B
- ZPL / TSPL / system printer extension points reserved

### M6 — Market profile availability — CLOSED (foundation gate sonrası)

- `market.availability = available`
- normal setup selector registry üzerinden Market'i gösterir
- Perakende capability override grubu hibrit işletmeler için görünür
- `other` planlı kalır

### M7.1 — Android Market Companion foundation — CLOSED

Rol ayrımı açıktır:

```text
Desktop = source of truth
Android = retail handheld companion
```

Android masaüstü Market'in küçük bir kopyası veya masaüstü çalışmasının bağımlılığı
değildir. Bu aşamada Android UI eklenmedi. Snapshot parser, action queue, masaüstü
uygulama sınırı ve explicit draft persistence aşağıdaki sonraki mobil MVP akışlarını
taşıyacak biçimde hazırlandı:

```text
Stock Count
Receiving
Product Draft
Cart Draft
Market Summary
```

Tek kullanıcı görevi `market_operations` (`Market / El Terminali`) grubudur. Grup
şu granular izinleri verir ve her izin ayrıca persisted business capability ile
kesiştirilir:

```text
market.summary.view   → etkin commerce/retail capability'lerinden en az biri
market.product.view   → commerce.catalog
market.stock_count    → commerce.inventory
market.receiving      → retail.purchasing
market.product_draft  → commerce.catalog
market.cart_draft     → commerce.catalog + commerce.sales
```

Admin rolü de bu capability kesişimini aşamaz. Saf Market profilinde Android ayarları
yalnız `market_operations` grubunu gösterir; oda, rezervasyon, masa, restoran siparişi
ve restoran menü stok izinleri Market grubuna taşınmaz.

Snapshot'taki ayrı `market` alanı kısa satış/stok/mal kabul özetini, mobil için gereken
minimum ürün alanlarını, izinli tedarikçileri, yakın mal kabullerini ve iki taslak
türünü taşır. Barkod `retail.barcode`, stok alanları `commerce.inventory`, tedarikçi
kimliği `retail.suppliers`, yakın alımlar `retail.purchasing`, satış özeti ve sepet
taslakları `commerce.sales` ile kırpılır. Mevcut satın alma store'u bekleyen sipariş
workflow'u üretmediği için snapshot sahte `pending purchase order` içermez; yalnız
gerçek `received` kayıtlarından yakın mal kabul bağlamı yayınlanır.

Android action sözleşmeleri:

```text
market_stock_count
market_purchase_receive
market_product_draft_create
market_cart_draft_create
```

`market_stock_count` telefondan absolute fiziksel miktar alır; delta masaüstündeki
mevcut inventory transaction'ında hesaplanır ve aynı miktar için sıfır hareket yazılmaz.
`market_purchase_receive` mevcut atomik purchase + stock-in store'unu kullanır. İki
taslak action'ı gerçek ürün veya satış oluşturmaz.

Yeni additive SQLite tabloları:

```text
catalog_product_drafts
commerce_sale_drafts
commerce_sale_draft_items
```

Product draft bilinmeyen barkod, önerilen ürün alanları, kaynak/cihaz, zaman ve
`pending|reviewed` durumunu tutar. Cart draft ürün adı snapshot'lı satırları ve miktarı
tutar; stok, `commerce_sales`, ödeme veya finans kaydı üretmez. Masaüstü UI'den bağımsız
create/list/get runtime yardımcıları sonraki entegrasyon için hazırdır. Her Android
mutation'ı cihaz effective permission, persisted capability, payload/store validation,
tek transaction ve mevcut action receipt idempotency sınırından geçer.

M7.2 ve sonrasına bırakılanlar:

```text
Android Market UI
full mobile POS
payment
returns
invoice OCR
product photos
local LAN transport
```

## 13. Market MVP veri alanları

Ürün:

```text
name
barcode
sku
category
sale_price
purchase_price
stock
minimum_stock
unit
```

Stok hareketleri:

```text
sale
purchase
waste
count
adjust
return_in
return_out
```

MVP'nin amacı ileri ERP/muhasebe değildir. Küçük işletmede ürün bulma, satış, stok düzeltme ve temel alım kaydını hızlı ve güvenli yapmaktır.

## 14. Geri dönülmemesi gereken kararlar

1. `businessType` runtime feature gate değildir.
2. Profil yalnız preset'tir; capability gerçek yetkidir.
3. Core capability'ler her işletmede açık kalır.
4. Hibrit işletme capability kombinasyonlarıyla oluşur.
5. Market commerce tabloları restoranın menu/table tablolarına bağlanmaz.
6. Renderer SQLite/store import etmez.
7. Preload dependency-light kalır.
8. Stok ve satış mutation'ları transaction + audit movement üretir.
9. Donanım adapter arkasında kalır.
10. Market MVP sade günlük kullanım ürünüdür; ERP kapsamına genişlemez.
11. Normal setup profil listesi shared `availability` registry'sinden türetilir.

## 15. Sonraki session başlangıç kontrolü

Yeni session'ın ilk işi repo head'ini okuyup aşağıdaki checkpoint'i doğrulamak olmalıdır:

```bash
node scripts/check-modular-foundation.mjs
```

Bu yeşil değilse yeni sektör veya ileri Market geliştirmesine başlanmamalıdır.
M7.1–M7.3, M8.1 Customer Credit foundation ve M8.2 masaüstü veresiye UI tamamlandı.
M8.3 isteğe bağlı WhatsApp entegrasyonu ayrı iştir.

## 16. M8.1 — Customer Credit / Veresiye foundation — CLOSED

Capability `commerce.customer_credit`; structural dependencies `core.customers`,
`commerce.sales`, `core.finance`. Market profilinde varsayılan açıktır. Diğer
profiller capability üzerinden hibrit olarak açabilir; business_type runtime gate
yoktur. WhatsApp, Android ve sync coordinator bu runtime'ın bağımlılığı değildir.

Model: `customer_credit_entries` immutable ledger; bakiye tablosu/kolonu yoktur.
Tutar pozitif integer minor units, işaret `debit|credit` yönüdür. Bakiye işletme,
müşteri ve currency başına `SUM(debit) - SUM(credit)` ile türetilir. TRY ve EUR
birleştirilmez. Düzeltme yeni, notu zorunlu `adjustment_debit|adjustment_credit`
hareketidir. Fazla tahsilat, avans ve negatif bakiye desteklenmez.

Settlement kararı: mevcut `CommerceSale.status` union'ına `credit` eklenir.
`paid` mevcut anlamını korur; `credit` kapanmış veresiye satışını ifade eder,
payment_method boştur. Tahsilat müşteri hesabına uygulanır; M8.1 satış bazında
tahsilat dağıtımı/partial settlement yapmaz ve satışın `credit` durumunu değiştirmez.
Market satış sayısı/cirosu `paid` ve `credit` satışları kapsar. Mevcut genel raporlar
restoran/konaklama ve kasa verilerini kullanır; yeni bir ticaret rapor motoru yoktur.

Veresiye satış: aktif kayıtlı müşteri doğrulaması, güncel katalog fiyatı/indirim,
satış, ürün snapshot'ları, stok düşümü ve tek ledger debit aynı `BEGIN IMMEDIATE`
transaction'ındadır. Paid ve credit satışlar aynı transaction-aware primitive'i
kullanır. `credit_sale != cash income`: veresiye satışında kasa geliri oluşmaz.
Mevcut paid commerce sale'in kasa projection davranışı değiştirilmez.

Tahsilat: mevcut currency borcu doğrulanır; ledger credit ve `finance_entries`
income aynı transaction'da oluşur. `source_type=customer_credit_payment`,
`source_id=ledger entry id`, kategori mevcut `other_income`; ödeme yöntemleri
`cash|card|bank|other`. Kasa TRY özetleri yalnız TRY hareketlerini toplar; diğer
currency hareketleri kendi currency bilgisiyle hareket listesinde korunur.

`039_customer_credit_ledger.sql` müşteri sahipliğini de ekler: eski tek işletmeli
müşteriler aktif işletmeye bağlanır, eski insert yolları aynı kuralı izler.
Ledger müşteri/satış foreign key'leriyle korunur. Açık pozitif borç müşteri
soft-delete işlemini engeller; sıfır borçlu silinmiş müşterinin geçmişi okunabilir,
yeni hareketi reddedilir. Ledger UPDATE/DELETE endpoint'i yoktur.

Bridge `DesktopCommerceBridge` içinde guarded list/get/entries, sale, payment,
adjustment metotlarıdır. Main canonical database path, unlock kontrolü, persisted
capability kontrolü ve başarılı mutation sonrası onMutation kullanılır. Capability
kapalıyken read/mutation reddedilir; açıldığında aynı yerel geçmiş erişilir.

Tüm işlemler offline SQLite üzerinde çalışır. Tam SQLite yedeği ledger, indeks,
trigger ve sahiplik verisini doğal olarak taşır; ayrı yedek sistemi yoktur.
`scripts/smoke-market-customer-credit-foundation.mjs` foundation zincirine dahildir.

Hesap detayındaki `entries` en yeni 200 hareketi döndürür; tam geçmiş
`listCustomerCreditEntries(customerId, { currency?, limit?, offset? })` ile sayfalanır.
Bakiyeler her zaman tüm ledger üzerinden hesaplanır. Hesap listesi müşteri bilgisi,
currency bazında pozitif borçlar, son hareket zamanı ve son tahsilat bilgisini verir.

2026-09-08 doğrulaması:

- `npm run build:packages` ve desktop build: geçti.
- `npm run test`: 87 Node testi ve 30 Android testi, sıfır hata.
- Yeni targeted smoke: `market-customer-credit-foundation-smoke-ok`.
- `node scripts/check-modular-foundation.mjs`: `modular-foundation-check-ok`;
  lint, Knip, design/architecture, typecheck ve tüm M7 smoke'ları geçti.
- `npm run android:debug`: `BUILD SUCCESSFUL`; Android source değişmedi.
- Ek record-deletions, customer-room-management, app-lock, finance-db,
  finance-service ve reports-db smoke'ları geçti.
- Targeted smoke; 038→039 migration, mevcut kullanıcı override'ları, authoritative
  fiyat, currency ayrımı, duplicate debit, tam rollback, fazla tahsilat, iki ayrı
  süreçten eşzamanlı ödeme, hibrit profil, kilitli IPC, müşteri silme ve yedekten
  yeniden açma/integrity/foreign-key kontrollerini kapsar.

M8.1'de veresiye UI, Hızlı Satış ödeme seçeneği, müşteri borç paneli, WhatsApp mesajı
ve Android veresiye ekranı yoktur. WhatsApp gelecekte optional formatter/bridge
entegrasyonudur. Faiz, taksit, vade, limit, risk, avans, satışa kısmi ödeme,
iade entegrasyonu, PDF ve toplu hatırlatma kapsam dışıdır.

## 17. M8.2 — Desktop Veresiye UI — CLOSED

Hızlı Satış'ta `commerce.customer_credit` açıkken **Veresiye** ödeme seçeneği
görünür. Küçük `CustomerPicker`, mevcut dashboard'ın aktif kayıtlı müşterilerini
kullanır; ad/telefon arama, seçme ve temizleme sağlar. Ayrı müşteri deposu veya
yönetim ekranı yoktur. Seçilen müşterinin mevcut borcu hesap API'sinden okunur.
Capability kapalıyken picker/hesap paneli mount edilmez, gizli hesap read'i yapılmaz.
`business_type`, WhatsApp ve Android görünürlüğe karar vermez.

Normal yöntemler `createPaidSale`, veresiye `createCustomerCreditSale` çağırır.
Renderer yalnız müşteri/ürün kimlikleri, miktarlar, indirim ve source gönderir;
satış tutarı backend sonucudur. Başarıda sepet/müşteri temizlenir, yöntem nakde
döner, katalog yenilenir. Makbuz: “Veresiye satış kaydedildi.” ve “Müşteri hesabına
… borç işlendi.” Tahsil edilmiş gibi gösterilmez.

Mevcut Müşteriler kartında küçük Veresiye özeti, para birimi başına ayrı borç ve
son hareket vardır. `Hesabı Aç` satır içi detay açar; son 200 hareketten sonra
`Daha Eski Hareketler` hesap geçmişi API'sini sayfalar. Türkçe tür adları, tarih,
tutar, not, tahsilat yöntemi ve gerekiyorsa “Satış kaydı” gösterilir; UUID/teknik
ledger alanları gösterilmez. Bakiye satış durumundan veya sayfalı geçmişten
türetilmez. Liste badge'i eklenmedi; N+1 hesap sorgusu yoktur.

`Tahsilat Al` seçilen currency için pozitif, mevcut borcu aşmayan tutar ister.
Yalnız `recordCustomerCreditPayment` kullanılır; ikinci finance yazımı yoktur.
İkinci plandaki `Düzeltme`, zorunlu açıklamayla `addCustomerCreditAdjustment`
çağırır; mevcut kayıt güncelleme/silme yoktur. Borcu azaltma mevcut borcu aşamaz.
UI ön doğrulama yapar; eşzamanlı değişikliklerde backend son otoritedir.
Mutation sırasında çift submit engellenir. Başarılı mutation'dan sonra başarısız
hesap yenilemesi ayrı hata olarak gösterilir; kaydedilmiş ödeme tekrar sunulmaz.
Formlar etiketli ve klavyeyle kullanılabilir; Escape/Vazgeç sonrası odak hesap
düğmesine döner. Tasarım tokenları ve mevcut masaüstü responsive düzeni kullanılır.

Borçlu müşteriyi silme hatası kartta açıkça gösterilir; tüm currency borçları
kapandıktan sonra mevcut onaylı soft-delete akışı çalışır. Yenilemeler müşteri
kimliğine kapsamlı yerel bir olayla hesap API'sine yönelir; satışta ayrıca katalog
yenilenir. Veresiye mutation'ları tüm uygulama bootstrap'ını yenilemez.

M7 telefon sepeti ve canlı barkod aynı Quick Sale sepetini kullanır; ayrı veresiye
scanner yolu yoktur. Paid/credit başarıdan sonra kaynak taslak reviewed olur;
kapatma başarısızsa yalnız taslak kapatma yeniden denenir, satış yinelenmez.
Bekleyen sepet yüklemesini durum render'larında iptal eden callback değişkenliği
giderildi; yükleme koruması Strict Mode iptal/yeniden kurulumunu da destekler.

Veresiye ekranları yerel bridge/SQLite ile offline çalışır. Telefon barkodunun
mevcut hosting aktarımı yine internet gerektirebilir; bu, veresiye bağımlılığı
değildir. Android source ve veresiye runtime/schema değiştirilmedi.

`scripts/smoke-market-customer-credit-ui-contract.mjs` foundation zincirindedir.
Test, gerçek React workspaces + Strict Mode + geçici SQLite runtime kullanır;
sayfa yüklendikten sonra tarayıcı ağı kapatılır. Yalnız Electron transport ve
telefon tarama aktarımı test adaptörüyle sağlanır; ürün lookup, sepet, satış,
tahsilat, düzeltme, geçmiş ve silme gerçek uygulama koduyla çalışır.

2026-09-08 doğrulaması:

- `npm run build:packages` ve desktop build geçti.
- `npm run test`: 87 Node testi ve 30 Android testi, sıfır hata.
- `node scripts/check-modular-foundation.mjs`: `modular-foundation-check-ok`;
  lint, Knip, design/architecture, typecheck ve tüm M7/M8 smoke'ları geçti.
- M8.1 targeted smoke: `market-customer-credit-foundation-smoke-ok`.
- M8.2 targeted smoke: `market-customer-credit-ui-contract-smoke-ok`;
  dört normal ödeme yöntemi, backend fiyat değişimi, müşteri seçme/temizleme,
  kapalı capability'de mount/fetch engeli, fazla/çift tahsilat engeli, başarısız
  yenileme sonrası kayıt koruması, düzeltme, 203 hareketin sayfalanması, borç
  kapatma/silme, M7 reviewed recovery, scanner sepeti ve offline işlemler geçti.
- 1440px ve 900px viewport'ta hesap/picker kontrolleri geçti. Mevcut Electron
  pencere alt sınırı 1080px; test, CSS body alt sınırı olan 900px'i de kapsar.
- `npm run android:debug`: `BUILD SUCCESSFUL`; Android source değişmedi.
- Ek finance-db, finance-service, record-deletions ve customer-room-management
  smoke'ları geçti. Test logları `artifacts/test-results/m82/`, görsel kanıtlar
  `artifacts/screenshots/m82-credit/` altında (git dışında).
- Mevcut Vite büyük bundle uyarısı sürer; derleme hatası değildir.

M8.3'e bırakılan: isteğe bağlı borç durumunu WhatsApp'tan gönderme aksiyonu ve
formatter/bridge. M8.2'de buton, şablon, mesaj oluşturma veya otomatik hatırlatma
yoktur. Android veresiye UI, faiz/vade/taksit/limit, avans/negatif bakiye, parçalı
nakit+veresiye, PDF ve raporlar da kapsam dışıdır.

## 18. M8.3 — Customer Credit WhatsApp Paylaşımı — CLOSED

Müşteri hesabının açık detayında ikinci plandaki `WhatsApp'ta Paylaş` aksiyonu
yalnız `commerce.customer_credit` + `service.whatsapp` kesişiminde görünür.
Pozitif borç yoksa pasiftir; `business_type` gate yoktur. WhatsApp kapalıyken
veresiye satış, tahsilat, düzeltme ve geçmiş kullanılmaya devam eder. Credit
kapalıyken hesap/paylaşım mount edilmez; gizli balance read'i yapılmaz.

Paylaş tıklaması `getCustomerCreditAccount` ile güncel, ledger-derived hesabı
yeniden okur. Panel cache'i veya `sale.status` mesaj kaynağı değildir. Pure
`buildCustomerCreditWhatsAppMessage` helper'ı yalnız pozitif bakiyeleri currency
başına ayrı biçimler; farklı paraları toplamaz. Ad yoksa `Merhaba,` kullanır;
cinsiyet eki, AI, teknik kimlik veya hesap geçmişi eklemez. İşletme adı helper'da
isteğe bağlıdır; bunun için yeni global state eklenmedi.

Satır içi compose; kayıtlı ad/telefon, düzenlenebilir textarea, `Kopyala`,
`WhatsApp'a Hazırla` ve `Vazgeç` içerir. İlk taslak gösterildikten sonra kullanıcı
düzenlemesi korunur; hazırlamaya textarea'nın güncel metni verilir. Mevcut bridge
baştaki/sondaki boşlukları temizler; boş metin hazırlanmaz. Telefon kaynağı güncel
customer kaydıdır; mevcut `normalizeTRMobilePhone` kullanılır. Eksik/geçersiz
telefon açık hata verir; yeni telefon alanı veya URL builder yoktur. Compose
odak alır; Escape/Vazgeç odağı paylaşım düğmesine döndürür. Dar desktop düzeninde
mevcut alan/buton stilleri kullanılır.

Yeni salt-okuma `commerce:customerCredit:prepareWhatsApp` IPC'si mevcut kilit
kontrolünü ve persisted WhatsApp/credit capability guard'larını kullanır. Son
hazırlamada hesap yeniden okunur; ad, telefon ve pozitif currency/balance
fingerprint'i değişmişse taslak yenilenir, panel güncellenir ve kullanıcıdan
tekrar inceleme istenir. O adımda WhatsApp açılmaz. Borç sıfırlanmışsa compose
kapanır ve `Bu müşterinin açık veresiye borcu kalmamış.` gösterilir. Bu kontrol
ilk tıklama ve son hazırlama anlarını kapsar; WhatsApp'a aktarıldıktan sonraki
değişiklikler için arka plan izleyicisi veya teslim garantisi değildir.

`prepareWhatsAppAction` mevcut kayıtlı `settings.whatsapp_mode` tercihiyle
kullanılır: `manual_copy` kopyalar; `wa_link` mevcut preload/main `openExternal`
hattına gider; `webview` mevcut güvenli WhatsApp çalışma alanına aktarır.
Desteklenmeyen resmi API modu elle paylaşma açıklamasını korur. Ham `window.open`,
telefon/URL birleştirme veya yeni WebView DOM/gönderim otomasyonu yoktur.

Request odaklı controller'a küçük, ephemeral `PreparedWhatsAppMessage` handoff'u
eklendi: customer phone + düzenlenmiş message taşır. Fake request/requestId veya
message-log tablosu üretilmez. Veresiye kaynağında request silme/AI yeniden yazma/
`Onayla ve Gönder` kontrolleri kullanılmaz; mesaj yalnız **hazırlandı** kabul edilir.
Gerçek gönderim WhatsApp içinde kullanıcıya aittir; sent/delivery/read bilgisi
uydurulmaz. Mevcut request/AI kaynakları kendi doğrulamalı akışlarını korur.
Capability kapanınca compose unmount edilir, bekleyen hazırlama yanıtı aktarılmaz
ve controller'daki veresiye handoff'u temizlenir.

Paylaşım ledger, finance, satış, stok, müşteri veya request değiştirmez. Mount,
tahsilat, düzeltme ve satış başarısı otomatik paylaşım başlatmaz. Hesap okuma,
taslak ve kopyalama çevrimdışı çalışır; yalnız WhatsApp'ın dış bağlantısı internet
gerektirebilir. Açma/kopyalama hatasında metin ve telefon elle paylaşım için kalır;
clipboard erişimi başarısızsa textarea seçilebilir. Yeni dependency, migration,
gönderim kuyruğu, reminder/scheduler, toplu mesaj, Business API, SMS/email, PDF,
ödeme linki veya Android entegrasyonu yoktur. Android source değiştirilmedi.

`scripts/smoke-market-customer-credit-whatsapp.mjs` foundation zincirindedir.
Gerçek React controller/workspaces + Strict Mode + geçici SQLite kullanır;
yalnız Electron transport ve dış WhatsApp açılışı test adaptörüdür. Tarayıcı ağı
kapatılarak fresh 500→300, farklı currency'ler, düzenlenen metin, normal request'e
dönüş, tüm mevcut modlar, telefon hataları, iki sıfır-borç yarışı, final freshness,
capability kapanışı, kilitli IPC ve finansal tabloların paylaşım öncesi/sonrası
tam eşitliği doğrulanır. Formatter'ın pure/deterministic davranışı bridge birim
testlerindedir. Test logları `artifacts/test-results/m83/`, 1440px/900px compose
görselleri `artifacts/screenshots/m83-credit-whatsapp/` altındadır (git dışında).

2026-09-09 doğrulaması:

- `npm run build:packages` ve desktop build geçti.
- `npm run test`: 91 Node testi (12 WhatsApp bridge testi dahil) ve 30 Android
  testi, sıfır hata.
- `node scripts/check-modular-foundation.mjs`: `modular-foundation-check-ok`;
  strict kalite kapıları ve tüm M7/M8 smoke'ları geçti.
- M8.1, M8.2 ve yeni M8.3 targeted smoke'ları ayrıca geçti.
- `npm run smoke:desktop-renderer`: `desktop-renderer-ok`; mevcut request/AI
  WhatsApp aktarımı, safe/WebView düzeni ve onaylı gönderim kontrolleri korundu.
  Test dış WhatsApp servisine gerçek mesaj göndermez.
- `npm run android:debug`: `BUILD SUCCESSFUL`; Android source değişmedi.
- Ek finance-db, finance-service ve record-deletions smoke'ları geçti.
- Mevcut Vite büyük bundle uyarısı sürer; derleme hatası değildir.
