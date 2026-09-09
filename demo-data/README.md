# Demo Veri Seti

Bu klasör, test ve duman testi akışlarında kullanılan örnek girdileri tutar.

`android-operations-snapshot.json`, Android companion ve hosting smoke'larında
yayınlanan güncel snapshot başlangıcıdır. Web talepleri ve senkron metadata'sı
artık ayrı JSON dosyalarında tutulmaz; web modülü bunları kendi güncel SQLite
veritabanında oluşturur.

`fatura-ornekleri/` klasörü, `AI ile Stok Ekle` akışında kullanılabilecek iki
yapay PNG fatura ve bunların beklenen adet/gram sonuçlarını içerir.

Kullanım:

```bash
npm run smoke:demo-flow
npm run android:phone-test -- --once --no-adb
```

Her smoke kendi geçici SQLite/web modülünü kullanır ve kaynak template'e
çalışma verisi yazmaz.
