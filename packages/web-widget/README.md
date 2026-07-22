# Web Widget

Mevcut web sitelerine tek script ile eklenebilecek Yardımcı Asistan widget'ı burada geliştirilir.

Widget; sağ altta AI asistan başlatıcısı, hızlı aksiyon chipleri, kompakt rezervasyon/masa akışı, öneri sorulu AI bilgi alanı ve akıllı WhatsApp mesaj hazırlama sunar. Tarih seçimi Bugün/Yarın/Hafta sonu seçenekleriyle veya görünür Türkçe tarih üreten native date picker ile yapılır. Mini API adresi verilirse talebi arka planda kaydetmeyi ve bilgi panelindeki kısa soruları `api/chat.php` üzerinden yanıtlamayı dener; bu denemeler başarısız olsa bile WhatsApp akışı devam eder. AI fallback yanıtları güvenli hata kodu, açıklama, sağlayıcı HTTP durumu ve yeniden deneme bilgisini gösterir; ham sağlayıcı cevabı veya API anahtarı tarayıcıya taşınmaz.

## Build

```bash
npm run build
```

Çıktı dosyası:

```text
packages/web-widget/dist/widget.js
```

## Örnek Kullanım

```html
<script
  src="/yardimci-asistan/widget.js"
  data-business-name="Deniz Çiçeği Pansiyon & Kafe"
  data-whatsapp-phone="+90 532 123 45 67"
  data-api-base-url="/yardimci-asistan"
  data-logo-url="/yardimci-asistan/assets/yardimci-asistan-symbol.png"
></script>
```
