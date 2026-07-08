# Demo Veri Seti

Bu klasor satis, test ve duman testi akislarinda kullanilan ornek verileri tutar.

`web-module-requests.json` dosyasi firma web modulunde bekleyen talep listesini
temsil eder. Kayitlar gercek kisi bilgisi icermez; telefonlar ve adlar demo
amaciyla uretilmistir. `smoke:demo-flow` bu kayitlara ek olarak calisan
`api/chat.php` endpointinden bir `source=web_ai` talebi uretir ve PC SQLite'a
cekildigini dogrular.

Kullanim:

```bash
npm run demo:data:apply
npm run demo:data:clear
npm run smoke:demo-flow
```

`smoke:demo-flow` kendi yedegini alir ve test sonunda web modulundeki talep,
AI konusma, Android snapshot ve sync state JSON dosyalarini eski haline getirir.
