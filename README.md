# Yardımcı Asistan

Yardımcı Asistan; pansiyon, restoranlı pansiyon, restoran ve kafe gibi küçük işletmeler için tasarlanan sade, modüler ve local-first bir dijital işletme asistanıdır.

Sistem; web sitesi veya gömülebilir web widget, firma hostinginde çalışan mini API, PC masaüstü uygulaması, Android companion, AI araçları, WhatsApp destek akışları ve QR menüden oluşur. v1 merkezi bir cloud servisine bağımlı değildir; her firma kendi hostingi, kendi PC uygulaması ve kendi verisiyle bağımsız çalışır.

## v1 Ürün Omurgası

Güncel v1 aşağıdaki ana akışları kapsar:

- Web formu ve Web AI üzerinden müşteri talebi toplama
- Firma hostingi ile masaüstü arasında local-first otomatik senkronizasyon
- Müşteri, rezervasyon, oda, masa ve günlük iş yönetimi
- Pansiyon konaklama takibi, oda hesabı, tahsilat ve çıkış
- Restoran masa adisyonu, sipariş durumu ve stok takibi
- Pansiyon + restoran işletmelerinde masa hesabını açık oda hesabına aktarma
- QR menü yayınlama
- Günlük/haftalık operasyon takvimi
- Basit ön muhasebe ve raporlar
- AI destekli cevap, özet, rapor ve görselden stok/kimlik alanı çıkarımı
- WhatsApp hazır mesaj, manuel akış ve Electron içi WhatsApp Web çalışma alanı
- Android companion, cihaz rolleri ve görev bazlı yetkiler
- Uygulama kilidi, yerel yedekleme ve masaüstü paketleme altyapısı

AI, WhatsApp veya internet bağlantısı sistemin tamamı için tek hata noktası değildir. AI kapalıyken temel operasyonlar devam eder; WhatsApp çalışmazsa talepler ve rezervasyonlar yönetilebilir; internet yokken masaüstü yerel verisiyle çalışmaya devam eder ve bağlantı geri geldiğinde kuyruklar yeniden senkronize edilir.

## Ana Bileşenler

- `apps/demo-web`: Web sitesi olmayan firmalar için özelleştirilebilir demo site.
- `apps/desktop-app`: İşletmenin ana yönetim merkezi olan Electron + React uygulaması.
- `apps/android-app`: Hızlı takip ve yetkili saha işlemleri için native Android companion.
- `packages/shared`: Uygulamalarda ortak kullanılan veri tipleri ve yardımcı fonksiyonlar.
- `packages/web-widget`: Mevcut web sitelerine tek script ile eklenebilen widget.
- `packages/ai-core`: Provider bağımsız AI adapter ve prompt altyapısı.
- `packages/whatsapp-bridge`: WhatsApp link, manuel kopyalama ve WebView akışları.
- `packages/sync-core`: Firma hostingi ile PC uygulaması arasındaki veri alışverişi.
- `firm-template/web-module`: Firma hostingine kurulacak PHP + SQLite mini API ve web modülü.
- `firm-template/knowledge`: Web AI için firma bilgi dosyası örnekleri.
- `firm-template/config`: Firma kurulum ayarları için şablon dosyalar.

## Ana Müşteri Talep Akışı

Güncel akışta WhatsApp zorunlu değildir:

1. Müşteri web sitesindeki formu doldurur veya Web AI ile konuşur.
2. Talep önce firma hostingindeki mini API'ye kaydedilir.
3. Müşteriye talebin işletmeye iletildiği onayı gösterilir.
4. İsterse ayrıca `WhatsApp'tan da yaz` seçeneğini kullanabilir.
5. Masaüstü uygulaması talebi otomatik senkronizasyonla çeker.
6. İşletme sahibi talebi, müşteriyi ve varsa rezervasyon akışını tek yerde görür.
7. AI cevap taslağı hazırlayabilir; gönderim kararı kullanıcıda kalır.
8. İşletme sahibi arama veya WhatsApp üzerinden müşteriye döner.

```text
Web form / Web AI
  ↓
Firma hostingi / PHP + SQLite
  ↓ cursor + acknowledgement
Masaüstü SyncCoordinator / local SQLite
  ↓ versioned outbox
QR menü + Android operasyon snapshot'ı
```

## Güvenlik ve Dayanıklılık

- PC'ye internetten port açılmaz; masaüstü bağlantıyı dışarı doğru kurar.
- API ve AI anahtarları web frontend'ine veya Android cevaplarına çıkarılmaz.
- Masaüstündeki AI anahtarı renderer'a geri verilmeden işletim sistemi güvenli saklama alanıyla korunur.
- Hostingdeki `config/`, `data/` ve `knowledge/` dizinleri doğrudan web erişimine kapatılır.
- Web talebi ve Web AI gibi müşteriye açık yazma uçlarında sunucu tarafı hız/boyut sınırı bulunur; ham istemci IP adresi diske yazılmaz.
- Yeni görülen Android cihazlar varsayılan olarak pasif/onay bekler durumdadır. Masaüstünden açıkça onaylanmadan operasyon verisini okuyamaz veya yerel işletme verisini değiştiremez.
- Onaylanan Android cihaz yeni hosting paketinde cihaz başına kişisel token'a geçer; release/pilot APK işletme genel `sync_secret` değerini binary içine gömmez.
- Android işlemleri action ID, cihaz kimliği, izin, stale-version ve receipt/idempotency kontrollerinden geçer.
- Müşteri kimlik görseli kalıcı saklanmaz; analiz sırasında geçici dosya olarak kullanılır ve sonuç kullanıcı kontrolüne sunulur.

Ayrıntılı güvenlik ve veri akışı için [Sistem Mimarisi](docs/ARCHITECTURE.md), [Güncel Ürün Durumu](docs/PRODUCT_STATUS.md) ve [Pre-Pilot Sertleştirme](docs/PRE_PILOT_HARDENING_2026-08.md) belgeleri esas alınmalıdır.

## Dokümanlar

- [Proje Özeti](docs/PROJECT_BRIEF.md)
- [Sistem Mimarisi](docs/ARCHITECTURE.md)
- [Otomatik Senkronizasyon](docs/AUTOMATIC_SYNC.md)
- [Güncel Ürün Durumu](docs/PRODUCT_STATUS.md)
- [Pre-Pilot Sertleştirme](docs/PRE_PILOT_HARDENING_2026-08.md)
- [Pilot Saha Testi](docs/PILOT_FIELD_TEST.md)
- [Güncel Görev Planı](docs/TASKS.md)
- [Veri Modeli](docs/DATA_MODEL.md)
- [Event Sistemi](docs/EVENTS.md)
- [UI Kuralları](docs/UI_RULES.md)
- [Codex Çalışma Kuralları](docs/CODEX_RULES.md)
- [Geliştirme Kurulumu](docs/DEVELOPMENT_SETUP.md)
- [Firma Web Modülü Kurulumu](docs/WEB_MODULE_INSTALLATION.md)
- [Demo Site Özelleştirme](docs/DEMO_SITE_CUSTOMIZATION.md)
- [Android Dağıtımı](docs/ANDROID_DISTRIBUTION.md)
- [Platform Test Planı](docs/dev/PLATFORM_TEST_PLAN.md)
- [Desktop Installer Hazırlık Planı](docs/dev/DESKTOP_INSTALLER_PLAN.md)
- [İlk Uçtan Uca Demo Akışı](docs/dev/END_TO_END_DEMO_FLOW.md)

## Geliştirici Komutları

Temel kontrol hattı:

```bash
npm install
npm run build
npm run doctor
npm test
npm run e2e
```

Pilot öncesi tek komutluk temel kapı:

```bash
node scripts/pilot-check.mjs
```

Daha geniş, Android build + UI/e2e katmanını da isteyen tur:

```bash
node scripts/pilot-check.mjs --full
```

Pilot runner sonucu `artifacts/pilot-check/latest.json` içine de yazar. Gerçek Windows/telefon adımları için [Pilot Saha Testi](docs/PILOT_FIELD_TEST.md) izlenmelidir.

Önemli smoke testleri:

```bash
npm run smoke:web-form-api
npm run smoke:automatic-sync
npm run smoke:android-device-approval-hosting
npm run smoke:customer-room-management
npm run smoke:stock-image-analysis
npm run smoke:demo-flow
npm run smoke:local-lab
```

Linux'ta web modülü ve demo web sayfasını birlikte denemek için:

```bash
npm run dev:local
```

Desktop uygulamayı ayrı pencerede denemek için:

```bash
npm run dev:desktop
```

Android geliştirme ve bağlı cihaz kontrolleri:

```bash
npm run android:install
npm run android:phone-test
npm run android:screenshot
npm run smoke:android-device-ui
npm run android:mirror
```

`android:install`, debug APK'yı derleyip USB hata ayıklaması açık bağlı telefona
kurar; uygulama zaten kuruluysa verisini koruyarak günceller. Birden fazla cihaz
için `-- --serial <cihaz-serisi>`, imzalı pilot APK için `-- --release` eklenebilir.

Daha geniş Linux doğrulama hattı:

```bash
npm run check:linux
```

## Güncel Geliştirme Aşaması

Yeni v1 özellikleri eklemek yerine ürün sertleştirme ve saha doğrulama aşamasındadır.

Kod tarafında demo web, web widget, PHP hosting modülü, masaüstü operasyon merkezi, Android companion, local-first senkron, QR menü, AI araçları, WhatsApp çalışma alanı, rezervasyon/oda/masa yönetimi, stok, oda folyosu ve basit finans omurgası bulunmaktadır.

Tanıtım/pilot öncesindeki ana doğrulama başlıkları:

- otomatik `pilot-check` kapısının yeşil tamamlanması,
- hedef Windows bilgisayarda temiz kurulum, kullanıcı veri klasörü, yedekleme ve yeniden başlatma davranışı,
- WhatsApp WebView ve gerçek hosting bağlantısının Windows saha testi,
- pansiyon + restoran senaryosunun sahte verilerle birkaç günlük gerçekçi kullanımı,
- internet kesilmesi, tekrar bağlanma, yeniden başlatma ve tekrarlı işlem kenar durumları,
- restoran hesabını oda hesabına aktarırken stok/kasa/idempotency bütünlüğü,
- Android yeni cihaz onay, kişisel token, pasifleştirme ve yetki akışının gerçek telefonlarla doğrulanması,
- pilot işletmelerden gelen UX geri bildirimlerinin toplu değerlendirilmesi.

Doğrudan Android-PC/LAN modu ve resmî WhatsApp API entegrasyonu v1 tamamlanma kriteri değildir; gerçek kullanım ihtiyacı oluşursa sonraki fazda değerlendirilecektir.
