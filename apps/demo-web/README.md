# Yardımcı Asistan Ürün Sitesi

Bu workspace, `yardimciasistan.alwaysdata.net` üzerinde yayınlanan Yardımcı Asistan tanıtım sitesini içerir.

Kod klasörü tarihsel nedenlerle hâlâ `apps/demo-web` adını taşır; çalışma alanı artık örnek bir pansiyon sitesi değil, Yardımcı Asistan'ın tek sayfalık ürün vitrini ve canlı sistem gösterimidir.

## Amaç

- Yardımcı Asistan'ın masaüstü, web ve Android yüzeylerini tek ürün olarak anlatmak.
- Bugün desteklenen pansiyon / restoran / kafe profillerini göstermek.
- Modüler ürün yönünü ve sıradaki Market / Perakende hedefini açıklamak.
- Gerçek `firm-template/web-module` kurulumu üzerinden canlı senkron, QR menü ve web iletişim yeteneklerini göstermek.
- Windows ve Android paketlerini aynı sayfadan sunmak.

## Yerel geliştirme

```bash
npm run dev -w @yardimci-asistan/demo-web
```

Farklı bir web modülüne bağlanmak için:

```bash
VITE_YA_WEB_MODULE_URL=http://127.0.0.1:8080 \
VITE_YA_SYNC_SECRET=change-this-secret \
npm run dev -w @yardimci-asistan/demo-web
```

Canlı sistem bölümü şu gerçek uçları kullanır:

- `api/menu.php`: yayınlanmış QR menü
- `api/sync.php` → `capabilities`: hosting / protokol durumu
- `api/sync.php` → `android_summary`: masaüstünden yayınlanan operasyon snapshot'ı
- `widget.js`: web talebi, Web AI ve WhatsApp hazırlama akışları

`android_summary` için kullanılan tanıtım cihaz kimliği varsayılan olarak `web-showcase-console` değeridir. Operasyon özetinin görünmesi için bu cihaz masaüstü uygulamasından bir kez onaylanabilir. İstenirse build sırasında `VITE_YA_SHOWCASE_DEVICE_ID` ile değiştirilebilir.

## Tanıtım verisi

Masaüstü tanıtım verisi üretim başlangıcından ayrıdır:

```bash
npm run build:packages
npm run build -w @yardimci-asistan/desktop-app
node scripts/demo-showcase.mjs prepare
```

Varsayılan profil `pension-restaurant` olup `.demo-runtime/pension-restaurant/` altında ayrı bir SQLite veritabanı oluşturur. Bu profil küçük ve tekrar üretilebilir bir kaynak envanteri içerir; müşteri, rezervasyon ve adisyon geçmişi tanıtım sırasında gerçek akışlardan oluşur.

## Build

```bash
VITE_YA_WEB_MODULE_URL=https://yardimciasistan.alwaysdata.net/yardimci-asistan \
VITE_YA_SYNC_SECRET=change-this-secret \
npm run build -w @yardimci-asistan/demo-web
```

İndirme paketleri farklı adreslerdeyse şu değişkenler kullanılabilir:

```text
VITE_YA_DESKTOP_INSTALLER_URL
VITE_YA_DESKTOP_INSTALLER_VERSION
VITE_YA_ANDROID_APK_URL
VITE_YA_ANDROID_APP_VERSION
```

Widget ve ürün sitesi entegrasyonu için odaklı smoke testi:

```bash
npm run smoke:demo-web-widget
```
