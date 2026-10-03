# Yardımcı Asistan Admin Control Center

Bu belge yeni özel yönetim uygulamasının hedefini tanımlar.

Yeni admin uygulaması mevcut terminal konsolunun görsel sürümü değildir. Sıfırdan,
yalnız gerçek operasyon ihtiyaçlarına göre tasarlanır. Mevcut `tools/admin` geçici
bir araçtır; işe yarayan script ve registry'ler yeniden kullanılabilir ancak TUI
mimarisi, menü yapısı veya ekran modeli korunmak zorunda değildir. Yeni uygulama
yeterli kapsama ulaştığında eski terminal admin tamamen kaldırılabilir.

## Ürün sınırı

Admin Control Center yalnız geliştirici/yönetici kullanımı içindir.

- müşteri kurulum paketlerine girmez,
- Desktop/Android ürün runtime'ının parçası değildir,
- normal release artifact'larına dahil edilmez,
- merkezi SaaS değildir,
- kullanıcı verisini merkezi sisteme taşımayı amaçlamaz,
- genel amaçlı shell arayüzü sağlamaz.

Tercih edilen yerleşim ayrı bir yan uygulamadır:

```text
apps/admin-control-center/
  electron/
  src/
  services/
  ui/
```

Kendi `package.json` dosyası `private: true` olur. Root release/build scriptleri
bu uygulamayı paketlemez. Geliştirme komutu ayrı tutulur.

## Tasarım ilkesi

Önceki admin konsolunu katman katman büyütmek yerine, operasyon modelini doğrudan
ekranlara yansıtan temiz bir masaüstü uygulaması tasarlanır.

UI bir "komut listesi" değildir. Kullanıcı şu soruların cevabını doğrudan görmelidir:

- Hangi kurulumlar var ve hangileri sağlıklı?
- Hangi sürüm nerede canlı?
- Repo, paket, web ve mobil sürümler arasında drift var mı?
- Son doğrulama gerçekten mevcut HEAD için mi?
- Hangi deploy hedefi hazır?
- Hangi destek talepleri açık?
- Hangi secret/credential kayıtlı, eksik veya doğrulanamadı?
- Bir release/deploy yaparsam hangi sistemler etkilenecek?

## Canonical kaynaklar

Yeni uygulama operasyon bilgisini ikinci kez tanımlamaz. Uygun olduğunda mevcut
canonical kaynakları okur ve orkestre eder:

- `config/installations.json`
- `config/credentials.local.json` veya gelecekteki credential backend
- `product-version.json`
- canlı `api/version.php` endpoint'leri
- Desktop update manifestleri
- `scripts/verification-registry.mjs` ve `scripts/verify.mjs`
- mevcut build/deploy/live-check scriptleri
- support inbox altyapısı

Bu kaynakların arayüz için yetersiz kaldığı yerde admin uygulamasına özel yeni model
ve servisler eklenebilir. Eski TUI'nin soyutlamaları korunmak zorunda değildir.

## Uygulama mimarisi

İlk hedef Electron + React + Vite tabanlı ayrı bir masaüstü uygulamasıdır. Bunun
nedeni Git, filesystem, SSH/rsync, ADB, process çalıştırma, credential erişimi ve
lokal dosya açma gibi işletim sistemi yeteneklerinin doğal gereksinim olmasıdır.

Renderer doğrudan shell, filesystem veya credential erişimi yapmaz. Electron
main/preload sınırı açık tutulur.

Önerilen domain servisleri:

```text
repository
installations
credentials
health
versions
verification
releases
deployments
support
history
devices
```

Bunlar eski terminal admin için ortak bir framework olmak zorunda değildir. Öncelik
yeni uygulamanın temiz ve anlaşılır olmasıdır.

## Ana ürün yüzeyleri

### Genel Bakış

Tek bakışta:

- repo branch / HEAD / temiz-kirli durumu,
- ürün sürümü,
- son başarılı Full Verify ve hangi commit için olduğu,
- kurulum sağlık özeti,
- sürüm drift sayısı,
- açık destek talebi sayısı,
- bağlı Android cihazı,
- son deploy/release özeti.

### Kurulumlar

Her gerçek kurulum tek kayıt olarak görünür. İlk örnekler Yardımcı Asistan web
modülü, landing, merkezi destek ve BlackSea'dir.

Kurulum detayı:

- site ve web modülü adresleri,
- canlı ve beklenen sürüm,
- credential durumu,
- health sonuçları,
- son kontrol,
- son deploy,
- etkin yetenekler,
- kurulumla ilişkili destek kayıtları,
- güvenli operasyon aksiyonları.

### Release

Kaynak koddan yayına kadar gerçek release durumunu gösterir:

```text
Kaynak
→ Doğrulama
→ Paketler
→ Yayın
→ Canlı doğrulama
```

Adımlar yeni build sistemi yazmaz; mevcut canonical scriptleri çalıştırır ve
sonuçlarını anlaşılır bir modele dönüştürür.

### Testler

Verification registry'nin görsel yüzüdür. Full Verify ve alt kontroller görülebilir,
çalıştırılabilir ve geçmiş sonuçları mevcut HEAD ile ilişkilendirilebilir.

### Deploy

Deploy işlemi tek "çalıştır" düğmesi değildir:

```text
preflight
→ hedef ve etki özeti
→ gerekiyorsa doğrulama
→ açık kullanıcı onayı
→ deploy
→ canlı kontrol
→ sonuç/history
```

### Destek

Mevcut support inbox'ın tam görsel yüzeyi:

- yeni / inceleniyor / çözüldü,
- screenshot,
- uygulama/platform/sürüm,
- WARN/ERROR özeti,
- diagnostic snapshot,
- ilgili installation eşlemesi,
- çözüm notu ve çözüldüğü sürüm.

### Sistem

Geliştirici ortamı ve altyapı durumu:

- credential referansları,
- repo yolları,
- gerekli araçlar,
- Android/ADB,
- local history/cache,
- admin uygulamasının kendi ayarları.

Secret değerleri normal görünümde gösterilmez.

## Görsel yön

Hedef yoğun bir "dev tool" ekranı değil, sakin ve okunabilir bir kontrol merkezidir.

- solda kalıcı ana navigasyon,
- üstte bağlama göre kısa durum/aksiyon alanı,
- ana içerikte az sayıda güçlü panel,
- durumlar metin + ikon + renk ile birlikte,
- hover/press/click geri bildirimi belirgin,
- gereksiz modal zincirleri yok,
- uzun log/teknik detaylar ikincil yüzeylerde,
- Nexa karakteri yardımcı durum/öneri alanlarında kullanılabilir fakat ürün
  mimarisinin merkezi değildir.

Referans görsel bir tasarım yönüdür; piksel kopyası değildir.

## Güvenlik

- Secret, token, parola ve sync key Git'e yazılmaz.
- Renderer'a gereksiz secret gönderilmez.
- Credential değerleri log/history'ye düşmez.
- Destructive remote işlemler hedef + etki + açık onay ister.
- Shell string birleştirme yerine argv tabanlı process çağrıları tercih edilir.
- Health kontrolleri mümkün olduğunca salt okunurdur.
- Admin uygulaması firewall/Defender/OS güvenliklerini sessizce değiştirmez.

## Ana uygulamadan izolasyon

Bu branch'teki admin geliştirmesi mümkün olduğunca şu alanlara dokunmaz:

- `apps/desktop-app`
- Android runtime
- işletme/business modülleri
- müşteri installer/paketleme akışları

Admin için yeni veri gerekiyorsa önce mevcut canonical metadata veya salt-okunur
adapter kullanılır. Ürün runtime'ında gerçek yeni capability gerekiyorsa bu ayrı bir
ana uygulama değişikliği olarak ele alınır.

## Geliştirme sırası

1. Ayrı Admin Control Center uygulama iskeleti.
2. Typed Electron IPC ve güvenli process/FS sınırı.
3. Gerçek verili Genel Bakış.
4. Kurulumlar + health + version drift.
5. Testler + verification geçmişi.
6. Release görünümü.
7. Deploy workflow'ları.
8. Destek merkezi.
9. Sistem/credential yönetimi.
10. Yeni uygulama eski terminal admin'in tüm gerekli işlerini karşıladığında
    `tools/admin` ve ona özel kodların kaldırılması.

## İlk kabul noktası

İlk anlamlı sürüm şu durumda hazır sayılır:

- uygulama ayrı açılıyor ve hiçbir müşteri paketine girmiyor,
- Genel Bakış mock veri kullanmadan gerçek repo/sürüm/kurulum durumunu gösteriyor,
- BlackSea ve Yardımcı Asistan kurulumlarının health + version drift'i görülebiliyor,
- Full Verify mevcut HEAD ile ilişkilendirilebiliyor,
- hiçbir secret normal UI/log/history içinde açığa çıkmıyor.

Bu noktadan sonra ekranlar gerçek kullanım baskısına göre genişletilir; eski terminal
admin'in yapısı yeni tasarım için kısıt kabul edilmez.
