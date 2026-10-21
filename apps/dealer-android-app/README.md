# Yardımcı Asistan Bayi

Bağımsız native Java Android pilotu. `applicationId`: `com.yardimciasistan.dealer`,
minimum SDK 26. Personel Companion APK'sı ve izinleriyle ortak runtime kullanmaz.
Sunucu/işletme/marka ve yayın anahtarı APK'ya gömülmez.

## Demo pilot indirmesi

Demo /kurulum/ sayfasında Bayi Android, sürümlü pilot APK olarak bulunur.
Bu dosya **debug imzalı test sürümüdür**, üretim ya da uygulama mağazası sürümü değildir.
Companion ve Bayi Android, aynı canonical product-version.json içindeki versionName ve
androidVersionCode değerlerini kullanır. Demo deploy, APK build metadata ve SHA-256
eşleşmesini doğrular. Bayi APK'sını dağıtmadan önce birim/lint/derleme testleri çalışır.

## Derleme ve kurulum

```sh
npm run verify:check -- dealer-android-build
adb -s CIHAZ_SERI_NO install -r apps/dealer-android-app/build/outputs/apk/debug/yardimci-asistan-bayi-debug.apk
adb -s CIHAZ_SERI_NO shell am start -n com.yardimciasistan.dealer/.DealerActivity
```

Registry mevcut doğrulanmış Gradle wrapper'ını `--dealer` seçimiyle kullanır.
İlk bağımlılık hazırlığı gerektiğinde aynı wrapper `--offline` olmadan çalıştırılabilir.
APK debug imzalı pilot yapıdır; genel mağaza/release dağıtımı için imza yapılandırması gerekir.

## İlk bağlantı

Firma yöneticisi masaüstünde aktif bayinin web erişimini açar, davet üretir ve mevcut
özel bayi yayınını sunucuya eşitler. Bayi, **web modülünün tam HTTPS adresini** ve aynı
origin'e ait davet bağlantısını girer. Örnek adres yalnız yer tutucudur; uygulamada
varsayılan bir firma yoktur. Davet fragment'i yalnız claim gövdesinde taşınır; saklanmaz.

Web modülünde `api/dealer/orders.php` ve `receipt.php` dahil bu sürümün API dosyaları,
masaüstünde genişletilmiş bayi yayını bulunmalıdır. Bu çalışma sunucuya deploy yapmaz.
Cookie oturumu mevcut sekiz saatlik süreyi ve erişim revizyonunu kullanır; yeni davet
mevcut mekanizmayla üretilir. Uygulama publication/sync anahtarı istemez.

## Kullanım ve çevrimdışı davranış

- Katalog: görseller, kategori/marka filtreleri, stok kodu ve Türkçe arama; favori filtresi.
- Ürün detayı: açıklama, bayiye çözümlenmiş fiyat ve kesirli miktar desteği.
- Sepet: çoklu ürün, miktarı uygulama/çıkarma, para birimi kontrolü; elden teslim veya
  mevcut allowlist'e göre adrese gönderim; adres ve not cihazda korunur.
- Siparişler: aktarım bekleyen talep ile canonical alındı/onaylandı/tamamlandı/iptal
  durumları ayrıdır. Geçmiş ürünleri güncel katalog fiyatlarıyla yeniden sepete ekler.
- Hesabım: bayi firma adı/sunucu, sistem/açık/koyu görünüm ve sunucuda oturum kapatma.

Son katalog ve görseller (indirildiyse), sepet, favoriler ve son sipariş görünümü cihazda
kullanılabilir. Ekranlar son yenileme zamanını gösterir; offline bilgi güncel sunucu
onayı sayılmaz. 401 alındığında önbellek ekranları kapanır; aynı bayi yeni oturumla taslağına
döner. Başka bayi/sunucuya geçiş önceki hesabın fiyat ve sipariş önbelleğini temizler.
Gönderilmemiş sepet/bekleyen deneme varsa şifreli, hesap ve sunucu kapsamlı taslak olarak
korunur; yalnız aynı hesapla tekrar girişte geri açılır. Başka bayi bu taslağı göremez.
Çıkış güncel hesabı temizler; başka hesapların saklanan gönderilmemiş taslaklarını silmez.

İlk gönderimden **önce** değişmez JSON ve idempotency key atomik kaydedilir. Başarısı
belirsiz deneme otomatik gönderilmez veya silinmez; Sepet'te açıkça gösterilir, aynı
kimlikle kullanıcı tarafından tekrar denenir. Her gönderim önce oturum kapsamındaki
makbuzu sorgular; sunucu yanıt kaybında/yeni oturumda eski makbuz dönerse tekrar POST
edilmez. 422 ile kesin reddedilen talep düzenlenebilir. Gönderimi belirsiz talep varken
çıkış, önce Sepet'e yönlendirir. Oturum kapatma internet gerektirir; başarısızsa açık hata
verir ve veriyi temizlemez.

Cihaz verisi Android Keystore AES-GCM ile `noBackupFilesDir` içinde şifreli, atomik
saklanır. Backup/cihaz transferi kapalıdır. Görseller public HTTPS kaynaklarından ayrı,
cookiesiz ve boyut sınırıyla alınır; indirilemezse yer tutucu gösterilir.

## Otomatik cihaz fixture testi

```sh
npm run verify:check -- dealer-android-device --include-manual
```

Tek bağlı cihazı veya `ANDROID_SERIAL` seçimini kullanır. Üretim paketlerinden ayrı
`com.yardimciasistan.dealer.fixture` kurar; sentetik, şifreli katalog/sepet/sipariş
önbelleğiyle native ekranları çalıştırır. Geçerli oturum/sunucu yoktur. Ürün detayı,
favori, miktar/toplam, tekrar sipariş, çevrimdışı yeniden açma ve başarısız gönderimde
sabit retry JSON'u sınanır. Fixture sonunda kaldırılır, cihazın uyku durumu geri alınır.
Bu test gerçek bayi erişimi veya canlı fiyat/sipariş senkronizasyonu kanıtı değildir.
Sonuç `artifacts/dealer-android/native-fixture.txt` altına yazılır.

## Fiziksel pilot akışı

1. Companion ve Bayi APK'larını birlikte görün; Bayi'yi açıp web adresi+davetle giriş yapın.
2. İki ayrı bayiyle fiyat izolasyonunu ve kategori/marka/stok kodu aramasını kontrol edin.
3. Ürün detayı, favori, iki ürünlü sepet, miktar ve adres/not girişini 320–360dp genişlikte
   ve büyük yazı/açık-koyu temalarda deneyin.
4. Uçak modunda sepeti değiştirin; uygulamayı kapatıp açın. Gönderimi deneyin: bekleyen
   talep görünür kalmalı. Bağlantıyı açıp aynı talebi tekrar deneyin; masaüstünde tek sipariş olmalı.
5. Sunucu kabulünden hemen sonra bağlantıyı keserek yanıt kaybını ve uygulama yeniden
   başlatıldıktan sonra aynı makbuzun kurtarılmasını kontrol edin.
6. Masaüstünü eşitleyin; siparişin alındı/onaylandı/iptal veya fulfillment sonrası
   tamamlandı durumlarını yenileyin. Sadece talep gönderimi satış/tahsilat/stok üretmemeli.
7. Bayi oturumlarını iptal edip yayını eşitleyin. Yenileme 401 sonrası katalog kapanmalı;
   yeni davetle aynı bayi taslağına, başka bayi ise kendi boş önbelleğine dönmeli.
8. Geçmişten sepete ekleyin, oturumu kapatın; sunucu oturumu ve cihaz verisi temizlenmeli.

Fiziksel cihaz, gerçek HTTPS hosting, OEM Keystore/backup davranışı ve gerçek ürün
görsel kaynakları ayrıca doğrulanır; yerel/JVM testleri bu kanıtın yerine geçmez.
