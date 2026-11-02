# Site Trafiği V1 — Dashboard mini rapor planı (2026-11-02)

**Durum:** deploy öncesi uygulanacak tasarım sözleşmesi. Bu kayıt henüz sayaç kodunun devreye alındığı anlamına gelmez. **Paralel demo site / Efekt Atölyesi dosyaları kapsam dışı.**

## Kullanıcı deneyimi — birincil yer Dashboard

`apps/desktop-app/src/pages/DashboardPage.tsx`: Var olan sabit yükseklikte ve `overflow: hidden` Dashboard'a **yeni tam genişlikli satır veya yeni sayfa ekleme**. Sağdaki 330 px `dashboard-side` alanının en üstünde, web bağlantısı kayıtlı ve özellik açıkken tek `Site trafiği` kartı. Bu kartın görünürlüğü `sideVisible` hesabına da eklenir. Üstte `Sistem sağlığı` bağlantı/koruma durumları, altta `Şimdi yapılacaklar` operasyonları aynen kalır.

- Kompakt: başlık `Site trafiği`, **Bugün: X oturum** ve `Son 7 gün: Y` + önceki 7 güne karşı dönem eğilimi. Küçük örneklemde yüzdelik değişim vermeyip ham sayı göster. Son güncelleme zamanı / ölçüm yok / son bilinen veri ayrımı. Opsiyonel mini 7 günlük kıvılcım grafiği; kart yüksekliği kontrollü.
- Kart üstüne fare ile gelince, klavye odağı veya tıklama ile **yüzen detay kartı** (`Popover`): `7 gün / 30 gün`, oturumlar, sayfa gösterimleri, en çok ilgi gören ilk 5 sayfa/ürün/oda, kaynaklar `arama/sosyal/yönlendirme/bilinmiyor`, tıklama niyeti, doğrulanmış web talebi/sipariş adedi, son veri zamanı. Kapanma Escape/dışarı tıklama; erişilebilir düğme; sadece hover'a bağımlı değil. Önceden var olan `useAnchoredPopover` / `useDismissPopover` yordamlarını yeniden kullan. Açılır kart portal/top-layer olduğundan ana `overflow: hidden` içinde kesilmez. Uzun tablo kendi içinde scroll yapar.
- Özellik site/web bağlantısı yoksa **kart gizlenir**; bağlantı başarısızsa son veriyi `Son kayıt: 14:20 · Güncel değil` ile göster; ölçüm henüz başlamadıysa `Henüz veri yok`, doğrulanmış 0 ise `0`. İsterse kullanıcı `Yenile` ile yetkili özet sorgusunu tetikleyebilir. Çevrimdışı modda yeni ağ çağrısı yok.
- Ayarlar > `Web bağlantısı` altında yalnız site trafiği için `Etkin` aç/kapat seçeneği ve kısa veri bildirimi; **asıl sayılar burada değil**. Tanıtım/marketing paylaşımları analitiği ayrı kalır, yanlış "Site ziyaret verisi toplanmıyor" metinleri özellik açılınca gerçek ölçüm durumuyla uyarlanır.

## Ölçülecekler ve ne anlama geldikleri

1. **Yaklaşık ziyaret oturumu**, kesin tekil insan değil: `sessionStorage` kısa rastgele anonim token + 30 dk etkinlik aralığı + gün sınırı, sekmeler/tarayıcılar ayrı sayılabilir. Aynı oturumdaki sayfa dolaşımı tek oturum, ama her yükleme bir sayfa görüntülemesi. Veri eksikse/yüklenmediyse azaltılmış ölçüm olduğunu belirt.
2. **Sayfa görüntüleme:** görünür ve gerçek web sayfası yüklemesi; yalnız kanonik sayfa türü + isteğe bağlı sunucudan yayınlanan `ürün/oda` id. Full URL, querystring, arama metni veya hesap kimliği yok. Site/dealer/admin/test trafik ayrımını destekle; otomasyon/probe/önizleme/bot trafiği olabildiğince dışla.
3. **İlgi:** en çok bakılan sayfalar, ürün detayları veya oda detayları; sadece yayımlanmış içerikler. Restoran/kafe için menü, pansiyon için oda/galeri, Teknikel/market için katalog/ürün. Özellik kapalıysa o sektör grubu görünmez.
4. **İletişim niyeti:** kullanıcının WhatsApp/ara/yol tarifi bağlantısını seçmesi; bu **iletişim gerçekleşti** anlamına gelmez. Başarılı sipariş ve talepler ise mevcut server-side kanonik `web_orders`/`web_requests` kayıtları ile hesaplanır (client tıklamasından sonuç türetme ve çift sayma yok).
5. **Geliş kaynağı:** yalnız sınıf (`arama`, `sosyal`, `yönlendirme`, `doğrudan/bilinmiyor`), full referrer URL veya pazarlama query içeriği olmadan. Referrer yoksa doğrudan olduğu kesin söylenmez. Karşılaştırmalı günlük 7/30 gün toplamı, işletme saat dilimi.

## Mimari

- `web-site-template/public/assets/core/site.mjs` içinden küçük `traffic.mjs` başlat. Site boot/context hazır olduğunda yalnız `enabled && document.visibilityState==='visible' && !preview && !bot` için ilk `view` olayı; JS olmazsa site çalışmaya devam eder. Eylem eventleri **yalnız** açıkça izin verilen web CTA elementlerinde, global hareket/fare/tuş dinleme yok. Her event için kısa idempotency key.
- Aynı origin `firm-template/web-module/api/traffic.php`: yalnız JSON POST, alan/uzunluk/body sınırları, uygun Origin/Fetch Metadata denetimleri, sayfa/event enum allowlist, basit oran limiti, istemcinin keyfi `order_created` iddiasını kabul etmeme. IP/ham UA/referrer/mail/telefon/parola tutulmaz; IP yalnız bariz abuse için mümkünse saklamadan istek anında filtrelenir. Endpoint kamuya açık olduğu için sonuçlar **yaklaşık ve manipüle edilebilir**; değerleri finansal kayıt gibi değerlendirme. Sayaç hatası checkout/hesap/istek yüklemesini engellemez.
- Hosting SQLite (mevcut `firm-template/web-module/lib/storage.php`): kısa ömürlü hash/event dedupe + günlük toplulaştırmalar (`traffic_daily` + page/intent/source boyutları). Dedupe 48 saat, günlük agregalar varsayılan 90 gün; veri hacmi sınırı, JSON parametrelerini SQL'e dinamik katmama, mevcut WAL/transaction kuralları. Kaydı devre dışı bırakma ve ölçümleri temizleme desteği. Raporlar geçmiş toplanmaya başlamadan önce uydurulmaz.
- Yetkili rapor: mevcut `api/sync.php` içinde salt-okunur, token doğrulanan `traffic_snapshot` action. 7/30 gün period, normalize ve boyut sınırlı cevap, feature capability `traffic_analytics_v1`; kullanıcıya görünür özet **yalnız oturum açmış masaüstünde** IPC ile alınır. Secret renderer'a expose edilmez; mevcut transport/main-process bağlantısını tekrar kullan. İdeal olarak yan etkisiz snapshot ayrı HTTP GET yerine mevcut auth POST sync ve 15 s sınırında.
- Masaüstü rapor önbelleği: varsayılan Dashboard açılışında, akıllı aralıklarla (örn. 5 dk) ve manuel yenilemede; ağ kesikse cached snapshot + timestamp. Mevcut sync-coordinator'ın sipariş/puan kuyruğuna bağımlı olmamalı. Çoklu siteler için URL + source identity ile cache scope, yanlış işletmeye metrik sızdırma engeli. Web modülü devre dışıysa hiç yükleme yapma.
- Veri politikası: uzun ömürlü izleme çerezi / fingerprinting / kullanıcı profili yok. İşletmenin sitesinde anonim ölçümle ilgili kısa şeffaf bilgilendirme; işletme/ülke gereklilikleri gerçek yayın öncesi kontrol. Demo Alwaysdata alanlarında başlangıç verisi her zaman demo/test.

## Uygulama ve test sırası

1. `traffic.php` + saklama/aggregate + `traffic_snapshot` sync capability; PHP unit/integration: invalid origins, malformed/big event, replay/dedup, bot exclusion, timezones/day boundaries, retention, 401 authorized report, safe no-op if disabled.
2. `traffic.mjs` + ortak şablon boot ve 3 site tipi fixture; gerçek browser page view + CTA; test botu sayılmıyor, network failure siteyi bozmuyor.
3. Electron main-process transport + IPC read-only + UI Dashboard sağ kart/popover. Otomatik/manuel yenileme, offline stale, web bağlantısı kapalı, düşük trafik, farklı işletmeye geçiş, hover+klavye, Dashboard `no-scroll` ve responsive kontrol.
4. `web-site-template/tools/manifest.mjs --write` + gerekli kontrollü demo template sync **yalnız paralel demo çalışmaları bitince**; bağımsız sayfa görünümü/tema dosyaları paralel session tarafından sahiplenildiğinden onlara dokunma.
5. G1 Teknikel staging + demo site doğrulaması; sonra kullanıcı tetikli tam pre-main, release ve Windows/deploy. Gündoğdu, Tekel Pilot, BlackSea kapsam dışı; son şablonla beraber yükseltilecek.

## Kabul kriteri

- Gerçek ziyaret hareketliliği ile backend günlük sayılar tutarlı (veri yanılma sınırları açık); sayfa ilk yüklemede bir view, aynı event retry'da çoğaltma yok. Kişisel izleme verisi SQLite'ta yok.
- Site trafiği Dashboard sağ üst küçük kartta, web kapalıysa saklı; hover+click+keyboard erişimli detay kartı; dashboard kendi scroll'u oluşmadan çalışıyor.
- Site kapanmıyor ve ödeme/talep/sipariş akışları etkilenmiyor; farklı kaynaklı kayıtlar çift sayılmıyor; yanlış şirket hesabına veri görünmüyor.
- Testte gerçek talep/sipariş satırı, sahte tıklama ile oluşturulmuş sayılara karıştırılmıyor; offline/stale ve yeni açılmış veri seti doğru görünüyor.
