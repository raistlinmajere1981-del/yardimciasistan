# Android App

PC uygulamasının sade companion uygulaması burada geliştirilecektir.

Android uygulama hızlı takip, arama, WhatsApp'tan yazma ve temel onay işlemlerine odaklanacaktır.

## Komutlar

Kök dizinden APK üretmek için:

```bash
npm run build:android
```

Çıktı:

```text
apps/android-app/build/outputs/apk/debug/yardimci-asistan-debug.apk
```

Bu ilk sürüm Gradle gerektirmez; kurulu Android SDK `aapt2`, `d8`, `zipalign` ve `apksigner` araçlarıyla native Java APK üretir.

Gerçek telefonda yerel web modülüyle denemek için:

```bash
npm run android:phone-test
```

Bu komut demo veriyi hazırlar, PHP web modülünü LAN'da açar, cihaz adb ile
görünüyorsa APK'yı kurup uygulamayı doğru `Web modül adresi` ve `Sync anahtarı`
ile başlatır. ADB ile gelen bağlantı bilgileri uygulama tercihlerine kaydedilir;
sonraki açılışta tekrar yazmak gerekmez. Sadece script doğrulaması yapmak için:

```bash
npm run android:phone-test -- --once --no-adb --no-build
```

## İlk Ekran

- Yardımcı Asistan marka başlığı.
- Web modül adresi ve sync anahtarı alanları.
- `android_summary` endpointinden canlı yeni talep, toplam kayıt, bekleyen ve PC'ye aktarılan talep özetleri.
- PC uygulamasından web modülüne yayınlanan Android snapshot ile bugünkü işler, boş oda, boş masa ve bekleyen onay kartları.
- PC'den yayınlanan günlük iş listesini telefonda sade takip alanı olarak gösterme.
- Canlı talep listesi ve seçili talep detay kartı.
- Seçili müşteri talebi üzerinde ara, WhatsApp'tan yaz, onayla, reddet ve cevaplandı kısayolları.
- `update_request_status` aksiyonuyla onay, ret ve cevaplandı durumlarını firma web modülüne yazma.
- Bağlantı yoksa demo verisiyle güvenli fallback ekranı.

Yerel testte telefonun PC'deki PHP sunucusuna erişebilmesi için `localhost`
yerine PC'nin yerel ağ IP adresini kullanın.
`Web modül adresi` alanına web modül kök adresi, `/api` klasörü veya tam
`/api/sync.php` adresi girilebilir.
