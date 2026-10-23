# Desktop ürün, müşteri ve menü veri aktarımı

Veri sahibi Desktop'tır. Ortak aktarım işlemi MarketProductsWorkspace ve
CustomersWorkspace ile Menü sayfasının ürün başlığındaki ikonlardan açılır.
Tek ModalSurface içinde solda araçlar ve tercihler, sağda dosya/eşleme,
hazırlık/önizleme, açık onay ve kalıcı sonuç görünümü vardır. İki panel kendi
kaydırmasını sahiplenir; dar görünümde aynı durum korunarak tek kolona geçilir.
Araç geçişi içe aktarma önizlemesini ve sonucunu korur; tercih/eşleme değişikliği
yeniden analiz gerektirir. Yayın veya stok
sayımı varsayılan olarak yapılmaz; yeni ürünler pasif taslaktır. Aktarım listesi
entity editörünün veya sipariş/finans işlemlerinin ikinci sahibi değildir.

## Sözleşme ve sahiplik

`data-transfer-contract.ts` renderer/preload/IPC sözleşmesidir. Saf varsayılanlar ve
kolon etiketleri shared paketindedir; renderer Electron runtime import etmez.
`data-transfer-format.ts` CSV, XLSX ve manifestli ZIP okuma/yazma sahibidir.
`data-transfer-service.ts` mevcut ürün, kategori, müşteri, menü ve stok sayımı
sahiplerini koordine eder. Önizleme aynı transaction-aware domain yazarlarını
kullanır ve bütün yazımları geri alır. Onaylanan plan sunucuda tutulur; renderer
uygulama için yalnız oturum ve önizleme revizyonunu gönderir. Başlangıçta veri
fingerprint'i, her satırda kimlik ve güncellik yeniden kontrol edilir.

Uygulama planlı satır transaction'ları kullanır. Kısmi sonuç açıkça raporlanır;
başarılı satırlar başarısız bir sonraki satır yüzünden kaybolmaz. Çift uygulama
engellenir, tamamlanan oturumun sonucu tekrar döner. Yeniden seçilen dosyalar
üründe ID/SKU/barkod/kaynak, müşteride ID/normalize telefon/vergi no ile eşleşir.
Kimliği olmayan kayıtlar bütün eşlenen içerikten türetilen anahtarla tekrar
üretimi önler; yalnız ad eşitliği hiçbir zaman birleştirme nedeni değildir.
Çakışmalar varsayılan olarak atlanır; kullanıcı güncellemeyi açıkça seçer.

Vergi, maliyet veya stok takibi bilinmiyorsa aktarım açıklaması doğrulama
beklendiğini saklar. Veritabanının sayısal yer tutucusu doğrulanmış sıfır vergi
veya maliyet sayılmaz; sonraki export bilinmeyen alanları boş verir. Fiyat brüt
olarak alınır, ikinci kez KDV eklenmez. Yayın için fiyat, açık vergi/stok tercihi,
birim, para birimi, aktiflik ve gerektiğinde onaylı stok sayımı gerekir.
Yayınlanabilir/engelli sayısı ve satır nedenleri onaydan önce gösterilir.
Menü ilişkisi açık tercih gerektirir; kaynak menü ilişkileri seçilirse kategori,
fiyat override, alerjen, etiket ve tüketim alanları mevcut menü yazarından geçer.

`menu` aktarım türü aynı katalog ürününün menü kapsamıdır; ikinci ürün modeli
veya yazarı değildir. CATALOG ve FOOD_MENU yetenekleri kaynak seçimi, okuma,
dışa aktarma ve uygulamada yeniden denetlenir. Menüden açılan işlem seçili
kategoriyi hedef olarak önerir; kategori seçilmediyse dosyadaki menü kategorileri
kullanılır. Menü kapsamı hedef kategori gerektirir; kaynak kategori seçeneğinde
kategorisi olmayan satır hatalıdır ve yalnız kataloğa sessizce yazılmaz.
Yeni menü kategorileri pasiftir; ürünün taslak/aktivasyon kuralları korunur.
Ortak ürün alanlarının güncellenmesi diğer satış kanallarını da etkileyebilir;
bu etki panelde açıklanır. Menü alanlarının eski ve yeni değerleri önizlenir.

Menü dışa aktarımı yalnız silinmemiş menü ilişkisi ve kategorisi bulunan ürünleri
alır; pasif taslakları da içerir. Filtreli kapsam sayfada seçili menü kategorisiyle
başlar ve aktarım panelinden değiştirilebilir; tüm kapsam kategori filtresini
kaldırır. Temel menü şablonu da menü kategorisi,
fiyatı, alerjen, etiket ve mevcutluk alanlarını içerir. Ürün ve menü ZIP'leri aynı
katalog kayıt modelini taşıdığından iki girişten de okunabilir; müşteri arşivleri
ayrı kayıt türü olarak kalır.

## Görseller ve arşiv

ZIP: `manifest.json`, `records.csv`, `assets/…`. Manifest biçimi
`yardimci-asistan-transfer-v1`; kayıt türü ve ürün kimliği/SKU, göreli asset yolu,
SHA-256 ve MIME bilgisini içerir. Görsel yalnız URL metni olarak dışa aktarılmaz.
Yerel orijinal arşiv okunur; uzak HTTPS görselleri public IPv4 adresine sabitlenen,
yönlendirmesiz, süre/boyut sınırlı indirme ile alınır. İçe aktarma önizlemesi
indirilen baytları saklar; uygulama başka içerik indirmez.

Mevcut ürün modelinin birincil `image_asset_path` alanı görüntüleme sahibidir.
Birden çok kaynak görselin kaybolmaması için aynı canonical ürünün
`image_original_assets_json` alanı, mevcut product-data-service arşivinde
saklanan değişmez orijinal dosyaları tanımlar. Bağımsız galeri/veri sahibi yoktur.
Görüntüleme için birincil normalize görsel üretilir; ZIP orijinal baytları korur.
Electron nativeImage WebP çözemeyen platformlarda `@napi-rs/image` WebP
çözücüsünün boyut kontrollü PNG çıktısı aynı normalizasyon sahibine verilir;
hem önizleme hem arşiv kabulü gerçek decode gerektirir.
Sıralı 1–12 fotoğraf işlemleri ve kapak sözleşmesi
[Product Photos V2](PRODUCT_PHOTOS_V2.md) sahibinde tanımlıdır. Tek kapak editörü
diğer orijinalleri korur; ZIP canonical sırayı ve SHA256 değerlerini taşır.
Arşiv temizliği referanslı orijinalleri korur. Şema yalnız güncel baseline'dadır;
geçmiş migration, başlangıç backfill'i veya gerçek DB'ye otomatik import yoktur.

## Güvenlik ve sınırlar

Dosya en fazla 32 MB; açılmış arşiv toplamı 128 MB; görsel 5 MB/25 milyon piksel;
10.000 kayıt, 128 kolon. ZIP açılımında gerçek üretilen baytlar sayılır, yinelenen
ve tehlikeli yollar reddedilir; diske genel ZIP extract yapılmaz. İçerik MIME ve
native görsel decode ile doğrulanır. CSV UTF-8 BOM ve noktalı virgül ile yazılır;
virgül ayracı da okunur. TR ve noktalı ondalık değerler desteklenir. XLSX hücre
tarihleri ISO güne dönüştürülür. CSV/XLSX dışa aktarımlarında formül hücresi
oluşturulmaz; aktarımın kaçış öneki geri okumada çözülür.

Dosyalar yalnız kullanıcının yerel kaydetme diyaloğunda seçtiği konuma yazılır.
Müşteri kimlik/pasaport/belge alanları ayrı bilinçli seçim olmadan export edilmez.
Sipariş, tahsilat, finans hareketi ve erişim/sync sırları export edilmez.
Sonuç raporu satır numarası/durum/açıklama içerir; müşteri değerlerini tekrar
kopyalamaz. Oturumlar renderer sahibine ve aktif DB'ye bağlıdır; lock, capability,
wholesale, online sales, menü ve stok gate'leri IPC ve işlemde korunur.

## Müşteri listesi

Dashboard/sync snapshot'ının 500 kaydı korunur. Müşteriler ekranı ayrı
`customer:list` sorgusunda 50'lik DB sayfaları, gerçek toplam/eşleşen toplam ve
tüm kayıtlar üzerinde arama/filtre kullanır. `customer:get`, snapshot'ta olmayan
müşteriyi aynı canonical CustomerWorkspace'e getirir. Export veritabanından
sayfalarla tüm kapsamı okur; renderer listesini kaynak almaz.

Registry kontrolleri: `data-transfer`, `data-transfer-ui`. İlk kontrol izole
SQLite, biçim/güvenlik, sayfalama, kanonik yazımlar ve geri okumayı doğrular.
Harici Teknikel kaynakları yalnız açık `--external-pilots` tercihiyle okunur.
UI kontrolü gerçek React bileşenlerini
ve gerçek izole DB işlemlerini transport adaptörüyle çalıştırır; native dosya
seç/kaydet diyaloğu ve canlı uzak görsel servisi bu tarayıcı kontrolünün kanıtı
değildir. Görseller `artifacts/screenshots/data-transfer/` altında tutulur.
