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

## 1 Kasım akşamı — G1 canlı durum güncellemesi

Bu bölüm, yukarıdaki başlangıçta doğru olan **0 web hesabı / 0 private katalog** durumunun yerine geçen yeni gözlemleri kaydeder:

- **İki doğrulanmış ve masaüstüne bağlanmış Teknikel test hesabı** mevcut; biri bayi A, diğeri bayi B fiyat grubunda. Hesap kimliği veya şifre bu belgeye yazılmadı.
- Alwaysdata sunucusunda **iki ayrı private katalog, her birinde 849 ürün** yayınlandı. Fiyatların tamamı A/B gruplarında farklı; yetkisiz `dealer/catalog.php` ve `dealer/orders.php` çağrıları HTTP **401**.
- İlk private yayın fotoğrafları atlamıştı. `prepareDealerProductMedia` üzerinden mevcut 1.694 medya yükleme makbuzu kullanılarak yeniden yayın yapıldı. Sunucu SQLite bağımsız denetiminde **her iki katalog: 849/849 kapak URL'si, 1.668 görsel referansı**. Gerçek tarayıcıda önce `Görsel yok` iken kullanıcı sonraki ekran görüntüsünde conta ve ventil fotoğraflarının doğru yüklendiğini doğruladı. Yeni ürün ithalatı gerekmedi.
- Perakende web siparişi masaüstüne önceki çalışmada **tek** kayıtla alınmıştı (web imleci `1/1`). Bayi siparişi canlı hesap üzerinden **henüz gönderilmedi**; canlı login/sipariş/receipt E2E'nin tamamlandığı iddia edilmemeli.
- `node scripts/smoke-commerce-dealer-orders.mjs` yeniden PASS: izole sentetik API/desktop senaryosunda A/B fiyat izolasyonu, web/Android oturumu, idempotency, makbuz kurtarma, canonical fulfillment ve yetki iptali.
- Samsung SM-J700F Android 13, USB/ADB bağlı. Kurulu `com.yardimciasistan.dealer`: **2.1.5 / versionCode 21**; soğuk açılış `Status: ok`, ön planda ve logcat ilk bakışta çökmüyor. `com.yardimciasistan.android` Companion da kurulu. Varsayılan LTE bağlantısı `VALIDATED`, sistem HTTP proxy `null`, Teknikel alan adı ICMP/DNS erişimi başarılı. Bu **uygulama içinden canlı HTTPS login** kanıtı yerine geçmez.
- Kod deposunda paralel demo tasarım session'ının `test-site/landing/**` dosyaları değişmekteydi; G1 bu dosyaları değiştirmedi veya stage etmedi.

**Açık kalan canlı kabul:** İki bayi hesabıyla gerçek web oturumu üzerinden özel fiyat/ürün/fotoğraf → bayi sepeti → sipariş → aynı idempotency anahtarıyla replay → receipt → masaüstü canonical tek aktarım → Android Bayi mobil oturum/offline sipariş. Çalışma yöntemi izin vermezse kullanıcının test sitesinden tek bir demo siparişi göndermesi ve bunun ardından sipariş/makbuz/senkronun sadece okunarak doğrulanması en düşük müdahaleli yoldur. Tam pre-main/release ayrı kullanıcı tetiklemeli kapı olarak kalır.

## 2 Kasım — bayi geçmişi yayın süresi ve fiziksel Android fixture

- Canlı Teknikel bayi siparişi `web_dealer_order_856995ee5dd5f22b321e2f25a63b9f9c`: sunucuda 1 sipariş + 1 makbuz, A grubu özel katalog fiyatlarıyla **₺631,58**, masaüstünde `web-dealer` kaynaklı **1** kanonik sipariş, iki satır ve doğru müşteri, web imleci `2/2`. Sipariş güvenle teslim edildi; ödeme/satış/stok hareketi oluşturulmadı.
- Siparişten sonra bayi özel katalog ve sipariş geçmişi yeniden yayınlandığında 15 saniyelik genel HTTP zaman aşımına takılabildi. `packages/sync-core/hosting-transport.ts` içinde **yalnız `publish_dealer_access` için 45 saniye**, diğer sync isteklerinde 15 saniye korundu. `apps/desktop-app/electron/sync-coordinator.ts` dış sınırı buna izin verecek şekilde 45 saniyeye çıktı (normal sync-core eylemleri iç 15 saniye sınırını koruyor).
- Hedefli doğrulama: sync-core **72/72 PASS**, bayi timeout regresyon testi PASS, Electron TypeScript derlemesi PASS, sync timeout + commerce dealer smoke PASS, ilgili ESLint ve `git diff --check` PASS. 2 Kasım ilk kontrolde outbox boş, son senkron başarılı ve hata sayısı sıfırdı. Kod düzeltmesinin canlı büyük yayın üzerinde yeniden deneyimi henüz ayrıca kayda alınmadı.
- Samsung J700F Android 13 üzerinde `scripts/smoke-dealer-android-device.mjs` gerçek cihaz fixtürü **PASS**, instrumentasyon `-1`; gerçek yerel TLS/PHP hesap girişleri ve sipariş tekrarları, özel fiyat, demotion, çevrimdışı sepet, galeri/dokunma/rotasyon/bitmap döngüleri kapsandı. Fixture ayrı paketle kurulup temizlendi; normal `com.yardimciasistan.dealer` kurulumunun giriş/verileri korunmuştur. **Gerçek Teknikel web hesabıyla Android Bayi login ve sipariş E2E açık**.
- Paralel demo vitrin session'ının `test-site/landing/**` dosyalarına müdahale edilmedi. Resmî full pre-main / release sonraki aşamadır.

## 2 Kasım — gerçek Android Bayi → Teknikel → Desktop kabulü

**PASS (SM-J700F / Android 13 / normal Bayi APK 2.1.5, versionCode 21).** Kullanıcının telefonda manuel olarak açtığı doğrulanmış **Bayi B** oturumu üzerinden bağımsız kaynak/kalıcılık ve gerçek HTTPS uçtan uca işlem yapıldı:

- Uygulama canlı Teknikel kataloğunu, marka/kategori filtrelerini ve ilk ürün fotoğrafını gösterdi. `53250100041` stok kodlu `1/2 CONTA YEŞİL KALIN YANAK` ürünü **₺157,90** kayıtlı özel fiyatla listelendi.
- Ürün **1 adet** sepete eklendi; sipariş notu `G1_ANDROID_BAYI_TEST_20261102`, yöntem `pickup`. Android uygulaması `force-stop` + soğuk yeniden açılış sonrasında Keystore ile korunan sepeti **1 ürün** olarak ve notu aynen sakladı. İlk açılışta çevrimdışı/salt okunur görünüm vardı, aynı işletme bağlantısına tekrar dokununca kaydedilmiş oturum yeniden doğrulanarak **yeniden şifre girmeden** Bayi B kataloğuna dönüldü. Gerçek ağ koparma/simüle offline submit uygulanmadı; çevrimdışı davranışın kapsamlı fixture doğrulaması ayrı.
- Telefonda **yalnız bir kez** `Siparişi gönder` kullanıldı. Yeni sunucu referansı `web_dealer_order_c86c0871a89ee97e7a3b8ee076bf37a3`; sipariş referansına ait **1 sunucu satırı + 1 kabul makbuzu**, sunucu hesaplanan özel fiyat **₺157,90** ve mobil elden teslim / test notu eşleşti.
- Desktop `commerce_orders` içinde bu referansa bağlı **tam 1 `web-dealer` / `placed`** kayıt ve `commerce_order_items` içinde **1 adet** aynı SKU/₺157,90 satır var; müşteri bağlı. Sunucu içe alma onayı var; `web_order_cursor=3` ve `web_order_acknowledged_cursor=3`.
- Telefonun **Siparişler → Yenile** görünümünde yeni ₺157,90 test siparişi en üstte; eski ₺631,58 web bayi siparişi ayrı. Sipariş tekrar gönderilmedi; canlı idempotency replay denemesi yerine daha önce PASS olan sentetik fixture kullanıldı.
- 14:11 (Europe/Istanbul) son durumda outbox **0**, `consecutive_failures=0`, senkron başarı kaydı mevcut; toplam **2 web-dealer + 1 web-online-sales** kanonik test siparişi, **0 ticari satış**. Büyük bayi yayını için 45 saniye sınırı hedefli testlerle ve bu canlı senkronla uyumlu görünüyor.
- Android APK kurulumu, masaüstü kullanıcı verileri ve paralel `test-site/landing/**` çalışmaları korunmuştur. Hiçbir parola/özel token kaydedilmedi ve yeni deploy/push yapılmadı.

**G1 durumu:** Gerçek Teknikel web ve Android Bayi sipariş kabulü, fiyat/makbuz ve Desktop tek aktarım zinciri **PASS**. Kalan bağımsız kabul başlıkları: Android APK imzalı update/rollback güvenliği, farklı bayi hesabı ve canlı erişim iptali, resmi tam pre-main ve release. Bunlar bu sipariş sonucunu geçersiz kılmaz; ayrı doğrulanmalıdır.
