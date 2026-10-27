# Android release dağıtımı

Companion ve Bayi Android ayrı uygulamalardır. Kalıcı kimlikleri değişmez:

| Uygulama | applicationId | Release APK |
| --- | --- | --- |
| Companion | `com.yardimciasistan.android` | `apps/android-app/build/outputs/apk/release/yardimci-asistan-release.apk` |
| Bayi | `com.yardimciasistan.dealer` | `apps/dealer-android-app/build/outputs/apk/release/yardimci-asistan-bayi-release.apk` |

İki uygulamanın `versionName` ve `versionCode` kaynağı yalnız kökteki
`product-version.json` dosyasıdır. Sürüm değişikliği mevcut `version:set` /
`version:bump` komutları veya Admin Control Center ile yapılır. Debug build'ler
`-debug` suffix'i kullanır; release versionName suffix içermez. Bayi için ayrı
version.properties, package sürümü veya ikinci sürüm otoritesi yoktur.

## Tek harici release imzası

`apps/android-app/release-signing.gradle` iki Gradle projesi tarafından uygulanır.
Aynı kalıcı keystore kullanılır; Android çalışma zamanı, uygulama hesabı ve izinleri
bu nedenle birleştirilmez. Companion ve bayi runtime'ları ayrı kalır.

Ayarlar sırayla environment, Git tarafından yok sayılan
`apps/android-app/keystore.properties`, ardından Gradle kullanıcı ayarlarından okunur:

```text
YA_ANDROID_KEYSTORE_PATH
YA_ANDROID_KEYSTORE_PASSWORD
YA_ANDROID_KEY_ALIAS
YA_ANDROID_KEY_PASSWORD
```

Örnek alan adları `apps/android-app/keystore.properties.example` içindedir.
Gerçek dosya kaynak kontrolüne girmez. Bayi için ikinci bir signing dosyası
oluşturulmaz. Göreli keystore yolları her iki uygulamada Companion klasörüne göre
çözülür; repo dışında mutlak yol tercih edilir. Parolaları `-P...` argv'sine,
kaynak dosyasına veya loga yazmayın.

Mevcut release anahtarı varsa yeniden kullanın. Hiç yoksa repo dışında kalıcı
keystore'u etkileşimli olarak oluşturabilirsiniz; aşağıdaki komut hiçbir build veya
yayın yapmaz ve parolayı komut satırına yazdırmaz:

```fish
keytool -genkeypair -keystore /guvenli/konum/yardimci-asistan-release.p12 -storetype PKCS12 -alias yardimci-asistan -keyalg RSA -keysize 4096 -validity 10000
```

Özel anahtar ve parolaların güvenli yedeklerini koruyun. Sonraki sürümler aynı
anahtarla üretilir. Anahtarı değiştirmek sıradan sürüm artırma işlemi değildir.

## APK üretmeden yapılandırma kontrolü

```fish
node scripts/run-android-gradle.mjs --offline validateReleaseSigning
node scripts/run-android-gradle.mjs --dealer --offline validateReleaseSigning
```

Başarı ölçütü `release-signing-ready` ve exit code 0'dır. Bu görevler APK üretmez.
Eksik dosya/ayar, yanlış parola/alias veya Android debug sertifikası hata üretir;
sertifika ve parola değerleri yazdırılmaz. `preReleaseBuild` bu doğrulamaya bağlıdır;
imzasız veya eksik imzayla başarılı release üretilmiş gibi davranılmaz.

## Build komutları

```fish
npm run android:release-apk
npm run dealer:android:release-apk
```

AAB gerektiğinde Companion'ın mevcut `npm run android:release-aab` hattı korunur.
Gradle runner doğrulanmış dağıtım cache'ini ve Android SDK'yı kullanır. Güncel
kaynak yapılandırması compileSdk 37, targetSdk 36, minSdk 26'dır; JDK ve gerekli
Android SDK Build Tools kurulu olmalıdır. `ANDROID_HOME` / `ANDROID_SDK_ROOT`
ve varsayılan `~/Android/Sdk` keşfi desteklenir.

Toplu release paketleme, paket kontrolü ve deploy sırası
[`dev/RELEASE_WORKFLOW.md`](dev/RELEASE_WORKFLOW.md) içindedir. Yayındaki adlar:

```text
YardimciAsistan-Android-<version>.apk
YardimciAsistan-Bayi-Android-<version>.apk
```

## İmza ve paket doğrulama

`release:check` ve landing deploy aynı `scripts/lib/release-artifacts.mjs` sahibini
kullanır. Dört dağıtım dosyası bulunmadan imza aracı çağrılmaz. Kontrol sırasında
mevcut harici keystore'dan yalnız public sertifika özeti, kısa Gradle göreviyle
ignored `apps/android-app/build/release-signing/certificate.json` dosyasına yeniden
üretilir. Bu dosya sürüm veya imza otoritesi değildir; her kontrolde yenilenir.
Özel anahtar dışarı çıkarılmaz, sertifika bilgileri loga yazılmaz.

Her APK için Gradle output-metadata, gerçek APK package/versionCode/versionName,
non-debuggable durumu ve `apksigner verify` sonucu kontrol edilir. İmza, o anda
harici keystore'dan okunan sertifikayla eşleşmelidir. Son olarak dosya boyutu ve
SHA-256 hesaplanır. Kaynak dosya upload öncesinde değişirse deploy durur.

Resmî araç sözleşmesi: [apksigner](https://developer.android.com/tools/apksigner).

## Test telefonunda temiz geçiş

Bu release öncesi debug/pilot uygulamalar yalnız test telefonundadır. Farklı imza,
yerinde güncellemeyi engelleyebilir. Eski uygulamaları kaldırıp yeni release
APK'lerini temiz kurun; kaldırma cihazdaki uygulama verilerini siler. Otomatik
kaldırma, veri taşıma veya eski imza uyumluluk kodu eklenmez.

APK'nın içinde ortak sync anahtarı bulunmaz. Companion, masaüstünün mevcut cihaz
kurulum/eşleştirme akışını; Bayi Android işletme başvuru/davet ve hesap akışını
kullanır. Yayınlanabilir APK üretimi gerçek telefonda bağlantı, katalog, görsel,
sepet ve sipariş kabul testi yapılmış olduğu anlamına gelmez.

Google Play'e geçiş ayrı bir yayın kararıdır. AAB/Play App Signing kurulumunu
[Android app signing](https://developer.android.com/studio/publish/app-signing)
sözleşmesine göre ayrıca değerlendirin; bu repo komutları Play'e upload yapmaz.
