# 2.2.1 milestone — yayın ve Git kapanışı (2026-11-03)

## Sürüm sınırları

- Ürün, Windows x64/x86 ve Android Companion/Bayi: **2.2.1**, Android `versionCode=24`.
- Web modülü: **2.2.1**. Ortak işletme sitesi şablonu: **0.6.1**.
- Android APK'ları kalıcı release imzasıyla oluşturuldu. Windows NSIS EXE'leri üretildi; Authenticode sertifikası bulunmadığından Windows kod imzası yok (SmartScreen uyarısı görülebilir).
- `npm run release:check` 2.2.1 paketleri için **PASS** verdi. Ana deploy dört kurulum dosyasını canlı HTTPS üzerinden indirerek tam bayt sayısı ve SHA-256 ile doğruladı.
- 2026-11-02 tarihli `300/300` pre-main raporu, 2.2.1 sürüm artırımı ve son panorama düzeltmesinden **önceki** kaynağa aittir; daha sonra hedefli sürüm, şablon, BlackSea tarayıcı ve paket testleri geçti. Yeni bir tam verify koşusu yapıldığı iddia edilmez.

## Canlı dağıtım sonucu

- **Yardımcı Asistan landing + demo + merkezi web modülü:** `--with-downloads --fresh-web-module --activate-updates --yes` başarıyla tamamlandı. Demo runtime'ı bilinçli temiz kuruldu, eski test verileri taşınmadı.
- **Güncelleme feed'leri:** `win-x64`, `win-x86`, `android-companion`, `android-dealer` için canlı HTTP 200 ve sürüm **2.2.1** doğrulandı.
- **Demo ZIP'leri:** Pansiyon/Restoran, Market ve Market/Bayi 2.2.1 arşivleri atomik SCP ile yüklendi; üçünün de canlı HTTPS SHA-256/boyut eşleşmesi **PASS**.
- **Tekel Market Pilot 2:** bağımsız Alwaysdata web modülü ve pilot site güncellendi; runtime ve konfigürasyon korundu.
- **Teknikel Kombi:** web modülü, bayi uç noktaları ve kendi site dosyaları güncellendi; dağıtım scriptinin sürüm kilidi 2.2.1'e yükseltildi.
- **Gündoğdu Pansiyon:** web modülü ve özel site dosyaları güncellendi.
- **BlackSea Pansiyon:** Natro site + web modülü `update` paketi (silmesiz) üzerinden yayımlandı; ortak şablonun geçerli medya-ID'siz panorama kayıtları korunuyor.
- **Merkezi destek endpoint'i:** ayrı dağıtım scriptiyle güncellendi.
- Ana demo, Tekel, Teknikel, Gündoğdu ve BlackSea için canlı **HTTP 200**, web modülü `product_version=2.2.1` ve `web_module_version=2.2.1` doğrulandı.
- Müşteri sitelerinin bağımsız `main` kod kopyalarında ortak şablon 0.6.1 / 70 ortak dosya ve siteye ait ayarlar korunarak eşitlendi.

## Bilinen kabul sınırı

- Linux demo ZIP restore / yayın ve 0.6.1 şablon senaryoları hedefli testlerde geçti. **Issue #87'nin fiziksel Windows restore→yeniden bağlanma→yayın uçtan uca testi yeni kurucu güncellendikten sonra hâlâ yapılmalı**; issue bu kanıt gelmeden kapatılmamalıdır.
- Yeni Windows kurucularının gerçek Windows kurulum/SmartScreen testi ve Android'lerin gerçek cihazda OTA yükleme kabulü, paket hash doğrulamasından farklı ve henüz yapılmamış testlerdir.
- Demo hesaplarında gerçek müşteri, sipariş veya ödeme verisi yoktur; bu sürümde eski test runtime'ının korunması hedeflenmedi.
