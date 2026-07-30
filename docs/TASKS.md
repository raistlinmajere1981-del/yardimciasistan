# Yardımcı Asistan — Görev Planı

Bu doküman Yardımcı Asistan v1 geliştirme sürecindeki görevleri ve öncelik sırasını tanımlar.

Codex CLI ile çalışırken görevler küçük, net ve kontrol edilebilir parçalar halinde verilmelidir.

## Genel Geliştirme Prensibi

Yardımcı Asistan tek seferde büyük bir sistem olarak kodlanmayacaktır.

Geliştirme şu sırayla ilerleyecektir:

```text
1. Proje iskeleti
2. Ortak veri tipleri
3. Demo web sitesi
4. Web widget
5. Firma hosting mini API
6. Talep formu ve WhatsApp mesaj üretimi
7. PC masaüstü uygulaması
8. Local SQLite veri yapısı
9. Web taleplerini PC’ye çekme
10. QR menü
11. AI adapter
12. WhatsApp Bridge
13. Android companion
14. Paketleme ve kurulum dokümanları
```

Her görev sonunda şu bilgiler raporlanmalıdır:

```text
- Hangi dosyalar oluşturuldu?
- Hangi dosyalar değiştirildi?
- Ne eklendi?
- Nasıl test edilir?
- Eksik kalan noktalar nelerdir?
```

## Ana Hedef

İlk çalışan demo şu akışı gösterebilmelidir:

```text
Müşteri demo web sitesine girer.
↓
Talep formu doldurur.
↓
WhatsApp hazır mesajı açılır.
↓
Talep firma hosting mini API içinde kaydedilir.
↓
PC uygulaması bu talebi çeker.
↓
PC ana panelinde yeni talep görünür.
↓
AI cevap önerisi hazırlanabilir.
↓
İşletme sahibi WhatsApp üzerinden müşteriye dönebilir.
```

Bu akış tamamlandığında Yardımcı Asistan v1’in ana omurgası kurulmuş olur.

---

# Faz 0 — Proje Hazırlığı

## TASK-0001 — Monorepo klasör yapısını oluştur

Amaç:

Projenin temel klasör yapısını oluşturmak.

Oluşturulacak yapı:

```text
yardimci-asistan/
  docs/
  apps/
    demo-web/
    desktop-app/
    android-app/
  packages/
    shared/
    ai-core/
    whatsapp-bridge/
    web-widget/
    sync-core/
  firm-template/
    web-module/
    knowledge/
    config/
```

Kabul kriterleri:

* Klasör yapısı oluşturulmuş olmalı.
* Her ana klasörde kısa bir `README.md` bulunmalı.
* Proje kökünde genel `README.md` bulunmalı.

---

## TASK-0002 — Kök README dosyasını oluştur

Amaç:

Projeyi ilk açan kişinin Yardımcı Asistan’ın ne olduğunu anlamasını sağlamak.

İçerik:

* Ürün adı
* Kısa açıklama
* Ana bileşenler
* Merkezi cloud kullanılmadığı notu
* İlk hedef sektörler
* Geliştirme durumu
* Klasör yapısı

Kabul kriterleri:

* Teknik olmayan kısa proje açıklaması bulunmalı.
* Geliştirici için klasör açıklamaları bulunmalı.

---

## TASK-0003 — Ortak geliştirme notlarını ekle

Amaç:

Codex ve geliştirici için ortak kuralları görünür hale getirmek.

Dosyalar:

```text
docs/PROJECT_BRIEF.md
docs/ARCHITECTURE.md
docs/CODEX_RULES.md
docs/UI_RULES.md
docs/DATA_MODEL.md
docs/EVENTS.md
docs/TASKS.md
```

Kabul kriterleri:

* Tüm dokümanlar `docs/` altında bulunmalı.
* Kök README içinde bu dokümanlara referans verilmeli.

---

# Faz 1 — Ortak Tipler ve Yardımcı Paketler

## TASK-0101 — Shared package iskeletini oluştur

Amaç:

Web, desktop ve Android tarafında ortak kullanılacak veri tipleri için temel paket oluşturmak.

Klasör:

```text
packages/shared/
```

İçerik:

```text
types/
  business.ts
  customer.ts
  request.ts
  reservation.ts
  room.ts
  table.ts
  menu.ts
  ai.ts
  whatsapp.ts
  notification.ts
  sync.ts
  event.ts
utils/
  date.ts
  id.ts
  phone.ts
  validation.ts
```

Kabul kriterleri:

* Veri modelleri `docs/DATA_MODEL.md` ile uyumlu olmalı.
* Tip isimleri sade ve anlaşılır olmalı.
* Gereksiz framework bağımlılığı olmamalı.

---

## TASK-0102 — Ortak ID üretim yardımcılarını yaz

Amaç:

Kayıtlar için tutarlı ID üretimi sağlamak.

Örnek prefixler:

```text
business_
customer_
request_
reservation_
room_
table_
item_
event_
```

Kabul kriterleri:

* ID üretimi ortak yardımcı fonksiyonla yapılmalı.
* Test edilebilir olmalı.
* Her model için uygun prefix desteklenmeli.

---

## TASK-0103 — Telefon numarası normalizasyon yardımcılarını yaz

Amaç:

WhatsApp ve müşteri kayıtları için telefon numaralarını tutarlı hale getirmek.

Fonksiyonlar:

```text
normalizePhone()
formatPhoneForDisplay()
formatPhoneForWhatsApp()
isValidTRPhone()
```

Kabul kriterleri:

* Türkiye telefon formatı desteklenmeli.
* WhatsApp linki için uygun format üretilebilmeli.
* Hatalı numaralarda anlaşılır sonuç dönmeli.

---

# Faz 2 — Demo Web Sitesi

## TASK-0201 — Demo web sitesi iskeletini oluştur

Amaç:

Yardımcı Asistan’ın web sitesi olmayan firmalara sunacağı demo siteyi oluşturmak.

Klasör:

```text
apps/demo-web/
```

Sayfalar:

```text
Ana Sayfa
Pansiyon / Odalar
Restoran / Kafe
QR Menü
Galeri
Ulaşım
İletişim
Rezervasyon / Bilgi Al
```

Kabul kriterleri:

* Mobil uyumlu olmalı.
* Sade ve sıcak tasarım dili kullanılmalı.
* Yardımcı Asistan marka diline uygun olmalı.
* Firma bilgileri config dosyasından okunmalı.

---

## TASK-0202 — Demo firma config yapısını oluştur

Amaç:

Demo web sitesinin farklı firmalara göre kolayca özelleştirilebilmesini sağlamak.

Dosya örneği:

```text
apps/demo-web/config/business.json
```

İçerik:

```text
Firma adı
Logo
Renkler
Telefon
WhatsApp
Adres
Harita linki
Sosyal medya
Çalışma saatleri
Aktif modüller
```

Kabul kriterleri:

* Demo site sabit metinlere bağımlı olmamalı.
* Firma adı, telefon, WhatsApp ve adres config üzerinden değiştirilebilmeli.

---

## TASK-0203 — Ana sayfa tasarımını oluştur

Amaç:

Demo web sitesinin ana vitrini oluşturmak.

Bölümler:

```text
Hero alanı
Ana çağrı butonları
Kısa hizmet kartları
Pansiyon / restoran tanıtımı
Galeri önizleme
Konum bilgisi
WhatsApp ve rezervasyon CTA
```

Kabul kriterleri:

* Ana CTA butonları net olmalı.
* Mobilde güçlü görünmeli.
* Teknik terim içermemeli.

---

## TASK-0204 — Pansiyon / odalar sayfasını oluştur

Amaç:

Pansiyon modu için odaların gösterileceği sayfayı oluşturmak.

Bölümler:

```text
Oda kartları
Kapasite
Özellikler
Kısa açıklama
Rezervasyon talebi butonu
```

Kabul kriterleri:

* Oda verileri config veya JSON dosyasından okunmalı.
* Oda kartlarında fiyat zorunlu olmamalı.
* Rezervasyon talebi butonu web formuna yönlendirmeli.

---

## TASK-0205 — Restoran / kafe sayfasını oluştur

Amaç:

Restoran veya kafe modu için tanıtım sayfası oluşturmak.

Bölümler:

```text
Kısa tanıtım
Öne çıkan hizmetler
Menüye git butonu
Masa rezervasyon talebi
Galeri önizleme
```

Kabul kriterleri:

* Firma restoran modunda değilse bu sayfa gizlenebilir olmalı.
* QR menüye bağlantı bulunmalı.

---

## TASK-0206 — İletişim ve ulaşım sayfasını oluştur

Amaç:

Müşterinin işletmeye kolay ulaşmasını sağlamak.

Bölümler:

```text
Adres
Harita
Telefon
WhatsApp
Çalışma saatleri
Kısa iletişim formu veya talep butonu
```

Kabul kriterleri:

* WhatsApp butonu çalışmalı.
* Harita linki config üzerinden gelmeli.

---

# Faz 3 — Web Widget

## TASK-0301 — Web widget iskeletini oluştur

Amaç:

Mevcut web sitelerine entegre edilebilecek Yardımcı Asistan widget yapısını oluşturmak.

Klasör:

```text
packages/web-widget/
```

Widget özellikleri:

```text
Sağ altta buton
Açılır panel
Rezervasyon / bilgi formu
WhatsApp butonu
AI sohbet alanı
QR menü linki
```

Kabul kriterleri:

* Mevcut sitenin tasarımını bozmamalı.
* Tek script ile gömülebilir olmalı.
* Mobil uyumlu olmalı.

Durum:

* Tamamlandı. `packages/web-widget` tek script ile gömülebilen sağ alt widget'ı, mobil uyumlu açılır paneli, rezervasyon/bilgi formunu, bilgi panelinde mini API `chat.php` üzerinden AI soru/cevap alanını, WhatsApp ve QR menü aksiyonlarını içerir. Demo web sitesi `VITE_YA_WEB_MODULE_URL` verildiğinde aynı `widget.js` dosyasını gömer. `data-logo-url` ile firma veya Yardımcı Asistan marka sembolü gösterilebilir; değer verilmezse kompakt `YA` metin rozeti kullanılır. `npm run smoke:web-widget-branding` build edilmiş widget bundle'ında iki marka durumunu ve AI cevap alanını mock API ile doğrular; `npm run smoke:web-widget-module` aynı widget'ı gerçek PHP web modülünden yükleyip `api/request.php` talep kaydını, WhatsApp taslak linkini, `api/chat.php` fallback cevabını ve konuşma kaydını doğrular. `npm run smoke:demo-web-widget` demo web sayfasına gömülen widget'ın gerçek PHP web modülüyle çalıştığını doğrular.

---

## TASK-0302 — Widget ana ekranını oluştur

Amaç:

Widget açıldığında kullanıcıya sade seçenekler sunmak.

İlk seçenekler:

```text
Rezervasyon Talebi
Bilgi Al
WhatsApp’tan Yaz
Menüyü Gör
```

Kabul kriterleri:

* İlk ekranda karmaşa olmamalı.
* En fazla 4 ana seçenek gösterilmeli.
* Mobilde rahat kullanılmalı.

---

## TASK-0303 — Talep formu bileşenini oluştur

Amaç:

Müşteri talep bilgilerini toplamak.

Alanlar:

```text
Talep türü
Ad soyad
Telefon
Tarih
Kişi sayısı
Not
```

Talep türüne göre ek alanlar:

Pansiyon:

```text
Giriş tarihi
Çıkış tarihi
Yetişkin sayısı
Çocuk sayısı
Oda tercihi
```

Restoran:

```text
Tarih
Saat
Kişi sayısı
Masa tercihi
```

Kabul kriterleri:

* Form kısa ve sade olmalı.
* Zorunlu alanlar açık belirtilmeli.
* Hatalar teknik olmayan dille gösterilmeli.

---

## TASK-0304 — WhatsApp hazır mesaj üreticisini yaz

Amaç:

Form verisinden WhatsApp mesaj metni üretmek.

Örnek mesaj sonu:

```text
Lütfen bilgileri kontrol edip gönder tuşuna basın.
```

Kabul kriterleri:

* Mesaj okunaklı olmalı.
* Talep türüne göre metin değişebilmeli.
* WhatsApp link formatı doğru üretilmeli.
* Telefon numarası WhatsApp uyumlu formata dönüştürülmeli.

---

## TASK-0305 — Widget form gönderim akışını oluştur

Amaç:

Form gönderildiğinde hem talebin kaydedilmesi hem de WhatsApp mesajının açılması.

Akış:

```text
Form doğrulanır.
↓
Mini API’ye talep gönderilir.
↓
Başarılıysa WhatsApp linki hazırlanır.
↓
Kullanıcıya açıklama gösterilir.
↓
WhatsApp açılır.
```

Kabul kriterleri:

* Mini API başarısız olsa bile kullanıcı WhatsApp’a yönlendirilebilmeli.
* Kullanıcıya mesajı kontrol edip göndermesi gerektiği açıkça söylenmeli.
* Talep kaydı başarısız olursa sade uyarı verilmeli.

---

# Faz 4 — Firma Hosting Mini API

## TASK-0401 — Web module klasör yapısını oluştur

Amaç:

Firma hostingine kurulacak mini API yapısını oluşturmak.

Klasör:

```text
firm-template/web-module/
```

Önerilen yapı:

```text
widget.js
api/
  request.php
  chat.php
  menu.php
  sync.php
config/
  business.json
  ai.php
data/
  requests.json
  menu.json
  ai-conversations.json
  sync-state.json
knowledge/
  firma.md
  odalar.md
  restoran.md
  menu.md
  sik-sorulan-sorular.md
```

Kabul kriterleri:

* Standart Linux/PHP hostingde çalışabilir olmalı.
* Dosya izinleri dokümante edilmeli.
* API key frontend’e çıkmamalı.

---

## TASK-0402 — request.php talep alma endpointini oluştur

Amaç:

Web widget veya demo siteden gelen müşteri taleplerini kaydetmek.

Görevler:

```text
POST verisini al
Alanları doğrula
ID üret
created_at ekle
requests.json veya SQLite içine kaydet
JSON cevap döndür
```

Kabul kriterleri:

* Eksik alanlarda sade hata dönmeli.
* Telefon alanı doğrulanmalı.
* CORS ayarı kontrollü olmalı.
* Kayıt başarısızsa anlamlı cevap dönmeli.

---

## TASK-0403 — sync.php talep çekme endpointini oluştur

Amaç:

PC uygulamasının webden gelen yeni talepleri çekmesini sağlamak.

Akış:

```text
PC uygulaması sync_secret ile istek yapar.
Mini API yeni talepleri döndürür.
PC başarılı işledikten sonra talepler synced/seen olarak işaretlenebilir.
```

Kabul kriterleri:

* Basit güvenlik anahtarı kullanılmalı.
* Sadece gerekli bilgiler dönmeli.
* PC’ye dışarıdan bağlantı gerekmeden çalışmalı.

---

## TASK-0404 — menu.php QR menü endpointini oluştur

Amaç:

QR menü verilerini web üzerinden sunmak.

Görevler:

```text
menu.json dosyasını oku
Aktif kategorileri döndür
Aktif ve mevcut ürünleri döndür
```

Kabul kriterleri:

* Müşteriye pasif ürün gösterilmemeli.
* Fiyat ve para birimi doğru dönmeli.
* Menü mobil uyumlu sayfada görüntülenebilmeli.

---

## TASK-0405 — chat.php AI aracı endpointini oluştur

Amaç:

Web AI sohbet isteklerini güvenli şekilde AI provider’a iletmek.

Görevler:

```text
Kullanıcı mesajını al
Knowledge markdown dosyalarını oku
Sistem promptu oluştur
AI provider’a istek gönder
Cevabı döndür
Konuşmayı kaydet
```

Kabul kriterleri:

* AI API key frontend’de görünmemeli.
* AI hata verirse sade cevap dönmeli.
* AI kesin rezervasyon onayı vermemeli.
* Knowledge dosyaları kullanılmalı.

Durum:

* Tamamlandı. `firm-template/web-module/api/chat.php` sunucu tarafında knowledge dosyalarını okuyarak güvenli web AI cevabı üretir, provider kapalıyken fallback cevap döner, konuşmayı `data/ai-conversations.json` içine kaydeder ve müşteri adı, geçerli Türkiye cep telefonu ve talep niyeti geldiğinde `source=web_ai` olan pending talebi `data/requests.json` içine yazar.

---

# Faz 5 — Desktop App

## TASK-0501 — Electron desktop app iskeletini oluştur

Amaç:

PC uygulamasının temel yapısını oluşturmak.

Klasör:

```text
apps/desktop-app/
```

Teknoloji:

```text
Electron
React
SQLite
```

Kabul kriterleri:

* Uygulama açılmalı.
* Ana pencere görünmeli.
* Sol menü ve ana içerik alanı bulunmalı.
* Yardımcı Asistan marka adı ve logo alanı görünmeli.

---

## TASK-0502 — Desktop ana panel tasarımını oluştur

Amaç:

İşletme sahibinin günlük durumu ilk bakışta görmesini sağlamak.

Kartlar:

```text
Yeni Talepler
Bugünkü İşler
Oda Durumu
Masa Durumu
Bekleyen Rezervasyonlar
WhatsApp Hazır Cevaplar
```

Kabul kriterleri:

* Kartlar sade olmalı.
* Teknik terim olmamalı.
* Modül kapalıysa ilgili kart gizlenebilmeli.

---

## TASK-0503 — SQLite veritabanı iskeletini oluştur

Amaç:

PC uygulamasının local-first çalışmasını sağlamak.

Tablolar:

```text
business
settings
customers
requests
reservations
rooms
tables
menu_categories
menu_items
ai_conversations
whatsapp_messages
notifications
daily_tasks
sync_records
events
```

Kabul kriterleri:

* İlk migration dosyaları oluşturulmalı.
* Uygulama ilk açılışta veritabanını oluşturmalı.
* Seed demo verisi eklenebilmeli.

---

## TASK-0504 — Talepler ekranını oluştur

Amaç:

Webden, AI’dan veya manuel girişten gelen müşteri taleplerini göstermek.

Özellikler:

```text
Talep listesi
Talep detay kartı
Durum etiketi
Müşteriyi ara
WhatsApp’tan yaz
AI cevap önerisi
Rezervasyona dönüştür
Cevaplandı işaretle
```

Kabul kriterleri:

* Yeni talepler açıkça görünmeli.
* Talep tipi ayırt edilebilmeli.
* Tek tıkla WhatsApp mesajı hazırlanabilmeli.

Durum:

* Tamamlandı. Desktop yan menüsündeki `Talepler` ekranı talep listesi, seçili talep detay kartı, manuel talep formu, durum etiketi, arama, WhatsApp, AI cevap taslağı, rezervasyona çevirme ve `Cevaplandı İşaretle` aksiyonlarını içerir. Manuel kayıtlar SQLite'a `source=manual`, `sync_status=local_only` olarak yazılır, müşteri kaydıyla bağlanır ve `request.created` event kaydı oluşturur. Talep durum güncellemesi SQLite'a yazılır ve `request.status_changed` event kaydı oluşturur.

---

## TASK-0505 — Oda yönetimi ekranını oluştur

Amaç:

Pansiyon işletmeleri için oda durumunu yönetmek.

Özellikler:

```text
Oda kartları
Durum değiştirme
Kapasite bilgisi
Temizlik / bakım durumu
Rezervasyon bağlantısı
```

Kabul kriterleri:

* Oda durum renkleri UI_RULES ile uyumlu olmalı.
* Oda durumu değiştiğinde event oluşmalı.
* Oda modülü kapalıysa menüde görünmemeli.

Durum:

* Tamamlandı. Desktop `Odalar` ekranı oda kartları, kapasite/yatak/kat bilgisi, rezervasyon bağlantısı ve `Boş`, `Dolu`, `Temizlik`, `Bakım` hızlı durum aksiyonlarını içerir. Durum değişikliği SQLite'a yazılır ve `room.status_changed` event kaydı oluşturur.

---

## TASK-0506 — Masa yönetimi ekranını oluştur

Amaç:

Restoran/kafe işletmeleri için masa durumunu yönetmek.

Özellikler:

```text
Masa kartları
Boş / dolu / rezerve / hesap bekliyor durumu
Kapasite
Alan bilgisi
Hızlı durum değiştirme
```

Kabul kriterleri:

* Masa modülü kapalıysa görünmemeli.
* Durum değişiminde event oluşmalı.
* Android özet verisine uygun olmalı.

Durum:

* Tamamlandı. Desktop `Masalar` ekranı masa kartları, kullanıcı tanımlı alan
  kategorileri, kapasite ve rezervasyon bağlantısı ile `Boş`, `Dolu`, `Rezerve`, `Hesap`
  hızlı durum aksiyonlarını içerir. Kartlar kategori başlıkları altında gruplanır. Durum
  değişikliği SQLite'a yazılır ve `table.status_changed` event kaydı oluşturur; dashboard
  özetindeki uygun masa sayısı aynı SQLite durumunu kullanır.

---

## TASK-0507 — Rezervasyon ekranını oluştur

Amaç:

Pansiyon ve restoran rezervasyonlarını yönetmek.

Özellikler:

```text
Rezervasyon listesi
Tarih filtresi
Onay bekleyenler
Onayla
Reddet
İptal et
Müşteriyle iletişim
Oda/masa bağlantısı
```

Kabul kriterleri:

* Pansiyon ve restoran rezervasyonları ayrılabilmeli.
* Onaylanan rezervasyon oda/masa durumunu etkileyebilmeli.
* WhatsApp onay mesajı hazırlanabilmeli.

Durum:

* Tamamlandı. Desktop `Rezervasyonlar` ekranı rezervasyon kartları, tarih ve durum filtresi, pansiyon/masa tipi etiketi, onayla/reddet/iptal et aksiyonları, durum bazlı WhatsApp taslağı ve oda/masa bağlantı bilgisini içerir. Rezervasyon onaylandığında bağlı oda/masa `reserved` durumuna alınır; reddedilen, iptal edilen veya tamamlanan rezervasyon bağlı kaynakları uygun hale getirebilir.

---

## TASK-0508 — QR menü yönetim ekranını oluştur

Amaç:

Firma ürünlerini ve fiyatlarını PC üzerinden yönetmek.

Özellikler:

```text
Kategori ekle
Ürün ekle
Fiyat güncelle
Ürün aktif/pasif
Menüyü web’e yayınla
QR menü önizle
```

Kabul kriterleri:

* Menü local SQLite’ta tutulmalı.
* Yayınla işlemi firma hosting mini API’ye veri göndermeli.
* Android tarafında detaylı menü düzenleme yapılmamalı.

Durum:

* Tamamlandı. Desktop `QR Menü` ekranı kategori ve ürün ekleme/düzenleme, fiyat güncelleme, aktif/pasif ve mevcut/öne çıkan ayarları, local SQLite kaydı, web modülüne yayınlama ve QR menü önizleme akışlarını içerir. Yayınlama `packages/sync-core` içindeki `pushMenu()` ile firma hosting mini API'ye gider; Android tarafında detaylı menü düzenleme yoktur.

---

## TASK-0509 — Günlük işler ekranını oluştur

Amaç:

İşletme sahibinin günlük takip işlerini PC uygulamasında görmesini ve hızlıca kapatmasını sağlamak.

Özellikler:

```text
Günlük iş kartları
Durum filtresi
Tamamla
İptal et
Yeniden aç
Bağlantılı rezervasyon/masa/oda bilgisi
```

Kabul kriterleri:

* Bekleyen işler açıkça görünmeli.
* İş tamamlandığında dashboard sayısı güncellenmeli.
* Durum değişiminde event oluşmalı.

Durum:

* Tamamlandı. Desktop `Günlük İşler` ekranı bekleyen/tamamlanan/iptal edilen iş filtresini, iş kartlarını, bağlantı bilgisini ve `Tamamla`, `İptal Et`, `Yeniden Aç` aksiyonlarını içerir. Durum değişikliği SQLite'a yazılır; tamamlanan işlerde `task.completed`, iptal edilen işlerde `task.cancelled`, yeniden açma gibi diğer geçişlerde `task.status_changed` event kaydı oluşturulur.

---

## TASK-0510 — Müşteri bilgileri ekranını oluştur

Amaç:

İşletme sahibinin müşteri bilgilerini, iletişim kısayollarını ve geçmiş talepleri PC uygulamasında görmesini sağlamak.

Özellikler:

```text
Müşteri listesi
Ad, telefon ve etiket araması
Müşteri detay kartı
Telefon / WhatsApp kısayolları
Son talepler
Rezervasyon geçmişi
```

Kabul kriterleri:

* Webden gelen talepler müşteri kaydıyla bağlanmalı.
* Müşteri ekranında talep ve rezervasyon geçmişi görülebilmeli.
* Telefon veya WhatsApp kısayolu tek tıkla açılabilmeli.

Durum:

* Tamamlandı. Desktop `Müşteriler` ekranı müşteri listesi, arama, detay kartı, etiketler, telefon/WhatsApp kısayolları, son talep mesajları ve rezervasyon geçmişini içerir. Webden çekilen talepler SQLite `customers` tablosuna bağlanır ve dashboard veri hattında müşteri bilgileriyle birlikte döner.

---

## TASK-0511 — Basit raporlar ekranını oluştur

Amaç:

İşletme sahibinin talepler, rezervasyonlar, kaynak durumu, müşteriler ve günlük işler için hızlı işletme özetini PC uygulamasında görmesini sağlamak.

Özellikler:

```text
Talep dönüşüm oranı
Yanıt bekleyen talep sayısı
Rezervasyon onay oranı
Oda ve masa kullanım özeti
Günlük iş tamamlama oranı
Kritik iş odağı
Kayıt dağılımı
```

Kabul kriterleri:

* Raporlar local dashboard verisinden hesaplanmalı.
* İnternet bağlantısı veya merkezi cloud gerektirmemeli.
* İşletme sahibinin günlük öncelikleri tek ekranda anlaşılmalı.

Durum:

* Tamamlandı. Desktop `Raporlar` ekranı talep dönüşümü, yanıt bekleyen kayıtlar, rezervasyon onayı, oda/masa kullanımı, günlük iş tamamlama oranı, durum dağılımları, kritik işler ve müşteri/menu kayıt özetlerini mevcut SQLite dashboard verisinden hesaplayarak gösterir.

---

## TASK-0512 — Masaüstü uygulama şifresi ve ekran kilidini ekle

Amaç:

İsteğe bağlı uygulama şifresiyle açılış ve ekran gizliliği sağlamak; unutulan şifrenin
web güvenlik anahtarıyla güvenli biçimde sıfırlanabilmesini sağlamak.

Kabul kriterleri:

* Şifre işlemleri Ayarlar > Temel Ayarlar bölümünden yönetilmeli ve şifre zorunlu olmamalı.
* Şifre belirlenmişse gerçek panel verileri yüklenmeden önce açılış kilidi gösterilmeli.
* Üst barda bildirim ikonunun yanında ekran kilidi bulunmalı.
* Kilit katmanı uygulama içeriğini tamamen kapatmalı; logo, bildirim sayısı ve kilit açma eylemini göstermeli.
* Şifre açıkken kilit yalnız doğru şifreyle açılmalı.
* Şifre unutulduğunda web güvenlik anahtarı ana süreçte doğrulanarak şifre kaldırılmalı.
* Açma ve kapama geçişleri düşük maliyetli olmalı ve azaltılmış hareket tercihini desteklemeli.

Durum:

* Tamamlandı. Masaüstüne tuzlu `scrypt` doğrulayıcısı, açılış veri kapısı, üst bar kilidi,
  tam ekran gizlilik katmanı, bildirim sayısı, şifreli/şifresiz açma akışı ve web güvenlik
  anahtarıyla sıfırlama eklendi. Şifre düz metin olarak saklanmaz; hatalı denemeler kısa
  süreli sınırlandırılır. Temel Ayarlar kartı şifre belirleme, değiştirme, kaldırma ve
  sıfırlama işlemlerini içerir.

---

# Faz 6 — Sync Core

## TASK-0601 — Sync core paketini oluştur

Amaç:

PC uygulaması ile firma hosting mini API arasındaki veri alışverişini yönetmek.

Klasör:

```text
packages/sync-core/
```

Fonksiyonlar:

```text
pullRequests()
pushMenu()
pullBusinessSettings()
markRequestSynced()
```

Kabul kriterleri:

* Mini API URL ve sync_secret ile çalışmalı.
* Hata durumlarında uygulama kilitlenmemeli.
* sync.failed event üretebilmeli.

Durum:

* Tamamlandı. `packages/sync-core` mini API URL ve `sync_secret` ile `pullRequests()`, `markRequestsSynced()` ve `pushMenu()` fonksiyonlarını sağlar. Hata durumları kullanıcıya sade mesajla döner; desktop sync IPC akışı başarıda `sync.completed`, hatada `sync.failed` event kaydı oluşturur.

---

## TASK-0602 — Web taleplerini PC’ye çekme akışını bağla

Amaç:

Web form taleplerinin PC uygulamasına düşmesini sağlamak.

Akış:

```text
PC uygulaması sync.php’ye istek atar.
Yeni talepler alınır.
SQLite requests tablosuna yazılır.
request.created veya sync.completed event oluşur.
Ana panel güncellenir.
```

Kabul kriterleri:

* Aynı talep iki kez eklenmemeli.
* İnternet yoksa sade hata gösterilmeli.
* Manuel “Güncelle” butonu bulunmalı.

Durum:

* Tamamlandı. Desktop ana ekrandaki `Web Taleplerini Çek` komutu web modülünden talepleri alır, SQLite `requests` tablosuna idempotent şekilde yazar, web tarafında synced işaretlemeyi dener ve sonucuna göre `sync.completed` veya `sync.failed` event kaydı oluşturur. Bağlantı hatasında local çalışma bozulmadan sade hata mesajı gösterilir.

---

## TASK-0603 — Menü yayınlama akışını bağla

Amaç:

PC’de düzenlenen QR menünün web tarafına gönderilmesini sağlamak.

Akış:

```text
PC menü verisini hazırlar.
Mini API’ye gönderir.
menu.published event oluşur.
QR menü sayfası güncel veriyi gösterir.
```

Kabul kriterleri:

* Yayınlama başarısı kullanıcıya gösterilmeli.
* Hata durumunda local kayıt kaybolmamalı.

Durum:

* Tamamlandı. Desktop `QR Menü` yayınlama akışı local menü verisini `pushMenu()` ile web modülüne gönderir, başarılı yayında local kayıtları synced işaretler, `menu.published` ve `sync.completed` event kayıtları oluşturur. Hata durumunda local SQLite kaydı korunur ve `sync.failed` event kaydı yazılır.

---

## TASK-0604 — Android operasyon özetini yayınlama akışını bağla

Amaç:

PC uygulamasındaki local oda, masa, rezervasyon ve günlük iş özetini Android companion uygulamasına güvenli şekilde taşımak.

Akış:

```text
PC dashboard verisinden Android snapshot oluşturur.
Mini API publish_android_snapshot aksiyonuna gönderir.
Web modülü android-snapshot.json dosyasına yazar.
Android android_summary cevabında operasyon özetini ve günlük işleri okur.
```

Kabul kriterleri:

* PC dışarıya port açmamalı.
* Android özeti sync_secret ile korunmalı.
* Snapshot yayınlama hatasında local SQLite verisi etkilenmemeli.

Durum:

* Tamamlandı. `packages/sync-core` içindeki `pushAndroidSnapshot()` PC dashboard özetini web modülündeki `publish_android_snapshot` aksiyonuna gönderir. Desktop ana panelde `Android'e Yayınla` komutu bulunur; mini API `android_summary` cevabına `operations` ve `daily_tasks` alanlarını ekler. Android uygulama bu snapshot üzerinden bugünkü işler, boş oda/masa ve bekleyen onay kartlarını gösterir.

---

# Faz 7 — AI Core

## TASK-0701 — AI core paketini oluştur

Amaç:

AI provider bağımsız temel yapıyı oluşturmak.

Klasör:

```text
packages/ai-core/
```

Bileşenler:

```text
providers/
prompts/
knowledge/
types/
```

Kabul kriterleri:

* Provider adapter mantığı kurulmalı.
* OpenAI uyumlu endpoint desteklenmeli.
* İleride farklı provider eklenebilir olmalı.

Durum:

* Tamamlandı. `packages/ai-core` provider bağımsız tipleri, OpenAI uyumlu adapter yüzeyini, web sohbet cevabı ve işletme sahibi cevap önerisi fonksiyonlarını içerir; provider kapalı veya hatalı olduğunda güvenli fallback davranışı korunur.

---

## TASK-0702 — Knowledge markdown okuyucu oluştur

Amaç:

Firma bilgi dosyalarını AI promptlarına dahil etmek.

Girdi:

```text
knowledge/firma.md
knowledge/odalar.md
knowledge/restoran.md
knowledge/menu.md
knowledge/sik-sorulan-sorular.md
```

Kabul kriterleri:

* Aktif dosyalar okunmalı.
* Çok uzun dosyalarda temel sınırlandırma yapılmalı.
* Eksik dosya sistemi bozmayacak şekilde ele alınmalı.

Durum:

* Tamamlandı. `packages/ai-core/knowledge/reader.ts` ve web modülü `chat.php` tarafındaki knowledge okuyucu firma markdown dosyalarını sınırlı uzunlukla okur; eksik dosyalar akışı bozmaz.

---

## TASK-0703 — Web AI sistem promptunu oluştur

Amaç:

Müşteriyle konuşacak AI davranışını standartlaştırmak.

Kurallar:

```text
Samimi ve kısa cevap ver.
Kesin rezervasyon onayı verme.
Müsaitlik ve fiyat için işletme sahibinin onayı gerektiğini belirt.
Eksik bilgileri iste.
Gerekirse talep formuna yönlendir.
```

Kabul kriterleri:

* Prompt markdown veya TS dosyası olarak saklanmalı.
* Firma bilgileri prompta eklenebilmeli.
* AI yanlış şekilde kesin onay vermemeli.

Durum:

* Tamamlandı. `packages/ai-core/prompts/web-chat.ts` ve web modülü sistem promptu kısa Türkçe cevap, bağlayıcı rezervasyon/fiyat onayı vermeme, eksik bilgileri isteme ve firma knowledge bağlamını kullanma kurallarını uygular.

---

## TASK-0704 — PC AI cevap önerisi fonksiyonunu oluştur

Amaç:

İşletme sahibine müşteri talebine göre cevap taslağı hazırlamak.

Girdi:

```text
Talep bilgileri
Firma bilgileri
Rezervasyon durumu
İstenen cevap tonu
```

Çıktı:

```text
WhatsApp için kısa cevap önerisi
Eksik bilgi listesi
Talep özeti
```

Kabul kriterleri:

* Cevap işletme sahibi adına bağlayıcı karar vermemeli.
* WhatsApp’a uygun kısa metin üretmeli.
* AI başarısız olursa manuel cevap akışı devam etmeli.

Durum:

* Tamamlandı. `packages/ai-core` içindeki `generateOwnerReplySuggestion()` desktop Electron IPC hattına bağlandı. Desktop talep kartlarında `AI Taslak Yenile` komutu seçili talep için özet ve WhatsApp cevap taslağı üretir, SQLite `requests.ai_summary` / `requests.ai_suggested_reply` alanlarını ve hazırlanan WhatsApp mesajını günceller. Provider ortam değişkenleri verilirse OpenAI uyumlu endpointten JSON taslak alınır; provider kapalıysa, hata dönerse, eksik JSON üretirse veya bağlayıcı onay dili kullanırsa yerel güvenli taslağa dönülür. Taslaklar bağlayıcı rezervasyon veya fiyat onayı vermez; Electron dışı önizlemede hata mesajı gösterilerek manuel WhatsApp akışı korunur. Gerçek provider bağlantısı ve cevap örneği `npm run smoke:ai-live` ile anahtar dosyaya yazılmadan denenebilir.

---

## TASK-0705 — AI bağlantısını masaüstü ayarlarından yönet ve web'e yayınla

Amaç:

Masaüstü ve web AI işlemlerinin aynı kullanıcı tarafından yönetilen bağlantı ayarını kullanmasını sağlamak.

Özellikler:

```text
Servis hazır ayarı ve özel OpenAI uyumlu adres
Model ve zaman aşımı
Başlangıçta geri okunmayan güvenli API anahtarı
Masaüstü bağlantı testi
HTTPS ve sync_secret ile web'e yayınlama
Web yayın hatasında yerel ayarı koruma
```

Kabul kriterleri:

* API anahtarı renderer bootstrap verisine, loglara veya web widget'a dönmemeli; yalnız kullanıcının açık `Göster` eyleminde masaüstü Ayarlar ekranına aktarılmalı.
* Masaüstü AI çağrısı kaydedilmiş bağlantı bilgisini kullanmalı.
* Web `chat.php`, hostingde son başarıyla yayınlanan aynı bağlantı bilgisini kullanmalı.
* Canlı hostinge anahtar aktarımı HTTPS olmadan yapılmamalı; yalnız localhost geliştirme istisnası bulunmalı.
* Web yayın hatası yerel masaüstü ayarını geri almamalı.
* AI kapalıyken güvenli yerel ve web fallback akışları devam etmeli.

Durum:

* Tamamlandı. Masaüstü Ayarlar ekranına OpenAI/OpenRouter/Groq/Gemini/özel OpenAI uyumlu servis hazır seçimleri, bağlantı adresi, model, maskeli anahtar, 5–120 saniye zaman aşımı ve bağlantı testi eklendi. API anahtarı Electron `safeStorage` ile şifrelenerek SQLite'ta opaque değer olarak tutulur ve renderer başlangıç verisine eklenmez; yalnız kullanıcının `Göster` eyleminde ana süreçten alınır, yeniden gizlendiğinde gösterim kopyası temizlenir. Kaydetme `pushAiSettings()` ile ayarı HTTPS + header güvenlik anahtarı üzerinden web modülüne yollar; `sync.php` ayarı doğrudan erişime kapalı `data/ai-settings.local.php` dosyasına atomik ve `0600` izinle yazar. `chat.php` böylece masaüstüyle aynı bağlantıyı kullanır. Yerel kayıt, web yayını hata verse de korunur. Sync-core, desktop DB/renderer ve gerçek PHP + mock provider smoke testleri bu akışı doğrular.

---

## TASK-0706 — Uygulama web iletişimini canlı demo modülüne taşı

Amaç:

Masaüstü, demo web ve Android uygulamalarının varsayılan web modülünü canlı HTTPS
demo kurulumuna yönlendirmek; localhost geliştirme varsayımını kullanıcı akışından
çıkarmak.

Kabul kriterleri:

* Varsayılan modül adresi `https://yardimciasistan.alwaysdata.net/yardimci-asistan` olmalı.
* Eski localhost ve demo-site kök adresleri migration ile doğru alt yola taşınmalı.
* Canlı `sync.php` HTTPS üzerinden erişilebilir ve güvenlik anahtarıyla doğrulanmalı.
* Canlı güvenlik anahtarı kaynak koda veya dağıtım arşivine gömülmemeli.

Durum:

* Tamamlandı. Masaüstü seed/renderer/database varsayımları, demo web
  widget fallback'i ve Android bağlantı başlangıcı canlı modüle taşındı.
  `004_live_demo_web_module.sql` eski localhost ve Alwaysdata kök kayıtlarını doğru
  modül alt yoluna geçirir. Bu cihazdaki ayar ignored dağıtım anahtarıyla
  eşleştirilmiş ve canlı `pull_requests` isteği HTTP 200 ile doğrulanmıştır. Güncel
  demo web, `sync.php` ve `ai.php` dosyaları Alwaysdata'ya yedekli SSH dağıtımıyla
  aktarılmış; masaüstündeki `deepseek-v4-flash-free` ayarı canlı web modülüne
  yayınlanmış ve web sohbetinde `fallback=false` sonucuyla doğrulanmıştır.

---

## TASK-0707 — Masaüstü AI Yardımcı çalışma alanını oluştur

Amaç:

İşletme sahibinin kayıtlı AI bağlantısını günlük masaüstü işlerinde, sonucu görüp düzenleyerek kullanabileceği tek bir çalışma alanı sağlamak.

Özellikler:

```text
Cevap taslağı, talep özeti ve günlük değerlendirme çalışma türleri
Talep / müşteri bağlamı ve isteğe bağlı ek talimat
Düzenlenebilir AI sonucu
Kopyalama, talebe kaydetme ve WhatsApp'a hazırlama
SQLite üzerinde yerel çalışma geçmişi
Aktif servis, model ve web yayın durumu
Güvenli yerel fallback ve bağlayıcı karar sınırı
```

Kabul kriterleri:

* AI Yardımcı yan menüden bağımsız sayfa olarak açılmalı.
* Talep gerektiren çalışma türleri seçili kayıt bağlamıyla üretilmeli.
* Kullanıcı üretilen metni kaydetmeden veya göndermeden önce düzenleyebilmeli.
* Sonuçlar API anahtarını içermeden yerel geçmişe yazılmalı.
* AI kapalı veya hatalıysa manuel akış güvenli yerel sonuçla devam etmeli.
* AI kesin rezervasyon, müsaitlik veya fiyat onayı vermemeli.

Durum:

* Tamamlandı. Masaüstüne üç çalışma türü, talep bağlamı, ek talimat, düzenlenebilir sonuç alanı, talebe kaydetme, WhatsApp'a hazırlama ve yerel geçmiş içeren AI Yardımcı sayfası eklendi. Electron IPC çağrıları ayarlarda kayıtlı bağlantıyı kullanır; `ai_conversations` geçmişinde provider/model/fallback metadatası tutulur ve gizli anahtar renderer'a aktarılmaz. Yanıt üretimi güvenli JSON akışını, özet ve günlük değerlendirme ayrı sistem talimatlarını kullanır; provider çalışmadığında bağlayıcı olmayan yerel sonuçlar döner. AI core birim testi, SQLite smoke testi ve Playwright masaüstü kullanıcı akışı bu davranışları doğrular.

---

# Faz 8 — WhatsApp Bridge

## TASK-0801 — WhatsApp bridge paketini oluştur

Amaç:

WhatsApp işlemlerini sistemin geri kalanından bağımsız hale getirmek.

Klasör:

```text
packages/whatsapp-bridge/
```

Modlar:

```text
wa_link
manual_copy
webview
official_api_future
```

Kabul kriterleri:

* İlk sürümde wa_link ve manual_copy çalışmalı.
* WebView modu desktop içinde bağlanabilir olmalı.
* Resmi API modu sadece adapter yeri olarak hazırlanmalı.

Durum:

* Tamamlandı. `packages/whatsapp-bridge` wa_link, manual_copy, WebView hedef aksiyonu ve resmi API future fallback yüzeyini sağlar.

---

## TASK-0802 — WhatsApp link üreticisini yaz

Amaç:

Telefon numarası ve mesajdan WhatsApp linki üretmek.

Fonksiyon:

```text
createWhatsAppLink(phone, message)
```

Kabul kriterleri:

* Türkiye telefon numarasıyla çalışmalı.
* Mesaj encode edilmeli.
* Boş telefon veya mesaj durumları ele alınmalı.

Durum:

* Tamamlandı. `createWhatsAppLink()` doğrulama sonucu, `createWhatsAppUrl()` doğrudan UI URL'i döndürür.

---

## TASK-0803 — Desktop WhatsApp WebView ekranını oluştur

Amaç:

Electron içinde WhatsApp Web’i göstermek.

Özellikler:

```text
WhatsApp Web alanı
Bağlantı durumu
QR ile giriş
Hazır mesajı kopyala
Müşteri numarasına git
```

Kabul kriterleri:

* WhatsApp çalışmazsa diğer ekranlar etkilenmemeli.
* Kullanıcıya sade bağlantı durumu gösterilmeli.
* Manuel kopyalama alternatifi bulunmalı.

Durum:

* Tamamlandı. Desktop uygulamada WhatsApp sayfası, WebView alanı, bağlantı durumu, müşteri numarasına gitme, dışarıda açma ve manuel hazır mesaj kopyalama akışı bulunur.

---

# Faz 9 — Android Companion

## TASK-0901 — Android app iskeletini oluştur

Amaç:

Android companion uygulamasının temel yapısını oluşturmak.

Klasör:

```text
apps/android-app/
```

Kabul kriterleri:

* Uygulama açılmalı.
* Yardımcı Asistan marka ekranı bulunmalı.
* Ana ekran iskeleti görünmeli.

Durum:

* Tamamlandı. `apps/android-app` native Android iskeleti, Yardımcı Asistan marka ekranı ve imzalı debug APK build akışı içerir.

---

## TASK-0902 — Android ana durum ekranını oluştur

Amaç:

İşletme sahibinin telefondan hızlı durum görmesini sağlamak.

Kartlar:

```text
Yeni Talepler
Bugünkü İşler
Boş Odalar
Boş Masalar
Bekleyen Onaylar
```

Kabul kriterleri:

* Sade ve büyük dokunma alanları olmalı.
* Detaylı ayar bulunmamalı.
* UI_RULES ile uyumlu olmalı.

Durum:

* Tamamlandı. Android ana ekranında yeni talepler, bugünkü işler, boş odalar, boş masalar ve bekleyen onaylar için büyük dokunma alanlı özet kartları bulunur. Bugünkü işler, oda/masa ve bekleyen rezervasyon özetleri PC uygulamasından web modülüne yayınlanan Android snapshot verisinden okunur; bağlantı yoksa demo snapshot gösterilir.

---

## TASK-0903 — Android talepler ekranını oluştur

Amaç:

Yeni müşteri taleplerini telefondan görmek.

Özellikler:

```text
Talep listesi
Talep detay kartı
Ara
WhatsApp’tan yaz
Onayla
Reddet
Cevaplandı işaretle
```

Kabul kriterleri:

* Kritik işlemler kolay anlaşılır olmalı.
* Fiyat/menü düzenleme gibi işler olmamalı.
* Telefon ve WhatsApp kısayolları çalışmalı.

Durum:

* Tamamlandı. Android ana ekranı web modülündeki `android_summary` aksiyonundan canlı talep listesini, operasyon özetini ve PC'den yayınlanan günlük iş listesini çeker; seçili talep detay kartını gösterir ve ara/WhatsApp kısayollarını seçili müşteri telefonuna göre günceller. Onayla, Reddet ve Cevaplandı işlemleri `update_request_status` aksiyonuyla web modülündeki talep durumunu kalıcı olarak günceller; bağlantı yoksa aynı akış demo kayıtları üzerinde güvenli şekilde denenebilir.

---

## TASK-0904 — Android bağlantı modlarını tasarla

Amaç:

Android’in PC veya firma hosting mini API ile nasıl haberleşeceğini netleştirmek.

Modlar:

```text
Yerel ağ modu
Hosting üzerinden sınırlı takip modu
```

Kabul kriterleri:

* İlk sürümde en basit çalışan bağlantı modu seçilmeli.
* Dış takipte sadece gerekli özet veriler gösterilmeli.
* Güvenlik anahtarı desteği olmalı.

Durum:

* Tamamlandı. İlk sürüm modu `hosting_limited` olarak seçildi; Android uygulaması web modül adresi ve sync anahtarını uygulama içinde alır, kaynak koda anahtar yazmadan `android_summary` üzerinden sınırlı özet çeker. Yerel ağ modu sonraki faz kapsamı olarak `docs/dev/ANDROID_CONNECTION_PLAN.md` içinde belgelendi.

---

## TASK-0905 — Android yönetici / personel cihaz yetkilerini ekle

Amaç:

Tek APK kullanılırken Android cihazların rol ve işlem yetkilerini yalnız masaüstünden
yönetmek; Android UI'ını etkili profile göre sadeleştirirken gerçek güvenlik kontrolünü
masaüstü action apply katmanında yapmak.

Özellikler:

```text
Kalıcı Android device_id, cihaz adı ve uygulama sürümü
Masaüstü android_devices tablosu, admin preset'i ve staff görev paketleri
Ayarlar içinde Android Cihazlar listesi ve rol/aktiflik işlemleri
Android snapshot içinde cihaz bazlı effective permissions
Yetkisiz Android butonlarını gizleme
Her action için masaüstü aktiflik ve permission kontrolü
```

Kabul kriterleri:

* Bilinmeyen cihaz ilk özet veya action temasında aktif staff olarak kaydedilmeli.
* Staff sipariş açabilmeli, ürün ekleyebilmeli ve hesabı beklemeye alabilmeli; ödendi/kapat yapamamalı.
* Admin cihaz desteklenen tüm Android operasyonlarını yapabilmeli.
* Pasif cihazın hiçbir action'ı yerel veriye uygulanmamalı.
* Rol Android'den değiştirilememeli; masaüstü değişikliği sonraki snapshot'ta UI'a yansımalı.
* Action queue idempotency ve otomatik senkron davranışı korunmalı.

Durum:

* Tamamlandı. Personel cihaz yetkileri masaüstünde teknik izin listesi yerine Servis /
  Sipariş, Kasa / Hesap, Oda / Günlük İşler ve Müşteri / Rezervasyon görev paketleriyle
  yönetilir. Yeni personel cihazlar Servis / Sipariş ile Oda / Günlük İşler açık olarak
  başlar; paket seçimleri `permissions_json` üretir. Yönetici tüm izinleri almaya, Android
  UI etkili izinlere göre aksiyonları gizlemeye ve masaüstü action apply katmanı nihai
  aktiflik/izin/veri durumu kontrolünü yapmaya devam eder.

---

## TASK-0906 — Masaüstü ve Android yönetici kayıt silme akışlarını ekle

Amaç:

Talep, müşteri, menü kategorisi/ürünü ve hazır mesajları masaüstünden; aynı kayıtları
Android'de yalnız yönetici cihazdan güvenli biçimde silebilmek.

Kabul kriterleri:

* Tüm silmeler SQLite `deleted_at` alanıyla soft-delete olmalı ve event üretmeli.
* Kategori silme bağlı ürünleri de silmeli.
* Müşteri silme talep ve rezervasyon geçmişini koruyup müşteri bağlarını kaldırmalı.
* Hazır mesaj silme talebi korurken mesaj kaydı ve talepteki hazır cevap alanlarını temizlemeli.
* Android personel UI'ında silme yüzeyleri görünmemeli ve action apply katmanı rolü yeniden doğrulamalı.
* Hostingdeki eski web talebi silme sonrası Android özetinde yeniden görünmemeli.

Durum:

* Tamamlandı. Masaüstü IPC/UI silme eylemleri, Android yönetici detay eylemleri ve silmeye
  özel menü görünümü eklendi. Yeni action/permission sözleşmeleri masaüstü tarafından
  fail-closed uygulanır. Android snapshot `admin_menu` ile tam silme listesini,
  `deleted_request_ids` ile hosting birleşim tombstone'larını taşır. SQLite smoke testi,
  Android unit/debug derlemesi ve gerçek PHP otomatik senkron smoke testi kapsamı eklendi.

---

# Faz 10 — Kurulum ve Paketleme

## TASK-1001 — Firma web modülü kurulum dokümanını yaz

Amaç:

Mevcut web sitesine Yardımcı Asistan modülünü nasıl ekleyeceğimizi anlatmak.

İçerik:

```text
Dosyalar nereye kopyalanacak?
Config nasıl düzenlenecek?
Widget nasıl eklenecek?
AI key nereye yazılacak?
WhatsApp numarası nasıl ayarlanacak?
Dosya izinleri ne olmalı?
```

Kabul kriterleri:

* Teknik bilgisi orta seviye olan biri takip edebilmeli.
* WordPress ve düz HTML site için notlar olmalı.

Durum:

* Tamamlandı. Mevcut web sitesi için dosya kopyalama, config, widget, AI key, WhatsApp, izinler, WordPress ve düz HTML notları `docs/WEB_MODULE_INSTALLATION.md` içinde belgelendi.
* `npm run pack:web-module` web widget bundle'ını günceller, web modül dosyalarını doğrular ve hosting paneline yüklenebilecek `artifacts/web-module-deploy/yardimci-asistan/` klasörünü manifest, canlı kurulum uyarıları ve arşiv çıktılarıyla üretir. `YARDIMCI_ASISTAN_DEPLOY_*` ortam değişkenleriyle kaynak template'i değiştirmeden deploy paketindeki firma ayarları doldurulabilir.

---

## TASK-1002 — Demo site özelleştirme dokümanını yaz

Amaç:

Web sitesi olmayan firmalara demo sitenin nasıl uyarlanacağını anlatmak.

İçerik:

```text
Logo değiştirme
Renk değiştirme
Firma bilgisi değiştirme
Fotoğraf ekleme
Oda ekleme
Menü ekleme
WhatsApp numarası ekleme
```

Kabul kriterleri:

* Adım adım anlatım olmalı.
* Teknik terimler azaltılmalı.

Durum:

* Tamamlandı. Demo site firma bilgisi, renk, görsel, oda, menü ve WhatsApp özelleştirme adımları `docs/DEMO_SITE_CUSTOMIZATION.md` içinde belgelendi.

---

## TASK-1003 — Desktop installer hazırlığını yap

Amaç:

PC uygulamasının kurulabilir hale gelmesi için altyapı hazırlamak.

İçerik:

```text
Windows installer
Uygulama veri klasörü
SQLite dosya konumu
Yedekleme klasörü
İlk kurulum sihirbazı
```

Kabul kriterleri:

* Windows hedeflenmeli.
* Kurulum sonrası uygulama ilk ayar ekranıyla açılmalı.

Durum:

* Tamamlandı. Desktop uygulama `electron-builder` konfigürasyonu ile Windows NSIS hedefi ve Linux paket dizini üretebilir. `npm run smoke:desktop-package` Linux'ta paketlenmiş `app.asar` içinde Electron main/preload/database, renderer ve SQL migration/seed dosyalarının bulunduğunu doğrular; ayrıca paketli `linux-unpacked` uygulamayı Xvfb altında açıp geçici `YA_DESKTOP_DATA_DIR` içinde SQLite veri dosyası ve `backups/` klasörü oluştuğunu kontrol eder. Uygulama yeni kurulumda ilk ayar ekranını açar; SQLite ve manuel yedekler işletim sistemi kullanıcı veri klasörü altında tutulur. `smoke-desktop-menu-db` manuel yedek dosyasını ayrıca SQLite olarak açar, `PRAGMA integrity_check` sonucunu ve temel firma/ayar/oda/masa/talep verilerini doğrular.

---

## TASK-1004 — İlk kurulum sihirbazını tasarla

Amaç:

Firma sahibinin veya kurulum yapan kişinin temel ayarları kolayca girmesini sağlamak.

Adımlar:

```text
Firma bilgileri
Sektör tipi
Aktif modüller
WhatsApp numarası
Web modül adresi
Sync güvenlik anahtarı
AI ayarları
Oda/masa ilk kurulum
```

Kabul kriterleri:

* Teknik terimler azaltılmalı.
* AI ayarları opsiyonel olmalı.
* Ayarlar sonradan değiştirilebilir olmalı.

Durum:

* Tamamlandı. Desktop uygulamada firma bilgileri, sektör tipi, modüller, WhatsApp, web
  modül adresi, sync anahtarı, opsiyonel AI, ilk oda sayısı ve kullanıcı tanımlı
  `kategori adı + masa adedi` satırları için kurulum sihirbazı bulunur; Ayarlar menüsünden
  yeniden açılabilir. Kategori değişiklikleri aktif adisyon ve rezervasyonlara bağlı
  masaları koruyarak yerel SQLite kayıtlarına uygulanır.
  `npm run smoke:table-categories` kategori yeniden adlandırma, adet azaltma/artırma,
  yinelenen ad doğrulaması ve aktif adisyon korumasını doğrular.

---

# Faz 11 — İlk Uçtan Uca Demo

## TASK-1101 — Demo akışını hazırla

Amaç:

Satışta veya testte gösterilecek ilk uçtan uca senaryoyu oluşturmak.

Senaryo:

```text
Demo web sitesinde müşteri talep formu doldurur.
WhatsApp mesajı hazırlanır.
Talep mini API’ye kaydedilir.
PC uygulaması talebi çeker.
Talep PC’de görünür.
AI cevap önerisi hazırlanır.
WhatsApp mesajı kopyalanır veya WebView’de açılır.
Rezervasyon onaylanır.
Android ekranında özet görünür.
```

Kabul kriterleri:

* Demo verileri hazırlanmalı.
* Tüm adımlar çalışır olmalı.
* Hata durumlarında sistem kilitlenmemeli.

Durum:

* Tamamlandı. `npm run smoke:demo-flow` demo web taleplerini yükler, çalışan `request.php` üzerinden ek bir `source=web_form` talep oluşturur, çalışan `chat.php` üzerinden ek bir `source=web_ai` talep oluşturur, yanlış sync anahtarı hatasını, Android canlı özetini, Android durum güncellemesini, PC SQLite'a talep çekmeyi, müşteri kaydı oluşturmayı, synced işaretlemeyi, AI cevap taslağını, talebi rezervasyona çevirip onaylamayı, Android operasyon snapshot yayınını ve ikinci kez çekmeme akışını doğrular. Demo web formu API varsa kayıt dener, API yoksa WhatsApp hazır mesaj akışı devam eder. `npm run smoke:local-demo` web modülü, PC demo veri akışı, desktop UI ve bağlı Android cihaz UI testini tek demo provasında koşturur; telefonsuz hızlı deneme için `-- --skip-android` kullanılabilir. `npm run smoke:android-hosting` cihazsız Android hosting hazırlığını, `npm run smoke:android-device-ui` adb bağlı gerçek cihaz UI akışını doğrular. Gerçek AI provider cevabı `npm run smoke:ai-live` ile ortam değişkenlerinden denenir; test artık yalnız bağlantıyı değil Türkçe işletme bağlamı, bağlayıcı olmayan cevap dili ve provider JSON taslak kalitesini de kontrol eder.

---

## TASK-1102 — Demo veri setini oluştur

Amaç:

Uygulamayı boş değil, gerçekçi örnek verilerle göstermek.

Veriler:

```text
Örnek firma
Örnek odalar
Örnek masalar
Örnek menü
Örnek müşteriler
Örnek talepler
Örnek rezervasyonlar
Örnek AI cevapları
```

Kabul kriterleri:

* Veriler pansiyon + restoran modunu gösterebilmeli.
* Gerçek kişi bilgisi kullanılmamalı.
* Demo veriler kolay sıfırlanabilir olmalı.

Durum:

* Tamamlandı. Web modülü demo talepleri `demo-data/web-module-requests.json` içinde tutulur; `npm run demo:data:apply` ile yüklenir ve `npm run demo:data:clear` ile sıfırlanır. Desktop demo seed'i oda, masa, menü, müşteri, talep, rezervasyon, günlük iş ve WhatsApp taslağı örneklerini içerir.

---

# Faz 12 — Test ve Kontrol

## TASK-1201 — Web form testlerini oluştur

Test edilecekler:

```text
Boş form
Eksik telefon
Yanlış telefon
Pansiyon talebi
Restoran talebi
WhatsApp mesaj üretimi
Mini API kayıt
Mini API hatası durumunda WhatsApp devamı
```

Durum:

* Tamamlandı. `scripts/smoke-web-form-api.mjs` boş form, eksik telefon, yanlış telefon, pansiyon talebi, restoran talebi, WhatsApp mesaj üretimi ve mini API kaydını doğrular; test sonunda `requests.json` eski haline alınır. Demo web e2e testi API bağlantısı yokken WhatsApp hazır mesaj akışının devam ettiğini doğrular.

---

## TASK-1202 — PC sync testlerini oluştur

Test edilecekler:

```text
Yeni talep çekme
Aynı talebi tekrar çekmeme
Bağlantı hatası
Yanlış sync secret
Menü yayınlama
Sync başarısız olunca local çalışma
```

Durum:

* Tamamlandı. `packages/sync-core` testleri endpoint, pull, mark, menü yayınlama, Android operasyon snapshot yayınlama ve bağlantı hatası dönüşlerini kapsar. `npm run smoke:demo-flow` yeni talep çekme, yanlış sync secret, Android summary, Android operasyon snapshot, synced işaretleme ve aynı talebi tekrar çekmeme akışını doğrular. `smoke:desktop-renderer` ana paneldeki `Web Taleplerini Çek` kullanıcı akışını boş listeden yeni web talebi kartına kadar kontrol eder. `smoke:desktop:linux` local SQLite menü/dönüşüm işlemlerinin web sync başarısına bağımlı olmadığını doğrular.

---

## TASK-1203 — AI davranış testlerini oluştur

Test edilecekler:

```text
AI kesin rezervasyon onayı vermemeli
AI eksik bilgileri istemeli
AI fiyat konusunda dikkatli davranmalı
AI firma bilgisi dışına çıkmamalı
AI hata durumunda sade mesaj dönmeli
```

Durum:

* Tamamlandı. `packages/ai-core/tests/ai-core.test.cjs` kesin rezervasyon/fiyat onayı vermeme guardrail'lerini, eksik bilgi istemeyi, firma bilgisi dışı tahmin yürütmeme sınırını, provider hata fallback'ini, owner cevap önerisinin onay sınırını, provider JSON taslak kullanımını ve unsafe provider cevabında yerel güvenli fallback'e dönmeyi doğrular.

---

## TASK-1204 — WhatsApp akış testlerini oluştur

Test edilecekler:

```text
WhatsApp link doğru açılıyor mu?
Mesaj encode ediliyor mu?
Telefon formatı doğru mu?
Manual copy çalışıyor mu?
WebView açılıyor mu?
WhatsApp çalışmazsa sistem devam ediyor mu?
```

Durum:

* Tamamlandı. `packages/whatsapp-bridge` testleri WhatsApp link üretimi, mesaj encode, Türkiye telefon formatı, manual copy, WebView hedefi ve resmi API/fallback yüzeyini doğrular. Demo web e2e ve desktop renderer smoke hazır mesaj/manuel kopyalama akışlarını kapsar.

---

## TASK-1205 — Manuel müşteri kartı ve müşteri-oda konaklama yönetimi

Kapsam:

```text
Masaüstü ve yönetici Android'de manuel müşteri oluşturma/düzenleme
Kimlik kartı ve pasaport alanları
Geçici kimlik görselinden AI alan önerisi
Müşteriyi doğrudan odaya atama
Planlı → giriş → çıkış / iptal yaşam döngüsü
Kalıcı müşteri-oda konaklama arşivi
Çakışma, oda kapasitesi ve rol/yetki korumaları
```

Durum:

* Tamamlandı. `021_customer_room_management.sql` kimlik alanlarını ve
  `customer_room_stays` arşivini ekler; masaüstü müşteri kartları ve pansiyon ekranı
  manuel kayıt, atama ve durum yönetimini sunar. Kimlik görseli
  `api/identity-image-analysis.php` üzerinden geçici işlenir ve kullanıcı kontrolünden
  sonra alanlara aktarılır. Android müşteri kartı, kimlik OCR'ı ve konaklama arşivi
  yalnız aktif `admin` + `customer.manage` profiline açılır; oda ataması ayrıca
  `room.assign_customer` ister. `npm run smoke:customer-room-management`,
  `npm run smoke:stock-image-analysis` ve Android smoke testi veri yaşam döngüsü,
  görsel gizliliği, kapasite/çakışma ve personel erişim engelini doğrular.

---

# Öncelikli İlk Codex Görevleri

Codex ile ilk çalışma sırası şu olmalıdır:

```text
1. TASK-0001 — Monorepo klasör yapısını oluştur
2. TASK-0002 — Kök README dosyasını oluştur
3. TASK-0101 — Shared package iskeletini oluştur
4. TASK-0201 — Demo web sitesi iskeletini oluştur
5. TASK-0202 — Demo firma config yapısını oluştur
6. TASK-0301 — Web widget iskeletini oluştur
7. TASK-0303 — Talep formu bileşenini oluştur
8. TASK-0304 — WhatsApp hazır mesaj üreticisini yaz
9. TASK-0401 — Web module klasör yapısını oluştur
10. TASK-0402 — request.php talep alma endpointini oluştur
```

Bu ilk 10 görev tamamlandığında web tarafının temel omurgası oluşmuş olur.

## Codex Komut Örneği

Codex’e görev verirken şu format kullanılmalıdır:

```text
docs/PROJECT_BRIEF.md, docs/ARCHITECTURE.md, docs/CODEX_RULES.md, docs/UI_RULES.md, docs/DATA_MODEL.md, docs/EVENTS.md ve docs/TASKS.md dosyalarını oku.

TASK-0304 görevini uygula:
WhatsApp hazır mesaj üreticisini yaz.

Kurallar:
- API key veya gizli bilgi ekleme.
- Telefon numarasını WhatsApp formatına çevir.
- Mesaj sonunda "Lütfen bilgileri kontrol edip gönder tuşuna basın." ifadesi olsun.
- Değişen dosyaları ve test şeklini raporla.
```

## Görev Tamamlama Formatı

Her görev sonunda Codex şu formatta rapor vermelidir:

```text
Tamamlanan görev:
Değişen dosyalar:
Eklenen özellikler:
Nasıl test edilir:
Eksik / sonraki adım:
```

## Kapanış

Bu görev planı, Yardımcı Asistan v1’in kontrollü ve modüler şekilde geliştirilmesini sağlamak için hazırlanmıştır.

Yeni özellik eklenmeden önce şu sorular sorulmalıdır:

```text
Bu özellik v1 için gerekli mi?
Bu özellik sistemi gereksiz karmaşıklaştırıyor mu?
Bu özellik merkezi cloud bağımlılığı oluşturuyor mu?
Bu özellik küçük işletme sahibinin işini gerçekten kolaylaştırıyor mu?
```

Cevaplar uygun değilse özellik ertelenmelidir.
