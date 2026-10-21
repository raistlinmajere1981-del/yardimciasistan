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
        'companion' => ['featured'=>true, 'title'=>'Android Companion', 'text'=>'Telefon erişimini Desktop’tan eşleştirin ve cihaz yetkilerini yönetin.', 'image'=>'companion', 'group'=>'mobile', 'guide'=>'android', 'note'=>'Desktop eşleştirme ekranı'],
        'wholesale' => ['title'=>'Toptan ve bayi', 'text'=>'Market profilinde bayi müşterilerini ve fiyat gruplarını isteğe bağlı açın.', 'image'=>'wholesale', 'group'=>'sales', 'guide'=>'musteri', 'note'=>'İsteğe bağlı'],
        'dealer' => ['title'=>'Bayi Android', 'text'=>'Davetli bayi girişi, katalog ve sipariş akışını pilot uygulamada deneyin.', 'image'=>'dealer', 'group'=>'mobile', 'guide'=>'', 'note'=>'Pilot'],
    ];
}

function showcase_profiles(): array
{
    return [
        'pension_restaurant'=>['title'=>'Pansiyon + Restoran/Kafe', 'text'=>'Konaklama ve servis, aynı işletmede.', 'cover'=>'pension', 'features'=>['pension','restaurant','customers','finance'], 'optional'=>'İsteğe bağlı: QR Menü ve online satış'],
        'pension'=>['title'=>'Pansiyon', 'text'=>'Odalar, misafirler ve günlük takip.', 'cover'=>'pension', 'features'=>['pension','customers','calendar','finance'], 'optional'=>'İsteğe bağlı: rezervasyon ve Android Companion'],
        'restaurant'=>['title'=>'Restoran/Kafe', 'text'=>'Masadan siparişe, menüden kasaya.', 'cover'=>'restaurant', 'features'=>['restaurant','products','quick-sale','finance'], 'optional'=>'İsteğe bağlı: QR Menü, stok ve online satış'],
        'market'=>['title'=>'Market/Perakende', 'text'=>'Ürün, stok, barkod ve hızlı satış.', 'cover'=>'quick-sale', 'features'=>['products','quick-sale','credit','wholesale'], 'optional'=>'İsteğe bağlı: veresiye, toptan ve bayi'],
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
    ];
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
