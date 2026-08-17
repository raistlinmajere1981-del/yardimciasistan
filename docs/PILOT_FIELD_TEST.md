# Yardımcı Asistan — Pilot Saha Testi

Bu belge ilk gerçek işletme tanıtımından önce uygulanacak kısa ama sert saha turunu tanımlar. Amaç yeni özellik bulmak değil; işletme sahibinin günlük kullanımında veri, para, stok, rezervasyon veya senkron kaybına yol açabilecek sorunları ortaya çıkarmaktır.

## 1. Otomatik kapı

Repo kökünde önce temel pilot kontrolü çalıştırılır:

```bash
node scripts/pilot-check.mjs
```

Bu mod Android SDK, fiziksel telefon ve Playwright tarayıcı kurulumunu zorunlu tutmadan ürün omurgasını tarar. Sonuç ayrıca `artifacts/pilot-check/latest.json` dosyasına yazılır.

Daha geniş tur için:

```bash
node scripts/pilot-check.mjs --full
```

`--full` modunda uygun platformda Electron/Xvfb, Android debug build ve Playwright e2e de devreye girer.

### Otomatik kapı kabul kriteri

- `result: passed`
- başarısız veya atlanmış temel kontrol olmaması
- web talebi, otomatik sync, Android cihaz onayı/tokenı, finans, oda hesabı, restoran→oda transferi ve demo-flow testlerinin geçmesi

Bir build ön koşulu başarısız olursa sonraki testlerin ürettiği ikincil hatalar anlamlı olmayacağı için runner onları `skipped` olarak işaretler.

---

## 2. Temiz Windows kurulumu

Bu tur mümkünse daha önce Yardımcı Asistan kurulmamış bir Windows kullanıcı hesabında yapılmalıdır.

Kontrol:

- NSIS installer açılıyor ve kurulum tamamlanıyor.
- Uygulama ilk açılışta crash olmuyor.
- Kullanıcı veri klasörü Windows kullanıcı alanında oluşuyor.
- SQLite veritabanı uygulama klasörüne değil kullanıcı veri alanına yazılıyor.
- `backups/` klasörü oluşuyor.
- Uygulama kapatılıp yeniden açıldığında ilk kurulum verileri korunuyor.
- İkinci kez uygulamayı açma denemesi ikinci bağımsız instance üretmiyor.
- WhatsApp Web çalışma alanı açılabiliyor.

**Blocker:** kurulum/açılış hatası, verinin Program Files içine yazılması, yeniden açılışta veri kaybı.

---

## 3. İlk kurulum — hibrit işletme

İşletme tipi olarak `Pansiyon + Restoran/Kafe` seçilir.

Önerilen sahte test verisi:

- 4 oda
- 6 masa
- 2–3 masa kategorisi
- 5–10 menü ürünü
- Android açık
- WhatsApp açık
- AI ilk turda isteğe bağlı

Kontrol:

- oda, masa, QR menü, WhatsApp ve Android modülleri açık başlıyor.
- oda ve masa sayıları kullanıcının verdiği değerlerle oluşuyor.
- sektör seçimi değiştirildiğinde mevcut kayıtlar silinmiyor.
- tekrar hibrit profile dönüldüğünde veriler görünür kalıyor.
- Ana Ekran > Sistem Sağlığı web, Android, AI, uygulama kilidi ve yedek durumunu anlaşılır gösteriyor.

**Blocker:** profil değiştirince veri silinmesi veya modüllerin yanlış veriyi üretmesi.

---

## 4. Web talebi ve internet kesintisi

### 4A — normal bağlantı

1. Web formundan yeni pansiyon talebi gönder.
2. Talebin web tarafında başarı mesajı verdiğini doğrula.
3. WhatsApp'ın otomatik açılmadığını; yalnız isteğe bağlı seçenek olduğunu doğrula.
4. Masaüstünde talebin otomatik geldiğini kontrol et.
5. Aynı müşterinin müşteri kaydına işlendiğini kontrol et.

### 4B — masaüstü çevrimdışı

1. Masaüstü bilgisayarın internetini kes.
2. Web sitesinden ikinci talebi gönder.
3. Masaüstünde yerel işlerin kullanılabildiğini doğrula.
4. İnterneti geri aç.
5. Manuel müdahale olmadan talebin masaüstüne geldiğini doğrula.
6. Aynı talebin iki kez oluşmadığını kontrol et.

**Blocker:** talep kaybı, duplicate kayıt veya internet yokken masaüstünün kullanılamaması.

---

## 5. Pansiyon günü

Bir test müşterisi oluştur ve 2 gecelik rezervasyon aç.

Kontrol sırası:

1. Oda ata.
2. Misafiri check-in yap / oda hesabını aç.
3. Gecelik fiyat ve konaklama toplamını kontrol et.
4. Oda hesabına bir menü ürünü ekle.
5. Bir manuel ek ücret ekle.
6. Küçük bir indirim ekle.
7. Kısmi nakit ödeme al.
8. Uygulamayı tamamen kapatıp yeniden aç.
9. Oda hesabı, ödeme ve kalan borcun aynen korunduğunu doğrula.
10. Kalan borçtan fazla ödeme girmeyi dene; reddedilmeli.
11. Borç varken normal çıkışı dene; açık izin olmadan reddedilmeli.

**Blocker:** yeniden başlatmada bakiye değişmesi, çift kasa geliri, aşırı ödeme kabulü.

---

## 6. Restoran + odaya yaz

Aynı misafir içerideyken bir restoran masasında gerçek sipariş akışını kullan.

1. Masada adisyon aç.
2. Stok takip edilen bir ürün ekle.
3. Ürünün stoktan **bir kez** düştüğünü doğrula.
4. Siparişi `Hazırlanıyor` → `Servis Edildi` → `Hesap Bekliyor` akışından geçir.
5. `Hesabı odaya yaz` panelinde doğru masa/tutar/oda/misafiri seç.
6. Onay ekranındaki bilgileri kontrol et ve aktar.

Aktarım sonrası:

- masa kullanılabilir olmalı,
- adisyon kapalı olmalı,
- oda hesabında restoran kalemi görünmeli,
- stok ikinci kez düşmemeli,
- Kasa'ya transfer anında gelir yazılmamalı,
- aynı adisyon ikinci kez başka odaya taşınamamalı.

Sonra oda hesabından ödeme al:

- Kasa geliri bu anda ve yalnız bir kez oluşmalı.

**Blocker:** çift stok düşümü, çift gelir, duplicate transfer veya yanlış odaya sessiz aktarım.

---

## 7. Android yeni telefon senaryosu

Mümkünse daha önce kullanılmamış/uygulama verisi temizlenmiş bir Android cihazla yapılır.

1. Release/pilot APK'yı kur.
2. İlk bağlantıda firma web modülü adresini ve bootstrap anahtarını gir.
3. Telefonun işletme verisini henüz göstermediğini doğrula.
4. Masaüstünde cihazı `onay bekliyor` olarak gör.
5. Rol ve izinleri seçip aktif et.
6. Telefonda yenileme/senkron yap.
7. Cihazın artık kendi tokenıyla çalıştığını doğrula.
8. Telefonu masaüstünden pasifleştir.
9. Telefonda operasyon verisinin kapanması ve yeni action gönderememesi gerekir.
10. Yeniden aktif et veya gerekirse revoke et.

Release APK için firma genel `sync_secret` değerinin binary içine gömülü olmaması otomatik test tarafından ayrıca doğrulanır.

**Blocker:** onaysız cihazın veri görmesi, pasif cihazın action gönderebilmesi veya başka cihaz adına işlem yapabilmesi.

---

## 8. Yeniden başlatma ve kalıcı kuyruk

Bu test özellikle finans/oda hesabı değişikliklerinden sonra yapılmalıdır.

1. Bir oda hesabında ödeme veya restoran→oda aktarımı yap.
2. Hemen ardından uygulamayı kapat.
3. Yeniden aç.
4. Sistem Sağlığı panelinde bekleyen senkron işi varsa tamamlanmasını bekle.
5. Android'de ve masaüstünde aynı güncel durumu doğrula.

**Blocker:** işlem masaüstünde kalıcıyken Android snapshot'ın sonsuza kadar eski kalması veya outbox işinin restart sonrası kaybolması.

---

## 9. Yedek

1. Manuel yedek oluştur.
2. `backups/` içinde yeni dosya oluştuğunu doğrula.
3. Uygulamayı yeniden başlat ve veri bütünlüğünü kontrol et.
4. Pilot boyunca en az bir yedek dosyasını ayrı bir diske/klasöre kopyala.

Pilot öncesinde otomatik restore sihirbazı zorunlu değildir; fakat yedeğin fiziksel olarak üretildiği doğrulanmalıdır.

**Blocker:** yedek üretilmemesi veya yedek işleminin aktif DB'yi bozması.

---

## 10. Kimlik verisi sınırı

İlk pilotta gerçek TC kimlik numarası, pasaport numarası veya kimlik belge fotoğrafı kullanılmamalıdır; at-rest saklama/KVKK kararı ayrıca tamamlanacaktır.

Kimlik alanı akışı test edilecekse yalnız tamamen sahte test verisi kullanılmalıdır.

---

## 11. Sorun kaydı formatı

Sahada bir problem çıktığında uzun açıklama yerine şu minimum kayıt yeterlidir:

```text
Tarih/saat:
Ekran:
Ne yapıyordum:
Beklenen:
Olan:
Tekrar ediyor mu: Evet/Hayır
İnternet: Açık/Kapalı
Uygulama yeniden başlatıldı mı: Evet/Hayır
Ekran görüntüsü / hata metni:
```

### Öncelik

- **P0 / Blocker:** para, stok veya kayıt kaybı/çoğalması; yetkisiz veri erişimi; uygulamanın açılmaması.
- **P1:** günlük işi durduran fakat veri bütünlüğünü bozmayan akış sorunu.
- **P2:** anlaşılabilirlik, gereksiz tıklama, görsel/UX sürtünmesi.

Pilot başlamadan P0 kalmamalıdır. P1'ler mümkün olduğunca kapatılır. P2'ler gerçek işletme geri bildirimiyle birlikte gruplanır.

---

## 12. İlk pilot için geçiş kriteri

Aşağıdakilerin tamamı sağlandığında ilk 1–2 işletmeye kontrollü tanıtım yapılabilir:

- temel `pilot-check` yeşil,
- Windows temiz kurulum başarılı,
- gerçek hosting bağlantısı başarılı,
- internet kes/gelsin senaryosu başarılı,
- pansiyon konaklama + kısmi ödeme başarılı,
- restoran adisyonu + odaya yaz + tahsilat başarılı,
- gerçek Android cihaz onay/pasifleştirme başarılı,
- restart sonrası veri ve sync kuyruğu korunuyor,
- manuel yedek oluşuyor,
- gerçek kimlik verisi ilk pilot kapsamının dışında tutuluyor veya ayrıca güvenli saklama kararı verilmiş.

Bu kapıdan sonra amaç ürün kapsamını büyütmek değil, gerçek işletmenin nerede zorlandığını ölçmektir.
