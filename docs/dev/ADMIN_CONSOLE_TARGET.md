# Yönetim Konsolu Hedef Sözleşmesi

Bu belge Yardımcı Asistan geliştirici/yönetici konsolunun büyüme yönünü tanımlar.
Mevcut terminal konsolu korunur; hedef yeni bir deploy/test sistemi yazmak değil,
mevcut repo araçlarını ve gerçek kurulumları tek bir güvenli yönetim yüzeyinde
toplamaktır.

Bu sözleşme gelecekteki admin geliştirme branch'i için otoritatif başlangıç noktasıdır.
Mevcut çalışan davranış bu belgeye uymuyor diye ana dalda acele refactor yapılmaz.

## Amaç

Yönetici şunları ezberlemek zorunda kalmamalıdır:

- müşteri/site web adresleri ve endpoint'leri,
- hangi secret'ın hangi kuruluma ait olduğu,
- hangi repo/ref/sürümün nerede canlı olduğu,
- hangi paketlerin üretildiği veya yayınlandığı,
- hangi deploy komutunun hangi parametrelerle çalıştığı,
- hangi kurulumda hangi servislerin etkin olduğu,
- destek raporlarının ve tanılama verilerinin nerede bulunduğu.

Konsolun görevi "komut listesi" olmaktan çıkıp Yardımcı Asistan kurulumlarının
operasyonel kayıt, durum ve orkestrasyon merkezi olmaktır.

## Mevcut temel

Bugünkü konsol çöpe atılmayacaktır. Özellikle şu yüzeyler hedef mimarinin başlangıcıdır:

- `tools/admin/index.mjs` — CLI/TUI giriş noktası.
- `tools/admin/config/tasks.mjs` — mevcut task/workflow kataloğu.
- `tools/admin/config/sites.mjs` — ilk site/deploy profilleri.
- `tools/admin/ui/menu.mjs` — mevcut terminal arayüzü.
- `tools/admin/ui/status.mjs` — hızlı lokal durum özeti.
- `tools/admin/support-reports.mjs` — private destek raporu erişimi.
- `scripts/verification-registry.mjs` ve `scripts/verify.mjs` — tek canonical doğrulama sistemi.

Admin konsolu doğrulama, build, deploy veya support mantığını ikinci kez
uygulamamalıdır. Var olan scriptleri ve registry'leri orkestre eder.

### Güncel canonical operasyon kaynakları

Admin geliştirmesi aşağıdaki kaynakları yeniden tanımlamamalıdır:

- `config/installations.json` — committed installation metadata; URL/host/path ve yalnız credential referansı.
- `config/credentials.local.json` — opsiyonel lokal credential backend; Git tarafından yok sayılır. Şema örneği `config/credentials.local.example.json`.
- `product-version.json` — ürün, Android versionCode ve web modülü sürümünün canonical kaynağı.
- `firm-template/web-module/api/version.php` — canlı kurulumdan public/salt-okunur ürün + web modülü sürümü.
- `config/installations.json -> landing.release.desktopManifests` — webde yayınlanan Desktop sürümünün canonical update manifest adresleri; manifest içindeki `appVersion` canlı Desktop release sürümüdür.
- `scripts/installation-config.mjs` — installation registry için stabil CLI okuyucu.

Gerçek sync secret, API key, parola, token veya FTP/SSH credential değeri
`config/installations.json` içine yazılmaz. Installation kaydı yalnız `credentialRef`
taşır; credential backend bu referansı çözer.

## Hedef mimari

UI ile iş mantığı ayrılmalıdır:

```text
admin-core
  ├── installations
  ├── credentials
  ├── health
  ├── tasks
  ├── deployments
  ├── releases
  ├── diagnostics
  └── history

admin-tui
  └── admin-core kullanan terminal arayüzü
```

İlk ürün yüzeyi TUI kalabilir. Core terminale bağımlı olmamalıdır; ileride GUI
gerekirse aynı servisler yeniden kullanılabilmelidir.

### 1. Installation registry

BlackSea, Alwaysdata ve gelecekteki her müşteri/kurulum ayrı bir installation
kaydıdır. Registry yalnız secret olmayan operasyonel metadata tutar.

Asgari alanlar:

- kalıcı installation id,
- görünen işletme/site adı,
- site URL ve Yardımcı Asistan web endpoint'i,
- hosting/deploy tipi,
- ilgili repo ve çalışma dizini,
- aktif servis/capability bilgisi,
- beklenen ürün/web sürümü,
- son başarılı deploy ve son health-check zamanı,
- credential referansları.

BlackSea özel-case kodu zamanla registry tabanlı profile dönüşmelidir; ancak mevcut
çalışan akış kırılarak tek seferde genelleştirme yapılmaz.

### 2. Credential/secrets sınırı

Registry gerçek secret değeri tutmaz. Yalnız `credentialRef` benzeri referans tutar.

Kurallar:

- sync secret, API key, parola, token ve SSH/FTP credential repoya commit edilmez,
- admin history/log/diagnostic çıktısına secret yazılmaz,
- UI varsayılan olarak yalnız "kayıtlı / eksik / doğrulanamadı" durumunu gösterir,
- gerekirse kopyalama/gösterme açık kullanıcı eylemi ve mümkün olan en dar kapsamla yapılır,
- credential backend değiştirilebilir olmalıdır; TUI doğrudan dosya biçimine bağımlı olmamalıdır.

İlk gerçek backend mevcut güvenli lokal env/dosya yaklaşımını sarabilir. Daha sonra OS
credential store veya başka güvenli backend'e geçiş core sözleşmesini değiştirmemelidir.

### 3. Durum modeli

Her kontrol yalnız PASS/FAIL olmamalıdır. En az şu semantik durumlar desteklenmelidir:

- `ready` — yapılandırılmış ve sağlıklı,
- `warning` — çalışıyor ancak dikkat/öneri var,
- `error` — yapılandırılmış özellik çalışmıyor,
- `unconfigured` — henüz yapılandırılmamış,
- `disabled` — bilinçli olarak kullanılmıyor,
- `unknown` — güvenilir sonuç alınamadı.

Özellikle temiz kurulumda web URL veya sync secret girilmemiş olması hata değildir;
`unconfigured` durumudur. Yalnız yapılandırılmış bir bağlantının testte başarısız
olması hata sayılır.

### 4. Health ve bağlantı kontrolleri

Konsol installation bazında en az şunları okuyabilmelidir:

- site ve web API erişilebilirliği,
- sync credential varlığı ve güvenli doğrulama sonucu,
- canlı web sürümü,
- desktop/Android/release sürümleriyle drift,
- deploy hedefinin hazır olup olmadığı,
- gerekli repo/çalışma dizininin mevcut ve beklenen ref'te olup olmadığı,
- destek endpoint'i ve private support inbox erişimi,
- ilgili servis etkinse servis-spesifik smoke sonucu.

Health probe'ları mümkün olduğunca salt-okunur olmalıdır. Bir kontrolün yan etkisi varsa
açıkça task/workflow olarak modellenmelidir.

### 5. Version drift

Konsol beklenen ve canlı sürümleri yan yana gösterebilmelidir. En az şu yüzeyler
karşılaştırılabilir olmalıdır:

- repo ürün sürümü,
- Desktop artifact sürümü,
- Android artifact sürümü,
- web module sürümü,
- landing/download manifest sürümü,
- installation bazında canlı web sürümü.

"Eski" kararı tek bir serbest metin karşılaştırmasına değil, ortak version snapshot
modeline dayanmalıdır. Bilgi alınamıyorsa `unknown`, ilgili servis yoksa
`disabled/unconfigured` gösterilir.

### 6. Task ve workflow orkestrasyonu

Admin-core mevcut task ve scriptleri yeniden yazmaz.

Kurallar:

- repository verification için tek kaynak `scripts/verification-registry.mjs` +
  `scripts/verify.mjs` olmaya devam eder,
- admin registry aynı leaf check'leri yeniden tanımlayan ikinci aggregate runner'a dönüşmez,
- build/deploy scriptlerinin iş mantığı TUI içine taşınmaz,
- workflow adımları preflight, impact, confirmation ve post-check bilgisi taşıyabilir,
- tehlikeli işlem varsayılan olarak kullanıcı onayı ister,
- task sonucu commit/ref, installation id, süre ve exit sonucu ile history'ye yazılır,
- mümkün olan işlemlerde dry-run ve salt-okunur preflight önce gelir.

### 7. Deploy yaşam döngüsü

Bir deploy akışı mümkün olduğunda şu modeli izlemelidir:

```text
preflight
  → hedef/credential hazır mı
  → repo/ref ve sürüm özeti
  → gerekli doğrulama
  → kullanıcı onayı
  → deploy
  → canlı health/smoke
  → version snapshot güncelle
  → history kaydı
```

"Deploy everything" gibi kapsamı belirsiz tek tuşlu işlemler yerine hedefi ve etkisi
açık workflow'lar tercih edilir.

### 8. Destek ve diagnostics

Mevcut support inbox admin konsolunun kalıcı parçasıdır. İleride masaüstü
"Sistem ve Tanılama" ekranı diagnostic snapshot gönderebildiğinde admin konsolu aynı
rapor içinde en az şunları gösterebilmelidir:

- uygulama/platform/sürüm,
- ilgili installation kimliği varsa eşleme,
- son WARN/ERROR özeti,
- diagnostic check sonuçları,
- screenshot varlığı,
- rapor durumu: new / reviewing / resolved.

Secret, token ve gereksiz müşteri PII'si support/diagnostic snapshot'a eklenmez.

### 9. Ana ekran ve installation ekranı

Ana ekranın amacı ayrıntı değil, unutulan işi görünür kılmaktır.

Örnek özet:

```text
Yardımcı Asistan Yönetim Konsolu

Repo             main · temiz
Ürün sürümü      2.x.x
Kurulumlar       3
Drift            1 kurulum
Destek           2 yeni rapor
Android          1 cihaz bağlı
```

Installation detayı şu bilgileri tek yerde toplamalıdır:

```text
BlackSea Pansiyon

Site              https://...
Web API           hazır
Credential        kayıtlı · doğrulandı
Canlı web         2.x.x
Beklenen web      2.x.x
Drift             yok
Son deploy        ...
Son kontrol       ...

[Bağlantıları Test Et]
[Canlı Doğrulama]
[Web'i Güncelle]
[Credential Yönet]
[Destek Raporları]
```

Gerçek secret normal görünümde yazdırılmaz.

## Güvenlik ilkeleri

- Admin paneli Defender/firewall/OS güvenliklerini sessizce gevşetmez.
- SSH/FTP/API credential değerleri komut satırı argümanında veya history kaydında
  taşınmamalıdır.
- Remote destructive işlemler açık hedef, etki açıklaması ve onay gerektirir.
- Local cache/report dosyaları hassas veri içeriyorsa kullanıcıya özel izinlerle
  tutulmalıdır.
- Shell string birleştirme yerine mümkün olduğunca argv tabanlı process çağrısı
  kullanılmalıdır.
- Installation metadata ile secret storage birbirinden ayrıdır.

## Modülerlik ilkeleri

- TUI, installation registry dosya formatını veya credential backend'ini doğrudan
  bilmemelidir.
- Health probe'ları UI'dan bağımsız fonksiyonlardır.
- Deployment adapters hosting tipine göre ayrılabilir; installation kimliğiyle
  hard-code edilmez.
- Yeni site eklemek mümkün olduğunca yeni bir profile/registry girdisi olmalı, ana
  menüye yeni özel-case dalları eklememelidir.
- Ortak admin-core genel bir service-locator veya uygulamanın business runtime'ına
  dönüşmemelidir; yalnız geliştirici/operasyon yönetimini sahiplenir.

## İlk geliştirme dilimi

Ayrı admin geliştirme branch'inde ilk hedef tam GUI veya kapsamlı refactor değildir.
Önerilen ilk dilim:

1. Mevcut TUI davranışlarını testlerle sabitle.
2. Installation registry modelini oluştur ve mevcut YA/Support/BlackSea/Landing
   profillerini buna taşı.
3. Credential referansı ile metadata'yı ayır.
4. Ortak status/health snapshot modelini ekle.
5. Version drift görünümünü ekle.
6. Mevcut deploy task/workflow'larını installation-aware hale getir.
7. Support inbox'ı installation/diagnostic snapshot ile ilişkilendirecek seam'i ekle.
8. TUI'yi bu core üzerinden çalıştır; mevcut komutları koru.

Her adımda mevcut scriptlerin canonical ownership'i korunmalıdır.

## V1 kabul kriterleri

İlk büyütülmüş admin konsolu şu durumda yeterli kabul edilir:

- yeni bir kurulum URL/secret/script ezberlemeden registry üzerinden bulunabiliyor,
- secret değerleri repo ve normal admin loglarından tamamen ayrı,
- bir installation için "hazır / yapılandırılmamış / hata" ayrımı doğru yapılabiliyor,
- repo/artifact/web sürüm drift'i tek ekranda görülebiliyor,
- mevcut verification registry ikinci kez modellenmiyor,
- BlackSea deploy ve live verify panelden güvenli workflow olarak yürütülebiliyor,
- destek raporları panelden görülebiliyor,
- UI değişse bile installation/health/deploy core yeniden kullanılabiliyor,
- destructive işlemler açık etki + onay olmadan çalışmıyor.

## Kapsam dışı

İlk geliştirme diliminde şunlar hedef değildir:

- merkezi SaaS kontrol paneli,
- uzaktan müşteri bilgisayarını yönetmek,
- müşteri verisini merkezi sunucuya taşımak,
- runtime plugin sistemi,
- admin panelinden genel amaçlı shell çalıştırmak,
- mevcut verify/build/deploy scriptlerini yeniden yazmak,
- terminal UI'yı sırf görsel nedenlerle Electron uygulamasına dönüştürmek.

GUI ihtiyacı gerçek kullanım baskısıyla ortaya çıkarsa admin-core üzerine ayrı bir yüzey
olarak eklenebilir.
