# Yardımcı Asistan — Pre-Pilot Sertleştirme (Ağustos 2026)

Bu belge, ilk gerçek işletme pilotundan önce tamamlanan yüksek öncelikli ürün ve güvenlik değişikliklerini özetler.

## Tamamlananlar

### 1. İşletme tipine göre ilk kurulum

İlk kurulumdaki işletme tipi artık yalnız açıklama etiketi değildir.

- `Pansiyon + Restoran/Kafe`: oda, masa, QR menü, WhatsApp ve Android modülleri açık başlar.
- `Pansiyon`: oda, WhatsApp ve Android açık; restoran/QR alanları kapalı başlar.
- `Restoran` ve `Kafe`: masa, QR menü, WhatsApp ve Android açık; oda alanları kapalı başlar.
- Kullanıcı modülleri daha sonra elle değiştirebilir.
- Profil değişikliği mevcut oda/masa kayıtlarını silmez.

Amaç, ilk kurulumda işletmeyle ilgisiz seçenekleri azaltmak ve yanlış modül seçimini önlemektir.

### 2. Ana ekranda sistem sağlığı

Ana ekrana işletme sahibinin teknik log okumadan temel durumu görebileceği `Sistem sağlığı` paneli eklendi.

Panel şu başlıkları tek yerde gösterir:

- web senkron durumu, bekleyen işler ve son başarılı senkron,
- aktif ve onay bekleyen Android cihazları,
- AI bağlantı/anahtar durumu,
- uygulama kilidi,
- yerel yedek klasörü.

Panelden manuel `Şimdi eşitle` kontrolü de çalıştırılabilir.

### 3. Restoran hesabını oda hesabına aktarma

Pansiyon + restoran işletmeleri için `Hesabı odaya yaz` akışı eklendi.

Kurallar:

- yalnız `Hesap Bekliyor` durumundaki adisyon aktarılabilir,
- hedef açık bir oda folyosudur,
- kullanıcı masa, tutar, oda ve misafiri açıkça görüp işlemi onaylar,
- aynı restoran adisyonu yalnız bir oda hesabına ve yalnız bir kez aktarılabilir,
- aktarım masa adisyonunu kapatır ve masayı serbest bırakır,
- restoran siparişi sırasında düşen stok aktarımda ikinci kez düşmez,
- aktarım anında Kasa geliri oluşturulmaz; para gerçekten oda hesabından tahsil edildiğinde Kasa'ya girer,
- transferden doğan folyo kalemi normal kalem silme akışıyla koparılamaz.

Bu sözleşme `smoke-room-folio-table-order-transfer.mjs` ile regresyon testine bağlandı.

### 4. Android yeni cihaz onayı

Yeni görülen Android cihaz artık otomatik aktif personel olmaz.

- cihaz ilk görüldüğünde onay bekler,
- onaysız cihaz işletme operasyon verisini okuyamaz,
- onaysız/pasif cihaz işlem kuyruğuna action ekleyemez,
- mevcut daha önce onaylanmış cihazlar migration sırasında topluca pasifleştirilmez.

### 5. Android cihaz başına kişisel bağlantı tokenı

Android companion'ın işletme genelindeki `sync_secret` anahtarına sürekli sahip olması azaltıldı.

Yeni akış:

1. İlk eşleştirmede mevcut firma anahtarı yalnız bootstrap görevi görür.
2. Telefon masaüstünden aktif hale getirildikten sonra hosting kişisel, 256-bit rastgele cihaz tokenı üretir.
3. Hosting ham tokenı saklamaz; SHA-256 özeti tutulur.
4. Android tokenı aldıktan sonra yerel ortak anahtar kaydını cihaz tokenıyla değiştirir.
5. Token verilmiş cihaz Android güvenlik kapısında yeniden ortak anahtara dönemez.
6. Cihaz tokenı genel masaüstü senkron anahtarı değildir; yalnız Android summary/action ve ilgili yetkili mobil rapor/görsel akışlarında kullanılabilir.
7. Header cihaz kimliği ile payload/form cihaz kimliği eşleşmek zorundadır.

Token endpoint'i olmayan hostinglerde bootstrap anahtarıyla ilk eşleştirme,
kişisel cihaz tokenı alınana kadar çalışır. Bu yalnız Android cihaz eşleştirme
geçişidir; eski veritabanı, snapshot, migration veya genel sync protokolü
uyumluluğu değildir.

### 6. Release APK içinde firma anahtarı yok

Pilot/release Android paketine işletme genelindeki `sync_secret` artık gömülmez.

- anahtar gömme varsayılan olarak kapalıdır,
- yalnız açıkça debug task çalıştırıldığında yerel cihaz otomasyonu için gömülü debug bağlantısına izin verilebilir,
- release, generic veya çoklu varyant build'de `SYNC_SECRET` boş üretilir,
- web modülü adresi paketlenebilir ancak gizli firma anahtarı APK/AAB bytecode'una yazılmaz.

Bu davranış `smoke-android-release-connection.mjs` ile kontrol edilir.

### 7. Windows temiz kurulum pilot kapısı

Yeni `Windows Pilot Check` workflow'u hazırlandı.

Planlanan otomatik akış:

1. Windows x64 NSIS installer üretir.
2. Temiz geçici klasöre sessiz kurulum yapar.
3. Kurulu Electron uygulamasını gerçek Windows runner üzerinde açar.
4. İlk SQLite veritabanı ve yedek klasörünün oluştuğunu doğrular.
5. SQLite bütünlük kontrolünü ve migration/trigger'ları doğrular.
6. Oluşan installer'ı pilot artifact olarak saklar.

## Otomatik test durumu

Kod ve test sözleşmeleri repository'ye eklenmiştir; ancak Ağustos 2026 itibarıyla GitHub Actions job'ları hesap ödeme/spending-limit engeli nedeniyle step başlatmadan sonlanmaktadır.

Bu nedenle kırmızı workflow görünümü şu anda bir test assertion veya derleme hatası anlamına gelmez. Pilot öncesi Actions tekrar çalışabilir hale getirildiğinde yeni Android, desktop ve Windows hatlarının gerçekten yeşil tamamlandığı görülmelidir.

## Bilinçli olarak bu tura alınmayan konu: kimlik verisinin at-rest şifrelenmesi

Masaüstü uygulama kilidi ile SQLite veritabanı şifrelemesi aynı şey değildir. Müşteri kimlik numarası ve benzeri hassas alanlar için aceleyle eklenen uygulama-içi bir şifreleme katmanı; anahtar kurtarma, yedek geri yükleme ve veri kaybı riskini artırabilir.

Bu nedenle bu turda "veritabanı şifrelendi" iddiası oluşturulmadı. İlk pilotta gerçek kimlik belgesi verisi kullanılmadan önce şu karar ayrıca verilmelidir:

- pilot kapsamından kimlik alanlarını çıkarmak veya minimuma indirmek,
- ya da anahtar saklama + yedek/restore sözleşmesiyle birlikte alan/veritabanı şifrelemesini tasarlamak.

Hukuki/KVKK gereksinimleri teknik varsayımla değil, güncel ve yetkili kaynaklarla ayrı değerlendirilmelidir.

## Pilot öncesi kalan pratik kapılar

1. GitHub Actions ödeme/spending-limit engelini kaldırıp Android, Desktop Finance ve Windows Pilot workflow'larını tam çalıştırmak.
2. Hedef Windows bilgisayarda installer, uygulama açılışı, WhatsApp WebView, yerel yedek ve hosting bağlantısını gerçek saha turuyla doğrulamak.
3. Pansiyon + restoran senaryosunu en az birkaç günlük gerçekçi veriyle uçtan uca kullanmak.
4. Gerçek kimlik verisi toplanacaksa at-rest saklama/KVKK kararını pilot kapsamına girmeden netleştirmek.

Bu aşamada yeni büyük modül eklemek yerine saha kullanımı sırasında sürtünme yaratan noktaları ölçmek önceliklidir.
