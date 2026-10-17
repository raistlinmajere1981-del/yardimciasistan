# Market Pilot · Alwaysdata

Canlı hedef: https://yardimciasistantest.alwaysdata.net/
Web modülü: https://yardimciasistantest.alwaysdata.net/yardimci-asistan/

Site kaynakları `index.php` ve `assets/market.css`. Bu özel müşteri sitesi, genel
Yardımcı Asistan demo sayfasından bağımsızdır. Başlangıçtaki "Market" adı geçici
etikettir, gerçek işletme ismi değildir. İşletme kesin bilgileri belli olunca
sunucuda `www/site.local.php` dosyasından değiştirilebilir:

```php
<?php
return [
    \x27name\x27 => \x27İşletme adı\x27,
    \x27phone\x27 => \x27\x27,
    \x27address\x27 => \x27\x27,
    \x27hours\x27 => \x27\x27,
];
```

Müşterinin bilgilerinin bulunduğu bu yerel dosya sürüm yayınında değiştirilmez.
Katalog bağlantısı yalnız modülün ilgili PHP route\x27u kuruluysa görünür;
yayınlanan ürünleri gösterme yetkisi modülün kendi ayarlarındadır.

SSH erişimi kurulunca repo kökünden:

```sh
npm run deploy:market-pilot -- --dry-run
npm run deploy:market-pilot -- --yes
```

İlk kurulumda 256-bit bağımsız güvenlik anahtarı oluşturulur. Anahtar yalnız yerel
`artifacts/market-pilot/install-info.txt` dosyasında bulunur, admin konsoluna yazılmaz.
Sonraki yayınlarda mevcut modülün data, firma config, media ve knowledge alanları
canonical deploy yordamıyla korunur. Diğer Alwaysdata hesabına dokunulmaz.
