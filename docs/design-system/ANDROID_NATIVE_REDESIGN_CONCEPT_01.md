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
