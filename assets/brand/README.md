# Yardımcı Asistan marka varlıkları

Seçilen yeni marka dili: **Nexa V2 ile uyumlu mavi/turkuaz maskot, koyu lacivert + camgöbeği sözcük işareti, şeffaf uygulama simgesi**. Yardım kuruluşu/medikal logo simgeleri kullanılmaz.

## Kaynak ve çıktı

- Kaynak: depo kökündeki `newlogo.png` (1448×1086, tasarım sunum panosu; **doğrudan logo değildir**).
- Üretim: `python3 assets/brand/generate-assets.py` (Pillow gerekli; dış ağ yok).
- Ana şeffaf maskot: `assets/brand/yardimci-asistan-mark.png`.
- İki satırlık şeffaf ana logo: `assets/brand/yardimci-asistan-logo-full.png` (açık zeminde sunum/kapak görselleri için).
- Masaüstü: `apps/desktop-app/public/assets/yardimci-asistan-symbol.png`, `public/favicon.png`, paket simgesi `assets/app-icon.png` ve `app-icon.ico`.
- Android: `apps/android-app/src/main/res/drawable/ic_launcher_foreground.png` (şeffaf adaptive foreground), `mipmap-anydpi/ic_launcher.xml` (desteklenen tüm Android sürümlerinde kullanılan adaptive ikon).
- Demo web: `test-site/landing/assets/yardimci-asistan-{symbol,logo}.png`, `favicon.png`.
- API-only web modülü sunum varlığı içermez; demo widget marka sembolünü demo web dizininden kullanır.

## Kurallar

Görseldeki büyük maskot bölgesi tek kez kesilir. Çizim çevresindeki çok açık zemin, istenmeyen metin/ikon süsleri ve alttaki sahne gölgesi ayrılır; beyaz yüz, gözler ve mavi kıvrımlar korunur. Sunum panosunun tamamını ikon veya logo olarak küçültmeyin.

Küçük boyutlarda **yalnızca maskot sembolü** kullanılır; sözcük işareti küçültülmez. Web sitesi, masaüstü yan menüsü ve kilit ekranı sözcük işaretini canlı metinle gösterir. Bu alanlarda yalnız simge dosyasını yenilemek yeterlidir. Tam logo açık zeminde sunum/kapak görselleri için kaynak ve demo web dizinlerinde korunur. Koyu zeminde ana logonun koyu yazısını zorla göstermeyin; sembol + canlı açık renk başlık tercih edin.

Bu işlem yalnız kaynak varlıkları yeniler; canlı Alwaysdata veya yayınlanmış paketleri dağıtmaz. Tasarım panosu ve `assets/nexa` animasyon rig'i bağımsızdır. Mevcut avatarın çalışma/konuşma durumlarına dokunulmaz.
