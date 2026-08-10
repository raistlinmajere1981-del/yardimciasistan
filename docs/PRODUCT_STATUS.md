# Yardımcı Asistan — Güncel Ürün Durumu

Bu belge, frontend mimari temizliğinin tamamlanmasından sonra v1 ürün kapsamının mevcut durumunu ve sonraki ürün geliştirme önceliklerini özetler.

## v1 Omurgası

Aşağıdaki ana zincir çalışır durumdadır:

- Demo web sitesi ve mevcut sitelere eklenebilir widget
- Firma hosting mini API ve local-first senkronizasyon
- Web formu ve Web AI üzerinden müşteri talebi oluşturma
- Masaüstünde talep, müşteri, rezervasyon, oda, masa ve günlük iş yönetimi
- Pansiyon ve restoran için manuel günlük iş / not oluşturma, düzenleme, tamamlama ve silme
- Masaüstünden kayıtlı müşteri için doğrudan pansiyon rezervasyonu oluşturma
- Günlük ve haftalık sade operasyon takvimi
- QR menü, stok, masa adisyonu, oda folyosu ve basit ön muhasebe
- AI cevap/özet/rapor araçları
- WhatsApp hazır mesaj, manuel akış ve Electron içi WhatsApp Web çalışma alanı
- Android companion, cihaz rolleri ve görev yetkileri
- Uygulama kilidi, yerel yedekleme, paketleme ve kurulum altyapısı

## Kısmen Tamamlanan / Canlı Ortama Bağlı Alanlar

### Web yayın ve hosting bağlantısı

Masaüstü uygulaması yayın/senkron isteğini üretiyor ve test ortamındaki otomatik akışlar mevcut. Gerçek hosting bağlantısı ortam, PHP izinleri, alan adı ve ağ koşullarına bağlı olduğundan canlı bilgisayar/hosting üzerinde ayrıca doğrulanmalıdır.

### Windows son saha testi

Windows NSIS paketleme altyapısı hazırdır. Gerçek hedef Windows bilgisayarda installer, kullanıcı veri klasörü ve WhatsApp WebView son saha testi ayrıca yapılmalıdır.

### Android yerel ağ modu

v1 için hosting üzerinden sınırlı takip modu seçilmiştir. Doğrudan PC/LAN modu sonraki faz için bilinçli olarak ertelenmiştir.

### Resmî WhatsApp API

Mimari adapter sınırı hazırdır; v1 çalışma modu WhatsApp Web/manual akıştır. Resmî API entegrasyonu zorunlu değildir ve sonraki faz seçeneğidir.

## Tamamlanan Son Ürün Paketleri

### Manuel günlük iş / not yönetimi

Pansiyon ve restoran ekranlarında işletme sahibi kendi günlük işini/notunu başlık, açıklama, tarih ve saat ile oluşturabilir. Manuel kayıtlar düzenlenebilir, tamamlanabilir, yeniden açılabilir, iptal edilebilir ve silinebilir. Sistem tarafından üretilen görevlerin mevcut iş kuralları korunur.

### Doğrudan rezervasyon oluşturma

Pansiyon rezervasyon takibinde `Yeni Rezervasyon` ile talep açma zorunluluğu olmadan kayıt oluşturulabilir.

- Kayıtlı müşteri seçilir.
- Giriş ve çıkış tarihleri ile kişi sayısı girilir.
- Oda hemen seçilebilir veya daha sonra atanabilir.
- Not eklenebilir.
- Oda seçilmişse bakım durumu, kapasite ve tarih çakışması sunucu/DB katmanında doğrulanır.
- Başarılı kayıt mevcut rezervasyon listesine, dashboard verisine ve operasyon akışına katılır.
- Manuel kayıt `reservation.created` olayı üretir.

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

## Sıradaki Ürün Öncelikleri

### 1. Rezervasyon kullanım akışını iyileştirme

Doğrudan rezervasyon ve takvim akışları sahada doğrulandıktan sonra ihtiyaç görülürse manuel rezervasyon düzenleme, hızlı müşteri oluşturma veya oda değiştirme gibi küçük kullanım kolaylıkları eklenebilir.

### 2. Canlı bağlantı sağlamlaştırma

Gerçek hosting üzerinde web yayın/senkron davranışı bilgisayar başında log ve ağ yanıtları izlenerek ayrıca ele alınacaktır. Bu çalışma ürün fonksiyonlarından bağımsız tutulacaktır.

### 3. Son saha kullanılabilirlik turu

Temel günlük operasyon zinciri tamamlandıktan sonra Pansiyon, Restoran, Takvim, Müşteri İşleri ve Kasa ekranları gerçek kullanım sırasıyla tekrar gözden geçirilip gereksiz adım veya metinler temizlenebilir.

## Şimdiki Karar

Frontend mimari refaktörü tamamlanmış kabul edilir. Manuel günlük işler ve doğrudan rezervasyon oluşturma v1 ürün paketindedir. Sade operasyon takvimi de ürün omurgasına eklenmiştir; sonraki geliştirmelerde saha geri bildirimi ve canlı bağlantı doğrulaması önceliklidir.
