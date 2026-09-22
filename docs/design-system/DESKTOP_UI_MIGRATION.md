> **Historical note — Application Platform v2 Stage 0**
>
> This document records the previous desktop UI baseline and migration reports; it is preserved as history.
> For desktop interaction, workspace, drawer, Settings, or appearance decisions that conflict with the Application Platform v2 target architecture,
> `docs/architecture/APPLICATION_ARCHITECTURE_CONSTITUTION_V1.md` is the target authority.
> For domain behavior, use `docs/architecture/DOMAIN_DECISIONS_V1.md`.
>
> In particular, the single long Settings page, the easy/pro theme approach, drawer-based entity editors,
> and the old Pension page composition described here are not the new target and must not be read as target decisions.

# Desktop UI migration — Final desktop baseline (Stage 3B)

Aşama 1 başlangıcı: temiz `main`, `25ad66e88c700fe883e6ca01b50b8b7e6e279c2f`. Bu aşama ortak renderer kabuğu ve yüzey sözleşmesini taşır. Database, IPC, sync, AI, availability, capability kararları ve feature iş akışları değiştirilmez. `firm-template/web-module/widget.js` kapsam dışıdır. Commit/push yapılmaz.

Aşama 2A başlangıcı: temiz `main`, `c3fac0d1e3ce76b7f53ee8c7d7fb9c1258932c05`. Müşteri İşleri, Pansiyon ve doğrudan kullandıkları editör/oda hesabı yüzeyleri taşındı. Bu belgedeki ekran envanteri günceldir; aşağıdaki Aşama 1 ölçümleri tarihsel karşılaştırma için korunur.

Aşama 2B başlangıcı: temiz `main`, `2e4e4ab7ee94ace592f7643e1d75fe5c9eeae355`. Restoran/Adisyon ve Menü yönetimi ortak desktop tasarım sistemiyle taşındı. Database, IPC, sync, AI, availability, stok, ödeme, oda aktarımı ve sipariş state geçişleri korunur.

Aşama 3A başlangıcı: temiz `main`, `472c9b2c0bc7d2c43d6ba98f2227531f9257fd3c`. Mesajlar/AI ve İlk Kurulum yüzeyleri mevcut design-system sözleşmelerine taşındı. Database, IPC, sync, AI provider/model, message lifecycle, webview lifecycle, setup persistence, capability ve güvenlik davranışları değiştirilmedi. Commit/push yapılmaz.

Stage 3B başlangıcı: temiz `main`, `c8ee15ef12a7778a0c3a9a844a4fc775b5faafc1`. App Lock, yaşayan secondary/shared yüzeyler, motion ve final legacy stylesheet temizliği tamamlandı. Database, IPC, sync, AI, availability, security lifecycle, payment, stock, reservation, task ve persistence davranışları değiştirilmedi. `firm-template/web-module/widget.js` kapsam dışıdır.

## Durumun anlamı

- **migrated:** belirtilen yüzey ortak token/primitive sözleşmesini kullanır; kendi eski kabuk stili yoktur.
- **partial:** ortak kabuk taşınmıştır; iç listeler, formlar, workspace yerleşimi veya özel durum stilleri feature-specific olarak kalabilir.
- **legacy:** final normal desktop DOM envanterinde ayrı bir legacy design-system yüzeyi yoktur; üçüncü taraf ve bilinçli renderer istisnaları ayrıca belirtilir.

Her ana ekran aynı `DesktopAppFrame → AppShell → PageHeader + page-content` zincirini kullanır. Ekranın `partial` olması sidebar/header migration'ının eksik olduğu anlamına gelmez. Aşağıdaki yollar `apps/desktop-app/src/` köküne göredir. CSS yollarında `pages/` ve `components/` önekleri `styles/` altındadır; React yolları gerçek kaynak klasörleridir.

## Ekran envanteri

| Ekran / durum | React dosyaları | Stylesheet ve ortak primitive kullanımı | Kalan bağımlılıklar / responsive / tema |
| --- | --- | --- | --- |
| Ana Ekran — **migrated** | `pages/DashboardPage.tsx`, `components/dashboard/SystemHealthPanel.tsx`, `components/ui/MetricCard.tsx` | `pages/dashboard.css`, `components/metrics.css`, `feedback.css`; AppShell, Panel, surface, MetricCard, StatusBadge, ActionButton, page-toolbar | Öncelik listesi, health kartları ve operasyon blokları semantik tokenlara bağlandı. Ham renk fallback'leri ve tekrarlı selector'lar temizlendi. Geniş çok kolon → dar tek kolon; uzun açıklamalar ellipsis. Kabuk ve içerik light/dark/easy destekler. Hedef CSS audit ihlali sıfır. |
| Müşteri İşleri — **migrated** | `pages/CustomerWorkPage.tsx`, `components/customers/{RequestsWorkspace,CustomersWorkspace,CustomerPicker,CustomerCreditPanel,CustomerCreditBalances,CustomerCreditHistory,CustomerCreditForm,CustomerCreditWhatsAppShare}.tsx` | `pages/customers.css`, `components/{cards,data-list,forms,buttons,panels,dialogs,status,navigation}.css`; DataList/Item/Button, data-list, Panel, ActionButton, StatusBadge, form-grid, drawer--form | Liste/detay, arama, Talepler/Müşteriler/Yanıt Bekleyen, kimlik editörü, veresiye ve oda atama korunur. Manager-form/manager-row/operation layout bağımlılığı kaldırıldı. <=760px stack; üç tema doğrulandı. Hedef CSS audit ihlali sıfır. |
| Takvim — **migrated** | `pages/OperationCalendarPage.tsx` | `pages/calendar.css`; ortak panel/page-toolbar, StatusBadge, ActionButton | Gün/hafta seçimi ve tarih gezinmesi korunur. Hafta sütunları kendi yatay scroll alanında; bu **sayfa overflow'u değildir**. Gün içeriği ve takvim badge'leri semantik tokenlı. Light/dark/easy kabuk; 0 raw renk, 0 duplicate selector. |
| Pansiyon — **migrated** | `pages/PensionPage.tsx`, `components/operations/{OperationWorkspaces,ManualReservationEditor,DailyTaskEditor,RoomPublicDetailsEditor,QuickCustomerCreator}.tsx` | `pages/pension.css`, `components/{cards,data-list,forms,buttons,panels,dialogs,status}.css`; card, DataListItem, form-field varyantları, page-toolbar/action-row, disclosure | Rezervasyonlar, oda kartları, görevler ve konaklama arşivi ortak primitive kullanır. Oda durum değerleri ve aksiyon koşulları aynı; data-status yalnız renk sunumunu belirler. <=1100px ana paneller stack, <=760px formlar full width. Light/dark/easy doğrulandı. |
| Restoran — **migrated** | `pages/RestaurantPage.tsx`, `components/operations/{RestaurantReservationsWorkspace,ManualRestaurantReservationEditor}.tsx`, `components/restaurant/{TableOrdersWorkspace,RestaurantRoomTransferPanel}.tsx` | `pages/restaurant.css`; Panel, MetricCard, DataList/Item, SegmentedControl, ActionButton, StatusBadge, form-field boyutları, `drawer--wide`, `useDialogFocus` | Masa grupları/kartları, aktif adisyon, ürün kategori navigasyonu, quantity kontrolleri, ödeme/kapatma ve oda hesabına aktarım aynı handler/payload'larla çalışır. <=900px workspace dikey akışa geçer; <=760px ürün seçimi ve ticket aynı kaydırılabilir drawer gövdesinde kalır. Light/dark/easy doğrulandı; hedef CSS audit ihlali sıfır. |
| Menü — **migrated** | `components/menu/{MenuManager,MenuPreview}.tsx`, `components/restaurant/StockImageImportWorkspace.tsx` | `pages/menu.css`; Panel, DataList/Button, ActionButton, StatusBadge, form stack/grid, ortak dialog ve `useDialogFocus` | Kategori/ürün listeleri, ürün/stok/görsel alanları, boş durum, ekleme/düzenleme, silme onayı ve stok görsel analiz akışı korunur. 3/2/1 kolon düzeni genişlikte yoğun, dar görünümde stack olur. Normal DOM UI tokenlıdır; özel önizleme renderer borcu ayrı satırdadır. |
| Kasa / Raporlar — **migrated** | `pages/ReportsPage.tsx`, `components/finance/FinanceWorkspace.tsx` | `pages/finance.css`, `reports.css`, `components/metrics.css`; Panel, MetricCard, page-toolbar, StatusBadge, ActionButton, loading-state, useDialogFocus | Kasa: ActionButton, StatusBadge, useDialogFocus, silme onayı, responsive grid, 0 raw renk, 0 duplicate selector. Raporlar: tablo sayısal sağa hizalama, tabular-nums, kısa date inputları, kompakt preset butonları, daily revenue chart tokenları, 0 raw renk, 0 duplicate selector. |
| Market — **migrated** | `pages/MarketPage.tsx`, `components/market/{MarketQuickSaleWorkspace,MarketProductsWorkspace,MarketInventoryWorkspace,MarketPurchasingWorkspace,MarketCompanionInboxWorkspace,MarketLabelsWorkspace}.tsx` | `pages/market.css`, `pages/customers.css`; ActionButton, StatusBadge, form foundation | Hızlı Satış, Ürünler, Telefon Taslakları, Stok, Tedarikçiler/Alım, Etiketler sekmeleri. StatusBadge ile aktif/pasif ve stok seviyesi (danger/warning/success) sunumu. Tekrarlı selector'lar ve dağınık media query'ler birleştirildi. 0 raw renk, 0 duplicate selector. |
| Ayarlar — **migrated** | `components/settings/{SetupForm,BusinessPublicProfileSection,BusinessLocationMapPicker,RoomManagementSection,BusinessCapabilitySettings,DataMaintenanceSettings}.tsx`, `components/security/PasswordSettings.tsx` | `pages/settings.css`, `forms.css`, `buttons.css`, `panels.css`, `badges.css`, `disclosures.css`; lokal `components/settings/business-location-map-picker.css` | Önceki referans migration korunur. İşletmem/Müşteri bilgileri/İşletme düzeni/Bağlantılar/Uygulama/Bakım tek sayfa. Nav gerçek header yüksekliğini izler. 760px altında form stack. Light/dark/easy. Harita tile/pin pikselleri protokol geometrisi; migration borcu olarak tokenlaştırılmaz. |
| Mesajlar / AI — **migrated** | `pages/MessagesPage.tsx`, `components/messages/MessageWorkspaces.tsx` | `pages/messages.css`, `ai.css`; PageHeader, page-toolbar, Panel, DataList/Button, ActionButton, StatusBadge, form-field, status/empty | Güvenli mesaj hazırlama, hazır yanıtlar, AI araçları ve WhatsApp çevre kabuğu ortak yüzey sözleşmesini kullanır. Persistent webview mount, gizli workspace, tab seçimi, draft/state ve AI/provider akışı korunur. Üçüncü taraf webview içeriği kapsam dışıdır. `messages.css`/`ai.css`: 0 raw renk, 0 duplicate selector, 0 important/override/legacy alias. |
| Oda adisyonu / konaklama çalışma alanı — **migrated** | `components/pension/RoomFolioWorkspace.tsx` | `pages/room-folio.css`; Panel/card, StatusBadge, form-row/field, action-button, drawer--wide, overlay header/body/footer ve compact confirmation dialog | Gecelik fiyat, konaklama tarihleri, ürün/kalem, tahsilat ve çıkış yüzeyleri ortak kontroller kullanır. Etiketler, nested modal focus ve scroll doğrulandı. Hesaplama, ödeme ve çıkış handler/payload’ları değişmedi. |
| Yerel menü önizlemesi — dış yüzey **migrated**, özel renderer debt'i | `components/menu/MenuPreview.tsx` | `components/dialogs.css` + `pages/menu-preview.css` | Modal genişliği/backdrop/header/close/focus ortak. Müşteriye görünen özel önizleme palette'i ve düzeni korunur; desktop dark moduna zorlanmaz. `menu-preview.css` içindeki 44 raw renk literal'i bu özel renderer'a aittir; normal Menü DOM UI’da raw renk yoktur. |
| İlk kurulum — **migrated** | `components/settings/SetupWizard.tsx`, `SetupForm.tsx` | `pages/setup.css`, `pages/settings.css`, forms/buttons foundation; onboarding shell, progress, Panel/surface, ActionButton, StatusBadge/status, form-field boyutları | Wizard sidebar shell'inden bağımsız onboarding surface olarak kaldı. İşletme, düzen, bağlantı, AI ve görünüm bölümleri; progress/current state, footer/action hiyerarşisi ve responsive form sözleşmesi ortak tokenlarla standardize edildi. Settings embedded tüketimi korunur. `setup.css`: 0 raw renk, 0 duplicate selector, 0 important/override/legacy alias. |
| Uygulama kilidi — **migrated** | `components/security/AppLockScreen.tsx` | `pages/lock.css`, security semantic tokens, motion tokens | Kilit overlay'i ayrı tam ekran güvenlik yüzeyi olarak kaldı; unlock/reset lifecycle, yüksek z-index, focus ve animasyon sözleşmeleri korunur. Palette ve chrome security tokenlarına taşındı; header'daki kilit butonu `header.css`'te kalır. |

## Ortak yüzey envanteri ve sahiplik

| Yüzey | Kaynak / sözleşme | Durum ve sınır |
| --- | --- | --- |
| App shell, content viewport, global scroll | `components/layout/AppShell.tsx`; `layout/app-shell.css` | **migrated**. Tek grid, sidebar + `minmax(0,1fr)`, `100dvh`; main ve sidebar kendi dikey scroll'unu yönetir. Main scroll ref'i ve sayfa geçişinde scroll reset korunur. |
| Sidebar, nav item, active/collapsed | `components/layout/Sidebar.tsx`; geometri app-shell.css, kontroller `components/navigation.css` | **migrated**. 208/64px tokenları, aria-current ve collapse accessible isimleri korunur. Feature CSS shell selector'ı içermez. |
| Top/page header | `components/layout/PageHeader.tsx`, `components/app/DesktopAppFrame.tsx`; `components/header.css`, `layout/app-shell.css` | **migrated**. `.page-header__title/subtitle/actions`. Eylemler mevcut ActionButton CSS sözleşmesini kullanır. `ResizeObserver`, yalnız layout için `--sticky-header-offset` üretir; işletme state'i değiştirmez. |
| Page padding / width / sections | `layout/page.css`, `layout/responsive.css` | **migrated**. `.page`, `.page-content`, `.page-content--bounded`, `.page-section`, `.page-section__body`, `.page-grid`. Varsayılan fluid; bounded 1200px, okuma alanı 72ch. Settings kendi mevcut bounded kapsayıcısını korur. |
| Section heading / panels / cards | `components/ui/Panel.tsx`, `MetricCard.tsx`; `components/panels.css` | **migrated temel / partial tüketiciler**. `.surface` yalnız dış yüzey; `.panel` padding ekler. `.panel-eyebrow`, mevcut `.panel-heading`, compact Panel ve MetricCard semantik `success`/`warning` tonları Restoran/Menü’de kullanılır. Feature iç kart renkleri ve nested record kartları feature-specific layout olarak kalabilir. |
| Toolbars / action bars | `components/toolbars.css` | **migrated temel / partial tüketiciler**. `.page-toolbar`, `__start`, `__actions`, `.action-row`; wrap, min-width:0, dar ekranda stack. Menü toolbarı ve adisyon footer aksiyonları content-width ActionButton hiyerarşisi kullanır. |
| Badges/chips, tabs/segmented controls | `StatusBadge.tsx`, `SegmentedControl.tsx`; `badges.css`, `navigation.css` | **migrated temel / partial tüketiciler**. Success/warning isimleri eklendi; ok/wait prop uyumluluğu korunur. page-tabs ve segmented-control aynı temel. Market sekmeleri ve özel status chip'leri feature-specific composition'dır; legacy design-system değildir. |
| Status/banner/toast | `components/status.css`, `notifications/NotificationCenter.tsx`, `components/notifications.css` | **migrated ortak status/popover**, özel banner'lar **partial**. Neutral/info/success/warning/danger. Finance/folio mesajları, stok error/info ortak sınıfları kullanır. App status mesajı header'da, bildirim listesi popover'da; ayrı global toast kuyruğu yok. |
| Empty / loading | `components/status.css` | **migrated temel / partial tüketiciler**. empty-state başlık/açıklama/opsiyonel action; loading-state inline/panel/page. Settings public profile, finance, reports, customer credit loading bağlandı. Kısa mesajlar role=status; mevcut alert/aria-live anlamı korunur. Özel calendar/market empty içerikleri Aşama 2. |
| Tables / lists / pagination | `DataList.tsx`; feature CSS | **migrated temel / feature tüketicileri partial**. `records.css` içindeki kullanılmayan CompactList recipe'i kaldırıldı; yaşayan kayıt yüzeyleri `DataList`/`record-workspace` sözleşmelerini kullanır. Finans/market tabloları ve operasyon kayıtları kendi feature CSS'lerinde kalır. Global paginator yoktur. |
| Forms | `forms.css`, native label/input + ActionButton | **migrated temel**, feature tüketicileri **partial**. xs/short/medium/long/fluid. Restoran rezervasyonları ve Menü kategori/ürün/stok formu bu boyutları kullanır; Market ve bazı operasyon formları sonraki aşamadadır. |
| Disclosure / danger confirmation | `disclosures.css`, `dialogs.css` | **migrated dış yüzey**, içerik **partial**. Menü silme ve Restoran oda aktarımı common compact dialog kullanır; pending/saving/close guard'ları korunur. |

## Dialog/drawer sözleşmesi ve kalan borç

- `.overlay`: sabit backdrop, semantik `--color-backdrop`, `--z-dialog`. `.overlay--drawer`: sağa hizalama.
- `.dialog`: md 40rem; `--compact`: 28rem ve panel padding; `--wide`: 72rem; `--preview`: viewport yüksekliğine bağlı gövde. Tüm dialoglar ekran genişliği/yüksekliğiyle sınırlanır.
- `.drawer`: 28rem; `--wide`: 72rem; `--scroll`: bütün drawer içinde scroll. Dar ekranda yüzde 100 genişlik. Grid/flex body davranışı feature'a ait kalır.
- `.overlay-header`, `--sticky`, `.overlay-body`, `.overlay-footer`, `--inset`, `.overlay-close`; ortak border/padding/radius/focus. Mevcut `drawer-close-button` accessible isimleri ve Kapat metni korunur.
- Requests, Customers (müşteri/oda atama), ManualReservation/RestaurantReservation, DailyTask ve RoomPublicDetails drawer'ları bu yüzeye bağlıdır. Restoran siparişi ve oda adisyonu geniş drawer; finans/folio confirmation compact dialog; stok analizi ve yerel önizleme geniş dialog kullanır.
- DOM, role, aria-modal, focus ref'leri, Escape/backdrop handler'ları ve kapatma guard'ları korunur. Aşama 2A hedefleri `useDialogFocus` ile Tab/Shift+Tab, Escape ve çağıran kontrole dönüş sağlar. Diğer dialogların focus yönetimi farklılıkları Aşama 3 adaylarıdır.
- Bildirim merkezi **non-modal popover**, AppLockScreen **ayrı kilit yüzeyi** olarak kalır. Restoran sipariş drawer'ı, oda aktarım onayı, Menü silme, stok analizi ve yerel önizleme `useDialogFocus`/ortak dış yüzeyle doğrulandı; hedef dışı dialog farklılıkları Aşama 3 adaylarıdır.

## Import, cascade ve token audit

`main.tsx` uygulama stili için yalnız `styles/index.css` import eder; IBM Plex font paketi font-face sağlar. Entry point tüm application CSS importlarını açık layer ile yönetir:

```
reset → tokens → foundation → components → layout → pages → utilities
components.legacy → components.primitives
```

Sidebar geometri/scroll yalnız layout'ta; nav ve header kontrollerinin görsel sorumluluğu component katmanındadır. Shell feature selector'ıyla düzeltilmez. Raw renk, important, override token, legacy import, orphan stylesheet ve duplicate shared primitive kontrolleri `scripts/design-system-audit.mjs` / `scripts/lib/desktop-style-audit.mjs` içindedir. `--json` ayrıntılı inventory ve ihlalleri `artifacts/design-system/audit/audit.json` dosyasına yazar.

Duplicate shared primitive kontrolü aynı scope'ta aynı property tekrarını veya farklı dosyalardaki sahipliği raporlar; aynı dosyada ortak surface grubu + yalnız ek padding tanımı yanlışlıkla ihlal sayılmaz. Media scope ayrıdır. Duplicate selector envanteri ise tekrarlanan tüm selector bloklarını sayar; bunların hepsi hata değildir. Yeni ortak shell/component dosyalarında mimari ihlal fatal ve hedef sıfırdır; feature borcunu mevcut strict baseline sınırlar. Baseline yükseltilmedi.

Silinen ortak dosya: `styles/components/segmented-control.css` (navigation.css'e birleştirildi). app-shell.css içindeki navigasyon/header/bildirim blokları ayrıldı; lock.css içindeki header kilit butonu taşındı. requests/restaurant/room-folio/finance/menu/menu-preview dosyalarından ortak overlay exterior kuralları silindi. feedback.css içindeki müşteri identity, persistent message ve pension anchor kuralları ait oldukları feature'a taşındı. İlk refactorda silinmiş `friendly-*`, `*-ux.css`, eski `styles.css` dosyaları geri getirilmedi.

### Kalan cascade borcu (tarihsel snapshot)

Aşağıdaki maddeler Stage 2C / Stage 3A kapanışındaki ara envanterdir. Stage 3B sonucu ve güncel sahiplik için [Aşama 3B sonucu](#aşama-3b-sonucu-final-legacy-surface-cleanup) ile final inventory tablosu geçerlidir.

Restoran ve Menü stylesheet'leri bu aşamada yeniden yazıldı; hedef dosyalarda duplicate selector, `!important`, override token, eski alias ve raw DOM rengi kalmadı. Aşama 3B sonrasında `records.css` ve `operations.css` ile `CompactList` recipe'leri silindi; yaşayan kayıt/operasyon düzenleri ilgili feature CSS'lerinde ve ortak primitive'lerde sahiplenilir. `requests.css` de önceki aşamada silinmiştir. Bu bölümdeki “korunur” ve “adaydır” ifadeleri yalnız tarihsel ara durumu anlatır.

- Güncel sahiplik: `DataList`/`record-workspace` ortak liste kabuğunu sağlar; finans, market ve operasyon iç tablo/list/pagination düzenleri feature-specific layout olarak kalır.
- `pages` katmanı `components` sonrasında gelir; yeni ortak kontrol kuralları feature CSS'e eklenmez.
- Eski alias ve override token katmanı yoktur. Menü preview palette'i, harita/canvas/protocol geometrisi ve üçüncü taraf webview içeriği bilinçli istisnalardır; bunlar körlemesine desktop tokenlarına çevrilmez.

## Responsive ve tema notları

| Sınıf | Viewport | Kabuk kararı |
| --- | --- | --- |
| Wide | >1440px | Fluid workspaces; bounded sayfa tercihi; padding 24px |
| Desktop | 1101–1440px | Aynı sidebar/header; padding 24px |
| Compact | 761–1100px | Padding 16px; header status metni gizlenir, eylemler erişilebilir isimleriyle kalır |
| Narrow | <=760px | Padding 12px, panel 16px; header/toolbar stack; form alanları full width; drawer full width |

CSS custom property media query koşulunda kullanılamadığı için sınırlar literal ve bu contract ile belgelenmiştir. Feature-specific eski 980/1180/1300 vb. iç layout eşikleri bu aşamada topluca değiştirilmedi. Settings nav measured header offset'ini kullanır; geniş/kısa başlık veya UI scale değişimi sticky öğelerin çakışmasına yol açmamalıdır. Sidebar collapse tercihi ve navigation davranışı aynıdır.

Light sıcak nötr/mercan, dark slate/mercan semantik tokenları kullanır. Easy yalnız font/control ölçülerini değiştirir; spacing scale sabittir. Ortak yeni dosyalarda ham renk yoktur. Sabit menü preview canvas, kilit ekranı ve üçüncü taraf WhatsApp içerikleri ayrı tema sınırlarıdır.

## Aşama 2B sonucu

| Yüzey | Sonuç |
| --- | --- |
| Restoran | **migrated** — masa grupları/kartları, rezervasyon çalışma alanı ve editörü, sipariş drawer'ı, kategori/ürün seçimi, satır miktarı/notu, toplam, ödeme/kapatma ve oda aktarımı ortak panel, card, DataList, SegmentedControl, form, badge, ActionButton ve dialog sözleşmelerini kullanır. |
| Menü | **migrated** — kategori/ürün listeleri, ekleme/düzenleme, fiyat/stok/durum alanları, boş durum, silme onayı ve stok görsel import yüzeyi ortak primitive/token sistemindedir. |
| Yerel Menü Önizlemesi | Dış modal/header/backdrop/close/focus **migrated**. Müşteriye dönük özel renderer `menu-preview.css` palette'ini korur; normal desktop DOM chrome tokenlıdır. |

Bu turda silinen ayrı bir `restaurant-*.css` veya `menu-*.css` dosyası yoktur. `restaurant.css` ve `menu.css` legacy kabuk kurallarından arındırılıp feature sahipliğinde yeniden yazıldı; eski `manager-row`, compact table ve özel buton sözleşmeleri kaldırıldı. Yeni ortak primitive eklenmedi; mevcut DataList/DataListButton, Panel, MetricCard, SegmentedControl, ActionButton, StatusBadge ve `useDialogFocus` yeniden kullanıldı. Ortak ihtiyaca karşı `panel-eyebrow` tanımı ve MetricCard'ın `success`/`warning` semantic tonları eklendi.

### Aşama 2B audit ve doğrulama

Güncel desktop audit toplamı: **122 raw renk**, **876 raw px**, **223 raw spacing**, **0 `!important`**, **0 override token**, **0 eski alias**, **127 duplicate selector**. Touched hedef dosyaları `restaurant.css`: **0 raw renk / 0 raw spacing / 0 important / 0 override / 0 alias / 0 duplicate**; `menu.css`: aynı hedeflerin tümünde **0**. Özel `menu-preview.css` renderer'ında **44 raw renk literal'i** korunmuştur ve teknik borç olarak raporlanır. Global design audit raw renk toplamı **200**'dür; bu sayı diğer feature, lock, demo-web ve özel renderer borcunu da içerir.

`smoke-stage2b-restaurant-menu.mjs` beş viewportta semantik görünürlük, ARIA dialog/tab sözleşmesi, ortak surface overflow ve oda aktarım payload'ını kontrol eder. Üç görsel polish turu `artifacts/design-system/stage2b/pass1`, `pass2` ve `pass3` altında üretildi; koordinat/pixel assertion kullanılmadı. 1440×1000, 1366×768, 1024×768, 900×768 ve 600×800 için sayfa/content/surface overflow görülmedi; light/pro, dark/pro ve light/easy durumları doğrulandı.

Sipariş renderer smoke'u ürün ekleme, not kaydı, preparing/payment geçişleri, ödeme ile kapatma, iptal ve yeniden boş masa durumlarını geçti. `smoke:room-folio-transfer` oda hesabı aktarımını geçti ve mevcut `manual_charge` payload'ı doğrulandı. `smoke:stock-image-db` stok görsel import/analiz/uygulama akışını geçti. `smoke:desktop-menu-db` başlangıç fixture'ındaki mevcut `service.ai` yeteneği açıkken testin `aiEnabled=false` beklemesi nedeniyle ilk assertion'da durur; bu, 2B UI diff'inden bağımsız baseline test/fixture uyumsuzluğudur ve AI davranışı değiştirilmemiştir.

Business-logic self-review'da order event handler'ları, fiyat/toplam hesapları, stok mutation'ları, IPC/API çağrıları, room/folio alanları, ID'ler, persistence ve state transition'lar korunmuştur. Menü silme onayı yalnız UI katmanındaki ortak dialoga taşındı; controller doğrudan çağrılırsa eski onayı korur. `firm-template/web-module/widget.js` kapsam dışı tutuldu ve temizdir.

## Aşama 2C sonucu: Kasa / Finans + Market + Ana Ekran + Takvim / Raporlar

Aşama 2C başlangıcı: temiz `main`, `2c89d8a1c17d409775d9c8eec912663b2342ee0a`. Kalan ana desktop çalışma alanları (Kasa/Finans, Market, Ana Ekran/Dashboard, Takvim ve Raporlar) ortak tasarım sistemiyle taşındı. Database, IPC, sync, AI, availability, ödeme, stok, rezervasyon, finans hesaplama ve rapor iş mantığı değiştirilmedi.

| Yüzey | Sonuç |
| --- | --- |
| Kasa / Finans | **migrated** — `FinanceWorkspace.tsx` ActionButton, StatusBadge ve `useDialogFocus` ile silme onayı dialoguna taşındı. `finance.css` yeniden yazıldı: 0 raw renk, 0 duplicate selector, 0 important, 0 overrides, responsive 4-kolon → 2-kolon → 1-kolon düzeni. |
| Market | **migrated** — `MarketProductsWorkspace.tsx` ve `MarketInventoryWorkspace.tsx` StatusBadge primitive'iyle aktif/pasif ve stok seviyesi (danger/warning/success) sunumuna bağlandı. `market.css` sadeleştirildi, dağınık media query'ler tekilleştirildi: 0 raw renk, 0 duplicate selector, 0 overrides. |
| Ana Ekran | **migrated** — `dashboard.css` ham renk fallback'lerinden ve 8 tekrarlanan selector'dan arındırıldı. Ortak system health, briefing, priority ve operasyon blokları semantik tokenlara bağlandı. 0 raw renk, 0 duplicate selector. |
| Takvim | **migrated** — `calendar.css` raw renk fallback'i `var(--color-on-accent)` tokenına bağlandı, tekrarlı selector'lar temizlendi. Gün/hafta modları ve yatay takvim kaydırması korundu. 0 raw renk, 0 duplicate selector. |
| Raporlar | **migrated** — `reports.css` yeniden yazıldı: Tablo sayısal sağa hizalama, `font-variant-numeric: tabular-nums`, kısa date input kontrolleri, kompakt preset butonları, `.daily-revenue-chart` sütun grafiği token entegrasyonu sağlandı. 0 raw renk, 0 duplicate selector, 0 raw spacing. |

### Aşama 2C audit ve doğrulama

- **Desktop Style Audit:** 13 hedefin tümü `desktop-migrated-inventory` kapsamına alındı (cards, data-list, forms, calendar, customers, dashboard, finance, market, menu, pension, reports, restaurant, room-folio). Her birinde:
  - `rawColor`: **0**
  - `duplicateSelectors`: **0**
  - `important`: **0**
  - `override`: **0**
  - `oldAlias`: **0**
- **Global Design Audit:**
  - Desktop raw renk: 122'den **106**'ya düştü (kalan 106 yalnız kapsam dışı/özel renderer dosyalarındadır: lock.css 50, menu-preview.css 44, ai.css 4, records.css 4, operations.css 3, motion.css 1).
  - Tekrarlanan selector'lar: 127'den **91**'e düştü.
- **Yeni Test:** `scripts/smoke-stage2c-core-workspaces.mjs`
  - 5 viewport (1440×1000, 1366×768, 1024×768, 900×768, 600×800)
  - 3 tema/density modu (light/pro, dark/pro, light/easy)
  - 43 yüzey kontrolü, 0 document overflow, 0 content overflow, 0 surface overflow.
  - Ekran görüntüleri: `artifacts/design-system/stage2c/final/` altında kaydedildi.

## Aşama 3A sonucu: Mesajlar / AI + İlk Kurulum

| Yüzey | Sonuç |
| --- | --- |
| Mesajlar / AI | **migrated** — Mesaj çalışma modu için ortak `page-toolbar`/segmented control; talepler için `DataList`; içerik ve AI alanları için `Panel`, `ActionButton`, `StatusBadge`, `status-message` ve form-field sözleşmeleri kullanıldı. Webview yalnız dış container/chrome olarak token sistemine bağlandı. |
| İlk Kurulum | **migrated** — Sidebar'dan bağımsız bounded onboarding surface, hero, anchor tabanlı progress, section surface, semantic status/error ve ActionButton footer oluşturuldu. `SetupForm` Settings embedded görünümü ve bölüm navigasyonuyla geriye uyumlu kaldı. |

### Aşama 3A audit ve doğrulama

- **Desktop Style Audit:** `messages.css`, `ai.css`, `setup.css` strict migrated inventory'ye alındı. Üç dosyada da `rawColor: 0`, `duplicateSelectors: 0`, `important: 0`, `override: 0`, `oldAlias: 0`.
- **Desktop toplamı (Stage 3A kapanışı):** Stage 2C sonrası 106 raw renkten **102**'ye; duplicate selector 91'den **68**'e indi. Kalan desktop raw renkler yalnız Stage 3B kapsamındaki `lock.css` (50), `menu-preview.css` (44), `records.css` (4), `operations.css` (3), `motion.css` (1) dosyalarındadır.
- **Global design audit:** global raw renk sayısı **180** olarak raporlanır; desktop dışı/demo ve özel renderer yüzeyleri bu toplamın içindedir. Bu turda diğer dosyalara yalnız sayıyı düşürmek için dokunulmadı.
- **Yeni smoke:** `scripts/smoke-stage3a-messages-setup.mjs` / `npm run smoke:desktop-stage3a`; 1440×1000, 1366×768, 1024×768, 900×768 ve 600×800; light/pro, dark/pro, light/easy. Mesajlar, AI common surface/status kullanımı, persistent webview marker'ı, Setup onboarding surface/form size/action hiyerarşisi ve embedded Settings overflow'u semantik olarak doğrulanır. Pixel-coordinate assertion kullanılmaz. Screenshot çıktıları `artifacts/design-system/stage3a/` altında ignored olarak tutulur.
- **Business logic review:** Mesaj ID/selected conversation, persistent mount/visibility, webview `src`/partition, effect akışı, AI request/provider/model/response parsing ve Setup save/validation/persistence/capability payload'ları değişmedi.

## Aşama 3B sonucu: Final legacy surface cleanup

| Alan | Sonuç |
| --- | --- |
| App Lock Screen | **migrated** — Tam ekran security surface korundu; lifecycle, reset/unlock handler'ları, password validation, yüksek z-index, focus ve reduced-motion davranışı değişmedi. `lock.css` security semantic tokenlarına geçti. |
| Records / shared lists | **migrated temel** — Kullanılmayan `records.css` kaldırıldı. Yaşayan kayıt yüzeyleri `DataList`, `record-workspace`, `record-note` ve feature sahipliğini kullanır; kullanılmayan legacy sınıflar taşınmadı. |
| Operations | **migrated temel** — Kullanılmayan `operations.css` silindi; yaşayan restoran rezervasyon özeti `restaurant.css` sahipliğine taşındı. Reservation/task/operation handler'ları değişmedi. |
| Motion | **migrated** — `motion.css` redundant pulse ve duplicate keyframe'den arındırıldı; fast/normal/slow duration, standard easing ve reduced-motion sözleşmesi kullanılır. |
| MenuPreview | **desktop chrome migrated / special renderer intentional exception** — Dialog/backdrop/header/close/focus ortak primitive'lerde. Müşteriye görünen renderer palette'i ve canvas düzeni bilinçli olarak literal kalır. |

### Aşama 3B audit ve doğrulama

- **Desktop normal DOM raw color:** Stage 3A **102** → **0**. `lock.css`, `motion.css` ve yaşayan feature yüzeylerinde raw color yoktur.
- **Intentional renderer raw color:** `menu-preview.css` içinde **44** literal. Bunlar özel müşteri menüsü renderer palette'idir; desktop token borcu olarak sayılmaz ve audit'te ayrı sınıflandırılır.
- **Duplicate selector:** Stage 3A **68** → **49**. `records.css`/`operations.css` borcu ve lock/motion içi güvenli tekrarlar temizlendi. Kalanlar çoğunlukla foundation/shared complementary veya responsive/state varyantlarıdır; cascade davranışını bozacak kör birleştirme yapılmadı.
- **`!important` / override / legacy alias:** **0 / 0 / 0**.
- **Audit raporu:** `normalDomRawColor`, `intentionalRendererRawColor`, `rawSpacing`, `geometryPx` ve violation türleri `design-system-audit.mjs` çıktısında ayrı raporlanır. Orphan stylesheet ve legacy import ihlali yoktur.

### Aşama 3B smoke ve görsel doğrulama

- Yeni smoke: `scripts/smoke-stage3b-final-legacy-surfaces.mjs` / `npm run smoke:desktop-stage3b`.
- App Lock semantic contract, wrong-password/reset lifecycle için mevcut lock smoke, shared/secondary yüzeyler ve MenuPreview chrome için shell smoke birlikte doğrulanır.
- Viewportlar: 1440×1000, 1366×768, 1024×768, 900×768, 760×800, 600×800. Lock yüzeyinde document/surface overflow yoktur.
- Temalar: light/pro, dark/pro, light/easy. Reduced-motion altında lock giriş/recovery animasyonları devre dışıdır.
- Screenshot ve `observations.json` çıktıları yalnız `artifacts/design-system/stage3b/` altında tutulur; source/commit kapsamına alınmaz.

## Desktop migration final inventory

- **migrated:** shell, Settings, Customer Work, Pension, Restaurant, Menu, Finance, Market, Dashboard, Calendar, Reports, Messages/AI, Setup, App Lock; ortak panel/list/form/status/dialog/motion primitive'leri.
- **partial:** bazı büyük feature stylesheet'lerinde feature-specific nested records, tablo/pagination ve özel operasyon içerikleri; bunlar legacy design-system değil, feature-specific layout'tır ve ortak shell/primitive sahipliğini ezmez.
- **intentional exception:** `pages/menu-preview.css` özel renderer palette/canvas; harita tile/pin geometry; gerçek canvas/protocol geometry.
- **external/third-party:** WhatsApp/webview iç UI'sı ve `firm-template/web-module/widget.js`.
- **remaining legacy:** migration envanterinde desktop shell/normal DOM için legacy stylesheet kalmadı; kalan partial/exception yüzeyler yukarıdaki sınırlı listeyle belgelenmiştir.

## Final migration summary

- **Foundation:** semantic token, theme, layer ve ortak primitive sözleşmesi oluşturuldu.
- **Shell:** AppShell, PageHeader, toolbar, panel, dialog, form, list ve status yüzeyleri ortaklaştırıldı.
- **Stage 2A:** Customer Work, Pension ve oda/record çalışma yüzeyleri taşındı.
- **Stage 2B:** Restaurant, Menu ve MenuPreview desktop chrome taşındı.
- **Stage 2C:** Finance, Market, Dashboard, Calendar ve Reports taşındı.
- **Stage 3A:** Messages/AI ve Setup taşındı; persistent webview ve setup business flow korundu.
- **Stage 3B:** AppLock, motion, records/operations legacy yüzeyleri ve final audit temizliği tamamlandı.

Final kural: normal desktop DOM semantic token ve mevcut primitive kullanır; MenuPreview özel renderer palette'i, map/canvas/protocol geometry ve üçüncü taraf webview içeriği açıkça belgelenmiş intentional exception olarak kalır.

Güncel strict audit snapshot'ı: normal desktop DOM raw color **0**, intentional renderer raw color **44**, duplicate selector **49**, raw spacing **90**, geometry px **415**, `!important` **0**, `--override-*` **0**, legacy alias **0**. Global audit raw color sayısı **122**'dir; demo-web ve diğer kapsam dışı yüzeyler bu toplamda kalır. `records.css`, `operations.css`, `CompactList.tsx` ve `CompactListItem.tsx` repo ağacında değildir; mevcut desktop stylesheet importlarında orphan/missing CSS import bulunmamıştır.

## Aşama 1 ölçüm ve doğrulama (tarihsel)

Aşağıdaki sayılar yalnız desktop CSS içindir. Token/theme dosyalarındaki palette ve ölçek tanımları raw debt'e dahil edilmez. Raw px sayısı border, breakpoint ve harita geometrisini de içerir; tümü gereksiz spacing değildir. Raw spacing sütunu yalnız padding/margin/gap declaration'larını sayar. Component TSX içindeki görsel hesaplamalar ayrı mevcut inline-style auditinde raporlanır.

Desktop toplamı: **146 raw renk**, **1402 raw px**, **432 raw spacing declaration**, **0 !important**, **0 override**, **0 eski alias kullanımı**, **238 tekrarlanan selector bloğu**. Yeni ortak kabuk dosyalarında mimari ihlal **0**.

| Stylesheet | Satır | Raw renk | Raw px | Raw spacing | Tekrarlanan selector | !important / override |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `pages/menu.css` | 1284 | 8 | 155 | 44 | 48 | 0 / 0 |
| `pages/restaurant.css` | 1248 | 13 | 145 | 57 | 18 | 0 / 0 |
| `pages/market.css` | 1066 | 0 | 82 | 6 | 9 | 0 / 0 |
| `pages/pension.css` | 939 | 0 | 115 | 36 | 14 | 0 / 0 |
| `pages/dashboard.css` | 854 | 14 | 104 | 20 | 8 | 0 / 0 |
| `pages/customers.css` | 823 | 3 | 80 | 30 | 17 | 0 / 0 |
| `pages/finance.css` | 641 | 1 | 51 | 0 | 5 | 0 / 0 |
| `pages/reports.css` | 619 | 0 | 49 | 12 | 11 | 0 / 0 |
| `pages/room-folio.css` | 615 | 0 | 74 | 36 | 14 | 0 / 0 |
| `pages/messages.css` | 542 | 0 | 71 | 20 | 19 | 0 / 0 |
| `pages/settings.css` | 527 | 0 | 10 | 0 | 3 | 0 / 0 |
| `pages/menu-preview.css` | 447 | 44 | 63 | 25 | 0 | 0 / 0 |
| `components/records.css` | 375 | 4 | 41 | 19 | 3 | 0 / 0 |
| `pages/devices.css` | 365 | 0 | 47 | 25 | 4 | 0 / 0 |
| `pages/lock.css` | 357 | 50 | 54 | 22 | 8 | 0 / 0 |
| `pages/ai.css` | 329 | 4 | 47 | 25 | 1 | 0 / 0 |
| `components/operations.css` | 318 | 3 | 44 | 19 | 8 | 0 / 0 |
| `pages/calendar.css` | 299 | 1 | 40 | 14 | 3 | 0 / 0 |
| `components/notifications.css` | 209 | 0 | 9 | 2 | 3 | 0 / 0 |
| `components/navigation.css` | 175 | 0 | 6 | 0 | 2 | 0 / 0 |
| `pages/requests.css` | 168 | 0 | 26 | 7 | 3 | 0 / 0 |
| `components/feedback.css` | 159 | 0 | 18 | 6 | 8 | 0 / 0 |
| `components/forms.css` | 154 | 0 | 2 | 0 | 0 | 0 / 0 |
| `components/settings/business-location-map-picker.css` | 134 | 0 | 17 | 0 | 4 | 0 / 0 |
| `components/resources.css` | 122 | 0 | 11 | 3 | 0 | 0 / 0 |
| `components/metrics.css` | 113 | 0 | 12 | 4 | 1 | 0 / 0 |
| `components/header.css` | 88 | 0 | 1 | 0 | 0 | 0 / 0 |
| `components/dialogs.css` | 85 | 0 | 8 | 0 | 5 | 0 / 0 |
| `pages/setup.css` | 85 | 0 | 3 | 0 | 2 | 0 / 0 |
| `components/buttons.css` | 78 | 0 | 1 | 0 | 0 | 0 / 0 |
| `components/motion.css` | 60 | 1 | 4 | 0 | 0 | 0 / 0 |
| `components/panels.css` | 60 | 0 | 2 | 0 | 2 | 0 / 0 |
| `components/badges.css` | 47 | 0 | 1 | 0 | 0 | 0 / 0 |
| `components/status.css` | 37 | 0 | 2 | 0 | 1 | 0 / 0 |
| `components/disclosures.css` | 24 | 0 | 1 | 0 | 0 | 0 / 0 |
| `components/toolbars.css` | 19 | 0 | 0 | 0 | 1 | 0 / 0 |

### Görsel sonuçlar

Renderer, yerel Vite + Playwright Chromium ile açıldı. Dokuz ekran × dört viewport = **36 ekran kontrolü**; sidebar collapse/navigation, sticky header, panel/toolbar overflow ve dört tip overlay açma/kapatma kontrol edildi. **59 screenshot** `artifacts/design-system/stage1/` altında; sayfa ölçümleri `viewports.json` içindedir. Market katalog ve finans sonuçları yerel fixture'dır; gerçek servis bağlantısı veya satış işlemi bu görsel testin kapsamı değildir.

| Viewport | Ekran | Header / padding | Gözlem |
| --- | --- | --- | --- |
| 1440×1000 | 9/9 | 64px / 24px | Ortak header hizası, geniş çalışma alanı, toolbar wrap ve modal sınırları doğru; document/content overflow yok. |
| 1366×768 | 9/9 | 64px / 24px | Sidebar footer erişilebilir; header sticky kalır; daraltılmış nav içerikle çakışmaz. |
| 1024×768 | 9/9 | 64px / 16px | Panel/toolbar küçülmesi ve wrap doğru; header durum metni yer açar; aksiyon isimleri korunur. |
| 900×768 | 9/9 | 64px / 16px | Menü dış grid'i stack olur; sidebar/content ve toolbar taşması yok; dialog/drawer viewport içinde. |

Takvimin hafta görünümündeki **yerel yatay scroll** korunur. Sipariş drawer'ının yoğun menü satırları ve stok analiz modalinin kaydırılabilir içerik gövdesi feature migration borcudur; sayfa veya modal dışına taşma olarak gizlenmez. İlk turdaki Menü başlık eylemi taşması, gizli önizlemenin boş kolonları ve 900px header action sarılması ikinci polish turunda düzeltildi. Ana Ekran bölüm aralığı ve Pansiyon özet paneli ortak section/panel sözleşmesine bağlandı. Light/pro, dark/pro ve light/easy gerçek Settings kontrolleriyle değiştirildi; computed color-scheme ve DOM mode/theme doğrulandı.

Mevcut Settings design-system smoke ayrıca 760/600px form stack, dört kısa saat kontrolü, 240px harita, sticky section navigation, accessible label/focus ve kaydetme payload'larını doğrular. Pixel koordinat snapshot'ı eklenmedi; yeni geometrik kontroller yalnız overflow, görünürlük ve viewport sınırları içindir.

### Kontroller

- Desktop build: geçti; mevcut Vite >500kB JavaScript chunk uyarısı sürüyor.
- Workspace typecheck: geçti.
- `npm run smoke:desktop-renderer`: geçti; mevcut etkileşim smoke'u, Settings design-system smoke ve yeni shell smoke birlikte çalışır.
- `npm run design:audit:strict`: geçti; yeni parser/guard için iki regression testi de geçti. Core mimari ihlal 0; baseline artırılmadı.
- Değişen TSX/script dosyaları ESLint: geçti.
- `npm run pilot:check`: 36/36 geçti; nihai rapor yolu aşağıdadır.
- `git diff --check`: temiz. Çalışma main üzerinde, değişiklikler unstaged; commit/push yok. Artifactler ignored, widget.js geri alındı.

Nihai pilot: **36 geçti, 0 hata, 0 atlandı**. Rapor: `artifacts/pilot-check/2026-09-14T08-08-34-653Z.json`. Pilot sırasında üretilen `firm-template/web-module/widget.js` başlangıç hâline geri alındı; nihai diff içinde değildir. HEAD başlangıçtaki `25ad66e88c700fe883e6ca01b50b8b7e6e279c2f` olarak kaldı.

## Aşama 2A: başlangıç audit’i ve yapılan migration

| Yüzey | Önceki sorumluluk / sorun | Yeni sözleşme |
| --- | --- | --- |
| Müşteri ve talep listesi | Customers/RequestsWorkspace; `manager-row`, `operation-list-item`, records/operations + customers.css cascade’i; farklı dar ekran gridleri | `DataList`, `DataListButton`, `.record-workspace` ve `__list/__detail/__items`. Liste seçimi, arama ve request geçişleri aynı. |
| Müşteri detay/geçmiş/veresiye | `info-list`, `compact-detail-meta`, nth-child özel geometrisi, kopyalanmış input/panel kuralları | `.data-list`, `.record-note`, panel, form-stack/field, action-row; tarihçe yalnız feature kompozisyonu içerir. Kimlik ve finans değerleri korunur. |
| Müşteri/talep/oda atama editörleri | `manager-form` dolayısıyla menu.css bağımlılığı; manual-request-form ve sabit drawer iç boşlukları | `.drawer--form`, `.overlay-heading`, `.overlay-form`, `.form-grid`, açık field size ve sticky footer. Ortak klavye focus kapsamı. |
| Pansiyon rezervasyon/görev/arşiv | OperationWorkspaces + pension.css/records.css/operations.css; aynı selector üzerinde art arda override’lar, rastgele yükseklikler | `.record-stack`, `.data-records`, `DataListItem`, `.filter-row`, `.record-disclosure`, page-toolbar/action-row. |
| Odalar | `compact-resource-grid`, `resource-compact-card`; kapasite/tarih/not ve aksiyonlar için ayrı compact kurallar | `.room-grid`, `.card`, `__header/__meta/__actions`. available→success; occupied→info; reserved/cleaning→warning; maintenance/out_of_service→danger. Select seçenekleri ve engelleme koşulları değişmedi. |
| Rezervasyon, oda ve görev formları | ManualReservationEditor, RoomPublicDetailsEditor, DailyTaskEditor, QuickCustomerCreator; farklı custom form/layout kuralları | xs sayı/kapasite; short tarih/saat/telefon/oda numarası/fiyat; medium ad/select; long oda/müşteri seçimi/yatak bilgisi; fluid not/açıklama. <=760px doğal stack. |
| Oda hesabı | RoomFolioWorkspace; custom button/input/payment/confirm stilleri, CSS pseudo metinleri, farklı padding/radius | Panel/card/StatusBadge; açık form size; içerik genişliğinde action-button; drawer header/body/footer; nested dialog ve focus. Gecelik fiyat grubu bir field-control-group. Native işlem metni artık CSS ile gizlenmez. |

Başlangıç dosyaları (satır sayısı terminal newline dahil): customers.css **823**, pension.css **939**, room-folio.css **615**, requests.css **168**. İlk üçünde sırasıyla **3/0/0** hex/rgb/hsl literal’i, **30/36/36** raw px spacing declaration’ı vardı. Üç dosya feature kompozisyonuna indirildi; sırasıyla **297/164/254** satır. Hedef feature CSS’inde raw spacing declaration’ı da sıfırdır. 1px border ve responsive breakpoint sabitleri tasarım borcu olarak tokenlaştırılmaz.

### Dosya sahipliği ve silmeler

- **Silindi:** `styles/pages/requests.css`. Tarih gösterim helper’ı forms.css’e, hazırlanmış WhatsApp mesajı messages.css’e taşındı. Kalan restoran editör kuralları restaurant.css’te `restaurant-reservation-*` olarak açık biçimde sahiplenildi; kullanılmayan eski talep kartı/toggle/override blokları kaldırıldı.
- **Yeniden yazıldı:** customers.css, pension.css, room-folio.css. Menü formu ve legacy compact resource/list sözleşmeleri bu iki feature’dan çıkarıldı.
- **Eklendi:** `components/cards.css`, `components/data-list.css`, `components/ui/DataList.tsx`, `components/ui/useDialogFocus.ts`.
- **Ortak düzeltmeler:** forms.css alan boyutları/tarih helper’ı; dialogs.css form drawer/header/footer; disclosures.css form-grid gövdesi; toolbars.css action-row hizası/başlık açıklaması; index.css deterministik import.
- Restoran iş akışı/tasarımı taşınmadı. Ortak DailyTasks/QuickCustomerCreator yeni primitive’leri kullanır; yalnız Restoran’a ait eski filtre/editör CSS’i artık kendi dosyasında kalır. Market, ortak CustomerPicker/veresiye primitive değişikliklerini kullanır; Market ekran yerleşimi değişmez.

### Audit sonucu ve sınırları

`npm run design:audit:strict` artık cards/data-list/forms + customers/pension/room-folio kapsamını ayrıca sıfır ihlal ve sıfır duplicate selector ile denetler. Ortak primitive sahipliği listesine card/list/form sözleşmeleri eklendi; baseline yükseltilmedi. Mevcut shell guard’ı devam eder.

| Ölçüm | Aşama 2A hedef CSS | Desktop toplamı |
| --- | ---: | ---: |
| Raw hex/rgb/hsl renk | 0 | 143 |
| `!important` | 0 | 0 |
| `--override-*` | 0 | 0 |
| Eski alias | 0 | 0 |
| Duplicate selector | 0 | 195 |
| Raw px spacing declaration | 0 | 334 |
| Raw px literal (border/breakpoint dahil) | 23 | 1156 |
| Feature içinde shell/sidebar/header selector | 0 | Audit raporuna dahil |

Repo genelindeki sürüm kontrolüne aday **47 kaynak CSS dosyası** (token/tema hariç) **221 raw hex/rgb/hsl renk** içerir; bu sayı mevcut desktop + demo-web + web-widget audit kapsamıyla aynıdır. Bu, generated/vendor dosyaları içeren sınırsız grep sayısı değildir. Named CSS renkleri bu metrikte sayılmaz; hedef yeni dosyalarda named raw renk de eklenmedi.

Büyük kalan feature borcu 2B hedeflerinin dışındadır: `market.css`, `dashboard.css`, `finance.css`, `reports.css`, `lock.css`, `ai.css` ve `menu-preview.css` özel/legacy kurallar taşır. Bu tarihsel Aşama 2A notunda `records.css` ve `operations.css` korunuyordu; Stage 3B final cleanup'ta iki dosya ve bunların kullanılmayan recipe'leri kaldırıldı. Restoran/Menü hedef dosyalarının güncel ölçümleri Aşama 2B sonucu bölümündedir.

### Görsel doğrulama ve erişilebilirlik

`smoke-desktop-customer-pension.mjs` lokal Vite renderer + gerçek React bileşenleri + deterministik bridge fixture kullanır. Gerçek database veya uzak servis değiştirilmez. Çıktılar `artifacts/design-system/stage2a/{pass1,pass2,final}/`; sürüm kontrolüne alınmaz.

İlk turda masaüstü viewportları geçti; ek 600px kontrolde column flex-basis nedeniyle not alanı taşması bulundu. İkinci turda form-grid, başlık/açıklama hizası, filtre genişliği ve küçük kontrol boyutları düzeltildi. Son genişletilmiş tur 113 yüzeyi kapsar: liste/detay/kimlik, arama boş state’i, bekleyen talepler, veresiye form/hata, oda atama, rezervasyon yeni/düzenle/boş filtre, hızlı müşteri, günlük iş, oda kartları/detay editörü, folio/ödeme/nested confirmation.

| Viewport | Sonuç / yerleşim |
| --- | --- |
| 1440×1000 | Müşteri liste/detay ve Pansiyon ana panelleri iki sütun; kısa telefon/tarih/numeric alanlar sınırlı, butonlar content width. |
| 1366×768 | Aynı desktop düzeni; drawer gövdesi kayar, header/footer erişilebilir. |
| 1024×768 | Pansiyon panelleri tek sütuna iner; müşteri master list daralır; filtre/aksiyonlar wrap eder. |
| 900×768 | Ortak shell ile overlap yok; oda kartları doğal küçülür; drawer viewport’a sığar. |
| 600×800 (ek) | Formlar ve liste/detay stack; alanlar full width; column flex-basis taşması giderildi. |

Tüm ölçülen yüzeylerde document/content/panel/toolbar/form/dialog yatay taşması sıfır. Light/pro, dark/pro, light/easy gerçek Ayarlar kontrolleri üzerinden değiştirildi. Label-control ilişkisi, kısa alan genişliği, Tab/Shift+Tab ve Escape, focus restoration, engelli web kaynaklı rezervasyon tarih alanı ve veresiye tutar hatası doğrulanır. Müşteri ve rezervasyon submit payload’ları gerçek renderer handler’ları üzerinden kontrol edilir. Kapama butonlarının loading guard’ları korunur; nested confirmation yalnız mevcut cancel handler’ını çağırır.

### Aşama 2A riskleri (tarihsel)

Restoran rezervasyonları ve sipariş drawer’ı hâlâ legacy compact row/form kurallarına bağlıdır. Yeni DataList/Card/Form primitive’lerine geçerken masa/adisyon, stok ve oda hesabına aktarım handler’ları korunmalı. Menü’nün manager-form/manager-row ve yüksek specificity kuralları öncelikli temizlik adayıdır. Market veresiye bileşenleri ortak olsa da ürün/sepet/checkout yüzeyleri henüz migrated değildir. Oda hesabının finans davranışı bu aşamada değiştirilmedi; Kasa migration’ı kendi finans testleriyle doğrulanmalıdır. Hizmet dışı oda için formatter’ın eski “Boş” fallback’i, yalnız kullanıcıya görünen etiket olarak “Hizmet dışı” ile düzeltildi. Oda status value ve uygunluk koşulları aynı kalır. Hedef dışı dialog focus farklılıkları Aşama 3’te kalır.


### Aşama 2A test sonuçları

- `npm run build -w @yardimci-asistan/desktop-app`: geçti; mevcut Vite chunk boyutu uyarısı sürer.
- `npm run typecheck`: geçti.
- `npm run smoke:desktop-renderer`: geçti (ana renderer akışları, Settings, dokuz ekranlı shell ve müşteri/Pansiyon testi).
- `smoke-customer-room-management-db.mjs`, `smoke-room-folio-service.mjs`, `smoke-daily-task-management.mjs`: geçti. Günlük iş testindeki eski CSS kaynak-string beklentisi kaldırıldı; Pansiyon/Restoran’da boş liste ve Yeni İş erişimi gerçek renderer’a taşındı.
- `npm run design:audit:strict`: geçti; 3 audit testi ve hedef mimari guard’ları dahil.
- Değişen TS/TSX/MJS dosyalarında ESLint: 0 hata / 0 uyarı.
- `npm run pilot:check`: **37 geçti, 0 hata, 0 atlandı**. Rapor: `artifacts/pilot-check/2026-09-14T18-25-45-568Z.json`.
- `git diff --check`: temiz. Çalışma `main` üzerinde; kaynak değişiklikleri commit edilmedi, push yapılmadı. Generated widget başlangıç hâline döndürüldü; artifact ve screenshot’lar commit kapsamında değil.
