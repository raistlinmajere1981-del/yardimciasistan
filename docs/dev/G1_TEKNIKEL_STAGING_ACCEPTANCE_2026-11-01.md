# G1 Teknikel staging — 2026-11-01 kabul kaydı

## Kapsam

Yardımcı Asistan'a ait `yardimciasistantoptanci.alwaysdata.net` **yalnız test/demonstrasyon** alanıdır. Gerçek sipariş, tahsilat, davet veya müşteri iletişimi yürütülmez. Kaynak kod/Git korunur; test verileri değiştirilebilir.

## Tamamlananlar

- Masaüstü mevcut temiz SQLite üzerinde önce 28 görselli yayın ürünü, ardından 179 pilot ürün ve 30 sentetik demo müşteri canonical import servisiyle işlendi.
- Daha kapsamlı 849 kategorili ürünün üç parçalı transfer arşivi işlendi. Eksik KDV, stok, alış/bayi fiyatları ve açıklama alanları **yalnız DEMO** etiketli sentetik değerlerle tamamlandı. Yeniden eşleşen ürünler stok kodu/kaynak kimliğiyle güncellendi.
- Yerel 1.000 ürün: **849 aktif ve yayında**, **151 taslak**. 30 müşteri: 10 perakende, 10 pasif bayi, 10 aktif bayi (5 bayi A, 5 bayi B).
- HTTPS `/yardimci-asistan/api/catalog.php`: **849 ürün**, 24 görünür kategori, 1.668 yayınlanmış ürün görsel referansı, `pickup` teslimat kanalı. Genel API'de bayi özel fiyatı yok; örnek fotoğraf HTTP 200.
- Medya yükleme makbuzları: 1.694 yerel kayıt; iki kanallı kaynak/galeri tekrarları nedeniyle yayınlanan görsel referansı adediyle bire bir aynı olması beklenmez.
- Sipariş: test sitesinden `POST /api/order.php` HTTP 201. Aynı idempotency anahtarı ve içerik ikinci kez HTTP 201 + **aynı makbuz**; anahtar aynı fakat adet değişince HTTP 409. Masaüstüne **bir adet** `web-online-sales` siparişi `placed` olarak geldi; sunucu/web cursor 1/1. **0 satış**, **0 stok hareketi**.
- Bayi özel katalog yükü: doğrulanmış web hesabına bağlanmamış bayi için özel fiyat kataloğu artık oluşturulmuyor. Önceden bağlantısız 10 bayi × 849 ürün kaynaklı yaklaşık 15 saniyelik yayın timeout'u oluşuyordu; yeni snapshot 0 özel katalog ve 30 bağlantı satırıyla **~1 saniyede** yayınlandı; outbox 0.
- Hedefli derleme/E2E: Electron TypeScript derlemesi, `scripts/smoke-commerce-dealer-orders.mjs` (A/B izolasyonu, hesap doğrulama, web/Android, sipariş, makbuz, revizyon, iptal, stok/fiyat sahibi), hedefli ESLint ve Git whitespace denetimi geçerli.

## Açık işler / kesinlikle tamamlanmış sayma

1. **Gerçek Teknikel web hesabı testleri:** Staging sunucusunda halen 0 `customer_accounts`; 30 `dealer_access` satırı var fakat henüz hiçbiri doğrulanmış web hesabına bağlı değil, dolayısıyla `dealer_catalogs` 0. Gerçek hesap kayıt/posta doğrulama → Desktop account ingress → kullanıcı onaylı müşteri eşleştirme → A ve B özel katalog/fiyat E2E, bayi sipariş ve receipt/retry, demotion/logout/revoke yapılmalı. Hesap doğrulaması atlanmamalı. SMTP gerçek/sentetik kişilere e-posta göndermemeli.
2. Android Bayi gerçek Teknikel hesabı ve fiziksel APK üzerinden private katalog ve offline sipariş E2E.
3. Teknikel'in `canonical` yerel şablonu 0.5.0, fakat en yeni `account-session.js` hash güncellemesi henüz kopyaya taşınmadı. Siteye özgü tasarım ve ortak şablon eşitliği, ayrı kontrollü site güncellemesinde yapılmalı.
4. Tam pre-main/release/Windows/deploy sonraki resmi entegrasyon kapıları. Bu G1 veri aşamasında full verify yeniden çalıştırılmadı, başka sitelere veya demo tasarım session'ının dosyalarına müdahale edilmedi.

## Dosya sahipliği / Git

G1 Desktop yaması: `apps/desktop-app/electron/dealer-catalog-publication.ts` ve `scripts/smoke-commerce-dealer-orders.mjs`. Bu düzeltme bağlı olmayan bayinin private katalog fiyat verisini ve gereksiz büyük yayını atlar; bağlı doğrulanmış hesaplar için katalog akışı değişmez. Paralel demo oturumunun `test-site/landing/**` değişiklikleri G1 kapsamına **alınmaz**.

İşletme demo ayarı: Online Satış ve Bayi portalı açık, yalnız `pickup` online teslimat aktif; kargo/ödeme açılmadı. Demo hesap şifreleri, sync secret veya diğer kimlik bilgileri bu kayda aktarılmadı.
