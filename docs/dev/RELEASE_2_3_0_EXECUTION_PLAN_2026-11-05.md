> **Geçerli kapsam (2026-11-05):** Ürün ve web modülü **2.3.0**, Android versionCode **25**, ortak şablon **0.7.0**. R4 “Canlı kabul testleri” asistan tarafından **çalıştırılmayacak**. Deploy sonrası kullanıcı Windows'ta Teknikel, Gündoğdu ve BlackSea'ye bağlanıp ilgili demo ZIP içeriklerini ve görünmesini istediği servisleri yayımlayacak, ardından bağlantıyı kaldıracak; resim efektlerini de kendi test edecek. Asistan yalnız güvenli dosya aktarımı, temel sürüm/manifest/erişim sınırları ve paket doğrulamasını üstlenir. Demo/pilot siteye önceden içerik seed edilmez. Tam 307'lik release testi tekrarlanmayacak.

# Yardımcı Asistan — 2.3.0 pilot release kapanış planı

Tarih: 2026-11-05 · Durum: **Planlandı; henüz sürüm artırılmadı, deploy yapılmadı.**

## Karar ve mevcut kanıt

Mevcut ürün ve web modülü sürümü **2.2.1**; Android versionCode **24**; aktif ortak şablon **0.6.1**. Hedef önerisi **ürün 2.3.0**, **web modülü 2.3.0**, **Android versionCode 25**, **ortak şablon 0.7.0**. Şablon numarası kaynak ile dört kurulu manifest aynı anda güncellenmeden değiştirilmez.

Son tam release raporu `artifacts/verify/2026-11-04T22-45-43-896Z.json`: **304/307 PASS, 3 FAIL** (desktop-ui-family, table-order-benefits, web-dealer-portal). Üç test, ilgili smoke komutlarıyla **3/3 PASS** ve registry üzerinden bağımlılıklarıyla `scripts/verify.mjs --check` kullanıldığında **3/3 PASS**. Kullanıcı tam release'i tekrar çalıştırmamayı seçti. Ortamda ekran koruyucu, USB ayrılması ve bağlantı kesilmesi yaşandı ama bu durum kesin kök neden olarak ispatlanmadı. **Resmî yeni 307/307 raporu yoktur; bu istisna kanıt ve risk kararıyla kabul edilmiştir.** Sonraki kod değişiklikleri yalnız hedefli testlerle doğrulanacak.

Kullanıcı, Yardımcı Asistan'ın `backup` ve `data` klasörlerini temizlediğini bildirdi. Ek olarak 2026-11-05 tarihinde aşağıdaki **yalnızca Git dışı yerel test verisi** silindi: `teknikel_web/.test-artifacts` (~38.8 MiB), `gundogdu_web/.test-artifacts` (~102.4 MiB), `EfektAtolyesi/.test-artifacts` (~5.5 MiB), ana repo `artifacts/desktop-menu-db-smoke`, `finance-db-smoke`, `desktop-package-smoke-data` (toplam ~72.3 MiB). Genel toplam yaklaşık **219 MiB**. Silme öncesinde her hedefte Git takipli dosya=0 ve symlink=0 doğrulandı. `artifacts/verify`, build/release kanıtları, özel tema/medya, kaynak sahneler ve firm-template içindeki güvenlik şablonları korundu. Uzak test verileri henüz silinmedi; eski efekt kayıtları için migration yapılmayacak.

## Sıralı release parçaları

### R1 — Dağıtım kilidini güvenli aç (yüksek öncelik; ~tek küçük oturum)

1. Teknikel/Gündoğdu `scripts/deploy-site.sh --yes` şu anda **bilerek exit 4 ile kilitli**. Bu yolu, önce HTTPS/SSH üzerinden **tam hedef site kimliği, origin, web modülü sürümü ve mevcut dosya hash'i** doğrulayan; yalnız izin listesine alınmış eski kod dosyalarını emekli eden, hedefli ve denetlenebilir mekanizmayla değiştir. Mevcut `scripts/retired-paths.json` envanterleri **Teknikel 19, Gündoğdu 32 eski kod yolu** içerir; uzaktaki hash farklıysa dur, körce silme. Dosya bazında aşamalı kopyalama/aktivasyon ve kontrol sonunda dağıtım makbuzu üret.
2. Her sitenin `.htaccess` eski JS/PHP yolunu engellesin. `yardimci-asistan` API/web modülü, kimlik bilgileri, kullanıcı dosyaları, site fotoğrafları, ürün katalog medya kaynağı ve demo ZIP üretim kaynakları kesinlikle kapsam dışı. BlackSea kendi staging/FTP/yayın kimlik kapısıyla ayrıca doğrulansın. Uzak hedef yabancı veya tanımlanamıyorsa **fail closed**.
3. Hedefli sürüm/manifest/retired path testleri + yalnız dry-run. **Bu aşamada canlı sunucu silinmez/deploy edilmez.**

### R2 — Ürün ve şablon sürümlerini bir noktadan yükselt

1. Paralel oturumlar varsa ana kaynak değişikliklerini durdur; tüm repo `git status` ve farklarını denetle; başkasının çalışmasını geri alma veya genel `git add -A` uygulama.
2. Merkezi `product-version.json` üzerinden **2.3.0 / Android 25 / web module 2.3.0** uyumunu sağla; `version:sync` ve `version:check`, gerekli Android versionCode/package metadata ve HTTPS güncelleme manifestlerini doğrula.
3. Ortak şablonu **0.7.0** numarasıyla yayınla; ana manifesti ve Teknikel/Gündoğdu/BlackSea/demo aktif kurulumlarını mevcut üç yönlü, hash kontrollü araçlarla yeniden senkronize et. Kanonik Efekt Atölyesi ile site/vendor/Admin **19 modül ve gerçek kaynak SHA-256** eşitliği korunmalı.
4. Yalnız sürüm, updater, template ve yayın sözleşmesi hedefli testlerini çalıştır. Tam `verify:release` yeniden çalıştırma kararı alınmadı.

### R3 — Temiz paket ve test ortamlarının sıfırdan kuruluşu

1. Windows **NSIS x64/x86**, Android **Companion** ve **Bayi** imzalı APK / stable manifest, hosting web modülü, ortak site şablonu, demo site ve ZIP örnek içeriklerini üret. Paketleme makbuzlarında sürüm, boyut, SHA-256 ve hedef bağlantı kimliği kontrolü olsun.
2. Staging web modüllerini önce hedef ve kimlik kontrolüyle temiz kur; uzak veritabanlarında **test kullanıcıları, hesaplar, siparişler, rezervasyonlar, puanlar, yayın outbox/ACK/epoch ve eski efekt kayıtlarını** temiz başlangıç kabul et. Uygulama bağlantısını yeniden oluştur; **eski kaynak için migration/backfill yok**. Ancak servis için gereken yeni secret/kimlik güvenli biçimde üretilir, public çıktılara girmez.
3. Sonra Teknikel, Gündoğdu, BlackSea ve demo sitelerini yeni aktif ortak çekirdekle yükle/etkinleştir. Teknikel'in demo ürün medyası ve ZIP örnekleri mevcut üretici/ithalat paketinden yeniden oluşturulabilir; üçüncü taraf müşteri verisi taşınmaz.
4. Desktop/Android cihazları yeni sürüm ve temiz bağlantıyla eşleştir. Çalışan paketleri, henüz sahne/provenance uyumunu kanıtlamayan eski üretim sitesine bağlama.

### R4 — Kısa gerçek sistem kabulü ve düzeltme

* Dört sitenin HTTP kimliği, başlıkları, içerik kaynakları, manifest hash'leri ve private path/secret erişimi. Eski kod yolları 403/404; yeni `assets/core` ve `vendor/effect-engine` doğru içerik hash'i.
* **AI kapalı / Talepler açık** ve tersi; WhatsApp ve özel yayın izinleri. Çoklu Dil kapalıyken yalnız Türkçe, yayımlanmış EN/DE/AR ve RTL; eski çeviri hash'i sızıntısı yok.
* Teknikel: bayi/perakende giriş, özel fiyat izolasyonu, sepet, sipariş idempotency ve tekrar deneme, hesap geçmişi. Gündoğdu: 180°/360° panorama, tam ekran/Escape, yayın oda/masa/QR, bozuk efektte statik fotoğraf. BlackSea: Cide tasarımı ve scene fallback. Demo: ZIP indirme/içe aktarma, açıklayıcı test alanı.
* Yayın outbox: **bütün yayın türlerinin ACK tamamlanması** ve yeni kaynak/epoch tutarlılığı. Sadece bağlantı kurulması başarı sayılmaz. Hasta/gerçek müşteri verisi kullanılmaz; sahte test girdileri ile çalışılır.
* Windows cihazında demo ZIP listeleme, import/restore sonrası site yayınının yeniden oluşması (eski issue #87) en az bir manuel smoke. Android Companion ve Bayi güncelleme/bağlantı smoke.
* Fail olursa yalnız sorunlu hedef ve yakın bağımlılık testleri, yeniden 30–40 dakika tam test **otomatik yok**.

### R5 — Git ve milestone kapanışı

1. `YardimciAsistan`, `EfektAtolyesi`, `teknikel_web`, `gundogdu_web`, `blacksea_web` repolarında yalnız doğrulanan ilgili değişiklikleri gözden geçir, anlamlı commit ve `main` push; başka sessionın işlerini yanlışlıkla stage etme. `ChannelFoundry` ayrı çalışma alanıdır ve bu release'e otomatik dahil edilmez.
2. Son sürüm checksum'ları, Windows/Android update manifestleri, Hosting URL/kimlikleri ve dört site canlı kabul raporunu belgeye kaydet.
3. Temiz veri kararını, hangi testlerin gerçekten yapıldığını ve tam release doğrulamasındaki **304/307 + üç bağımsız PASS** istisnasını kapatma kaydında dürüstçe göster. İsterse kullanıcı release ardından ayrıca tam test raporu alabilir; otomatik zorunlu koşul değil.

## Net durak koşulları

- **Şimdi R1:** Hedefli uzak dosya emekliye ayırma/kimlik kontrolü açılmadan hiçbir canlı sitede yazma/silme yok.
- **R2:** Sürüm değiştikten sonra bütün bağımsız module/template sürümü, manifest ve efekte ilişkin hash doğrulanmış.
- **R3:** Yeni kurulumun başında verilere ihtiyaç duymadan bağlantı ve yayın yeniden çalışıyor; geçmişi taşımıyoruz.
- **R4:** Kritik login, ticari izolasyon, sipariş, panorama ve erişim reddi senaryoları canlıda kanıtlanmış.
- **R5:** Çalışma ağaçları temiz, ilgili repolar push edilmiş, release makbuzları ve kısa kalan işler belgelendirilmiş.
