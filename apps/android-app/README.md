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
