# Yardımcı Asistan Bayi

Bağımsız native Java Android uygulaması. `applicationId`: `com.yardimciasistan.dealer`,
minimum SDK 26. Companion APK'sı ve izinleriyle ortak runtime kullanmaz.
Sunucu/işletme/marka ve yayın anahtarı APK'ya gömülmez.

## Release dağıtımı

Companion ve Bayi Android, `product-version.json` içindeki aynı `version` ve
`androidVersionCode` değerlerini okur. Bayinin ikinci sürüm dosyası yoktur.
Release APK `yardimci-asistan-bayi-release.apk`; yayındaki adı
`YardimciAsistan-Bayi-Android-<version>.apk` olur. Debug yalnız geliştirme içindir
ve `-debug` suffix'i kullanır.

İki uygulama `apps/android-app/release-signing.gradle` üzerinden aynı harici,
kalıcı keystore yapılandırmasını kullanır. Yerel signing dosyası yalnız
`apps/android-app/keystore.properties` konumunda tutulur ve Git'e girmez.
Eksik/yanlış anahtar release doğrulamasını durdurur. Ayrıntılar
[`docs/ANDROID_DISTRIBUTION.md`](../../docs/ANDROID_DISTRIBUTION.md) içindedir.

```fish
npm run dealer:android:release-apk
npm run release:check
```

Bu release'ten önce yalnız test telefonunda bulunan eski debug/pilot APK'lar
kaldırılıp yeni release APK temiz yüklenir; imza uyuşmazlığında yerinde güncelleme
beklenmez. Kaldırma cihazdaki uygulama verilerini siler. Otomatik veri taşıma veya
eski imza uyumluluk katmanı bulunmaz. Gelecek sürümlerde aynı kalıcı release
keystore ve artan canonical versionCode kullanılmalıdır.

## İlk bağlantı ve ortak hesap

İlk kurulumda işletmenin tam HTTPS web modülü bağlantısını girin. Ardından normal
müşteri hesabının e-posta/şifresiyle giriş yapın. Hesap oluşturma, e-posta doğrulama ve
şifre kurtarma işletmenin Hesabım sayfasında yapılır. Yapılandırılmış Google/Facebook
sistem tarayıcısında açılır; tarayıcı state cookie'sini kendisi alır. Tek kullanımlık
kod cihazdaki PKCE verifier ile değiştirildiğinde bağımsız Android oturumu oluşur.
Davet bağlantısı, davet kullanma veya APK'ya gömülü işletme/sync anahtarı yoktur.

Online Satış sunucuda kapalıysa hesap erişimi kapanır. Normal müşteriler bayi
verilerine alınmaz ve açıklama görür. İlk gösterim, uygulamaya dönüş ve görünürken
periyodik yenileme güncel sunucu yetkisini doğrular. 401/403 özel ekranları kapatır.
Yerel oturum temizleme her zaman mümkündür. [Hesap sözleşmesi ve dış kurulum](../../docs/architecture/CUSTOMER_ACCOUNTS_V1.md)
SMTP/OAuth ayarlarını ve gerçek sağlayıcı/cihaz doğrulama sınırlarını tanımlar.

## Kullanım ve çevrimdışı davranış

- Katalog: görseller, kategori/marka filtreleri, stok kodu ve Türkçe arama; favori filtresi.
- Ürün detayı: açıklama, bayiye çözümlenmiş fiyat ve kesirli miktar desteği. Fotoğrafı
  incele: pinch/pan/çift dokunma, 90° dönüş, sığdır, çoklu fotoğrafta kaydırma.
  Normal/Detay/Kod okuma/Negatif/Kenar modları özgün dosyayı değiştirmez.
  Kamera veya galeriden yalnız cihazda yan yana/üst üste karşılaştırma, bağımsız
  zoom/dönüş/hizalama ve saydamlık. Karşılaştırma dosyaları özel geçici cache'tedir;
  API/AI isteğine girmez ve kapatınca temizlenir.
- Sepet: çoklu ürün, miktarı anında değiştirme/çıkarma, para birimi kontrolü; elden teslim veya
  mevcut allowlist'e göre adrese gönderim; adres ve not cihazda korunur.
- Sipariş öncesi **V2 sunucu teklifi** alınır: kesin bayi fiyatı, teslimat bedeli, havale
  hesabı ve iki zorunlu sözleşme görülmeden sipariş oluşmaz. Pazarlama izni isteğe bağlıdır.
  Teklif yalnız internet üzerinden alınır; çevrimdışı sepete ürün eklemek sipariş oluşturmaz.
- Siparişler: aktarım bekleyen talep ile canonical alındı/onaylandı/tamamlandı/iptal
  durumları ayrıdır. Onaylanan havale siparişi için numara, kesin tutar, banka talimatı,
  **Havale yaptım** bildirimi ve ödeme durumu sorgulama vardır; bildirim ödeme onayı değildir.
  Geçmiş ürünleri güncel katalog fiyatlarıyla yeniden sepete ekler.
- Ayarlar: Sistem/Açık/Koyu, dört renk tonu, %90–150 yazı, Normal/Yüksek kontrast,
  görünümü sıfırla ve hesap/oturumu kapat. Tercihler cihazda kalır; çıkışta korunur.

Son katalog ve görseller (indirildiyse), sepet, favoriler ve son sipariş görünümü cihazda
kullanılabilir. Ekranlar son yenileme zamanını gösterir; offline bilgi güncel sunucu
onayı sayılmaz. 401 alındığında önbellek ekranları kapanır; aynı bayi aynı hesabıyla yeni oturum açarak taslağına
döner. Başka bayi/sunucuya geçiş önceki hesabın fiyat ve sipariş önbelleğini temizler.
Gönderilmemiş sepet/bekleyen deneme varsa şifreli, hesap ve sunucu kapsamlı taslak olarak
korunur; yalnız aynı hesapla tekrar girişte geri açılır. Başka bayi bu taslağı göremez.
Çıkış güncel hesabı temizler; başka hesapların saklanan gönderilmemiş taslaklarını silmez.

Sunucu teklifi ve iki zorunlu kullanıcı onayı **öncesinde** idempotency/pending üretilmez.
Onaylandığında ilk gönderimden **önce** `quoteId`, havale yöntemi, sözleşme kabulü ve
değişmez JSON/idempotency key atomik kaydedilir. Başarısı
belirsiz deneme otomatik gönderilmez veya silinmez; Sepet'te açıkça gösterilir, aynı
kimlikle kullanıcı tarafından tekrar denenir. Her gönderim önce oturum kapsamındaki
makbuzu sorgular; sunucu yanıt kaybında/yeni oturumda eski makbuz dönerse tekrar POST
edilmez. 422 veya `quote_changed` ile kesin reddedilen talep yeni teklif/onaya döner. Gönderimi belirsiz talep varken
çıkış, önce Sepet'e yönlendirir. Sunucu çıkışı başarısızsa açık hata gösterilir; giriş ekranındaki yerel oturum temizleme internet olmadan kullanılabilir.

Cihaz verisi Android Keystore AES-GCM ile `noBackupFilesDir` içinde şifreli, atomik
saklanır. Backup/cihaz transferi kapalıdır. Görseller public HTTPS kaynaklarından ayrı,
cookiesiz ve boyut sınırıyla alınır; indirilemezse yer tutucu ve inceleyicide yeniden
dene gösterilir. İndirme 30 MiB, kaynak 100 MP, thumbnail cache 6 MiB, disk cache
64 MiB/120 dosya, iki decode işi ve ekran bitmap'i cihaz heap'ine göre en fazla
1024/1440/2048 piksel uzun kenarla sınırlıdır. Efektler tek arka plan işçisi ve son
istek nesliyle çalışır. EXIF yönü uygulanır; önceki bitmap'ler kapanışta bırakılır.

Sıralı `image_urls`, canonical ürün özgün arşivinden aynı `dealer_access` yayınıyla
gider. `api/product-media.php`, bu sürümün shared/PHP alanları ve masaüstü hazırlığı
birlikte güncellenmelidir. Yükleme onayları ürün/hash/hedef metadata'sıdır; yeni
galeri veya bağımsız senkronizasyon hattı değildir. Eksik yerel dosya fotoğrafsız
yayınlanabilir; bozuk hash veya başarısız yükleme mevcut işi tekrar denemeye bırakır.

## Otomatik cihaz fixture testi

```sh
npm run verify:check -- dealer-android-device --include-manual
```

Tek bağlı cihazı veya `ANDROID_SERIAL` seçimini kullanır. Üretim paketlerinden ayrı
`com.yardimciasistan.dealer.fixture` kurar; sentetik, şifreli katalog/sepet/sipariş
önbelleğiyle native ekranları çalıştırır. Aynı testte cihazın gerçek API istemcisi,
geçici ADB TLS bağlantısından yerel PHP/SQLite sunucusuna bağlanır; ortak giriş/yenileme,
bağımsız web çıkışı, masaüstünden bayi yetkisi/fiyatı/sipariş tekrarı, yetki kaldırma,
Online Satış kapat/aç ve oturum iptali sınanır. CA yalnız test bağlantısındadır;
cihazın güven deposu ve müşteri APK’sı değişmez. Ürün detayı,
favori, miktar/toplam, tekrar sipariş, çevrimdışı yeniden açma ve başarısız gönderimde
sabit retry JSON'u sınanır. Native pinch/pan/çift dokunma/kaydırma, beş filtre, büyük
örneklemeli görsel, EXIF, FileProvider kamera sonucu/iptali, bağımsız karşılaştırma,
overlay/alpha/reset, Activity yeniden oluşması ve 20 aç/kapat döngüsünde bitmap
bırakma sınanır. Kamera sonucu fixture tarafından simüle edilir; gerçek sensör kanıtı
değildir. Aynı kontrol API 27 (Android 8.1) emülatörü ve fiziksel cihazda çalışabilir. Fixture sonunda kaldırılır, cihazın uyku durumu geri alınır.
Bu test yerel gerçek API ve canonical test siparişini doğrular; üretim hosting’i,
gerçek Google/Facebook hesabı veya dış SMTP teslimatı kanıtı değildir.
Sonuç `artifacts/dealer-android/native-fixture-sdk<SDK>.txt`, native ekran görüntüleri
`artifacts/dealer-android/sdk<SDK>/` altına yazılır. Görseller sentetik TEST verisidir.

## Fiziksel pilot akışı

1. Companion ve Bayi APK'larını birlikte görün; Bayi'yi açıp işletme bağlantısını kaydedip aynı müşteri hesabıyla giriş yapın.
2. İki ayrı bayiyle fiyat izolasyonunu ve kategori/marka/stok kodu aramasını kontrol edin.
3. Ürün detayı, favori, iki ürünlü sepet, miktar ve adres/not girişini 320–360dp genişlikte
   ve büyük yazı/açık-koyu temalarda deneyin.
4. Uçak modunda sepeti değiştirin; uygulamayı kapatıp açın. Gönderim denemesi
   **pending oluşturmasın** (sunucu teklifi alınamadı). İnternete dönüp kesin teklifi
   inceleyin, zorunlu sözleşmeleri onaylayıp tek sipariş oluşturun.
5. Kabulden hemen sonraki yanıt kaybını ve uygulama yeniden başlatıldıktan sonra
   **aynı** makbuzun kurtarılmasını kontrol edin. Havale yaptım bildirimini yineleyin:
   işletme onayı yokken durum doğrulama bekliyor olmalı, iki bildirim olayına dönüşmemeli.
6. Masaüstünü eşitleyin; siparişin alındı/onaylandı/iptal veya fulfillment sonrası
   tamamlandı durumlarını yenileyin. Sadece talep gönderimi satış/tahsilat/stok üretmemeli.
7. Bayi oturumlarını iptal edip yayını eşitleyin. Yenileme 401 sonrası katalog kapanmalı;
   aynı hesapla yeniden giriş yaparak bayi taslağına, başka bayi ise kendi boş önbelleğine dönmeli.
8. Geçmişten sepete ekleyin, oturumu kapatın; sunucu oturumu ve cihaz verisi temizlenmeli.

Fiziksel cihaz, gerçek HTTPS hosting, OEM Keystore/backup davranışı ve gerçek ürün
görsel kaynakları ayrıca doğrulanır; yerel/JVM testleri bu kanıtın yerine geçmez.

### Ortak APK / işletme markası

Launcher adı Bayi Portalı, ikonu bütün kurulumlarda aynı, markasız katalog/kutu
sembolüdür. Giriş ve katalog ekranlarında yalnız bağlanılan işletmenin herkese
açık api/business.php bilgisindeki display_name ve isteğe bağlı logo_url
(root-relative aynı origin PNG/JPEG/WebP) kullanılır. Logo internet erişimi
kesildiğinde daha önce indirilmiş görsel önbelleğinden gösterilir; aynı
cihazda başka işletmeye geçiş eski işletmenin markasını göstermez. Bu
bilgilerin hiçbirinin müşteri kimliği, fiyat veya oturum yetkisi yoktur.

İşletmeye özel logo için web modülünün config/business.json dosyasında
logo_url alanına /assets/logo.webp gibi bir yol yazılır. Logo aynı HTTPS
sitede herkesin erişebildiği bir dosya olmalıdır. Tanımlanmazsa genel simge görünür.
Ana ekran kısayolu veya ayrı APK üretimi kullanılmaz.
