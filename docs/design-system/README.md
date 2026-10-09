# Desktop Design System v3

Bu belge masaüstü uygulamanın yaşayan stil, primitive ve etkileşim sözleşmesidir.
`docs/UI_RULES.md` ürün gramerini tanımlar; bu belge onun görsel uygulama katmanıdır.

## Ana ilke

Kullanıcı her etkileşimde şu zinciri anlayabilmelidir:

> Buraya basabilirim → bastım → sistem işlemi aldı → sonuç bu.

Yeni feature CSS kendi renk, radius, control yüksekliği, badge/chip veya button dili
icat etmez. Önce token ve shared primitive kullanılır.

## Stil ağacı

Tek giriş noktası:

```text
apps/desktop-app/src/styles/index.css
```

Katman yönü:

```text
primitive token
  ↓
semantic token
  ↓
shared component / primitive CSS
  ↓
feature layout / presentation
```

Appearance sistemi tektir:

- color scheme: system / light / dark
- density: comfortable / compact
- accent: controlled preset
- font: controlled preset
- scale
- motion preference

Eski easy/pro, theme dosyaları veya `data-theme/data-mode` dalları kullanılmaz.

## V3 visual inventory

İlk turda Menü/QR Menü, Pansiyon, Restoran, Müşteri İşleri, Kasa/Finans, Ayarlar,
Dashboard, Takvim, Mesajlar ve Market karşılaştırıldı.

Mevcut token/palette altyapısı büyük ölçüde sağlamdır. Ana borç renklerden çok
etkileşim durumlarının yüzeylere göre farklı uygulanmasıdır. V3 bu yüzden önce
shared interaction dilini tamamlar, sonra sayfaları migrate eder.

## Üç ayrı semantik eksen

### Surface role

Panelin ne tür içerik taşıdığını sınıflandırır; durum veya eylem anlamı taşımaz.

- `neutral`
- `configuration`
- `operation`
- `finance`
- `communication`
- `integration`

Role tintleri düşük doygunlukta kalır. Dark theme'de yüzeyi boyamak yerine yalnız
sınıflandırmayı destekler. Warning/error bir surface role değildir.

### Status tone

Bir durumun anlamını taşır.

- `neutral`
- `info`
- `success`
- `warning`
- `danger`
- `muted`

`StatusBadge` yalnız betimleyicidir. `StatusChip` aynı görsel ailedeki seçilebilir
kontroldür ve `aria-pressed` kullanır. Durum yalnız renkle anlatılmaz; okunabilir metin
veya eşdeğer erişilebilir isim gerekir.

### Action variant

Bir eylemin öncelik ve riskini taşır.

- `primary`
- `secondary`
- `ghost`
- `quiet`
- `danger`

Aynı karar alanında mümkün olduğunca tek dominant primary bulunur. Feature-specific
eylem görünümü yeni genel action varyantı üretmek için tek başına yeterli gerekçe değildir.

## Etkileşim zinciri

Ortak kontrol ve tıklanabilir yüzeyler:

```text
default → hover → pressed → selected/active → busy → result
```

- hover alanın etkileşimli olduğunu gösterir
- pressed kısa fiziksel geri bildirim verir
- selected/active mouse uzaklaşınca da görünür kalır
- busy işlemin alındığını gösterir ve çift tetiklemeyi engeller
- result başarı veya hatayı mümkün olan en yakın seviyede gösterir
- `focus-visible` hover kadar okunabilir olmalıdır
- kart içindeki hızlı işlem kartın open davranışını tetiklemez
- drag yalnız handle tarafından sahiplenilir
- cursor dili ortak olmalıdır: pointer, grab/grabbing, disabled/progress

## Motion ve geometri

Feature CSS kendi motion süresini veya geometri ölçeğini üretmez.

V3 motion tokenları:

- `--motion-press`: 80ms
- `--motion-hover`: 140ms
- `--motion-surface`: 180ms
- `--motion-feedback`: 560ms

Radius, spacing, control yüksekliği, chip yüksekliği ve panel padding shared tokenlardan
gelir. Reduced-motion tercihi dekoratif hareketleri azaltmaya devam eder.

## Shared primitives

Güncel ortak sözlük:

- `PageWorkSurface`
- `FeatureWorkspacePage` / `FeatureViewSelector`
- `SearchSelect`
- `RecordPicker` — yüksek hacimli sayfa seçimleri
- `ActionButton`
- `IconButton`
- `StatusBadge`
- `StatusChip`
- `DataList`
- `Panel`
- `FormDialog`
- `ModalSurface`
- `WorkspaceFrame`
- `WorkspaceTabs`
- `PageHeader`
- `AppShell`
- `ResourceCard`

Yeni component yalnız tekrar eden gerçek bir semantic contract varsa çıkarılır.

### Yüksek hacimli kayıt seçimi

`RecordPicker`, Page üzerindeki ürün, tedarikçi, bayi ve müşteri seçimleri için
ortalanmış tek `ModalSurface` kullanır. Küçük enum'lar `SearchSelect` kullanmaya
devam eder. `MarketInventoryWorkspace` ve `MarketPurchasingWorkspace` ürünleri
`MarketCatalogPicker` üzerinden seçer; Etiketler aynı seçiciyi stok takibi
olmayan aktif ürünleri de dahil ederek kullanır. Siparişler yalnız mevcut uygun aktif
bayileri verir. `CustomerPicker` kayıtlı müşteri seçiminde aynı yüzeyi kullanır; var olan bir modal içindeyse
ikinci modal açmamak için güvenli `SearchSelect` davranışına döner. Seçim mevcut kimlik/onChange hattını kullanır; fiyat, capability,
veresiye, stok ve mutasyon sahipliği değişmez.

Liste ve Grid aynı arama/seçim state'ini korur. Grid 1–4 kolon kullanır; gerçek
sonuç alanının genişliği en az 155px kart genişliğini koruyacak şekilde sınırlar.
Kontroller en az 44px'tir. Görünüm ve istenen kolon sayısı mevcut
`src/ui-preferences.ts` sahibi tarafından picker türü ve ekran sınıfı başına
localStorage'da saklanır; depolama kapalıysa oturumda korunur. Yeni Settings
kaynağı veya SQLite şeması yoktur. Renkler ve reduced motion ortak appearance
sisteminden gelir; bu yüzey dekoratif hareket eklemez.

Sonuçlar 60 kayıtlık sayfalarda render edilir; sonraki sayfa DOM'a eklenmez,
öncekinin yerini alır. Combobox aktif seçeneği bildirir; oklar Grid'de kolon
adımıyla ve sayfa sınırları boyunca gezer. Home/End ilk/son sonuca gider, Enter
seçer, Escape kapatır ve `ModalSurface` odağı tetikleyiciye geri verir. Tab ortak
modal focus sınırını kullanır. Türkçe gruplar tam olarak
`ABC ÇDE FGH IİJ KLM NOÖ PRS ŞTU ÜVY Z` şeklindedir; Ğ chip'i yoktur.
Metin/telefon araması seçili chip'ten bağımsız tüm sunulan kayıtlara bakar;
Tümü aramayı ve chip'i sıfırlar.

Ürün görselleri mevcut `MarketProductThumbnail` ve
`commerce.getProductImageDataUrl(product.id)` sahibinden gelir. Asset path veya
uzak kaynak URL'si img src'ye bağlanmaz. Bu panel `object-fit: contain` kullanır;
eksik veya kırık görsel alanı boş kalır. Yalnız görünür sayfanın thumbnail'ları
mount edilir.

Mevcut katalog/tedarikçi read API'leri çağrı başına en fazla 500 kayıt verir.
Sayfa projeksiyonu bu sınırı korur; seçicinin debounce ve eski yanıt korumalı
araması aynı canonical API'yi kullanarak ilk 500 dışındaki ürün/tedarikçileri de
bulur. Geniş sonuçlar ilk 500'de sınırlıdır ve aramayı daraltma bilgisi gösterilir;
bu API'de offset/total olmadığı için tüm kataloğun sıralı sayfalanması iddia
edilmez. Projeksiyon dışından seçilen ürün, seçicinin/sayımın mevcut yaşamı boyunca
korunur; yeni domain cache veya ikinci writer oluşturulmaz.
Etiketlerde aramadan seçilen ürün, mevcut katalog controller'ının `upsertProduct`
projection hattına verilir; page view store yalnız mevcut ürün kimliğini korur,
entity snapshot saklamaz.

Müşteri/bayi verisi mevcut dashboard müşteri projeksiyonundan gelir. Bu sahibin
500 müşteri sınırı ve katalog API'sinin mevcut SQLite metin eşleştirme davranışı
değiştirilmemiştir. Component 10.000+ sunulan kaydı sınırlı DOM ile destekler;
bu, canlı dashboard'ın tüm müşteri verisini sağladığı anlamına gelmez. Tüm
müşterileri backend'de aramak veya katalogda sınırsız sıralı gezinmek ayrı bir
read-projection sözleşmesi gerektirir.

`FormDialog` veya modal `WorkspaceFrame` içinde `RecordPicker` mevcut
`useInsideModalSurface()` sınırını okuyup non-modal `SearchSelect` kullanır.
Pansiyon `StayGuestPicker` ve Table workspace müşteri ilişkisi, `withinWorkspace` ile
aynı RecordPicker arama/liste/grid gövdesini `WorkspaceSubflowOverlay` içinde açar.
Yeni native dialog oluşturmaz; Escape yalnız seçimi kapatır ve odağı tetikleyiciye döndürür.
Diğer modal-içi girişler fallback kullanmaya devam eder. Onaylı tasarım
laboratuvarındaki import transformları runtime'a taşınmaz.

Rezervasyon editörlerindeki müşteri alanları ve Stock Image Import ürün
eşleştirmesi bu kapsamda `SearchSelect` olarak bırakılmıştır. Bu canonical alt akışlar için
modal-içi seçim modu ayrıca ele alınmalıdır; ürün kategori/enum seçicileri de
mevcut küçük-enum primitive'ini kullanır.

`npm run verify:check -- record-picker-ui`, gerçek MarketPage/React ve geçici
SQLite kataloğunda 10.021 ürün/821 tedarikçiyle arama ve seçim, Türkçe müşteri
filtresi, 10.020 sunulan müşteriyle DOM sınırı, klavye, tercihler, görünüm ve
modal-içi fallback davranışını doğrular. Şema ve seçim öncesi/sonrası domain
kayıt sayıları ayrıca karşılaştırılır.

## Formlar ve feedback

- gerçek `label`/control ilişkisi korunur
- native control davranışı gereksiz custom widget ile değiştirilmez
- validation field/section yakınında gösterilir
- mutation sonucu mümkün olan en yakın doğru yüzeyde görünür
- global toast yerel feedback'in yerine geçmez
- finans, stok ve satış mutasyonlarında backend onayı gelmeden başarı gösterilmez
- dar viewportta tek kolon/taşmasız düzen korunur

## Layout ownership

`AppShell` global viewport/sidebar/content sınırını sahiplenir.

Feature Page yalnız kendi toolbar/body düzenini; Workspace yalnız entity içeriğini
sahiplenir. Feature CSS global sidebar/header/page padding tanımlamaz.

### Page height policy

Sayfa canvas'ı kullanılabilir viewport'u doldurur. Global başlığın altındaki kullanılabilir
alan `PageWorkSurface` ile hafif bir çerçeveye alınır; iç paneller bu yüzeyin geometrisini
paylaşır. Ana çalışma sayfalarında varsayılan model `fill`'dir: yüzey kalan viewport'u
doldurur, veri arttığında scroll doğru iç panel/list tarafından sahiplenilir.

`fill` kullanan ana yüzeyler arasında Müşteri İşleri, Menü, Market, Raporlar, Pansiyon,
Restoran, Talepler, WhatsApp Web, Pazarlama ve Takvim bulunur. Takvim de `fill` kullanır; ancak
gün/hafta/ay grid geometrisi nedeniyle normal panel akışından bilinçli bir istisnadır.

`flow` yalnız gerçek içerik akışının sayfa yüksekliğini belirlemesi gereken yardımcı
form, ayar veya uzun belge/çıktı yüzeylerinde kullanılır. Ana operasyon/list sayfalarında
veri büyüdüğü için dış sayfayı uzatmak yerine mümkün olduğunca iç scroll tercih edilir.

`FeatureWorkspacePage` kullanan sayfalarda bu seçim `layout="flow" | "fill"` ile
yapılır. Feature CSS rastgele ekran yüksekliği üretmez.

Sabit panel yüksekliği varsayılan çözüm değildir. `px`, `vh` veya `dvh` ile
feature-specific yükseklik yalnız gerçek geometrik ihtiyaçlarda kullanılabilir:
kontrol boyutu, medya/kamera viewport'u, modal sınırı veya açıkça tanımlanmış preview.
Normal panel/list/workspace yüksekliği flex/grid, `min-height: 0` ve scroll ownership
ile çözülür.

Canonical entity editor için Workspace platformu kullanılır. Centered/full-canvas aynı
state'in iki presentation'ıdır. Nested modal ve paralel editör familyası oluşturulmaz.

## Migration sırası

1. Menü
2. Pansiyon
3. Restoran
4. Müşteri İşleri
5. Kasa / Finans
6. Ayarlar
7. kalan projection ve yardımcı yüzeyler

Bir sayfa migrated sayılmadan önce light/dark, comfortable/compact, hover, pressed,
focus, selected, busy/error, dar viewport ve mevcut smoke akışları birlikte doğrulanır.

## CSS audit

Strict audit yeni borcu engeller:

```fish
npm run design:audit:strict
```

V3 ilerledikçe audit şu alanları da shared sözleşmeye bağlamalıdır:

- feature-owned button/badge/chip primitive görünümleri
- izinsiz surface role
- token dışı motion süresi
- shared primitive dışında interaction state kopyaları
- raw color/radius/shadow/font-size ve `!important`
- duplicate selector ve legacy override kalıpları

## Yeni feature kontrol listesi

1. AppShell/Page anatomy'yi tekrar yazma.
2. Mevcut primitive'i kullan.
3. Surface role, status tone ve action variant eksenlerini karıştırma.
4. Canonical Workspace varsa yeni editor yaratma.
5. Feature CSS'i yalnız feature layout/presentation için kullan.
6. Semantic token kullan.
7. Hover/pressed/focus/selected/busy/result zincirini düşün.
8. Responsive document overflow yaratma.
9. Reduced-motion ve keyboard davranışını koru.
10. `design:audit:strict` ve ilgili behavior smoke'u çalıştır.

## Uygulama genelinde çalışma bağlamı

Mevcut canonical örnekler ve seçim/görünüm hafızası sözleşmesi
[UX consolidation](UX_CONSOLIDATION.md) belgesinde kayıtlıdır. Yeni bir görsel sistem
oluşturulmaz; burada tanımlı primitive'ler genişletilir.

Eylem ve navigation kontrollerinin minimum hedefi `--interaction-target-min` (44px)'dir.
Mouse ile kullanılan filtre/choice kontrolleri (`ChoiceChips`, `StatusChip`,
`SegmentedControl`) ayrı `--choice-height` kullanır: compact 34px, comfortable 38px.
`pointer: coarse` her iki yoğunlukta en az 44px (comfortable 48px) hedefi korur.
Bu istisna action, field veya workspace/page tab hedeflerini küçültmez.
Bilgilendirme `StatusBadge` için `--status-height` 24px'dir; tıklanabilir hedef değildir.
Başlık ve panel aralıkları shared geometri tokenlarından gelir; scroll sahipliği değişmez.
Panel başlıkları `--panel-title-size` / `--panel-title-weight` ve `--color-shell-ink`
kullanır. `DataList` açıklaması tek satırlık önizlemedir; metin DOM’da korunur, string
açıklamanın tamamı tooltip ile de okunabilir. Dashboard’un sağ sütunu kendi scroll
alanını sahiplenir; kapasite, müşteri notları ve takvim kayıtları birlikte erişilebilir kalır.
Kalıcı yardım yalnız iş kararını veya kritik kapsamı açıklıyorsa gösterilir. Başlığı tekrar
eden kılavuz metni component'te kaldırılır; boş/hata durumları, capability açıklamaları,
mahremiyet, KBS, WhatsApp, finans ve veri kaybı uyarıları korunur.
Uzun koleksiyon satırlarında `DataListButton` / `DataListItem` `twoLine` kullanılır:
başlık + metadata. Tam metin tooltip/erişilebilir isimde ve seçilen kaydın workspace'inde
korunur. Açıklama gerekiyorsa işlem veya alanın yakınında kısa contextual yardım bırakılır.
