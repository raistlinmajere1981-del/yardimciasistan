# Bayi Android — sade kullanım tasarımı

Durum: kullanıcı tarafından onaylanmış native uygulama sözleşmesi.

[Etkileşimli taslak](https://p.superdesign.dev/draft/ace29d26-56ac-4a59-bfc8-89abafdb40d4)
ve [tasarım panosu](https://superdesign.dev/teams/d43e8b12-551a-4b15-a10c-e48c388c4fc6/projects/b9870a2a-874d-491a-9faa-460e00b34377)
dokuz yüzeyi aynı prototipte gösterir. Üstteki ekran seçici yalnız taslak
incelemesi içindir; uygulamanın gezinme öğesi değildir. HTML taslağın tarayıcı
davranışı native Android, gerçek sunucu veya cihaz doğrulaması yerine geçmez.

Bu sözleşme `apps/dealer-android-app` içindir. Personel Companion uygulaması
görsel ve etkileşim referansıdır; kimlik, izin ve çalışma zamanı paylaşılmaz.
İş kuralları D-033/D-034 ve mevcut davet, oturum, özel katalog, sipariş ve
dayanıklı yayın sahiplerinde kalır. Tasarım eski iki alanlı girişin yerini alır;
migration, yedekleme ekranı veya paralel eski tasarım tutulmaz.

## Ana akış

Uygulama deneyimsiz bayi kullanıcılarına yöneliktir. Her ekranda bir baskın
eylem, görünen geri dönüş ve en az 48 dp dokunma hedefi bulunur. Dört sabit alt
hedef: **Katalog**, **Sepet**, **Siparişler**, **Ayarlar**. Çekmece menüsü,
başlangıç dashboard'u veya çok adımlı sipariş sihirbazı yoktur.

| Yüzey | İçerik ve eylem |
| --- | --- |
| İlk bağlantı | Bayi simgesi, kısa başlık, tek `Bayi davet bağlantısı` alanı, `Yapıştır`, `Giriş yap`. Panoya yalnız kullanıcının dokunuşuyla erişilir. |
| Başvuru | Aynı alana gelen başvuru bağlantısı uygun formu açar. Girişteki `Bayi başvurusu` eylemi tek bağlantı alanını başvuru moduna geçirir; teknik sunucu adresi istenmez. Form tek kaydırılan yüzeydir. Zorunlu firma/yetkili/telefon/e-posta, isteğe bağlı vergi bilgileri ve belgeler ayrı gruptur. Gönderimden sonra kısa alındı görünümü. |
| Katalog | Sabit arama, tek satır kategori/marka/favori filtreleri, okunaklı ürün satırları. Fotoğraf, ad, kısa kod ve bayi fiyatı. Kartın kendisi ürünü açar; aynı eylemi tekrarlayan büyük inceleme düğmeleri kaldırılır. |
| Ürün | Büyük gerçek ürün görseli, varsa fotoğraf sayacı, ad/kod/fiyat, miktar ve `Sepete ekle`. Görsele dokunma veya `Fotoğrafı incele` inceleyiciyi açar. Açıklama yalnız varsa gösterilir. |
| Sepet | Ürün/miktar/çıkar, teslimat seçimi, yalnız gerektiğinde adres alanları, isteğe bağlı not, tahmini toplam, `Siparişi gönder`. Miktar için ayrıca `Uygula` adımı yoktur; doğrulama siparişten önce tamamlanır. |
| Siparişler | Durum, tarih, tutar ve kısa ürün özeti. Gerektiğinde aynı yerde ayrıntıyı açma ve tekrar sipariş. `İşletmeye iletiliyor` ile gerçek onay/tamamlanma ayrı gösterilir. |
| Ayarlar | Görünüm kontrolleri, küçük hesap kartı, oturumu kapat. Teknik senkronizasyon açıklamaları ana ekrana taşınmaz. |

Geri eylemi sırasıyla fotoğraf araçlarını, ürünü veya başvuruyu kapatır ve
kullanıcının geldiği yere döner. Katalog araması, filtre, scroll, aktif sepet
miktarları ve sipariş notu ekran açıp kapatmakla sıfırlanmaz. Arka plan yenilemesi
eşdeğer veride mevcut görünümü yeniden kurmaz. Ağ bekleme göstergesi yalnız
ilgili işlemi kilitler; başarılı sepete ekleme tam ekranı yeniden oluşturmaz.

## Görsel dil ve görünüm ayarları

Native Android, sans-serif/Roboto, 4 dp aralık sistemi, sakin yüzeyler ve belirgin
metin hiyerarşisi. Açık görünümde kırık beyaz zemin ve beyaz kartlar; koyuda lacivert
zemin ve ayrışan kartlar. Varsayılan vurgu, Yardımcı Asistan kimliğiyle uyumlu
mavi/turkuazdır. Metin başlıkları 24–28 sp, ürün adı 16–18 sp, gövde 15–16 sp,
ikincil metin 12–13 sp. Durum yalnız renkle anlatılmaz.

Companion ile aynı kullanıcı tercihleri sunulur:

- Tema: Sistem / Açık / Koyu.
- Yazı boyutu: %90 / %100 / %115 / %130 / %150; sistem yazı ölçeğine eklenir.
- Renk tonu: Mavi / Yeşil / Sıcak / Mor.
- Kontrast: Normal / Yüksek.
- Görünümü sıfırla ve anlık küçük önizleme.

Tercihler yalnız cihazdadır, hesaptan çıkışta korunur; iş yayınına girmez. Büyük
yazıda kontroller sarılır, metin kesilmez ve sabit yükseklik yüzünden erişim
kaybolmaz. Başvuru ve fotoğraf araçları da aynı tercihlere uyar.

Yeni launcher simgesi mevcut Yardımcı Asistan maskotunun beyaz yüz, mavi/turkuaz
şerit ve sıcak ifade karakterini koruyan, küçük bir paket işaretiyle bayi olarak
ayırt edilen bir kardeş tasarımdır. Android daire/squircle maskeleri için güvenli
alan; adaptif ve monochrome ikon, uygulama içi kullanım ve küçük boyut kontrolü
aynı seçilmiş varlıktan türetilir. Eski yeşil küp simgesi kaldırılır. Ürün görseli
yokken marka logosu ürünmüş gibi gösterilmez; nötr `Fotoğraf yok` durumu kullanılır.

Seçilen simge: [dealer-app-icon-concept.png](assets/dealer-app-icon-concept.png).
Yerleşik imagegen ile, mevcut `yardimci-asistan-symbol.png` marka referansı
kullanılarak üretildi. Üretim prompt'u:

> Use case: logo-brand. Asset: square Android launcher icon for the independent
> Yardımcı Asistan Bayi app. The attached local logo is a brand reference:
> preserve recognizable friendly white oval robot face, deep navy eyes, small
> smile, sweeping blue/cyan ribbon silhouette. Design a close coherent sibling
> identity for a dealer ordering app. Simplify the original detailed ribbons
> into bold readable smooth shapes. Add one small, integrated, understated parcel
> motif at lower right, white and blue, to distinguish Bayi from staff Companion.
> Large central mascot, generous 15% safe padding suitable for circular and
> squircle Android masks. Calm navy-to-cobalt background filling the square,
> turquoise rim accents, refined soft gradients, crisp legible at 48px. One
> complete icon only, front facing, polished, no mockup or border around icon.
> No letters, words, numbers, shop sign, wrench, watermarks. Output 1024x1024 or
> square high quality.

## Tek bağlantı protokolü

Üretici `dealer-web-access-store.ts`, modül adresinin kardeşindeki `../bayi/`
portalını kullanır. Portal yolu özgün `web_module_url` değerini tek başına
belirlemeye yetmez. `/yardimci-asistan/` veya başka bir dizin tahmin edilmez.

En küçük düzenleme: aynı HTTPS portal URL'sinin fragment'ine yüzde kodlanmış
`module` eklenir: `#invite=TOKEN&module=ENCODED_HTTPS_MODULE_URL`. Token aynı 256-bit
tek kullanımlı token'dır. Claim/session endpoint'leri ve cookie protokolü değişmez.
Mevcut web portalı `URLSearchParams(...).get("invite")` kullandığından ek alanı
yok sayarak aynı claim davranışını sürdürebilir. Eski linksiz-modül davetleri webde
çalışır; Android eksik bilgiyi tahmin etmez ve `Bu bağlantı eksik. Firmanızdan yeni
davet bağlantısı isteyin.` der. Bu davranış test edilir.

Android ayrıştırıcı tek bir doğrulanmış base/token sonucu döndürür. Şema HTTPS,
kullanıcı bilgisi yok, origin ve etkin port aynı, module'de query/fragment yok,
tek ve bilinen parametreler, tam token biçimi zorunludur. Redirect izlenmez;
cookie veya token başka origin'e gönderilmez. Davet token'ı fragment'te ve claim
gövdesinde kalır; tercih, kayıt, hata günlüğü veya ağ query'sine yazılmaz.

ACTION_VIEW ile açılan geçerli bağlantı alanı doldurur; token tüketimi kullanıcı
`Giriş yap` dediğinde gerçekleşir. `onNewIntent` ve açık oturumda gelen yeni
bağlantı da ele alınır; mevcut hesaptan sessizce başka hesaba geçilmez. ACTION_SEND
metin paylaşımı da aynı ayrıştırıcıdan geçer. Hostlar işletmeye göre değiştiği için
HTTPS intent filter kullanıcıya uygulama seçimi sunabilir; doğrulanmış App Links
garantisi verilmez. Başvuru bağlantısı masaüstünde Bayi Web Erişimi ayarlarından,
kaydedilmiş modül adresi ve etkin servis tercihlerinden kopyalanır. Aynı HTTPS module bilgisini taşıyan
`#application=dealer&module=...` biçimindedir; mevcut public request/multipart
akışı, belge sınırları ve idempotency korunur.

Hatalar alanın yanında kısa ve Türkçedir: geçersiz bağlantı; eksik bağlantı; süresi
dolmuş veya kullanılmış davet için yeni davet isteme; ağ hatasında yeniden deneme.
Sunucunun davet durumlarını bilerek birleştiren güvenlik sözleşmesi korunur;
kullanılmış ve süresi dolmuş token'ları ayırt eden yeni oracle oluşturulmaz.
Claim cookie'sini takip çağrısından önce kalıcı saklama, başarısız doğrulamayı
yeniden tamamlama, sekiz saatlik oturum, iptal kontrolü ve hesap kapsamı korunur.
Claim sırasında reddedilen davet ile oturumlu çağrıda gelen 401 aynı UI hata
yoluna bağlanmaz: ilki davet alanında kalır; ikincisi özel katalog erişimini
kilitler. Yeniden giriş denemesi sepeti veya bekleyen sipariş kimliğini değiştirmez.

## Fotoğraf inceleme

Ürün detayından açılan tek tam ekran yüzeydir. Üstte kapat ve `1 / N`, ortada
görsel, altta kısa araçlar vardır. Ana katalog araçlarla kalabalıklaştırılmaz.

- Pinch: 1×–8× yakınlaşma; yakınlaşmış fotoğrafta sürükleme.
- Çift dokunma: dokunulan noktaya hızlı yakınlaşma / sıfırlama.
- Görünür `Sığdır` düğmesi: tek dokunuşla ilk görünüm ve döndürmeye dönüş.
- 90° döndürme; fotoğraf değiştirince dönüş/zoom başlangıca döner.
- Birden çok fotoğrafta yatay kaydırma, sayaç ve erişilebilir önceki/sonraki
  düğmeleri. Yakınlaşmışken yatay sürükleme fotoğraf içinde gezinir; istemsiz
  sonraki fotoğrafa atlamaz. Tek fotoğrafta gezinti kontrolleri gösterilmez.
- Modlar: **Normal**, **Detay** (hafif keskinlik/kontrast/gölge açma), **Kod okuma**
  (gri/yüksek kontrast), **Negatif**, **Kenar**. Hazır modlar tek satırda yatay
  kayar; seçili mod adı ve görünür renk dışı seçimi vardır. Özgün dosya değişmez.
- `Karşılaştır`: Kamera / Galeri. Android'in dosya seçicisi ve kamera uygulaması;
  geniş medya/depolama izni yok. İptal ürün fotoğrafına döner.
- Yan yana modda `Ürün` / `Benim parçam`, bağımsız zoom/pan ve döndürme.
- Üst üste modda dokunmayla etkin görsel seçimi, elle konumlandırma/ölçekleme/
  döndürme ve saydamlık kaydırıcısı. Etkin görsel görünürdür. `Hizalamayı sıfırla`
  ve tek `Karşılaştırmayı kapat` normal ürün fotoğrafına döner.

İçe alınan fotoğraf yalnız cihazdaki özel geçici cache'te işlenir. Sunucuya veya
AI servisine gönderilmez; galeriye kopyalanmaz. Kamera dosyası izinli FileProvider
URI'siyle paylaşılır; karşılaştırma kapanınca veya uygulama temiz başlangıcında
geçici dosyalar temizlenir. Süreç yeniden oluşturulursa izinli URI geri açılır veya
normal fotoğraf durumuna anlaşılır şekilde dönülür. Kullanıcı fotoğrafının EXIF
yönü dikkate alınır, konum/EXIF bilgisi yayımlanmaz.

## Görsel verisi ve düşük bellek

Kapak alanı `image_url` korunur; sıralı `image_urls` en fazla 12 benzersiz public
HTTPS fotoğrafı taşır. Güncel şemada canonical ürünün
`image_asset_path`, `image_source_url` ve `image_original_assets_json` arşivi
bulunuyor; `product-data-service.ts` özgün içe aktarma dosyalarını bu ürüne bağlı
saklıyor. Çoklu fotoğraf mevcut ürün arşivinden türetilir; ikinci galeri tablosu
veya sahip oluşturulmaz. `catalog_product_media_publications` yalnız ürün/hash/hedef
için başarılı yükleme URL'sini kaydeden taşıma metadata'sıdır; fotoğraf sırasını
veya kaynak dosyayı sahiplenmez. Aynı fotoğrafı tekrarlayan sahte galeri oluşturulmaz.
Sıralı fotoğraflar D-034'ün aynı özel katalog/yayın/outbox hattına eklenir; yerel
asset yolları Android'e gönderilmez. Arşiv dosyalarının mevcut medya yayın
sahibinde barındırılabilir URL'lere dönüşmesi ve yalnız tamamlanmış yayının
referans edilmesi gerekir. İlk fotoğraf kapak rolünü sürdürür. Yeni bağımsız
fotoğraf senkronizasyonu veya farklı fiyat/kimlik kanalı oluşturulmaz. Aynı
`dealer_access` işi, `api/product-media.php` üzerinden özgün JPEG/PNG/WebP dosyasını
sync-secret yetkisiyle yükler; yerel yol, gerçek MIME ve SHA-256 doğrulanır. Hazırlık
sonrası beklenen revizyon hâlâ aynıysa gövde donar. Tekrar deneme donmuş gövdeyi
aynen kullanır. Hedef değişirse yükleme onayı yeniden alınır. Yayın
doğrulaması ve ilgili shared/PHP/Android tipleri bu sözleşmeyi birlikte taşır.
Çalışma ağacındaki ayrı veri aktarımı değişiklikleri bu tasarımın parçası değildir;
onların kaynakları değiştirilmez veya tamamlandığı varsayılmaz.

Liste thumb ve tam ekran çözünürlüğü ayrılır. İndirme akışı disk cache'e sınırlı
yazılır; büyük dosyalar RAM'e bütünüyle alınmaz. Decode bounds + sample ile cihaz
belleğine göre sınırlanır; inceleme bitmap'i en fazla 2048 piksel uzun kenar ve
karşılaştırmada toplam bütçe ile sınırlandırılır. Ağ boyutu, piksel sayısı,
eşzamanlı decode, cache boyutu ve iş kuyruğu sınırlıdır. Orijinale tekrar dönmek
için yeniden decode gerekmez. Efektler UI thread'i dışında ve yalnız son seçili
istek için hesaplanır; bayat sonuçlar çizilmez. Görsel değiştirme, kapatma,
recreate ve lifecycle iptalinde işler durdurulur ve sahip olunan bitmap'ler
serbest bırakılır. Sürekli yeni bitmap üreten draw/gesture yolu kullanılmaz.
Hata ve görsel yok durumlarında `Yeniden dene` / `Kapat` görünür kalır.

## Uygulama ve doğrulama sınırları

Uygulama sırası: bağlantı ayrıştırıcısı/protokol; ortak native görünüm ve ana
akış; canonical fotoğraf dizisi/yayın; tam ekran dokunma ve efektler;
karşılaştırma/lifecycle; hedef testler/APK/cihaz. Eski loginBase state'i, iki
alan doğrulaması, eski tema/küp varlıkları ve yerine geçen ekran yapıları
kaldırılır. Paralel V1 runtime, migration veya startup backfill eklenmez.

Gerekli kanıtlar:

1. Davet testleri: path/port, yeni/eskiden üretilen link, tek parametre,
   hatalı token, encode/duplicate/query/userinfo/cross-origin/HTTP/redirect reddi;
   claim ve session, kayıp cevap ve mevcut cookie testleri.
2. Görünüm testleri: tüm seçeneklerin kalıcılığı, logout sonrası tercih,
   sistem ölçeği, açık/koyu/yüksek kontrast, %150 yazı ve dar ekran.
3. Görsel testleri: filtrelerin gerçek pixel çıktısı, bounds/sample ve bütçe,
   yön düzeltmesi, zoom/pan sınırları, döndürme/fit, galeri ve stale sonuç iptali.
4. Canonical çoklu görselden özel yayına, PHP katalog cevabına ve Android
   tüketimine kadar sözleşme testi; tek/boş/bozuk görsel durumları.
5. Cihaz davranışı: clipboard/VIEW/SEND, arama ve sepet sürekliliği, sipariş
   tekrar denemesi; pinch/pan/çift dokunma/90°/fotoğraf geçişi; beş mod;
   kamera/galeri seçimi ve iptali; iki bağımsız görünüm, overlay hizalama ve
   alpha; tekrar aç/kapat, ekran kilidi ve Activity yeniden oluşturma.
6. Bellek: büyük ve bozuk görseller, 20 kez geçiş/karşılaştır/kapat; ANR/OOM ve
   kalıcı bitmap birikimi kontrolü. Fiziksel Android 13 telefonu ayrı, API 27
   (Android 8.1) emülatörü/cihazı ayrı kanıttır; minSdk derlemesi 8.1 çalışma
   kanıtı olarak sunulmaz.
7. Tek verification registry: `dealer-android-tests`, `dealer-android-build`,
   ilgili dealer-access/publication kontrolleri; Electron değişirse
   `typecheck-electron`. Yeni smoke registry'ye girer veya helper olarak
   sınıflanır. Sonunda `git diff --check`. `verify:pre-main` entegrasyon kapısı
   yalnız uygulama tamamlandığında değerlendirilir. Çalıştırılmayan cihaz/live
   kontrolleri açıkça belirtilir.

Tasarım taslağındaki örnek fiyat, ürün, sipariş ve fotoğraflar temsili olarak
etiketlenir; uygulamada yalnız gerçek API/cihaz durumu kullanılır. Bu çalışma
commit, push veya sunucuya deploy izni değildir.
