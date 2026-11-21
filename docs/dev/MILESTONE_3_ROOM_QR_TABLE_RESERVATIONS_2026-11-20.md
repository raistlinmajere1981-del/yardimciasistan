# Aşama 3 — Odaya QR Sipariş V2 ve Gerçek Masa Rezervasyonu

Tarih: 20 Kasım 2026
Durum: Yerel kod geliştirme ve hedefli kontroller; canlı deploy, tam regresyon, Windows kurulumu ve kullanıcı verisi üzerinde test yapılmadı.

## İş akışları

Masa QR siparişi mevcut talep → işletme onayı → masa adisyonu zincirini korur. Odaya QR siparişi, QR Menü ve pansiyon konaklama/folio yetenekleriyle ayrı açılıp kapatılır. Oda kodu fiziksel odaya kalıcı olarak değil aktif konaklama kimliğine bağlanır. HMAC ile türetilen kodun yalnız SHA256 özeti özel oda katalog yayınına aktarılır; kamuya açık oda API'si bu alanı kaldırır. Çıkış veya oda değişimi kodu geçersizleştirir.

Misafir siparişi önce yeni bir oda talebi olarak kaydedilir. İşletmenin açık onayı, aktif konaklama ve açık folio, kod özeti, fiyat, para birimi ve stok verisini aynı SQLite yazma işleminde tekrar kontrol eder. Başarılı işlem oda hesabına işlenir. Tekrar kabul aynı faturayı büyütmez; hata tüm kalemleri geri alır. Sunucu/masaüstü senkronizasyon gecikse de masaüstü eski konaklama kodunu reddeder.

Masa rezervasyonu 120 dakika varsayılan süreye, 30–480 dakika aralığında seçilebilir süreye, kapasiteye ve gece yarısını geçen zaman aralıklarına göre değerlendirilir. Web talebinin işletme tarafından onayı uygun masa atanmasını gerektirir. Masa yoksa rezervasyon kesinleşmez. Manuel masasız kayıt beklemede kalır. SQLite INSERT/UPDATE trigger'ları eşzamanlı çakışmaları son yazma sınırında önler.

## BlackSea pansiyon

BlackSea'ye özel menü görünümünde sağ panel normal ziyaretçiye gerçek masa rezervasyon talebi formunu gösterir. Geçerli masa/oda QR bağlantısı, aynı alanda ilgili sipariş panelini gösterir. Rezervasyon talebi gerçek web request.php API'sine gider; yanıt hiçbir zaman otomatik onaylanmış rezervasyon olarak sunulmaz. Siteye özel görünüm ve ortak core dosyalarının küçük yerel eşitlemesi yapıldı.

## Otomatik hedefli doğrulama

- scripts/test-table-reservation-slots.mjs: 4 test.
- scripts/test-qr-room-order-v2.mjs: 3 test.
- Masaüstü TypeScript typecheck geçti.
- Değişen kaynakların odaklanmış ESLint denetimi, PHP sözdizimi, web JS sözdizimi, temiz SQLite şema oluşturma ve Git diff kontrolü geçti.

## Son kabul turuna bırakılanlar

Gerçek folio + stok/finans katmanıyla uçtan uca oda siparişi kabulü; web HTTP ve idempotency senaryoları; web-module sürüm eşitlemesi ve paketlemesi; BlackSea ve diğer sitelerde canlı/telefon testleri; tam regresyon/verify; fiziksel yazıcı ve Windows kurulum testi. Windows kurulumunu kullanıcı kendi Windows sisteminde test edecek.

Kanonik veritabanı şeması doğrudan güncellendi; migration/backfill üretilmedi. Yayına alma, uzak depoya push ve sürüm dağıtımı bu aşamada yapılmadı.
