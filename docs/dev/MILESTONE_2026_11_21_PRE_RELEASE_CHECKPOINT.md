# Yardımcı Asistan — 21 Kasım 2026 Yerel Milestone / Release Öncesi Kontrol Noktası

**Durum:** Yerel geliştirme tamamlandı; **release kabulü henüz verilmedi**. Kullanıcı `verify:release` çalıştırıp raporu getirecek. Sonuca göre düzeltme → sürüm artırımı → paket/Windows/Android kabulü → koordineli deploy sırası izlenecek.

## Kaynak ve sürüm durumu

- Repo: `YardimciAsistan`, `main`. Bu turdan önceki son HEAD `d2517f4d` (ROM kamera-intent düzeltmesi); yeni geliştirmeler henüz commit/push edilmedi. Başka çalışma ağacı değişiklikleri korunuyor.
- `product-version.json`: **2.4.0**, Android **versionCode 28**, web modülü **2.4.0**; `version:check` geçti. **Bunlar hâlen dağıtılmış sürümün kimlikleri.** Yeni kod aynı 2.4.0 kimliğiyle yayımlanmayacak; sonraki sürüm kodu/sürümü, release testi sonrasında kontrollü yükseltilecek.
- Güncel 2.4.0 yayın/indirme kanıtı: `artifacts/release-2.4.0/final-handoff.txt`. Oradaki kamera durumu 21 Kasım'ın erken saatlerine aittir. Sonraki kaynak kamera düzeltmesi fiziksel cihazda geçti; dağıtılmış 2.4.0 APK'sına eklenmedi.
- Staging ortamları `docs/dev/TEST_ENVIRONMENT_POLICY.md` uyarınca disposable; üretim kullanıcısı/verisi bulunmuyor. Test için şema yenilenebilir, ancak açık masaüstü veritabanına sessiz müdahale yapılmayacak.

## Bu milestone kapsamında birleştirilen işler

1. **Müşteri/stok/KDV:** Ticari müşteri kimliği, ideal stok ihtiyaçları, kategori bazlı KDV ve stok yeteneği; `MILESTONE_2_4_CUSTOMERS_STOCK_V2_2026-11-20.md`.
2. **Oda QR ve masa rezervasyonu:** Konaklamaya özgü token, masa/oda sipariş onayı, gerçek masa uygunluğu; `MILESTONE_3_ROOM_QR_TABLE_RESERVATIONS_2026-11-20.md`.
3. **Çok dilli SEO:** Tek dil otoritesi, canonical/hreflang/OG ve SEO Yönetimi; `MILESTONE_4_MULTILINGUAL_SEO_2026-11-20.md`.
4. **Gerçek checkout:** DEMO/simülasyon bayrağı temizlendi. Banka ve sözleşme doğrulanmamışsa checkout kapalı; Desktop/API/Web/Bayi aynı sürümde yayınlanmalı. Ayrıntı: `CONTINUATION_BACKLOG_2026-10-29.md` ilk bölümleri.
5. **Baskı:** Stok ihtiyaçları A4 çok sayfalı rapor ve QR Menü/Masa/Oda baskısı tek Baskı Yönetimi altında; oda girişi için OFF/ASK_CONFIRMATION/AUTOMATIC, manuel oda topbar işlemi. Bunlar yeni strict SQLite CHECK ve `qr_room_print_arrival_receipts` kaydı kullanır.
6. **Arayüz:** SEO overlay, servis kartları, gereksiz açıklama temizliği, Pazarlama/Analitik grid ve metinleri, ana ekran göstergeleri/Sistem Sağlığı/site trafiği (yalnız onclick), ürün formu, QR Menü, müşteri silme düğmesi, Veriler paneli.
7. **Android:** Ortak güncelleme bileşeni Companion ve Bayi uygulamalarının açık/koyu tema renkleriyle çizilir. Telefon üzerinde yeni APK/görsel son kabulü henüz yapılmadı.

## Release öncesi doğrulama listesi düzeltmesi

- `scripts/verification-registry.mjs` içine **6 yeni smoke** kaydedildi: `qr-menu-workspace-ui`, `qr-print-settings-ui`, `qr-print-integration`, `stock-replenishment-ui`, `stock-replenishment-print`, `seo-management-ui`.
- Ayrıca **5 sözleşme testi** eklendi: `customer-stock-v2`, `table-reservation-slots`, `qr-room-order-v2`, `seo-publication`, `seo-head-php`.
- `node scripts/verify.mjs --preset release --plan`: **328 benzersiz kontrol** (önce 317). Registry doğrulaması 10/10 geçti. Dört Node sözleşme testinin toplamı 16/16, SEO PHP head testi PASS.
- Müşteri/bayi testindeki eski beklenti düzeltildi: Wholesale kapanınca mevcut kayıtlı bayi durumu/fiyat grubu silinmez; IPC **yeni yetki veya fiyat grubu değişikliğini** Wholesale olmadan reddeder. Bayi yetkisi olmayan ticari müşterinin ödeme vadesi düzenlenebilir. `test-customer-stock-v2` ve `smoke-commerce-wholesale-ui-contract` PASS; `MILESTONE_2_4_CUSTOMERS_STOCK_V2_2026-11-20.md` güncellendi.
- Daha önce bu turda çalıştırılmış hedefli UI ve Android testleri ile Baskı/QR test kanıtları üstteki backlog maddelerinde ve ilgili script'lerde kayıtlı. Yeni **tam** `verify:release` henüz çalıştırılmadı.
- En son geniş `smoke-desktop-renderer` denemesi Ayarlar servis overlay'inde uzun süre beklediği için durduruldu: **PASS sayılmaz**. Release testi burada takılırsa log ve ekranı incelemek gerekir; yalnız hedefli dashboard testi geçti.

## Full → Release farkı: hedefli ön kontrol (21 Kasım 2026)

Kullanıcının 317 kontrollü full raporundaki ID'ler ile güncel 328 kontrollü release planı karşılaştırıldı. **Tam olarak 11 yeni kontrol** bulunuyor; full'den release'e çıkarılmış kontrol yok.

| Yalnız release planında bulunan kontrol | Hedefli sonuç |
|---|---|
| `lint-strict` | PASS — QR baskı entegrasyon fixture'ındaki kullanılmayan `device` temizlendi |
| `knip-strict` | PASS (yalnız konfigürasyon önerisi mevcut) |
| `design-audit-strict` | PASS — shared ActionButton servisi tasarım bileşenine taşındı, SEO/QR/print CSS tema tokenları kullanıyor; gereksiz çift CSS seçicileri birleştirildi; SystemHealth grid sayısı inline style olmadan data-count ile çözülüyor |
| `architecture-audit` | PASS |
| `git-diff-check` | PASS |
| `package-web-module` | PASS — 117 dosyalı paket, ZIP ve tar.gz yerelde oluşturuldu |
| `android-release-apk` | PASS — Companion release APK derlendi |
| `android-release-aab` | PASS — Companion release AAB derlendi |
| `dealer-android-release-apk` | PASS — Bayi release APK derlendi |
| `package-desktop-dir` | PASS — son CSS değişikliklerinden sonra `npm run build -w @yardimci-asistan/desktop-app` de PASS; Linux unpacked Electron paketi |
| `desktop-package` | PASS — paketli Linux Electron açılış ve disposable veritabanı smoke testi |

Tasarım revizyonundan sonra `smoke-dashboard-workspace`, `smoke-service-tiles-ui`, `smoke-qr-menu-workspace-ui`, `smoke-seo-management-ui` ve `smoke-print-management-ui` yeniden çalıştırıldı: **tamamı PASS**. Bu çalışma **release'i uçtan uca tekrar çalıştırmadı**, yalnız full ile release arasındaki farkı ve etkilenebilecek beş UI alanını doğruladı.

**Önemli:** Oluşturulan paketler mevcut repo sürümü **2.4.0 / Android 28** etiketini taşır, yayın dosyası olarak onaylanmaz ve dağıtılmadı. Git commit/push veya deploy yapılmadı. Sonraki sürüm artırımı, son release kabulünden sonra yapılacak.

## Sürüm/yayın kabulüne bırakılanlar

- **Release:** Kullanıcı `npm run verify:release` raporunu getirecek (release, pre-main kapsamını da içeriyor). Başarısız/atlanan kontrol varsa önce onu düzelt; `pack:release` / sürüm artırımı / deploy yapma.
- **Veritabanı:** Yeni QR/stock baskı türleri için strict CHECK ve oda giriş baskı kaydı vardır. Önceki yerel SQLite eski şemada olabilir; o oturumdaki masaüstü çalışırken yerinde müdahale edilmedi. Yeni sürüm ilk kurulumu öncesinde uygulama kapalıyken kontrollü disposable temiz DB ve demo ZIP üretimi/eşlemesi gerekir. Bu kontrolde repo içindeki `data/yardimci-asistan.sqlite` bulunamadığı için aktif kullanıcı veritabanının şemasının güncelliği **doğrulanmadı**.
- **Cihaz/yazıcı:** Gerçek yazıcıdan stok raporu ve QR baskısı; yeni Companion/Bayi APK fiziksel tema ve oda check-in otomatik/manuel baskı kabulü; Android kamera kaynak düzeltmesinin dağıtılan pakete geçmesi; Windows x64/x86 kurulum ve ZIP import/restore (#87) gerçek Windows'ta kabul.
- **Site:** Aynı versiyon API/şablon/masaüstü/Bayi sözleşmesi; SEO yayın push/ACK ve TR/EN roundtrip, sitemap/OG/canonical, BlackSea rezervasyon ve gerçek menü verisi, Teknikel/Gündoğdu/Market/Demo site şablon ve örnek ZIP eşitlemesi. Son ekran görüntülerinde **Web eşitleme hatası** görünüyor; site güncellemesinden sonra gerçek bağlantı/ACK ayrıca doğrulanmalı.
- **Harici SMTP:** Gerçek gönderen/DNS/worker ve gelen e-posta kabulü daha sonraki operasyonel kabul. Gerçek banka hesabı/sözleşme girilmeden checkout açık sayılmaz.

Bu kontrol noktası **Git temizliği, test kabulü, Windows/Android fiziksel doğrulaması veya canlı yayın yapıldı** anlamına gelmez. Bunlar release raporu sonrasında aşamalı yürütülecek.
