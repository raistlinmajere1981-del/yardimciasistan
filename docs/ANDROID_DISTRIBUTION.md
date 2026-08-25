# Yardımcı Asistan Android — Dağıtım Rehberi

Bu rehber, uygulamanın USB debugging gerektirmeyen pilot APK dağıtımını ve daha
sonraki Google Play AAB yayınını kapsar. Bu yapı herhangi bir dosyayı Play
Console'a yüklemez.

## Sabit uygulama kimliği

Android kimliği şu anda önerilen kalıcı değerle aynıdır:

```text
applicationId: com.yardimciasistan.android
namespace:     com.yardimciasistan.android
```

Değerler `apps/android-app/build.gradle` içinde açıkça tanımlıdır. Java package
yapısı da aynı değeri kullanır. Gradle'ın güncel namespace modeline geçilirken
manifestteki eski `package` niteliği kaldırılmıştır; **uygulama kimliği
değişmemiştir ve package migration yapılmamıştır**.

Bu kimlik ilk dağıtımdan sonra değiştirilmemelidir. Değişiklik yapılırsa Android
yeni paketi ayrı uygulama sayar; mevcut uygulamanın doğrudan güncellemesi,
uygulama ayarları/verisi, cihaz kimliği sürekliliği ve gelecekteki Play Store
kaydı etkilenir. Daha önce farklı bir applicationId veya farklı imza ile pilot
dağıtım yapıldıysa yeni anahtara/package'a geçmeden önce ayrıca migration planı
hazırlanmalıdır.

## Sürüm kaynağı

Android sürümü `apps/android-app/version.properties` dosyasında tutulur:

```properties
VERSION_CODE=1
VERSION_NAME=0.1.0
```

- `VERSION_CODE`, Google Play ve Android güncelleme sırasıdır. Her yeni pilot,
  kapalı test veya production release için önceki dağıtımdan büyük olmalıdır;
  yeniden kullanılmaz ve azaltılmaz.
- `VERSION_NAME`, kullanıcıya gösterilen sürümdür. Bu projede SemVer biçimi
  (`0.1.0`, `0.1.1`, `0.2.0` gibi) kullanılır.
- Workspace metadata'sı için `apps/android-app/package.json` içindeki `version`
  değeri de `VERSION_NAME` ile aynı tutulur. Build, iki değer farklıysa hata
  verir.
- Debug build ayırt edilebilmesi için görünen sürüme otomatik `-debug` ekler;
  release sürümü doğrudan `VERSION_NAME` değerini kullanır.

Örnek bir sonraki release:

```properties
VERSION_CODE=2
VERSION_NAME=0.1.1
```

## Build türleri ve çıktılar

Komutlar depo kökünden çalıştırılır:

| Amaç | Komut | Çıktı |
| --- | --- | --- |
| Geliştirme/debug APK | `npm run android:debug` | `apps/android-app/build/outputs/apk/debug/yardimci-asistan-debug.apk` |
| Pilot/release APK | `npm run android:release-apk` | `apps/android-app/build/outputs/apk/release/yardimci-asistan-release.apk` |
| Google Play/release AAB | `npm run android:release-aab` | `apps/android-app/build/outputs/bundle/release/yardimci-asistan-android-release.aab` |

`npm run build:android`, geriye uyumluluk için `android:debug` komutunun
karşılığıdır. Saf Java smoke kontrolleri ve debug APK için
`npm run smoke:android:build` kullanılabilir.

Debug APK standart debug anahtarıyla imzalanır ve yalnız geliştirme/test içindir.
Release APK doğrudan telefona kurulabilen pilot dağıtım dosyasıdır. AAB ise
Google Play'in cihazlara uygun APK'lar üretmesi için kullanılan yayın formatıdır;
telefona doğrudan kurulmaz. Android'in resmi komut satırı ve AAB ayrımı için
[Android build rehberine](https://developer.android.com/build/building-cmdline)
bakın.

İlk build sabitlenmiş Gradle dağıtımını SHA-256 ile doğrulayıp kullanıcı Gradle
cache'ine indirir. Android Gradle Plugin bağımlılıkları da standart kullanıcı
cache'inde tutulur; repoya eklenmez. JDK 17 ve Android SDK Platform 36 gerekir.
Runner, `ANDROID_HOME`/`ANDROID_SDK_ROOT` yanında Linux'ta `~/Android/Sdk` ve
Windows'ta `%LOCALAPPDATA%\Android\Sdk` konumlarını da kontrol eder.

## USB ile bağlı geliştirme cihazına kurulum/güncelleme

USB hata ayıklaması açık ve ADB tarafından yetkilendirilmiş telefona debug APK'yı
derleyip kurmak için depo kökünde çalıştırın:

```bash
npm run android:install
```

Uygulama telefonda zaten varsa script `adb install -r` kullanarak uygulama verisini
korur ve APK'yı günceller. İmza uyuşmazlığında veri kaybına yol açabilecek otomatik
kaldırma işlemi yapmaz. Kullanılabilir seçenekler:

```bash
npm run android:install -- --serial <cihaz-serisi>
npm run android:install -- --no-build
npm run android:install -- --launch
npm run android:install -- --release
```

Birden fazla cihaz bağlıysa `--serial` zorunludur; bunun yerine `ANDROID_SERIAL`
ortam değişkeni de kullanılabilir. `--release`, aşağıda açıklanan kalıcı release
keystore yapılandırmasını gerektirir. Tüm seçenekler için
`npm run android:install -- --help` komutunu kullanın.

## Release keystore hazırlığı

İlk gerçek pilot APK'dan **önce**, repo dışında kalıcı bir release keystore
oluşturun. Daha önce release/pilot dağıtıldıysa yeni anahtar üretmeyin; ilk
dağıtımda kullanılan anahtarı bulun.

Parolaları komut satırına yazmadan etkileşimli oluşturma örneği:

```bash
keytool -genkeypair -v \
  -keystore /guvenli/konum/yardimci-asistan-release.jks \
  -storetype PKCS12 \
  -alias yardimci-asistan \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

`keytool` parolayı ve sertifika bilgilerini etkileşimli ister. PKCS12 kullanırken
key ve store parolasını aynı değer olarak kullanmak en sorunsuz seçenektir.
Keystore'u kaynak depo, bulutla herkese açık klasör, mesajlaşma eki veya build
artifact'ı içine koymayın.

Build aşağıdaki dört adı sırayla environment, git-ignored
`apps/android-app/keystore.properties` ve kullanıcıya özel
`~/.gradle/gradle.properties` kaynaklarında arar:

```text
YA_ANDROID_KEYSTORE_PATH
YA_ANDROID_KEYSTORE_PASSWORD
YA_ANDROID_KEY_ALIAS
YA_ANDROID_KEY_PASSWORD
```

Yerel dosya yöntemi:

```bash
cp apps/android-app/keystore.properties.example apps/android-app/keystore.properties
chmod 600 apps/android-app/keystore.properties
```

Ardından örnek değerleri gerçek keystore yolu/alias/parolalarıyla değiştirin.
Environment yöntemi tercih edilirse aynı adları CI secret store veya parola
yöneticisinden export edin. Parolaları `-P...` komut argümanı olarak vermeyin;
shell history, process listesi veya CI loguna girebilir.

Eksik signing değeriyle release komutu bilinçli olarak hata verir; unsigned
release üretmez. Keystore, yerel properties, `*.jks`, `*.keystore`, `*.p12` ve
`*.pfx` dosyaları `.gitignore` kapsamındadır. Commit öncesi yine de kontrol edin:

```bash
git status --short
git check-ignore -v apps/android-app/keystore.properties
```

Android uygulamalarında özel anahtar tüm gelecekteki güncellemelerin kimliğidir.
Keystore'u ve parolaları ayrı güvenli yerlerde, en az iki şifreli yedekle saklayın;
erişim yetkisini sınırlayın ve yedekten geri dönüşü ilk dağıtımdan önce deneyin.
Detaylar için resmi [Android app signing rehberine](https://developer.android.com/studio/publish/app-signing)
bakın.

### Debug kurulumdan release kuruluma geçiş riski

Debug ve release aynı applicationId'yi, fakat farklı imzaları kullanır. Telefonda
debug APK kuruluysa Android release APK'yı onun üzerine güncelleme olarak kabul
etmez. İlk release kurulumu öncesinde debug uygulamasının kaldırılması gerekir;
bu işlem Android uygulama verisini silebilir. Bundan sonraki tüm pilot APK'ları
aynı release keystore ve artan `VERSION_CODE` ile üretin.

### Pilot APK ile gelecekteki Play imzası

Pilot kullanıcıların daha sonra Play Store sürümüne veri kaybetmeden geçmesi
isteniyorsa Play'in kullanıcılara sunduğu APK ile pilot APK'nın app-signing
sertifikası uyumlu olmalıdır. Play App Signing kurulurken mevcut pilot signing
anahtarını app-signing anahtarı olarak Google'a aktarma seçeneğini değerlendirin.
Google'ın yeni ve farklı bir app-signing anahtarı üretmesi seçilirse mevcut
sideload kurulumlar Play sürümüne doğrudan güncellenemeyebilir. Kararı geniş pilot
dağıtımından önce verin; güncel seçenekler için resmi
[Play App Signing rehberini](https://support.google.com/googleplay/android-developer/answer/9842756)
kontrol edin.

## USB debugging olmadan APK kurulumu

Pilot kullanıcı için ADB, geliştirici seçenekleri veya USB kablosu gerekmez:

1. `yardimci-asistan-release.apk` dosyasını kontrollü bir HTTPS indirme bağlantısı,
   kurumsal dosya paylaşımı veya doğrudan dosya aktarımıyla telefona gönderin.
2. Yayınlayan taraf dosyanın SHA-256 özetini ayrı kanaldan paylaşsın:

   ```bash
   sha256sum apps/android-app/build/outputs/apk/release/yardimci-asistan-release.apk
   ```

3. Kullanıcı telefonda APK dosyasına dokunur.
4. Android, dosyayı açan tarayıcı/dosya yöneticisi için **Bilinmeyen uygulamaları
   yükle** veya **Bu kaynaktan izin ver** onayı isteyebilir. Yalnız kullanılan
   güvenilir kaynağa geçici izin verin; kurulumdan sonra izin kapatılabilir.
5. Android paket adı, imza ve sürüm kurallarını kontrol eder ve kullanıcı onayıyla
   kurulumu tamamlar.

Mevcut release kurulumunun üzerine güncelleme için package aynı, signing anahtarı
aynı ve yeni `VERSION_CODE` daha büyük olmalıdır. İmza farklıysa uygulamayı
kaldırmak gerekebilir ve yerel veri kaybolabilir.

APK içine `connection.local.json` veya environment üzerinden sync anahtarı
gömülebilir. Build logundaki `android-connection-mode` satırını kontrol edin.
APK tersine mühendislikle incelenebildiği için gömülü sync anahtarını APK'nın
erişeceği pilot gruba göre değerlendirin; genel dağıtımda bağlantıyı düzenlenebilir
bırakın veya dağıtım sonrasında anahtarı döndürün. Build gizli değerin kendisini
loglamaz.

## Release öncesi kısa çalışma sırası

1. Package kimliğinin `com.yardimciasistan.android` kaldığını kontrol edin.
2. `VERSION_CODE` değerini artırın; `VERSION_NAME` ve Android workspace
   `package.json` sürümünü birlikte güncelleyin.
3. Kalıcı release keystore yedeğini ve signing environment/properties ayarını
   doğrulayın.
4. Bağlantı modunun hedef pilot için doğru olduğunu kontrol edin.
5. `npm run smoke:android:build` çalıştırın.
6. `npm run android:release-apk` ve `npm run android:release-aab` çalıştırın.
7. APK imzasını, package ve sürümü; AAB imzasını ve dosya özetlerini doğrulayın.
8. Pilot APK'yı sınırlı gruba dağıtın; AAB'yi Play Console aşamasına kadar özel
   artifact deposunda saklayın.

Örnek doğrulama komutları (`$ANDROID_HOME` tanımlı kabul edilir):

```bash
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --verbose \
  apps/android-app/build/outputs/apk/release/yardimci-asistan-release.apk

$ANDROID_HOME/build-tools/36.0.0/aapt2 dump badging \
  apps/android-app/build/outputs/apk/release/yardimci-asistan-release.apk

jarsigner -verify \
  apps/android-app/build/outputs/bundle/release/yardimci-asistan-android-release.aab
```

## Google Play yayın hazırlığı

Play Store'a doğrudan APK yerine imzalı release **AAB** yüklenir. Play App
Signing etkinleştirildiğinde yerel keystore çoğunlukla upload key rolünü üstlenir;
Google dağıtılan APK'ları app-signing key ile imzalar. İlk AAB yüklendiğinde
package adı Play kaydı için sabitlenir. Her release daha yüksek versionCode ve
doğru imza taşımalıdır.

Play politika ve hedef API kuralları zamanla değişir. Her yayın öncesi Play
Console'daki güncel uyarıları ve gereksinimleri kontrol edin. Yeni kişisel
hesaplarda production erişimi için güncel kural, en az 12 katılımcının 14 gün
kesintisiz dahil olduğu kapalı test ve ardından production erişim başvurusudur;
hesap türüne göre Play Console'un gösterdiği kural esas alınmalıdır. Resmi
[test gereksinimleri](https://support.google.com/googleplay/android-developer/answer/14151465)
sayfası güncel kaynaktır.

### Play Store hazırlık checklist'i

- [ ] Play Console hesabı açıldı; ödeme profili ve iletişim bilgileri tamamlandı.
- [ ] Geliştirici kimlik/doğrulama adımları ve package name kaydı tamamlandı.
- [ ] Herkese açık HTTPS gizlilik politikası hazırlandı ve uygulamanın gerçek veri
      akışıyla uyumlu olduğu gözden geçirildi.
- [ ] Kısa ve tam uygulama açıklaması hazırlandı.
- [ ] Desteklenen telefon boyutlarını temsil eden güncel ekran görüntüleri hazırlandı.
- [ ] Play için 512 × 512 app icon hazırlandı.
- [ ] 1024 × 500 feature graphic hazırlandı.
- [ ] İçerik derecelendirme anketi tamamlandı.
- [ ] Data safety form, Android uygulaması, hosting ve masaüstü arasındaki gerçek
      veri toplama/paylaşma davranışına göre tamamlandı.
- [ ] App content alanındaki reklam, hedef kitle, erişim talimatları ve ilgili
      politika beyanları tamamlandı.
- [ ] İmzalı release AAB üretildi; package, versionCode ve upload sertifikası
      doğrulandı.
- [ ] Kapalı test grubu kuruldu, gerekli süre/katılımcı koşulu tamamlandı ve geri
      bildirimler kaydedildi.
- [ ] Crash/ANR, pre-launch report ve pilot geri bildirimleri incelendi.
- [ ] Production erişim/yayın başvurusu hazırlandı ve kontrollü rollout planlandı.

Yalnız internal testte kalan uygulamalar hariç, Data safety beyanı kapalı test
dahil Play'de yayınlanan uygulamalar için gerekir;
ayrıntılar resmi [Data safety rehberindedir](https://support.google.com/googleplay/android-developer/answer/10787469).
Görsel ölçüleri ve güncel varlık kuralları için
[Play preview assets rehberini](https://support.google.com/googleplay/android-developer/answer/9866151)
kullanın.
