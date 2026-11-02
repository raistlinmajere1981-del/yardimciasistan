# Admin · Efekt Atölyesi

Kaynak efekt motoru ve düzenleyici: kardeş `EfektAtolyesi/` deposu.
Admin bunu `scripts/sync-effect-studio.mjs` ile paketine kopyalar;
vendor/runtime/model/registry için ikinci bakım kopyası oluşturmaz.

## Site ve görsel kaynağı (2026-11-02)

- **Kanonik site listesi:** `config/installations.json`. `customer-site`
  ve `landing` türleri seçilebilir; web modülü, destek ve güncelleme servisleri
  bağımsız görsel sitesi gibi sunulmaz.
- Görsel kapsamı **yalnız tasarıma sabit olarak eklenmiş, siteye ait
  dekoratif fotoğraflar** (hero veya sabit içerik görselleri) ve açıkça
  tanımlanmış site hedefleridir. Sayfa kaynağında `<img src>` içinde
  harfiyen belirtilmiş fotoğraf yolları keşfedilir. Responsive `srcset`
  varyantları ayrı efekt hedefi olmaz.
- Ürün, galeri, oda/masa, kullanıcı yüklemesi, API'den gelen görseller ve
  demo vitrininin uygulama ekran görüntüleri **bilinçli olarak kapsam dışıdır**.
  Sayıları artabileceği için Canvas yükü ve yanlışlıkla kitlesel efekt
  atama riski yaratılmayacak. Teknikel'in sıfır görsel göstermesi bugün
  doğru durumdur: sabit bir dekoratif fotoğraf eklenirse keşfedilir.
- `EfektAtolyesi/config/projects.json` artık site listesi **değildir**;
  mevcut özel görsel/sahne/yayın eşleştirmeleri için geçici overlay olarak
  okunur. Test fixture'larında `EFEKT_STUDIO_PROJECTS_FILE` ile izole
  proje listesi kullanılabilir.
- Seçilebilir görsel boyutları/varlığı ve kaynak SHA-256 doğrulanır. Taslağın
  kaydedildiği fotoğraf sonradan değişirse, aynı boyutta olsa bile eski çokgen
  koordinatları sessizce yayınlanmaz.
- Mevcut çalışma alanı tek viewport kullanır. Site görsel gezgini, sahne
  katmanları ve özellik paneli bağımsız scroll sahibidir; ortadaki canlı
  önizleme en büyük alanı alır. Efektler orijinal resmin piksellerini
  değiştirmez; sahne JSON'u üzerinden çalışır.

## Kaydetme ve yayın sınırı

- Düzenleme `EfektAtolyesi/.studio-drafts/` altında otomatik taslak kaydeder.
- **BlackSea ve Gündoğdu hero hedefleri** kullanıcı onayından sonra yalnız
  seçili sahne JSON aktarımı ve canlı HTTPS karşılaştırması yapar. Gündoğdu
  eşlemesi kanonik kopyadaki değil, aktif site kökündeki
  `assets/img/gideros-1-1818.webp` → `assets/effects/hero.scene.json`
  yoludur. SSH aktarım hedefi site `scripts/deploy-site.sh` ile aynıdır.
  Admin release/deploy/test işlemleriyle aynı anda çalışamaz.
- Diğer sabit görseller için hedefli deploy bağlantısı henüz
  tamamlanmadıysa **Siteye yayınla kapalıdır**. Dinamik ürün/galeri görsellerine
  genel efekt bağlama veya otomatik toplu yayın özelliği eklenmeyecektir.
  Bu hedefler bugün yalnız yerel taslak olarak düzenlenebilir. Kayıtsız görseli
  canlıya yayımlanmış gibi sunmayın.
- **İlk etkinleştirme yerel hazırlığı mevcut:** sabit fotoğrafın etkin
  efekt taslağı kaydedildiğinde Atölye'de `Siteye bağlamayı hazırla` işlemi
  sayfa HTML'ini değiştirmeden, yalnız yerel
  `public/assets/site/scenes/{id}.scene.json` ve
  `public/assets/site/scenes/effects-manifest.json` üretir. Kanonik şablon
  0.5.2 bunu görselin tam `src` yoluna bağlar; varsayılan manifest yoksa
  ek Canvas/motor çalışmaz. Dinamik galeri/ürün/oda/masa hariçtir.
- Bu adım **deploy değildir**: yerel kaynak hazırlandı, internet/SSH/FTP
  işlemi yapılmadı. Siteye yüklemek için Admin'in mevcut site deployment
  süreci ayrıca kullanılmalı ve canlı HTTPS sahne doğrulanmalıdır.

### İlk etkinleştirme → Deploy bağlantısı (2026-11-02)

- Atölye, `bindingStatus: "staged"` olan görsel için bir bilgilendirme paneli
  gösterir. Panel, hazırlanan görsele geri dönüşü (`Görsele dön`) ve seçili
  görselin hangi siteye ait olduğunu açık tutar. Seçim `sessionStorage` ile
  renderer yenilenince ve Deploy ekranından dönüldüğünde korunur.
- Site → Admin Deploy hedefi eşlemesi **açık ve dar**tır:
  yalnız `landing → landing`. Site kimliğinden, adından veya URL'sinden hedef
  tahmin edilmez; yeni bir site ilk etkinleştirme bağlantısı kazanmadan önce
  bu listeye bilinçli olarak eklenmelidir (`shared/contracts.ts`).
- `Deploy ekranını aç` düğmesi yalnız `deploy` bölümüne geçer ve eşlenen
  hedefi seçer. **Ön kontrol, onay paneli veya canlı deploy başlatmaz**;
  kullanıcı hedefi, etki özetini ve ayrı canlı onayı kendisi inceler.
- Önceden hazırlanan bir sahne düzenlenirse Yerel sahneyi güncelle işlemi
  manifest kaydını çoğaltmadan yerel JSON dosyasını tekrar hazırlar;
  canlı yayın başlatmaz. Kaynak fotoğraf değiştiyse önce yeniden uyarlama gerekir.
- Teknikel'in sabit dekoratif fotoğrafı yoktur; hero API ürün/galeri medyasıdır.
  Atölye bu sitede görsel listesi boşken ürün/galeriye toplu işlem önermez,
  yerel açıklamayı gösterir ve hazırlama/yayın düğmesi üretmez.
- `teknikel-web` bir site aktarımı değildir. Deploy ekranında bu hedef için
  "yalnız web modülü; site kökü/tasarımı/görselleri yayınlanmaz" kapsam notu
  gösterilir. Bu not yürütücüyü değiştirmez; mevcut deploy runner aynen kalır.
- Kaynak fotoğraf hash'i değişirse `canPrepare` kapanır; bilinmeyen veya
  bozuk sahne yolu da hazırlama hedefi sayılmaz. Eski taslak sessizce
  yayınlanmaz.
- Demo test alanı `landing` altında keşfedilen üç sabit fotoğrafı
  kendi düz `deneme/assets/site/scenes/` yoluna yerelde hazırlayabilir;
  normal sitelerde yol `public/assets/site/scenes/` biçimindedir.
- `canonical/` altındaki resimler, aktif site deploy akışında otomatik
  yayınlandığı kanıtlanana kadar ilk bağlantı düğmesinden hariçtir.
  Gündoğdu'nun mevcut aktif hero hedefi ayrı bir yayın yolundan bağlıdır.
- Canlı yayında fotoğrafı tekrar yüklemek gerekmez; sonraki değişiklikler
  yalnız `.scene.json` içeriği olabilir. İlk etkinleştirme site kaynaklarının
  uygun site deploy'u ile yayınlanmasını gerektirebilir.

## Kontroller

`npm run typecheck -w @yardimci-asistan/admin-control-center`,
`npm run build -w @yardimci-asistan/admin-control-center`,
`node --test ../EfektAtolyesi/tests/admin-studio.test.mjs
../EfektAtolyesi/tests/site-projects.test.mjs`,
`node --test tests/effect-studio-deploy-link.test.mjs
tests/effect-studio-ui.test.mjs` (ikincisi build sonrası yerel Brave ile
renderer mock'u kullanır; Electron veya canlı deploy çalıştırmaz).

Önceki Xvfb/Electron UI testi 1366x768 ve 1600x900 düzenini doğruladı.
En son hazırlama düğmesi sürümünün bağımsız Electron kabulü henüz
tamamlanmadı; site keşfi ve manifest hazırlama kodunun izole testleri geçti. Kişisel credential dosyalarının içeriği raporlanmaz.

**Defer edilen büyük kabul:** Windows toplu kurulum/güncelleme, demo import,
tüm siteler için ilk yayın adaptörleri ve kullanıcı onaylı canlı deploy.
