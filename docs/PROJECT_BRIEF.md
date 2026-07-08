# Yardımcı Asistan — Proje Özeti

## Ürün Tanımı

Yardımcı Asistan, küçük işletmeler için geliştirilen, web sitesi, masaüstü uygulaması, Android yardımcı uygulaması, yapay zeka desteği ve WhatsApp entegrasyonu ile çalışan modüler bir dijital asistan sistemidir.

Ürün ilk aşamada pansiyon, restoranlı pansiyon, restoran ve kafe işletmelerine odaklanacaktır. Ancak marka ve mimari genel kullanım için tasarlanacaktır. İleride farklı sektörlere yeni yetenekler eklenerek genişletilebilir.

## Ürün Adı

Yardımcı Asistan

## Ana Fikir

Yardımcı Asistan, firmalara maaş istemeyen, yorulmayan, sürekli çalışan bir yardımcı gibi sunulacaktır.

Sistem işletmenin müşteri taleplerini toplamasına, rezervasyonları takip etmesine, masa ve oda durumlarını yönetmesine, müşterilere daha hızlı cevap vermesine ve günlük işleri daha düzenli yürütmesine yardımcı olur.

## Temel Hedef

Küçük işletmelerin teknik bilgiye ihtiyaç duymadan kullanabileceği, sade, anlaşılır, düşük maliyetli ve modüler bir otomasyon sistemi geliştirmek.

## İlk Hedef Sektörler

* Pansiyon
* Restoranlı pansiyon
* Restoran
* Kafe

## Ana Kullanıcılar

### İşletme Sahibi

Sistemin ana kullanıcısıdır. Teknik bilgiye sahip olması beklenmez. Arayüzler çok sade ve kolay anlaşılır olmalıdır.

### İşletme Personeli

Masa, oda, müşteri talebi ve rezervasyon takibi gibi basit işlemleri yapabilir.

### Müşteri

Web sitesi veya entegre web modülü üzerinden bilgi alır, form doldurur, AI asistanla konuşur ve WhatsApp üzerinden işletmeye ulaşır.

## Ürün Parçaları

Yardımcı Asistan v1 şu ana parçalardan oluşur:

1. Demo web sitesi
2. Mevcut web sitelerine entegre edilebilir web modülü
3. Firma hostinginde çalışan mini API
4. Local PC masaüstü uygulaması
5. Android companion uygulaması
6. AI adapter sistemi
7. WhatsApp WebView entegrasyonu
8. QR menü
9. Oda ve masa takibi
10. Rezervasyon ve müşteri talep yönetimi

## Merkezi Cloud Kullanılmayacak

Yardımcı Asistan v1 merkezi bir cloud servisine bağımlı olmayacaktır.

Her firma kendi hostingi, kendi web modülü, kendi PC uygulaması ve kendi Android uygulamasıyla bağımsız çalışacaktır.

Böylece merkezi sistemde yaşanacak bir arıza tüm firmaları etkilemez.

## Firma Hosting Mini Modülü

Her firma için web sitesine veya hostingine küçük bir Yardımcı Asistan modülü kurulacaktır.

Bu modül şunları yapar:

* Web form taleplerini alır
* Talepleri kaydeder
* WhatsApp hazır mesajı oluşturur
* Web AI isteklerini yönetir
* AI API anahtarını tarayıcıdan gizler
* QR menü verilerini yayınlar
* PC uygulamasının talepleri çekmesine izin verir

## PC Uygulaması

PC uygulaması işletmenin ana yönetim merkezi olacaktır.

Ana görevleri:

* Oda takibi
* Masa takibi
* Rezervasyon takibi
* Web taleplerini çekme
* QR menü yönetimi
* Müşteri bilgileri
* WhatsApp WebView entegrasyonu
* AI cevap önerileri
* Günlük notlar
* Basit raporlar

PC uygulaması internet olmasa bile temel işletme yönetimini sürdürebilmelidir.

## Android Companion

Android uygulaması PC uygulamasının küçük ve sade yardımcısıdır.

Android uygulamada büyük ayarlar, fiyat güncelleme, detaylı menü yönetimi gibi karmaşık işler olmayacaktır.

Android uygulamanın görevi:

* Yeni talepleri göstermek
* Rezervasyonları onaylamak veya reddetmek
* Müşteriyi aramak
* WhatsApp’tan yazmak
* Oda ve masa durumunu görmek
* Bugünkü işleri takip etmek

## AI Kullanımı

AI iki yerde kullanılacaktır:

### Web AI

Müşteri web sitesinde AI ile konuşabilir. AI firma bilgilerine göre cevap verir, eksik bilgileri ister ve talep oluşturur.

AI kesin rezervasyon onayı vermez. Müsaitlik, fiyat ve özel kararlar için işletme sahibinin onayı gerektiğini belirtir.

### PC AI

İşletme sahibine yardımcı olur. Gelen talebi özetler, eksik bilgileri gösterir, WhatsApp cevabı hazırlar ve günlük işleri düzenler.

## WhatsApp Kullanımı

WhatsApp entegrasyonu ilk etapta Electron içindeki WebView üzerinden WhatsApp Web ile yapılacaktır.

WhatsApp API uyumluluğu mimaride desteklenecektir, ancak zorunlu olmayacaktır.

Kullanım modları:

* WhatsApp hazır mesaj
* Manual copy mode
* WhatsApp WebView mode
* İleride resmi WhatsApp API mode

## Ana Ürün Prensibi

Hiçbir modül sistemin tamamını kilitlememelidir.

AI kapalıysa sistem çalışmalıdır.

WhatsApp çalışmazsa sistem çalışmalıdır.

PC kapalıysa web sitesi, form ve web AI çalışmalıdır.

İnternet yoksa PC uygulamasındaki temel oda, masa ve rezervasyon yönetimi çalışmalıdır.

## v1 Hedefi

Yardımcı Asistan v1, demo web sitesi veya mevcut site entegrasyonu üzerinden müşteri talebi toplayabilen, AI destekli bilgi verebilen, WhatsApp iletişimini kolaylaştıran, PC uygulamasıyla işletme yönetimi sağlayan ve Android uygulamasıyla temel takip sunan bağımsız bir işletme asistanı paketi olacaktır.
