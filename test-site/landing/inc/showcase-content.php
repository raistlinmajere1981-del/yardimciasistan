<?php
declare(strict_types=1);

/** Demo-owned editorial content. Capabilities remain owned by the applications.
 * Image provenance and dimensions: assets/showcase/sources.json. */
function showcase_features(): array
{
    return [
        'customers' => ['featured'=>true, 'title'=>'Müşteri yönetimi', 'text'=>'Müşteri kartlarını, talepleri ve iletişim geçmişini bir arada tutun.', 'image'=>'customers', 'group'=>'daily', 'guide'=>'musteri'],
        'pension' => ['featured'=>true, 'title'=>'Rezervasyon ve konaklama', 'text'=>'Oda durumundan giriş, çıkış ve konaklama hesabına aynı yerden ulaşın.', 'image'=>'pension', 'group'=>'hospitality', 'guide'=>'rezervasyon'],
        'restaurant' => ['featured'=>true, 'title'=>'Masa ve sipariş', 'text'=>'Açık masaları ve siparişleri takip edin, hesabı mevcut satış akışıyla kapatın.', 'image'=>'restaurant', 'group'=>'hospitality', 'guide'=>''],
        'products' => ['title'=>'Ürün, stok ve barkod', 'text'=>'Ürünleri düzenleyin, stok hareketlerini ve barkodlu ürünlerinizi yönetin.', 'image'=>'products', 'group'=>'sales', 'guide'=>'stok'],
        'quick-sale' => ['featured'=>true, 'title'=>'Hızlı satış ve kasa', 'text'=>'Ürünü okutun veya seçin, sepeti oluşturup ödemeyi tamamlayın.', 'image'=>'quick-sale', 'group'=>'sales', 'guide'=>'stok'],
        'credit' => ['title'=>'Veresiye ve tahsilat', 'text'=>'Market müşterilerinin hesap hareketlerini ve tahsilatlarını takip edin.', 'image'=>'credit', 'group'=>'sales', 'guide'=>'musteri'],
        'finance' => ['title'=>'Finans ve raporlar', 'text'=>'Gelir, gider ve ödeme hareketlerini tarih aralığına göre inceleyin.', 'image'=>'finance', 'group'=>'daily', 'guide'=>''],
        'calendar' => ['title'=>'Takvim ve görevler', 'text'=>'Rezervasyonları ve günlük görevleri aynı takvimden açın.', 'image'=>'calendar', 'group'=>'daily', 'guide'=>''],
        'companion' => ['featured'=>true, 'title'=>'Android Companion', 'text'=>'Telefondan talep, rezervasyon, masa ve stok işlemlerine cihaz izinleriyle erişin; eşleştirmeyi Desktop’tan yönetin.', 'image'=>'companion', 'group'=>'mobile', 'guide'=>'android', 'note'=>'Desktop eşleştirme ekranı'],
        'wholesale' => ['title'=>'Toptan ve bayi', 'text'=>'Bayi müşterilerini, fiyat gruplarını ve siparişlerini yönetin; davetli web erişimini isteğe bağlı açın.', 'image'=>'wholesale', 'group'=>'sales', 'guide'=>'musteri', 'note'=>'İsteğe bağlı'],
        'requests' => ['title'=>'Müşteri talepleri', 'text'=>'Web ve telefon kanallarından gelen talepleri Müşteri İşleri alanında takip edin.', 'image'=>'requests', 'group'=>'daily', 'guide'=>'musteri'],
        'translations' => ['title'=>'Çoklu dil ve AI çeviri', 'text'=>'Yayın metinlerini elle veya AI desteğiyle çevirin; eksik ve güncelliğini yitiren çeviriler Türkçeye döner.', 'image'=>'translations', 'group'=>'daily', 'guide'=>'', 'note'=>'AI için sağlayıcı gerekir'],
        'dealer' => ['title'=>'Bayi Android', 'text'=>'Davetle giriş yapın; bayiye özel katalog, fiyat, sepet ve sipariş geçmişini pilot uygulamada test edin.', 'image'=>'dealer', 'group'=>'mobile', 'guide'=>'', 'note'=>'Pilot'],
    ];
}

function showcase_profiles(): array
{
    return [
        'pension_restaurant'=>['title'=>'Pansiyon + Restoran/Kafe', 'text'=>'Konaklama ve servis, aynı işletmede.', 'cover'=>'pension', 'features'=>['pension','restaurant','customers','finance'], 'optional'=>'İsteğe bağlı: QR Menü ve online satış'],
        'pension'=>['title'=>'Pansiyon', 'text'=>'Odalar, misafirler ve günlük takip.', 'cover'=>'pension', 'features'=>['pension','customers','calendar','finance'], 'optional'=>'İsteğe bağlı: rezervasyon ve Android Companion'],
        'restaurant'=>['title'=>'Restoran/Kafe', 'text'=>'Masadan siparişe, menüden kasaya.', 'cover'=>'restaurant', 'features'=>['restaurant','products','quick-sale','finance'], 'optional'=>'İsteğe bağlı: QR Menü, stok ve online satış'],
        'market'=>['title'=>'Market / Perakende / Toptan', 'text'=>'Ürün, stok, barkod, hızlı satış ve isteğe bağlı bayi işlemleri.', 'cover'=>'quick-sale', 'features'=>['products','quick-sale','credit','wholesale'], 'optional'=>'İsteğe bağlı: veresiye, toptan ve bayi'],
    ];
}

function showcase_services(): array
{
    return [
        ['title'=>'AI Yardımcı', 'text'=>'Metin, değerlendirme ve görsel hazırlığı için yapılandırdığınız AI sağlayıcısıyla çalışın.', 'status'=>'Sağlayıcı bağlantısı'],
        ['title'=>'WhatsApp', 'text'=>'Mesaj taslağını hazırlayın; WhatsApp Web gönderimini siz yönetin.', 'status'=>'Kullanıcı kontrolünde'],
        ['title'=>'Pazarlama ve Instagram', 'text'=>'İçerik hazırlayın, web’de yayınlayın ve izinli Instagram hesabıyla tek görsel paylaşın.', 'status'=>'Hesap ve izin gerektirir'],
        ['title'=>'SMS ve WhatsApp Business', 'text'=>'İzinli alıcı listeleriyle, tanımlı sağlayıcı ve onaylı şablon koşullarında kampanya yürütün.', 'status'=>'Hesap ve izin gerektirir'],
        ['title'=>'KBS hazırlığı ve takip', 'text'=>'Konaklama bildirimlerini hazırlayıp durumlarını izleyin; gerçek gönderim ayrıca sağlayıcı doğrulaması gerektirir.', 'status'=>'Doğrulama gerekir'],
        ['title'=>'Ses ve dikte', 'text'=>'Desteklenen seslerle metni dinleyin veya kaydettiğiniz sesi inceleyerek metne dönüştürün.', 'status'=>'İsteğe bağlı'],
        ['title'=>'AI çeviri ve Dil Yönetimi', 'text'=>'Web’de yayınlanan metinler için hedef dilleri seçin; manuel çevirileri koruyun ve AI çevirilerini kontrol edin.', 'status'=>'AI için sağlayıcı gerekir'],
        ['title'=>'Teslimat ve kargo', 'text'=>'Siparişte teslim alma veya kargoyu seçin; gönderileri ve takip bilgilerini yönetin. Aras bağlantısı hesap ve başarılı bağlantı testi gerektirir.', 'status'=>'Hesap ve bağlantı testi'],
        ['title'=>'Bayi portalı', 'text'=>'Davetli bayiler kendi katalog, fiyat ve siparişlerine web’den erişir; erişim ve sipariş yetkileri Desktop’tan yönetilir.', 'status'=>'İsteğe bağlı'],
        ['title'=>'Barkoddan ürün bilgisi', 'text'=>'Desteklenen barkodları Open Food Facts üzerinden sorgulayın; dönen ürün bilgilerini kontrol ederek kullanın.', 'status'=>'Ürün bulunmasına bağlı'],
        ['title'=>'Doğum günü hatırlatmaları', 'text'=>'İzinli müşteri kayıtları için doğum günü mesajı hazırlığını WhatsApp ayarlarıyla birlikte yönetin.', 'status'=>'İzin ve servis ayarı'],
        ['title'=>'Google yorumları ve harita', 'text'=>'Yayınlanan işletme iletişimini ve konumunu web’de gösterin; Google yorumları için kendi hesabınızı yapılandırın.', 'status'=>'Hesap ve izin gerektirir'],
    ];
}

/** These are descriptions of existing surfaces, not a second availability registry. */
function showcase_web_surfaces(): array
{
    return [
        ['title'=>'Online mağaza', 'text'=>'Yayınlanan ürünleri inceleyin; sipariş kabulü açıksa gerçek sipariş akışını deneyin.', 'path'=>'/magaza/'],
        ['title'=>'Oda ve rezervasyon', 'text'=>'Yayınlanan odaları inceleyin ve rezervasyon talebinin Desktop’a ulaşmasını test edin.', 'path'=>'/odalar/'],
        ['title'=>'Restoran ve masalar', 'text'=>'Yayınlanan masaları inceleyin; masa rezervasyonu taleplerini uygulamayla test edin.', 'path'=>'/restoran/'],
        ['title'=>'QR Menü', 'text'=>'Desktop’tan yayınladığınız menü, ürün ve fiyat değişikliklerini görün.', 'path'=>'/qr-menu/'],
        ['title'=>'Bayi portalı', 'text'=>'Desktop’tan oluşturulan davetle oturum açın; bayiye özel katalog ve siparişleri deneyin.', 'path'=>'/bayi/'],
        ['title'=>'Duyurular ve kampanyalar', 'text'=>'Yayınladığınız duyuruları görün; düzenleme ve yayından kaldırma sonuçlarını kontrol edin.', 'path'=>'/duyurular/'],
        ['title'=>'İşletme bilgileri ve galeri', 'text'=>'İşletme açıklaması, fotoğraflar ve konum bilgileri kendi yayınlarınızdan gelir.', 'path'=>'/hakkimizda/'],
        ['title'=>'Galeri', 'text'=>'Yayınlanan işletme fotoğraflarını ve desteklenen medyaları inceleyin.', 'path'=>'/galeri/'],
        ['title'=>'İletişim ve yorumlar', 'text'=>'Yayınlanan iletişim bilgilerini ve yapılandırılmış Google yorumlarını ayrı sayfalarda inceleyin.', 'path'=>'/iletisim/'],
    ];
}

function showcase_tools(): array
{
    return [
        ['title'=>'Alım, tedarikçi ve stok sayımı', 'text'=>'Ürün alımlarını, tedarikçi hesaplarını ve fiziksel stok sayımlarını kaydedin.'],
        ['title'=>'Barkod ve raf etiketi', 'text'=>'Barkodlu ürünlerle çalışın; ürün ve raf etiketlerini hazırlayın.'],
        ['title'=>'Sipariş ve teslim hazırlığı', 'text'=>'Manuel, web ve bayi siparişlerini takip edin; satışa dönüştürme ve gönderim adımlarını ayrı yönetin.'],
        ['title'=>'Yedek ve veri aktarımı', 'text'=>'Yerel yedek ve veri aktarımını kullanın; bildirimleri takip edin ve uygulama kilidiyle erişimi koruyun.'],
    ];
}

/** Homepage-only examples. Never sent to the catalog API or publication storage. */
function showcase_sample_products(): array
{
    return [
        ['name'=>'Filtre kahve', 'unit'=>'250 g', 'kind'=>'bag', 'group'=>'Gıda'],
        ['name'=>'Türk kahvesi', 'unit'=>'100 g', 'kind'=>'bag', 'group'=>'Gıda'],
        ['name'=>'Bitki çayı', 'unit'=>'20 poşet', 'kind'=>'box', 'group'=>'Gıda'],
        ['name'=>'Zeytinyağı', 'unit'=>'500 ml', 'kind'=>'bottle', 'group'=>'Gıda'],
        ['name'=>'Çiçek balı', 'unit'=>'450 g', 'kind'=>'jar', 'group'=>'Gıda'],
        ['name'=>'Çilek reçeli', 'unit'=>'380 g', 'kind'=>'jar', 'group'=>'Gıda'],
        ['name'=>'Makarna', 'unit'=>'500 g', 'kind'=>'bag', 'group'=>'Gıda'],
        ['name'=>'Bulgur', 'unit'=>'1 kg', 'kind'=>'bag', 'group'=>'Gıda'],
        ['name'=>'Kırmızı mercimek', 'unit'=>'1 kg', 'kind'=>'bag', 'group'=>'Gıda'],
        ['name'=>'Sıvı sabun', 'unit'=>'500 ml', 'kind'=>'pump', 'group'=>'Bakım'],
        ['name'=>'Şampuan', 'unit'=>'400 ml', 'kind'=>'bottle', 'group'=>'Bakım'],
        ['name'=>'El kremi', 'unit'=>'75 ml', 'kind'=>'tube', 'group'=>'Bakım'],
        ['name'=>'Bulaşık deterjanı', 'unit'=>'750 ml', 'kind'=>'bottle', 'group'=>'Ev'],
        ['name'=>'Yüzey temizleyici', 'unit'=>'1 l', 'kind'=>'bottle', 'group'=>'Ev'],
        ['name'=>'Temizlik bezi', 'unit'=>'3 adet', 'kind'=>'box', 'group'=>'Ev'],
        ['name'=>'Kâğıt havlu', 'unit'=>'2 rulo', 'kind'=>'box', 'group'=>'Ev'],
        ['name'=>'Pamuklu havlu', 'unit'=>'50 × 90 cm', 'kind'=>'box', 'group'=>'Ev'],
        ['name'=>'Defter', 'unit'=>'80 yaprak', 'kind'=>'box', 'group'=>'Kırtasiye'],
    ];
}

/** Small native SVG product illustrations, explicitly labelled as representative. */
function showcase_product_icon(string $kind): void
{
    $paths = [
        'bag'=>'M23 18h34l-3 12 5 38H21l5-38z M27 25h26 M30 41h20 M32 49h16',
        'box'=>'M23 22h34v44H23z M23 22l8-7h18l8 7 M31 35h18 M31 43h18 M31 51h12',
        'bottle'=>'M33 13h14v10l7 10v34H26V33l7-10z M33 13v-4h14v4 M26 39h28 M26 57h28',
        'jar'=>'M25 24h30v9l4 6v27H21V39l4-6z M25 19h30v5H25z M28 44h24v15H28z',
        'pump'=>'M28 33h24v34H28z M36 33V19h8v14 M32 19h20v7 M33 45h14 M33 53h14',
        'tube'=>'M25 15h30l-6 44H31z M31 59h18v8H31z M30 22h20 M33 39h14',
    ];
    ?><svg viewBox="0 0 80 80" aria-hidden="true" focusable="false"><path d="<?= site_e($paths[$kind] ?? $paths['box']) ?>"/></svg><?php
}

function showcase_image(string $id, string $title, string $class = ''): void
{
    static $images = null;
    if ($images === null) {
        $source = json_decode((string)file_get_contents(dirname(__DIR__) . '/assets/showcase/sources.json'), true);
        $images = array_column($source['images'] ?? [], null, 'file');
    }
    $file = $id . '.webp';
    $image = $images[$file] ?? ['width'=>1200, 'height'=>750];
    $src = site_asset('showcase/' . $file);
    ?><a class="showcase-image <?= site_e($class) ?>" href="<?= site_e($src) ?>" data-gallery-image data-gallery-title="<?= site_e(site_text($title)) ?>" aria-label="<?= site_e(site_text($title) . ' · ' . site_text('Görseli büyüt')) ?>"><img src="<?= site_e($src) ?>" alt="<?= site_e(site_text($title)) ?>" width="<?= (int)$image['width'] ?>" height="<?= (int)$image['height'] ?>" loading="lazy" decoding="async"><span class="image-zoom" aria-hidden="true">↗</span></a><?php
}
