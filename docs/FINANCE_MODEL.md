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
market
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
commerce_sale + sale_001
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

`finance.ts` içindeki `synchronizeFinanceSourceInTransaction`, ödenmiş ve tutarı sıfırdan büyük adisyonlar için otomatik kasa kaydını kaynak işlemin transaction'ında üretir.

Ödenmiş bir adisyon yeniden açılır veya iptal durumuna alınırsa bağlı otomatik kasa hareketi görünür toplamdan çıkarılır. Adisyon tekrar ödenirse aynı kaynak kaydı yeniden etkinleştirilir; ikinci gelir oluşturulmaz.

## Market geliri ve eksik kaynak bağlantılarının uzlaştırılması

`commerce_sales` satışın operasyon kaynağıdır. Masaüstü Hızlı Satış, Android satış
tamamlama ve siparişten satış oluşturma yolları, satış satırları ve stok yazıldıktan
sonra aynı transaction içinde finans sahibini çağırır. Yalnız silinmemiş, `paid`
durumundaki pozitif satışlar `income / market` üretir; açıklama `Market satışı`,
kategori etiketi korunan sistem türü `Market` olur.

Kaynak `commerce_sale`, kaynak kimliği satış id'sidir. Tutar kanonik `moneyToMinor`
ile güvenli integer kuruşa çevrilir; sıfır veya kuruşa yuvarlandığında sıfır kalan
tutar gelir üretmez. Güvenli integer sınırını aşan tutar transaction'ı başarısız
kılar. Para birimi satıştan, işlem zamanı `closed_at` doluysa oradan, aksi halde
`created_at` alanından alınır. Ödeme yöntemleri `cash/card/bank/other` olur;
eski, tanınmayan yöntemler finans projection'ında `other` olarak gösterilir.

Kaynak güncellenirken finans sahibi tekrar çağrılırsa aynı kayıt güncellenir.
Satış `paid` durumundan çıkarsa, silinirse veya tutarı sıfırlanırsa bağlı hareket
görünür toplamdan çıkarılır; tekrar ödenirse aynı finans kimliği etkinleşir.
Bu sözleşme yeni bir iptal/iade işlemi eklemez. Veresiye satış gelir değildir:
gelir ancak `customer_credit_payment` kaynaklı gerçek tahsilatta oluşur.
Satış receipt'iyle tekrar deneme mevcut satışı döndürür; stok veya finansı tekrar yazmaz.

Güncel şemada `finance_entries.source_type` serbest `TEXT` alanıdır;
`(source_type, source_id)` için `source_id != ''` koşullu benzersiz indeks vardır.
`commerce_sale` için şema değişikliği veya migration gerekmez. `Kasa` günlük TRY
toplamı bu kaydı mevcut `finance_entries` sorgusuyla toplar; diğer para birimleri
ayrı para birimiyle hareket listesinde kalır.

Önceden oluşmuş eksik kayıtlar otomatik başlangıç backfill'iyle tamamlanmaz.
Tek seferlik komut, yalnız mevcut dosyanın açıkça verilen mutlak yolunu kabul eder
ve `--apply` olmadan çalışmaz. Yerel derlenmiş finans sahibini kullanmak için depo
kökünden, kurulu bağımlılıklar ve derlenmiş shared paketiyle:

```sh
./node_modules/.bin/tsc -p apps/desktop-app/tsconfig.electron.json
node scripts/reconcile-commerce-sale-finance.mjs '/mutlak/yol/desktop.sqlite' --apply
```

Uygulamayı kapatıp yedeğini aldığınız dosyanın yolunu açıkça verin. Komut kanonik
`reconcileMissingCommerceSaleFinanceInTransaction` yardımcısını tek `BEGIN IMMEDIATE`
transaction'ında çağırır; herhangi bir hata tüm eklemeleri geri alır. Yalnız
silinmemiş, pozitif, `paid` satışlardan hiçbir `commerce_sale` kaynak bağlantısı
olmayanları tamamlar. Mevcut bağlantıları (soft-delete edilmiş olanlar dahil),
veresiye borçlarını, stokları ve receipt'leri değiştirmez. Tekrar çalıştırılması
aynı satış için ek gelir oluşturmaz; yalnız tamamlanan bağlantı sayısını yazdırır.

Kaynak bağlantısı olmayan manuel gelirlerin aynı satışa ait olduğu çıkarılamaz.
Komut manuel geliri silmez, eşleştirmez veya bunun varlığı nedeniyle otomatik geliri
atlamaz; olası dışarıdan girilmiş manuel mükerrerlik kullanıcı tarafından değerlendirilir.

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

Current schema `pension_payment_totals` görünümünü içerir.

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

- `smoke-finance-db.mjs`: current schema, trigger, restoran otomatik geliri ve pansiyon ödeme tablosunu doğrular.
- `smoke-finance-service.mjs`: masaüstü Kasa servisinin manuel gelir/gider, tutar belirleme, kısmi/tam ödeme ve fazla ödeme engeli davranışını doğrular.
- `smoke-market-sale-finance.mjs`: geçici veritabanında ücretli satışların kanonik finans bağlantısını, veresiye ayrımını, transaction rollback'ini, receipt tekrarlarını, uzlaştırmayı ve günlük toplamları doğrular.

## Sonraki geliştirme adımları

1. Kasa verilerini dönem bazlı genel rapor toplamlarına bağlamak.
2. Aylık CSV / Excel dışa aktarımı.
3. Fatura / stok görsel analizinden sonra isteğe bağlı gider oluşturma.
4. Gerekirse Android yönetici uygulamasına yalnız özet kasa görünümü eklemek.

## Resmi muhasebe sınırı

Yardımcı Asistan v1 kasa kayıtları işletme içi takip içindir. E-fatura, e-arşiv, e-defter, vergi beyanı veya resmi muhasebe entegrasyonu bu modelin parçası değildir.
