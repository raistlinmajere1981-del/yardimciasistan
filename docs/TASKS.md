# Yardımcı Asistan — Güncel Görev Planı

Bu belge Yardımcı Asistan'ın **güncel çalışma sırasını** tanımlar. İlk monorepo kurulumundan Android companion'a kadar olan tarihsel geliştirme görevleri tamamlanmıştır; ayrıntıları Git geçmişinde korunur.

Güncel ürün davranışı için bu dosya, `docs/PRODUCT_STATUS.md`, `docs/PRE_PILOT_HARDENING_2026-08.md` ve `docs/PILOT_FIELD_TEST.md` birlikte esas alınmalıdır.

## Güncel ürün sözleşmesi

Aşağıdaki kararlar geriye dönülüp eski akışlara çevrilmemelidir:

- Web formu veya Web AI talebi **önce firma hostingine kaydolur**.
- WhatsApp ana kayıt kanalı değildir; başarılı kayıttan sonra isteğe bağlı ek iletişim yoludur.
- Masaüstü uygulaması local-first çalışır; internet kesilmesi temel operasyonları durdurmaz.
- Android companion PC SQLite'a doğrudan bağlanmaz; hosting action/snapshot sözleşmesini kullanır.
- Yeni Android cihaz varsayılan olarak pasif/onay bekler.
- Onaylı Android cihaz mümkün olduğunda işletme genel `sync_secret` yerine cihaz başına token kullanır.
- AI yardımcı katmandır; ürünün rezervasyon, müşteri, oda, masa, finans ve günlük iş omurgası AI olmadan çalışmalıdır.
- Resmî WhatsApp API ve doğrudan Android↔PC LAN modu v1 pilot kriteri değildir.

---

# P0 — Pilot öncesi kapılar

## P0.1 — Otomatik pilot kontrolünü yeşile getir

Komut:

```bash
node scripts/pilot-check.mjs
```

Kabul kriterleri:

- build/typecheck/PHP lint geçer,
- web talebi + public abuse guard geçer,
- otomatik sync geçer,
- Android cihaz onayı ve cihaz token testleri geçer,
- finans, oda hesabı ve restoran→oda transfer testleri geçer,
- demo web→desktop→Android akışı geçer,
- `artifacts/pilot-check/latest.json` sonucu `passed` olur.

GitHub Actions tekrar çalışabilir hale geldiğinde aynı çekirdek sözleşmeler CI'da da yeşil görülmelidir.

## P0.2 — Windows temiz kurulum

`docs/PILOT_FIELD_TEST.md` içindeki Windows turu gerçek hedef makinede uygulanır.

Kabul kriterleri:

- NSIS kurulum başarılı,
- uygulama ilk açılışta çalışıyor,
- user-data ve backup klasörü doğru yerde,
- restart sonrası veri korunuyor,
- WhatsApp WebView ve hosting bağlantısı çalışıyor.

## P0.3 — Hibrit işletme günü

Pansiyon + restoran senaryosu sahte verilerle baştan sona uygulanır.

Kabul kriterleri:

- rezervasyon → check-in → oda hesabı,
- restoran adisyonu → stok düşümü → hesap bekliyor,
- restoran hesabını odaya yazma,
- kısmi ödeme → restart → kalan bakiye,
- çıkış ve kasa hareketi,
- hiçbir aşamada duplicate stok/gelir/kayıt oluşmaması.

## P0.4 — Android gerçek telefon

Kabul kriterleri:

- yeni telefon veri görmeden onay bekler,
- masaüstü onayından sonra çalışır,
- pasifleştirilince veri/action yetkisi kapanır,
- revoke/yeniden eşleştirme akışı anlaşılırdır,
- release APK işletme genel anahtarını binary içinde taşımaz.

## P0.5 — Restart + kalıcı sync kuyruğu

Finans/oda hesabı veya restoran→oda aktarımı yapıldıktan hemen sonra uygulama kapatılıp açılır.

Kabul kriterleri:

- yerel işlem kaybolmaz,
- `android_snapshot` outbox işi restart sonrası korunur,
- Android sonraki sync'te güncel duruma gelir.

## P0.6 — Kimlik verisi kararı

İlk pilotta gerçek kimlik verisi toplanmayacaksa bu açıkça pilot kuralı olarak korunur.

Gerçek kimlik verisi toplanacaksa ayrıca:

- güncel KVKK gereksinimleri,
- at-rest şifreleme/anahtar saklama,
- yedek/restore ve anahtar kurtarma

birlikte tasarlanmadan "güvenli saklama tamamlandı" kabul edilmez.

---

# P1 — Pilot sırasında ölçülecek konular

Bunlar ilk tanıtımı otomatik olarak engellemez; gerçek işletme kullanımıyla ölçülür.

## P1.1 — İlk kurulum sürtünmesi

Ölç:

- işletme tipi seçimi anlaşılır mı,
- hangi alanlarda kullanıcı durup yardım istiyor,
- oda/masa/menu tanımı ne kadar kolay,
- web bağlantısı ve Android eşleştirme teknik mi hissettiriyor.

## P1.2 — Ana ekran anlaşılabilirliği

Ölç:

- işletme sahibi günün işini Ana Ekran'dan anlayabiliyor mu,
- Sistem Sağlığı paneli gerçekten işe yarıyor mu,
- teknik terimler azaltılmalı mı.

## P1.3 — Pansiyon operasyonu

Ölç:

- rezervasyon, oda atama, check-in ve oda hesabı sırası doğal mı,
- ödeme/çıkış ekranlarında fazla adım var mı,
- konaklama geçmişi bulunabiliyor mu.

## P1.4 — Restoran operasyonu

Ölç:

- masaya sipariş ekleme hızlı mı,
- hesap bekliyor/ödendi ayrımı anlaşılır mı,
- odaya yaz paneli doğru zamanda görünür mü,
- stok uyarıları günlük kullanımda faydalı mı.

## P1.5 — Android companion

Ölç:

- işletme sahibi rol/izin mantığını anlıyor mu,
- personel için gereksiz ekran var mı,
- mobilde hangi 2–3 işlem gerçekten sık kullanılıyor.

## P1.6 — WhatsApp ve AI

Ölç:

- hazır mesaj/WhatsApp Web gerçek iş akışını hızlandırıyor mu,
- AI cevap/özetleri gerçekten kullanılıyor mu,
- AI kapalıyken ürünün algılanan değeri yeterli mi.

---

# P2 — Pilot sonrası toplu iyileştirme

Pilot boyunca küçük UX istekleri tek tek anında uygulanmaz; veri bütünlüğü veya işi durdurma sorunu değilse gruplanır.

Örnekler:

- buton/etiket isimleri,
- panel sıralaması,
- varsayılan filtreler,
- daha az tıklama,
- rapor sunumu,
- küçük görsel düzenlemeler.

Pilot sonunda benzer şikâyetler tek paket halinde ele alınır.

---

# Bilinçli olarak ertelenenler

Aşağıdakiler gerçek pilot ihtiyacı kanıtlanmadan eklenmez:

- resmî WhatsApp Business API,
- Android↔PC doğrudan LAN modu,
- merkezi Yardımcı Asistan cloud servisi,
- büyük ölçekli rol/organizasyon sistemi,
- ileri muhasebe/ERP özellikleri,
- büyük frontend/backend refaktörü,
- yeni sektörler.

---

# P0 hata tanımı

Aşağıdakilerden biri görülürse yeni özellik işi durur ve önce bu hata çözülür:

- para hareketinin kaybolması veya iki kez yazılması,
- stokun yanlış/iki kez düşmesi,
- rezervasyon/müşteri/oda kaydının kaybolması veya duplicate olması,
- restart sonrası kayıt veya sync kuyruğu kaybı,
- onaysız/pasif cihazın işletme verisine erişmesi,
- installer veya uygulama açılışının hedef Windows'ta çalışmaması,
- yedeğin aktif veritabanını bozması.

---

# Bir pilot düzeltmesinin tamamlanma tanımı

Her düzeltmede mümkünse:

1. problem tekrar üretilebilir olmalı,
2. veri bütünlüğü etkisi açıklanmalı,
3. kod düzeltmesi küçük tutulmalı,
4. ilgili otomatik smoke/regresyon testi eklenmeli veya güncellenmeli,
5. `pilot-check` tekrar çalıştırılmalı,
6. saha davranışı değiştiyse `PILOT_FIELD_TEST.md` veya `PRODUCT_STATUS.md` güncellenmeli.

Şu aşamadaki ana hedef daha fazla özellik değil: **ilk gerçek işletmenin üçüncü gününde sistemi bırakmasına neden olacak problemi pilot başlamadan yakalamak.**
