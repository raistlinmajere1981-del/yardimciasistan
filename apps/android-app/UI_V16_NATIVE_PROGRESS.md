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

## Dördüncü tur — Konaklama / Oda Hesapları

- `RoomFolioWorkspace.java`: açık hesap ve para birimi bazında bekleyen tahsilat V16 özet ızgarası; açık hesaplar müşteri, oda, tarih ve para birimine göre aranabilir. Kart içinde tutarlar etiket/değer satırlarına ayrıldı, ücret ekleme butonları iki sütunda toplandı. Yetkili menü ürünü, ek ücret, ödeme ve çıkış işlemlerinin payload/validation akışı korundu.
- Menü ürünü ekleme formunda **ürün veya kategori araması** mevcut, yalnız güncel snapshot'taki satışa açık ve uygun para birimindeki ürünleri filtreler. Eşleşen ürün yokken gönderim engellenir.
- Ödenmiş oda hesabının çıkış düğmesi V16 diline uygun `Çıkış ve Hesabı Kapat` şeklinde adlandırıldı; aynı `room_folio_checkout` işlemi çağrılır.
- `PensionWorkspace.java`: rezervasyon ve konaklama kartları için Türkçe arama ve boş sonuç durumu eklendi.
- `RoomAssignmentDialog.java`: konaklama giriş/çıkış tarihleri ortak yerel Türkçe seçiciye taşındı. Çıkış alanı boş bırakılabilir; giriş tarihi değişirse geçersiz çıkış alanı temizlenir.
- `NativeDateTimePicker.java`: yalnız isteğe bağlı tarih alanlarında `Tarihi temizle` kontrolü sunan overload eklendi; diğer mevcut tarih seçicilerin davranışı değişmedi.

## Beşinci tur — KBS / Mesajlar / Günlük İşler / Finans / Ayarlar

- `KbsWorkspace.java`: EGM/Jandarma sağlayıcısı ve ayrı KBS sayılarını V16 özet ızgarasında gösterir. Misafir/oda/tarih/durum araması yalnız görüntülenebilir bildirimler üzerinde çalışır. “Sonuç belirsiz” statüsü ve yeniden gönderimi engelleyen kurallar değiştirilmedi; kuyruğun resmî gönderim olmadığını açıklayan uyarı kaldı.
- `AndroidWorkspaceCoordinator.java`: Hazır Mesajlar ve Cevap Bekleyenler için yerel mesaj/müşteri araması; yetki ve talepler capability koşullarına dokunulmadı.
- `PensionWorkspace.java`, `RestaurantWorkspace.java`: İş Takibi'nin native karşılığı olan iki **Günlük İşler** listesinde görev adı/açıklama/tarih/durum araması. İş oluşturma/sonuçlandırma/düzenleme mevcut action owner'da kalır.
- `FinanceWorkspace.java`: Kasa başlığı ve yetkili yeni hareket için +; gelir/gider/net, opsiyonel oda alacağı V16 özet kartları. Son 20 işlemin metni/kategorisi/tarihinde yerel arama. Finans payload ve kategorileri değişmedi.
- `AndroidSettingsWorkspace.java`: Ayarlar başlığı; V14/V15 kararı gereği görünüm örnek önizlemesi ve gereksiz cihaz-tercihi açıklaması kaldırıldı. Temalar, font, kontrast, ses ve bildirim kontrol bağlantıları aynı.
- `AndroidMoreWorkspace.java`: Diğer menü başlığı ve satır tasarımı sadeleştirildi; rota ve yetki kontrolleri aynı.

## Altıncı tur — Bağlantı / Cihaz / Rezervasyon ve İş Formları

- `AndroidConnectionSettingsPanel.java`: Web bağlantısı, otomatik yerel ağ ve senkron durumu **Bağlantı** altında; telefon kimliği, adı ve yetki profili ayrı **Cihaz** bölümünde. Mevcut senkron isteği, read-only/eşleştirme kuralları, görünür bekleyen işlem sayısı ve ayar taslakları korunur.
- `AndroidInactiveDeviceScreen.java`: Pasifleştirilmiş cihaz görünümü V16 başlıkları ve Cihaz bölümüyle eşlendi. Pasifleştirilen cihaz için iş alanlarına erişim yine açılmaz.
- `ReservationEditorDialog.java`: Pansiyon/restoran formunda bağlam etiketi, ortak V16 giriş alanları, seçici sınırları ve hata etiketi. Müşteri, oda/masa, tarih/saat, yetkili düzenleme ve eski action payload sözleşmesi değişmez.
- `DailyTaskEditorDialog.java`: V16 alan ve etiketleri; dikte ve tarih/saat bağlantıları korunur. “Sil” işlemi iç içe ikinci modal yerine aynı formda iki aşamalı **Silmeyi Onayla** kontrolü kullanır; yalnız silme yetkisi mevcutsa görünür.
- Bu turda bağlantı anahtarları, cihaz yetkisi, outbox ve senkronizasyon yazma yolu değiştirilmedi. Tasarım incelemesinde gerçek cihaz ve erişilebilirlik denemesi gereklidir.

## Henüz tamamlanmayan görsel aktarım

İlk altı native tur, 19 V16 HTML ekranının bütün piksel düzenlerinin Android'e bire bir geçirildiği anlamına gelmez. Temel liste/kartlar, Ayarlar, Bağlantı, Cihaz ve önemli kayıt formlarına tasarım uyarlaması yapıldı; gerçek Android cihazında ekranların tam eşitliği henüz doğrulanmadı.
Sıradaki aşama, telefon/tablet üzerinde V16'nın 19 ekran ve alt formlarının görsel/fonksiyonel karşılaştırılması, bulunan taşma ve etkileşim farklılıklarının giderilmesidir. Mesaj, kimlik tarama, kamera ve KBS detay panelleri özellikle fiziksel cihazda gözden geçirilmelidir.
Kullanıcı yetkisi, sektör, outbox ve senkronizasyon davranışları backend kaynaklarında kalır; HTML prototip iş mantığı native koda taşınmaz.
Gerçek cihazda 360/393, Android 8.1, tablet, TalkBack, klavye, tarih popup yüksekliği, çevrimdışı ve senkronizasyon ayrıca kontrol edilmelidir.
Prototipteki 'Analiz hatasını dene' kullanıcıya görünen native butona eklenmemelidir.

## Derleme ve test

`node scripts/run-android-gradle.mjs testDebugUnitTest assembleDebug --offline`

Native APK kurulumunu/kullanıcı verisini değiştirmeden derleme yapıldı; fiziksel cihaza yükleme ve V16 canlı UI gözden geçirme sonraki aşamada.
