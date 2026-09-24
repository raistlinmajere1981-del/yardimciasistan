# Desktop App

İşletmenin ana yönetim merkezi olacak Electron + React + SQLite masaüstü uygulaması burada geliştirilir.

Uygulama local-first çalışmalı ve internet yokken oda, masa, rezervasyon ve müşteri takibini sürdürebilmelidir.

## Komutlar

```bash
npm run dev
npm run build
npm run pack:dir
npm run pack:win
npm run pack:win32
npm run typecheck
```

Kökten çalıştırmak için:

```bash
npm run dev:desktop
```

Masaüstü uygulamasının varsayılan web modülü
`https://yardimciasistan.alwaysdata.net/yardimci-asistan` adresindeki canlı demo
kurulumudur. Ayarlar ekranındaki güvenlik anahtarı hosting kurulumundaki
`config/business.json → sync_secret` değeriyle eşleşmelidir.

Üst bardaki bildirim merkezi açık müşteri taleplerini, onay bekleyen rezervasyonları,
hesap bekleyen masaları, bekleyen/geciken günlük işleri, sync hatalarını ve başarısız
Android işlemlerini tek listede gösterir. Operasyon kaydı çözüldüğünde uyarı canlı
listeden kalkar; başarısız Android işlem uyarısı aynı cihazın aynı kayıt üzerindeki
işlemi daha sonra başarıyla uygulandığında kapanır.

## İlk Durum

Bu iskelet şu parçaları içerir:

- Electron ana pencere ve preload köprüsü.
- React tabanlı ana panel.
- Yeni talepler, bugünkü işler, oda/masa durumu, bekleyen rezervasyonlar ve WhatsApp hazır cevap kartları.
- `packages/sync-core` üzerinden web taleplerini çekmeye hazır IPC akışı.
- Tek `SyncCoordinator` üzerinden 15 saniyelik cursor tabanlı talep/Android action pull akışı.
- SQLite trigger'larıyla beslenen kalıcı menü ve Android snapshot outbox'ı; idempotent sürümlü yayın ve 5–300 saniyelik artan retry.
- SQLite için tek güncel `db/schema.sql` şema kaynağı; tarihsel migration zinciri yoktur.
- Talepler, müşteriler, basit raporlar, günlük işler, odalar, masalar ve rezervasyonlar için yan menüden açılan günlük yönetim ekranları, manuel talep oluşturma formu ve local status update IPC akışları.
- QR menü kategori/ürün yönetimi, local SQLite kaydı ve web modülüne yayınlama akışı.
- Menü ekranında webcam veya JPG/PNG/WebP dosyasından çalışan `AI ile Stok Ekle` akışı. Görsel döndürülüp analiz edildikten sonra yalnız stok takibi açık ürünler için adet/gram birimine uygun öneri taslağı gösterilir; açık kilogram miktarı gram ürünü için güvenli biçimde dönüştürülür. Kullanıcı satırları düzenlemeden ve açıkça onaylamadan stok değişmez. Uygulama görseli kalıcı saklamaz, yalnız SHA-256 özeti ve onay/audit kayıtlarını tutar.
- WhatsApp WebView çalışma ekranı, müşteri numarasına gitme ve manuel hazır mesaj kopyalama akışı.
- AI Yardımcı çalışma alanında seçili talep için düzenlenebilir cevap taslağı ve özet, günlük operasyon değerlendirmesi, ek talimat, yerel çalışma geçmişi, talebe kaydetme ve WhatsApp'a hazırlama akışları.
- İlk kurulum sihirbazı, uygulama veri klasörü altında SQLite dosyası ve ana panelden manuel `backups/` yedeği alma akışı.
- Ayarlar ekranında masaüstü ve web için ortak AI servisi/adres/model/anahtar/zaman aşımı yönetimi, bağlantı testi ve web modülüne otomatik yayınlama. Her servis kendi yerel profili altında saklanır; servis değiştirildiğinde bağlantı bilgileri ve son model listesi geri yüklenir. Gizli anahtar Electron `safeStorage` ile şifrelenir, başlangıç verisine eklenmez ve yalnız kullanıcı Ayarlar ekranında `Göster` dediğinde ana süreçte çözülür.
- Google AI Studio seçildiğinde API anahtarı ayrıntısındaki `Copy cURL quickstart` çıktısı tek alana yapıştırılır. Uygulama adresi ve anahtarı ayıklayıp Models API'den güncel görsel + metin modellerini çeker, küçük bir görselle bağlantıyı doğrular ve listeyi Google profili altında saklar. Model seçimi ek istek çalıştırmadan yalnız ayar değerini günceller.

Otomatik eşitleme ilk kurulumda açıktır. `Ayarlar → Gelişmiş Ayarlar → Web
Bağlantısı` bölümünden kapatılabilir; `Şimdi Eşitle` tek çevrimi her zaman elle
başlatabilir. İnternet yokken yerel kayıtlar çalışmaya devam eder ve bekleyen outbox
işleri bağlantı geri geldiğinde yeniden denenir. Web modülünün `protocol_version: 2`
ve `storage: sqlite` yeteneklerini sunması gerekir.

Installer hazırlığı için:

```text
docs/dev/DESKTOP_INSTALLER_PLAN.md
```

Kökten paketleme doğrulaması için:

```bash
npm run smoke:desktop-package
```

Windows 64 bit ve 32 bit installer çıktıları için:

```bash
npm run pack:desktop:win
npm run pack:desktop:win32
```

32 bit paket `electron-builder.win32.yml` üzerinden ayrı
`YardimciAsistan-Setup-<sürüm>-x86.exe` çıktısı üretir.
