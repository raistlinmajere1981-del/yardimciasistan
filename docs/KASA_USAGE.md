# Kasa — Kısa Kullanım Notu

Yardımcı Asistan içindeki **Kasa** bölümü resmi muhasebe programı değildir. Küçük işletmenin günlük para girişini, giderini ve pansiyondan kalan alacağını kolayca takip etmesi için tasarlanmıştır.

## Günlük kullanım

Kasa ekranının üst bölümünde dört bilgi görünür:

- **Bugün Gelen:** bugün kasaya kaydedilen toplam para.
- **Bugün Çıkan:** bugün kaydedilen toplam gider.
- **Bugünkü Fark:** gelen para eksi çıkan para.
- **Bekleyen Alacak:** pansiyon rezervasyonlarında henüz tahsil edilmemiş toplam tutar.

## Restoran geliri

Bir restoran adisyonu **Ödendi / Kapat** ile kapatıldığında tutar otomatik olarak kasaya gelir yazılır. Aynı tutarı ayrıca elle girmek gerekmez.

## Manuel gelir ve gider

**Gelir Ekle** veya **Gider Ekle** düğmesiyle tutar, tür, ödeme şekli ve kısa açıklama girilir.

Gider için hazır türler:

- Market / Stok
- Elektrik - Su
- Personel
- Bakım
- Yakıt - Ulaşım
- Vergi / Resmi
- Diğer

Manuel girilmiş bir hareket yanlışsa Son Hareketler listesinden kaldırılabilir. Restoran veya pansiyondan otomatik oluşan kayıtlar ise kaynak işlem düzeltilerek değiştirilir.

## Pansiyon ödemesi

Aktif pansiyon rezervasyonunda önce müşteriyle anlaşılan **Konaklama bedeli** girilir. Sonra alınan ödemeler **Ödeme Al** ile ayrı ayrı kaydedilir.

Örnek:

```text
Konaklama bedeli: 4.500 TL
Kapora:           1.000 TL
Girişte ödeme:    2.000 TL
Kalan:            1.500 TL
```

Her pansiyon ödemesi aynı anda Kasa içinde gelir hareketi oluşturur. Ödeme durumu kullanıcı tarafından elle seçilmez; sistem toplam, ödenen ve kalan tutara göre hesaplar.

## Sınır

Bu kayıtlar işletme içi ön muhasebe içindir. E-fatura, e-arşiv, e-defter, vergi beyanı veya resmi muhasebe işlemi üretmez.
