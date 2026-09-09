# Yardımcı Asistan

Yardımcı Asistan; **tek lokasyonlu küçük fiziksel işletmeler** için tasarlanan modüler, local-first bir işletme sistemidir. İlk çalışan ürün pansiyon/restoran/kafe akışlarıyla olgunlaştı; mimari artık sektör tipine değil persisted **business capability** setine göre çalışma alanlarını açar. Market/perakende de aynı capability-first temel üzerinde desteklenen profiller arasındadır.

Sistem; web sitesi veya gömülebilir web widget, firma hostinginde çalışan mini API, PC masaüstü uygulaması, Android companion, AI araçları, WhatsApp destek akışları ve sektör çalışma alanlarından oluşur. Merkezi bir cloud servisi zorunlu değildir; her firma kendi hostingi, kendi PC uygulaması ve kendi verisiyle bağımsız çalışabilir.

## Ürün Mimarisi

Canonical yön:

```text
Business
  ↓
Profile = ilk kurulum preset'i
  ↓
Persisted Capabilities = runtime source of truth
  ↓
Workspaces / Services / Devices
```

Profil bir sınıf değildir. Hibrit işletmeler yeni profil kombinasyonları üreterek değil capability ekleyip çıkararak oluşur.

Ortak çekirdek; müşteri, görev/takvim, bildirim, finans, rapor, web, senkron, yedekleme ve cihaz yönetimini taşır. Sektör domain'leri bunun üzerine eklenir:

```text
accommodation.*
food_service.*
commerce.*
retail.*
channel.qr_menu
```

Ayrıntılı ve güncel mimari sözleşme için [Modüler İşletme Temeli ve Market Handoff](docs/MODULAR_BUSINESS_FOUNDATION.md) esas alınmalıdır.

## Çalışan Ürün Omurgası

- Web formu ve Web AI üzerinden müşteri talebi toplama
- Firma hostingi ile masaüstü arasında local-first otomatik senkronizasyon
- Müşteri, rezervasyon, oda, masa ve günlük iş yönetimi
- Pansiyon konaklama takibi, oda hesabı, tahsilat ve çıkış
- Restoran masa adisyonu, sipariş durumu ve stok takibi
- Pansiyon + restoran işletmelerinde masa hesabını açık oda hesabına aktarma
- QR menü yayınlama
- Günlük/haftalık operasyon takvimi
- Basit ön muhasebe ve raporlar
- AI destekli cevap, özet, rapor ve görselden veri çıkarımı
- WhatsApp hazır mesaj, manuel akış ve Electron içi WhatsApp Web çalışma alanı
- Android companion, cihaz rolleri ve görev bazlı yetkiler
- Uygulama kilidi, yerel yedekleme ve masaüstü paketleme altyapısı

AI, WhatsApp veya internet bağlantısı sistemin tamamı için tek hata noktası değildir. Masaüstü temel operasyonları yerel SQLite ile sürdürebilir; bağlantı geri geldiğinde kuyruklar yeniden senkronize edilir.

## Ana Bileşenler

- `apps/demo-web`: Web sitesi olmayan firmalar için özelleştirilebilir demo site.
- `apps/desktop-app`: İşletmenin ana yönetim merkezi olan Electron + React uygulaması.
- `apps/android-app`: Hızlı takip ve yetkili saha işlemleri için native Android companion.
- `packages/shared`: Ortak tipler, capability registry ve domain sözleşmeleri.
- `packages/web-widget`: Mevcut web sitelerine eklenebilen widget.
- `packages/ai-core`: Provider bağımsız AI adapter ve prompt altyapısı.
- `packages/whatsapp-bridge`: WhatsApp link, manuel kopyalama ve WebView akışları.
- `packages/sync-core`: Firma hostingi ile PC/Android arasındaki taşıma sözleşmeleri.
- `firm-template/web-module`: Firma hostingine kurulacak PHP + SQLite mini API ve web modülü.

## Capability-first Runtime

Gerçek çalışma alanı kaynağı masaüstü SQLite içindeki `business_capabilities` tablosudur.

Çekirdek capability örnekleri:

```text
core.customers
core.tasks
core.calendar
core.finance
core.reports
core.web
core.sync
core.backups
core.devices
```

Sektör capability örnekleri:

```text
accommodation.rooms
accommodation.folio
food_service.tables
food_service.orders
food_service.menu
commerce.catalog
commerce.inventory
commerce.sales
retail.barcode
retail.suppliers
retail.labels
```

`profile_id` yalnız profil/preset bilgisidir; yeni runtime feature gate'leri profil kimliği karşılaştırarak yazılmamalıdır. Runtime kararı persisted `business_capabilities` snapshot'ından verilir.

## Commerce / Market Temeli

Market UI ve sektör bağımsız commerce omurgası hazırdır:

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

`apps/desktop-app/electron/commerce-runtime.ts`, katalog/stok/satış/barkod/tedarikçi işlemlerini persisted capability'lerle korur. Market MVP'nin UI ve cihaz adapter aşaması sonraki geliştirme fazıdır.

## Ana Müşteri Talep Akışı

1. Müşteri web sitesindeki formu doldurur veya Web AI ile konuşur.
2. Talep önce firma hostingindeki mini API'ye kaydedilir.
3. Müşteriye talebin işletmeye iletildiği onayı gösterilir.
4. İsterse ayrıca WhatsApp iletişim yolunu kullanabilir.
5. Masaüstü uygulaması talebi otomatik senkronizasyonla çeker.
6. İşletme sahibi talebi, müşteriyi ve varsa rezervasyon akışını tek yerde görür.
7. AI cevap taslağı hazırlayabilir; gönderim kararı kullanıcıda kalır.

```text
Web form / Web AI
  ↓
Firma hostingi / PHP + SQLite
  ↓ cursor + acknowledgement
Masaüstü SyncCoordinator / local SQLite
  ↓ versioned outbox
QR menü + Android operasyon snapshot'ı
```

## Güvenlik ve Dayanıklılık

- PC'ye internetten port açılmaz; masaüstü bağlantıyı dışarı doğru kurar.
- API ve AI anahtarları web frontend'ine veya Android cevaplarına çıkarılmaz.
- Masaüstündeki AI anahtarı renderer'a başlangıç verisi olarak verilmez.
- Hostingdeki gizli/runtime dizinler doğrudan web erişimine kapatılır.
- Public yazma/AI uçlarında sunucu tarafı hız ve gövde boyutu sınırları bulunur.
- Yeni Android cihaz varsayılan olarak pasif/onay bekler durumundadır.
- Android işlemleri action ID, cihaz kimliği, izin, stale-version ve receipt/idempotency kontrollerinden geçer.
- Renderer → preload/IPC → Electron main katman sınırı architecture audit ile korunur.

## Kalite Kapıları

Repo artık yalnız build/test ile kontrol edilmez.

```text
ESLint
Knip
Design system debt audit
Architecture audit
TypeScript
Workspace tests
Capability/commerce smoke testleri
```

Günlük kalite kontrolü:

```bash
npm run quality:strict
```

Capability-first ve commerce temelinin tam checkpoint'i:

```bash
node scripts/check-modular-foundation.mjs
```

Başarı çıktısı:

```text
modular-foundation-check-ok
```

Bu runner build, quality gate ve aşağıdaki kritik sözleşmeleri birlikte doğrular:

```text
business-capabilities-smoke-ok
capability-runtime-v2-smoke-ok
setup-capability-contract-smoke-ok
commerce-foundation-smoke-ok
commerce-runtime-smoke-ok
```

## Geliştirici Komutları

Kurulum ve genel build:

```bash
npm install
npm run build
npm run typecheck
npm test
```

Desktop:

```bash
npm run dev:desktop
```

Daha geniş Linux doğrulaması:

```bash
npm run check:linux
```

Android geliştirme:

```bash
npm run android:install
npm run android:phone-test
npm run android:screenshot
npm run smoke:android-device-ui
npm run android:mirror
```

Showcase runtime:

```bash
npm run showcase:data:prepare
npm run showcase:data:reset
YA_DESKTOP_DATA_DIR="$PWD/.demo-runtime/pension-restaurant" npm run dev:desktop
```

## Dokümanlar

- [Modüler İşletme Temeli ve Market Handoff](docs/MODULAR_BUSINESS_FOUNDATION.md)
- [Proje Özeti](docs/PROJECT_BRIEF.md)
- [Sistem Mimarisi](docs/ARCHITECTURE.md)
- [Güncel Ürün Durumu](docs/PRODUCT_STATUS.md)
- [Güncel Görev Planı](docs/TASKS.md)
- [Veri Modeli](docs/DATA_MODEL.md)
- [Otomatik Senkronizasyon](docs/AUTOMATIC_SYNC.md)
- [Pilot Saha Testi](docs/PILOT_FIELD_TEST.md)
- [UI Kuralları](docs/UI_RULES.md)
- [Codex Çalışma Kuralları](docs/CODEX_RULES.md)
- [Geliştirme Kurulumu](docs/DEVELOPMENT_SETUP.md)
- [Firma Web Modülü Kurulumu](docs/WEB_MODULE_INSTALLATION.md)
- [Demo Site Özelleştirme](docs/DEMO_SITE_CUSTOMIZATION.md)
- [Android Dağıtımı](docs/ANDROID_DISTRIBUTION.md)

## Güncel Geliştirme Aşaması

Pansiyon/restoran showcase omurgası ve capability-first modüler altyapı oluşturulmuştur. Market/perakende sıradaki sektör çalışma alanıdır.

Market geliştirmesi başlamadan önce `node scripts/check-modular-foundation.mjs` yeşil olmalıdır. Market için planlanan sıra, veri modeli, capability kararları, barkod/etiket cihaz abstraction'ı ve MVP sınırı [Modüler İşletme Temeli ve Market Handoff](docs/MODULAR_BUSINESS_FOUNDATION.md) içinde kayıtlıdır.

Güncel baseline yalnız `profile_id` ve `business_capabilities` sözleşmesini taşır. Eski profil alanları, module projection'ları ve geçiş migration'ları desteklenmez; temiz kurulum `001_baseline.sql` ile başlar. Eski bir veritabanı veya backup açılmaya çalışılırsa runner/backup doğrulaması açık hata verir.
