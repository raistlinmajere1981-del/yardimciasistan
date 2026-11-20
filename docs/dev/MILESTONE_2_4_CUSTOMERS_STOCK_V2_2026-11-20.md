# Yardımcı Asistan — Müşteri, Stok ve Satın Alma V2 (yerel geliştirme)

Tarih: 20 Kasım 2026
Kapsam: tek çalışan kopya / temiz SQLite şeması.
Durum: **yerel geliştirme ve otomatik hedefli doğrulama**. Canlı deploy, APK/EXE release veya fiziksel yazdırma kabulü yapılmadı.

## 1. Ticari müşteri ≠ bayi

- Bireysel/ticari müşteri kaydı core.customers altında her sektörde kullanılabilir.
- Firma adı, vergi dairesi, vergi no, yetkili kişi ve ödeme vadesi customer_commercial_profiles tablosunda tutulur.
- Ticari profil oluşturmak için commerce.wholesale aranmaz.
- Bayi durumunu active yapmak ve dealer_a/dealer_b fiyat grubunu kaydetmek için WHOLESALE yetkisi IPC sınırında zorunludur. Perakende modunda model inactive/retail gönderir.
- Arama ve CSV/XLSX aktarımında firma/vergi alanları toptan satış kapalıyken de bulunur. “Ticari” filtresi bütün ticari kayıtları, “Bayiler” yalnız aktif bayi kayıtlarını kapsar.
- Bayi web erişimi ve özel fiyat çözümlemesi mevcut toptancı yeteneği/portal güvenlik kontrollerine bağlı kalır.

## 2. İdeal stok ve satın alma listesi

- Ürün kaydında minimum_quantity uyarı seviyesi olarak kalır; yeni ideal_quantity yalnız sipariş önerisi hedefidir.
- Öneri = max(0, ideal_quantity − aktif stok lokasyonlarındaki toplam miktar). Minimum üzerinde olan ama idealin altında kalan ürün de önerilir.
- Stok ekranında kategori/arama filtresi, seçili/tüm eksikler için CSV ve yazdırma bulunur.
- Öneri salt okunur; otomatik satın alma siparişi, stok hareketi veya finans kaydı oluşturmaz.
- Toplu sonuç üst sınırı 10.000, ekran görünümü ilk 250 kayıtla sınırlı; CSV/yazdırma filtre kapsamının tümünü işler.

## 3. Kategori bazlı KDV

- catalog_categories.default_tax_rate başlangıç oranı Türkiye genel KDV oranı %20.
- Yeni ürünün KDV'si kategori varsayılanından alınır; kullanıcı manuel değiştirebilir.
- Kategori KDV'sinin daha sonra değiştirilmesi mevcut ürünleri veya geçmiş işlemleri değiştirmez.
- Kategoriden KDV'yi yeniden uygulama işlemi ürün kartında kullanıcının açık seçimine bağlıdır.
- Oranlar kanonik SQLite doğrulamasıyla 0–100 aralığında tutulur. Uygun oranı işletme belirler; bütün ürünler %20 sayılmaz.

## 4. Stok servisi aç/kapat

- Market INVENTORY yeteneği zorunlu kökten isteğe bağlı köke taşındı; profil varsayılanında açık kalır.
- Stok kapatılması, bağlı RETAIL_PURCHASING ve RETAIL_SUPPLIERS seçimlerini de kapatır; satış/katalog devam eder.
- Mevcut stoklu ürünler ve miktarları silinmez; stok kapalıyken otomatik stok düşümü yapılmaz. Önceden stoklu olan ürünün yalnız diğer bilgileri düzenlenebilir; yeni stok takibi etkinleştirilemez.
- Tekrar açıldığında kayıtlı miktarlar kullanılabilir. Yetki sınırları servis ve IPC tarafından doğrulanır.

## Veri ve test yaklaşımı

- Yalnız apps/desktop-app/db/schema.sql güncellendi; migration/backfill yok.
- Var olan işletme verilerini, yedekleri ve siteleri silme/deploy etme işlemi yapılmadı.
- Yeni scripts/test-customer-stock-v2.mjs gerçek izole SQLite üzerinde ticari müşteri kaydı/filtre/IPC yetkisi, kategori KDV, manuel oran önceliği, stok kapalıyken ürün düzenleme, ideal miktar ve salt okunur önerileri doğrular.
- Shared capability testleri, masaüstü typecheck/üretim derlemesi ve hedefli lint ile kontrol edilir.
- Kalan kabul: Masaüstünde ekranların elle kontrolü, gerçek yazıcı/CSV denemesi; stok kapat-aç satış/Android/Bayi uçtan uca senaryoları ve sonraki toplu release testleri.
