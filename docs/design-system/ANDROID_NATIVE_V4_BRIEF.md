# Android Companion — Native UI v4 tasarım kararı ve güncel uygulama durumu

**Durum (2026-10-14 / 2.0.8):** Native V4 gezinme temeli mevcut Android uygulamasına alındı. Saha v2 tam görsel yenilemesi hâlâ prototip aşamasında ve Codex hazır olana kadar bekletiliyor.
**Kod tabanı:** `apps/android-app` / native Java. Kaynak otoritesi Desktop SQLite ve mevcut Android snapshot/action sözleşmeleri.
**Baseline:** `android-ui-before-native-v4` Git etiketi; referans ekran `.superdesign/android-companion/baseline/`. Bu tarihsel referans korunur, güncel ekranlarla üzerine yazılmaz.
**Alternatifler:** `.superdesign/android-companion/native-v4/index.html`, `akis.html`, `saha.html`.
**Güncel kaynak:** `main` HEAD `a863a3fd`; Android/AI birleştirme `a3e56c54`; ürün sürümü `2.0.8` / Android versionCode `12`.
**Güncel arşiv:** `.superdesign/android-companion/archive/source-current-2.0.8/`. Stage 1 ekranları `2.0.7-debug` paketinden alınmış tarihsel referanslardır; son birleştirme sonrasında güncel 2.0.8 ekranı olarak doğrulanmış sayılmaz.

## Hedef deneyim

1. Desktop ekranını küçültmeyen, telefon için ayrı hiyerarşisi olan bir saha asistanı.
2. **Root swipe:** Görünür/yetkili ana çalışma alanları arasında yatay kaydırmayla geçiş. Dokunmatik alt gezinme ile aynı canonical navigation state.
3. Alt gezinme en fazla dört hedef barındırır: Bugün, Müşteri, Pansiyon/işletme, Diğer. Gerçek sektör profiline, staff/manager rolüne, `AndroidUiRules.canOpenTab` ve capability'lere göre bar değişebilir.
4. Diğer alanlar (Restoran, Market/Satış, Ticari siparişler, Mesajlar, Rapor, Kasa vb.) erişilebilir bir `Diğer` yüzeyindedir. Ticari sipariş, mevcut Bugün → commerce alanının **aynı** aksiyon/veri sahibidir, duplicate domain değil.
5. 360dp ve 393dp ekranlarda kesilmeden kullanılabilir; 48dp hedef, görünür dokunma geri bildirimi, erişilebilir etiket, Material benzeri native bileşenler.
6. Yüksek kontrastlı gündüz ve gece; mevcut yerel tema tercihi korunur, dekoratif animasyon şart değildir. Daha az kaynak ve daha hızlı yanıt önceliklidir.

## Gestures ve durum sözleşmesi

- Sadece ana çalışma alanının boş/normal yüzeyinde başlayan tek parmak yatay swipe kabul edilir. Yatay eşik yaklaşık 64–72dp ve yatay hareket/dikey hareket oranı en az 1.4.
- Bir alt yatay sekme, stok ürün kaydırıcısı, oda şeridi, metin alanı, filtre şeridi ya da tam ekran işlem kendisi hareketi yönetiyorsa root navigation olayı **tetiklenmez**.
- EditText odaklı, klavye açık, seçim/drag-drop aktif, modal/dialog/bottom-sheet açıkken root swipe devre dışı. Android sistem geri hareketi önceliklidir; ekran içinde farklı geri hareketi icat edilmez.
- Root sayfalar yalnızca yetki/capability filtresinden sonra sıralanır; kaynak gerçek `AndroidUiRules.canOpenTab`. Sonradan izni iptal edilen sayfa geçerli en yakın yetkili sayfaya düşer. Dikey scroll konumu domain ekranı başına korunur.
- Pansiyon/Restoran sekmeleri ve ticari detay ekranları kendi domain internal state'lerini korur; root swipe bir işlemi kaydetmez veya iptal etmez. Yükleme ve outbox idempotency akışı olduğu gibi kalır.
- TalkBack / Switch Access kullanıcıları için tüm root geçişleri dokunulabilir navigasyondan yapılabilir. Motion reduction etkin olduğunda animasyon minimum/kapalı. Orientation değişiminde state kaybolmaz.
- Gezinme sabit 4+ pencere kopyası oluşturmayacak; yalnız görünür ekran üretilecek. Eski Java UI dönüştürüldükçe kaldırılacak; iki çalışan versiyon yok.

## Aşamalar ve durum

1. **Navigation owner — tamamlandı (Native V4 Stage 1)** — Canonical root state, gesture arbiter, alt menü ve izin değişimi fallback uygulanmış, hedefli Java/unit ve gerçek Samsung yatay/dikey swipe doğrulamaları yapılmıştır. Yeni görsel çalışma mevcut navigation ownerı yeniden kurmamalı.
2. **Bugün & ticaret** — Öncelikli işler, sayaçlar ve ticari sipariş/gönderi özeti. Salt okunur projection ve canonical order operations korunur.
3. **Pansiyon / Restoran / Market** — Saha kartları, stok, rezervasyon, masa ve hızlı eylemler. Domain yetkileri ve optimistic/retry kontrolleri korunur.
4. **Müşteri / Mesajlar** — İletişim, talep, yanıt bekleyenler; işlem düzenleyicileri tek anlamlı tam ekran veya native sheet.
5. **Ayarlar + erişilebilirlik** — Tema, izin, çevrimdışı durum, TTS/STT görünürlük, düzen/kontrast ve TalkBack.
6. **Gerçek cihaz milestone** — Android unit, lint, APK, hedefli sync smoke, LAN/Hosting testleri, debug screenshot visual walkthrough, ancak milestone sonunda full verify.

## Kapsam dışı

- Android veritabanı veya kanonik işlemleri yeniden tasarlamak.
- İkinci çalışan eski UI/rollback runtime code path tutmak.
- WebView veya ağır animasyon motoru ile Android uygulamasını yeniden yazmak.
- TTS motor paketleme ve yeni sektör eklemek.
- Üretim kodunu görsel tasarım seçilmeden değiştirmek.

## Saha v2: okunabilir ve tek merkezli kullanım

- Hedef kullanıcı: özellikle orta yaş üstü ve teknoloji deneyimi sınırlı işletmeciler; kısa gündelik Türkçe, gereksiz kontrol/metin yok.
- Her **bölümün tek bir menü konumu** olmalı. `Bugün` menü kısayolları yığını değil, kayıt/öncelik özeti; listedeki kayıt kendi detayını açabilir ama ikinci bir sayfa giriş noktası yaratmaz.
- Alt gezinmede en fazla dört sabit, etiketli konum; son konum `Diğer`. Kullanıcı izinleri değişmediği sürece sıralama sabit. Ekranın bir yerine gizlenmiş kaydırma tek zorunlu erişim yolu değil.
- İşlemler önce tek belirgin ana eylem ve kayıt durumunu gösterir; nadir seçenekler detay yüzeyine alınır. Açık/kapalı, hata, bekliyor ve tamamlandı sadece renkle ayrılmaz.
- Okunabilirlik: özgün tasarım tabanı 16-18sp ana metin, erişilebilir başlıklar, en az 48dp dokunma hedefleri, metin sarma ve yüksek sistem font ölçeği. Daha fazla veri sığdırmak için metin küçültülmez.

## Kişisel görünüm — cihaz başına saklanan tercihler

Görünüm ekranında anında önizleme ve tek dokunuşla varsayılana dönme:

1. **Yazı boyutu:** Küçükten büyüğe kontrol (başlangıç önerisi 85–160%); Android sistem `fontScale` ve ekran büyütme ayarlarıyla birlikte test edilir. Sabit satır yüksekliğinde kesme olmaz.
2. **Görünüm yoğunluğu:** Rahat / Kompakt. Kart boşlukları ve bilgi aralığı değişir; kullanıcı büyük yazı seçtiğinde kompakt görünümde bile 48dp minimum dokunma alanı korunur.
3. **Renk tonu:** Ön ayarlı mavi, yeşil, sıcak ve ek erişilebilir vurgu seçimi. Hata/uyarı/success anlamları tamamen özelleştirilmez; her temada metin kontrastı otomatik kontrol edilir.
4. **Kontrast:** Normal / Yüksek. Açık ve koyu tema ile bağımsız; yalnız yazı değil ikon, sınır, seçim ve odak için de uygulanır.
5. **Görünüm:** Gündüz / Gece / Sistem (destek durumuna göre). Yazı, yoğunluk, tema ve vurgu tek merkezi, atomik görünüm profiline yansır.

- Tercihler **telefon/tablet cihazının kendisine ait** olmalı; işyeri capability/senkronizasyon sözleşmesine katılmamalı. Özellikle personel telefonundaki rahat metin tercihi işletmeyi veya diğer cihazları değiştirmesin.
- Önizleme, kaydetme/geri alma ve tema yenileme etkileşiminde form, seçili ekran ve scroll konumu kaybolmamalı.
- Metin ve sistem erişilebilirlik ayarları büyüdüğünde panel içeriği kaydırılabilir, eylemler erişilebilir; renk ayrımına dayalı tek bilgi olmamalı.
- Gerekirse basit bir **Büyük yazı / Yüksek kontrast** hazır profili sun; kullanıcı bu profili ayrıca değiştirebilmeli. Profil kapıları yeni yetki veya cihaz kaydı oluşturmamalı.

## Tablet: ikinci yerleşim, aynı native ekran sözleşmesi

- **Tema = renk/tipografi tercihi; yerleşim modu = alan kullanımı.** Tablet için ayrı tema/ikinci uygulama veya iki ayrı domain/controller ağacı oluşturulmaz.
- Otomatik yerleşim, cihaz adı/tablet etiketinden değil **pencerenin mevcut kullanılabilir dp genişliğinden** belirlenir. İlk öneri: <600dp telefon; 600–839dp orta genişlik; >=840dp geniş tablet. Kesin eşikler gerçek cihazda doğrulanıp düzenlenebilir.
- Telefon: alt gezinme, tek sütun, detay tam ekran veya native sheet. Tablet portre: daha geniş liste, uygun bölümlerde iki sütun. Tablet yatay: solda navigation rail, merkezde liste/işlem alanı, sağda seçili kaydın ayrıntısı.
- Örnekler: Pansiyon odaları + seçili oda ayrıntısı; Restaurant masa listesi + seçili adisyon; Market ürün/barkod listesi + sepet; Sipariş listesi + seçili sipariş bilgisi.
- Sağ ayrıntı paneli **ikinci işlem yolu değildir**: telefonda açılan aynı canonical detay/aksiyonun tablet yerleşimidir. Yetki, offline queue, eski snapshot sınırları ve güvenlik yeniden doğrulamaları aynen korunur.
- Kullanıcı Ayarlar → Görünüm'de **Yerleşim: Otomatik / Telefon / Tablet** seçebilir. Uygun olmayan küçük pencere/çok büyük yazı için otomatik güvenli tek sütuna düşer; aksi halde yatay taşma veya dar gizli eylem üretmez.
- Tablet için tüm ölçüler: fontScale + yoğunluk + yatay/dikey dönüş + ekran bölme (multi-window) ile birlikte denenmeli. Yerleşim değişimi Android oturumunu ve düzenlenen veriyi sıfırlamamalı.
- Native Java bileşenleri/UiKit ve mevcut navigation owner yeniden kullanılır; WebView, ikinci APK veya ağır ek kütüphane zorunlu değildir.

## Gerçek cihaz test matrisi

- Samsung SM-J700F / LineageOS: telefon 360dp civarı, küçük cihazda büyük yazı (%130–160), yüksek kontrast, tema ve swipe/scroll uyuşmazlığı.
- Kullanıcının hazırladığı Android tablet: ADB ile model, SDK, **gerçek dp pencere ölçüsü**, density, Android fontScale, yön ve RAM okunacak. Tablet ayrıca bağlanana kadar çözünürlük, desteklediği yön ve güvenli alanlar varsayılmayacak.
- Telefon + tablet: aynı işlev/izinler; tek erişim yolu, görünür alt/yan menü, geri, fiziksel klavye/IME, dinamik capability OFF, yarım form, cache/offline/yeniden eşitleme.
- Görsel kabul: Saha v2 telefon + tablet yan yana; gündüz/gece, %100/%150 yazı, normal/yüksek kontrast. Prototipler gerçek cihazı doğrulayana kadar üretim Java'ya taşınmaz.
