# Android Bağlantı Planı

İlk Android companion hedefi masaüstü uygulamanın küçük kopyası değildir. Telefon uygulaması işletme sahibine hızlı özet, yeni talep takibi, arama ve WhatsApp kısayolu sağlar.

## İlk Sürüm Kararı

İlk çalışan mod `hosting_limited` olacaktır.

```text
Android telefon
  ↓ HTTPS
Firma hosting web modülü
  ↓
Özet ve yeni talepler
```

Bu seçim aynı Wi-Fi ağına bağlı olma zorunluluğunu kaldırır ve gerçek telefonda test etmeyi kolaylaştırır. Android sadece gerekli özetleri ve talep dönüş aksiyonlarını görür; QR menü düzenleme, oda/masa detay yönetimi ve ayar ekranları masaüstü uygulamada kalır.

## Mevcut Uygulama Akışı

Android uygulamasında `Web modül adresi` ve `Sync anahtarı` alanları bulunur.
Anahtar kaynak koda sabit yazılmaz; uygulama içinde girilir ve cihaz
tercihlerinde saklanır. Test sırasında istenirse adb intent extra ile de
aktarılabilir:

```bash
adb shell am start \
  -n com.yardimciasistan.android/.MainActivity \
  --es ya_web_module_url http://192.168.1.50:8080 \
  --es ya_sync_secret change-this-secret
```

Yerel geliştirme ortamında bu akışı tek komutla hazırlamak için:

```bash
npm run android:phone-test
```

Bu komut demo taleplerini web modülüne yükler, PHP server'ı telefondan
erişilebilir LAN adresiyle açar, adb cihazı varsa debug APK'yı kurar ve
uygulamayı `ya_web_module_url` / `ya_sync_secret` extra değerleriyle başlatır.
ADB extra değerleri uygulama tercihlerine kaydedilir; sonraki açılışta aynı
telefon üzerinde bağlantı bilgisi yeniden girilmeden otomatik canlı özet
çekilebilir. Uygulama web modül kök adresini, `/api` klasörünü veya tam
`/api/sync.php` endpointini kabul eder.
USB bağlantısında mümkünse `adb reverse` kullanılır; bu durumda uygulama
`http://127.0.0.1:<port>` üzerinden PC'deki PHP server'a erişir. ADB yoksa
terminalde yazdırılan LAN adresi uygulamadaki `Web modül adresi` alanına elle
girilebilir.

Uygulama `api/sync.php` dosyasındaki `android_summary` aksiyonunu çağırır.
Bu aksiyon talepleri senkronlandı olarak işaretlemez; sadece sınırlı özet ve
talep listesini döndürür. Seçili talepteki Onayla, Reddet ve Cevaplandı
işlemleri `update_request_status` aksiyonuyla hostingdeki talep durumunu
günceller.

PC uygulaması ana paneldeki `Android'e Yayınla` komutuyla local SQLite
dashboard özetinden bir Android snapshot oluşturur ve `publish_android_snapshot`
aksiyonuna gönderir. Web modülü bu veriyi `data/android-snapshot.json` içinde
tutar; Android `android_summary` cevabındaki `operations` ve `daily_tasks`
alanlarından bugünkü işler, boş oda/masa ve bekleyen onay bilgisini okur.

Linux geliştirme ortamında yerel PHP sunucusu ile telefon testi yapılacaksa
telefonun erişebileceği yerel IP kullanılmalıdır. Üretimde HTTPS adres
kullanılmalıdır.

## Güvenlik

- Android istekleri firma web modülündeki sınırlı takip endpointlerine gidecek.
- İlk sürümde firma bazlı `sync_secret` benzeri bir güvenlik anahtarı kullanılacak.
- Anahtar uygulama kaynak koduna sabit yazılmayacak; ilk kurulum/eşleşme adımında girilecek veya QR ile aktarılacak.
- Telefon kaybolursa hosting tarafındaki anahtar değiştirilebilecek.

## Sonraki Mod

`local_network` modu sonraki faza ayrıldı.

```text
Android telefon
  ↓ yerel ağ
PC masaüstü uygulaması
```

Bu mod PC açıkken daha hızlı yerel takip sağlayabilir; ancak ilk sürümde ağ keşfi, eşleşme ve güvenlik yükünü artırdığı için temel yol değildir.
