# AI Stok Girişi Fatura Örnekleri

Bu klasördeki iki PNG tamamen yapaydır. Gerçek faturayla karışmamaları için her
ikisinde de büyük `TEST BELGESİ - GEÇERSİZDİR` ibaresi ve yalnız test/tanıtım
amacıyla üretildiklerini belirten alt bilgi bulunur.

## `fatura-04-yeni-stok-kalemleri.png`

Temiz, düz taranmış A4 başarı senaryosudur.

| Menü ürünü | Beklenen stok girişi |
| --- | ---: |
| Izgara Levrek | 8 adet |
| Izgara Çipura | 12 adet |
| Fırında Alabalık | 6 adet |
| Izgara Kasap Köfte | 4.500 g |
| Kutu Kola (330 ml) | 24 adet |
| Maden Suyu (200 ml) | 30 adet |
| Şişe Su (330 ml) | 48 adet |

## `fatura-05-karisik-birimler.png`

Hafif perspektifli telefon fotoğrafı ve birim güvenliği senaryosudur.

| Menü ürünü | Beklenen stok girişi / davranış |
| --- | --- |
| Kaşarlı Köfte | 3.000 g (`3 KG` güvenli biçimde grama çevrilir) |
| Izgara Kasap Köfte | 2.500 g |
| Şişe Ayran (300 ml) | 24 adet (`2 x 12 AD`) |
| Portakallı Gazoz (250 ml) | 18 adet |
| Izgara Çipura | 6 adet |
| Şişe Su (330 ml) | İnceleme gerekli; `1 KOLİ` adede tahminle çevrilmez |

AI sonucu sağlayıcıya göre değişebileceğinden önerilen ürün ve miktarlar stoklara
uygulanmadan önce inceleme ekranında doğrulanmalıdır.

## Üretim istemleri

Görseller yerleşik `image_gen` aracıyla iki ayrı istem kullanılarak üretildi:

1. Tam sayfa, yüksek kontrastlı, pale mavi tablo başlıklı temiz A4 stok giriş
   faturası; yukarıdaki yedi ürün/miktar satırı metin olarak birebir istendi.
2. Bej taş yüzey üzerinde hafif açılı telefon fotoğrafı; iki köfte ağırlığı,
   üç açık adet satırı ve özellikle belirsiz `1 KOLİ` satırı birebir istendi.

Her iki istem de Türkçe karakterlerin ve sayıların aynen korunmasını; gerçek şirket
bilgisi, logo, vergi numarası, imza, damga, QR kod ve fazladan satır üretilmemesini
zorunlu tuttu.
