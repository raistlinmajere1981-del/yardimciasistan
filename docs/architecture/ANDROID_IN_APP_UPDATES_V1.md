# Android Companion + Bayi — uygulama içinden APK güncelleme V1 (KISMİ UYGULAMA)

**Durum (2026-11-01 C28):** Android stable manifest üretimi ve deploy akışına bağlama ile Companion/Bayi ortak updater kaynakları, Ayarlar kontrolleri ve Java manifest testleri uygulandı. Canlı Android stable feed yayımlanmadı; release→release fiziksel OTA kanıtı henüz yok. Google Play kullanılmayacak. Amaç, masaüstü Windows güncelleme deneyimine benzeyen **sürüm sorgulama → güvenli indirme → kullanıcı onaylı yükleme → yeni sürüm doğrulama** zincirini iki ayrı Android uygulamasına eklemek. Root, ADB, aynı Wi-Fi veya bilgisayar bağlantısı gerekmemeli.

## Zaten var olan ve korunacak otoriteler

- Companion: `com.yardimciasistan.android`, Bayi: `com.yardimciasistan.dealer`. Uygulamalar ve verileri birbirinden bağımsız; güncelleme ayrı ayrı yapılır.
- `product-version.json`: tek ürün sürümü (`versionName`), tek monoton artan Android `versionCode`; mevcut değer **2.1.0 / 16** (planı yazdığımız anda). İleride farklı Android sürüm hatları gerekmiyorsa ikinci bir sürüm kaynağı üretme.
- `apps/android-app/release-signing.gradle`: iki APK'nın ortak, kalıcı **release imzası**. Yerinde güncelleme için her uygulamanın kurulu APK'sıyla yeni APK'nın imzası eşleşmeli. Debug → release imza geçişi normal yerinde güncelleme değildir; yalnız test cihazında temiz kurulumla doğrulanır. Kullanıcı verisinin korunduğu release → release güncellemesi ayrıca sınanmalı.
- `scripts/lib/release-artifacts.mjs`: iki Android APK'yı, `output-metadata.json`, paket kimliği, sürüm, imza sertifikası, boyut ve SHA-256 ile doğrulayan mevcut yayın sahibi. `deploy:landing --with-downloads --activate-updates` ve Admin release akışıyla bütünleşecek; Windows stable manifestlerine dokunmadan Android için yeni manifest üretilecek.
- Windows updater'ın ortak **yayın metadatası / doğrulama ve durum mantığı** tasarım referansıdır. Windows NSIS/PowerShell/UAC/backup mekanizmasını Android'e taşımak gerekmiyor. **Manuel yedek/restore, ön sıfırlama güvenlik yedeği ve şema uyumsuzluğu `legacy-data` arşivi korunur.**

## Yayın akışı ve sunucu sözleşmesi

- Öncelikli öneri: aynı HTTPS yayın altyapısında ayrı, salt-okunur stable feed'ler: `/updates/stable/android-companion/release.json` ve `/updates/stable/android-dealer/release.json`. Bu yollar **önerilen tasarımdır, bugün yayınlanmış uç noktalar değildir**.
- Her manifest: sabit format/sözleşme versiyonu, kanal `stable`, `applicationId`, `versionName`, artan `versionCode`, yayın zamanı, kısa sürüm notları, SHA-256, bayt boyutu ve aynı HTTPS alanındaki APK indirme adresini içerir. İndirilen dosya gerçek build/package kimliği, hash ve içerik türüyle yeniden doğrulanır. Eski/aynı sürüm asla güncelleme olarak sunulmaz; eksik/bozuk manifest ve HTTP ya da alan dışı yönlendirme **fail-closed**.
- Tek gerçek APK kaynak ve imza denetimi yayın hattındadır. Manifestler sunulan APK'larla atomik biçimde yayınlanır: önce dosya yükle/doğrula, sonra manifesti etkinleştir; yarım yükleme veya önce manifest yayımlama yok. Eski dosyaların temizliği yeni manifestin işaret ettiği APK'yı silemez.
- CDN/cache davranışında manifest ve APK ayrı ele alınır; güncelleme sorgusu eski cache'de kalmamalı, APK hash'le doğrulanmalı. Sunucu verisi yalnız güncelleme metadatasıdır; kullanıcı tokenı, bayi hesabı, işletme verisi ve imza özel anahtarı bu kanalda yayımlanmaz.

## Android uygulaması kullanıcı deneyimi

- Her uygulamanın Ayarlar ekranında küçük bir **Güncellemeler** alanı: mevcut sürüm, son kontrol, `Güncellemeyi denetle`, varsa yeni sürüm/sürüm notları ve `İndir ve yükle`. İsteğe bağlı **günlük otomatik kontrol**; kontrol sessiz, kurulum **asla sessiz değil**. Kullanıcı onayı olmadan APK yükleme veya uygulamayı zorla sonlandırma yok.
- Kontrol internet olmadığında kendi kendine geri çekilir; uygulamanın yerel/çevrimdışı işlemleri çalışmaya devam eder. Companion güncellemesini masaüstünün LAN/USB eşleşmesine bağımlı kılma. Bayi girişinin sona ermesi herkese açık sürüm sorgusunu bozmamalı; APK indirme bağlantısında bayi hesap sırları taşınmamalı.
- İndirme yalnız HTTPS, sınırlı dosya boyutu ve indirilen dosyanın SHA-256 kontrolü ile tamamlanır. Paket gerçekten `applicationId` ve `versionCode` bakımından bekleneni karşılamalı; Android'in sistem imza denetimi de son kapıdır. İmza uyuşmazlığı, eksik alan, yanlış paket, downgrade/yanlış sürümde **kurulum başlatılmaz**. Geçici dosyalar gerektiğinde temizlenir.
- Android 8.1+ (`minSdk 26`) ile uyumlu `FileProvider`/Android paket yükleyici akışı; sistemin “bu kaynaktan yüklemeye izin ver” ekranına gerek duyulursa kullanıcı yönlendirilir. Bu izin otomatik açılamaz. Root/ADB, Accessibility otomasyonu, gizli kurulum veya Play Store zorunluluğu yok.
- Sistem kurulum ekranı iptal/başarısız dönerse uygulamanın eski sürümü ve verisi korunur; yanlış “yükleme başarılı” bildirimi gösterilmez. Kurulum tamamlandığını ancak yeni APK gerçekten yeni `versionCode` ile açılıp kalıcı uygulama kimliğini ve veriyi gördüğünde başarı say.
- Companion: eşleşme anahtarı, cihaz kimliği, bekleyen güvenli outbox/satış ve cari işlemler **release → release güncellemesinde** korunmalı. Bayi: davet/hesap oturumu, çoklu sepet, offline taslak ve tekrar deneme durumu korunmalı. Her iki uygulama da güncelleme yüzünden stok/satış/sipariş işlemini iki kez göndermemeli.

## Uygulama ve test dilimleri

1. **Yayın tarafı:** İki Android stable manifesti için ortak üretici/doğrulayıcı, atomic deploy ve test fixture'ları. Mevcut Windows güncelleyiciyi bozma. Sahte HTTPS fixture'da yanlış paket/indirgeme/hash/URL/redirection senaryolarını reddet.
2. **Paylaşılan Android güncelleme modülü:** Uygulama kimliği parametreli, basit, güvenilir sürüm kontrolü ve indirme doğrulayıcısı. Companion/Bayi'de iki ayrı uygulama kabuğuna bağlanır; doğrudan çoğaltılmış updater motoru oluşturma. `minSdk 26` ve sistem paket yükleyici sözleşmesini test et.
3. **Companion UI + release → release gerçek cihaz:** Yerel QR/TLS eşleşme, güncelleme öncesi ve sonrası aynı cihaz/servis anahtarı, kupon/puan/outbox ve yeniden bağlanma. Açılış crash, iptal, çevrimdışı, yarım indirme ve tekrar deneme negatifleri.
4. **Bayi UI + release → release gerçek cihaz:** Oturum/davet, özel katalog/revision, fiyat, favori, çoklu sepet, offline taslak, kuyruktaki sipariş ve yeni sürüm sonrası tekrar eşleşme. İki APK birbirini güncellememeli.
5. **Release ve dağıtım:** Her iki APK için imza/metadata/hash/sürüm doğrulaması; `pre-main` ve `release:check` kapsamına manifest ve Android updater testleri eklenmesi. Gerçek Android kullanıcı izni ve kurulum sonucu yalnız fiziksel cihaz üzerinde kanıtlanmış sayılır.

**Açık ürün kararı:** Zorunlu güncelleme, yayın kanalı değişimi (beta/stable), minimum desteklenen sürüm eşiği şimdilik **V1 kapsamında değil**. Öncelik kullanıcı kontrollü, güvenilir, normal yerinde güncelleme. Başlangıç için ek sunucu/hesap/Google Play servisi kurma.
