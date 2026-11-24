# Yardımcı Asistan 2.5.1 — yayın öncesi devir (24 Kasım 2026)

**Durum: Yerel paketler ve hazırlık tamam. Canlı deploy, update feed aktivasyonu, Git commit/push yapılmadı.** Kamera yönetimi ayrı milestone'a bırakıldı.

## Demo sitesinin yetenek sistemi

- test-site/landing/inc/discovery.php ve locales/tr.json: mevcut 40 kanonik yetenek kartı/izin grafiği bozulmadan, 8 kart altında **14 alt işlev** ve açıklaması tanıtılıyor.
- QR menüden masa sipariş talebi ve masa QR çıktısı; konaklamaya özel QR ile odadan sipariş ve misafir hesabına aktarım; AI SEO taslak önerileri ve çok dilli web; Baskı Yönetimi, QR/etiket baskıları; ideal stok eksikleri, fiziksel sayım, AI fişten stok taslağı; kategori KDV varsayılanı; müşteri/bayi web checkout ve bayi özel fiyatları.
- Yeni iş akışı senaryoları: pension_room_qr ve market_stock. market_online durumu fiili V2 akışına uygun setup olarak güncellendi.
- Sınırlar açık: QR talebi işletme onayına bağlı, odadan sipariş için etkin konaklama/yayın gerekir, ihtiyaç listesi otomatik satın alma oluşturmaz, kartlı ödeme veya mali fatura iddia edilmiyor.
- PASS: npm run build:demo; demo template integrity; showcase browser smoke; landing scenario browser smoke; demo ZIP indirme testi; PHP lint. Editoryal değişiklikler nedeniyle 330'luk tam test tekrar koşturulmadı.

## Yerel 2.5.1 kurulumları

npm run pack:release ve npm run release:check PASS. Android versionCode 30; web modülü sürümü 2.5.0.

- Windows x64: dist/desktop/YardimciAsistan-Setup-2.5.1.exe (171947467 bayt), SHA-256 5007ca48fe78f9a5cb6db46a9e147ce61b5d6d82b61208e525c1b2adc36ac23e
- Windows x86: dist/desktop/YardimciAsistan-Setup-2.5.1-x86.exe (137290438 bayt), SHA-256 87b68432ea6401596607705f999fae65c11ab72c94fae1352fc9a6bee4cbffdf
- Companion Android: apps/android-app/build/outputs/apk/release/yardimci-asistan-release.apk (28118725 bayt), SHA-256 18debef932c97f8c15f41156152766fb1743d8d839dc877af8d9b747d57b44b6
- Bayi Android: apps/dealer-android-app/build/outputs/apk/release/yardimci-asistan-bayi-release.apk (3367555 bayt), SHA-256 deeb2af99dd8ebbdb0f5360c0ec5e6fea41fb884889e51f57cf68404a08e173f
- Web modülü: artifacts/web-module-deploy/ (117 doğrulanmış dosya); Companion release AAB da apps/android-app/build/outputs/bundle/release/ altında mevcut.
- CachyOS Wine /opt/wine-cachyos/bin/wine içindeydi ama PATH'de değildi; sistem paketine dokunulmadan ~/.local/bin/wine kullanıcı launcher'ı oluşturuldu.
- Windows NSIS EXE Authenticode sertifikasıyla imzalanmıyor (önceki yapılandırma); Windows SmartScreen uyarısı görülebilir. Android release APK imzaları ayrıca doğrulandı.

## Demo içerik ZIP dosyaları

Güncel 2.5.1 şemasından oluşturulup test edilen 3 paket:

- A Pansiyon + Restoran: test-site/landing/downloads/YardimciAsistan-OrnekVeri-pension-restaurant-2.5.1.zip
- B Market: test-site/landing/downloads/YardimciAsistan-OrnekVeri-market-2.5.1.zip
- C Market + Bayi: test-site/landing/downloads/YardimciAsistan-OrnekVeri-market-bayi-2.5.1.zip

Kaynak paketler ve manifest artifacts/demo-data/ altında. Hash/boyut kanıtı artifacts/verify/release-2.5.1-demo-samples.json içinde. İdeal stok/KDV/QR örnekleri korunuyor; canlı bağlantı/QR/banka/SMTP gizli değerleri üretilmiyor. Yalnız bu üç eski 2.5.0 sentetik ZIP, 2.5.1 dosyaları mevcut ve doğrulanmış olduğundan landing downloads klasöründen kaldırıldı.

**ÖNEMLİ:** Landing stageDemoDeployment ve --with-downloads otomasyonu sentetik ZIP'leri otomatik taşımıyor; downloads/ korumalı. Sonraki gerçek deploy sırasında 3 yeni ZIP ayrı ve silmesiz yüklenmeli, HTTP 200 + gerçek byte/SHA-256 kontrolü yapılmalı. downloads üzerinde --delete kullanılmamalı.

Teknikel D örnek ZIP: ../teknikel_web/assets/downloads/teknikel-demo-verileri.zip. SHA-256 0cfaa50371b6a975bad2f1b8804d886de14b2ef179c238fa7bba1f8a8de2843d. ZIP/SQLite quick_check PASS; tüm 140 tablo DDL güncel demo şemasıyla aynı. Özgün Teknikel katalog görsel kaynak arşivi mevcut olmadığından paket yeniden üretilmedi, 2.5.1 diye yeniden adlandırılmadı. Mevcut sitede korunmalı.

## Diğer siteler / ortak şablon

BlackSea, Teknikel ve Gündoğdu'da yalnız önceki ortak widget sürümünü ve kanonik manifesti güncel kaynakla eşitledik. Nexa widget SHA-256 b05275357128c29e327a4496f95883c517a05d9441181dcc3e5275787cc4e070.

- node --test scripts/test-active-site-template-parity.mjs: **5/5 PASS** (BlackSea, Teknikel, Gündoğdu, Demo ve ortak motor)
- node --test scripts/test-site-release-readiness.mjs: **7/7 PASS** (güvenli paket sahipliği, korumalı dosyalar, site şablonları)
- Gündoğdu'da bu çalışmadan önce değiştirilmiş assets/site/scenes/hero.scene.json ve canonical/public/assets/site/scenes/hero.scene.json aynen korundu. Bu iki dosyayı körlemesine sıfırlamayın.

## Yayın öncesi kontrol planı

- Yerel plan: artifacts/verify/release-2.5.1-local-deploy-plan.json. **165 demo site dosyası, 117 web modülü dosyası, 4 doğrulanmış dağıtım dosyası**. Üretildiği komut: node test-site/landing/scripts/deploy.mjs --plan-local --with-downloads --fresh-web-module --activate-updates. **Sunuculara bağlanmadı ve yazmadı.**
- Gelecek gerçek yayın sırası: web modülü temiz kurulum -> landing site -> Windows/Android indirmeler + üç ayrı sentetik örnek ZIP -> HTTP/SHA-256 doğrulama -> Windows/Android güncelleme feed aktivasyonu -> diğer site şablonları.
- Önceki 330'luk resmi release koşusu 328 PASS / 2 FAIL / 0 SKIP idi; iki web testi daha sonra bağımsız ve doğrulayıcı üzerinden PASS. Tek koşuda resmi 330/330 raporu yok. Hata stdout/stderr'i bundan sonra verify log dosyasında saklanacak.
- Gerçek Windows x64/x86 kurulum, Windows ZIP restore (#87), Android cihaz/güncelleme, ilk Desktop→Web sync ACK, fiziksel QR/yazıcı ve site smoke kabulü canlı yayın sonrasında ayrıca doğrulanmalı.
- **Bu turda canlı deploy, Git commit/push, güncelleme feed açma yapılmadı; kamera modülü dahil edilmedi.**

## Son release doğrulamasındaki iki oturum kırığı (24 Kasım 2026)

Önceki tam release: 330 kontrolün 328'i PASS, 2'si FAIL idi. Hatalar:
- commerce-checkout-members (#91): kayıt, SMTP doğrulama ve müşteri girişinden sonra account-profile gizli kalıyordu.
- web-dealer-portal (#303): HTTP login başarılı olsa bile tarayıcı oturumu guest durumundaydı.

Çözüm: firm-template/web-module/lib/customer-account.php ve customer-account-endpoint.php artık başarılı login yanıtında **sunucunun doğruladığı hesabın profilini** döndürür. web-site-template/public/assets/core/account-session.js bu profili login tamamlanınca atomik olarak authenticated durumuna alır; portal.js aynı yanıtı kullanır. Böylece ilave session GET'inin zamanlamasına bağımlılık kalkar. Eski backend ile ikinci session GET fallback'i korunur. Başarısız login, CSRF, logout, refresh ve role demotion kontrolleri aynen fail-closed kalır; test timeout'ları artırılmadı.

Kanonik account-session.js/portal.js ve template-manifest.json, Demo, BlackSea, Teknikel ve Gündoğdu yerel kanonik/servis kopyalarıyla eşitlendi; yeni siteye özel tasarım değişikliği yapılmadı.

**Resmi verify kontrolleri:**
- node scripts/verify.mjs --check commerce-checkout-members: 4/4 PASS (build-packages, build-desktop, php-lint, gerçek --members --mobile-only checkout). Rapor: artifacts/verify/2026-11-23T23-22-26-555Z.json
- node scripts/verify.mjs --check web-dealer-portal: 5/5 PASS (build-packages, build-desktop, build-demo, php-lint, gerçek web dealer portal). Rapor: artifacts/verify/2026-11-23T23-24-14-774Z.json
- Aynı iki gerçek senaryo paralel çalıştırılarak 2 tur tekrarlandı; üyelikli checkout 2/2 PASS, dealer portal 2/2 PASS.
- Hesap oturumu birim testleri 9/9 PASS (yeni: sunucu profil yanıtıyla ek session GET olmadan direkt giriş).
- scripts/smoke-customer-accounts.mjs PASS; scripts/smoke-web-storefront.mjs PASS; çapraz site şablonu 5/5 PASS; site release readiness 7/7 PASS.
- **Bu turda tam 330/330 verify paketi yeniden çalıştırılmadı.** Yeni raporlar başarısız iki kimliği önkoşullarıyla ve gerçek tarayıcı akışıyla doğrular.

Web modülü **artifacts/web-module-deploy/** içinde değişen PHP dosyalarıyla yeniden paketlendi (117 dosya). npm run release:check 2.5.1 + Android 30 için PASS. Windows/Android binary'leri etkilenmediğinden aynı hash'lerle korundu. Yerel deploy planı artifacts/verify/release-2.5.1-local-deploy-plan.json yeniden üretildi (165 site, 117 web, 4 binary, güvenli aktivasyon sırası). Demo ZIP'leri değişmedi.

**Henüz canlı deploy, otomatik güncelleme aktivasyonu, Git commit/push yapılmadı.** Kaynaklar ve hazırlık paketleri bir sonraki kontrollü deploy aşaması için hazır.
