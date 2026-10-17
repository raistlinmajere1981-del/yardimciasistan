# Android V16 native UI aktarımı — ilerleme (2026-10-17)

Referans: yerel `.superdesign/android-companion/redesign-pixco-stitch-v1/index.html` ve `ANDROID_UI_PARITY_V16.md`.
Bu dizin, kaynak Java ile gerçek Android APK'ye entegre edilen parçaları izler; V16 tarayıcı mock'u APK'ye kopyalanmaz.

## Tamamlanan ilk native temel

- `AppTheme.java`: V16 gündüz/gece temel paletleri ve geçerli AppearancePreferences aksan/yüksek kontrast mekanizması korunarak yenilendi.
- `UiKit.java`: ortak kart/buton şekli, boşluk ve dokunma yüksekliği V16 ölçülerine yaklaştırıldı; tüm iş alanları mevcut UiKit'i kullanmaya devam ediyor.
- `NativeDateTimePicker.java`: ortak Türkçe yerel tarih/saat paneli. Haftanın ilk günü pazartesi, ay/yıl hızlı seçimi, bugün/yarın/+7, çıkış +1/+2/+7/+10, 24 saat, 5 dakikalık saat adımları, saat kısayolları. Aynı formun üzerinde PopupWindow; ikinci AlertDialog açılmaz. Kaydedilen biçim değişmez: YYYY-MM-DD / HH:mm.
- `ReservationEditorDialog.java`: pansiyon giriş/çıkış ve restoran tarih/saat alanları yeni seçiciye geçti; giriş değişince eski çıkış geçersizse temizleniyor. Mevcut izin/validation/payload kuralları yerinde.
- `DailyTaskEditorDialog.java`: tarih/saat alanları ortak seçiciye geçti.
- `CustomerFormDialog.java`: doğum ve belge geçerlilik tarihleri ortak seçiciye geçti; OCR'dan programatik alan doldurma korunuyor.
- `CustomerWorkspace.java`: yeni müşteri oluşturma aynı yetki kontrolüyle V16 başlık satırına taşındı.
- `AppThemeSmoke.java` ve `NativeDateTimePickerTest.java`: yeni renkler ve ISO tarih kuralı testleri.

## İkinci tur — Bugün, Müşteriler, Odalar

- `TodayWorkspace.java`: Bugün / Şimdi başlığı ve açıklaması eklendi; izinli sayaçlar yatay kayan chip yerine basılabilir/izinli **iki sütunlu (tablet üç) özet kartları** olarak sunuluyor. Sayaç rotaları ve öncelikli işlem kartları değişmedi.
- `UiKit.java`: herkesin kullandığı sayaç kartı ve cihaz genişliğine göre yerleşen özet ızgarası eklendi; servislerden hiçbir şey çağırmaz.
- `PensionWorkspace.java`: Odalar, Rezervasyonlar, Konaklamalar, Hesaplar, İşler, KBS alanlarında V16 sayfa başlıkları; yeni kayıt eylemleri büyük tekrarlı butondan üstteki + kontrolüne taşındı. İzin/etkinlik koşulları aynen korundu. Oda durum sayaçları özet ızgarasına dönüştü ve Odalar'a anlık liste araması eklendi.
- `CustomerWorkspace.java`: müşteri/gelen talep listelerine Türkçe arama eklendi; yalnız mevcut yetkili, görüntülenen kayıtlar içinde yerel filtreleme yapar. Sonuç bulunamadı metni var; backend sorgusu yok.
- `NativeSearchList.java` ve `NativeSearchListTest.java`: tekrar kullanılabilir yerel liste filtreleme ve Türkçe büyük/küçük harf testleri.

## Üçüncü tur — Masalar / Restoran / Market

- `RestaurantWorkspace.java`: Masalar, Rezervasyonlar, Açık Adisyon, İşler, Stok ve Menü Yönetimi için V16 başlıkları; izin verilen rezervasyon/iş oluşturma eylemleri üstteki + kontrolünde. Masa, restoran rezervasyonu, aktif adisyon ve tüm stok kayıtları için mevcut snapshot üzerinde Türkçe arama eklendi; her bölümün yetki ve gerçek işlem kartları korundu. Yatay sayaç şeridi V16 özet kartlarına geçti.
- `MarketWorkspace.java`: Market ana ekranının görünen adı **Satış** olarak sadeleştirildi; günlük satış, kritik stok ve mal kabul özetleri V16 kartlarına taşındı. Mal kabul/sepet içindeki toplam hesap ve gönderim davranışları değiştirilmedi. Ürün arama/seçici listesi görsel yüklü ürünlerde 58dp küçük önizlemeyi gösterir; yüklü görsel yoksa yer tutucu kullanılır. Görsel için ek ağ isteği açılmaz.
- `UiKit.java`: Sayı yanında para/tutar metni de gösterebilen ortak özet kartı kullanıldı.
- Ürün kategorisi market snapshot ürün modelinde bulunmuyor: sahte kategori filtresi yapılmadı, veri sözleşmesi ve backend değişmedi.
- Yukarıdaki değişiklikler yalnız gerçek Android Java görünümüdür; V16 HTML prototipi ve sunucuya dokunulmadı.

## Henüz tamamlanmayan görsel aktarım

İlk üç native tur, 19 V16 HTML ekranının bütün piksel düzenlerinin Android'e geçirilmiş olduğu anlamına gelmez. Bugün, Müşteriler, Odalar, Masalar, Restoran ve Satış alanlarının temel yerleşimi güncellendi; detay kartları ve formlarda görsel karşılaştırma devam ediyor.
Sıradaki turda Konaklama ve Oda Hesapları ayrıntıları, Rezervasyon ve Günlük İş formları, KBS, Mesajlar, İş Takibi, Finans, Ayarlar/Bağlantı/Cihazlar ekranları ele alınmalı.
Kullanıcı yetkisi, sektör, outbox ve senkronizasyon davranışları backend kaynaklarında kalır; HTML prototip iş mantığı native koda taşınmaz.
Gerçek cihazda 360/393, Android 8.1, tablet, TalkBack, klavye, tarih popup yüksekliği, çevrimdışı ve senkronizasyon ayrıca kontrol edilmelidir.
Prototipteki 'Analiz hatasını dene' kullanıcıya görünen native butona eklenmemelidir.

## Derleme ve test

`node scripts/run-android-gradle.mjs testDebugUnitTest assembleDebug --offline`

Native APK kurulumunu/kullanıcı verisini değiştirmeden derleme yapıldı; fiziksel cihaza yükleme ve V16 canlı UI gözden geçirme sonraki aşamada.
