# Yardımcı Asistan 2.5.0 — temiz yayın ve kurulum devri (21 Kasım 2026)

## Kabul ve sürüm

- Kullanıcı tarafından çalıştırılan `artifacts/verify/2026-11-21T18-50-15-538Z.json`: **328 PASS / 0 FAIL / 0 SKIP**.
- `product-version.json`: Desktop **2.5.0**, Android Companion/Bayi **2.5.0 (versionCode 29)**, web modülü **2.5.0**.
- `npm run pack:release` ve `npm run release:check`: PASS. Sonradan `npm run android:release-aab`: PASS.
- Son değişikliklerden sonra `npm run lint:strict`: PASS. `node scripts/test-active-site-template-parity.mjs`: **5/5 PASS**. `git diff --check`: PASS.
- Windows kurucularında işletim sistemi tarafından doğrulanmış yayıncı imzası yok; kullanıcı tarafından gerçek Windows x64/x86 kurulum ve import/restore kabulü henüz yapılmadı.

## Hazırlanan / yayımlanan kurulum dosyaları

| Dosya | SHA-256 |
| --- | --- |
| `YardimciAsistan-Setup-2.5.0.exe` (x64) | `776bab8b4fdae01a46ebcdc0efc42b4ebe1d4601a0908621b9e69cc0dd78cc89` |
| `YardimciAsistan-Setup-2.5.0-x86.exe` | `8e35e9c84f9822296a07ef5d5deb1cb56d0184e78ac444cae3088a6d3befbc3b` |
| `YardimciAsistan-Android-2.5.0.apk` | `23b35e64143f73c854ca17b6419731aa9e66af5f19b20a18c3d0f9fc547cff99` |
| `YardimciAsistan-Bayi-Android-2.5.0.apk` | `a72d67b1e72e8383b9fa52f262e608d6899ca1a9db41c2c01014117154f2083a` |

Dördü de `https://yardimciasistan.alwaysdata.net/downloads/` altında HTTP 200 ve SHA-256 ile doğrulandı. Windows x64/x86, Android Companion ve Bayi update feed'leri **2.5.0** döndü. APK/AAB yerel kaynakları `apps/*/build/outputs/`, EXE'ler `dist/desktop/` altındadır.

## Beş temiz web kurulumu

| Site | Dağıtım | Kabul |
| --- | --- | --- |
| [Yardımcı Asistan Demo](https://yardimciasistan.alwaysdata.net) | Web modülü --fresh, landing ve yayın güncellemeleri | Ana sayfa + sürüm HTTP 200, güvenlik/işlem uçları ve indirmeler PASS |
| [Teknikel](https://yardimciasistantoptanci.alwaysdata.net) | Web modülü --fresh, site-only sunum, yeni Teknikel örnek ZIP | Ana sayfa / API 2.5.0 ve ZIP HTTP SHA-256 PASS |
| [Gündoğdu](https://yardimciasistangunduodu.alwaysdata.net) | Web modülü --fresh, site-only sunum | Ana sayfa / API 2.5.0 PASS |
| [Market Pilot](https://yardimciasistantest.alwaysdata.net) | Web modülü --fresh; site-only sunum | Ana sayfa / API 2.5.0 PASS |
| [BlackSea](https://blackseapansiyon.com) | Natro fresh-install; yeni runtime, doğrulanmış FTPS | `natro-deploy-ok`, ana sayfa / API 2.5.0 PASS |

Tüm siteler temiz runtime ve yeniden üretilmiş, **siteden ayrı saklanan** senkronizasyon anahtarları ile hazırlandı. Eski site verileri yeni kurulumlara **taşınmadı**. Deployment scriptlerinin tutmuş olduğu eski sürüm rollback yedekleri operasyonel amaçlıdır; bunlardan restore yapılmadı. Yeni masaüstü/Android eşleştirmeleri kurulurken siteye özel anahtar gerekecektir.

- Kurulum bilgileri Git dışında, erişim kısıtlı: `artifacts/ya/install-info.txt`, `artifacts/teknikel/install-info.txt`, `artifacts/gundogdu/install-info.txt`, `artifacts/market-pilot/install-info.txt` ve BlackSea için `../blacksea_web/.deploy/yardimci-asistan-install-info.txt`.
- BlackSea FTP portunda eksik Sectigo R36 ara sertifikası resmi AIA adresinden alındı, sistem trust root'u üzerinden alan adıyla doğrulandı; `ssl:verify-certificate true` ve korumalı FTPS kullanıldı. Güvensiz FTP hiç kullanılmadı.
- Market Pilot'da yeni modül zaten temiz kurulmuşken yeniden güncellemeyi tetikleyen mevcut `--yes` yolu, korunan `media/.htaccess` farkını işaret etti. Bu nedenle yalnız web sunumunu taşıyan, API 2.5.0 ön koşulu kullanan `--site-only` yolu eklendi; son canlı yayın PASS.

## Yeniden üretilen örnek ZIP verileri

Kaynak üretici `scripts/demo-data/` üzerinde kategori `default_tax_rate` ve ürün `ideal_quantity` alanlarını doldurur. `scripts/demo-data/lib/verify.mjs` gerçek stok ihtiyaç okuma servisini, SQLite bütünlük/secret/hash kurallarını doğrular. **Dört paketin tamamı PASS.**

| ZIP paketi | Hedef stok altında / yeterli ürün | Diğer |
| --- | --- | --- |
| A Pansiyon + Restoran | 3 / 11 | 5 kategori %10 KDV; ayrı %20 ürün örneği |
| B Market | 4 / 6 | 2 stoksuz ürün; 3 kategori %10, 2 kategori %20 |
| C Market + Bayi | 4 / 8 | 2 kategori %10, 2 kategori %20 |
| D Teknikel | 15 / 164 | 179 ürün / 68 görsel / 30 müşteri; kategori %20 |

A/B/C `/kurulum/` altındaki 2.5.0 indirme ZIP'lerine yayımlandı; her biri HTTP 200 + SHA-256 PASS. D paketi `https://yardimciasistantoptanci.alwaysdata.net/assets/downloads/teknikel-demo-verileri.zip` adresinde HTTP 200 + SHA-256 PASS. Tüm paketler yerelde `artifacts/demo-data/` altındadır.

Bu ZIP'ler **yeni temiz masaüstü kurulumu** sonrasında import/restore testi içindir; canlı web verilerine otomatik yüklenmez. Oda QR tokenları, erişim sırları, SMTP ve gerçek banka yapılandırması pakete konulmaz. Gerçek onay/ödeme/cihaz süreçleri ilk pilot kabulünde ayrıca test edilir.

## Sonraki fiziksel kabul

Windows x64/x86 kurucularını gerçek Windows'ta çalıştırma, ZIP restore (#87), Android Companion/Bayi fiziksel kamera ve güncelleme arayüzü, QR oda/masa çıktı alma, gerçek yazıcı ve temiz veriden ilk Desktop → Web senkronizasyonunun başarı ACK'i hâlâ sahada yapılacaktır. Bu testler tamamlanmadan işlevsel cihaz kabulü verilmiş sayılmaz.
