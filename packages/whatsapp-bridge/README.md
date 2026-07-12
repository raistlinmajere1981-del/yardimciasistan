# WhatsApp Bridge

WhatsApp bağlantılı yardımcı akışlar bu pakette toplanır. Web widget, demo web ve masaüstü uygulama aynı telefon normalizasyonu, link üretimi ve mesaj şablonlarını kullanır.

## Desteklenen Akışlar

- `wa_link`: `https://wa.me/...` linki üretir.
- `manual_copy`: Mesajı ve telefon bilgisini manuel kopyalama için hazırlar.
- `webview`: Electron WebView ekranını `https://web.whatsapp.com/` üzerinde açar; müşteri sohbeti için WhatsApp Web hedef URL'si ve manuel fallback döndürür.
- `official_api_future`: Resmi API adaptörü için yer ayırır ve şimdilik manuel fallback verir.

## Temel API

```ts
import { createWhatsAppLink, createWhatsAppUrl, createWhatsAppWebUrl, prepareWhatsAppAction } from "@yardimci-asistan/whatsapp-bridge";

const result = createWhatsAppLink("0532 123 45 67", "Merhaba");
const href = createWhatsAppUrl("+90 532 123 45 67", "Merhaba");
const webHref = createWhatsAppWebUrl("+90 532 123 45 67", "Merhaba");
const action = prepareWhatsAppAction({ phone: "0532 123 45 67", message: "Merhaba", preferredMode: "webview" });
```

`createWhatsAppLink` doğrulama sonucu döndürür. `createWhatsAppUrl` ise UI içinde doğrudan `href` veya `window.open` için kullanılabilecek URL string'i üretir; geçersiz telefon ya da boş mesajda boş string döner.
