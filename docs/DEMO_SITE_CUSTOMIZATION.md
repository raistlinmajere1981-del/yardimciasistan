# Demo Site Özelleştirme Rehberi

Bu rehber, web sitesi olmayan bir firma için `apps/demo-web` içindeki demo siteyi firma bilgilerine göre uyarlamak içindir.

Ana dosya:

```text
apps/demo-web/config/business.json
```

Görseller:

```text
apps/demo-web/public/assets/
```

## 1. Siteyi Çalıştırma

Yerel bilgisayarda önizleme:

```bash
npm run dev:demo-web
```

Tarayıcı adresi:

```text
http://127.0.0.1:5173/
```

Aynı Wi-Fi ağındaki telefondan bakmak için:

```bash
npm run dev:demo-web:lan
```

## 2. Firma Bilgilerini Değiştirme

`business.json` içinde şu alanları güncelleyin:

```json
{
  "display_name": "Firma Adı",
  "profile_id": "pension_restaurant",
  "phone": "+90 532 123 45 67",
  "whatsapp": "+90 532 123 45 67",
  "email": "info@firma.com",
  "website": "https://firma.com",
  "address": "Firma adresi",
  "map_url": "https://maps.google.com/?q=..."
}
```

`display_name` sitede başlık, menü ve footer alanlarında görünür.

`profile_id` örnek değerleri:

```text
pension_restaurant
pension
restaurant
cafe
market
```

## 3. Logo ve Marka Alanı

Demo site varsayılan olarak Yardımcı Asistan marka sembolünü kullanır. Firmaya özel logo dosyası eklemek için:

1. Logoyu `apps/demo-web/public/assets/` içine koyun.
2. `business.json` içinde `logo_url` alanına yol yazın.

Örnek:

```json
{
  "logo_url": "/assets/logo.webp"
}
```

`logo_url` boş bırakılırsa demo site Yardımcı Asistan marka sembolüne döner. Aynı logo widget balonunda da kullanılacaksa script etiketinde `data-logo-url="/assets/logo.webp"` değeri verilebilir.

## 4. Renkleri Değiştirme

`colors` alanı sitenin ana renklerini belirler:

```json
{
  "colors": {
    "primary": "#2F6F5E",
    "accent": "#E47863",
    "ink": "#172033"
  }
}
```

Pratik seçim:

- `primary`: butonlar ve önemli vurgular.
- `accent`: küçük başlıklar ve sıcak vurgu rengi.
- `ink`: ana yazı rengi.

Çok açık renkleri buton rengi yapmayın; mobilde okunabilirlik düşer.

## 5. Ana Görsel ve İlk Ekran

Hero alanı:

```json
{
  "hero": {
    "image_url": "/assets/demo-hero.webp",
    "eyebrow": "Pansiyon • Restoran • Kafe",
    "title": "Firma Adı",
    "summary": "Kısa tanıtım metni"
  }
}
```

Yeni görsel eklemek için:

1. Görseli `apps/demo-web/public/assets/` içine koyun.
2. WebP formatı tercih edin.
3. `image_url` alanını `/assets/yeni-gorsel.webp` olarak güncelleyin.

Önerilen görseller:

- Dış mekan veya giriş.
- Oda örneği.
- Kahvaltı, masa veya ürün görseli.

## 6. Öne Çıkan Bilgiler

Ana sayfadaki kısa bilgi şeridi `highlights` alanından gelir:

```json
{
  "highlights": [
    {
      "label": "8 oda",
      "description": "Sade, temiz ve balkonlu seçenekler"
    }
  ]
}
```

Kısa ve sayısal bilgiler daha iyi çalışır:

```text
8 oda
Bahçe masaları
WhatsApp dönüşü
Denize 5 dk
```

## 7. Hizmetleri Değiştirme

`services` alanı ana sayfadaki hizmet kartlarını doldurur:

```json
{
  "title": "Konaklama",
  "description": "Kısa açıklama",
  "icon": "bed"
}
```

Desteklenen ikon adları:

```text
bed
coffee
table
```

## 8. Oda Ekleme

Odalar `rooms` listesinde tutulur:

```json
{
  "id": "room_103",
  "name": "Bahçe Katı Oda",
  "capacity": 2,
  "bed_info": "1 çift kişilik yatak",
  "features": ["Klima", "Duş", "Wi-Fi"],
  "description": "Kısa oda açıklaması.",
  "price_note": "Fiyat bilgisi için işletme dönüş yapar.",
  "image_url": "/assets/demo-room.webp"
}
```

Yeni oda eklerken:

1. `id` benzersiz olmalı.
2. `capacity` sayı olmalı.
3. `features` kısa tutulmalı.
4. Fiyat kesin değilse `price_note` içinde "işletme dönüş yapar" gibi güvenli metin kullanın.

## 9. Masa ve Restoran Bilgisi

Masa örnekleri `tables` alanındadır:

```json
{
  "name": "Bahçe Masası",
  "capacity": 4,
  "area": "Bahçe"
}
```

Kafe veya restoran yoksa `modules.tables` değerini `false` yapabilirsiniz:

```json
{
  "modules": {
    "tables": false
  }
}
```

## 10. Menü Ekleme

Menü iki bölümden oluşur:

```json
{
  "menu": {
    "categories": [],
    "items": []
  }
}
```

Kategori örneği:

```json
{
  "id": "cat_breakfast",
  "name": "Kahvaltı"
}
```

Ürün örneği:

```json
{
  "id": "item_004",
  "category_id": "cat_breakfast",
  "name": "Menemen",
  "description": "Domates, biber ve yumurtayla hazırlanır.",
  "price": 180,
  "currency": "TRY",
  "is_featured": false
}
```

`category_id`, kategorilerden birinin `id` değeriyle aynı olmalıdır.

QR menü web modülündeki canlı menüden ayrı çalışır. Demo site içindeki menü satış/önizleme amaçlıdır; gerçek QR yayın akışı masaüstü outbox'ından web modülünün hosting SQLite'ına gider.

## 11. WhatsApp Numarası

Demo sitedeki WhatsApp butonları şu alanı kullanır:

```json
{
  "whatsapp": "+90 532 123 45 67"
}
```

Türkiye cep telefonu formatı kullanın:

```text
+90 532 123 45 67
0532 123 45 67
905321234567
```

Form gönderildiğinde WhatsApp mesajı hazır açılır; kullanıcı mesajı kontrol edip kendisi gönderir.

## 12. Galeri

Galeri alanı:

```json
{
  "gallery": [
    {
      "title": "Bahçe ve giriş",
      "image_url": "/assets/demo-hero.webp"
    }
  ]
}
```

Görsel isimlerinde boşluk ve Türkçe karakter kullanmayın. Önerilen:

```text
bahce-giris.webp
aile-odasi.webp
kahvalti-masasi.webp
```

## 13. Yayına Hazırlama

Build komutu:

```bash
npm run build -w @yardimci-asistan/demo-web
```

Demo siteyi firma web modülündeki gerçek widget ile birlikte açmak için:

```bash
VITE_YA_WEB_MODULE_URL=https://firma.com/yardimci-asistan npm run build -w @yardimci-asistan/demo-web
```

Yerel testte aynı bağlantı `npm run dev:local` veya `npm run smoke:demo-web-widget` ile doğrulanır.

Çıktı:

```text
apps/demo-web/dist/
```

Bu klasör statik web sitesidir. İçeriği hostingdeki web kök klasörüne kopyalanabilir.

## 14. Kontrol Listesi

Yayından önce:

- Firma adı doğru mu?
- Telefon ve WhatsApp numarası doğru mu?
- Harita linki doğru yere gidiyor mu?
- Hero görseli mobilde okunaklı mı?
- Odalar ve masa bilgileri gerçekçi mi?
- Fiyatlar bağlayıcı kesin söz vermiyor mu?
- WhatsApp butonu doğru numarayla açılıyor mu?
- `npm run e2e` testi geçiyor mu?
