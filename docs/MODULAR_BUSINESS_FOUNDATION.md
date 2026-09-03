# Yardımcı Asistan — Modüler İşletme Temeli ve Market Handoff

> Güncellik: 2026-09-03  
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

### Planlı

- `market`
- `other`

`market` shared registry'de tanımlıdır ancak minimum Market workspace'i oluşana kadar normal kurulum seçicisinde planlı kalır.

Market varsayımları:

```text
core.*
service.whatsapp
service.android
commerce.catalog
commerce.inventory
commerce.sales
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

Domain yetenekleri `Ayarlar → Özel Yetenekler` alanından yönetilir.

Eski büyük `LegacySetupWizard` henüz tamamen parçalanmadığı için setup save yolunda Electron-side geçici compatibility adapter vardır. Bu adapter yeni kodun source of truth'u değildir.

**Kural:** Yeni renderer kodu `DesktopSetupData.modules` okumamalı ve yeni setup alanı eski `modules` sözleşmesine eklenmemelidir.

## 7. Commerce foundation

Market UI başlamadan önce sektör bağımsız commerce omurgası oluşturuldu.

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

Store:

- `apps/desktop-app/electron/commerce-store.ts`

Capability-guarded runtime:

- `apps/desktop-app/electron/commerce-runtime.ts`

Runtime kuralları:

```text
commerce.catalog   → katalog işlemleri
commerce.inventory → stok işlemleri
commerce.sales     → satış işlemleri
retail.barcode     → barkod lookup
retail.suppliers   → tedarikçi yönetimi
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

## 8. Market cihaz abstraction yönü

Market workspace'e donanım bağlanırken UI cihaz markasına bağlanmamalıdır.

Planlanan sınırlar:

```text
BarcodeInput
  Simulator
  USB Keyboard Scanner
  Camera Scanner

LabelPrinter
  Preview / PDF / PNG
  ZPL
  TSPL
  Windows printer adapter (gerektiğinde)
```

İlk Market MVP donanım zorunluluğu getirmeyecektir. Klavye gibi davranan USB scanner en basit fiziksel yol; Android kamera scanner daha sonra hosting/LAN transport tercihiyle eklenebilir.

## 9. Kalite kapıları

Repo artık yalnız build/test ile kontrol edilmez.

Aktif kalite katmanları:

```text
ESLint
Knip
Design system debt audit
Architecture boundary audit
TypeScript typecheck
Workspace tests
Capability/commerce smokes
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

Bu runner şu kritik smokeları da çalıştırır:

```text
business-capabilities-smoke-ok
capability-runtime-v2-smoke-ok
setup-capability-contract-smoke-ok
commerce-foundation-smoke-ok
commerce-runtime-smoke-ok
```

## 10. Architecture audit tarafından korunan sınırlar

- `packages/*` uygulama katmanına import yapamaz.
- Desktop renderer Electron runtime modüllerini doğrudan import edemez; Electron tipleri yalnız `import type` ile alınabilir.
- Sandboxed preload, `electron` dışında uygulama runtime modülü yüklememelidir.
- Renderer → preload/IPC → Electron main sınırı korunmalıdır.

Yeni Market kodu bu kuralları gevşetmemelidir.

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

Aynı şekilde `LegacySetupWizard` ismi ve compatibility form shape'i yeni özellik geliştirme yüzeyi değildir. Yeni Market ayarları doğrudan capability/runtime modellerine eklenmelidir.

## 12. Yeni session: Market MVP çalışma sırası

Yeni session'da aşağıdaki sırayla ilerle:

### M1 — Commerce repository'yi Market kullanımına tamamla

- kategori CRUD
- ürün listeleme/arama
- barkod exact lookup
- stok balance + hareket geçmişi
- fiziksel sayım
- tedarikçi CRUD
- satın alma/stock-in servis sınırı
- gerekiyorsa purchase order minimum servisleri

### M2 — Market IPC/preload contract

Renderer store dosyalarını import etmemeli.

```text
Market Workspace
  ↓
preload bridge
  ↓
commerce IPC
  ↓
commerce-runtime
  ↓
commerce-store / SQLite
```

Her IPC capability guard ile korunmalı.

### M3 — Market workspace MVP

İlk ekran büyük ERP paneli olmamalı. Günlük küçük market akışına göre:

```text
Hızlı Satış
Ürünler
Stok
Tedarikçiler / Alım
Etiketler
```

İlk görünümün odağı hızlı satış ve barkod girişi olmalıdır.

### M4 — Hızlı satış

- barkod veya ürün arama
- sepete ekleme
- adet değiştirme
- toplam
- nakit/kart gibi basit ödeme yöntemi
- tek transaction ile paid sale
- stok düşümü
- başarısız satışta tam rollback

### M5 — Barkod input abstraction

Önce simulator + keyboard scanner.

Android camera scanner daha sonra eklenir; desktop Market MVP'yi bloke etmez.

### M6 — Etiket MVP

Önce preview/PDF/PNG üretimi. ZPL/TSPL cihaz adaptörleri gerçek saha donanımı belli olduğunda eklenir.

### M7 — Market profilini kullanılabilir yap

Market workspace'in minimum günlük akışı çalıştıktan ve smoke'lar yeşil olduktan sonra:

```text
market.availability = available
```

Setup selector'a o zaman eklenir.

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

## 14. Yeni session'da geri dönülmemesi gereken kararlar

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

## 15. Yeni session başlangıç kontrolü

Yeni session'ın ilk işi repo head'ini okuyup aşağıdaki komutu istemek veya çalıştırmak olmalıdır:

```bash
node scripts/check-modular-foundation.mjs
```

Bu yeşil değilse Market UI geliştirmesine başlanmamalıdır.
