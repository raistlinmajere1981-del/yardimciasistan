# Demo Web

Web sitesi olmayan firmalar için hazırlanacak özelleştirilebilir demo web sitesi burada geliştirilecektir.

Firma bilgileri config dosyalarından okunur. Talep formu uygulama içinde yer alır; demo site varsayılan olarak `https://yardimciasistan.alwaysdata.net/yardimci-asistan` adresindeki gerçek `widget.js` dosyasını sağ alt Yardımcı Asistan widget'ı olarak yükler.

Yerel web modülüyle birlikte denemek için:

```bash
npm run dev -w @yardimci-asistan/demo-web
```

Farklı bir firma modülü denenirse `VITE_YA_WEB_MODULE_URL` ile override edilebilir.
Yerel Vite geliştirme sunucusu, tarayıcı CORS sınırını aşmak için yalnız API
isteklerini aynı Alwaysdata modülüne proxy eder; ayrı bir yerel PHP web modülü
çalıştırılmaz.

## Özelleştirme

Firma adı, renkler, görseller, odalar, menü ve WhatsApp numarası için ana dosya:

```text
apps/demo-web/config/business.json
```

Ayrıntılı adım adım rehber:

```text
docs/DEMO_SITE_CUSTOMIZATION.md
```

## Uygulama İndirmeleri

Demo sitenin müşteri navigasyonunda gösterilmeyen `#settings` sayfası Windows 64
bit, Windows 32 bit ve Android APK indirmelerini sunar. Sayfaya doğrudan
`/#settings` adresinden veya footer'daki “Uygulamayı İndir” bağlantısından
ulaşılır. Canlı hosting paketi doğrulanmış üç dosyayı `downloads/` altına kopyalar.

Dosyalar üretilir ve ardından hosting paketi hazırlanır:

```bash
npm run pack:desktop:win
npm run pack:desktop:win32
npm run build:android
YARDIMCI_ASISTAN_HOSTING_ORIGIN=https://site.example \
YARDIMCI_ASISTAN_DEPLOY_SYNC_SECRET=guclu-ve-ozel-anahtar \
npm run pack:hosting-demo
```

Dosyalar başka klasörlerdeyse `YARDIMCI_ASISTAN_DESKTOP_INSTALLER_PATH`,
`YARDIMCI_ASISTAN_DESKTOP_INSTALLER_X86_PATH` ve
`YARDIMCI_ASISTAN_ANDROID_APK_PATH` ile yolları verilebilir. Paketleyici Windows
PE ve Android ZIP/APK başlıklarını, boyutları ve SHA-256 özetlerini doğrular.

Farklı bir indirme sunucusu kullanılacaksa build sırasında aşağıdaki değerler
verilebilir:

```bash
VITE_YA_DESKTOP_INSTALLER_URL=https://indir.example/YardimciAsistan-Setup.exe \
VITE_YA_DESKTOP_INSTALLER_X86_URL=https://indir.example/YardimciAsistan-Setup-x86.exe \
VITE_YA_DESKTOP_INSTALLER_VERSION=0.1.0 \
VITE_YA_ANDROID_APK_URL=https://indir.example/YardimciAsistan-Android.apk \
VITE_YA_ANDROID_APP_VERSION=0.1.0 \
npm run build -w @yardimci-asistan/demo-web
```
