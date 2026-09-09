# Desktop Installer Hazırlık Planı

Bu dosya PC uygulamasının Windows kurulumuna hazırlanması için alınan kararları ve mevcut altyapıyı özetler.

## Hedef

İlk paketleme hedefi Windows masaüstüdür.

```text
Yardımcı Asistan Setup.exe
  Electron desktop app
  Local SQLite veri dosyası
  İlk kurulum sihirbazı
  Yedekleme klasörü
```

Linux geliştirme ortamında Electron uygulaması `npm run dev:desktop` ve `npm run smoke:desktop:linux` ile test edilir. Windows'a geçildiğinde installer üretimi ve kurulum sonrası açılış ayrıca doğrulanacaktır.

## Uygulama Veri Klasörü

Electron içinde veri klasörü şu kaynakla çözülür:

```text
app.getPath("userData")
```

Testlerde gerçek kullanıcı klasörüne yazmamak için:

```text
YA_DESKTOP_DATA_DIR
```

ortam değişkeni kullanılabilir.

Windows paketinde beklenen klasör:

```text
%APPDATA%/Yardımcı Asistan/
```

Linux testlerinde örnek:

```text
~/.config/Yardımcı Asistan/
```

## SQLite Dosya Konumu

Desktop database sınıfı veri dosyasını uygulama veri klasörü altında oluşturur:

```text
yardimci-asistan.sqlite
```

Tam örnek:

```text
%APPDATA%/Yardımcı Asistan/yardimci-asistan.sqlite
```

Migration ve seed dosyaları uygulama paketinden okunur:

```text
apps/desktop-app/db/migrations/
apps/desktop-app/db/seeds/
```

## Yedekleme Klasörü

Uygulama açılışında aynı veri klasörü altında yedekleme klasörü hazırlanır:

```text
backups/
```

Ana paneldeki `Yedek Al` komutu mevcut SQLite veritabanını bu klasöre zaman
damgalı dosya adıyla kopyalar:

```text
%APPDATA%/Yardımcı Asistan/backups/
```

Otomatik zamanlama ve yedek geri yükleme ekranı sonraki paketleme/test fazında
genişletilecektir.

## İlk Kurulum Sihirbazı

Yeni kurulumda demo seed değerleri bulunuyorsa veya `sync_secret` hâlâ varsayılan ise uygulama ilk ayar ekranıyla açılır.

Sihirbaz alanları:

```text
Firma adı
Sektör tipi
Telefon
WhatsApp
E-posta
Adres
Aktif modüller
Web modül adresi
Sync güvenlik anahtarı
AI ayarı
İlk oda/masa sayısı
```

Kaydetme işlemi mevcut SQLite tablolarına yazar:

```text
business
settings
rooms
tables
```

Ayarlar daha sonra desktop sol menüsündeki `Ayarlar` düğmesiyle yeniden açılabilir.

## Paketleme Komutları

Desktop paketleme `electron-builder` ile hazırlanır. Linux geliştirme ortamında paket dizini ve paket içeriği şu komutla doğrulanır:

```bash
npm run smoke:desktop-package
```

Bu komut desktop build alır, `dist/desktop/linux-unpacked` paket dizinini üretir ve `resources/app.asar` içinde şu dosyaların bulunduğunu kontrol eder:

- `dist-electron/main.js`
- `dist-electron/preload.js`
- `dist-electron/database.js`
- `dist-renderer/index.html`
- `db/migrations/001_baseline.sql`
- `db/demo-profiles/pension-restaurant.sql`

Windows installer üretim komutu:

```bash
npm run pack:desktop:win
npm run pack:desktop:win32
```

64 bit komutu `apps/desktop-app/electron-builder.yml`, 32 bit komutu ise aynı
ayarları genişleten `apps/desktop-app/electron-builder.win32.yml` içindeki NSIS
hedefini kullanır. İlk gerçek kurulum testi Windows işletim sisteminde yapılacaktır.

İlk Windows denemesinde doğrulanacaklar:

- Kurulum dosyası uygulamayı Program Files veya kullanıcı uygulama klasörüne kuruyor mu?
- İlk açılışta kurulum sihirbazı geliyor mu?
- SQLite dosyası `%APPDATA%` altında oluşuyor mu?
- `backups/` klasörü oluşuyor mu?
- Ana panelde `Yedek Al` komutu `%APPDATA%/Yardımcı Asistan/backups/` altında `.sqlite` dosyası oluşturuyor mu?
- Uygulama kapatılıp açıldığında ayarlar korunuyor mu?
- Web modül adresi ve sync anahtarı kaydediliyor mu?

## Linux'ta Mevcut Kanıt

Bu altyapı Linux'ta şu komutlarla doğrulanır:

```bash
npm run build -w @yardimci-asistan/desktop-app
node scripts/smoke-desktop-menu-db.mjs
npm run smoke:desktop-renderer
npm run smoke:desktop-package
npm run smoke:desktop:linux
```

`smoke-desktop-menu-db` setup state, manuel yedek dosyası, yedeğin SQLite olarak açılabilirliğini, `PRAGMA integrity_check` sonucunu ve kaydetme akışını kontrol eder. `smoke-desktop-renderer` ilk kurulum ekranını ve ana paneldeki `Yedek Al` komutunu tarayıcı önizlemesinde fake preload köprüsüyle açar. `smoke-desktop-package` paket içeriğinin kurulum için gerekli dosyaları taşıdığını doğrular; ayrıca `linux-unpacked` uygulamasını Xvfb altında `YA_DESKTOP_DATA_DIR` ile açarak paketli uygulamanın SQLite veri dosyasını ve `backups/` klasörünü oluşturduğunu, migration/seed verisini okuyabildiğini kontrol eder.
