# Yardımcı Asistan — Kasa ve Ön Muhasebe Modeli

Bu doküman Yardımcı Asistan'ın küçük ve orta ölçekli işletmeler için kullanacağı sade kasa / ön muhasebe yaklaşımını tanımlar.

Amaç resmi muhasebe yazılımı üretmek değildir. Amaç işletme sahibinin günlük olarak şu dört soruya kolayca cevap verebilmesidir:

```text
Bugün ne kadar para geldi?
Bugün ne kadar para çıktı?
Pansiyondan ne kadar alacağım kaldı?
Restoran ve pansiyon birlikte ne kadar kazandırdı?
```

## Kullanıcı dili

Kullanıcı ekranlarında ana bölüm adı `Kasa` olmalıdır.

`Muhasebe fişi`, `yevmiye`, `borç/alacak hesabı`, `hesap planı` gibi resmi muhasebe terimleri v1 ekranlarında kullanılmaz.

Temel kullanıcı işlemleri:

```text
Gelir Ekle
Gider Ekle
Ödeme Al
Son Hareketler
Bekleyen Alacak
```

## Para saklama kuralı

Parasal değerler SQLite içinde `REAL` yerine kuruş cinsinden `INTEGER` olarak saklanır.

Örnek:

```text
1.250,50 TL -> 125050
3.500,00 TL -> 350000
```

Bu yaklaşım kayan nokta kaynaklı yuvarlama hatalarını önler.

## finance_entries

Tüm kasa hareketlerinin ortak kayıt tablosudur.

Ana alanlar:

```text
id

direction
  income
  expense

amount_minor
currency
payment_method
category
description
occurred_at

source_type
source_id

note
created_at
updated_at
deleted_at
sync_status
```

### payment_method

```text
cash         -> Nakit
card         -> Kart
bank         -> Banka / havale
other        -> Diğer
unspecified  -> Belirtilmedi
```

### Önerilen gelir kategorileri

```text
restaurant
pension
other_income
```

### Önerilen gider kategorileri

```text
stock
utilities
staff
maintenance
transport
official
other_expense
```

Kategori değerleri kullanıcı ekranında Türkçe gösterilir.

## Kaynak bağlantısı

Otomatik oluşturulan kasa hareketleri `source_type + source_id` ile kaynak kayda bağlanır.

Örnek:

```text
restaurant_order + order_001
pension_payment + payment_001
```

Bu ikili benzersizdir. Böylece senkron tekrarlarında veya aynı işlemin ikinci kez çağrılması durumunda gelir iki kere yazılmaz.

## Restoran geliri

Restoran için mevcut `table_orders` modeli satışın operasyon kaynağı olmaya devam eder.

Bir adisyon `paid` durumuna geçtiğinde kasa kaydı otomatik oluşturulur:

```text
direction      income
category       restaurant
source_type    restaurant_order
source_id      adisyon id
amount         adisyon toplamı
```

Kullanıcı aynı tutarı ayrıca `Gelir Ekle` ekranından girmek zorunda değildir.

İlk finans migration'ı kurulurken daha önce ödenmiş ve tutarı sıfırdan büyük adisyonlar da kasa tablosuna bir kez taşınır.

Ödenmiş bir adisyon yeniden açılır veya iptal durumuna alınırsa bağlı otomatik kasa hareketi görünür toplamdan çıkarılır. Adisyon tekrar ödenirse aynı kaynak kaydı yeniden etkinleştirilir; ikinci gelir oluşturulmaz.

## Pansiyon fiyat modeli

`reservations` kaydına iki işlenebilir alan eklenir:

```text
agreed_total_minor
currency
```

`agreed_total_minor`, müşteriyle anlaşılan toplam konaklama bedelidir.

Oda kaydında isteğe bağlı standart fiyat için:

```text
nightly_price_minor
price_currency
```

alanları bulunur.

Standart oda fiyatı zorunlu değildir. Rezervasyondaki anlaşılmış toplam her zaman düzenlenebilir olmalıdır. Daha önce ödeme alınmışsa toplam bedel ödenmiş tutarın altına düşürülemez.

## pension_payments

Pansiyon tahsilatları tek bir toplam alanına yazılmaz; her ödeme ayrı hareket olarak tutulur.

Örnek:

```text
Toplam konaklama: 4.500 TL

1.000 TL kapora
2.000 TL girişte
1.500 TL çıkışta
```

Bu örnekte üç `pension_payments` kaydı oluşur.

Alanlar:

```text
id
reservation_id
stay_id
amount_minor
currency
payment_method
paid_at
note
created_at
updated_at
deleted_at
sync_status
```

Her aktif pansiyon ödemesi `finance_entries` içinde otomatik `income / pension` hareketi oluşturur.

Bir ödeme kalan alacaktan büyük olamaz. Bu kural hem kullanıcı/servis katmanında hem de SQLite trigger ile korunur.

## Ödeme durumu

`payment_status` kullanıcı tarafından elle yönetilecek ana alan değildir.

Sistem şu kurala göre otomatik türetir:

```text
anlaşılmış toplam yok              -> not_required
anlaşılmış toplam var, ödeme yok    -> unpaid
kısmi ödeme var                     -> partial
toplam kadar ödeme                  -> paid
```

`refunded` ileride iade yaşam döngüsü eklendiğinde kullanılabilir.

## Pansiyon ödeme özeti

Migration `pension_payment_totals` görünümünü oluşturur.

Her rezervasyon için:

```text
agreed_total_minor
paid_total_minor
remaining_minor
currency
```

hesaplanabilir.

Kullanıcı ekranında bunun karşılığı:

```text
Konaklama bedeli   4.500 ₺
Ödenen             1.500 ₺
Kalan              3.000 ₺

[ Ödeme Al ]
```

## Kasa ekranı

Masaüstünde mevcut `reports` rotası kullanıcıya **Kasa** adıyla gösterilir. Böylece yeni bir karmaşık menü eklemek yerine günlük para takibi aynı bölümün üst kısmında, detaylı dönem raporları ise altında tutulur.

İlk görünüm:

```text
Bugün Gelen
Bugün Çıkan
Bugünkü Fark
Bekleyen Alacak

[ + Gelir Ekle ]   [ - Gider Ekle ]

Pansiyon Ödemeleri | Son Hareketler
```

Pansiyon rezervasyonunda henüz tutar girilmediyse Kasa ekranı kullanıcıdan yalnız `Konaklama bedeli` ister. Tutar girildikten sonra Toplam / Ödenen / Kalan özeti ve `Ödeme Al` işlemi açılır.

## Gider girişi

İlk sürüm gider formu:

```text
Tutar
Tür
Ödeme şekli
Açıklama
```

Hazır türler:

```text
Market / Stok
Elektrik - Su
Personel
Bakım
Yakıt - Ulaşım
Vergi / Resmi
Diğer
```

Manuel hareketler yanlış girildiğinde soft-delete ile kaldırılabilir. Restoran veya pansiyondan otomatik oluşan gelirler Kasa ekranından doğrudan silinmez; kaynak işlem düzeltilir.

## Rapor ilişkisi

Mevcut restoran satış raporu ürün/adisyon analizi için `table_orders` ve `table_order_items` verisini kullanmaya devam eder.

Günlük para özeti `finance_entries` üzerinden hesaplanır. Böylece restoran otomatik satışları, pansiyon tahsilatları ve manuel gelir/gider tek kasa görünümünde birleşir.

Hedef dönem özeti:

```text
Toplam tahsilat
  Pansiyon
  Restoran

Toplam gider
Kasa farkı
Bekleyen pansiyon alacağı
```

## Test yaklaşımı

Finans akışı iki seviyede korunur:

- `smoke-finance-db.mjs`: migration, trigger, restoran otomatik geliri ve pansiyon ödeme tablosunu doğrular.
- `smoke-finance-service.mjs`: masaüstü Kasa servisinin manuel gelir/gider, tutar belirleme, kısmi/tam ödeme ve fazla ödeme engeli davranışını doğrular.

## Sonraki geliştirme adımları

1. Kasa verilerini dönem bazlı genel rapor toplamlarına bağlamak.
2. Aylık CSV / Excel dışa aktarımı.
3. Fatura / stok görsel analizinden sonra isteğe bağlı gider oluşturma.
4. Gerekirse Android yönetici uygulamasına yalnız özet kasa görünümü eklemek.

## Resmi muhasebe sınırı

Yardımcı Asistan v1 kasa kayıtları işletme içi takip içindir. E-fatura, e-arşiv, e-defter, vergi beyanı veya resmi muhasebe entegrasyonu bu modelin parçası değildir.
