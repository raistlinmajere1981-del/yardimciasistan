# Yardımcı Asistan tanıtım ve işletme demosu

Bu dizin iki ayrı sunum katmanıdır. Kök, uygulamanın tanıtımını, kılavuzunu ve
indirmelerini sunar. `/deneme/`, Desktop yayınıyla çalışan ortak işletme şablonudur.
Backend, `/yardimci-asistan/` altında ayrıca kurulan API-only web modülüdür.

## Kaynak sahipliği

- `index.php`, `inc/upper-shell.php`, `inc/discovery.php`: tanıtım, gezinme ve
  canonical capability registry'sinden üretilen açıklama projection'ı.
- `kurulum/`, `inc/demo-installation.php`, `release.json`: mevcut demo bağlantısı,
  güncel kurulum dosyaları ve yalnız demo için izinli kurulum anahtarı sunumu.
- `kullanim-kilavuzu/`, `assets/guide/`: gerçek uygulama görüntülerini kullanan
  kılavuz. `sources.json` kaynak ve sentetik test kapsamı bilgisini korur.
- `assistant/`: gerçek widget ile ayrı tanıtım avatarının TypeScript kaynakları.
  Tanıtım avatarı AI çağrısı veya işletme işlemi yapmaz.
- `deneme/core/`, `deneme/assets/core/`: `web-site-template/` canonical ortak
  kaynağının kontrollü kopyası. Widget, hesap, sepet ve işletme sayfaları buradadır.
- `deneme/site/`, `deneme/assets/site/`: demo kurulumuna ait ayar/tema sınırı.
- `locales/tr.json`: iki katmanın tek Türkçe UI kaynağı;
  `deneme/locales/tr.json` aynı kaynağın eşitliği doğrulanan kurulum kopyasıdır.

Eski `inc/site.php` shell'i, sabit TR/EN motoru ve hedef İngilizce sözlüğü emekliye
ayrılmıştır. Yeni sayfa bu sahipleri include etmez. Eski tanıtım çizimlerinin
fiziksel görselleri değiştirilmez; güncel kılavuz bunları çalışan mağaza gibi sunmaz.
Mevcut `scripts/test-helpers/showcase-store-images.mjs` bakım girişi yalnız güncel
kılavuz görüntülerinin provenance, boyut ve okunabilir metadata'sını denetler;
eski TR/EN çizim renderer'ını yeniden üretmez.

## Yayın ve işlemler

Gerçek işletme verisi yalnız public HTTP API projection'ından gelir. Profil adı
sayfa veya işlem açmaz. Oda/masa/katalog/menü yayını kapalı ya da boşsa ilgili
sayfa gezinmeden kaldırılır ve doğrudan istek 404 olur. Kesinti eski başarılı
veriyi veya örnek işletme verisini fallback olarak göstermez.

Kök tanıtım, canlı işletmenin oda/fiyat/iletişim/yayın verisini taklit etmez.
`/deneme/?page=rooms`, `restaurant`, `menu`, `catalog`, `about`, `gallery`,
`announcements`, `reviews`, `contact` ve `account` gerçek kullanılabilirlik
kapılarını kullanır. Eski `/odalar/`, `/restoran/`, `/qr-menu/`, `/magaza/`,
`/hakkimizda/`, `/galeri/` ve diğer işletme rotaları `/deneme/` girişine yönlenir.
Oda detayı `?page=rooms&id=…` biçimindedir; hesap alias'ı
`/deneme/hesabim/` doğrulama/OAuth bağlantılarının action ve token fragment'ini korur.

AI, Talepler, WhatsApp ve yol tarifi birbirinden bağımsız kullanılabilirliklere
sahiptir. Request türleri backend'in persisted capability kararından gelir;
formlar kesin rezervasyon veya fiyat onayı vermez. Hesabım erişimi mevcut hesap
API'sinin Online Satış kararını izler; yeni sipariş kabulü ve teslimat ayrı kalır.
Sepet/hesap/mutation authority'si mevcut backend'dir. İstek hatasında taslak ve
aynı işlem niyeti için idempotency anahtarı korunur.

## Yayın Laboratuvarı (demo sunumu)

Demo ana sayfa `deneme/site/views/pages/home.php`, üst gezinme
`deneme/site/views/components/header.php`, stil ve geçişler
`deneme/assets/site/theme.css` / `theme.mjs` içinde bulunur. Ortak
`deneme/core/` / `deneme/assets/core/` üzerinde fork oluşturmaz.

- **Yayınlananlar** yalnız `bootstrap()` içinden gelen `view.pages` alanına
  göre gerçek herkese açık sayfalara bağlantı verir. Boş/kesinti durumları ayrı
  tutulur; demo verisiyle API başarısızlığı maskelenmez.
- **Neler mümkün?** varlığı doğrulanmamış sayfalar için tıklanamayan,
  açıklama amaçlı kartlar sunar. Kartlar API yayını, sipariş, yetki veya
  gerçek kayıt oluşturmaz. Bağlantı kesildiğinde yayının durumu bilinmez.
- **Ziyaretçi görünümü** `?page=home&view=visitor` üzerinden açılır. Bu
  yalnız sunuma ait bir URL merceğidir; yetki, kayıt, hesap ve sepet davranışı
  ortak çekirdekte kalır. Diğer sayfalara gezinirken `view` korunur.
- Geri dönüş için yalnız demo üst menüsünden ana tanıtım sitesine bağlantı
  verilir. Test sitesi kendi gezinmesini kullanır.
- Üst tanıtımın sürüm etiketi `release.json` dosyasından okunur. Yenilik
  kartları ve `inc/scenarios.php` içindeki sektörel senaryolar yalnızca
  sunum verisidir; kanonik yetenek kayıtlarını veya çalışma izinlerini değiştirmez.
  Senaryo, sektör geçişi ve mobil taşma kontrolü için
  `node test-site/landing/scripts/smoke-landing-scenarios.mjs` çalıştırılabilir.
- Yeni UI metinleri `locales/tr.json` içinde tutulur; dağıtım kopyası
  `deneme/locales/tr.json` dosyasıyla eşit olmalıdır. Mevcut kaynak katalog
  kaynağında uygulanan üst limit 2048 anahtardır
  (`web-site-template/core/i18n.php`). Eski 1000 anahtar belgesi güncel
  değildir; 512 KiB yanıt sınırı ayrıca gözetilir.

## Dinamik dil

Sabit hedef dil dosyası veya zorunlu İngilizce yoktur. Desktop Çoklu Dil servisinde
seçilen hedefler, merkezi dil adı/locale/RTL bilgisi ve hazır çeviriler normal
publication akışıyla gelir. PHP `YaSite\language_context`, etkileşim adaptörü ve
widget aynı kaynak hash'i doğrulanmış kataloğu kullanır. `?resource=translation-source`
hem kökte hem `/deneme/` altında aynı katalog kimliği/revision'ı döndürür.

Her anahtar için katalog kimliği, güncel kaynak hash'i ve placeholder eşitliği
aranır. Eksik/eski çeviri yalnız ilgili alanda Türkçeye döner. Hedef dil çekilince
veya servis kapatılınca sonraki kabul edilmiş yayında seçenekler kaldırılır.
Public kayıtlar kendi localization metadata'sını kullanır; müşteri mesajları ve
AI cevapları UI kataloğuna sokulmaz. Canlı AI sağlayıcısı test için gerekli değildir;
sentetik çeviri fixture'ları kullanılabilir. Sohbet backend'inin desteklediği yanıt
dilleri ayrı HTTP sözleşmesidir.

## Derleme, kopya eşitliği ve doğrulama

`npm run build:demo`, yalnız ignored `assets/assistant/` çıktılarını üretir.
Canonical widget bundle'ının güncellenmesi bilinçli bakım adımıdır. Ortak kaynak
bakımından sonra manifest ve demo kopyası kontrollü güncellenir; build bunları
sessizce yeniden yazmaz. Kaynak kopyası eşitliği:

```bash
node scripts/sync-demo-template.mjs --check
```

Dar sözleşme kontrolleri:

```bash
node scripts/smoke-public-translations-web.mjs --language-contract-only
node scripts/smoke-settings-correctness.mjs --map-contract-only
node scripts/smoke-business-site-pages.mjs
```

Tam browser/translation kontrolleri registry'deki `demo-two-layer`,
`web-site-template`, `web-widget-module`, `public-translations-web` ve
`showcase-website` sahiplerindedir. Bu komutlar build prerequisite'leri başlatabilir;
uzun doğrulamalar kullanıcı tarafından uygun entegrasyon aşamasında çalıştırılır.
Kılavuz resimleri yeni sürüm, fiziksel cihaz veya canlı sağlayıcı kanıtı değildir.

## Kurulum anahtarı ve dağıtım sınırı

Demo kurulum sayfası yalnız demo modülünün kurulu config'indeki anahtarı sunar.
Bu istisna müşterinin ortak şablonuna veya BlackSea'ye taşınmaz. Kaynak kod,
release metadata, JS bundle ve loglar secret taşımaz.

Hazırlanmış web modülü manifesti hedef installation/module URL/origin metadata'sını
korur. Demo fresh planı bu hedefi beklenen kurulumla karşılaştırır; BlackSea için
hazırlanmış paket demo hedefine kabul edilmez. Paket hedef metadata'sı ve
install-info, public paket kökünün dışında kalır.

Landing deploy, siteyi kendi allowlist'iyle hazırlar; backend runtime, downloads
ve update feed'leri varsayılan kapsamın dışındadır. İndirmeler yalnız açık release
akışıyla eklenir; Bayi Android kalıcı release imzasıyla dağıtılır. Gerçek upload,
fresh cleanup, installer/APK paketleme ve canlı doğrulama ayrı kullanıcı kararıdır.
Yerel çalışmada gerçek veriye yazmak yerine izole test işletmesi kullanılmalıdır.

Canonical ayrıntılar: `docs/architecture/WEB_SITE_TEMPLATE_V1.md`,
`docs/architecture/WEB_DATA_SERVICE_CONTRACT_V1.md` ve `docs/dev/RELEASE_WORKFLOW.md`.

## Demo veri paketlerinin indirilmesi

`/kurulum/` içindeki **Hazır Demo Veri Paketleri** bölümü mevcut Windows/Android
kurulum dosyalarından ayrıdır. `inc/demo-installation.php::demo_sample_downloads()`
üç sürüm-özel ZIP adını `release.json.desktopVersion` değerinden türetir:
`pension-restaurant`, `market`, `market-bayi`. `downloads/` altında dosya
bulunmadığında, boş olduğunda veya sürüm metadatası geçersizse indirme yerine
"henüz yayınlanmadı" metni gösterilir. Dosya oluşturulmadan indirme linki
sunulmaz. Küçük sözleşme testi: `node --test
test-site/landing/scripts/test-demo-sample-downloads.mjs`.

Üretici/fixture sahibi `scripts/demo-data/` olup paketleri `artifacts/demo-data/`
altında üretir. Bu dosyalar **otomatik olarak siteye yüklenmez**.
`scripts/lib/demo-deployment.mjs` normal site kaynaklarını dağıtır fakat
`downloads/` korunan yoldur; mevcut `--with-downloads` de yalnız resmi
installer/APK eserlerini yayımlar. Demo ZIP'leri kullanıcı onaylı, dosya
doğrulanmış ayrı bir upload ile indirme köküne alınmalıdır.

Yerel staging aşaması (sunucuya **hiç bağlanmaz**):

```bash
node test-site/landing/scripts/stage-demo-packages.mjs
node test-site/landing/scripts/stage-demo-packages.mjs --stage
```

İlk komut paket manifesti, sürüm, ZIP hash ve ZIP dizin sözleşmesini
kontrol eder. `--stage` yalnız doğrulanmış üç arşivi
`test-site/landing/downloads/` içine sunum katmanının beklediği isimlerle
kopyalar. Bu klasör Git'te ignore edilir ve normal site deploy allowlist'ine
dahil değildir. Canlı siteye aktarım ayrıca onaylı iş olacaktır.


Manuel geri yükleme için ZIP'in doğrudan içinde tek klasör bulunmalıdır. Bu
klasör `backup.json`, `yardimci-asistan.sqlite`, `assets/` ve
`qr-menu-images/` içermelidir. Kullanıcı paketi uygulamanın **yedek köküne**
açar ve `Ayarlar → Veriler → Geri Yükle` akışını kullanır; mevcut sürüm ZIP
dosyasını doğrudan seçerek içe alma özelliği sunmaz. Geri yükleme mevcut yerel
verilerin yerine geçer; web ve Android bağlantıları ayrıca kurulmalıdır.

Paketler yalnız **aynı güncel şema ile çalışan ilgili sürüm test kurulumunda**
kullanılır; gerçek işletme verileriyle karıştırılmaz. İsim/fiyat/müşteri ve
işlemler sentetiktir, gerçek ürün fotoğrafları kullanılırsa kaynak/lisans
kayıtları korunur. Sır, token, eşleştirme veya gerçek kullanıcı verisi
gömülmez. Bu klasörler gerçek release paketinin parçası değildir.


## Sabit fotoğraf / Efekt Atölyesi vitrini

Deneme test alanı üç sabit fotoğraf içerir: kıyı/dalga, orman/ışık,
göl/yansıma. Yerel dosyalar `deneme/assets/site/img/` altında;
kaynak, yazar ve lisans bilgileri `SOURCES.md` dosyasındadır.
Ana sayfanın tasarım vitrini yanında ziyaretçi görünümü, About ve
İletişim sayfalarında da kullanılır. Fotoğraflar işletme galerisi
veya yayınlanmış sahne değildir; animasyonları henüz yoktur.

Ortak şablon 0.5.2 sabit site fotoğraflarını yalnız
`effects-manifest.json` üzerinden bağlar. Ürün, oda/masa ve
dinamik galeri medyası bundan bağımsızdır. Görseli Atölye'den
yerelde hazırlamak canlı siteye yüklemek anlamına gelmez.
Sektörel senaryo metinleri ortak TR kaynak kataloğuna eklendi; deneme katmanına aynı kaynak kopyası taşınır. Katalog 2048 anahtar ve kaynak HTTP boyutu sınırlarında kalmalıdır.
