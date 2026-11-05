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
- Görsel çalışma alanı tek viewport kullanır. Proje/görsel seçimi, yayın
  durumu, Kaydet ve Siteye yayınla tek kompakt Admin başlığındadır. Gömülü
  editör Alanlar → seçili alanın Efektleri → Canlı görsel → İnce ayarlar
  sütunlarını yan yana tutar; yalnız listeler ve ayarlar dikey kayar.
  Sahne adı/tohumu, açılır Sahne bölümündedir. Efektler orijinal resmin piksellerini
  değiştirmez; sahne JSON'u üzerinden çalışır.
- **Yerel V2 nesne sahnesi ayrı ve açıktır.** `EfektAtolyesi/config/scene-targets.json`
  yalnız `birdesengor:scene_v2` hedefini tanımlar; site keşfi, canlı URL veya
  üretim yolu içermez. Admin listesine `BirDeSenGör V2 · çalışma sahnesi`
  olarak eklenir, `siteUrl: ""` ile **kurulu site gibi sunulmaz**. Düzenleyici
  `scene.html` / `src/editor/scene-main.mjs`; görsel düzenleyici `index.html`
  aynen korunur. Seçim `kind: "sceneObject"` olduğunda iframe URL'si
  `scene.html`e döner, yayın/hazırlama düğmeleri gizlenir ve
  `Yerel çalışma · yayın yok` etiketi gösterilir.
- Sahne taslağı yalnız
  `EfektAtolyesi/.studio-drafts/birdesengor__scene_v2.scene.json` altına
  yazılır. Yükleme sırası: mevcut taslak → `examples/birdesengor-v2.scene.json`
  fikstürü. Kaydetmede `version: 2, kind: "objectScene"`, tam
  `sceneId: "birdesengor-study-v2"` ve `1600 × 900` viewport doğrulanır;
  fotoğraf sahnesi, yanlış kimlik veya yanlış viewport reddedilir.
  Bu hedef için `prepare` ve `publish` **kapalıdır**.
- V2 sahnesi gerçek V2 sitesine bağlı değildir; yalnız yerel sözleşme
  fikstürüdür. V2 sitesi hazır olduğunda `docs/SCENE_OBJECT_V2_CONTRACT.md`
  içindeki DOM kimliği ve `expectedSceneId` kurallarıyla bağlanmalıdır.

## Kaydetme ve yayın sınırı

- Düzenleme `EfektAtolyesi/.studio-drafts/` altında otomatik taslak kaydeder.
- **BlackSea hero** seçili JSON'u FTP ile yayımlar. **Gündoğdu hero**
  `assets/site/img/gideros-1-1818.webp` fotoğrafına bağlıdır.
  `gundogdu:hero` yayını sahne ve kanonik `effects-manifest.json`
  dosyalarını `canonical/public/assets/site/scenes` ve
  `assets/site/scenes` aynalarına yazar. Yalnız bu dört dosyayı
  SSH ile gönderir ve canlı HTTPS üzerinden ikisini doğrular.
  Eski eksik `www/assets/effects` dizinine istek gönderilmez.
  Admin release/deploy/test işlemleriyle aynı anda çalışamaz.
- Diğer sabit görseller için hedefli deploy bağlantısı henüz
  tamamlanmadıysa **Siteye yayınla kapalıdır**. Dinamik ürün/galeri görsellerine
  genel efekt bağlama veya otomatik toplu yayın özelliği eklenmeyecektir.
  Bu hedefler bugün yalnız yerel taslak olarak düzenlenebilir. Kayıtsız görseli
  canlıya yayımlanmış gibi sunmayın.
- **İlk etkinleştirme, tek yayın komutunun ilk aşamasıdır:** Atölye
  sabit görselin etkin taslağını yerel `*.scene.json` ve
  `effects-manifest.json` dosyalarına hazırlar, ardından uygun **tam site**
  hedefinin ön kontrol ve deploy işlemini yürütür. Kanonik şablon 0.5.2
  manifestteki tam `src` yoluyla sahneyi bağlar. Dinamik medya hariçtir.
- Canlı HTTPS üzerinden hem sahne JSON'u hem manifest eşleşmedikçe ilk yayın
  başarılı sayılmaz ve kalıcı doğrudan yayın bağı oluşturulmaz.

### Tek aşamalı yayın ve doğrulanmış doğrudan bağlantı (2026-11-04)

- Atölye'de her uygun görsel için aynı `Siteye yayınla` eylemi vardır.
  `canPublish` olan BlackSea hero JSON'u FTP ile, Gündoğdu ise
  JSON + kanonik manifesti SSH ile yayımlar. HTTPS doğrulaması zorunludur.
- İlk defa bağlanacak sabit görselde kullanıcıya **tam site deploy** etki
  açıklamasıyla tek bir onay gösterilir. Arka planda sırasıyla yerel
  `prepare`, mevcut Admin Deploy yürütücüsü üzerinden `preflight`,
  `deploy` ve `activate` çalışır. Herhangi bir aşamanın başarısızlığında
  bir sonraki aşama başlamaz. Diğer Admin doğrulama/release/deploy işleri
  ile aynı anda çalışamaz.
- Site ↔ tam site hedefi eşlemesi açık ve sınırlıdır:
  `landing → landing`, `blacksea → blacksea`,
  `gundogdu → gundogdu-site`. İsimden/URL'den hedef tahmin edilmez.
  `teknikel-web` yalnız web modülüdür ve efekt yayını için kullanılmaz;
  Teknikel'de şu anda uygun sabit dekoratif görsel de bulunmamaktadır.
- Canlı sahne ve manifest beklenen kaynak/slot/dosya ile eşleşirse yalnız
  ilk başarılı dağıtımın kanıtı `EfektAtolyesi/.studio-published/`
  altında kaydedilir (yerel, Git dışı, parola içermez). Görsel kaynak
  SHA-256, site adresi veya sahne yolu değişirse eski bağlantı kullanılmaz.
  Sonraki değişikliklerde sadece sahne dosyası yüklenir ve HTTPS doğrulanır.
- Daha önce hazırlanıp henüz doğrulanmamış sahne `staged` görünür;
  `Siteye yayınla` ilk site deploy'unu gerçekleştirmeden onu
  `linked` saymaz. Görsel seçimi `sessionStorage` ile korunur.
- `canonical/` kaynak ağacındaki görseller, kullanılan site deploy betiğinin
  onları yayınladığı kanıtlanana kadar ilk kurulum kapsamının dışındadır.
  Gündoğdu'nun mevcut aktif hero bağlantısı ayrı ve çalışır durumdadır.
  BirDeSenGör V2 nesne sahnesi bilinçli olarak yereldir, yayın yapılamaz.
- Bu akışla fotoğrafın tekrar yüklenmesine gerek yoktur; kaynak görsel
  değişmedikçe sonraki efekt yayınları hedefli JSON aktarımı yapar.

## Kontroller

`npm run typecheck -w @yardimci-asistan/admin-control-center`,
`npm run build -w @yardimci-asistan/admin-control-center`,
`node --test ../EfektAtolyesi/tests/admin-studio.test.mjs
../EfektAtolyesi/tests/admin-scene-target.test.mjs
../EfektAtolyesi/tests/site-projects.test.mjs
../EfektAtolyesi/tests/publish-route.test.mjs
../EfektAtolyesi/tests/publish-activation.test.mjs`,
`node --test tests/effect-publication-service.test.mjs
tests/effect-studio-deploy-link.test.mjs tests/effect-studio-ui.test.mjs
tests/effect-studio-admin-scene-ui.test.mjs`
(son ikisi build sonrası yerel Brave ile renderer mock'u kullanır; Electron
veya canlı deploy çalıştırmaz), `node --test tests/effect-studio-scene-editor-smoke.test.mjs`
(kanonik `scene.html` üzerinde mum efekt kaydırma, opaklık, v2 JSON
dışa/içe aktarma, CSS görünürlük durdurması ve 390px taşma kontrolü).

Önceki Xvfb/Electron UI testi 1366x768 ve 1600x900 düzenini doğruladı.
Tek yayın akışı için Admin servis ve renderer mock testleri geçmelidir.
Bağımsız Electron/SSH/FTP canlı ilk yayın kabulü henüz yapılmadı. Kişisel credential dosyalarının içeriği raporlanmaz.

**Defer edilen büyük kabul:** Windows toplu kurulum/güncelleme, demo import,
kanonik kaynak ağaçları ve Teknikel için özel site adaptörleri, gerçek
kullanıcı onaylı ilk canlı deploy denemeleri.

## Canonical motor kaynağını yenileme (Chunk 3)

Senkronizasyon açık bakım adımıdır; dev/build kancaları yalnız salt okunur
`node scripts/sync-effect-studio.mjs --check` çalıştırır. Önce repository kökünden
`node web-site-template/tools/sync-effect-engine.mjs /path/to/EfektAtolyesi`, sonra
`npm run effect:sync -w @yardimci-asistan/admin-control-center` çalıştırılır.
`EFEKT_ATOLYESI_ROOT` canonical checkout yolunu değiştirebilir. Tam sync editörün
`scene.html`, `scene.css`, tüm `src`, `assets`, `examples` dosyalarını da kopyalar;
önce yerel snapshot değişiklikleri incelenir. Eski hedef staged kopya doğrulanmadan
silinmez; rename hatasında önceki ağaç geri alınır.

`effect-engine-provenance.json` yalnız runtime/model/registry için template ile
aynı deterministik SHA-256 envanter/fingerprint sözleşmesini taşır; tam editörün
provenance'ı olduğunu iddia etmez. `--check` canonical, template vendor ve Admin
motorunu byte düzeyinde karşılaştırır; eksik/fazla modül, sahte sürüm etiketi altında
farklı içerik veya bozuk provenance hata verir. Editör/sahne dosyalarını iyileştirmez.
Zaten byte-identical snapshot için `node scripts/sync-effect-studio.mjs --write-provenance`
yalnız bu kaydı yazar. Chunk 3'te bu yol kullanıldı; mevcut snapshot ve sahne editörü
üzerine tam kopya yapılmadı. CI snapshot hazırlığını açık sync adımıyla yapmalıdır.

Dar doğrulama repository kökünden `node --test scripts/test-effect-engine-sync.mjs`;
registry kimliği `effect-engine-consistency`. Node alt süreçleri engellenen sandbox'ta
Node 26'nın `--test-isolation=none` seçeneği kullanılabilir. Motor v2 nesne runtime'ını
barındırır; v2 nesne sahnelerini siteye yayınlama bu kontrolün kapsamı değildir.
