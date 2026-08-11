# Yardımcı Asistan — Windows + Hosting Saha Testi

Bu kontrol listesi, kod tarafındaki masaüstü kullanılabilirlik ve senkron sağlamlaştırma turu tamamlandıktan sonra gerçek hedef bilgisayarda yapılacak son doğrulama içindir.

## Amaç

Tek bir gerçek Windows bilgisayar ve gerçek firma hostingi üzerinde aşağıdaki zinciri doğrulamak:

`Hosting web modülü → masaüstü otomatik senkron → günlük operasyonlar → WhatsApp Web → yerel kayıt/yedek`

Bu test sırasında güvenlik anahtarını veya API anahtarlarını sohbet ekranına göndermek gerekmez.

## 1. Kurulum ve İlk Açılış

- Windows installer ile uygulamayı kurun.
- Uygulamanın normal kullanıcı yetkisiyle açıldığını doğrulayın.
- Firma adı ve kullanılacak modüllerin doğru göründüğünü kontrol edin.
- Uygulamayı kapatıp yeniden açın; ayarların ve yerel kayıtların korunduğunu doğrulayın.
- `Ayarlar → Gelişmiş Ayarlar → Bu Bilgisayar` bölümünde yerel kayıt dosyası ve yedek klasörünün oluştuğunu kontrol edin.

## 2. Web Modülü Bağlantısı

`Ayarlar → Gelişmiş Ayarlar → Web Bağlantısı` bölümünü açın.

1. Gerçek hosting web modülü adresini girin.
2. Hostingde kullanılan güvenlik anahtarını girin.
3. `Web Bağlantısını Dene` düğmesine basın.

Başarılı sonuç:

> Web bağlantısı hazır. Güvenlik anahtarı ve SQLite senkron protokolü doğrulandı.

Bu kontrol yalnız `capabilities` isteği yapar. Talep çekmez ve veri yayınlamaz.

### Hata durumunda kaydedilecek bilgi

Gizli anahtarı paylaşmadan yalnız şunları kaydedin:

- Ekranda görünen hata mesajı
- Web modülü adresinin alan adı + yol kısmı
- Testin yapıldığı saat
- Gerekirse ekran görüntüsü

## 3. Otomatik Senkron

- `Otomatik eşitle` seçeneğini açın ve ayarları kaydedin.
- Ana ekranda senkron durumunun hata vermeden hazır/güncel duruma geldiğini kontrol edin.
- Web sitesinden bir test müşteri talebi oluşturun.
- Talebin masaüstüne otomatik geldiğini doğrulayın.
- Gerekirse `Şimdi Eşitle` ile manuel kontrol yapın.
- İnterneti kısa süre kapatıp tekrar açın; uygulamanın kilitlenmeden offline/hata durumu göstermesini ve bağlantı geri gelince tekrar eşitleyebilmesini kontrol edin.

Not: Masaüstü HTTP senkron istekleri 15 saniyelik zaman aşımıyla korunur. Cevap vermeyen hosting isteği uygulamayı süresiz bekletmemelidir.

## 4. Pansiyon Akışı

Pansiyon modülü kullanılıyorsa:

- Yeni müşteri + doğrudan rezervasyon oluşturun.
- Oda atayın veya değiştirin.
- Giriş/çıkış ve oda durumlarını kontrol edin.
- `Oda Hesabı ve Tahsilat` bölümünden oda adisyonunu açın.
- Ödeme alın ve Kasa'ya otomatik işlendiğini doğrulayın.
- Çıkış yapın; oda ve kalan alacak davranışını kontrol edin.

### 4A. Android oda hesabı saha kontrolü

Android companion kullanılıyorsa bu kontrol için **masaüstü, Android APK ve hosting `api/sync.php` aynı güncel sürümde** olmalıdır.

- Masaüstünde giriş yapılmış bir konaklamanın açık oda hesabını ve pozitif kalan tutarını hazırlayın.
- Android'de `Pansiyon → Hesaplar` alanını açın; müşteri, oda, toplam, alınan ve kalan tutarın masaüstüyle eşleştiğini doğrulayın.
- `Ödeme Al` ile kalan tutarın bir bölümünü tahsil edin. İşlem masaüstüne ulaştıktan sonra hem oda hesabının kalan tutarının azaldığını hem Kasa gelirinin oluştuğunu doğrulayın.
- Android ekranını yenilemeden masaüstünde hesabı değiştiren ikinci bir tahsilat yapıp telefondaki eski bakiye üzerinden tekrar ödeme göndermeyi deneyin. Eski bakiye işlemi uygulanmamalı ve telefon canlı veriyi yenilemeye yönlendirilmelidir.
- Bakiye pozitifken `Çıkışı Tamamla` işleminin kullanılamadığını doğrulayın.
- Kalan tutarın tamamını tahsil edin; güncel Android verisinde bakiye sıfır olduktan sonra `Çıkışı Tamamla` ile konaklamayı kapatın.
- Masaüstünde oda hesabının kapandığını, konaklamanın `checked_out` olduğunu ve odanın uygun durumda tekrar boş göründüğünü doğrulayın.
- Aynı mobil action yeniden iletilirse ikinci ödeme veya ikinci çıkış kaydı oluşmamalıdır.

Mobilde zorla borçlu çıkış, ödeme geri alma, fiyat/indirim ve ek hesap kalemi düzenleme beklenmez; bu işlemler masaüstünde kalır.

## 5. Restoran Akışı

Restoran modülü kullanılıyorsa:

- Bir masada sipariş açın.
- Menüden ürün ekleyin; ayrıca `Siparişi Kaydet` adımı olmadan ürünün kalıcı kaldığını doğrulayın.
- Adet değiştirin ve ürün notu ekleyin.
- `Sipariş durumu` ile servis akışını ilerletin.
- `Ödendi / Kapat` ile adisyonu kapatın.
- Gelirin Kasa'da oluştuğunu doğrulayın.
- Telefon/yüz yüze bir masa rezervasyonu oluşturun ve Takvim'de göründüğünü kontrol edin.

## 6. Müşteri İşleri

- Yeni bir web veya manuel talep açın.
- Telefon/WhatsApp ana işlemlerinin görünür olduğunu kontrol edin.
- Rezervasyona çevirme akışını deneyin.
- `Diğer işlemler` altında cevaplandı/reddet/yeniden aç/sil seçeneklerinin çalıştığını kontrol edin.

## 7. Kasa

- `Gelir Ekle` ile tutar, tür ve açıklama girerek kayıt oluşturun.
- Varsayılan ödeme şeklinin `Nakit`, tarihin bugün olduğunu kontrol edin.
- `Ödeme şekli ve tarih` bölümünü açıp farklı değerle ikinci kayıt oluşturun.
- Son hareketlerin kısa listeyle başladığını ve `Tüm Hareketleri Göster` işleminin çalıştığını doğrulayın.
- Elle eklenen bir kaydı silin ve onay ekranını kontrol edin.

## 8. WhatsApp Web

WhatsApp modülü kullanılıyorsa:

- Mesajlar alanından WhatsApp Web çalışma alanını açın.
- QR/oturum girişini tamamlayın.
- Uygulamayı kapatıp yeniden açtıktan sonra oturum davranışını kontrol edin.
- Bir müşteri talebinden WhatsApp mesajı hazırlayıp gerçek gönderim adımına kadar ilerleyin.

WhatsApp Web'in dış servis davranışı değişebildiği için bu bölüm gerçek hedef bilgisayarda ayrıca doğrulanmalıdır.

## 9. Yedekleme ve Yeniden Açılış

- `Yedek Al` işlemini çalıştırın.
- Yedek dosyasının beklenen klasörde oluştuğunu doğrulayın.
- Uygulamayı kapatıp yeniden açın.
- Müşteriler, rezervasyonlar, kasa hareketleri ve açık operasyonların korunmuş olduğunu kontrol edin.

## Test Sonucu Nasıl Paylaşılmalı?

Bir sorun çıkarsa şu format yeterlidir:

- **Adım:** örn. `2. Web Modülü Bağlantısı`
- **Beklenen:** ne olmasını bekliyorduk
- **Olan:** ekranda ne oldu
- **Mesaj:** uygulamanın gösterdiği hata/metin
- **Ekran görüntüsü:** varsa

Güvenlik anahtarı, AI API anahtarı, WhatsApp oturum verisi veya kişisel müşteri verisi paylaşmayın.

## Geçiş Kriteri

Aşağıdaki dört alan gerçek bilgisayarda sorunsuz tamamlandığında v1 masaüstü saha doğrulaması tamamlanmış kabul edilebilir:

1. Web bağlantısı ve otomatik senkron
2. Pansiyon/restoran günlük ana operasyonları
3. Kasa ve yerel veri kalıcılığı
4. Windows kurulum + yeniden açılış + yedekleme

WhatsApp Web ayrıca doğrulanır ancak dış servise bağlı kırılganlıkları ana yerel veri zincirini bloke etmez.
