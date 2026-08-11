# Yardımcı Asistan — Güncel Ürün Durumu

Bu belge, frontend mimari temizliğinin tamamlanmasından sonra v1 ürün kapsamının mevcut durumunu ve sonraki ürün geliştirme önceliklerini özetler.

## v1 Omurgası

Aşağıdaki ana zincir çalışır durumdadır:

- Demo web sitesi ve mevcut sitelere eklenebilir widget
- Firma hosting mini API ve local-first senkronizasyon
- Web formu ve Web AI üzerinden müşteri talebi oluşturma
- Masaüstünde talep, müşteri, rezervasyon, oda, masa ve günlük iş yönetimi
- Pansiyon ve restoran için manuel günlük iş / not oluşturma, düzenleme, tamamlama ve silme
- Masaüstünden doğrudan pansiyon ve restoran rezervasyonu oluşturma; yeni müşteriyi rezervasyon panelinden hızlıca ekleme
- Aktif pansiyon rezervasyonunda oda atama/değiştirme ve manuel rezervasyon ayrıntılarını düzenleme
- Günlük ve haftalık sade operasyon takvimi
- QR menü, stok, masa adisyonu, oda folyosu ve basit ön muhasebe
- AI cevap/özet/rapor araçları
- WhatsApp hazır mesaj, manuel akış ve Electron içi WhatsApp Web çalışma alanı
- Android companion, cihaz rolleri ve görev yetkileri
- Uygulama kilidi, yerel yedekleme, paketleme ve kurulum altyapısı

## Kısmen Tamamlanan / Canlı Ortama Bağlı Alanlar

### Windows son saha testi

Windows NSIS paketleme altyapısı hazırdır. Gerçek hedef Windows bilgisayarda installer, kullanıcı veri klasörü, yerel yedek, WhatsApp WebView ve masaüstü-hosting bağlantısı son saha turunda ayrıca doğrulanmalıdır.

### Android yerel ağ modu

v1 için hosting üzerinden sınırlı takip modu seçilmiştir. Doğrudan PC/LAN modu sonraki faz için bilinçli olarak ertelenmiştir.

### Resmî WhatsApp API

Mimari adapter sınırı hazırdır; v1 çalışma modu WhatsApp Web/manual akıştır. Resmî API entegrasyonu zorunlu değildir ve sonraki faz seçeneğidir.

## Tamamlanan Son Ürün Paketleri

### Web talebini WhatsApp'tan bağımsızlaştırma

Web widget rezervasyon ve masa taleplerinde ana işlem doğrudan Yardımcı Asistan kaydıdır.

- Ana buton `Talebi Gönder` olarak çalışır.
- Talep `api/request.php` üzerinden başarıyla kaydedilmeden tamamlanmış sayılmaz.
- Başarılı kayıtta kullanıcıya `Talebiniz işletmeye iletildi` onayı gösterilir.
- WhatsApp otomatik açılmaz; isteyen müşteri kayıt tamamlandıktan sonra `WhatsApp'tan da yaz` seçeneğini kullanabilir.
- Web kaydı başarısız olursa form korunur ve WhatsApp alternatif iletişim yolu olarak sunulur.
- Gönderim sırasında buton kilitlenerek istemsiz çift kayıt riski azaltılır.

### Gerçek hosting ve bağlantı geri dönüşü doğrulaması

Demo hosting üzerinde masaüstü ile gerçek web modülü arasındaki saha bağlantısı doğrulandı.

- Ayarlar içindeki `Web Bağlantısını Dene` kontrolü güvenlik anahtarını ve SQLite senkron protokolünü başarıyla doğruladı.
- Webden oluşturulan talep otomatik senkron ile masaüstü Ana Ekran ve Müşteri İşleri akışına düştü.
- Masaüstü bilgisayarın internet bağlantısı kesikken web tarafında oluşturulan talep hostingde kaldı.
- İnternet bağlantısı geri geldiğinde manuel eşitleme yapılmadan talep otomatik olarak masaüstüne eklendi.
- Senkron durumu tekrar `Tüm veriler güncel` durumuna döndü.
- Tekrarlı kayıt/idempotency, uygulama yeniden başlatma ve ayrıntılı kullanım kenar durumları kapsamlı son kullanım testinde toplu olarak yeniden kontrol edilecek.

### Manuel günlük iş / not yönetimi

Pansiyon ve restoran ekranlarında işletme sahibi kendi günlük işini/notunu başlık, açıklama, tarih ve saat ile oluşturabilir. Manuel kayıtlar düzenlenebilir, tamamlanabilir, yeniden açılabilir, iptal edilebilir ve silinebilir. Sistem tarafından üretilen görevlerin mevcut iş kuralları korunur.

### Doğrudan rezervasyon oluşturma

Pansiyon rezervasyon takibinde `Yeni Rezervasyon` ile talep açma zorunluluğu olmadan kayıt oluşturulabilir.

- Kayıtlı müşteri seçilir.
- Giriş ve çıkış tarihleri ile kişi sayısı girilir.
- Oda hemen seçilebilir veya daha sonra atanabilir.
- Not eklenebilir.
- Oda seçilmişse bakım durumu, kapasite, aktif konaklama ve tarih çakışması DB katmanında doğrulanır.
- Başarılı kayıt mevcut rezervasyon listesine, dashboard verisine ve operasyon akışına katılır.
- Manuel kayıt `reservation.created` olayı üretir.

### Rezervasyon düzenleme ve oda değişikliği

Aktif pansiyon rezervasyonlarındaki `Düzenle / Oda Ata` işlemi aynı sade paneli yeniden kullanır.

- Manuel rezervasyonlarda giriş/çıkış tarihi, kişi sayısı, oda ve not güncellenebilir.
- Web talebinden oluşan rezervasyonlarda müşteri, tarih ve kişi bilgisi talep kaydıyla bağlı tutulur; oda ve not değiştirilebilir.
- Oda atama veya oda değiştirmede kapasite, bakım durumu, aktif konaklama ve rezervasyon tarih çakışması yeniden doğrulanır.
- Önceki oda artık başka aktif rezervasyon/konaklama tarafından kullanılmıyorsa otomatik olarak serbest bırakılır.
- Aktif konaklamaya dönüştürülmüş rezervasyonlar bu formdan değiştirilmez; konaklama akışı korunur.
- Güncellemeler `reservation.updated` olayı üretir.

### Doğrudan restoran rezervasyonu

Restoran ekranındaki `Masa Rezervasyonları` alanından telefonla veya yüz yüze gelen rezervasyon doğrudan oluşturulabilir.

- Kayıtlı müşteri seçilebilir veya aynı panelden hızlı müşteri eklenebilir.
- Tarih, saat, kişi sayısı, isteğe bağlı masa ve not girilir.
- Masa seçilmişse aktiflik, bakım durumu, kapasite ve aynı tarih/saat çakışması DB katmanında doğrulanır.
- Masa seçmeden kayıt açılabilir; masa daha sonra operasyon sırasında netleştirilebilir.
- Manuel restoran rezervasyonu mevcut rezervasyon/takvim veri modelini kullanır ve `reservation.created` olayı üretir.
- Webden gelen masa ve kahvaltı rezervasyonları da aynı restoran rezervasyon listesinde görünür.

### Operasyon takvimi

Sol menüdeki `Takvim` sayfası pansiyon ve restoran operasyonlarını aynı tarih görünümünde birleştirir.

- Gün ve hafta görünümü arasında geçiş yapılabilir.
- Önceki/sonraki gün veya haftaya gidilebilir; `Bugün` ile güncel tarihe dönülebilir.
- Konaklama girişleri ve çıkışları ayrı kayıtlar olarak görünür.
- Restoran rezervasyonları tarih ve varsa saat bilgisiyle görünür.
- Günlük işler aynı takvimde yer alır; bekleyen işler doğrudan tamamlanabilir.
- Rezervasyon kaydındaki `Aç` işlemi kullanıcıyı ilgili operasyon ekranına götürür.
- İptal veya reddedilmiş rezervasyonlar ile arşivlenmiş/iptal edilmiş işler takvim kalabalığını artırmaz.
- Haftalık özet giriş, çıkış, restoran rezervasyonu ve bekleyen iş sayılarını gösterir.

### Pansiyon saha sadeleştirmesi

Pansiyon ekranının ilk saha kullanılabilirlik turu tamamlanmıştır.

- Ekran açılışında önce bugünün özeti, rezervasyonlar, oda durumu ve günlük işler görünür.
- Oda hesabı ve tahsilat kaldırılmadan `Oda Hesabı ve Tahsilat` başlığı altında gerektiğinde açılan ikincil bölüme taşınmıştır.
- Konaklama geçmişi ayrı açılır arşiv bölümü olarak korunur.
- Oda kartlarındaki sürekli görünen `Boş / Dolu / Temizlik / Bakım` düğmeleri tek `Durum` seçimine indirilmiştir.
- Aktif konaklama sırasında oda durumunun elle değiştirilmesini engelleyen mevcut koruma devam eder.
- Bu düzenlemeler veri modeli, oda adisyonu, tahsilat ve rezervasyon iş kurallarını değiştirmez.

### Restoran saha sadeleştirmesi

Restoran ekranının ilk saha kullanılabilirlik turu tamamlanmıştır.

- Masa kartlarındaki sürekli durum düğmeleri tek `Durum` seçimine indirilmiştir.
- Ürün ekleme, adet değiştirme ve ürün kaldırma işlemlerinin zaten otomatik kaydedildiği arayüzde netleştirilmiş; gereksiz `Siparişi Kaydet` adımı kaldırılmıştır.
- `Hazırlanıyor / Servis Edildi / Hesap Bekliyor` işlemleri tek `Sipariş durumu` seçimine indirilmiştir.
- `Ödendi / Kapat` ana kapanış işlemi görünür tutulmuş, nadir ve riskli adisyon iptali `Diğer` altına alınmıştır.
- Doğrudan restoran rezervasyonu büyük bir panel olarak Masalar'ın önünde durmaz; bugün, onay bekleyen ve aktif rezervasyon sayısını gösteren kompakt özetten açılır.
- Masa adisyonu, stok, rezervasyon ve müşteri iş kuralları korunur.

### Müşteri İşleri saha sadeleştirmesi

Talep detayındaki günlük karar akışı sadeleştirilmiştir.

- Arama, WhatsApp, isteğe bağlı AI cevap hazırlama ve rezervasyona çevirme/açma ana işlemler olarak görünür kalır.
- `Cevaplandı İşaretle`, `Reddet`, `Yeniden Aç` ve `Talebi Sil` işlemleri `Diğer işlemler` altında toplanmıştır.
- Talep durumu, müşteri iletişimi ve rezervasyona dönüştürme iş kuralları değiştirilmemiştir.

### Kasa saha sadeleştirmesi

Basit ön muhasebe ekranındaki günlük kayıt akışı kısaltılmıştır.

- Gelir/gider kaydında ilk bakışta tutar, tür ve açıklama alanları görünür.
- Ödeme şekli varsayılan olarak `Nakit`, işlem tarihi `bugün` gelir; farklı değer gerekiyorsa `Ödeme şekli ve tarih` bölümü açılır.
- Son hareketler ilk açılışta son 12 kayıtla sınırlıdır; daha eski kayıtlar isteğe bağlı açılır.
- Bekleyen oda alacakları, oda adisyonundan tahsilat yönlendirmesi, manuel kayıt silme onayı ve detaylı raporlar korunur.
- Finans hesaplama ve tahsilat servislerinde iş kuralı değişikliği yapılmamıştır.

### Canlı senkron dayanıklılığı

Masaüstü senkron bağlantısının kod tarafındaki temel hata toleransı güçlendirilmiştir.

- Başlangıç ayarı, dashboard ve senkron durum bridge çağrılarındaki Promise hataları renderer tarafından yakalanır ve kullanıcıya anlaşılır durum mesajı gösterilir.
- Manuel `Şimdi Eşitle` işlemi IPC/ağ hatasında `yükleniyor` durumunda takılı kalmaz.
- Eşitleme başarılı olsa bile dashboard yenilemesi başarısızsa bu durum ayrı bir hata olarak görünür.
- Otomatik senkron HTTP çağrıları 15 saniyelik zaman aşımı ile sınırlandırılır ve cevap vermeyen istek `AbortController` ile iptal edilir.
- Mevcut retry/backoff, offline sınıflandırma, cursor, idempotency ve outbox iş kuralları korunur.
- HTTP timeout davranışı ayrı smoke testiyle CI zincirinde doğrulanır.

## Sıradaki Ürün Öncelikleri

### 1. Windows son saha doğrulaması

Hedef Windows bilgisayarda kurulum, uygulama açılışı, kullanıcı veri klasörü, yerel yedek, WhatsApp WebView ve masaüstü-hosting bağlantısı uçtan uca doğrulanmalıdır. Bu kontrol kapsamlı son kullanım testinin başlangıç bölümüne dahil edilebilir; ayrı bir özellik geliştirme paketi değildir.

### 2. Kapsamlı uygulama kullanım testi ve toplu düzeltme turu

Ana fonksiyonlar tamamlandıktan sonra uygulama gerçek işletme akışı gibi baştan sona kullanılacaktır. Test sırasında görülen küçük UX sorunları, tutarsız metinler, gereksiz adımlar, tekrarlı kayıt/idempotency, yeniden başlatma davranışı ve diğer kenar durumları not edilip tek tek anlık müdahale yerine toplu düzeltme paketleri halinde ele alınacaktır.

### 3. v1 sonrası bilinçli olarak ertelenen seçenekler

Doğrudan Android PC/LAN modu ve resmî WhatsApp API entegrasyonu v1 tamamlanma kriteri değildir. Gerçek kullanım geri bildirimi bunlardan birine ihtiyaç göstermedikçe yeni altyapı eklenmeyecektir.

## Şimdiki Karar

Frontend mimari refaktörü, ana masaüstü saha kullanılabilirlik turu, web talep akışı ve gerçek hosting senkron saha doğrulaması tamamlanmış kabul edilir. Manuel günlük işler, pansiyon/restoran doğrudan rezervasyonları, rezervasyon düzenleme/oda değişikliği, hızlı müşteri oluşturma, sade operasyon takvimi, temel ön muhasebe, Android companion ve local-first senkron v1 ürün omurgasındadır. Yeni özellik eklemek yerine sıradaki aşama Windows son saha doğrulamasıyla başlayan kapsamlı kullanım testi ve ardından toplu düzeltme turudur.
