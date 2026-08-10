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

## Sıradaki Ürün Öncelikleri

### 1. Operasyon takvimi

Rezervasyonlar ve günlük işler tarih bazlı kayıt tutuyor. Kullanıcı geri bildirimine göre tek günlük/haftalık sade takvim görünümü eklenebilir. Amaç yeni bir karmaşık planlama sistemi kurmak değil; yaklaşan giriş, çıkış, rezervasyon ve manuel işleri tek bakışta göstermek olacaktır.

### 2. Rezervasyon kullanım akışını iyileştirme

Doğrudan rezervasyon oluşturma sahada doğrulandıktan sonra ihtiyaç görülürse manuel rezervasyon düzenleme, hızlı müşteri oluşturma veya oda değiştirme gibi küçük kullanım kolaylıkları eklenebilir.

### 3. Canlı bağlantı sağlamlaştırma

Gerçek hosting üzerinde web yayın/senkron davranışı bilgisayar başında log ve ağ yanıtları izlenerek ayrıca ele alınacaktır. Bu çalışma ürün fonksiyonlarından bağımsız tutulacaktır.

## Şimdiki Karar

Frontend mimari refaktörü tamamlanmış kabul edilir. Manuel günlük işler tamamlanmıştır. Doğrudan rezervasyon oluşturma v1 ürün paketine eklenmiştir. Sonraki geliştirmelerde kullanıcı değeri yüksek operasyon görünürlüğüne öncelik verilecektir.
