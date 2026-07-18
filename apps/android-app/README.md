# Android Operasyon Paneli

Yardımcı Asistan Android uygulaması, işletme sahibinin telefondan hızlı takip ve
karar vermesi için tasarlanmış koyu temalı companion uygulamadır. Masaüstü ana veri
kaynağı olmaya devam eder.

## Ekranlar

Alt navigasyonda beş operasyon ekranı bulunur:

- **Bugün:** talepler, rezervasyonlar, işler, boş oda/masa, hesap bekleyen masalar ve
  hazır cevaplar.
- **Müşteri:** yeni talepler, müşteriler ve cevap bekleyenler; arama, WhatsApp,
  onay/red, cevaplandı ve rezervasyona çevirme kısayolları.
- **Pansiyon:** rezervasyon, oda durumu ve günlük iş yönetimi.
- **Restoran:** masa durumu, aktif adisyonlar, menüden ürün ekleme, adet/satır
  yönetimi ve servis/hesap/kapatma akışı.
- **Mesajlar:** hazır mesajı gösterme, kopyalama, WhatsApp uygulamasında açma ve arama.

Bağlantı adresi, güvenlik anahtarı, son senkron zamanı ve telefon işlem sonuçları ayrı
`Ayarlar` ekranında gösterilir.

Uygulama ön plandayken canlı özet yaklaşık 15 saniyede bir otomatik kontrol edilir.
Sunucu revision'ı değişmediyse tam snapshot indirilmez. Son başarılı JSON özeti
`SharedPreferences` cache'inde tutulduğu için uygulama ağ yokken de son veriyi açabilir.
`JobScheduler`, uygulama kapalıyken bekleyen action outbox'ını göndermek ve özeti
yenilemek için en az 15 dakikalık periyotta çalışır; kesin zaman Android'in pil ve ağ
politikasına bağlıdır.

Telefon kimliği normal APK güncellemelerinde uygulamanın kalıcı ayarlarında korunur.
Bu ayar henüz yoksa kimlik, Android'in uygulama/imza/cihaz kapsamlı `ANDROID_ID`
değerinin tek yönlü özetinden üretilir. Bu sürümle oluşturulan kararlı kimlikten sonra
aynı paket ve aynı imzalama anahtarıyla yapılan güncelleme, veri temizleme veya yeniden
kurulum aynı fiziksel telefon için yeni bir masaüstü kaydı oluşturmaz. Eski rastgele
kimliğe sahip kurulum normal APK güncellemesinde mevcut kaydını korur; yalnız uygulama
verisi ayrıca silinirse kararlı kimliğe bir kez geçer. Fabrika ayarları, Android
kullanıcısının değişmesi ya da APK imzalama anahtarının değişmesi yeni cihaz kabul
edilir. Dağıtım APK'larının imzalama anahtarını yedekleyin ve sonraki sürümlerde mutlaka
aynı anahtarı kullanın.

## Veri Akışı

Android SQLite'a veya PC'ye doğrudan bağlanmaz:

```text
Android → hosting action queue → Desktop uygular
        → Desktop güncel snapshot yayınlar → Android canlı veriyi çeker
```

Gönderilen işlem önce `Bekliyor` görünür. Masaüstü uyguladıktan sonra `Uygulandı`,
uygulayamazsa kullanıcı dostu hata metniyle `Uygulanamadı` olur. Masaüstündeki receipt
tablosu aynı action kimliğinin iki kez uygulanmasını engeller.

İşlem kimliği ağ çağrısından önce üretilir ve işlem telefondaki kalıcı outbox'a yazılır.
Yanıt kaybolur veya uygulama kapanırsa aynı kimlik ve payload yeniden gönderilir; sunucu
ve masaüstü idempotency kontrolleri işlemin iki kez uygulanmasını engeller. Bir kayıt
masaüstünü beklerken yeni değişiklik alınmaz; güncel snapshot çekildikten sonra devam edilir.
Outbox kaydı normalize hosting endpoint'i ve güvenlik anahtarı parmak izine bağlıdır;
bekleyen işlem varken bağlantı başka bir firmaya değiştirilirse eski işlem yeni hedefe
gönderilmez.

Değiştirilebilir kayıtların payload'ı snapshot'taki `updated_at` değerini beklenti olarak
taşır. Kayıt masaüstünde bu sırada değişmişse işlem uygulanmaz ve kullanıcıdan canlı veriyi
yenilemesi istenir.

Yeni masa için `adisyon aç + ürün ekle` iki bağlı action olarak saklanır. Ürün action'ı,
adisyon açma action'ının masaüstü receipt kaydı ve o action kimliğinden türetilen aktif
adisyon olmadan uygulanmaz.

## Komutlar

Kök dizinden APK üretmek için:

```bash
npm run build:android
```

Canlı bağlantı değerlerini her APK güncellemesinde yeniden girmemek için bir kez
yerel derleme yapılandırmasını oluşturun:

```bash
YARDIMCI_ASISTAN_ANDROID_WEB_MODULE_URL="https://yardimciasistan.alwaysdata.net/yardimci-asistan" \
YARDIMCI_ASISTAN_ANDROID_SYNC_SECRET="üretim-sync-anahtarı" \
npm run configure:android:connection
```

Komut `apps/android-app/connection.local.json` dosyasını `0600` izinle oluşturur.
Dosya git tarafından yok sayılır; sonraki derlemeler URL ve anahtarı APK içine sabit
olarak gömer. Tasarım süresince hem URL hem anahtar gömülüyse APK `embedded connection
locked` modunda üretilir. Bu mod her normal uygulama açılışında gömülü değerleri yeniden
uygular; eski geliştirme adresleri ve normal APK güncellemelerinden kalan ayarlar bağlantıyı
değiştiremez. Ayarlar ekranı bağlantının APK içinde hazır olduğunu salt okunur gösterir.
ADB smoke testleri açıkça işaretlenmiş geçici debug bağlantısıyla çalışır ve test sonunda
gömülü bağlantıyı geri yükler. UI testi temiz başlangıç hazırlarken uygulama önbelleğini
ve test verilerini sıfırlar ancak kalıcı telefon kimliğini korur. Test kurucusu imza
uyumsuzluğu görürse uygulamayı otomatik kaldırmaz; veri kaybını önlemek için hata verir.

Web'e dağıtılacak son APK hazırlanırken `connection.local.json` kaldırılmalı, bağlantı
ortam değişkenleri temizlenmeli ve APK yeniden üretilmelidir. Build çıktısında
`android-connection-mode: editable connection` görülmeden genel dağıtım yapılmamalıdır.

APK içine gömülen bir anahtar tersine mühendislikle çıkarılabilir. APK işletme dışına
dağıtılırsa hosting anahtarını döndürün ve yeni APK yayınlayın.

Çıktı:

```text
apps/android-app/build/outputs/apk/debug/yardimci-asistan-debug.apk
```

Bu proje Gradle kullanmadan kurulu Android SDK araçlarıyla native Java APK üretir.
Java 8 kaynakları `javac` ile derlenir, `d8` ile dex/desugar edilir, ardından APK
`zipalign` ve `apksigner` ile hazırlanır.

Hosting ve demo operasyon verisiyle komut satırı smoke testi:

```bash
npm run smoke:android-hosting
```

Bağlı telefonda gerçek UI ve action queue smoke testi:

```bash
npm run smoke:android-device-ui
```

ADB üzerinden ekran görüntüsü, UI ağacı ve aynalama:

```bash
npm run android:screenshot
npm run android:dump
npm run android:mirror
```

Telefonun yerel PHP sunucusuna erişmesi için script mümkünse `adb reverse` kullanır;
aksi halde aynı ağdaki PC adresini verir. Web modül alanına modül kökü, `/api` klasörü
veya tam `/api/sync.php` adresi girilebilir.

Canlı hostingde HTTPS kullanın. Senkron anahtarı JSON gövdesine veya URL'ye değil,
`X-YA-Sync-Secret` header'ına gönderilir.
