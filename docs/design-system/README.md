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
Kalıcı yardım yalnız iş kararını veya kritik kapsamı açıklıyorsa gösterilir. Başlığı tekrar
eden kılavuz metni component'te kaldırılır; boş/hata durumları, capability açıklamaları,
mahremiyet, KBS, WhatsApp, finans ve veri kaybı uyarıları korunur.
Uzun koleksiyon satırlarında `DataListButton` / `DataListItem` `twoLine` kullanılır:
başlık + metadata. Tam metin tooltip/erişilebilir isimde ve seçilen kaydın workspace'inde
korunur. Açıklama gerekiyorsa işlem veya alanın yakınında kısa contextual yardım bırakılır.
