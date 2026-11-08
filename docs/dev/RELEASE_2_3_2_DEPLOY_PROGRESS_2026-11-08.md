# Yardımcı Asistan 2.3.2 — Dağıtım ilerleme ve devam notu (8 Kasım 2026)

**Önceki temel:** `docs/dev/RELEASE_2_3_2_PREDEPLOY_HANDOFF_2026-11-08.md`. Bu belge, önceki hazırlık raporundaki Windows engeli ve deploy yapılmadı ifadelerini günceller. Önceki rapor tarihsel kayıt olarak kalır.

## Paket kapısı tamamlandı

- Electron 44.7.0 x64 için GitHub `SHASUMS256.txt` indirmesi ağdan tıkandı. Resmî Electron arşivinin SHA-256 değeri `https://npmmirror.com/mirrors/electron/44.7.0/SHASUMS256.txt` üzerinden alınan listeyle eşleşti. `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` kullanılarak x64 ve x86 paketler üretildi; doğrulama **devre dışı bırakılmadı**.
- `npm run release:check` **PASS**. Windows x64 EXE: `3243bb03f13c222897c1101ee0c04e636ea2c34273f709fdb159421ef23bc98d`; x86 EXE: `0bf77593ec3e9f583bc945194f7fc07eedca74bbee48614e81205e0f92f8c9ec`.
- Android Companion 2.3.2 / 27: `a701e1ef8f5965f72ffd344b14f33a7f1c2e2fbae5ab809413e232e68e5ff87c`; Android Bayi 2.3.2 / 27: `aef3ae5e7549f1f64f863bc9fd81dd83140ea126cc0503e00c0bba78a19a3f88`. Her ikisi release imzasıyla doğrulandı.
- Ana web modülü 2.3.2 / 116 dosya ve demo ZIP A/B/C/D doğrulandı.
- `npm run deploy:landing -- --with-downloads --fresh-web-module --activate-updates --dry-run` **PASS**, canlı yazma yok. Log: `/tmp/ya-232-landing-deploy-dry.log`. Demo landing senaryo tarayıcı testi, eski 2.3.1 sabit test beklentisi yalnız geçici bir kopyada 2.3.2 yapılarak **PASS**; diğer oturumun kaynaklarına dokunulmadı.

## Tamamlanan canlı yayınlar

| Site | Web modülü | Site | Kanıt |
| --- | --- | --- | --- |
| Teknikel | 2.3.2, veri koruyan update | Site-only deploy PASS | `/tmp/ya-232-teknikel-backend-live.log`, `/tmp/ya-232-teknikel-site-live.log` |
| Gündoğdu | 2.3.2, veri koruyan update | Site-only deploy PASS | `/tmp/ya-232-gundogdu-backend-live.log`, `/tmp/ya-232-gundogdu-site-live.log` |
| Tekel Market pilotu | 2.3.2, veri koruyan update | Market site deploy PASS | `/tmp/ya-232-market-live.log` |

Her üçünün `/yardimci-asistan/api/version.php` HTTPS yanıtı bağımsız olarak **2.3.2 / 2.3.2** doğrulandı. Runtime/veritabanı, firma ayarları, bilgi dosyaları ve medya güncellemede korunuyor; site ve modül yedekleri alındı.

## Sonraki tur — kalan işler

1. **BlackSea Pansiyon** Natro: `../blacksea_web/scripts/prepare-natro-release.sh update` ile **veri koruyan** tam staging; `config/business.json`, `data/`, `knowledge/` asla üzerine yazılmasın. Güvenilen FTPS sertifika zinciri ve `scripts/deploy-natro-ftp.sh` ile dry-run; sonra canlı yayın ve HTTP/fonksiyonel smoke. `fresh-install` kullanma. BlackSea `scripts/prepare-natro-release.sh` şu anda başka oturumun dirty değişikliği; üzerine yazma veya otomatik commit etme.
2. **Ana demo/indirme**: üst landing dosyaları ve `scripts/lib/demo-deployment.mjs` başka oturumun dirty değişiklikleri olarak duruyor. Demo landing senaryo testindeki **sabit 2.3.1 beklentisi** yeni sürüme uygun hale getirilmeli; üretim tarafında sürüm `release.json` üzerinden dinamik. Çakışma çözülmeden toplu commit yapma. Deploy: `npm run deploy:landing -- --with-downloads --fresh-web-module --activate-updates --yes` — mevcut canlı 2.3.1, 2.3.2 feed'i ancak 4 dosya ve API HTTP+SHA/sağlık kontrolleri sonrası açılmalı.
3. **Git**: Yardımcı Asistan `main` origin'den 7 commit ileride (bu not commitle 8 olur); Teknikel 1; BlackSea 4; Gündoğdu temiz. Kalan paralel dirty dosyaları koruyarak kontrollü push yapılmalı. Yeni Git durumunu tekrar kontrol et.
4. **Kabul sınırları:** #87 ZIP import/restore fiziksel Windows testi ve x64/x86 gerçek Windows kurulum testleri hâlâ manuel. BlackSea masa rezervasyonu mevcut `restaurant_reservation` talep akışı; otomatik masa doluluk/slot motoru değil.

**Anlık canlı versiyon matrisi:** ana demo 2.3.1; BlackSea 2.3.1; Teknikel 2.3.2; Gündoğdu 2.3.2; Tekel Market 2.3.2. Ana sitede stable update feed'ler henüz etkinleştirilmedi.
