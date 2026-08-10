# Yardımcı Asistan — Güncel Ürün Durumu

Bu belge, frontend mimari temizliğinin tamamlanmasından sonra v1 ürün kapsamının mevcut durumunu ve sonraki ürün geliştirme önceliklerini özetler.

## v1 Omurgası

Aşağıdaki ana zincir çalışır durumdadır:

- Demo web sitesi ve mevcut sitelere eklenebilir widget
- Firma hosting mini API ve local-first senkronizasyon
- Web formu ve Web AI üzerinden müşteri talebi oluşturma
- Masaüstünde talep, müşteri, rezervasyon, oda, masa ve günlük iş yönetimi
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

## Ürün Geliştirme Öncelikleri

### 1. Manuel günlük iş / not yönetimi

Mevcut günlük işler görüntülenebiliyor ve durumları değiştirilebiliyor; ancak işletme sahibi kendi günlük işini doğrudan oluşturup düzenleyemiyor. Bu, gerçek günlük kullanımda en görünür eksiklerden biridir.

Hedef:

- Pansiyon ve restoran ekranından yeni günlük iş ekleme
- Başlık, not, tarih ve saat girme
- Kullanıcının eklediği işi düzenleme ve silme
- Dashboard, rapor ve Android özetinde otomatik görünme
- Otomatik üretilen sistem işlerinin iş kurallarını değiştirmeme

### 2. Doğrudan rezervasyon oluşturma

Talep -> rezervasyon dönüşümü çalışıyor. Sonraki adımda telefonla veya yüz yüze gelen müşteri için talep açma zorunluluğu olmadan sade bir doğrudan rezervasyon formu değerlendirilecektir.

### 3. Operasyon takvimi

Rezervasyonlar ve günlük işler tarih bazlı kayıt tutuyor. Kullanıcı geri bildirimine göre tek günlük/haftalık sade takvim görünümü eklenebilir.

### 4. Canlı bağlantı sağlamlaştırma

Gerçek hosting üzerinde web yayın/senkron davranışı bilgisayar başında log ve ağ yanıtları izlenerek ayrıca ele alınacaktır. Bu çalışma ürün fonksiyonlarından bağımsız tutulacaktır.

## Şimdiki Karar

Frontend mimari refaktörü tamamlanmış kabul edilir. Bundan sonraki geliştirmelerde öncelik yeni kullanıcı değeri üreten işlevlere verilir. İlk ürün paketi manuel günlük iş / not yönetimidir.
