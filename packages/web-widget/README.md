# Web Widget

Mevcut web sitelerine tek script ile eklenebilecek Yardımcı Asistan widget'ı burada geliştirilir.

Widget; sağ altta Yardımcı Asistan butonu, açılır panel, kısa talep formu, WhatsApp hazır mesajı ve QR menü bağlantısı sunar. Mini API adresi verilirse talebi arka planda kaydetmeyi dener; bu deneme başarısız olsa bile WhatsApp mesajı hazırlanır.

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
  data-menu-url="/yardimci-asistan/menu.html"
></script>
```
