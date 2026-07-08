# Desktop App

İşletmenin ana yönetim merkezi olacak Electron + React + SQLite masaüstü uygulaması burada geliştirilir.

Uygulama local-first çalışmalı ve internet yokken oda, masa, rezervasyon ve müşteri takibini sürdürebilmelidir.

## Komutlar

```bash
npm run dev
npm run build
npm run pack:dir
npm run pack:win
npm run typecheck
```

Kökten çalıştırmak için:

```bash
npm run dev:desktop
```

## İlk Durum

Bu iskelet şu parçaları içerir:

- Electron ana pencere ve preload köprüsü.
- React tabanlı ana panel.
- Yeni talepler, bugünkü işler, oda/masa durumu, bekleyen rezervasyonlar ve WhatsApp hazır cevap kartları.
- `packages/sync-core` üzerinden web taleplerini çekmeye hazır IPC akışı.
- SQLite için ilk migration ve demo seed SQL dosyaları.
- Talepler, müşteriler, basit raporlar, günlük işler, odalar, masalar ve rezervasyonlar için yan menüden açılan günlük yönetim ekranları, manuel talep oluşturma formu ve local status update IPC akışları.
- QR menü kategori/ürün yönetimi, local SQLite kaydı ve web modülüne yayınlama akışı.
- WhatsApp WebView çalışma ekranı, müşteri numarasına gitme ve manuel hazır mesaj kopyalama akışı.
- İlk kurulum sihirbazı, uygulama veri klasörü altında SQLite dosyası ve ana panelden manuel `backups/` yedeği alma akışı.

Installer hazırlığı için:

```text
docs/dev/DESKTOP_INSTALLER_PLAN.md
```

Kökten paketleme doğrulaması için:

```bash
npm run smoke:desktop-package
```
