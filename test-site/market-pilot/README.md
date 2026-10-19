# Market Pilot

Site: https://yardimciasistantest.alwaysdata.net/
API modülü: `/yardimci-asistan/`

Market Pilot sade yeşil/krem perakende sunumunun sahibidir. `index.php` ana sayfa,
`magaza/index.php` katalog, `magaza/urun/index.php?id=…` ürün ayrıntısıdır.
`inc/site.php` site kabuğu/dil tercihini, `assets/market.js` public HTTP tüketimini
ve site asistanını sahiplenir. Derleme veya ortak widget paketi gerekmez.

## Veri ve yetki sınırları

- İşletme adı, iletişim ve açıklamalar `GET api/business.php` üzerinden gelir.
  Eski `site.local.php` işletme verisi olarak okunmaz; dosya deploy sırasında
  silinmez veya üzerine yazılmaz. Gerçek bilgiler Desktop'tan yayınlanmalıdır.
- Ürün/kategori/fiyat/birim/fotoğraf `GET api/catalog.php` üzerinden gelir.
  `enabled` ve `business.public_surfaces` içindeki `store` birlikte kontrol edilir.
  Dosya varlığı veya profil adı görünürlük yetkisi değildir.
- Desktop `channel.online_sales` yayının sahibidir. Perakende `commerce.catalog`,
  `commerce.sales`, `retail.*` yetkileri public satış kanalı açıldığı anlamına gelmez.
  API yalnız yayınlanmış aktif ürünleri sunar. Stok miktarı yayınlanmadığından
  stok sayısı veya stok garantisi gösterilmez. `delivery_methods: []` kataloğu gizlemez.
- Kampanyalar `GET api/marketing.php` içindeki yayınlanmış listeyle sınırlıdır;
  `marketing.studio` OFF yayınını mevcut üretici boşaltır. Site kampanya üretmez.
- `commerce.wholesale` özel bayi erişimiyle birlikte değerlendirilmelidir.
  Public business/catalog cevabı bayi oturum yetkisi veya bayi fiyatı sağlamaz.
  Pilot'ta bayi portalı, sipariş, ödeme veya örnek başarı işlemi yoktur. Bunlar
  mevcut pilotun işlevleri değildi; etkin public katalogdan bayi yetkisi türetilmez.
- Asistan yalnız `business.ai_enabled` açıkken kullanılabilir; aynı origin üzerindeki
  mevcut `POST api/chat.php` sunucu bağlantısını kullanır. Tarayıcıya servis anahtarı,
  özel config veya Desktop veritabanı erişimi verilmez. Hatalarda soru korunur;
  sunucu fallback'i veya erişim hatası site dilinde durum mesajına dönüşür.

Önceki site yalnız statik bir ana sayfaydı: atıştırmalık/içecek/temel ihtiyaç kartları
örnek metin, işletme bilgileri host-local override, katalog bağlantısı ise dosya
varlığı kontrolüydü. Bu varsayımlar kaldırılmıştır. Ürün fixture'ları yalnız geçici
smoke ortamındadır. Raf çizimi dekoratiftir ve yayınlanmış ürün fotoğrafı sayılmaz.
Pilot eski ortak widget/sunum dosyalarını kullanmaz; demo veya BlackSea runtime'ına
bağımlılığı yoktur.

## TR/EN ve kullanım

Türkçe varsayılandır. İngilizce, `business.php` kökündeki geçerli v1 `localization`
metadata'sında `target_languages` içinde `en` varsa seçilebilir. İşletmenin konuşulan
dilleri bu yetki için kullanılmaz. Query + HttpOnly/SameSite cookie tercihi sayfalar
arasında korur; HTML `private, no-store` döner. Metadata kapandığında saklanan EN
tercihiyle dahi Türkçe gösterilir ve seçici gizlenir.

`inc/flag-language.php`, `assets/flag-language.{css,js}` ve `assets/flags/`, demo ve
BlackSea ile aynı bayraklı bileşenin siteye ait kopyalarıdır. İkinci seçici tasarımı
veya ortak API paketinde sunum bulunmaz. Escape odağı tetikleyiciye döndürür;
reduced-motion animasyonu kapatır.

`assets/i18n/en.json` yalnız Market Pilot arayüzünü çevirir. İşletme, katalog ve
kampanya metinleri ilgili API yanıtının kendi `localization` alanından seçilir.
Eksik/stale çeviri Türkçe kaynağa döner; stale elemesi Desktop üreticisine aittir.
İşletme localization kayıt kimliği hosting config kimliği varsayılmaz. Kullanıcı
sorusu ve AI yanıtı site sözlüğüne sokulmaz. Asistan EN için `response_language: en`
gönderir. Fiyat/sayı `tr-TR` / `en-GB` ile biçimlenir; canonical tutar değişmez.

API bütün yayınlanmış kataloğu döndürür. Arama ad/açıklama/SKU üzerinde bütün listede
çalışır; kategori filtresi ve 24 ürünlük sayfalama DOM'u sınırlar. Bu sunucu taraflı
sayfalama iddiası değildir. Ürün ayrıntısından dönüş arama/kategori/sayfayı korur.
Boş katalog, kaldırılmış ürün, kapalı yayın, erişim hatası ve eksik/bozuk fotoğraf
ayrı, dürüst durumlarla gösterilir.

## Yerel doğrulama ve deploy

```sh
npm run verify:check -- market-pilot-web
```

Registry prerequisite'leri mevcut Desktop/ortak paket derlemelerini ve PHP lint'i
çalıştırır. Smoke geçici dizinde güncel web modülünü ve siteyi kurar; gerçek Desktop
SQLite üreticileri/outbox/exact receipt → PHP → Chromium zincirini kullanır.
TR/EN, eksik/stale çeviri, 10.026 ürün, arama/sayfalama, yayın kaldırma, kapalı
capability, fotoğraf ve 320/390/768/1280 px ekranları sınar. Ekran görüntüleri
`artifacts/market-pilot-smoke/` altındadır. Başarılı/erişilemeyen AI yanıtları HTTP
fixture'larıdır; canlı sağlayıcı, çeviri kalitesi veya fiziksel cihaz kanıtı değildir.

`scripts/deploy-market-pilot.sh` siteye ait `assets/`, `inc/`, `magaza/` ve ana sayfayı
aktaracak şekilde düzenlenmiştir. Script hedef hesap guard'ını, mevcut runtime/veri
korumasını ve canonical modül deploy yordamını kullanır. Bu aşamada script
çalıştırılmaz; canlı deploy, secret oluşturma/sıfırlama veya paketleme yapılmaz.

Canlıdan önce Desktop işletme bilgileri, public kanal/çeviri metadata'sı ve ürün
fotoğraf URL'leri yayınlanmalı; gerçek AI yapılandırması ve sunucu/browser cache
başlıkları hedef ortamda kontrol edilmelidir. Toptan portalı veya sipariş istenirse
ayrıca mevcut yetkili endpoint/session sözleşmesiyle somut arayüz çalışması gerekir.
