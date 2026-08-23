# Kolay Kullanım CSS Envanteri

Bu not, `main.tsx` tarafından yüklenen aşağıdaki 13 kullanım katmanını
deklarasyon grubu düzeyinde sınıflandırır. Bir seçici hem yerleşim/davranış hem
de ölçü deklarasyonu içeriyorsa iki başlıkta da anılır.

- **A — bilgi mimarisi / davranış:** gösterme-gizleme, öncelik sırası,
  açılır-kapanır davranış, kolonların görevi, taşma/kırpma, responsive olarak
  alt alta düşme ve semantik durum/eylem ayrımı. Bunlar moddan bağımsızdır.
- **B — görsel ölçek:** `gap`, `margin`, `padding`, kontrol/kart/ikon ölçüsü,
  köşe yarıçapı ve yazı boyutu. Bunlar ortak `--space-*`, `--control-height`,
  `--radius-*` ve `--text-*` ölçeğine bağlanır.

`styles.css` içindeki `--override-*` köprü token'ları, B grubundaki düzensiz
eski ölçüler için kullanılır. Köprünün pro değerleri eski sabit değerin aynısıdır;
easy değerleri ortak ölçek token'larına bağlanır. Böylece `mode="pro"` için
hesaplanan ölçü değişmezken easy görünüm büyür. `1px` ayırıcılar, `999px` hap
şekli, medya eşikleri, modal/kolon sığdırma sınırları ve 1–3 px animasyon/fokus
ofsetleri ölçek değil yapısal veya davranışsal sınır kabul edilerek A'da
korunur. Metni bilinçli gizleyen `font-size: 0` da A'dır.

## `friendly-overrides.css`

- **A:** `is-tables-only` restoran yerleşimi; masa kartındaki manuel durum ve
  aktif adisyon düğmelerini gizleme; tekrarlanan panel kaşını, ayrı kaydet
  grubunu ve akışın ilk iki düğmesini gizleme; finans formu/listesi kolonları,
  gelir-gider tonları, odak/disabled davranışı, metin kırpma ve üç responsive
  kırılım. Açık temaya ait eski gövde rengi yalnız pro açık temada kalır; easy
  paletinin üstüne yazmaz.
- **B:** masa kartı, başlık, adisyon özeti ve ana işlem hedefleri; ürün/adet
  düğmeleri, kategori sekmeleri ve alan aralıkları; finans başlık/aksiyon/form
  kontrol ölçüleri, ödeme özetleri, kayıt satırı, yön/silme ikon kutuları,
  geri bildirim ve bölüm boşlukları. Eski minmax form genişlikleri yapısal A
  olarak sabit kalırken çevre boşlukları token kullanır.

## `dashboard-simple-ux.css`

- **A:** kısa brifing + üç dikkat kartı bilgi düzeni; gün kartındaki tekrarlı
  son açıklamayı gizleme; öncelik panelinin doğal yüksekliği; metin kırpma ve
  1120/760 px'te tek kolona düşme.
- **B:** brifing/kart aralıkları, 60 px'lik eski kart yükseklikleri, kart
  dolguları/radyüsleri, dikkat ikonu kutusu, temiz durum yüksekliği ve yan panel
  dikey dolgusu ortak ölçeğe bağlandı.

## `friendly-workflow-ux.css`

- **A:** üst bardaki yenileme eyleminde yalnız ikonu gösterme; pansiyon arşivi
  ve restoran rezervasyonunu `details` ile ikincilleştirme; günlük görev
  şeridinin kolon görevi; hızlı müşteri ekleme akışı; oda/masa durumunu tek
  seçicide toplama; ek adisyon eylemlerini menüye alma; aç/kapat metni,
  hover/focus/disabled ve responsive kolon davranışları.
- **B:** ikon düğmesi, arşiv özeti, günlük istatistik, folyo metrikleri ve boş
  durum ölçüleri; hızlı müşteri kutusu; oda/masa seçicileri; servis eylemi ve
  açılır menü; rezervasyon özeti için boşluk, kontrol yüksekliği, dolgu,
  radyüs ve yazı token'ları. Seçici ve menü minimum genişlikleri de easy'de
  metinle birlikte büyüyen token toplamlarına çevrildi.

## `system-health-ux.css`

- **A:** beş/üç/tek kolon sağlık bilgi düzeni; iki satırlık açıklama kırpma;
  ok/warn/danger/info/muted semantik tonları; dönen yenileme animasyonu ve
  responsive başlık yönü.
- **B:** panel/başlık boşlukları, özet rozeti dolgusu ve yazısı, sağlık kartı
  boşluk/dolgu/radyüsü, ikon kutusu ve üç metin kademesi token'lara bağlandı.
  `999px` rozet biçimi A olarak kaldı.

## `customer-work-ux.css`

- **A:** sekme ve master/detail düzeni; silme eylemini düşük öncelikli tutma;
  ilk dört iletişim alanı ile sonraki kimlik alanlarının hiyerarşisi; boş
  bekleyen-listesini tek durum paneline indirme ve tekrarlı açıklamayı gizleme;
  “daha fazla” eylem menüsü ve responsive kolon davranışı.
- **B:** sayfa/panel boşlukları ve radyüsleri; birincil/ikincil meta kutularının
  yüksekliği, dolgusu ve yazısı; geçmiş kartları; boş durum; özet düğmesi ve
  açılır menü ölçüleri. Menü minimum genişliği easy yazı ölçeğiyle büyür.

## `room-card-ux.css`

- **A:** durum eylemlerini normalde kapalı tutup hover/focus ile açma; kullanılabilir
  düğme yoksa alanı tamamen gizleme; dar ekranda eylemleri sürekli görünür
  yapma; ipucu pseudo metni ve pointer-events geçişi.
- **B:** ana düğme/ipucu aralıkları, ipucu ve düğme yazısı, açılan alanın
  sığdırma yüksekliği ve küçük eylem hedefi. `translateY(-3px)` geçiş ofseti A
  olarak aynı kaldı.

## `room-management-ux.css`

- **A:** eski fiyat panelini ve gömülü eski oda sayısı alanını gizleme; ayarlar
  gridindeki tam satır yerleşimi; oda kimliği/ad/fiyat kolon rolleri; durum
  renkleri; drawer kapatma ve konaklama/adisyon bitirme metinlerini pseudo
  içerikle açıklama; 980 px altındaki iki kolon ve footer yönü.
- **B:** başlık/toolbar/list/footer aralıkları; sayaç alanı, kayıt satırı ve
  input kontrol ölçüleri; küçük başlık/açıklama yazıları; yükleme kutusu;
  “Kapat” ve bitirme eylemlerinin hedef genişliği, dolgusu ve yazısı token'lara
  bağlandı. Formun minmax kolon sınırları yapısal A olarak sabittir.

## `secondary-pages-ux.css`

- **A:** menü stüdyosunun üç iş kolonu ve dar ekranda iki kolona düşmesi;
  sayfa başlığında zaten bulunan canlı önizleme panelini gizleme; liste taşması;
  silme eyleminin düşük vurgu durumu; ek alanları sürekli açık tutma; native
  dosya input'unu gizleme; mesaj modu açıklama düzeni. Viewport'a bağlı liste
  maksimumları ve responsive kolon sınırları A'dır.
- **B:** panel başlığı/manager satırı, form/textarea, sürekli açık alan ve görsel
  seçici ölçüleri; seçici iç eylem hedefi; mesaj giriş satırı ve mod düğmesi
  aralık/yükseklik/dolguları. İç eylem radyüsü doğrudan `--radius-sm` kullanır.

## `menu-image-preview-ux.css`

- **A:** önizlemeyi geniş ekranda formun sağında absolute tutma, 4:3 çerçeve,
  görseli `cover` ile kırpma; 1240 px'te küçültme ve 980 px'te belge akışına
  alıp alta taşıma.
- **B:** formun önizlemeye ayırdığı minimum yükseklik/sağ dolgu, önizleme
  genişliği ve üst konumu, boş durum/altyazı aralıkları ve üç breakpoint'teki
  geometrik ölçüler token toplamlarına bağlandı.

## `finance-ux.css`

- **A:** bekleyen ödeme satırı kolonları ve uyarı durumu; günlük kayıt formunun
  v2/v3 kolon ve “daha fazla” alan akışı; onay modalının overlay/odak/disabled
  davranışı; geçmiş açma düğmesi; 1050/760 px responsive düzenleri. Modalın
  viewport'a bağlı maksimum genişliği ve `999px` durum hapı yapısal A'dır.
- **B:** panel/list aralıkları, kayıt satırı ve durum rozeti dolgusu; modal
  çevresi/dialog dolgusu, kapatma hedefi ve eylem düğmeleri; gelişmiş alan
  özeti, input ve geçmiş düğmesi ölçüleri. Kaydet düğmesi minimum genişliği de
  ölçek toplamına dönüştürüldü.

## `cash-page-ux.css`

- **A:** detaylar kapalıyken divider sonrasını gizleme; native marker/pseudo
  süsleri kapatma; “Aç/Gizle” içerik durumu, hover/focus ve dar ekran davranışı.
- **B:** detay özeti hedef yüksekliği, dış/İç boşluk, radyüs, metin aralığı,
  sağdaki eylem ofseti ve açık durum alt boşluğu token'lara bağlandı.

## `room-folio-ux.css`

- **A:** manuel toplam ile ikincil eylemin flex görevleri; oda başlığı, ödeme
  tamamlandı semantiği; onay overlay/dialog ve birincil/uyarı eylem ayrımı;
  720 px altında dikey/ters eylem sırası. Modalın viewport maksimumu ve aktif
  düğmenin 1 px hareketi A'dır.
- **B:** ayrıntı/başlık/kısayol/ödeme kutusu aralıkları; folyo kısayol hedefi;
  scroll ofseti; overlay/dialog dolgusu ve onay düğmelerinin ölçüleri ortak
  token'lara bağlandı.

## `restaurant-room-transfer-ux.css`

- **A:** oda aktarımının bilgi + kontrol kolonları, mesajın ikinci kolona
  yerleşmesi, hata tonu ve 980/680 px'te tek kolona düşme. Minmax kontrol
  genişlikleri yapısal A'dır.
- **B:** panel/başlık/kontrol aralıkları, panel dolgusu/radyüsü, başlık ve yardım
  metni, ikon kutusu, select hedefi ve mesaj boşluğu/yazısı token'lara bağlandı.

## Tema ekseninden bağımsızlık kontrolü

Easy ana token bloğundan sonra, light/dark tema bloklarında doğrudan değer alan
`--control-border`, `--surface-disabled`, `--warning-line`, `--warning-ink`,
`--blue-solid`, `--danger-line` ve `--neutral-strong` easy için ayrıca sabitlenir.
Bu nedenle eski `data-theme="light"` veya `data-theme="dark"` değeri DOM'da
kalsa da easy hesaplanan token seti aynıdır. Alias token'larının geri kalanı
zaten `--surface-*`, `--ink-*`, `--primary-*` ve `--status-*` üzerinden ana easy
bloğuna bağlıdır. Geç yüklenen eski katmanların kullandığı `--line-soft`,
`--surface-subtle`, `--surface`, `--surface-soft`, `--text-muted`,
`--border-soft`, `--surface-elevated` ve `--danger` adları da yalnız easy modda
aynı semantik palete bağlanır; pro taraftaki eski fallback davranışı değişmez.
Sistem sağlığı ve odaya hesap aktarımı katmanlarının doğrudan renkleri ise
`--override-health-*` / `--override-room-transfer-*` köprülerine taşınmıştır:
pro köprü değerleri eski renklerle birebir aynı, easy karşılıkları ilgili
`--status-*`, `--ink-muted`, `--border-*` ve `--surface-*` token'larıdır.
