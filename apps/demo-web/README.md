# Demo Web

Web sitesi olmayan firmalar için hazırlanacak özelleştirilebilir demo web sitesi burada geliştirilecektir.

Firma bilgileri config dosyalarından okunur. Talep formu uygulama içinde yer alır; `VITE_YA_WEB_MODULE_URL` verildiğinde demo site aynı zamanda firma web modülündeki gerçek `widget.js` dosyasını sağ alt Yardımcı Asistan widget'ı olarak yükler.

Yerel web modülüyle birlikte denemek için:

```bash
VITE_YA_WEB_MODULE_URL=http://127.0.0.1:8080 npm run dev -w @yardimci-asistan/demo-web
```

## Özelleştirme

Firma adı, renkler, görseller, odalar, menü ve WhatsApp numarası için ana dosya:

```text
apps/demo-web/config/business.json
```

Ayrıntılı adım adım rehber:

```text
docs/DEMO_SITE_CUSTOMIZATION.md
```
