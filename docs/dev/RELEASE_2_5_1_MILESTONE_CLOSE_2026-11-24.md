# Yardımcı Asistan 2.5.1 — Milestone kapanışı (24 Kasım 2026)

## Dağıtım
- Demo web modülü, demo sitesi, Windows x64/x86 kurulumları ve iki Android APK yayında; dört stable update feed'i 2.5.1 gösteriyor.
- Market Pilot 2.5.1 demo sitesi yayında; site ana sayfası HTTP 200.
- Üç sentetik 2.5.1 örnek ZIP'i demo site'sine ayrıca yüklendi; yerel, uzak ve canlı HTTP indirimi SHA-256 değerleri eşleşti.
- Teknikel sunum sitesi mevcut API ve katalog verileri korunarak güncellendi; site dağıtım sonucu `TEKNIKEL_SITE_DEPLOY_PASS`.
- Gündoğdu web modülü ürün sürümü 2.5.1'e yükseltildi; tanıtım sitesi ayrı dağıtıldı (`GUNDOGDU_SITE_DEPLOY_PASS`); daha önce yerelde değişmiş iki hero.scene.json korunarak yayınlandı.
- BlackSea yalnız sunum sitesi paketi, sertifika doğrulamalı FTPS üzerinden `natro-deploy-ok` ile yayınlandı; web modülü/runtime bu adımda değiştirilmedi.

## Kabul
- Yerel ortak şablon ve site release readiness: 12/12 PASS.
- Demo, Teknikel, Gündoğdu ve BlackSea canlı widget.js SHA-256 değeri ortak kaynakla birebir eşleşiyor: `b05275357128c29e327a4496f95883c517a05d9441181dcc3e5275787cc4e070`.
- Önceki full verify: 328/330; başarısız iki kontrol düzeltildikten sonra bağımsız gerçek tarayıcı koşularında geçti. Tam 330/330 yeniden çalıştırılmadı.
- Windows x64/x86 gerçek kurulum ve Windows ZIP restore (#87) kabulü kullanıcı tarafından ayrıca gerçekleştirilecek; donanım/cihaz testleri otomatik kabul kapsamında değil.

## Koruma
- Site yayınları mevcut demo/runtime verilerini korudu; üç site sunum paketlerinde API dosyası taşınmadı.
- Gündoğdu ve Teknikel sunucularında site yedekleri oluşturuldu. BlackSea FTPS aktarımında güvensiz FTP/TLS doğrulama kapatma kullanılmadı.
