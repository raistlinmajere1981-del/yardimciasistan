# Design System v3

Bu belge Yardımcı Asistan masaüstü arayüzünün görsel ve etkileşim sözleşmesidir.
`docs/UI_RULES.md` ürün gramerini tanımlar; bu belge onun görsel uygulama katmanıdır.

## Ana ilke

Kullanıcı her etkileşimde şu zinciri anlayabilmelidir:

> Buraya basabilirim → bastım → sistem işlemi aldı → sonuç bu.

Yeni feature CSS kendi renk, radius, control yüksekliği, badge/chip veya button dili
icat etmez. Önce token ve shared primitive kullanılır.

## Visual inventory — ilk tur

İlk v3 turunda şu yüzeyler karşılaştırıldı:

- Menü / QR Menü
- Pansiyon
- Restoran
- Müşteri İşleri
- Kasa / Finans
- Ayarlar
- Dashboard
- Takvim
- Mesajlar
- Market

Mevcut token ve palette altyapısı büyük ölçüde sağlamdır. Ana borç renklerden çok
etkileşim durumlarının sayfalara göre farklı uygulanmasıdır. Özellikle pressed, busy,
result ve kalıcı selected durumları shared primitive seviyesinde standartlaştırılmalıdır.

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
sınıflandırmayı destekler.

### Status tone

Bir durumun anlamını taşır.

- `neutral`
- `info`
- `success`
- `warning`
- `danger`
- `muted`

`StatusBadge` betimleyicidir ve tıklanmaz. `StatusChip` aynı görsel ailedeki
seçilebilir kontroldür ve `aria-pressed` kullanır.

### Action variant

Bir eylemin öncelik ve riskini taşır.

- `primary`
- `secondary`
- `ghost`
- `quiet`
- `danger`

Aynı karar alanında mümkün olduğunca tek dominant primary bulunur. WhatsApp gibi
feature-specific görünümler geçiş sürecinde korunabilir fakat yeni genel action varyantı
üretmenin gerekçesi değildir.

## Etkileşim zinciri

Ortak kontrol ve tıklanabilir yüzeyler:

`default → hover → pressed → selected/active → busy → result`

- hover, alanın etkileşimli olduğunu belli eder
- pressed kısa fiziksel geri bildirim verir
- selected/active mouse uzaklaşınca da görünür kalır
- busy kontrolün işlemi aldığını gösterir ve çift tetiklemeyi engeller
- result başarı veya hatayı mümkün olan en yakın seviyede gösterir
- `focus-visible` hover kadar okunabilir olmalıdır
- kart içi hızlı işlem kartın open davranışını tetiklemez
- drag yalnız handle tarafından sahiplenilir

## Geometri ve motion

Geometri feature CSS yerine shared tokenlardan gelir. V3 motion sözlüğü:

- `--motion-press`: 80ms
- `--motion-hover`: 140ms
- `--motion-surface`: 180ms
- `--motion-feedback`: 560ms

Reduced-motion tercihi tüm dekoratif hareketleri azaltmaya devam eder.

## Migration sırası

1. Menü
2. Pansiyon
3. Restoran
4. Müşteri İşleri
5. Kasa / Finans
6. Ayarlar
7. kalan projection ve yardımcı yüzeyler

Bir sayfa migrated sayılmadan önce light/dark, comfortable/compact, hover, pressed,
focus, selected, busy/error, dar viewport ve mevcut smoke akışları birlikte
doğrulanır.

## Guard yönü

V3 tamamlandıkça `design:audit:strict` aşağıdaki yeni borçları da reddedecek şekilde
güçlendirilmelidir:

- feature-owned button/badge/chip primitive görünümleri
- izinsiz surface role
- token dışı motion süresi
- shared primitive dışında interaction state kopyaları
- raw renk/radius/shadow/font-size ve `!important`
- duplicate selector ve legacy override kalıpları
