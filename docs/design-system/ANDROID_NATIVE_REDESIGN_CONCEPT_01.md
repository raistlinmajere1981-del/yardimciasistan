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
