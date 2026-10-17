## Web bağlantı anahtarlarını yönetme

Admin → Kurulumlar → bir işletme seçildiğinde ilgili web modülü anahtarı
otomatik kontrol edilir. **Sunucudan yenile** yeniden kontrol eder; **Göster**
ve **Kopyala** yerel yönetim kaydındaki değeri kullanır. Anahtarlar arayüz
yükleme loglarına, test raporlarına, Git'e veya herkese açık web sitesine yazılmaz.

- Alwaysdata (`ssh-rsync`): `config/business.json` sunucuda SSH üzerinden,
  salt-okunur okunur. Başarılı doğrulamadan sonra yalnız ilgili
  `credentialRef` kaydı `config/credentials.local.json` içinde güncellenir.
- BlackSea: `blacksea_web/.deploy/yardimci-asistan-install-info.txt`
  otomatik okunur. Bu yerel kayıt **canlı doğrulama değildir**; yerel
  saklanan anahtarla çelişirse mevcut anahtar otomatik değiştirilmez.
  Natro FTP bağlantısı şifreli olmadığı için panel web secret'ını FTP
  üzerinden çekmez. Gerekirse mevcut elle değiştirme alanı kullanılabilir.
- SSH/kurulum dosyası okunamıyorsa kayıt korunur. Panel güncelliği
  doğrulayamadığını belirtir; hatalı bir anahtar uydurmaz.

Manuel eklenen BlackSea anahtarı yalnızca yerel admin kaydını değiştirir,
sunucunun konfigürasyonunu değiştirmez. Bir müşteri sitesinde anahtarın
herkese açık HTML, JS veya JSON olarak yayımlanması gerekmez.
