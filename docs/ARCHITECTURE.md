# Yardımcı Asistan — Sistem Mimarisi

## Genel Mimari

Yardımcı Asistan v1 merkezi cloud servisine bağımlı olmayacaktır.

Sistem firma bazlı bağımsız kurulum mantığıyla çalışacaktır.

Genel yapı:

```text
Firma Web Sitesi / Demo Site
        ↓
Yardımcı Asistan Web Modülü
        ↓
Firmanın Hostingindeki Mini API
        ↓
Local PC Uygulaması
        ↓
Android Companion
```

## Ana Sistem Bileşenleri

### 1. Demo Web Sitesi

Web sitesi olmayan firmalar için hazır şablon web sitesidir.

İçerikler firmaya göre özelleştirilebilir:

* Firma adı
* Logo
* Renkler
* Fotoğraflar
* Pansiyon bilgileri
* Restoran/kafe bilgileri
* Menü
* Konum
* WhatsApp numarası
* İletişim bilgileri

Demo web sitesi Yardımcı Asistan web modülüyle birlikte gelir.

### 2. Web Entegrasyon Modülü

Mevcut web sitesi olan firmalar için gömülebilir modüldür.

Fonksiyonları:

* Rezervasyon / bilgi formu
* WhatsApp hazır mesaj
* AI sohbet kutusu
* QR menü bağlantısı
* İletişim butonu
* Talep oluşturma

Modül mümkün olduğunca kolay entegre edilmelidir.

Örnek entegrasyon:

```html
<script src="/yardimci-asistan/widget.js"></script>
```

### 3. Firma Hosting Mini API

Her firmanın kendi hostinginde çalışan küçük API katmanıdır.

Bu yapı merkezi cloud yerine kullanılır.

Görevleri:

* Form verilerini almak
* Talep kayıtlarını tutmak
* WhatsApp mesaj metni oluşturmak
* AI provider ile güvenli şekilde konuşmak
* API key bilgisini frontend’den gizlemek
* QR menü verilerini sunmak
* PC uygulamasının yeni talepleri çekmesini sağlamak

Örnek klasör yapısı:

```text
/yardimci-asistan/
  widget.js
  api/
    chat.php
    request.php
    menu.php
    sync.php
  config/
    business.json
    ai.php
  data/
    requests.json
    menu.json
    sync-state.json
  knowledge/
    firma.md
    odalar.md
    restoran.md
    menu.md
    sik-sorulan-sorular.md
```

İlk sürümde PHP + JSON veya PHP + SQLite kullanılabilir.

Ama yapı ileride Node.js veya farklı backend teknolojilerine taşınabilir şekilde tasarlanmalıdır.

### 4. Local PC Uygulaması

PC uygulaması işletmenin ana yönetim merkezidir.

Teknoloji tercihi:

* Electron
* React
* SQLite
* Local-first çalışma
* WebView ile WhatsApp Web entegrasyonu

PC uygulaması şunları yönetir:

* Odalar
* Masalar
* Rezervasyonlar
* Müşteri talepleri
* QR menü
* WhatsApp cevapları
* AI cevap önerileri
* Günlük notlar
* Basit raporlar

PC uygulaması web sitesinden gelen talepleri firmanın hostingindeki mini API’den çeker.

Doğru bağlantı yönü:

```text
PC Uygulaması → Firma Hosting Mini API → Yeni talepleri çeker
```

Yanlış bağlantı yönü:

```text
Web Sitesi → Direkt PC’ye bağlanır
```

PC’ye dışarıdan port açılmamalıdır.

### 5. Android Companion

Android uygulama masaüstü uygulamanın hafif yardımcısıdır.

Android uygulama karmaşık yönetim ekranları içermemelidir.

Ana işlevleri:

* Yeni talepleri görmek
* Rezervasyon onaylamak / reddetmek
* Müşteriyi aramak
* WhatsApp’tan yazmak
* Oda ve masa durumunu görmek
* Günlük işleri takip etmek
* Bildirimleri göstermek

Android uygulama iki modda çalışabilir:

#### Yerel Ağ Modu

Telefon ve PC aynı Wi-Fi ağındaysa Android doğrudan PC uygulamasına bağlanabilir.

```text
Android → Local PC
```

#### Hosting Üzerinden Sınırlı Takip

Firma sahibi dışarıdaysa Android firmanın hostingindeki mini API üzerinden sınırlı bilgi alabilir.

```text
Android → Firma Hosting Mini API
```

Bu modda sadece gerekli özet bilgiler gösterilir.

### 6. AI Adapter

AI sistemi provider bağımsız olmalıdır.

Desteklenebilecek provider tipleri:

* OpenAI
* Gemini
* Groq
* OpenRouter
* Local model
* İleride başka providerlar

Web sitesi AI istekleri doğrudan frontend’den provider’a gitmemelidir.

Doğru akış:

```text
Web Widget
  ↓
Firma Hosting Mini API
  ↓
AI Provider
```

PC uygulaması da AI istekleri için aynı adapter mantığını kullanır.

AI görevleri:

* Müşteri sorularını cevaplamak
* Firma bilgi dosyalarını kullanmak
* Eksik rezervasyon bilgilerini istemek
* Talebi özetlemek
* WhatsApp cevabı hazırlamak
* Günlük işleri özetlemek

AI kesin rezervasyon onayı vermez.

### 7. WhatsApp Bridge

WhatsApp entegrasyonu ayrı bir modül olarak tasarlanmalıdır.

İlk sürümde Electron WebView içinde WhatsApp Web kullanılacaktır.

Modlar:

* Manual copy mode
* Assisted send mode
* WhatsApp WebView mode
* Official API mode, future

WhatsApp çalışmazsa sistemin geri kalanı çalışmaya devam etmelidir.

### 8. QR Menü

QR menü web üzerinden yayınlanır.

PC uygulaması menüyü yönetir.

Hosting mini API menüyü müşterilere sunar.

Akış:

```text
PC’de menü güncellenir
  ↓
Firma Hosting Mini API’ye senkronize edilir
  ↓
Müşteri QR kod ile güncel menüyü görür
```

### 9. Senkronizasyon

Senkronizasyon merkezi cloud üzerinden değil, firma hostingi ve local PC arasında yapılır.

Temel senkron akışları:

```text
Web Form → Hosting Mini API → PC Uygulaması
PC Menü Güncelleme → Hosting Mini API → QR Menü
PC Talep Durumu → Hosting Mini API → Android özet ekranı
```

PC uygulaması offline çalışabilmelidir.

İnternet geldiğinde veriler senkronize edilmelidir.

## Mimari Kurallar

1. Merkezi cloud servisi zorunlu olmayacak.
2. Her firma bağımsız kurulum mantığıyla çalışacak.
3. API key frontend içine konmayacak.
4. PC’ye dışarıdan port açılmayacak.
5. PC uygulaması local-first olacak.
6. Web sitesi PC kapalıyken çalışmaya devam edecek.
7. AI opsiyonel olacak.
8. WhatsApp opsiyonel olacak.
9. Android companion sade tutulacak.
10. Modüller birbirinden bağımsız çalışabilecek şekilde tasarlanacak.

## Ana Veri Akışı

Müşteri web sitesinden bilgi talebi oluşturduğunda:

```text
1. Müşteri web sitesine girer.
2. Web formu doldurur veya AI ile konuşur.
3. Talep firmanın hostingindeki mini API’ye kaydedilir.
4. WhatsApp hazır mesajı müşterinin cihazında açılır.
5. Firma sahibi WhatsApp’tan mesajı alabilir.
6. PC uygulaması açıldığında yeni talepleri hostingden çeker.
7. Talep PC uygulamasında görünür.
8. Android companion gerekli özetleri gösterir.
9. Firma sahibi müşteriye arama veya WhatsApp ile dönüş yapar.
```

## Nihai v1 Mimari Tanımı

Yardımcı Asistan v1; merkezi cloud servisi olmayan, firma hostingine kurulabilen, local PC merkezli, Android companion destekli, AI API uyumlu, WhatsApp WebView destekli ve web sitesine modül olarak entegre edilebilen bağımsız işletme asistanı paketidir.
