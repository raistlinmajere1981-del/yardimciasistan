# Yardımcı Asistan — UI Kuralları

Bu belge güncel ürün arayüz kurallarını tanımlar. Masaüstü mimari kararlarında ayrıca
`docs/architecture/APPLICATION_ARCHITECTURE_CONSTITUTION_V1.md` ve
`docs/architecture/DOMAIN_DECISIONS_V1.md` yetkilidir.

## Genel ilke

Yardımcı Asistan küçük işletme sahibinin günlük işini hızlandırmalıdır. Arayüz:

- kısa ve anlaşılır Türkçe kullanır
- teknik terimi yalnız gerçekten gerekliyse gösterir
- günlük işi, bekleyen aksiyonu ve sonucu görünür kılar
- aynı varlık için birden fazla bağımsız editör üretmez
- aynı iş operasyonunu farklı ekranlarda yeniden uygulamaz
- görünürlük ile yetkiyi birbirine karıştırmaz

## Masaüstü uygulama grameri

Masaüstünde dört temel kavram vardır:

- **Page** — operasyon alanı; ör. Pansiyon, Restoran, Market, Mesajlar.
- **Entity Workspace** — tek varlığın canonical çalışma alanı; ör. Room, Customer, Table, Product. Menü aynı Product Workspace'in kanal bağlamıdır (D-011).
- **Operation/Subflow** — gerçek iş eylemi; ör. ödeme, oda atama, sipariş kapatma.
- **Projection** — Dashboard/Calendar/kart/listeler gibi özet ve launcher yüzeyleri.

Bir projection bağımsız editöre dönüşmemelidir.

## Navigasyon

Global sidebar capability-projected navigation kullanır. Sektör adı doğrudan görünürlük
anahtarı değildir; persisted runtime capability snapshot belirleyicidir.

Feature içinde ikinci seviye görünüm gerekiyorsa page-local selector kullanılabilir.
Entity içindeki modlar `WorkspaceTabs` ile gösterilir. Page selector ile entity tab aynı
semantik değildir.

## Workspace kuralları

Canonical entity editörü `WorkspaceFrame`/Workspace platformu üzerinden açılır.

- centered veya full-canvas sunum aynı state'i korur
- presentation değişimi workspace'i remount etmemelidir
- kapatma focus'u launcher'a geri verir
- dirty/busy close guard korunur
- modal içinde ikinci modal açılmaz
- farklı entry point'ler aynı canonical workspace'i açabilir

Drawer yeni entity editörü için kullanılmaz. Supplemental drawer yalnız gerçekten
ikincil, non-canonical bir yüzey gerekirse düşünülebilir.

## Settings

Ayarlar tek sayfadır; kategori sekmeleri yoktur. İşletme Yapısı ve Özellikler,
sektör/yetenekler ve genişliğe göre 3–4 kolonlu kompakt servis grid’ini içerir.
Dar ekranlarda kolon sayısı azalır. Servisler, Ek özellikler ile aynı çerçeve ve
iç yüzeyi paylaşır. Her hücre yalnız ad, açıklamalı etkinlik göstergesi ve
belirgin Ayarlar düğmesini taşır; test durumu yalnız detayda gösterilir. Kurulum gerekliyken
açıktır; normal her ziyarette kapalı başlar. Kurulum tamamlanınca taslaklar temiz
olduğunda kapanır. Her servis ortak, klavye erişimli detay penceresinde kendi
Kaydet/İptal işlemlerini kullanır. Etkinleştirme tercihi ile gerçek test sonucu ayrı
gösterilir; doğrulanmamış yapılandırma hazır sayılmaz. Desteklenmeyen test açıkça
belirtilir. Kirli detayda X, Escape ve dış tıklama ortak kaydedilmemiş değişiklik
kararını mevcut modal sınırı içinde gösterir: Burada kal / Değişiklikleri geri al ve
kapat / Kaydet ve kapat. Alttaki form inert olur; ikinci native dialog açılmaz.
Başarısız kayıt taslağı ve servis penceresini açık tutar. İptal yalnız o servisi geri alır.
Servis etkin kutusu kapalıyken yalnız yapılandırma alanındaki tüm kontroller (test ve bağlantı eylemleri dahil) devre dışıdır; etkinleştirme kutusu ile pencerenin Kaydet/İptal işlemleri kullanılabilir. Kutuyu seçmek kontrolleri aynı pencerede açar, henüz kaydedilmemiş etkinlik arka uç yetkilerini otomatik açmaz. Bekleyen harici hesap girişinde kullanıcı aynı servis penceresinden giriş denemesini iptal edebilir; iptal önceki bağlı hesabı silmez ve geç gelen yanıtlar yeni bağlantı olarak işlenmez.
Etkinleştirme için başarılı doğrulama gerektiren STT bağlantı testi, kayıtlı AI/web
ön koşulları hazırsa servis kapalıyken ortak bileşenin ayrı ön koşul doğrulama alanında
çalışabilir. Başarısız test etkinleştirmeyi açmaz; yapılandırma kontrolleri servis
kutusu seçilene kadar pasif kalır. Bu alan genel servis yapılandırmasını serbest bırakmaz.

Güncellemeler global sidebar altındaki durum göstergesinden açılır; tercihleri kendi
Kaydet/Geri Al eylemlerini kullanır. Güvenlik ve Veriler, arama satırının sağında
açılan non-modal, kaydırılabilir işlem yüzeyleridir. Mevcut global onay diyalogları
işlem sırasında tek modal sınır olarak korunur; gizli yedek yöneticisi mount edilmez.

İşletme Bilgileri; iletişim, konum, müşteriye açık özellikler/diller ve sosyal bağlantıları
aynı dış panelde, mevcut kayıt sahipleriyle sunar. İşletme Yapısı ve Özellikler sektör
ve staged capability seçimini sahiplenir. Oda/Masa Yönetimi yalnız kalıcı kurulum ve
runtime capability sonrasında İşletme Bilgileri içindeki düğmelerden açılır; tek modal
sınırında kendi BusinessLayout Kaydet/Geri Al ve ayrılma korumasını kullanır.
İlk kurulumda firma adı isteğe bağlıdır. Web bağlantısı ortak işletme taslağına dahildir:
barın sağında tek Etkin kutusu bulunur; kapalıyken yalnız başlık ve kutu görünür.
Açıkken adres, anahtar, Bağlan ve otomatik eşitle tercihi bağlantı alanındadır.
Bağlan ana süreç testi ve yayın kaynağı doğrulamasını yapar; kurulum kaydetmez.
Yeni/değişen dolu bağlantı ortak Kaydet öncesinde doğrulanmalıdır. Kayda kadar
kapat/aç taslağı korur; kapalıyken Kaydet yalnız yerel web transport ayarlarını temizler,
uzak yayınları silmez. Geri Al son kayıtlı Web tercihlerini geri getirir.

Galeri Yönetimi yaklaşık 600px genişlikli, fotoğraf sayısından bağımsız sabit
boyutlu bir medya listesidir. Fotoğraflar önizleme kaynağı hazırlanırken de en-boy
oranları korunarak (kırpılmadan) kareye yakın çerçevelere sığdırılır; kayıtlar ayrıca
kart çerçevesi taşımaz, ince ayraçlarla tek sütunda dizilir. Açıklama alanı resim ve
işlem oklarının arasını doldurur, gereksiz boş kolon bırakılmaz. Liste içeride
kaydırılır, sayfalama önizleme yükünü sınırlar.
Oda, Masa ve Galeri Yönetiminde kaydedilmemiş değişiklikler varken Kapat/X pasiftir;
Escape ve pencere dışına tıklama da kapatmaz. İkinci bir ayrılma onay ekranı yoktur.
Kaydet veya Değişiklikleri Geri Al başarılı olup taslak temizlenince Kapat yeniden açılır.

Alt Kaydet işletme/sektör/yetenekler, Web bağlantısı ve public profile içindir; servisleri
kaydetmez. Servis kaydı yalnız kendi alanlarını güncel kalıcı snapshot'a birleştirir,
diğer sahiplerin taslaklarını korur. Arama aynı servis detayını açar; kategori
geçişi yoktur. Appearance immediate preference'tır. Backup, update, password ve cihaz revoke gibi
işlemler staged field gibi davranmaz; açık action/resource lifecycle'ı kullanır.

Çoklu Dil kendi servis kayıt sahibini kullanır; AI manuel çeviri için ön koşul değildir.
Kalıcı servis etkinse Dil Yönetimi, İşletme Bilgileri yönetim düğmelerinde sektör
bağımsız görünür. Tek overlay içinde yaklaşık 65/35 kayıt/işlem düzeni ve sınırlı
sayfalama kullanır; dar görünümde liste/editör aşamaları filtre, seçim ve taslağı
korur. Kirli çeviri kapanışı engeller; Kaydet veya Geri Al aynı yüzeydedir.
Stale manuel metin kaynakla karşılaştırılıp değişmeden yeniden onaylanabilir.

Yeni staged Settings katkıları mevcut typed contribution seam'i ve field ownership
modelini kullanır. Yeni top-level Settings tabı varsayılan çözüm değildir.

## Appearance

Tek görünüm sistemi vardır:

- scheme: system / light / dark
- density: comfortable / compact
- scale
- accent preset
- font preset
- motion

`easy/pro`, `data-theme`, `data-mode` veya feature-specific tema dalları yoktur.

Renk, radius, spacing, tipografi, focus ve ortak control geometrisi design token/primitive
katmanından gelir. Feature CSS palette sahiplenmez.

## Eylemler ve geri bildirim

Bir eylemin etiketi sonucu açıklar: “Kaydet”, “Odaya Yaz”, “Çıkışı Tamamla” gibi.

Destructive işlemde hedef ve sonuç anlaşılır olmalıdır. Her küçük işlem için onay modalı
açılmaz; geri döndürülemez veya önemli sonuçlu işlemler açık onay/guard kullanır.

Feedback en yakın doğru seviyede gösterilir:

- field validation → field
- section operasyonu → section
- workspace yükleme/mutation hatası → workspace
- global bağlantı/sistem sorunu → global status

Finans, stok ve satış mutasyonlarında backend onayı gelmeden başarı gösterilmez.

Sayfa ve kayıt okumalarında geçici “yükleniyor/açılıyor” metni, yükleme paneli veya
iskelet görünümü gösterilmez. Yenilemede mevcut içerik korunur; ilk okumada veri
gelene kadar ilgili içerik alanı boş kalır. Bekleyen okumalar `aria-busy` ile
bildirilir; veri gelmeden boş sonuç veya bulunamadı durumu gösterilmez. İşlem
düğmelerinin busy/kaydetme geri bildirimi, ölçülebilir işlem ilerlemesi ve hatalar korunur.

## Dashboard ve Calendar

Dashboard hızlı karar projection'ıdır; rapor veya ikinci editör değildir.

Calendar zaman projection'ı ve launcher'dır; reservation/task editör sahipliği almaz.
Launcher canonical workspace/page/operation'a yönlendirir.

## Mesajlar ve AI

WhatsApp Web kullanıcı kontrolündedir. Uygulama mesaj içeriğini hazırlayabilir; otomatik
gönderim yapmaz.

WhatsApp login oturumu `persist:yardimci-whatsapp` partition tarafından korunur.
Hazır Mesajlar, Müşteri İşleri içinde embedded bir yüzeydir; Müşteri İşleri dışına
çıkıldığında renderer surface unmount olabilir. Otomatik doğum günü gönderimi
renderer sekmesinden bağımsız Electron otomasyon lifecycle'ına aittir.

AI sonucu kullanıcı tarafından gözden geçirilebilir ve düzenlenebilir olmalıdır. AI kesin
rezervasyon/müsaitlik/fiyat yetkilisi gibi davranmaz.

## Android Companion

Android masaüstünün kopyası değildir. Hızlı görüntüleme ve izin verilmiş hızlı aksiyonları
sunmalıdır.

Gerçek yetki masaüstü SQLite/capability/permission katmanındadır. UI'da bir düğmenin
gizlenmesi güvenlik sınırı değildir.

## Web veri hizmeti ve site sunumu

Web modülü yalnız veri, medya, yayın ve işlem API'lerini sağlar. Müşteri sitesine
HTML/CSS, widget, sayfa yapısı veya navigasyon eklemez. Site bu API'leri kendi
sunum koduyla tüketir. Demo sunumunun tek sahibi `test-site/landing` dizinidir;
widget ve talep formları da demo kodudur. Menü/oda/masa/katalog görünürlüğü ve
işlem yetkileri mevcut backend publication/capability kurallarını korur.

Telefon formatı ülkeye kilitlenmez. Tarih/saat gösterimi kullanıcı diline uygun olmalıdır.
Sözleşme: `docs/architecture/WEB_DATA_SERVICE_CONTRACT_V1.md`.

## Erişilebilirlik ve responsive davranış

- yalnız renkle durum anlatılmaz
- form label'ları gerçek control ile bağlıdır
- keyboard focus görünürdür
- modal/workspace focus davranışı test edilir
- dar viewportta page document taşması yaratılmaz
- aktif workspace/page gövdesi kendi scroll alanını sahiplenir
- reduced-motion tercihi desteklenir

## Kapanış kuralı

Yeni bir UI yüzeyi eklemeden önce şu sorular cevaplanır:

1. Bu bir Page, Entity Workspace, Operation, Setting veya Projection mı?
2. Canonical owner kim?
3. Hangi capability gerekli?
4. State ne kadar süre yaşamalı?
5. Mevcut workspace/operation tekrar kullanılabilir mi?
6. Hangi davranış testi bunu koruyacak?
