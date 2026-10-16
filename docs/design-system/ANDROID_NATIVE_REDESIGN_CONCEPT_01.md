# Android Native Redesign — Konsept 01 (Pixco × Stitch)

Tarih: 16 Ekim 2026 · Aşama: **Superdesign görsel taslak / native koda aktarılmadı**

## Karar ve hedef
Kullanıcının yeni tasarım yönü: mevcut 2.0.8 görünümünü taklit etme, eski ekranları yalnız **yetenek ve kontrol envanteri** olarak kullan. Pixco Sketch'in açık/ferah görsel dilinden ve Stitch'in gerçek sektör işlem örneklerinden esinlenerek Android'e özgü, olay/görev odaklı bir UI yarat.

- Kaynak Pixco: `Design file/document.json`, `Design file/pages/*.json`, `Pixco-Android-UI-v1.sketch`. 4×412×915 tasarım grubu, 253 metin katmanı ve çok sayıda vektör katmanı.
- Kaynak Stitch: `stitch_yard_mc_asistan_android_app/{bug_n_imdi,odalar_pansiyon,masalar_restoran,sat_barkod_market}` ve `esnaf_konuksever/DESIGN.md`. Uygulama için kaynak kod değil, etkileşim/iş mantığı referansı.
- Saha gerçeği: `.superdesign/android-companion/archive/source-current-2.0.8/archive-closure.md` (80 güncel Android ekranı), `AndroidUiRules`, permission/capability registry ve operasyon servisleri. Hiçbir konsept doğrulanmamış action/capability icat etmez.

## Birinci tasarım: Bugün / Şimdi
`/.superdesign/android-companion/redesign-pixco-stitch-v1/today.html` projenin köküne göre `.superdesign/android-companion/redesign-pixco-stitch-v1/today.html` konumundadır.

[Superdesign proje](https://superdesign.dev/teams/d43e8b12-551a-4b15-a10c-e48c388c4fc6/projects/c3b4e035-cfa9-45e8-a310-c2281f6edbec)

[İlk taslak](https://superdesign.dev/teams/d43e8b12-551a-4b15-a10c-e48c388c4fc6/projects/c3b4e035-cfa9-45e8-a310-c2281f6edbec?node=draft-variant-cf82d223-36f3-4382-979d-bf19357d7383)

Kaydetme yöntemi: `@superdesign/cli import-design-draft` (AI üretim kredisi harcanmadan) ve ardından `get-design` ile kaynak eşleşmesi doğrulaması. Draft kimliği: `cf82d223-36f3-4382-979d-bf19357d7383`, sürüm v2.

### Ekran grameri
- Sistem durum çubuğu ve işletme kimliği altında doğal Android üst alanı; masaüstü ana panelinin küçültülmüş hali değil.
- Kullanıcıya en yakın doğrulanabilir eylem: **oda için giriş zamanı**, tek birincil "Girişi başlat" düğmesi.
- Ödeme ve aktif masalar birer kısa durum kartıdır, finans/sipariş yetkisinin yerine geçmez.
- "Şimdi / Sonra" görünür sekmeleri ve yana kaydırma birbiriyle eşdeğer.
- Bottom navigation örnek karma işletme için **Bugün, Odalar, Masalar, Diğer**; gerçek gezinme role+capability kurallarından türetilmelidir. Market tek profilde farklı sekmeler görür.
- Ayrıntı bottom sheet; uygulama koduna aktarılana kadar bütün eylemler yalnız tanıtım/önizleme ve gerçek kayıt YOK.
- İşletme değiştirici ve bildirimler önizleme düzeyindedir; gerçek bilgiler ve kimlik izinleri ayrıca doğrulanmalıdır.

### Android UX ve erişilebilirlik
- En az 48dp ana tıklama yüzeyi; uzun metinler iki satır; oturum boyu rahat renk ayrımı.
- Görünüm tercihi mevcut Android kodunda var: font %90–150, dört vurgu ve yüksek kontrast. Konsept ekranlarının 150% font, gündüz/gece ve büyük tablette ayrıca değerlendirilmesi gerekir.
- Etkileşim hiçbir kritik işlemi swipe'a **mecbur** bırakmaz: görünür sekme de bulunur.
- "Misafir kapıda" gibi doğrulanmamış gerçek dünya çıkarımları yapılmaz; UI yalnız rezervasyon zamanını gösterir.

## Kod ve test durumu
- Yerel görsel konsept: `.superdesign/android-companion/redesign-pixco-stitch-v1/today.html`.
- `test-today.cjs`: Brave/Playwright 360×740, 393×852, 440×915 — overflow yok; check-in sheet, sekme ve geri/alt gezinme PASS.
- Bu aşamada mevcut Java Android ekranları, test telefonu, saha APK'sı ve hosting değiştirilmedi.

## Sıradaki tasarım turu (native uygulamadan önce)
1. Aynı renk/komponent sözlüğünü koruyan **Odalar → Giriş / Konaklama** taslağı.
2. **Masalar → Adisyon / Servis** taslağı; servis ve ödeme gerçek onay/state farkları korunur.
3. **Market → Barkod / Dolu Sepet / Cari** taslağı; POS terminal görünümüne kaymadan.
4. Rol/kapasite değişimi, %150 font, yüksek kontrast, 393/840dp ve çevrimdışı (bekleyen onay) görünümlerini tasarım değerlendirmesine ekle.
5. Taslaklar yeterli bulunduğunda ilgili Android Java bileşenlerine **küçük parçalarda** taşı. Veritabanı/sync sözleşmesi ve saha release'i ancak ayrı doğrulamayla.

**Not:** Superdesign bulut taslağı, sahada çalışan Android 2.0.8 uygulamasının yeni sürümü değildir.

## Konsept 01 — 4 ekranlık ilk set tamamlandı (16 Ekim 2026)

Superdesign proje: https://superdesign.dev/teams/d43e8b12-551a-4b15-a10c-e48c388c4fc6/projects/c3b4e035-cfa9-45e8-a310-c2281f6edbec

- **01 Bugün / Şimdi:** `today.html`; taslak `cf82d223-36f3-4382-979d-bf19357d7383`.
- **02 Odalar / Misafir Girişi:** `rooms.html`; taslak `35214f27-4679-47ae-9ac2-36b55463b0af`. Oda durumu ile rezervasyon/giriş olayı ayrı gösterilir. Giriş üç aşamalı önizleme; eylem sunucuya gönderilmez.
- **03 Masalar / Servis:** `tables.html`; taslak `f47f8a49-226e-431a-883a-b9bfcf31418b`. Masa durumu ile açık adisyon/hesap bekleme durumu ayrı. Alan seçimi, masa filtresi ve ödeme önizlemesi mevcut.
- **04 Market / Satış & Stok:** `market.html`; taslak `1df945a8-1b54-403e-8a0e-a62350ff5e9e`. Barkod/ürün arama, sepet/ödeme onayı, sayım ve cari işlemler birbirinden ayrılır. POS terminali gibi bir ana ekran tasarlanmamıştır.

Yerel çalışma panosu: `.superdesign/android-companion/redesign-pixco-stitch-v1/index.html`. Her dört HTML de aynı klasörde ve birlikte görülebilir. Ekranlar arası footer butonları gerçek uygulama navigasyonu değildir; bazıları yalnız örnek bilgilendirme yüzeyi açar.

### Doğrulama ve sonraki kapılar

- **PASS:** Her dört ekran için Playwright/Brave 360×740, 393×852, 440×915: toplam 12 viewport denemesi; yatay taşma ve JS hatası yok. Bottom sheet, oda/masa filtreleri, müşteri giriş adımları, satış-sepet-ödeme stok/cari örnekleri kontrol edildi.
- **PASS:** Üç yeni Superdesign draft import'u ve geri okunan HTML'nin yerel kaynakla byte-byte eşleşmesi. İlk Bugün draft'ı önceki turda da doğrulanmıştı. AI jenerasyon kredisi kullanılmadı.
- **Yetki farkı:** Karşılaştırma amacıyla karma Pansiyon/Restoran alt gezinmesinde Bugün/Odalar/Masalar/Diğer, Market örneğinde Bugün/Satış/Ürünler/Diğer önerildi. Mevcut Android rootNavigation bununla birebir aynı değildir. Native aktarma aşamasında rol/capability/permission matrisi korunarak gezinme kararı yeniden uygulanmalıdır. Yetkisiz ekranlar varsayılan olarak gösterilmemelidir.
- **Ek doğrulama:** gerçek cihaz üzerinde SP font %150 ve yüksek kontrast/koyu tema, 393dp/840dp tablet, ekran döndürme, TalkBack/IME, offline/pending/denied/error ve gerçek veri yoğunluğu ayrı turlardır; bu ilk prototip bunları geçtiğini iddia etmez.
- **Tüm sayılar sentetik:** Market stok sayım ilerlemesi, sepet toplamı, cari bakiye, konaklama ve masa durumu yalnız görsel fixture'dır. Gerçek kayda bağlanmadan gösterilmemeli. Cari hesap için geçerli kişisel Android cihaz kimliği ve yetki zorunluluğu korunur; satış/ödeme eylemleri masaüstü onayı bekler.
- **Kod sınırı:** `apps/android-app` native Java, senkronizasyon, SQLite, hosting, 2.0.8 pilot sürüm bu dört ekranın tasarımı sırasında değiştirilmedi. Kullanıcı tasarımı değerlendirmeden native UI refactor yapılmayacak.

**Tasarım sonrası sıra:** İlk dört ekranın görsel değerlendirmesi ve erişilebilirlik varyantları → gerçek yetki/gezinme haritası → ekranların mevcut native operasyon sahiplerine parça parça entegrasyonu → hedefli Android device smoke → release öncesi kapsamlı doğrulama.


## 16 Ekim 2026 — İkinci tur adaptif Android UI tamamlandı

- Dört Superdesign taslağı mevcut draft kimlikleriyle adaptif v2 sürümüne güncellendi, sunucudan alınan HTML dosyaları yerel kaynakla byte-byte eşleşti.
- Ortak karşılaştırma panosu .superdesign/android-companion/redesign-pixco-stitch-v1/index.html: 360/393 telefon, 840/1024 tablet, %90–%150 font, açık/koyu ve normal/yüksek kontrast.
- adaptive.css ve build-adaptive.py dört -v2.html üretir; v1 kaynakları korunur. 840+ genişlikte 94px sol ray, oda/masa iki sütun.
- Playwright 40/40 görünüm/etkileşim PASS. Ölçülen örnek metinler için kontrast 4.5:1 altında 0; bütün WCAG uygunluğu iddia edilmez. Karşılaştırma panosu seçimleri de PASS.
- Bu aşamada Android Java, saha sürümü 2.0.8, canlı hosting, pilot veri veya işletme durumları değiştirilmedi. Fiziksel tablette gerçek doğrulama yapılmadı.
- Sonraki tur: gerçeğe bağlı capability+permission navigasyon, boş/yükleniyor/çevrimdışı/yetkisiz/bekleyen durumlar, TalkBack ve genişletilmiş tablet kullanımı; sonra toplu görsel değerlendirme.


## 16 Ekim 2026 — V3: Role/capability and state designs

- Six representative access fixtures now cover mixed admin, Pension staff, Restaurant staff, full Market staff, product-view-only Market staff, and no business access. Native permission rules remain the authority.
- Navigation follows AndroidUiRules root ordering: Today, Customer when permitted, first permitted business, More when additional allowed workspaces exist. No fixed cross-sector bottom navigation or automatically granted retail privileges.
- Empty, loading, offline with stale snapshot, waiting for desktop result, and denied screens are documented. Market product viewing does not automatically reveal sale, count or credit.
- Playwright 67 role/state cases PASS; 4 Superdesign drafts re-imported into their existing identifiers and verified byte-identical. Cross-screen preview settings remain available in the gallery: .superdesign/android-companion/redesign-pixco-stitch-v1/index.html.
- Source details and limits: .superdesign/android-companion/redesign-pixco-stitch-v1/ROLE_STATE_V3_NOTES.md.
- Remaining: exact native action/permission mapping, real offline/outbox and stale projection behavior, Android TalkBack/IME, physical tablet and UI design review. Java app, release 2.0.8, hosting and pilot data unchanged.


## 16 Ekim 2026 — V4: compact workspaces and unified notification design

- Karar: workspaces show only actionable information. Greeting/coaching paragraphs such as “Günaydın, Ayşe” and “Önce önemli işleri halledelim” are removed; unnecessary helper paragraphs also trimmed from rooms, restaurant and market.
- One global top notification center for all logical warning/error/connection/pending/operation result notices: dynamic bell badge, short priority peek and one overlay drawer. Old bottom toast and per-screen warning strips are retired in the browser concepts.
- Domain work cards (incoming guest, table service, stock count) remain in the task flow rather than being incorrectly treated as system alerts.
- Prototype components: compact-notifications.css, notification-center.js, build-compact.py. V4 pages and index.html in .superdesign/android-companion/redesign-pixco-stitch-v1/.
- Browser test test-compact.cjs: 36/36 PASS including 360/393/840, dark and 150% text, role restrictions, central operation feedback and notification filtering. All 4 Superdesign drafts updated in place and downloaded HTML verified identical.
- Native Java code, pilot DB, hosting and published APK not changed. New notification design must later subscribe to typed existing domain/sync/outbox events and preserve permission authority.


## 16 Ekim 2026 — V5: işlem-yetki ve gönderim durumu eşleştirmesi

- Görünüm yetkisiyle işlem yetkisi ayrıldı. Android kaynakları: AndroidUiRules.java, AndroidActionPolicy.java, PensionRoomCard.java, TableOrderDialog.java, RoomFolioWorkspace.java, MarketUiRules.java.
- Restoranda yalnız table_order.view hakkı olan kişi adisyonu görebilir, ancak table_order.open / table_order.add_item / table_order.close_paid eylemlerine erişemez. Örnek sipariş personeli ile ödeme kapatabilen karma yönetici ayrı senaryolardır.
- Market'te market.product.view, market.sale.complete, market.stock_count, customer_credit.view ve customer_credit.payment ayrı kontroller olarak tasarıma yansıtıldı. Satış var/cari yok personeline borç bilgisi gösterilmez.
- Pansiyonda müşteri-oda ataması isAdmin + customer.manage + room.assign_customer gerektirir; oda görüntüleme tek başına check-in yetkisi vermez.
- Gönderim bekliyor (telefonda) ile masaüstü işlem sonucu bekleniyor iki ayrı durum/bildirimdir. Her ikisi de işlem tamamlandı olarak sunulmaz.
- V5 dört taslağın aynı Superdesign kimliğinde güncellendiği sürümdür. .superdesign/android-companion/redesign-pixco-stitch-v1/index.html yeni toplu karşılaştırma panosudur.
- test-actions.cjs ile 32 temel akış/rol/durum/ekran genişliği senaryosu PASS; Superdesign'a V5 içeriği aktarılıp geri alınarak 4/4 dosya birebir kontrol edildi.
- Kaynak sözleşme: .superdesign/android-companion/redesign-pixco-stitch-v1/ACTION_AUTHORITY_V5_NOTES.md. Tüm profil/rol kombinasyonlarının tam matrisi, gerçek cihaz ve gerçek offline/outbox testleri sonraki native entegrasyon doğrulamasıdır. Android Java, saha APK 2.0.8, pilot DB ve hosting değişmedi.


## 16 Ekim 2026 — V6: Müşteriler / Talepler ve Oda Hesapları

- İki yeni native Android görsel konsepti üretildi. Mevcut dört ekranla beraber tasarım panosu 6 ekran içeriyor: .superdesign/android-companion/redesign-pixco-stitch-v1/index.html.
- Müşteriler/Talepler: Yeni Talepler, Müşteriler, Cevap Bekleyenler sekmeleri ve ayrıntıları; görüntüleme ile müşteri yönetimi / yanıt / rezervasyona çevirme yetkileri ayrıdır. Kaynak: AndroidUiRules, CustomerWorkspace, CustomerRequestDetailDialog.
- Oda Hesapları: açık/ödenmiş bakiye, yetkili ödeme, ek ücret ve menü ürünü, kalan borç 0 olduğunda çıkış. Kaynak: RoomFolioWorkspace ve AndroidActionPolicy. Basit bir adisyon görüntüleme hakki finansal işlem hakkı vermez.
- Çevrimdışı ve pending/queued durumlarda salt-okunur müşteri/talep/folio ayrıntısı açılabilir; mutasyon eylemleri yeni kayıt göndermeye uygun değilse sunulmaz. Merkezi bildirim UX'i korunur.
- test-customer-folio.cjs: 51/51 tarayıcı senaryosu PASS (360/393/840, tema/font/rol/durum, ayrıntı, filtre ve navigasyon). Superdesign 6/6 tasarım aktarımı ve kaynaktan geri okuma byte-identical doğrulandı.
- Bu sayfaların fixture verileri sentetiktir. Android Java, gerçek DB, yayındaki pilot 2.0.8 veya hosting değiştirilmedi. Fiziksel Android tablet, TalkBack, tam rol matrixi ve kalan iş akışları ayrı doğrulama gerektirir.


## 16 Ekim 2026 — V7: Fotoğraf alanlı menü ve kalabalık katalog tasarımı

- Yeni orders-v7.html restoran adisyon tasarımı: görsel alanlı ürün satırı, fotoğrafsız placeholder, Türkçe ürün adı/kodu arama, kategori kısayolları ve tüm kategoriler seçicisi, 24'er ürün sayfalama, adisyon ayrı sekme, yetkili adet ve servis işlemleri.
- Fotoğraf kaynağı için mevcut masaüstü menu.items[].image_url kullanılacak. Android OperationData.MenuItem modeline bu alan henüz aktarılmıyor; native aşamada güvenli görsel referansı ve çevrimdışı disk önbelleği gerekecek. Bu turdaki görseller gerçek fotoğraf değil, tamamen yerel SVG çizim örnekleridir.
- Test: 1.200 ürün, 3 rol, 360/393/840 görünüm; 14 senaryo PASS. 10.000 ürünlü arama PASS (tek ölçüm ~121ms). Yedi ekranlık karşılaştırma panosu PASS; Superdesign 7/7 dosya eşleşmesi.
- Kaynak ve kalan işler: .superdesign/android-companion/redesign-pixco-stitch-v1/RESTAURANT_CATALOG_V7_NOTES.md. Yerel pano aynı dizindeki index.html.
- Android Java, pilot DB, hosting, yayımlanmış APK değişmedi. Fiziksel Android/TalkBack ve gerçek fotoğraf dağıtımı native entegrasyonda test edilecek.


## 17 Ekim 2026 — V8: Restoran Rezervasyonları / Günlük İşler / KBS

- Koleksiyon 10 tasarım ekranına yükseltildi: yeni Restoran Rezervasyonları, Günlük İşler ve KBS. Tek karşılaştırma panosu .superdesign/android-companion/redesign-pixco-stitch-v1/index.html.
- Restoran rezervasyonunda bekleyen/onaylı, yetkili onay/iptal ve yeni kayıt; günlük işte bekleyen/tamamlanan, yetkili düzenleme/tamamlama. Ortak sade kartlar ve tek bildirim merkezi.
- KBS yalnız admin + accommodation.rooms/stays + kbs.view + etkin durumda. Gönderim talebi resmi gönderim değildir; belirsiz sonuç tekrar gönderilmez; başarısız ve retryReady kaydı için yeniden deneme hazırlanabilir. Harici gönderimde portal doğrulaması ve ikinci açık onay şart. Yerel prototip resmi gönderim yapmaz.
- test-operations-v8.cjs: 59/59 PASS; 360/393 telefon, 840 tablet tarayıcı simülasyonu; yetki/veri gizleme, offline, KBS 2 aşamalı onay ve gezinme. 10/10 Superdesign dosyası yerelle birebir doğrulandı.
- Sözleşme: .superdesign/android-companion/redesign-pixco-stitch-v1/OPERATIONS_V8_NOTES.md. Android Java, pilot DB, Android 2.0.8 APK ve hosting değişmedi. Gerçek cihaz / KBS testleri ayrı bekliyor.


## 17 Ekim 2026 — V9: Restoran Stok ve Menü Yönetimi

- Yeni konseptler stock-v9.html ve menuadmin-v9.html: fotoğraflı ürün alanı ve fallback, Türkçe ürün/kategori araması, durum ve kategori filtreleri, 24'er listeleme, yetkili işlem ayrımı. Toplu pano 12 ekrana ulaştı: .superdesign/android-companion/redesign-pixco-stitch-v1/index.html.
- AndroidUiRules.RESTAURANT_STOCK: food_service.menu + food_service.inventory + menu.stock_view. Stok güncelleme ayrıca menu.stock_update gerektirir. AndroidUiRules.RESTAURANT_MENU: food_service.menu + admin + menu.delete; menü ürün sunumu düzenleme ayrıca menu.edit. Ortak ürünü silmeden menüden kaldırma öncesi onay.
- Tasarımdaki görseller gerçek menü fotoğrafı değil, çevrimdışı örnek SVG'lerdir. Native Android MenuItem image_url/veri kaynağı + küçük fotoğraf önbelleği daha sonra yapılacaktır. AI stok girişi yalnız izinli servis kombinasyonunda olmalıdır.
- 39/39 Playwright testi PASS; 360/393/840, 1.200 ürün, büyük yazı, arama/kategori, rol/izin, çevrimdışı salt-okunur ve menü kaldırma onayı. 12/12 Superdesign HTML dosyası yerel ile birebir doğrulandı.
- Kaynak sözleşme .superdesign/android-companion/redesign-pixco-stitch-v1/STOCK_MENU_V9_NOTES.md. Gerçek Android Java, 2.0.8 APK, pilot DB ve hosting değiştirilmedi.


## 17 Ekim 2026 — V10: Konaklama / Rezervasyonlar

- İki yeni sayfa yerine tek Konaklama yüzeyi: Rezervasyonlar / Konaklamalar sekmeleri. Pansiyon rezervasyonunda görüntüleme ile oluşturma/güncelleme/onay/ret/iptal ayrı izinler; konaklama görüntüleme kaynak AndroidUiRules'a göre admin + customer.manage + room.assign_customer + accommodation.stays gerektirir.
- Açık bakiyeli misafir için ayrı çıkış kısayolu yok; mevcut Oda Hesapları ekranına geçiş var. İşlemler masaüstü sonucu gelmeden gerçekleşmiş kabul edilmiyor. Sade metinler, tek bildirim merkezi, çevrimdışı salt-okunur ayrıntılar korunuyor.
- 27/27 hedefli tarayıcı testi PASS; 360/393 telefon ve 840 tablet emülasyonu, yetki/rol, offline/queued/pending/denied/empty/loading, ayrıntı ve folio geçişleri.
- Yerel tasarım seti 13 ekrana genişledi: .superdesign/android-companion/redesign-pixco-stitch-v1/index.html.
- Yeni Konaklama Superdesign draft'ı oluşturuldu ve içerik birebir doğrulandı. Eski draftların V10 güncellemesinde Superdesign API sunucu hataları görüldü; tam cloud sync yapılmış sayılmıyor. Tam liste superdesign-project.json -> cloud_v10_verification. Android Java, pilot DB, release APK ve hosting değiştirilmedi.


## 17 Ekim 2026 — V11: Ortak Günlük İşler ve Mesajlar

- Pansiyon ile Restoran günlük işleri tek tasarım çalışma alanında birleşti; karma işletmede sektör sekmesi, tek sektör personelinde yalnız yetkili görevler. Günlük iş izleme, oluşturma, güncelleme ve tamamlama izinleri ayrıldı. Native kapsamda mixed-domain görevler gerçek kaynaktan sınıflandırılacak.
- Mesajlar: Hazır Mesajlar ve customer.requests yetkisiyle Cevap Bekleyenler. service.whatsapp ve customer.view görüntüleme için, customer.respond WhatsApp içerik/yanıt, customer.mark_answered Cevaplandı, message.delete yönetici silme için ayrı izinler. WhatsApp'ı açmak gönderilmiş veya cevaplanmış kabul edilmez.
- Yerel panoda 14 ekran: .superdesign/android-companion/redesign-pixco-stitch-v1/index.html. test-shared-v11.cjs ile 49/49 browser testi PASS; 360/393/840, rol, sektör, offline, bekleyen, yetkisiz, gezinme.
- Superdesign'da V11 Günlük İşler ve yeni Mesajlar taslağı byte-identical doğrulandı; diğer 12 V11 taslak için sync tamamlandı denmiyor. superdesign-project.json -> cloud_v11_verification.
- Native Android kodu, pilot DB, APK ve hosting değişmedi; arayüz/işlem sözleşmesi SHARED_OPERATIONS_V11_NOTES.md içinde.
