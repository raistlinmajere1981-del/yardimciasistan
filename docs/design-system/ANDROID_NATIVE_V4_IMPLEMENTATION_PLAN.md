# Android Native UI v4 — uygulama planı (16 Ekim 2026)

## Başlangıç ilkeleri
- **Tek çalışan kopya / main.** Android 2.0.8 saha paketi korunur; yeni kaynak kod, debug testinden sonra bir sonraki release'e hazırlanır.
- Kaynak arşivi: `.superdesign/android-companion/archive/source-current-2.0.8/archive-closure.md`. 80 güncel 2.0.8 görüntü, telefon ve simüle geniş ekran.
- Ayrı tablet uygulaması, yeni sektör, yeni capability, veri migration'u ya da sahadaki pilot DB'yi temizleme yok.
- Navigasyon ve eylem sahipliği mevcut Native UI v4 kurallarında kalır. Boş/kapalı alanlar görünürlük ve yetkiyle belirlenir.

## Aşama 1 — Erişilebilir görünüm (kodlandı, 360dp cihaz smoke PASS)
- Ayarlar → Görünüm: font boyu %90/%100/%115/%130/%150; Yeşil/Mavi/Sıcak/Mor vurgu; Normal/Yüksek kontrast.
- Tek yerel preference grubu, yalnız cihazda saklanır; masaüstü/hosting eşitlemesi yok.
- Font: Android sistem fontScale × uygulama font yüzdesi, sistem 0.5–3.0 sınırı. Tüm TextView ve dialog SP ölçeklerine yansır.
- Renk/kontrast: merkezi AppTheme/UiKit; anlam renkleri (başarı/uyarı/hata) korunur. Kontrast statik ölçüm testleri, gündüz/gece.
- Yazı boyu değişirken Activity recreate kullanılır, Navigation/Settings durumu mevcut Bundle üzerinden geri gelir; testte doğrulanır.
- Geniş dokunma hedefleri, iki sütunlu görünür seçenekler, örnek önizleme, varsayılana dön.

## Aşama 2 — Tek uygulama kabuğu / telefon-tablet ortak düzen (sıradaki iş)
- Tek giriş (Bugün), yetkiye göre kök gezinme, el hareketi/geri, Diğer çalışma alanları.
- 360dp, 393dp, 840dp / %100 ve %150 / gündüz-gece ve yüksek kontrast ekranları yan yana karşılaştır.
- Tablet geniş ekranda tek oturum, sol gezinme rayı; çift domain ağacı veya ayrı tema değil.
- Başlık/ana eylem/kart/iki satırlı kayıt standardı; sabit yüksekliğin büyük yazıyı kesmesini engelle.
- İlk prototip: Bugün, Müşteriler, Diğer, Ayarlar ve Pansiyon/Market ana panelleri.

## Aşama 3 — İş alanları (kabin sabitlendikten sonra)
- Pansiyon: oda listesi/durum, rezervasyon, konaklama, folio, KBS, günlük işler.
- Restoran: masa, adisyon, rezervasyon, stok/menü, işler.
- Market: barkod, ürün, stok, dolu/boş sepet, satış, veresiye/tahsilat; wholesale/web orders yalnız izinli.
- Ortak alanlar: Müşteri, talepler/mesajlar, raporlar/kasa, siparişler/gönderi/pazarlama, AI/TTS/STT.
- Tasarımda doğrudan eylem, geri, arama, 48dp hedef, hata/boş/yetkisiz/offline durumları.

## Aşama 4 — Kabul ve sahaya hazırlık
- Yalnız hedefli JUnit/UI smoke; tam paket önemli birleşimlerden sonra.
- Fiziksel tablette kullanılabilir olduğunda test: fontScale, tema, klavye, döndürme, düşük RAM, dokunma.
- Sahadaki arkadaşlardan telefon ve sektör geri bildirimleri; yalnız doğrulanan sorunlar.
- Release/hosting işlemi kullanıcı onayıyla ve ayrı adımda.

## 16 Ekim — Aşama 1 doğrulama sonucu
- Kaynaklar: AppearancePreferences, AppTheme, MainActivity, AndroidSettingsWorkspace, AndroidShellController.
- **PASS:** Gradle Android compile, full testDebugUnitTest, assembleDebug (offline).
- **PASS:** 360dp fiziksel SM-J700F üstünde %150 font, Mavi vurgu, yüksek kontrast, Ayarlar durumu ve Bugün ana gezintisine dönüş.
- İki sütunlu, tüm seçenekleri görünür seçim alanları; 150% için büyüyen üst başlık ve alt gezinme.
- Görseller: .superdesign/android-companion/workbench/accessibility-v4-2026-10-16/
- Fiziksel tablet henüz bağlanmadı. Aşama 2 için sıradaki işler: 840dp navigasyon rayı, 393dp portre, kart yoğunluğu ve büyük font satır taşmaları.
