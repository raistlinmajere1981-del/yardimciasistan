# Demo veri ZIP'leri — 2.2.0 canlı yayın kabulü (2026-11-02)

- `/kurulum/` sayfasındaki üç örnek işletme kartı, `inc/demo-installation.php::demo_sample_downloads()` aracılığıyla sürüm özel ZIP dosyası gerçekten mevcut ve okunabilir olduğunda otomatik aktiftir. Bu nedenle site PHP/JS kodunu yeniden deploy etmek gerekmedi.
- Eski 2.1.0 fixture'lar **yeniden adlandırılmadı**. `scripts/demo-data/lib/util.mjs` artık kanonik `product-version.json` değerini kullanıyor; mevcut Desktop 2.2.0 şema/verisiyle `node scripts/demo-data/generate-demo-data.mjs` yeniden üretildi. `node scripts/demo-data/verify-demo-data.mjs` sonuçları **3/3 PASS**: arşiv düzeni, SHA-256, SQLite quick_check/foreign_key, sır taraması ve gerçek veri okuma yolları.
- `node --test scripts/demo-data/demo-data.test.mjs` **PASS**, üretici sürümüyle `product-version.json` eşleşmesi için regresyon eklendi. `node --test test-site/landing/scripts/test-demo-sample-downloads.mjs` **PASS**. `stage-demo-packages.mjs` doğrulama ve `--stage` adımları da 3/3 PASS.
- Tek seferlik kontrollü SCP yayını, `yardimciasistan@ssh-yardimciasistan.alwaysdata.net` hesabının **yalnız** `/home/yardimciasistan/www/downloads` dizinine yapıldı. Uzaktaki `release.json.desktopVersion=2.2.0` ön koşulu sağlandı. Önce gizli geçici dosyaya yüklenip uzak SHA-256/boyut doğrulandı; ardından `chmod 644` ve atomik `mv` uygulandı. Backend, güncelleme feed'leri, kullanıcı/işletme verisi ve diğer site dosyaları değiştirilmedi.

| İndirme dosyası | Bayt | SHA-256 |
|---|---:|---|
| `YardimciAsistan-OrnekVeri-pension-restaurant-2.2.0.zip` | 821757 | `6e6bbb129ba8f75aa1f9f7775959e04d8d4fde4eefd0ae6e7d796a9d7dd02a0b` |
| `YardimciAsistan-OrnekVeri-market-2.2.0.zip` | 176344 | `c934867cbb3cad8206769998f5e3eb646dd053c884ae2ead3c6dd156bad43fea` |
| `YardimciAsistan-OrnekVeri-market-bayi-2.2.0.zip` | 177775 | `9c4dbb2d5f52d33c6ad431030941bc44d1390cba618cf56eadb51878fcbd6834` |

**Canlı kabul:** Sunucu PHP `demo_sample_downloads()` üç kartı `ready=true` döndürdü; `https://yardimciasistan.alwaysdata.net/kurulum/` yanıtının HTML'inde üç güncel ZIP yolu görüldü. Aynı üç dosya gerçek **HTTPS HTTP 200 + SHA-256 + tam bayt sayısı** ile doğrulandı.

Kullanım: ZIP'in içindeki tek backup klasörünü uygulamanın `backups/` dizinine çıkarıp **Ayarlar → Veriler → Geri Yükle** ile yüklemek gerekir. ZIP doğrudan restore girdisi değildir. Bu sentetik veriler yerel kayıtların yerini alır; web/Android eşleştirmeleri ayrıca yapılır.

Kapsam: Demo yayınına özel; Teknikel'e, diğer müşterilere veya işletme kayıtlarına bu ZIP'ler yüklenmedi. Fiziksel Windows restore kabul testi bu yayın işleminin kapsamında değildi.
