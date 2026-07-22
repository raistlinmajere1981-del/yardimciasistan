# Yardımcı Asistan

Yardımcı Asistan; pansiyon, restoranlı pansiyon, restoran ve kafe gibi küçük işletmeler için tasarlanan sade, modüler ve local-first bir dijital asistan paketidir.

Sistem; demo web sitesi, mevcut sitelere eklenebilir web widget, firma hostinginde çalışan mini API, PC masaüstü uygulaması, Android companion, AI adapter ve WhatsApp destek akışlarından oluşur. v1 kararına göre merkezi cloud servisine bağımlı değildir; her firma kendi hostingi, kendi PC uygulaması ve kendi verisiyle bağımsız çalışır.

## Ana Bileşenler

- `apps/demo-web`: Web sitesi olmayan firmalar için özelleştirilebilir demo site.
- `apps/desktop-app`: İşletmenin ana yönetim merkezi olacak Electron + React uygulaması.
- `apps/android-app`: Hızlı takip ve temel onay işlemleri için sade Android companion.
- `packages/shared`: Tüm uygulamalarda ortak kullanılacak veri tipleri ve yardımcı fonksiyonlar.
- `packages/web-widget`: Mevcut web sitelerine tek script ile eklenebilecek widget.
- `packages/ai-core`: Provider bağımsız AI adapter ve prompt altyapısı.
- `packages/whatsapp-bridge`: WhatsApp link, manuel kopyalama ve WebView akışları.
- `packages/sync-core`: Firma hostingi ile PC uygulaması arasındaki veri alışverişi.
- `firm-template/web-module`: Firma hostingine kurulacak mini API ve web modülü şablonu.
- `firm-template/knowledge`: AI için firma bilgi dosyası örnekleri.
- `firm-template/config`: Firma kurulum ayarları için şablon dosyalar.

## Geliştirme Durumu

Proje iskeleti, web modülü, desktop omurgası, QR menü ve ilk AI altyapısı kuruluyor. İlk uçtan uca hedef akış:

1. Müşteri demo web sitesinde talep formu doldurur.
2. Alternatif olarak Web AI sohbeti müşteri bilgileriyle talep açabilir.
3. WhatsApp hazır mesajı açılır.
4. Talep firma hostingindeki mini API'ye kaydedilir.
5. PC uygulaması talebi çeker.
6. İşletme sahibi talebi görür, AI cevap önerisi alabilir ve WhatsApp üzerinden dönüş yapar.

## Dokümanlar

- [Proje Özeti](docs/PROJECT_BRIEF.md)
- [Sistem Mimarisi](docs/ARCHITECTURE.md)
- [Otomatik Senkronizasyon](docs/AUTOMATIC_SYNC.md)
- [Codex Çalışma Kuralları](docs/CODEX_RULES.md)
- [UI Kuralları](docs/UI_RULES.md)
- [Veri Modeli](docs/DATA_MODEL.md)
- [Event Sistemi](docs/EVENTS.md)
- [Görev Planı](docs/TASKS.md)
- [Geliştirme Kurulumu](docs/DEVELOPMENT_SETUP.md)
- [Firma Web Modülü Kurulumu](docs/WEB_MODULE_INSTALLATION.md)
- [Demo Site Özelleştirme](docs/DEMO_SITE_CUSTOMIZATION.md)
- [Platform Test Planı](docs/dev/PLATFORM_TEST_PLAN.md)
- [Desktop Installer Hazırlık Planı](docs/dev/DESKTOP_INSTALLER_PLAN.md)
- [İlk Uçtan Uca Demo Akışı](docs/dev/END_TO_END_DEMO_FLOW.md)

## Geliştirici Komutları

```bash
npm install
npm run build
npm run doctor
npm run smoke:web-form-api
npm run smoke:automatic-sync
npm run e2e
npm test
npm run smoke:demo-flow
npm run smoke:ai-live
npm run smoke:local-lab
npm run dev:local
npm run android:phone-test
npm run android:screenshot
npm run smoke:android-device-ui
npm run android:mirror
```

Linux'ta web modülü ve demo web sayfasını birlikte denemek için:

```bash
npm run dev:local
```

Komut PHP web modülünü, demo web sitesini ve demo verilerini yerel ortamda
hazırlar; terminalde PC uygulaması ve Android testleri için kullanılacak adresleri
yazdırır.

Desktop uygulamayı ayrı pencerede denemek için:

```bash
npm run dev:desktop
```

Derleme ve test komutları monorepo içindeki hazır workspace paketleri üzerinden çalışır.

## Güncel Geliştirme Akışı

Web tarafı için demo site, web widget ve firma hosting mini API şablonu hazırlanmıştır. `packages/sync-core`, sağlayıcıdan bağımsız `SyncTransport` sınırını ve güncel PHP hosting adaptörünü içerir.

Desktop tarafında Electron + React iskeleti, local SQLite, kalıcı outbox, cursor tabanlı talep çekme, 15 saniyelik otomatik koordinatör ve `electron-builder` tabanlı paketleme smoke kontrolü hazırdır. İnternet kesildiğinde yerel işlemler devam eder; kuyruklar bağlantı geldiğinde yeniden denenir.

Firma web modülünde müşteriye açık `menu.html` QR menü sayfası ve `api/menu.php` üzerinden çalışan menü okuma akışı bulunur.

QR menü için PC tarafında kategori/ürün yönetim ekranı bulunur; local SQLite verisi `pushMenu()` ile firma web modülündeki `publish_menu` aksiyonuna gönderilebilir.

AI tarafında `packages/ai-core` provider bağımsız prompt/knowledge/adapter katmanını sağlar. Servis, bağlantı adresi, model, gizli anahtar ve zaman aşımı masaüstü Ayarlar ekranından yönetilir; anahtar işletim sistemi güvenli saklama alanıyla şifrelenir ve renderer'a geri dönmez. Aynı ayar HTTPS + `sync_secret` ile firma web modülüne yayınlanır; `api/chat.php` son yayınlanan sunucu ayarını kullanır, AI kapalıyken güvenli fallback cevap döner. Sohbet içinde müşteri adı, geçerli cep telefonu ve talep niyeti geldiğinde web modülü `source=web_ai` talebi de hosting SQLite veritabanına kaydeder.

WhatsApp tarafında `packages/whatsapp-bridge` Türkiye cep telefonu normalizasyonu, `wa.me` link üretimi, manuel kopyalama ve WebView/resmi API geçişleri için ortak adapter yüzeyini sağlar.

Android tarafında `apps/android-app` native companion ekranını sağlar. Masaüstü operasyon snapshot'ını kalıcı outbox üzerinden otomatik yayınlar; Android açıkken yaklaşık 15 saniyede bir, arka planda işletim sisteminin izin verdiği periyotta yeniler ve son başarılı veriyi yerel cache'den gösterebilir. Android Gradle Plugin hattı `npm run android:debug`, `npm run android:release-apk` ve `npm run android:release-aab` komutlarıyla debug APK, imzalı pilot APK ve Play Store AAB üretir; signing ve kurulum ayrıntıları `docs/ANDROID_DISTRIBUTION.md` içindedir. `npm run smoke:android-hosting` cihazsız hosting hazırlığını doğrular; gerçek telefonda yerel test için `npm run android:phone-test` demo veriyi yükler, PHP web modülünü LAN'da açar ve adb cihazı bağlıysa uygulamayı doğru web modül adresiyle başlatır.

Android ekran kontrolü için `npm run android:screenshot` ekran görüntüsünü
`artifacts/android-control/` altına kaydeder, `npm run android:dump` UI ağacını
XML olarak çıkarır, `npm run android:control -- tap <x> <y>` adb üzerinden
dokunma gönderir. `npm run smoke:android-device-ui` bağlı telefonda kurulum,
ekran, canlı veri butonu ve talep listesi akışını doğrular. `npm run android:mirror`
scrcpy ile canlı ekran aynalama açar.

Demo hosting ve domain kararı firma sunumu aşamasına bırakılmıştır. Güncel ana
test hattı Linux'ta yerel PHP/demo web/desktop ve adb bağlı Android telefondur.

İlk webden PC'ye talep akışı:

```text
Web form / widget
  ↓
firm-template/web-module/api/request.php
  ↓
Firma hostingi / PHP + SQLite
  ↓ cursor + acknowledgement
Masaüstü SyncCoordinator / local SQLite
  ↓ versioned outbox
QR menü + Android snapshot
```
