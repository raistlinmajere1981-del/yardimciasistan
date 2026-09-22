> **Historical note — Application Platform v2 Stage 0**
>
> This document records general product design principles; it may describe the previous desktop UI baseline.
> For desktop interaction, workspace, drawer, Settings, or appearance decisions that conflict with the Application Platform v2 target architecture,
> `docs/architecture/APPLICATION_ARCHITECTURE_CONSTITUTION_V1.md` is the target authority.
> For domain behavior, use `docs/architecture/DOMAIN_DECISIONS_V1.md`.

# Yardımcı Asistan — UI Kuralları

Bu doküman Yardımcı Asistan projesindeki tüm arayüzlerin ortak tasarım dilini tanımlar.

Bu kurallar demo web sitesi, web widget, masaüstü uygulaması ve Android companion uygulaması için geçerlidir.

## Genel Tasarım Felsefesi

Yardımcı Asistan teknik bir otomasyon programı gibi görünmemelidir.

Kullanıcıya şu hissi vermelidir:

* Kolay
* Sade
* Yardımcı
* Güvenilir
* Yorucu olmayan
* Göz korkutmayan
* Günlük işlere destek olan

Arayüzler özellikle küçük işletme sahipleri düşünülerek tasarlanmalıdır. Kullanıcıların teknik bilgiye sahip olduğu varsayılmamalıdır.

## Ana Tasarım Cümlesi

Yardımcı Asistan, işletme sahibinin işlerini kolaylaştıran sade bir dijital yardımcıdır.

Bu nedenle arayüzlerde karmaşık teknik terimler, geliştirici dili, fazla ayar, gereksiz grafik ve yoğun veri görünümü kullanılmamalıdır.

## Dil ve Ton

Arayüz dili Türkçe olmalıdır.

Dil samimi ama ciddiyetsiz olmamalıdır.

Kullanıcıya yardımcı olan, kısa ve net ifadeler tercih edilmelidir.

Yanlış örnek:

```text
Senkronizasyon başarısız oldu. HTTP 500 internal server error.
```

Doğru örnek:

```text
Bağlantı sırasında bir sorun oldu. İnternet bağlantısını kontrol edip tekrar deneyin.
```

Yanlış örnek:

```text
Reservation request status updated.
```

Doğru örnek:

```text
Rezervasyon talebi güncellendi.
```

## Teknik Terimlerden Kaçınma

Aşağıdaki teknik ifadeler kullanıcı ekranlarında mümkün olduğunca kullanılmamalıdır:

* API
* Sync
* Endpoint
* Token
* JSON
* Provider
* Webhook
* Database
* Cache
* Client
* Server
* Error code

Bunların yerine daha anlaşılır ifadeler kullanılmalıdır.

Örnekler:

```text
API bağlantısı → Bağlantı ayarı
Sync → Güncelleme / Eşitleme
Token → Güvenlik anahtarı
Provider → Servis sağlayıcı
Database → Kayıt alanı
```

## Görsel Dil

Yardımcı Asistan genel amaçlı bir işletme asistanıdır.

Logo ve ana tasarım dili restoran, pansiyon, otel veya kafe ile sınırlı olmamalıdır.

Restoran ve pansiyon ilk desteklenen sektörlerdir, ancak marka dili ileride farklı sektörlere de uyumlu olmalıdır.

## Renk Kullanımı

Arayüzde yumuşak, sıcak ve güven veren renkler kullanılmalıdır.

Önerilen ana karakter:

* Krem / açık zemin
* Yumuşak yeşil
* Sıcak turuncu veya mercan vurgu
* Koyu lacivert / koyu gri metin
* Hafif gölgeler
* Yuvarlatılmış kartlar

Renkler kullanıcıyı yormamalıdır.

Çok parlak, neon veya agresif renklerden kaçınılmalıdır.

## Durum Renkleri

Durum göstergeleri sade ve tutarlı olmalıdır.

Önerilen anlamlar:

```text
Yeşil  → Uygun / Boş / Tamamlandı
Sarı   → Bekliyor / Onay gerekli
Kırmızı → Sorun / İptal / Dikkat
Mavi   → Bilgi / Yeni kayıt
Gri    → Pasif / Kapalı / Kullanılmıyor
```

Renk tek başına anlam taşımamalıdır. Yanında mutlaka yazı veya ikon da olmalıdır.

Yanlış:

```text
Sadece sarı nokta
```

Doğru:

```text
Sarı etiket + "Onay bekliyor"
```

## Tipografi

Yazılar okunabilir ve sade olmalıdır.

Başlıklar kısa olmalıdır.

Paragraflar arayüz içinde uzun olmamalıdır.

Buton metinleri eylemi açıkça anlatmalıdır.

Yanlış buton:

```text
İşlem
```

Doğru butonlar:

```text
Talebi Onayla
Müşteriyi Ara
WhatsApp’tan Yaz
Menüyü Güncelle
Odayı Boşalt
```

## Genel Yerleşim

Arayüzler kart tabanlı olmalıdır.

Özellikle masaüstü ve Android uygulamada ana ekran şu mantıkla çalışmalıdır:

* Bugün ne var?
* Yeni ne geldi?
* Ne bekliyor?
* Hangi işlem gerekli?

Kullanıcı uygulamayı açtığında ilk bakışta günlük durumu anlamalıdır.

## Dashboard Mantığı

Ana ekranda fazla detay olmamalıdır.

Öncelik sırası:

1. Yeni talepler
2. Bugünkü rezervasyonlar
3. Oda / masa durumu
4. Bekleyen onaylar
5. Hızlı işlemler
6. Günlük notlar

Dashboard bir rapor ekranı değil, hızlı karar ekranıdır.

## Masaüstü Uygulama UI Kuralları

Masaüstü uygulama işletmenin ana yönetim ekranıdır.

Bu nedenle Android’e göre daha fazla özellik içerebilir, ama yine de karmaşık olmamalıdır.

### Masaüstü Ana Menü

Sol tarafta sade bir menü kullanılabilir.

Önerilen menü yapısı:

```text
Ana Ekran
Talepler
Rezervasyonlar
Odalar
Masalar
QR Menü
WhatsApp
AI Yardımcı
Raporlar
Ayarlar
```

Firma sadece pansiyon modundaysa masa ekranı gizlenebilir.

Firma sadece restoran modundaysa oda ekranı gizlenebilir.

### Masaüstü Ana Ekran Kartları

Ana ekranda şu kartlar olabilir:

```text
Yeni Talepler
Bugünkü İşler
Oda Durumu
Masa Durumu
Bekleyen Rezervasyonlar
WhatsApp Hazır Cevaplar
```

### Masaüstü İşlem Prensibi

Her kritik işlemde kullanıcıya kısa onay gösterilmelidir.

Örnek:

```text
Bu rezervasyonu onaylamak istiyor musunuz?
```

Ama her küçük işlemde kullanıcıyı yoran onaylar çıkmamalıdır.

Talep, müşteri, menü kategorisi/ürünü ve hazır mesaj silme düğmeleri tehlikeli işlem
görünümünde olmalı ve her zaman hedef kaydı açıklayan ayrı bir onay istemelidir. Kategori
onayı bağlı kaç ürünün de silineceğini, müşteri onayı ise geçmiş talep ve rezervasyonların
korunacağını açıkça söylemelidir.

## Android Companion UI Kuralları

Android uygulama sade olmalıdır.

Android uygulama masaüstünün küçük kopyası değildir.

Android uygulamanın ana görevi hızlı takip ve hızlı aksiyondur.

Masaüstündeki Android cihaz yönetiminde personel için teknik izin adları veya yalnız izin
sayısı gösterilmemelidir. Bunun yerine Servis / Sipariş, Kasa / Hesap, Oda / Günlük İşler
ve Müşteri / Rezervasyon görev alanları seçilebilir olmalıdır. Yönetici cihazda görev
alanları yerine `Tüm yetkiler açık` bilgisi gösterilebilir.

Android'de kayıt silme yüzeyleri yalnız aktif ve rolü çözümlenmiş yönetici cihazda
gösterilmelidir. Personel cihazda ilgili izin yanlışlıkla görünse bile silme düğmesi veya
Menü silme sekmesi açılmamalıdır. Yönetici menü yüzeyi yalnız kategori/ürün silmeye yarar;
fiyat, içerik veya geniş menü düzenleme alanları içermez.

### Android’de Olması Gerekenler

* Yeni talepler
* Bugünkü işler
* Oda özeti
* Masa özeti
* Rezervasyon onay / red
* Ara
* WhatsApp’tan yaz
* Bildirimler
* Yönetici için talep, müşteri, hazır mesaj ve menü kayıtlarını silme

### Android’de Olmaması Gerekenler

* Detaylı fiyat güncelleme
* Geniş menü düzenleme
* Firma ayarları
* AI bilgi dosyası düzenleme
* Kapsamlı raporlar
* Ana operasyon ekranlarının içinde teknik bağlantı ayarları
* Karmaşık stok yönetimi

### Android Ana Ekran

Android ana ekran mümkünse tek bakışta anlaşılmalıdır.

Bağlantı adresi ve güvenlik anahtarı yalnız ayrı, küçük bir Ayarlar ekranında tutulabilir.
Bu ekranda teknik hata kodları yerine bağlantı durumu, son güncelleme ve bekleyen işlem
durumu kullanıcı dostu ifadelerle gösterilmelidir.

Örnek kartlar:

```text
Yeni Talepler: 3
Bugünkü Girişler: 2
Boş Odalar: 5
Boş Masalar: 8
Bekleyen Onay: 1
```

Her kart tıklanabilir olabilir.

## Web Sitesi UI Kuralları

Demo web sitesi sıcak, sade ve güven veren bir tasarıma sahip olmalıdır.

Web sitesi işletmenin vitrini olduğu için görsel kalite önemlidir.

Ama web sitesi çok ağır, yavaş veya animasyon dolu olmamalıdır.

### Demo Web Sitesi Sayfaları

Önerilen sayfalar:

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

### Web Sitesi Ana CTA

Ana çağrı butonları net olmalıdır:

```text
WhatsApp’tan Yaz
Rezervasyon Talebi Oluştur
Bilgi Al
Menüyü Gör
```

## Web Widget UI Kuralları

Web widget mevcut sitelere kolayca eklenebilmelidir.

Widget mevcut sitenin tasarımını tamamen bozmamalıdır.

Widget küçük, sade ve güven veren bir şekilde görünmelidir.

Önerilen widget parçaları:

* Sağ altta küçük Yardımcı Asistan butonu
* Açılır sohbet / form penceresi
* WhatsApp butonu
* Rezervasyon formu

Widget açıldığında kullanıcıyı boğmamalıdır.

İlk ekranda en fazla 3 ana seçenek gösterilmelidir:

```text
Rezervasyon Talebi
Bilgi Al
WhatsApp’tan Yaz
```

## Form Tasarımı

Formlar kısa tutulmalıdır.

İlk ekranda çok fazla alan gösterilmemelidir.

Talep türüne göre alanlar dinamik açılmalıdır.

Örnek ilk alanlar:

```text
Talep Türü
Ad Soyad
Telefon
Tarih
Kişi Sayısı
Not
```

Pansiyon seçilirse:

```text
Giriş Tarihi
Çıkış Tarihi
Yetişkin Sayısı
Çocuk Sayısı
Oda Tercihi
```

Restoran seçilirse:

```text
Tarih
Saat
Kişi Sayısı
Masa Tercihi
```

## WhatsApp Mesaj Ekranı

Müşteri formu doldurduktan sonra WhatsApp açılmadan önce veya buton altında kısa bilgi verilmelidir.

Önerilen metin:

```text
WhatsApp açıldığında mesajınız hazır olarak gelecektir. Bilgileri kontrol edip gönder tuşuna basmanız yeterlidir.
```

Hazır mesaj sonunda da şu ifade yer alabilir:

```text
Lütfen bilgileri kontrol edip gönder tuşuna basın.
```

## AI Sohbet UI Kuralları

AI sohbet kullanıcıyı teknik bir bot deneyimiyle karşılamamalıdır.

AI kendini doğal ve yardımcı şekilde tanıtmalıdır.

Örnek başlangıç mesajı:

```text
Merhaba, size bilgi ve rezervasyon talebi konusunda yardımcı olabilirim. Ne hakkında bilgi almak istersiniz?
```

AI kesin karar veren bir yetkili gibi davranmamalıdır.

Rezervasyon ve fiyat gibi konularda şu tarz ifadeler kullanılmalıdır:

```text
Talebinizi işletmeye iletebilirim. Müsaitlik ve detaylar işletme sahibi tarafından kontrol edilip size dönüş yapılacaktır.
```

## Masaüstü AI Ayarları

Masaüstü Ayarlar ekranındaki AI alanı, teknik olmayan kullanıcıya hangi servisin kullanılacağını anlaşılır biçimde seçtirmelidir.

Gösterilecek temel bilgiler:

```text
AI yardımcı açık / kapalı
Servis seçimi
Bağlantı adresi
Model adı
Gizli erişim anahtarı
Yanıt bekleme süresi
Bağlantıyı dene
Web sitesine uygula durumu
```

Gizli erişim anahtarı kayıttan sonra ekrana geri basılmamalıdır. Bunun yerine `Anahtar kayıtlı` bilgisi gösterilmeli; boş alan mevcut anahtarı korumalı ve silme işlemi ayrıca seçilmelidir.

Yerel kayıt ile web sitesine uygulama sonucu ayrı anlatılmalıdır. Web bağlantısı kurulamazsa kullanıcıya yerel ayarın kaybolmadığı ve daha sonra yeniden deneyebileceği söylenmelidir.

## Masaüstü AI Yardımcı Çalışma Alanı

AI Yardımcı menüsü sohbet ekranı gibi davranmamalı; işletme sahibinin mevcut kayıtlarla çalıştığı, sonucu kontrol edip düzenleyebildiği bir üretim alanı olmalıdır.

Çalışma türleri:

```text
Cevap taslağı — seçili talep için WhatsApp'a uygun yanıt
Talebi özetle — eksikleri ve önemli noktaları çıkaran iç not
Günü değerlendir — açık işler, riskler ve öncelikler
```

Ekranın üstünde bağlantının açık/kapalı durumu, aktif model ve web yayın durumu gösterilmelidir. Talep gerektiren çalışma türlerinde müşteri bağlamı görünür olmalı; isteğe bağlı ek talimat teknik prompt terimleri kullanılmadan sunulmalıdır.

AI sonucu her zaman düzenlenebilir olmalıdır. Kullanıcı sonucu kopyalayabilmeli, ilgili talebe kaydedebilmeli ve cevap taslağını WhatsApp ekranına hazırlayabilmelidir. Son çalışmalar yerel geçmişte gösterilir; geçmiş kaydı seçildiğinde kullanılan model, üretim zamanı ve fallback durumu korunur.

Sonuç alanında şu sınır sürekli görünür olmalıdır:

```text
AI kesin rezervasyon, müsaitlik veya fiyat onayı vermez.
Son karar ve gönderim her zaman işletme sahibindedir.
```

AI bağlantısı kapalı veya servis hatalı olduğunda ekran kullanılmaz hâle gelmemeli; güvenli yerel taslak/özet üretilmeli ve bunun yerel sonuç olduğu açıkça belirtilmelidir.

## Boş Durum Ekranları

Boş ekranlar kullanıcıyı endişelendirmemelidir.

Yanlış:

```text
Kayıt bulunamadı.
```

Doğru:

```text
Henüz yeni talep yok.
```

veya:

```text
Bugün için bekleyen rezervasyon görünmüyor.
```

## Hata Mesajları

Hata mesajları kısa, anlaşılır ve çözüm odaklı olmalıdır.

Yanlış:

```text
Request failed with status code 403.
```

Doğru:

```text
Bağlantı izni alınamadı. Ayarlarınızı kontrol edip tekrar deneyin.
```

Yanlış:

```text
AI provider response error.
```

Doğru:

```text
AI cevabı alınamadı. Biraz sonra tekrar deneyin.
```

## Başarı Mesajları

Başarı mesajları kısa olmalıdır.

Örnekler:

```text
Talep kaydedildi.
Rezervasyon onaylandı.
Menü güncellendi.
Müşteri notu eklendi.
WhatsApp mesajı hazırlandı.
```

## İkon Kullanımı

İkonlar basit ve anlaşılır olmalıdır.

Aynı ikon farklı anlamlarda kullanılmamalıdır.

Önerilen ikon anlamları:

```text
Telefon → Ara
WhatsApp → WhatsApp’tan yaz
Takvim → Rezervasyon
Yatak → Oda
Masa → Masa
Zil → Bildirim
Robot / yıldız → AI Yardımcı
Menü → QR Menü
```

## Erişilebilirlik

Arayüz okunabilir olmalıdır.

* Yazılar küçük olmamalıdır.
* Butonlar mobilde kolay basılabilir olmalıdır.
* Kontrast yeterli olmalıdır.
* Sadece renkle bilgi verilmemelidir.
* Kritik işlemlerde açık metin kullanılmalıdır.

## Responsive Tasarım

Web modülü mobil öncelikli tasarlanmalıdır.

Çünkü müşterilerin çoğu web sitesine telefondan girecektir.

Masaüstü görünüm güzel olmalı ama mobil deneyim önceliklidir.

## Animasyon Kullanımı

Animasyonlar az ve sade olmalıdır.

Animasyonlar sistemi yavaş veya oyuncak gibi göstermemelidir.

Önerilen:

* Hafif açılma/kapanma
* Buton hover
* Kart geçişleri
* Yumuşak bildirim çıkışı

Kaçınılacak:

* Sürekli hareket eden öğeler
* Fazla parlak efektler
* Gereksiz yükleme animasyonları
* Kullanıcıyı bekleten gösterişli geçişler

## UI Bileşenleri

Ortak bileşenler mümkünse shared UI mantığıyla tasarlanmalıdır.

Örnek bileşenler:

```text
StatusBadge
InfoCard
ActionButton
RequestCard
ReservationCard
RoomCard
TableCard
CustomerCard
EmptyState
ConfirmDialog
ToastMessage
```

## Öncelikli Kullanıcı Akışları

Tasarımda ilk optimize edilecek kullanıcı akışları:

1. Müşteri web formu doldurur ve WhatsApp mesajı açılır.
2. Web talebi PC uygulamasında görünür.
3. İşletme sahibi talebi inceler.
4. AI cevap önerisi oluşturur.
5. İşletme sahibi WhatsApp’tan müşteriye döner.
6. Rezervasyon onaylanır.
7. Android uygulamada bekleyen işler görülür.

## Kapanış Kuralı

Yardımcı Asistan arayüzleri her zaman şu soruya göre tasarlanmalıdır:

```text
Bu ekran küçük bir işletme sahibinin işini gerçekten kolaylaştırıyor mu?
```

Cevap hayırsa ekran sadeleştirilmeli veya özellik ertelenmelidir.
