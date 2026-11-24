# Genel temizlik, mimari sadeleştirme ve performans

23 Kasım 2026, ilk dilim tamamlandı. Codex oturumu `01a208be-4416-7ae0-a223-cf9faab2a1d3`. Çalışma ağacı `main`, HEAD `af93ab08`, dal başlangıçta `origin/main` ile eşitti. Önceden değiştirilmiş `knip.json` korundu. Üç bağımsız inceleme salt okunur tamamlandı.

## Uygulanan değişiklikler

- `styles/pages/menu.css` ve `styles/pages/messages.css` içindeki üç dar ekran kuralı kaldırıldı. Aynı bildirimleri kapsayan 1200 ve 1180 px kuralları bunları zaten uyguluyordu. Brave ile 12 ekran genişliğinde dört hesaplanmış CSS değeri karşılaştırıldı. 48 değerin tamamı eşleşti.
- `electron/main.ts` içinde genel işlem, kayıt silme ve müşteri mutasyonunun aynı işlem sonrası adımları mevcut `finalizeDesktopOperationMutation` işlevinde birleştirildi. Başarılı sonucun alt tipi ve işlem sırası korundu: yerel Companion işareti, kalıcı `android_snapshot` kuyruğu, dashboard bildirimi, sync planlama.
- `SiteTrafficCard.tsx` açık grafikte tepe değerini bir kez, çubuk yüksekliğini çubuk başına bir kez hesaplıyor. 7 günlük örnekte tepe hesabının satır ziyaretleri 98 → 7, 30 günlük örnekte 1.800 → 30. Boş, tamamen sıfır, eşit ve karışık dağılımlarda geometri karşılaştırıldı. `scripts/smoke-dashboard-workspace.mjs` sıfır, tepe ve ara değerleri gerçek SVG özniteliklerinde doğruluyor. Uygulama açılışı, CPU süresi ve Electron belleği ölçülmedi.
- Kaynak, bağımlılık veya geçici dosya silinmedi. Knip dosya/bağımlılık taraması temiz. Önceki 14 geçici çıktı temizliği tarihsel kayıt olarak kaldı.

## Doğrulama

- `architecture:audit` 1.361 dosyada, `knip:strict`, `design:audit` ve `design:audit:strict` geçti. Envanterde 102 tekrar kaydı, önizleme renderer'ına ait 39 doğrudan renk, normal DOM'da 0 doğrudan renk ve 0 `!important` var. Kaldırılan kurallar farklı media bağlamlarında olduğu için tekrar sayacı değişmedi.
- `qr-menu-workspace-ui`, `smoke-messages-ai-staleness.mjs` ve `smoke-dashboard-workspace.mjs` geçti. Mesajlar için registry planı ortak paketlerin ardından Desktop birleşik derlemesine geçtiğinde durduruldu. Vite fixture kullanan aynı smoke doğrudan çalıştırıldı.
- Yalnız Electron TypeScript derlemesi ve ardından `smoke-runtime-boundary-lock.mjs` geçti. Smoke 341 korumalı IPC çağrısını, preload/handler kilit yarışını ve gerçek kalıcı outbox'a `android_snapshot` yazılmasını denetledi.
- Renderer TypeScript kontrolü (`tsc -p apps/desktop-app/tsconfig.json --noEmit`) ve `git diff --check` geçti.
- Hedefli strict ESLint geçti. Grafik ve smoke için önbelleksiz koşu 44,69 sn ve 874.480 KiB, `main.ts` koşusu 33,91 sn ve 1.012.932 KiB tepe RSS ölçtü. Tam `lint:strict` komutu geniş glob'ları tarıyor ve tip duyarlı kurallar için dokuz TSConfig adayı tanımlıyor. Bu ölçümler tam koşunun maliyetini belirlemez. `lint:strict`, `verify:pre-main`, `verify:release` ve `verify:full` çalıştırılmadı.

## Oda sayımı ve veritabanı uyumluluğu dilimi

### Uygulama ve ölçüm

- `electron/desktop-dashboard-service.ts` aktif ve müsait oda sayılarını tek koşullu agregasyonda okuyor. Eski plan bir oda taraması ve `idx_rooms_status` araması, yeni plan tek oda taraması yapıyor. Bellek içi kanonik SQLite örneğinde 7 tur ve tur başına 2.000 okumanın medyanı 20 odada 14,25 → 10,22 ms, 200 odada 94,24 → 54,95 ms. Boş, aktif, pasif ve silinmiş oda sayıları derlenmiş dashboard servisinde doğrulandı.
- `electron/desktop-database-compatibility.ts` sütun teşhisini DDL'i farklı tablolarla sınırlıyor. 140 tabloluk güncel şemada açılış kontrolü başına `PRAGMA table_info` sayısı 280 → 0. Geçici disk veritabanında, `quick_check` dahil 7 tur ve tur başına 25 çağrının medyanı 107,19 → 91,39 ms/çağrı. Bu süre ölçülen kontrolün maliyeti. Tam Electron açılışı ölçülmedi. Tam DDL karşılaştırması, eksik alan teşhisi ve bütünlük kontrolü korunuyor.
- `electron/database/hospitality-notification-store.ts` KBS özetinden eski şemaya ait tablo-varlığı sorgusunu kaldırdı. Kanonik tablo zorunlu. Ayar satırı oluşuncaya kadar KBS kapalı. `scripts/smoke-schema-authority.mjs` eksik sütun teşhisini, tablosu eksik KBS özetinin hata vermesini ve aktif konaklamaya varış bildirimi üreten etkinleştirme akışını doğruluyor.

### İnceleme sınırları ve bulgular

- Electron açılışı boş veritabanına `db/schema.sql` kuruyor, eski yapıları reddediyor. Geçmiş şema kuran bir migration zinciri veya kaldırılması kanıtlanmış eski kolon bulunmadı. Gelecekteki checkout yetkisi için ayrılmış `commerce_benefit_checkout_authorizations` ve tenant kapsamı testi mevcut. Boş capability manifestini stok takibi açık kabul eden düşük seviyeli fixture yolu ayrıca test verisi güncellemesi gerektiriyor. KBS etkinleştirme, `legacy-data` arşivi ve manuel yedekleme/geri yükleme geçerli ürün davranışları. C17f belgesindeki kalıcı arşiv silme kaydını 1 Kasım C24 kararı geçersiz kılıyor.
- Companion ve Bayi'de SQLite/Room migration zinciri bulunmadı. Android'de cihaz JSON/depolama varsayılanları, outbox ve kimlik doğrulama akışları var. Bayi `remember_me` öncesi çerez varsayımı ayrı bir cihaz oturumu adayı. Ortak `sync-core` içindeki eski görünen alanlar canlı aktarım sınırında. Örneğin ürün oluşturma güncel Android editöründe `category_id` kullanıyor, eski `category` adı ise kuyruktaki komutlarda KDV kategorisini belirleyebiliyor. Kaldırmadan önce eski kuyruğun davranışını ve red kuralını ayrı sözleşme diliminde doğrula.
- PHP güncel tablo oluşturma, commerce şema reset uyarısı, protocol version ve güvenlik kontrolleri aktif. `reset_runtime` eski JSON yedeklerini temizliyor ve web smoke bu davranışı doğruluyor. İncelenen PHP kodunda tarihsel `ALTER TABLE` zinciri bulunmadı. Bu dilimde kanonik şema, yayın sözleşmesi ve Android/PHP ürün kodu değiştirilmedi.
- Açılışta bakım ön kontrolü ve ana veri hazırlığının iki ayrı denetimi sürüyor. Bakımın DB dosyasını değiştirebildiği sınırda ve sonrasında `initialize()` için yeniden doğrulama gerekli. Normal açılışta bekleyen işlem yokken ön kontrolün atlanması ayrı ölçüm ve bakım sırası testi gerektiriyor.

### Doğrulama

- Electron TypeScript derlemesi, değişen dosyalara strict ESLint, `architecture:audit` (1.361 dosya), `knip:strict` ve `git diff --check` geçti.
- `schema-authority`, `clean-start`, `desktop-clean-startup`, `storage-correctness`, `data-transfer` (native fixture dahil), `kbs-domain`, `android-kbs`, `android-companion-v3`, `android-hosting-contract`, `web-module-menu`, `publication-protocol` (restore reconciliation dahil) ve `backup-zip-import-ui` geçti. PHP web sipariş depolaması ve trafik testleri geçti. Bunlar yerel fixture testleri.
- `backup-zip-import` doğrudan koşusu, beklediği `artifacts/demo-data/yardimci-asistan-demo-2.2.1-a-pension-restaurant.zip` bulunmadığı için ürün koduna ulaşmadan durdu. Sürüme sabitlenmiş demo ZIP fixture'larının doğrulanması açık. APK/Gradle ve büyük test paketleri çalıştırılmadı.

## Demo ZIP ve Pazarlama yenileme dilimi

- `smoke-backup-zip-import.mjs` A/B/C paketlerini, `smoke-windows-demo-restore.mjs` A paketini güncel manifestten çözüyor. Üretici manifeste kanonik şemanın SHA-256 değerini ekliyor. Hazırlık güncel ürün sürümü, şema, dosya adı, ZIP boyutu, ZIP SHA-256 ve üretici doğrulamasını kontrol ediyor. Eksik fixture kanonik üreticiyle `artifacts/verify/demo-zip-fixtures` altında oluşturuluyor. Hazır fixture sonraki çalışmada yeniden üretilmiyor. Mevcut demo yayın çıktıları yazılmıyor.
- Sürüm taramasında iki gerçek çıktı bağımlılığı bulundu ve düzeltildi. ZIP import 2.2.1 dosya adına sabitlenmişti, Windows restore 2.2.0 dışındaki her sürümde yeniden üretim yapıyordu. Release readiness içindeki eski sürüm değerleri yanlış backend sürümü ve eski script sabitlerinin negatif örnekleri. Updater, release planlama, native image ve Android bağlantı testlerinde sayılar bağımsız semver, metadata ve aktarım fixture'ları.
- Pazarlama sayfası kampanya, takvim ve Business Messaging olaylarını 100 ms içinde birleştiriyor. Kampanya geçişleri ve dispatch, takvim yazıları ve scheduler, Business Messaging konfigürasyon ve durum senkronu mevcut olayları kullanıyor. Web yayın onayı bu üç olaya bağlı değil. Görünürken 30 sn periyodik kontrol sürüyor, gizliyken çağrı yapılmıyor. Odak, görünürlüğe dönüş, bağlantının geri gelmesi ve rotaya dönüş okumayı tetikliyor. Başarısız arka plan okumasında son başarılı veri ekranda kalıyor.
- Tarayıcıda aynı iki renderer bridge metodunun çağrıları, ilk yükleme hariç, görünür ve boşta 24 → 4/dk, gizli 24 → 0/dk. Üretim preload'u her çağrıdan önce bir kilit IPC'si de yapıyor. Dolayısıyla açık oturumda transport toplamı 48 → 8 ve 48 → 0 olarak hesaplanır. Transport sayıları tarayıcı fixture'ında doğrudan ölçülmedi.
- Güncel 2.5.0 A/B/C ZIP import, yinelenen import, traversal ve SQLite bütünlük testi geçti. Sıcak cache koşusu üretim yapmadan geçti. Demo generator sözleşmesi ve yerel PHP ile Windows demo restore smoke'u geçti. Marketing UI (olay kümesi, gizli pencere, başarısız okuma, kaçırılan olay, online ve rota dönüşü), schedules domain/UI, calendar workspace, messaging dispatch lifecycle, Business Messaging provider, hedefli ESLint ve Renderer TypeScript geçti.
- Mimari denetim 1.362 kaynak dosyada, Knip strict ve `git diff --check` geçti. Çalışma ağacı `main` / `af93ab08`, önceki değişiklikler ve `knip.json` korundu.

## Electron açılışı, updater IPC ve CSS dilimi

- `main-entry.ts` SQLite ön kontrolünü yalnız bekleyen bakım işaretinde yapıyor. Normal güncel açılışta uyumluluk denetimi 2 → 1. Ana süreçte `quick_check`, kanonik DDL ve `initialize()` duruyor. Yerel Electron senaryoları güncel, boş, dosyasız, bozuk ve uyumsuz DB'yi, gerçek yerel restore/reset geçişlerini, onaylı temiz başlangıç arşivini ve uyumsuz DB'de bekleyen işlemin ertelenmesini doğruladı. Simüle edilmiş updater handoff başka bir başlangıç işlemi çalıştırmadan sonlandı. `clean-start` smoke'u eski kaynak regex'i yerine derlenmiş giriş noktasında çağrı sırasını çalıştırıyor.
- Linux/Xvfb üzerinde yerel, paketlenmemiş Electron ve aynı derlenmiş Renderer ile her varyant için 5 açılış ölçüldü. Süre süreç başlatmadan görünür kurulum penceresinde etkin kontrolün bulunmasına kadar. Yeni Chromium profili ile medyan **1.830 → 1.657 ms** (önce 1830/1800/1868/2108/1775, sonra 1655/1809/1657/1644/1754). Yeniden kullanılan profille **1.889 → 1.752 ms** (önce 1945/1771/1838/1908/1889, sonra 1764/1745/1746/1752/2380). Koşular önce/sonra dönüşümlü, DB güncel geçici şema. İşletim sistemi dosya önbelleği temizlenmedi. Windows ve paketli uygulama ölçülmedi.
- Beş updater kanalı `electron/ipc/desktop-update-ipc.ts` içinde kaydediliyor. `update:getStatus` kilitliyken okunabiliyor, dört işlem kilidi kontrol ediyor. Startup/indirilen güncellemenin doğrulanması ve installer handoff serviste. `desktop-visible-updater` 29 senaryo, `runtime-boundary-lock` 341 korumalı çağrı ve `desktop-logging-contract` geçti. Gerçek Windows installer çalıştırılmadı.
- SEO önizleme çerçevesi ile flex bildirimleri birleştirildi. 650 px kuralında iki eşit padding bildirimi ortak seçici grubunda. Kaynak yönetiminde `.room-media-panel` iki kural yerine tek blokta. Başlangıç çalışma ağacından alınan Vite CSS ile `SETTINGS_CSS_BASELINE` karşılaştırması yapıldı. SEO 1440/960/600 px ve açık/koyu temada geçti. Menü Önizleme paleti korundu.

## Sıradaki öncelikler

1. **Electron heap ve bellek profili.** Aynı geçici veriyle paketlenmemiş başlangıç ve ardışık sayfa aç/kapa döngülerinde main/renderer heap, RSS ve geri toplanan nesneleri ölç. Paketli sonuçları varsa ayrıca değerlendir.
2. **Android Companion ön plan senkronizasyonu.** 15 sn sync ve 45 sn keşif eşiğinde no-op istekleri, yeniden bağlanma ve tazelik gecikmesini ölç. Mevcut dayanıklı eşitleme yolunu koru.
3. **Kullanılmayan kaynaklar ve büyük dosyalar.** Menü, web şablonu, Android ve dağıtım için dinamik referansları doğrula. Yerel renderer derlemesindeki büyük başlangıç chunk'ında yüklenen modülleri bundle/trace üzerinden incele.
4. **Büyük liste ve render maliyetleri.** Temsili veriyle filtre, satır render ve dashboard yenileme maliyetlerini profille.
5. **Merkezi mimari tekrarları.** `main.ts` kurulum doğrulamasının uygulama servisine taşınmasını ayrı dilimde `settings-correctness` ve kilit sınırıyla doğrula. Kalan CSS kayıtlarını yalnız cascade etkisi belirlenebildiğinde sadeleştir.


## Masaüstü responsive / dialog / tema doğrulaması — Codex limiti sonrası

- Masaüstü üst barda mesajın ikinci satıra zorunlu geçişi 1260px yerine 980px altında başlıyor. 1000-1260px arasında başlık, mesaj ve sağ kontrol grubu tek satırda. 760px altında da iki satır korunuyor; yalnız 620px altında üçüncü satıra geçiliyor.
- Ortak ModalSurface üst barın gerçek alt kenarını ResizeObserver ile ölçüp native dialogların sınırını ayarlıyor. Form, galeri, oda/masa yönetimi ve genel dialoglar kullanılabilir canvas alanına göre ortalanıyor ve alttan kırpılmıyor. WorkspaceFrame kendi mevcut ölçümünü koruyor.
- Galeri Yönetimi ve Oda/Masa Yönetimi ile detay formundaki eski viewport-merkezli transform/inset kuralları kaldırıldı. Ortak modalın fit-content yüksekliği Ayarlar regresyon testinin tespit ettiği gereksiz dikey uzamayı giderdi.
- Yeni responsive-shell fixture ve smoke; 1440/1100/1000/900/760/700/600 genişlik, light/comfortable, dark/compact, 1.15 ölçek varyantları ve dört native dialog türünde 1100x650, 900x500, 700x430 pencereleri denetliyor. Verification registry içinde desktop/settings/platform hedefli test olarak kayıtlı.
- Geçen testler: responsive-shell, desktop-shell, settings-ui-correctness, business-gallery-ui, desktop-ui-family, record-picker-ui, workspace-platform, Renderer TypeScript, hedefli ESLint, design:audit:strict, architecture:audit (1365 dosya), knip:strict ve git diff --check.
- Tema tokenları, CSS layer sırası, menü önizlemesinin özel paleti ve Android kodu değiştirilmedi. Statik CSS tekrarlarının tümü körlemesine kaldırılmadı. Android arayüz düzenlemesi kullanıcı tarafından yapılacak; ardından ayrı inceleme gerekecek.
- Tam/release testleri kullanıcının kapanış test turuna bırakıldı. Commit, push, deploy, sürüm artırma ve paket üretimi yapılmadı. Önceki Codex çalışma ağacı korundu.

Sıradaki alanlar: gerçek paketli Windows görünüm denetimi; Electron heap/bellek, yükleme izi ve büyük listeler; Android UI kontrolü manuel düzenlemeden sonra.


## Satış / Stok — İdeal Stok İhtiyaç Listesi arayüz sadeleştirmesi

- Fiziksel Sayım başlığına aynı satırda İhtiyaç listesini aç eylemi eklendi. Alttaki bağımsız Satın Alma Planlama / İdeal Stok Eksikleri kartı kaldırıldı; stok kaydı ve geçmiş işlevleri korunuyor.
- İhtiyaç Listesi penceresindeki üst açıklama (Önerilen miktar...) ve alttaki baskı bilgilendirmesi kaldırıldı. Baskı iş mantığı ve yetkilendirmesi korunuyor.
- Kategori / Arama / Sıralama / Sayfa boyutu alanları makul maksimum genişliklere sınırlandı. Dar görünümde iki ve tek kolonlu yerleşim sürüyor. Yenile, seçim araçlarının bulunduğu alt satırın sağına erişilebilir ikon düğmesi olarak taşındı.
- Stok replenishment UI fixture ve smoke yeni başlık/aksiyon yerleşimine uyarlandı; kartın kaldırılması, aynı satır, kompakt filtreler, gizlenen açıklamalar, Yenile konumu ve yeniden okuma davranışı doğrulandı.
- Geçen hedefli kontroller: stock-replenishment-ui, stock-replenishment-print, Renderer TypeScript, hedefli ESLint, design:audit:strict ve git diff --check.
- Önceki milestone değişiklikleri korundu. Commit, push, deploy, paketleme ve full/release testleri yapılmadı.

## Satış / Stok — İhtiyaç Listesi kategori/ürün iki kolonlu tasarım

- İhtiyaç Listesi penceresi, ortak ProductWorkspace / DetailWorkspaceLayout ailesiyle iki kolonlu hale getirildi. Sol rail yalnız kategori düğmelerini ve her kategorinin eksik ürün sayısını gösteriyor; ilk sırada Tüm kategoriler var. Seçilen kategori aria-pressed ile işaretleniyor.
- Sol kategori listesi kendi min-height:0 / overflow-y:auto alanında kayıyor; çok kategori bulunduğunda sağdaki ürün tablosu sabit kalıyor. Sağdaki panelde seçili kategori başlığı, arama, sıralama, sayfa boyutu, çoklu seçim, yenileme, ürün tablosu ve sayfalama yer alıyor. CSV/yazdırma eylemleri ortak footer'da.
- Kategori değiştirmek sayfayı birinci sayfaya döndürüyor, ancak daha önce seçilmiş ürünler diğer kategorilerde de seçili kalıyor. Sadece mevcut kategorinin filtreli ürünlerine yönelik seçim/CSV ile tüm ürünlere yönelik işlemlerin kapsamı değişmedi.
- Dar container'da kategori rail, sağ ürün panelinin üstüne geçiyor; kategori navigasyonu burada da ayrı kaydırmalı, tablo da kendi yatay scroll alanını koruyor. Renkler ortak semantik token ve panel ailesini kullanıyor.
- Smoke fixture ihtiyaç halinde 42 kategori üretebiliyor. UI testinde 540 ürün, kategori seçimi ve filtrelenmiş sayfalama, kategoriler arasında seçim sürekliliği, 42 kategoride bağımsız kaydırma ve 390 px dar viewport doğrulandı. Yazdırma/CSV sözleşmeleri değişmedi.
- Geçen kontroller: stock-replenishment-ui, stock-replenishment-print, design:audit:strict, architecture:audit (1365 kaynak dosyası), knip:strict, hedefli ESLint ve git diff --check. Renderer TypeScript kontrolü de sorunsuz geçti.
- Commit, push, sürüm artırma, deploy, paketleme ve full/release testleri yapılmadı. Önceki milestone değişiklikleri korundu.

## Son kategori/ürün tasarımı sonrası temizlik kontrolü

- Masaüstü ihtiyaç listesi için kaldırılan launcher/intro/print-note CSS seçicileri, kategori dropdown erişimi ve eski başlık referansları tarandı; masaüstünde yetim referans bulunmadı. Android device UI smoke içindeki İdeal Stok Eksikleri beklentisi Android ekranının ayrı işlevi olduğundan korunuyor.
- Hedefli kontroller tekrar geçti: stock-replenishment-ui (540 ürün, 42 kategori ve bağımsız scroll), stock-replenishment-print, design:audit:strict, architecture:audit (1365 dosya), knip:strict, registry testleri 10/10, git diff --check.
- clean:artifacts:dry 124 dosya / 26,6 MiB geçici çıktı gösteriyor. Bunların arasında yakın tarihte üretilmiş tasarım karşılaştırma görüntüleri var; paralel geliştirmeler devam ederken bu çıktıların silinmesi ertelendi.
- Bu son kontrolde ürün kodu, CSS, bağımlılık, şema veya test altyapısında ek bir silme/refaktör gereksinimi bulunmadı. Full/release paketleri, hız ve bellek profili bu kontrolde çalıştırılmadı.
- Kapanış sırası: devam eden paralel işleri ve kullanıcının planladığı Android ekran düzeltmelerini tamamla; çalışma ağacını bütünleştir ve hedefli doğrula; gereksiz çıktılar güvenle temizlenince sakin ortamda Electron bellek, CPU, startup ve büyük liste ölçümlerini alıp gerekirse sorunları gider; bütün işler bittiğinde kullanıcı full/release testlerini çalıştırsın; ardından sürüm, git ve yayın kapanışına karar ver.

## Electron çalışma profili ve Nexa düşük boşta CPU optimizasyonu

**Ölçüm koşulları:** 23.11.2026; Linux, Electron 44, paketlenmemiş güncel masaüstü derlemesi; izole Xvfb + CDP. Her testte geçici Market SQLite, backup ve Chromium profili kullanıldı. Gerçek kullanıcı verisine dokunulmadı. Codex/OpenCode/test servisleri açık değildi; Brave, terminal ve düşük yüklü Ollama sistem servisi korundu. CPU değerleri tek çekirdek yüzdesi; PSS uygulama süreçlerinden Xvfb payı çıkarılarak hesaplandı. Açılış ölçümü Xvfb+CDP maliyetini de kapsıyor ve önceki 1,65–1,75 sn başlangıç testinden farklı tanım taşıyor.

**Ölçüm özeti:**
- Beşer açılış: yeni profilde medyan 4537,6 ms; kullanılmış profilde 4529,5 ms. Uygulama PSS medyan 333,0 / 334,7 MiB; ilk renderer heap 5,75 / 5,74 MiB.
- Dört ana ekran/Satış/Müşteri İşleri/Takvim/Ayarlar döngüsünde GC sonrası renderer heap 4,42 → 6,42 → 6,95 → 7,08 → 7,16 MiB. Artış son döngülerde azaldı; tek başına sızıntı kanıtı değil.
- İlk sürümde boşta CPU açılış sonrası %39,42, dört tur sonrası %27,02 (renderer katkısı %23,40). Optimizasyondan sonraki bir tekrarda aynı koşullar %35,73 ve %17,04 (renderer katkısı %13,43). Son boşta CPU yükü yaklaşık %37 azaldı.
- Profilli 8 saniyelik ayırıcı testlerde normal hareket %52,77, reduced motion %0,25; yeni doğal hareket %39,96. Profilleme ek yükü bulunduğundan bu yüzdeler profillemesiz rakamlarla karşılaştırılmamalı.

**Kod iyileştirmesi:** packages/shared/utils/nexa-rig.ts içinde değişmeyen SVG özelliklerinin yinelenen DOM yazımları kaldırıldı. Yalnız doğal rig'in sakin ready durumunda yaklaşık 14 fps hedefli kare zamanlaması kullanılıyor; düşünme/konuşma/sonlu tepki ve web varsayılanı aynı hızında. Görünürlük, reduced-motion, dispose ve sonlu animasyon bitişi korundu. İlk smoke'da pleased tepki sonu kontrolünün eksikliği yakalandı ve düzeltildi; sonraki desktop-nexa ve web-nexa smoke testleri geçti. Web doğal animasyon gözlemi yaklaşık 29,9 poz/sn. Shared Nexa unit testleri 7/7 geçti.

**Büyük liste:** 42 kategori ve yalnız 50 görünür satırla 540 / 5.000 / 10.000 kayıt: kategori geçişi medyan 84,8 / 103,5 / 114,9 ms; arama medyan 78,1 / 87,3 / 87,7 ms; renderer heap 9,70 / 10,58 / 11,93 MiB. 390px dar pencere düzeni ve bağımsız kategori scroll doğrulandı. Bunlar gerçek SQLite yerine fixture üzerinde tarayıcı etkileşim ölçümleri.

**Doğrulama / kapsam:** Shared ve masaüstü derlemeleri, hedefli ESLint, Knip strict, mimari denetim (1367 dosya), stok UI ve CSV sözleşmeleri, desktop/web Nexa smoke ve git diff --check geçti. Vite başlangıç JS boyutu yaklaşık 715 KB (gzip 205 KB) ve Ayarlar yaklaşık 291 KB; somut açılış darboğazı gösterilmeden parçalama yapılmadı. Windows paketli uygulama, gerçek GPU ve Android Companion senkronizasyonu bu turda ölçülmedi; Android manuel UI düzeltmesi sonrasına bırakıldı. Full/release testleri kullanıcıya bırakıldı.

**Tekrarlanabilir ölçümler:** scripts/benchmark-desktop-runtime.mjs (--runs=5 ve --diagnose-idle) ile scripts/benchmark-stock-replenishment.mjs. Kaydedilen çıktılar artifacts/verify/runtime-performance/ altındaki desktop-runtime-five-runs.json, desktop-runtime-after-nexa.json, desktop-idle-cpu-before.json, desktop-idle-cpu.json, stock-list.json.

Commit, push, deploy, sürüm artırma veya kurulum paketi üretimi yapılmadı. Önceki milestone çalışma ağacı korundu.

## Android ekran arşivi — 23 Kasım 2026

- Android 13 telefonda sentetik test verisiyle iki uygulamanın ekran görüntüleri otomatik toplandı. Companion 24 ekran x 2 yön = 48 PNG; Bayi 9 ekran x 2 yön = 18 PNG. Toplam 66 PNG.
- Dikey görüntüler fiziksel 720x1280 ekran; yatay görüntüler ROM yön kilidi nedeniyle 1280x720 ekran alanı simülasyonu. Gerçek fiziksel döndürme olarak sunulmuyor.
- Statik galeri: artifacts/android-ui-gallery/index.html. Dört tek sayfalık özet, birleşik android-ui-gallery.zip ve ayrı android-ui-dikey.zip / android-ui-yatay.zip arşivleri hazır. Yeniden paketleme betiği: scripts/build-android-ui-gallery.py.
- Ekran boyutu ve yön kilidi eski durumuna döndü. Companion debug ve Bayi debug kuruldu. Companion bildirim izni zaten açıktı; kamera izni test için etkinleştirildi. Mikrofon / yakın cihaz izni açılmadı.
- Companion KBS rotası test veri profilinde açılamadı. Ek Market, Raporlar ve Görünüm smoke testleri mevcut arayüzle uyuşmayan sırasıyla kategori alanı, Personel Ayarlar, kişisel görünüm beklentilerinde durdu. Android manuel toparlama diliminde bu üç test senaryosu ayrıca değerlendirilmeli.
- Bayi geçici hesap/device instrumentation, dikey ve yatay viewport modlarında geçti. Playwright galeri doğrulaması 66 kart, 4 bölüm ve ilk görselin yüklenmesini kontrol etti; ZIP arşiv bütünlük kontrolü geçti.
- Full/release, deploy, paketleme ve commit yapılmadı.

## Ajan talimatı ve tarihsel doküman temizliği — 23 Kasım 2026

- `AGENTS.md` yaşayan kurallara indirildi (6.443 → 4.017 bayt). OpenCode v2 eski API/model talimatları ve her işten sonra tarihsel backlog'a not ekleme zorunluluğu kaldırıldı. `product-version.json` otoritesi, staging veri politikası, mevcut backup işlevleri, servis/IPC/senkronizasyon sahipliği, Git ve test sınırları korunuyor.
- `.opencode/skills/android-commerce-sync/SKILL.md` artık 469 KB'lık eski devam günlüğünü okumuyor; yalnız ilgili güncel domain bölümlerini açıyor.
- 29 tamamlanmış `docs/dev` sürüm/denetim/oturum raporu ile 1 eski mimari ownership audit'i çalışma ağacından çıkarıldı (toplam 759.635 bayt). Bu **Git tarafından izlenen dosyalar** geçmişte geri alınabilir. Git dışında kalmış, eski yanlış repo yolunu içeren `.superdesign/.../CODEX_IMPLEMENTATION_TASK.md` kaldırıldı; tasarım örnekleri korundu.
- `docs/README.md` güncel kaynak yönlendirmesini ve son yayınlanan 2.5.0 kabul kaydını gösteriyor. Admin secret belgesindeki eski şifresiz FTP ifadesi, doğrulanmış FTPS kullanımına göre düzeltildi. Android arayüz sözleşmeleri, şema, ürün kodu, test kayıtları ve mevcut aktif checkpoint korunuyor.
- Test: silinen dosya adlarına aktif Markdown/skill referansı **0**; yerel Markdown kırık bağlantısı **0**; `smoke-desktop-logging-contract`, agent doküman sanity ve `git diff --check` **PASS**. Full/release testleri çalıştırılmadı.
- Commit, push, deploy ve paketleme yapılmadı; milestone açık, önceki kod değişikliklerine dokunulmadı.

## Android Bayi — Fiyat metinlerini sadeleştirme (23 Kasım 2026)

- Katalog, ürün detayı ve sepet ürünlerinde sürekli gösterilen "Kayıtlı fiyat (değişebilir)" ifadesi kaldırıldı; doğrudan fiyat gösteriliyor. Sepet "Tahmini toplam" yerine "Ürünler toplamı" kullanıyor (teslimat ücreti bu tutarda değil). "Fiyatlar işletme onayında güncellenebilir" satırı kaldırıldı.
- Sunucudan doğrulanmış checkout quote, **yalnız sipariş onay penceresinde** sepet/katalogda görünen ürün birim fiyatıyla karşılaştırılıyor. Gerçek fark veya para birimi farkı varsa uyarı gösteriliyor; teslimat ücretinin eklenmesi fiyat değişikliği sayılmıyor. Quote, toplam, onay, idempotency ve gerçek fiyat otoritesi sunucuda kalıyor; mobil talebe fiyat eklenmedi.
- Birim testlere eşit fiyat, farklı fiyat/para birimi, sadece teslimat ücreti farkı ve kayıt oluşturmayan inceleme senaryoları eklendi. Gerçek Android cihaz otomasyonundaki 10 eski sepet metni beklentisi ve yaşayan Bayi UI belgesi güncellendi.
- Doğrulama: Bayi DealerStateTest (JUnit) PASS; fiziksel Android 13 cihazında sentetik native Bayi fixture ve gerçek yerel HTTPS/PHP checkout smoke PASS (INSTRUMENTATION_CODE -1). assembleDebug PASS; güncel 2.5.0-debug APK bağlı telefona kuruldu (adb install -r -t PASS). git diff --check PASS.
- Önceki 66 görsellik Android galeri **değiştirilmedi**; kullanıcı işaretlemeleri için orijinal referans görseller saklanıyor. Tam/release verify, commit/push/deploy/sürüm artırma yapılmadı.

## Android ekran rötuşları — Companion / Bayi (23 Kasım 2026)

- Companion: AI stok giriş kartındaki ikincil uzun açıklama, kasa barkod okuyucunun başlangıç yönergesi ve günlük iş formunun "İş için kısa açıklama" placeholder'ı kaldırıldı. Gerçek tarama başarı/hata mesajları, stok analizi ve form alanları korunuyor.
- Market ana ekranda iki barkod eylemi eşit genişlikte **tek yatay sırada** gösteriliyor (hem dikey hem yatay ekran). Rootlu ROM'un ekran döndürme bildirimine bağlı olmadan çalışır; iki eylemden yalnız biri yetkiliyse mevcut tam genişlikli kontrol korunur. Dikey/yatay geometri karşılaştırması Android UI smoke'a eklendi: `--market-layout-only`. Gerçek cihaz testinden `artifacts/android-device-ui/market-home.png` (720x1280) ve `market-home-wide.png` (1280x720) üretildi; galeri arşivine dokunulmadı.
- Bayi ilk bağlantısı: "İşletmenin web adresi" tek alanına `https://ornek-isletme.com` veya `ornek-isletme.com` giriliyor. Aynı origin'deki standart `/yardimci-asistan/` modül yolu bulunuyor, halka açık `api/account/config.php` ile doğrulanıyor; giriş yetkisi ve cookie gönderimi ancak sonrasında mevcut hesap sözleşmesiyle devam ediyor. Başka origin'e redirect/tarama ve HTTP bağlantısı kabul edilmiyor. Doğrudan standart modül yolu da korunuyor. Modül bulunamazsa anlaşılır hata gösteriliyor.
- Bayi sentetik cihaz testinin teknik "Yerel fixture" metni kaldırıldı: `catalog_at` gerçek tarih/saat biçimiyle doluyor ve işletme kimliği "ÖRNEK İŞLETME · TEST VERİLERİ" olarak gösteriliyor. İlk giriş ekranının test görüntüsü, kasıtlı geçersiz adres denemesi öncesinde çekilerek kırmızı test hatası giderildi.
- Testler: Bayi `DealerApiTest` (web sitesi URL'si, alt dizin, doğrudan modül, yanlış HTTPS/credential/query/fragment) ve `DealerStateTest` JUnit PASS; Bayi gerçek Android cihaz fixture (yerel TLS/PHP, sipariş, hesap, görüntü, form) PASS; normal Bayi debug APK build/install PASS. Companion `assembleDebug` PASS; gerçek Android cihazda Market barkod eylemleri için dikey+yatay konum smoke PASS. İki uygulama debug telefona kuruldu, ekran boyutu 720x1280'e döndü.
- Gradle önce Companion ML Kit bağımlılığı çevrimdışı cache'de yokken durdu; çevrim içi bağımlılık indirildi ve takip eden build başarılı. Full/release verify, deploy, commit/push, sürüm artırma yapılmadı.

## Desktop — Teslimat ve Gönderim ödeme alanı hata açıklamaları (23 Kasım 2026)

- Kanonik `commerce-checkout-settings.ts` doğrulaması aynı zorunluluk, değer sınırları ve IBAN mod-97 kontrolünü korurken artık alan bazlı Türkçe hatalar döndürüyor: banka adı, hesap sahibi, IBAN, kargo bedeli, sözleşme sürümü, ön bilgilendirme ve satış sözleşmesi. Boş/uzun/kontrol karakteri içeren girdiler ayrı açıklanıyor; eski demo bayrağı ve sürüm uyumsuzluğunun güvenlik reddi korunuyor.
- `CommerceCheckoutSettingsSection` banka alanları, IBAN, kargo bedeli ve sözleşme alanlarına örnek/placeholder ekledi. IBAN için açıklama ayrı `aria-describedby` ile bağlı (input erişilebilir adı "IBAN" olarak kalıyor); gerçek hesap bilgisi otomatik doldurulmuyor.
- Paylaşılan `ServiceSettingsCard` servis kaydı başarısız olursa gerçek hata mesajını modalda, üstte sabit geri bildirim alanında `role=alert` ile gösteriyor; modal açık kalıyor; kullanıcı ayarı değiştirdiğinde eski uyarı temizleniyor. Hata stili mevcut tema semantik tokenlarıyla açık/koyu uyumlu. Global durum çubuğu ve servis sahipliği korunuyor.
- Test: hedefli ESLint, Desktop Renderer/Electron TypeScript, `design:audit:strict`, `git diff --check` PASS. `smoke-settings-platform` form içi hata/temizleme ve erişilebilir IBAN açıklamasını doğruladı, PASS. Gerçek Electron doğrulayıcıdan bağımsız 10 başarısız ödeme veri senaryosu + geçerli/kapalı senaryosu PASS. `smoke-commerce-checkout` regresyonuna ayrıntılı hata mesajı/rollback testleri eklendi, ağır uçtan uca test çalıştırılmadı.
- Full/release verify, commit, push, deploy veya yeni kurulum paketi yapılmadı. Önceki milestone değişiklikleri korunuyor.

## 2.5.1 release ön kontrolü — 23 Kasım 2026

- Kullanıcı kamera yönetimi modülünü **bu sürümden çıkardı**. Bu modül için yeni geliştirme, şema, servis ya da deploy yapılmadı.
- Release registry incelemesi: `release` preset'i `full` + `pre-main` + `release` katmanlarının birleşimi. Önce 329 testti. Gerçek A/B/C demo ZIP import'u artık manifest ve kanonik şemaya göre fixture'ını otomatik hazırladığından `smoke-backup-zip-import.mjs` manuel kategoriden çıkarılıp `full/release` içine alındı. Yeni kayıt testi eklendi. **330 benzersiz otomatik kontrol**, tam ve pre-main kontrollerinin tamamını içeriyor. Registry testleri 11/11 PASS.
- Demo ZIP import smoke **yeni 2.5.1 sürümünde** PASS: A/B/C fixture yeniden üretimi, SQLite quick_check, tekrar import reddi, güvensiz ZIP yolu reddi, mevcut veriye dokunmama. Demo dağıtım dosyaları değiştirilmedi.
- Sürüm hazırlığı: `npm run version:bump -- patch` → Desktop ve iki Android ürün **2.5.1**, `androidVersionCode=30`; ayrı web modülü sürümü **2.5.0** (web/PHP API değişikliği yok). `version:check` ve ürün sürüm testleri 6/6 PASS, `git diff --check` PASS.
- Otomatik release'e dahil olanlar: responsive-shell, stok ihtiyaç UI, SEO/pazarlama, SettingsPlatform hata bildirimi, checkout validation ve üyelik/kargo/desktop checkout, dashboard, demo-data, gerçek ZIP import, Windows demo restore smoke, Bayi/Companion birim+lint+APK, typecheck, strict lint/knip/design/architecture, web/desktop/release paketleme. Fiziksel cihaz ve bağımsız çoklu-site kontrolleri bilerek otomatik pakette yok.
- Kalan yayın öncesi/sonrası **manuel kabul**: gerçek Windows x64/x86 kurulum ve açılış, Windows ZIP restore (#87), gerçek Android kamera/bildirim/güncelleme ve tam UI kabulü, fiziksel QR yazıcı, temiz Desktop→Web ilk senkron ACK, gerçek sağlayıcı erişimi, dış site kontrolü. Önceki Android galeri notunda KBS fixture rotası açılamamış, Market/Raporlar/Görünüm tam manuel smoke beklentileri mevcut UI ile uyuşmamıştı; bu tur hedefli buton ve Bayi testleri geçti, fakat eski tam fiziksel smoke için PASS iddiası yok.
- Site durumları: Teknikel ve BlackSea çalışma ağaçları temiz; Gündoğdu'da `assets/site/scenes/hero.scene.json` ve `canonical/public/assets/site/scenes/hero.scene.json` için **önceden var olan, ilişkisiz, commit edilmemiş iki değişiklik** bulunuyor. Bu dosyalar korunacak, release temizlik adı altında silinmeyecek.
- Kullanıcı `npm run verify:release` çalıştıracak. Sonuç temizse `pack:release`, `release:check`, 2.5.1 örnek ZIP/sitelerin güncellenmesi, gerekli bağımsız site deployment'ları ve kontrollü Git kapanışı yapılacak. Bu anda release verify, installer dağıtımı, commit/push/deploy **yapılmadı**.

## 2.5.1 release test kırıkları onarıldı — 24 Kasım 2026

- Kullanıcının `artifacts/verify/2026-11-23T20-28-47-479Z.json` raporunda 319 PASS / 9 FAIL / 2 SKIP bulunuyordu. Başarısız 9 testin ve zincirleme atlanan 2 paket kontrolünün **tamamı bağımsız hedefli tekrar koşusunda PASS**. Yeni tam `verify:release` raporu oluşturulmadı.
- Bayi `dealer-android-build`: manuel `--offline` zorlaması varken Android Lint'in `com.android.tools.lint:lint-gradle:32.4.1` bağımlılığı soğuk cache'de eksikti. Gradle çevrim içi çözümleme ile indirildi. `scripts/verification-registry.mjs` dosyasında Bayi test/build ve image-inspector device build komutlarından `--offline` kaldırıldı. Registry testi 12/12 PASS. Bayi Gradle `testDebugUnitTest assembleDebug lintDebug assembleRelease` (91 görev) PASS; çıktı 2.5.1 imzalı release APK.
- Companion `android-lint`, `android-release-apk` ve `android-release-aab`: çevrim içi Gradle `lintDebug assembleRelease bundleRelease` (84 görev) PASS; güncel 2.5.1 APK ve imzalı AAB üretildi.
- `showcase-website`: demo build yeni paylaşılan Nexa widget'ını üretmiş ama kanonik `web-site-template/public/assets/core/widget.js` ve `deneme` kopyası eski kalmıştı. Build ürettiği güncel widget ortak şablona alındı; manifest `web-site-template/tools/manifest.mjs --write`, demo `scripts/sync-demo-template.mjs --write` ile eşitlendi. Üç widget SHA-256 eşit. Template manifest kontrolü ve tam `smoke-showcase-website.mjs` PASS.
- `commerce-checkout-members` ve `web-dealer-portal` bağımsız tekrar koşularında PASS. Kaynak kod değişikliği gerektiren tekrarlanabilir hata görülmedi; ilk resmi koşudaki sebep için yakalanmış stdout/stderr yok.
- `web-storefront`: kısa bir deneyde kullanılan **haricî 90 sn sınırı** tarayıcıyı kapattı, bu sonuç ürün arızası sayılmadı. Ardından diğer ağır işler kapalıyken **zaman sınırı olmadan** `smoke-web-storefront.mjs` PASS (403/422/409/429/503, hesap, CSP/XSS, gizlilik, stok, yeniden deneme, kargo, mobil).
- `package-desktop-dir`: `npm run pack:dir -w @yardimci-asistan/desktop-app` PASS, `desktop-package`: `node scripts/smoke-desktop-package.mjs` PASS. Paket, güncel Companion APK'yı dahil ediyor.
- Sonraki kapı: operatör `npm run verify:release` çalıştırmalı; hedef 330/330/0. Resmi tam başarı olmadan `pack:release`, Windows installer/feed etkinleştirme, demo ZIP dağıtımı, sitelere deploy ve Git push yapılmadı. Kamera modülü bu sürümün dışında.
- Site tarafında değişen ortak widget manifesti, asıl yayın sırasında demo ve diğer site şablon dağıtımlarıyla eşitlenmeli. Gündoğdu'daki önceki yerel iki sahne JSON değişikliğini koru.

## Release 2.5.1 — web dealer/storefront doğrulama arızası incelemesi (24 Kasım 2026)

- İkinci tam release raporu: `artifacts/verify/2026-11-23T21-21-19-632Z.json` — **328 PASS / 2 FAIL / 0 SKIP**. Hatalar yalnız `web-dealer-portal` (8.387 sn) ve `web-storefront` (48.324 sn). Mevcut raporun `error` alanı boştu; eski verify altyapısı gerçek stderr/stdout'u saklamadığından bu iki arızanın kesin nedeni kanıtlanamıyor.
- `node scripts/verify.mjs --check web-dealer-portal`: **5/5 PASS** (bağımlılıklarıyla birlikte). Rapor: `artifacts/verify/2026-11-23T21-59-55-360Z.json`.
- `node scripts/smoke-web-storefront.mjs`: **iki ardışık tam koşu PASS** (~58 sn ve 61 sn). `node scripts/verify.mjs --check web-storefront`: **4/4 PASS**, web-storefront smoke dahil (~58 sn). Rapor: `artifacts/verify/2026-11-23T22-05-24-121Z.json`.
- Paylaşılan uygulama/checkout/web protokol kodunda bu hatalar için kanıtlanmış bir regresyon bulunmadı; sırf testi yeşile çevirmek için assertion kaldırılmadı, timeout gevşetilmedi ve otomatik retry eklenmedi.
- `scripts/verify.mjs`: Her kontrolün çıktısı canlı olarak terminale aktarılırken geçici, yalnız yerel loga da yazılıyor. Başarılı kontrolde log kaldırılıyor; başarısız kontrolde `artifacts/verify/failure-logs/<run-id>/<check-id>.log` yolunda **0600 erişimli** saklanıyor ve JSON raporuna `log_path` ekleniyor. Bir sonraki olası arızada gerçek hata okunabilir.
- `scripts/test-verification-registry.mjs` yeni test ile hata/başarı log yaşam döngüsünü ve 0600 yetkisini doğruluyor. **13/13 PASS**; `git diff --check` PASS.
- Bu çalışmalar **yeni tam 330/330 resmi release raporu oluşturmaz**. Özgün tam koşuda geçen 328 kontrol ve ayrı koşularda geçen son 2 kontrol birbirine karıştırılmamalı. Yayın, deploy, commit ve push henüz yapılmadı. Kamera modülü bu sürüm dışında.

## 2.5.1 predeploy hazırlığı (24 Kasım 2026)

Demo yeteneklerine 8 ana kart altında 14 alt işlev ve iki iş akışı eklendi; 40 kanonik yetki değişmedi. Showcase ve landing senaryo browser smoke PASS. A/B/C demo 2.5.1 ZIP'leri yeniden üretildi; Teknikel D eski arşiv şema uyumluluğu doğrulanarak korundu. Windows x64/x86, iki Android APK ve 117 dosyalık web modülü pack:release + release:check PASS. Wine PATH eksikliği kullanıcı launcher'ıyla çözüldü. BlackSea/Teknikel/Gündoğdu ortak widget ve manifestleri merkezle eşitlendi; cross-site 5/5 ve site readiness 7/7 PASS. Ayrıntılı devir: docs/dev/RELEASE_2_5_1_PREDEPLOY_2026_11_24.md. Canlı deploy, commit/push ve feed aktivasyonu yapılmadı.

## Release 328/330 oturum testlerinin onarımı (24 Kasım 2026)

commerce-checkout-members ve web-dealer-portal kırıkları, başarılı login sonrası ikinci session GET'ine bağımlı tarayıcı oturumu geçişi kaldırılarak onarıldı. Backend başarılı login'de doğrulanmış profil döndürüyor; ortak frontend doğrudan authenticated duruma geçiyor. Resmi hedefli verify: commerce-checkout-members 4/4, web-dealer-portal 5/5 PASS; iki senaryo birlikte iki kez daha PASS. Ek customer-account, storefront, hesap state, dört site parity ve site readiness kontrolleri temiz. Güncel web modülü ve yerel deploy planı yeniden hazırlandı; Windows/Android binary sürümleri/hashi aynı. Tam 330/330 release yeniden çalıştırılmadı, canlı deploy yapılmadı. Ayrıntı: docs/dev/RELEASE_2_5_1_PREDEPLOY_2026_11_24.md.
