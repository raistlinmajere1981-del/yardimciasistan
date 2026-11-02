# Demo/Teknikel deploy yedeği saklama — 2026-11-02

- `test-site/landing/scripts/deploy.mjs`: yalnız başarılı HTTP/site/installer/feed doğrulaması sonrası `landing-YYYYMMDDTHHMMSSZ` dizinlerinden **en yeni 1** kalır. Önceden 3 saklanıyordu. Eski yolu, bağımsız `yardimci-asistan-*` backend yedeklerini ve farklı adlandırılan işletme verilerini bu işlem silmez.
- `scripts/deploy-web.sh`: yayınlama, PHP içerik karşılaştırması ve API/HTTP/katalog sağlık denetimleri başarılı olduktan sonra aynı tenant `backup_dir` altında **yalnız `yardimci-asistan-YYYYMMDDTHHMMSSZ`** web modülü yedekleri arasından en güncel 1 dizin kalır. Demo ve Teknikel için farklı tenant backup dizinleri vardır. Başarısız yayında hiçbir eski backup silinmez. Mevcut manuel yedekleme/geri yükleme ürün işlevi değişmedi.
- Teknikel site sahipliğinde `teknikel-*`, `site*`, `2.1.0-db-*` gibi ayrı isimlendirilmiş geçici/yedek dizinlere dokunulmaz. Yeni otomatik temizleme bunlar için genişletilmez.
- Sıralama dosya değişiklik zamanına değil, değişmez UTC stamp içeren ada dayanır. `-mindepth 1 -maxdepth 1 -type d` ile yalnız doğrudan alt klasörler seçilir. Aynı kalıba uymayan dizinler ve sembolik bağlantılar korunur.
- Yerel sentetik testte 3 landing, 3 web-modül ve iki ayrı yabancı isim oluşturulup yalnız her grubun son 1'i korundu; `bash -n` ve `node --check` PASS. 2.2.0 paketleri önceden `release:check`, deploy dry-run ve APK imza eşleşmesinde PASS durumundadır. Canlı deploy ancak bu değişiklikler checkpoint'e alınıp dry-run doğrulandığında yapılacaktır.

## Teknikel büyük katalog sağlık kontrolü

- Teknikel 2.2.0 modülü ilk gerçek deploy denemesinde doğru biçimde sunucuya etkinleştirildi; fakat **849 ürünlük** public `catalog.php` yanıtını `php -r ... "$catalog_json"` ile bir argv argümanına aktarma denetimi işletim sistemi `Argument list too long` sınırında başarısız oldu. Bu **deploy doğrulamasının** hatasıdır; ürün/hesap verisi silinmedi ve eski yedekler tutuldu.
- Sağlık kontrolü `curl ... | php -r '$c = json_decode(stream_get_contents(STDIN), true); ...'` akışına alındı. Geçerli/bozuk HTTP ve JSON kontrolleri korunur; Bash `pipefail` curl hata çıkışlarını da yakalar. Canlı 849 ürünlü public katalogla yeni stdin testi **PASS**.
- Tekrar başarılı Teknikel backend deploy ve yedek sayısı kabulü bu düzeltmeden sonra çalıştırılacaktır; script yeni yayın başarıyla doğrulanmadan yedek silmez.
