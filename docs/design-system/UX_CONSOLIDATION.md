# Application-wide UX consolidation

Bu sözleşme mevcut Desktop Design System v3 ve Application Platform v2'nin
uygulama standardıdır. Domain, IPC, storage ve Settings v2 lifecycle'ları korunur.

## Canonical örnekler

| Alan | Mevcut sahip / örnek |
| --- | --- |
| Page frame, top bar, sidebar | `DesktopAppFrame`, `AppShell`, `PageHeader`; tek sayfa başlığı |
| Çalışma alanı | `PageWorkSurface`, `FeatureWorkspacePage`; ana operasyonlarda `fill` |
| Toolbar ve görünüm seçimi | `FeatureViewSelector`, `page-toolbar`; Market ve Pazarlama |
| Panel / servis card | `Panel`, `ServiceSettingsCard`; Settings v2 |
| Uzun liste | `DataListButton` / `DataListItem` `twoLine`; Pazarlama içerik/yayın/plan ve kampanya listeleri |
| Form ve action | `form-field`, `form-stack`, `ActionButton`, `IconButton`; minimum hedef 44px |
| Entity editor | `WorkspaceFrame` / mevcut Workspace navigation; müşteri, ürün, menü ürünü, oda, masa |
| Dialog / confirm | `ModalSurface`, `FormDialog`, mevcut Workspace confirm; bir modal sınırı |
| Büyüyen koleksiyon seçimi | `SearchSelect`; müşteri, ürün, kategori, oda, tedarikçi, segment, şablon, medya |
| Empty / feedback | Mevcut `empty-state`, yerel status/alert; durum işleme yakın gösterilir |

Eski Market tab CSS'i, duplicate müşteri/native select filtreleme, feature-owned
picker/panel görünümü, kullanılmayan navigation açıklamaları ve renderer customer/room
presentation helper'ları kaldırılır.

Başlık + açıklama + aynı başlıklı panel katmanı tekrar edilmez. Kritik kanal, izin,
fiyatlama, yayın sürümü ve gönderim bilgileri workspace veya contextual yardımda kalır.
Navigasyon için quiet selected state; kaydet/ana işlem primary, yardımcı işlem secondary,
yıkıcı işlem danger kullanılır. Hover/pressed/focus/selected durumları shared CSS'e aittir.

Menü önizlemesi ve stok görseli aktarımı da aynı `ModalSurface` sınırını kullanır;
ayrı overlay/dialog veya drawer görünümü yoktur. Modal içi onay ve workspace
alt akışları mevcut sınırın içinde kalır.

## Search / select

`SearchSelect`, mevcut primitive'in non-modal native popover sürümüdür. Native top layer
bir `FormDialog`/Workspace içinde de görünür; ikinci `showModal` veya nested modal açmaz.

- Açılışta arama focus'u; anlık Türkçe metin ve normalize telefon araması.
- ArrowUp/Down, Home/End, Enter; disabled kayıtlar atlanır.
- Seçili satır + keyboard active descendant; Escape yalnız seçiciyi kapatır ve focus'u
  trigger'a döndürür. Dış click/focus geçişi kapatır.
- İki satır, optional metadata/thumbnail, empty result ve optional yeni ekle slotu.
- Viewport sınırında yerleşim, dar pencere, light/dark, 44px hedef.

Küçük sabit enum'lar native select kalır. Sık kullanılan çoklu ürün ekleme işleminin
mevcut inline `MenuProductPicker` ve quick-sale ürün listesi korunur; her ürün için
ayrı picker açmak gerekmez. Mevcut tarih/saat picker'ı aynı işi yapmadığı için korunur.

## Tek sayfa ve görünüm hafızası

Pazarlama stüdyo, kampanya, yayın, medya, takvim ve analitik aynı page workspace'inde
kalır. Yayın/plan/segment düzenleme ve önizleme inline alt işlemdir. Müşteri, ürün,
menü ürünü, oda ve masa mevcut canonical entity Workspace'i kullanır.

`app/page-view-state.tsx` tek presentation persistence sahibidir. Provider unlocked
uygulamada, business ID + database path anahtarıyla yaşar. Route remount sırasında
sekme, filtre, arama, seçili kayıt ID'si, rapor aralığı, takvim tarihi ve geçici görünüm
tercihlerini bellekte korur. `usePageViewScroll` yalnız gerçek scroll sahibini izler;
asenkron içerik dolunca konumu geri yükler, kullanıcının scroll girişimine öncelik verir.

LocalStorage veya domain cache kullanılmaz. Draft, secret, entity snapshot saklanmaz.
Seçili içerik/yayın/plan/kampanya ID'si canonical snapshot/bridge üzerinden yeniden
okunur; eksik entity eski seçimi temizler. Yeni açık işlem intent'i restore'dan önce gelir.
Settings dirty/save/discard ve Workspace dirty guard'ları mevcut lifecycle'larında kalır.
Kilit/logout veya business/database switch provider'ı sıfırlar. Appearance'ın mevcut
kalıcı tercihi ve controller'ın aktif operasyon/draft sahipliği değiştirilmez.

## Settings ve Nexa

AI, WhatsApp, Android, SMS, Instagram, Website ve shipping servisleri mevcut
`ServiceSettingsCard` dilini kullanır. Renderer setup fallback'ları mevcut
`bootstrap-defaults.ts` kaynağından alınır; provider configuration'ları shared typed
factory'leri kullanır.

`mapDisplayMode` / `googleMapsEmbedUrl` yalnız website haritasına aittir. Google seçimi
sade embed alanını gösterir. `İşletme konumu` ayrı address/coordinates bilgisidir;
Google seçimi bu canonical değerleri değiştirmez. Settings category ownership korunur.

Nexa'nın navigation ve settings erişimine öncelik veren wide/compact/micro davranışı
korunur. 44px navigasyon geometrisi için testte compact habitat eşiği yeniden ölçülür;
Nexa yeni error/status yüzeyi veya yeni theme sistemi edinmez.

Desktop konuşma balonu mevcut AI durumlarının kısa bir sunumudur; hata ayrıntıları
mevcut işlem yüzeyinde kalır. Balon wide habitat içinde avatarın üstündeki ayrılmış
iki satırlık alanda kalır; compact/micro modlarında gizlenir. Sonuç/hata tepkileri
süreli, gerçek bekleyen işlemin düşünme durumu süreklidir. Dikte yalnız gerçekten
kayıt yaparken listening bildirir; izin, yükleme ve önizleme dinleme sayılmaz.
AI düşünme durumu dinlemeye, gerçek işlem durumları doğal bekleme hareketlerine
önceliklidir. Desktop avatarı dekoratiftir; hover/tıklama hedefi veya klavye odağı
oluşturmaz. Avatar ve gölgesi aynı ortalanmış sahneyi paylaşır.
Paylaşılan rig'in `natural` seçeneği Desktop'ta etkindir; `nexa-behavior` yalnız
mevcut animasyon saatiyle ilerler, durum mesajları `nexaStatusMessages` kaynağındadır.
Görünmezlik, odak kaybı ve reduced motion hareketi durdurur; unmount kaynakları bırakır.

## Migration baseline öncesi temizlenmesi gereken veri/schema kalıntıları

Bu tur schema değiştirmez, migration veya compatibility field eklemez. Aşağıdaki
mevcut kayıtlar silinecek ölü kolon olarak kabul edilmez; baseline'dan önce sahiplik ve
default kararları netleştirilmelidir:

- `settings.whatsapp_mode`: görünür UI editörü yok; birthday-service ve
  customer-credit-whatsapp hâlâ okur. Eski WhatsApp çalışma kipinin sahipliği belirlenmeli.
- `settings.birthday_mode` / `birthday_send_time`: renderer manual moda yönlendirirken
  scheduler ve setup-service mevcut automatic değerleri okur/korur. Ürün kararıyla hizalanmalı.
- `settings.web_module_url` ve `ai_provider`: SQL boş default'u ile Electron/renderer
  uygulama default'ları farklı. Current schema baseline'ından önce başlangıç değerleri
  hizalanmalı; `ai_service` ayrı aktif servis kimliğidir, duplicate kabul edilmemeli.
- `pension_payments`: finance write ve room-folio read, SQL trigger/view zinciriyle
  birlikte aktif. Folio ödeme kayıtlarıyla ilişkisi baseline'da açıkça belgelenmeli;
  finans geçmişi bu UX turunda taşınmaz veya silinmez.

Doğrulama: targeted UX/desktop/marketing/settings/commerce/workspace smoke'ları,
Desktop typecheck, strict lint, architecture/design audit, verification registry,
knip ve `git diff --check`. Full verify bu tur kapsamına girmez.
