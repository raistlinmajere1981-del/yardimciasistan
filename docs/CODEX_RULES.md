# Yardımcı Asistan — Codex Çalışma Kuralları

Bu dosya Codex CLI ile çalışırken her görevde referans alınmalıdır.

## Genel Çalışma Kuralı

Kod yazmadan önce mevcut dokümanlar okunmalıdır:

* docs/PROJECT_BRIEF.md
* docs/ARCHITECTURE.md
* docs/CODEX_RULES.md
* docs/UI_RULES.md
* docs/DATA_MODEL.md
* docs/TASKS.md

Eğer yapılacak görev bu dokümanlardan biriyle çelişiyorsa, kod yazmadan önce doküman güncellenmelidir.

## Proje Kimliği

Ürün adı Yardımcı Asistan’dır.

Ürün tek bir firmaya özel değil, farklı küçük işletmelere kurulabilecek genel bir sistemdir.

İlk hedef sektörler:

* Pansiyon
* Restoranlı pansiyon
* Restoran
* Kafe

Logo ve tema restoran veya pansiyonla sınırlı olmamalıdır. Ürün genel bir yardımcı asistan olarak konumlandırılmalıdır.

## Mimari Kısıtlar

Merkezi cloud sistemi geliştirilmeyecektir.

Zorunlu merkezi lisans sistemi geliştirilmeyecektir.

Her firma kendi hostingi ve kendi local PC uygulaması ile bağımsız çalışacaktır.

PC uygulaması ana yönetim merkezi olacaktır.

Firma web sitesi veya demo site PC kapalıyken de çalışmalıdır.

Web AI sistemi PC’ye bağımlı olmamalıdır.

## Güvenlik Kuralları

AI API key frontend koduna yazılmayacaktır.

AI API key tarayıcıdan görülebilir olmayacaktır.

API key firma hostingindeki backend/config tarafında tutulacaktır.

PC uygulamasına dışarıdan erişim için modem port yönlendirme zorunlu tutulmayacaktır.

PC’ye dışarıdan direkt bağlantı kurulmayacaktır.

Web sitesi, PC’ye direkt istek atmayacaktır.

Doğru bağlantı yönü:

```text
PC → Firma Hosting Mini API
```

Yanlış bağlantı yönü:

```text
Web Sitesi → PC
```

## AI Kuralları

AI provider bağımsız tasarlanacaktır.

AI kesin rezervasyon onayı vermemelidir.

AI kesin müsaitlik garantisi vermemelidir.

AI kesin fiyat bilgisi ancak firma ayarında açıkça izin verilmişse verebilir.

Varsayılan davranış:

```text
Talebinizi aldım. İşletme sahibi müsaitlik ve detayları kontrol edip size dönüş yapacak.
```

AI bilgi dosyaları markdown formatında tutulacaktır.

Örnek bilgi dosyaları:

```text
knowledge/firma.md
knowledge/odalar.md
knowledge/restoran.md
knowledge/menu.md
knowledge/sik-sorulan-sorular.md
knowledge/rezervasyon-kurallari.md
```

AI’nin görevi:

* Bilgi vermek
* Eksik bilgi istemek
* Talep oluşturmak
* Talebi özetlemek
* Cevap taslağı hazırlamak

AI’nin görevi olmayan şeyler:

* Kesin rezervasyon yapmak
* Kendi başına ödeme almak
* Müsaitlik garantisi vermek
* İşletme sahibi adına bağlayıcı karar almak

## WhatsApp Kuralları

WhatsApp entegrasyonu sistemin çekirdeği değildir.

WhatsApp bozulursa sistem çalışmaya devam etmelidir.

İlk desteklenecek modlar:

* WhatsApp hazır mesaj linki
* Manual copy mode
* Electron WebView içinde WhatsApp Web
* Assisted send mode

İleride resmi WhatsApp API desteği eklenebilir, ancak v1 için zorunlu değildir.

WhatsApp mesajlarında son onay kullanıcıya bırakılmalıdır.

Müşteri tarafında hazır mesaj açıldığında müşteriye şu anlamda bilgilendirme yapılmalıdır:

```text
Bilgileri kontrol edip gönder tuşuna basın.
```

## PC Uygulaması Kuralları

PC uygulaması local-first çalışmalıdır.

Temel veriler SQLite üzerinde tutulmalıdır.

İnternet yokken çalışması gerekenler:

* Oda takibi
* Masa takibi
* Rezervasyonlar
* Müşteri notları
* Günlük işler
* Menü düzenleme, en azından local olarak

İnternet geldiğinde senkronize edilebilecekler:

* Web talepleri
* QR menü verileri
* AI istekleri
* Android özet verileri

## Android Kuralları

Android companion sade tutulmalıdır.

Android uygulama masaüstü uygulamanın küçültülmüş kopyası olmayacaktır.

Android’de olmaması gerekenler:

* Detaylı fiyat güncelleme
* Geniş menü düzenleme
* Firma ayarları
* AI bilgi dosyası düzenleme
* Kapsamlı raporlar
* Teknik yapılandırma

Android’de olması gerekenler:

* Yeni talepler
* Onay / red
* Ara
* WhatsApp’tan yaz
* Oda durumu
* Masa durumu
* Bugünkü işler
* Bildirimler

## Web Modül Kuralları

Web modülü hem demo siteye hem mevcut web sitelerine entegre edilebilir olmalıdır.

Web modülün ana fonksiyonları:

* Talep formu
* WhatsApp hazır mesaj
* AI sohbet
* QR menü linki
* Firma bilgisi gösterimi

Web modülü mümkün olduğunca az bağımlılıkla çalışmalıdır.

Mevcut sitelere kolay eklenebilmelidir.

## UI Kuralları

Arayüzler teknik görünmemelidir.

Kullanıcı profili teknik bilgiye sahip olmayabilir.

Tasarım prensipleri:

* Büyük butonlar
* Az metin
* Net renkler
* Kolay durum takibi
* Geri alınabilir işlemler
* Onay gerektiren kritik işlemler
* Mobilde sade ekranlar
* PC’de ana panel mantığı
* Türkçe, samimi ve anlaşılır arayüz dili

## Kodlama Kuralları

Kod modüler yazılmalıdır.

Tek bir dosyada büyük karmaşık yapılar oluşturulmamalıdır.

Her modül ayrı sorumluluğa sahip olmalıdır.

Tekrarlanan tipler shared package içine alınmalıdır.

AI provider, WhatsApp provider, sync provider gibi yapılar adapter mantığıyla yazılmalıdır.

Örnek modül mantığı:

```text
ai-core/
  providers/
  prompts/
  knowledge/
  types/

whatsapp-bridge/
  webview/
  manual/
  official-api-future/

sync-core/
  pull/
  push/
  conflict-resolution/
```

## Codex Görev Kuralı

Codex’e tek seferde büyük görev verilmemelidir.

Yanlış görev:

```text
Tüm Yardımcı Asistan sistemini geliştir.
```

Doğru görev:

```text
Demo web sitesinde kullanılacak rezervasyon formu bileşenini oluştur.
```

veya

```text
Firma hosting mini API için request.php dosyasını oluştur. Gelen form verisini doğrula, kaydet ve JSON cevap döndür.
```

Her görev sonunda:

* Hangi dosyalar değişti?
* Ne eklendi?
* Nasıl test edilir?
* Eksik kalan ne var?

bilgisi verilmelidir.

## İlk Geliştirme Önceliği

İlk geliştirme sırası:

1. Demo web sitesi iskeleti
2. Web widget tasarımı
3. Talep formu
4. WhatsApp hazır mesaj üretici
5. Firma hosting mini API
6. Talep kayıt sistemi
7. PC uygulaması ana panel tasarımı
8. Web taleplerini PC’ye çekme
9. Android companion ana ekranı
10. AI sohbet ve cevap önerisi

## Değişmez v1 Kararları

* Merkezi cloud yok.
* Lisans sistemi yok.
* PC local-first.
* Web AI PC’ye bağımlı değil.
* AI API key frontend’de yok.
* WhatsApp API zorunlu değil.
* WebView WhatsApp destekli.
* Android sade companion.
* Web modül mevcut sitelere entegre edilebilir.
* Demo site web sitesi olmayan firmalar için kullanılabilir.
