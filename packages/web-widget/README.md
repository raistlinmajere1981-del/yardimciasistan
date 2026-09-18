# Web Widget

Mevcut web sitelerine tek script ile eklenebilecek Yardımcı Asistan widget'ı burada geliştirilir.

Widget; sağ altta AI asistan başlatıcısı, hızlı aksiyon chipleri, kompakt rezervasyon/masa akışı, öneri sorulu AI bilgi alanı ve isteğe bağlı WhatsApp iletişimi sunar. Tarih seçimi Bugün/Yarın/Hafta sonu seçenekleriyle veya görünür Türkçe tarih üreten native date picker ile yapılır.

Rezervasyon ve masa formlarında ana işlem **Talebi Gönder**'dir. Mini API adresi verildiğinde form `api/request.php` üzerinden doğrudan işletmenin Yardımcı Asistan kaydına gönderilir ve başarılı kayıt sonrasında kullanıcıya net bir onay gösterilir. WhatsApp otomatik açılmaz; isteyen kullanıcı kayıt tamamlandıktan sonra **WhatsApp'tan da yaz** seçeneğini kullanabilir. Web kaydı başarısız olursa form korunur ve WhatsApp yalnız alternatif iletişim yolu olarak sunulur.

Bilgi panelindeki kısa sorular `api/chat.php` üzerinden yanıtlanır. AI fallback yanıtları güvenli hata kodu, açıklama, sağlayıcı HTTP durumu ve yeniden deneme bilgisini gösterir; ham sağlayıcı cevabı veya API anahtarı tarayıcıya taşınmaz.

## Build

```bash
npm run build
```

Çıktı dosyası:

```text
packages/web-widget/dist/widget.js
```

Normal build yalnız `packages/web-widget/dist/widget.js` üretir; tracked `firm-template/web-module/widget.js` dosyasını değiştirmez. Böylece rutin build/test akışları çalışma ağacında generated-artifact diff'i bırakmaz.

Tracked template snapshot'ını bilinçli olarak yenilemek gerektiğinde:

```bash
npm run sync:web-widget-template
```

Deploy paketi üretirken ayrıca template'i güncellemek gerekmez. `npm run pack:web-module`, güncel `dist/widget.js` bundle'ını doğrudan `artifacts/web-module-deploy/yardimci-asistan/widget.js` içine yerleştirir ve tracked template dosyasını değiştirmez.

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
