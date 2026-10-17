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

## Henüz tamamlanmayan görsel aktarım

Bu **ilk ortak bileşen turudur**, 19 V16 HTML ekranının bütün piksel düzenlerinin Android'e geçirilmiş olduğu anlamına gelmez.
Sıradaki turda gerçek Android kaynak workspaceleri üzerinden V16 ekran bileşenleri karşılaştırılarak uygulanmalı:
Bugün/Şimdi, Odalar/Konaklama, Müşteriler/Talepler, Masalar/Restoran, Market/Stok, Oda hesapları, Rezervasyonlar, Günlük işler, KBS, Mesajlar, İş Takibi, Finans, Ayarlar/Bağlantı/Cihazlar.
Kullanıcı yetkisi, sektör, outbox ve senkronizasyon davranışları backend kaynaklarında kalır; HTML prototip iş mantığı native koda taşınmaz.
Gerçek cihazda 360/393, Android 8.1, tablet, TalkBack, klavye, tarih popup yüksekliği, çevrimdışı ve senkronizasyon ayrıca kontrol edilmelidir.
Prototipteki 'Analiz hatasını dene' kullanıcıya görünen native butona eklenmemelidir.

## Derleme ve test

`node scripts/run-android-gradle.mjs testDebugUnitTest assembleDebug --offline`

Native APK kurulumunu/kullanıcı verisini değiştirmeden derleme yapıldı; fiziksel cihaza yükleme ve V16 canlı UI gözden geçirme sonraki aşamada.
