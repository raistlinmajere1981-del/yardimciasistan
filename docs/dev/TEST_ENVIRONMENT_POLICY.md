# Yardımcı Asistan — Test ortamı ve veri politikası

**Karar tarihi:** 2026-11-01
**Karar sahibi:** Proje sahibi
**Geçerlilik:** Proje sahibi açıkça gerçek kullanım / müşteri verisi dönemine geçildiğini ilan edene kadar.

## Temel ayrım

**Projemize ait Alwaysdata üzerinden alınan/yönetilen bütün alan adları, gerçek üretim değil geliştirme, gösterim ve pilot test ortamıdır.** Dışarıdan HTTPS ile erişilebilir olmaları veya işletme adı/logo/katalog taşımaları, onları gerçek ticari ortam yapmaz.

Buna demo ana alan adı, test alanı ve **Teknikel Kombi test sitesi** dahildir. Bu siteler gerçek satış, gerçek müşteri siparişi, gerçek para tahsilatı veya korunması gereken işletme kayıtları için **kullanılmayacak**. Gerçek işletmeler ancak kendi asıl alan adlarına geçtikten ve proje sahibi gerçek kullanımı açıkça başlattıktan sonra üretim ortamına sahip olacak.

Teknikel test sitesini mevcut alınmış ürün kataloğuyla, görsellerle, **demo müşteriler, demo bayi hesapları ve test siparişleriyle** doldurmak özellikle beklenen test faaliyetidir. Site ayarları ve verileri senaryoları çalıştırmak için değiştirilebilir; test sonrasında temizlenebilir ve yeniden oluşturulabilir. Sırf dışarıya açık diye gerçek müşteri sisteminin kısıtlarını uygulama.

## Tek çalışan kopya dönemi — geliştirme serbestliği

- Masaüstü Electron, Companion/Bayi APK, telefon, yerel SQLite veritabanları, test web modülleri, demo kullanıcılar/oturumlar ve yayınlanan test kayıtları **tamamen geçici ve silinebilir**. Test gerektiğinde temiz kurulum, `pm clear`, test veritabanı sıfırlama, katalog yeniden içe aktarma, sepet/sipariş/veri yeniden oluşturma yapılabilir.
- **Eski test verisini korumak için** migration zinciri, eski şema uyumluluğu, startup backfill, yeni yedekleme/rollback/arşivleme katmanı, release-to-release veri taşıma veya her değişiklikten önce yedek üretme **tasarlanmayacak ve işi bloke etmeyecek**. Yeni şema doğrudan tek kanonik şemaya uygulanabilir; test verisi sıfırlanabilir.
- Amaç sağlam ürün davranışını **bugünden** sınamaktır: doğru hesap yetkisi, özel fiyat, imzalı APK doğrulaması, gönderimde idempotency, veri bütünlüğü, HTTP/API sınırları, senkronizasyon ve kullanılabilir UI test edilmeye devam eder. Bunlar gerçek veri koruma/migration yükü değildir.
- **Mevcut ürün özelliklerini sırf bu politika nedeniyle kaldırma:** halihazırdaki manuel yedekleme/geri yükleme, sıfırlama öncesi güvenlik yedeği ve şema değişiminde onaylı `legacy-data` arşiv davranışı korunur. Ancak bunları her test işleminde çalıştırmak, genişletmek veya geçmiş sürümlere dönük test desteği kurmak zorunlu değildir. Bunların kaldırılması/yeniden tasarımı ayrı ve açık kullanıcı kararı ister.
- Bu izin **kaynak kodunu, yetkilendirmeyi, sırları, gerçek dış sistemleri, diğer ajanların paralel dosyalarını veya depo geçmişini silme yetkisi değildir**. Görev kapsamı, Git/commit/deploy anlaşmaları ve gerçek dış ticari etkiler korunur. Test yayını kullanıcı yetkisi/scope'u içinde yapılır; sırf veri silinebilir diye kapsam dışı deploy yapılmaz.

## Gerçek kullanıma geçiş eşiği

Yalnız **proje sahibi**, bir işletmenin **kendi asıl alan adına** ve gerçek müşterilerine/siparişlerine geçeceğini açıkça belirttiğinde ilgili kurulum üretim olarak ele alınacak. **O aşamada ve o kurulum için** production go-live, ilk veri geçişi, yedek/geri yükleme, şema migration'ları, kayıt saklama, erişim ve operasyonel geri dönüş yaklaşımı planlanacak.

**Varsayılan varsayım:** Aksi açıkça söylenmediği sürece **her Alwaysdata kurulumu ve bütün mevcut test verileri disposable staging**. Yeni session başında veya her ajan görevi sırasında bunun yeniden onayını isteme; gerçek müşteri verisi varmış gibi işi ağırlaştırma.

## Ajanlar için okuma sırası

Bu kararın kısa özeti `AGENTS.md` içindedir. Yeni oturumlar önce `AGENTS.md` → **bu belge** → yalnız ilgili domain dokümanı / en son devam kaydı sırasını izlesin. Eski geliştirme loglarında geçen “canlı site”, “müşteri verisi”, “backup/migration gerekli” gibi ifadeler, bu kararın kapsamındaki Alwaysdata test sitelerini kendiliğinden üretim ortamına dönüştürmez.
