# Instagram Business Login (tek buton)

## Merkezi Meta uygulaması
Instagram app ID: `3022570838106676` (Yardımcı Asistan-IG, Meta Instagram Login)
İstenen izinler: `instagram_business_basic`, `instagram_business_content_publish`.
Instagram Business/Creator hesabı gerekir; Facebook Sayfası gerekmez.

Meta Developers > Yardımcı Asistan > Instagram API > API setup with Instagram login
> Business login settings > Valid OAuth Redirect URIs alanına **birebir** ekleyin:

`https://yardimciasistan.alwaysdata.net/instagram/oauth.php`

Bu URI değiştirilirse PHP'deki IG_REDIRECT ve masaüstü sözleşmesi birlikte güncellenmelidir.

## İlk kurulum / gizli anahtar
Meta'da **Instagram app secret** alanını açıp kopyalayın. **Sohbete, Git'e veya
herhangi bir URL'ye yapıştırmayın.** Geliştirme makinesindeki kendi terminalinizde:

`cd /home/raistlin/YardimciAsistan; node scripts/configure-instagram-oauth-secret.mjs`

Komut parolayı terminale göstermeden SSH stdin üzerinden Alwaysdata'ya gönderir.
Anahtar `/home/yardimciasistan/.config/yardimci-asistan/instagram-oauth.json`
dosyasında (`0600`) kalır, kamuya açık `www/` içinde değildir.
Meta app secret hiçbir zaman masaüstü renderer'a veya kullanıcılara verilmez.

## Bağlantı akışı
Ayarlar > Servisler > Instagram > Instagram ile bağlan.
Instagram Business Login tarayıcıda açılır; kullanıcı hesap ve izin onayı verir.
Sunucu yetki kodunu kısa/uzun ömürlü tokene dönüştürür, profesyonel hesabı
kontrol eder ve tokenı www dışı geçici depoda AES-GCM şifreleyerek bekletir.
Masaüstü özel doğrulayıcıyla yalnız bir kez alır, hesabı tekrar doğrular, yalnız
Electron safeStorage ile şifrelenmiş tokenı yerel veritabanına kaydeder.
Eski manuel bağlantı bu sırada atomik olarak değiştirilir.

Yetkilendirme oturumu 10 dakika geçerlidir; başarısız giriş otomatik döngü
oluşturmaz. Bir süre kullanılmayan uzun ömürlü tokenlar yayın öncesinde,
süreleri dolmadan yenilenmeye çalışılır. Süre bitmişse yeniden giriş gerekir.

## Güvenlik / sınırlar
- Yetki kodu ve token callback HTML'inde görünmez. Callback GET query değeri
  web sunucusu erişim günlüklerinde yer alabileceğinden bu günlükler kısıtlı
  tutulmalıdır. `Referrer-Policy: no-referrer` uygulanır.
- Sunucu callback dışındaki erişim 503/setup_pending döndürüyorsa app secret
  henüz kurulmamıştır.
- Instagram uygulaması geliştirme modundayken yalnız Meta uygulamasının
  rollerinde/testçilerinde yetkili hesaplarla giriş çalışır. Diğer işletmeler
  için Meta Advanced Access / App Review gereklidir.
- Kaynak/paket sürümü değişikliği yeni masaüstü release'i gerektirir. Web OAuth
  tek başına kurulunca eski masaüstü binary yeni butonu göstermez.
- Legacy yayın taslakları ve geçmişi silinmez; yeni token kaydı yalnız aynı
  işletmenin Instagram servis bağlantısını değiştirir.

Hedefli doğrulama:
`node scripts/smoke-instagram-oauth-web.mjs`
`node scripts/smoke-instagram-oauth-settings-ui.mjs`
