<?php
$pageTitle = 'Kullanım Kılavuzu | Yardımcı Asistan';
require dirname(__DIR__) . '/inc/header.php';
render_site_hero('Yardım ve öğrenme', 'Kullanım kılavuzu', 'Bir işi tamamlamak için kısa adımlar ve uygulamadan gerçek ekranlar.');
$tasks = [
    [
        'id' => 'rezervasyon', 'title' => 'Rezervasyon oluştur', 'image' => 'pension.webp',
        'alt' => 'Pansiyon ekranında rezervasyonlar ve odalar',
        'steps' => [
            'Pansiyon alanında Rezervasyonlar bölümünden yeni rezervasyon formunu açın.',
            'Müşteriyi, giriş ve çıkış tarihlerini, kişi sayısını ve iletişim bilgilerini girin.',
            'Kaydı kontrol edip kaydedin; oda atamasını uygun odayı seçerek tamamlayın.',
        ],
    ],
    [
        'id' => 'stok', 'title' => 'Ürün ve stok ekle', 'image' => 'products.webp',
        'alt' => 'Satış ekranındaki ürünler ve kategoriler',
        'steps' => [
            'Satış → Ürünler alanında Yeni ürün düğmesini seçin; ad, birim, fiyat ve varsa barkodu girin.',
            'Stok takibini etkinleştirip ürünü kaydedin.',
            'Stok alanında ürünü seçin, mevcut fiziksel miktarı yazıp Sayımı Kaydet düğmesine basın. Yeni alımları Tedarikçiler / Alım alanından kaydedin.',
        ],
    ],
    [
        'id' => 'android', 'title' => 'Android Companion eşleştir', 'image' => 'android-pairing.webp',
        'alt' => 'Desktop Android servis ayarları ve kayıtlı telefonlar',
        'steps' => [
            'Desktop Ayarlar sayfasında Android servisinin Ayarlar düğmesini açın, servisi etkinleştirip kaydedin.',
            'Telefonda USB hata ayıklamasını açın, bilgisayara bağlayın ve bağlantı iznini onaylayın.',
            'Telefonlar alanında Yenile ile cihazı bulun; gerekiyorsa Uygulamayı Kur, ardından Kurulumu Tamamla düğmesini kullanın. Cihaz rolünü ve izinlerini kontrol edin.',
        ],
    ],
    [
        'id' => 'musteri', 'title' => 'Müşteri kaydı oluştur', 'image' => 'customers.webp',
        'alt' => 'Müşteri İşleri ekranında müşteriler ve kayıtlar',
        'steps' => [
            'Müşteri İşleri alanında yeni müşteri çalışma alanını açın.',
            'Ad ve iletişim bilgilerini girip kaydedin.',
            'Müşteri kaydından geçmiş işlemleri inceleyin; yalnız gerekli bilgileri ekleyin.',
        ],
    ],
];
$imageSources = json_decode((string)file_get_contents(dirname(__DIR__) . '/assets/showcase/sources.json'), true);
$imageSizes = array_column($imageSources['images'] ?? [], null, 'file');
?>
<section class="section"><div class="shell guide-layout">
    <aside class="guide-toc" aria-label="<?= site_e(site_text('Kılavuz bölümleri')) ?>">
        <h2><?= site_e(site_text('Başlangıç')) ?></h2>
        <a href="#baslangic"><?= site_e(site_text('İlk bağlantı')) ?></a>
        <?php foreach ($tasks as $task): ?><a href="#<?= site_e($task['id']) ?>"><?= site_e(site_text($task['title'])) ?></a><?php endforeach; ?>
        <a href="/#kurulum"><?= site_e(site_text('İndir ve Kur')) ?></a>
    </aside>
    <article class="guide-content">
        <section class="guide-task" id="baslangic">
            <p class="eyebrow"><?= site_e(site_text('İlk bağlantı')) ?></p>
            <h2><?= site_e(site_text('Desktop ve demo bağlantısı')) ?></h2>
            <h3 id="desktop"><?= site_e(site_text('Desktop’u kur')) ?></h3>
            <p><?= site_e(site_text('İndir ve Kur bölümünden bilgisayarınıza uygun yayınlanmış paketi indirin. İlk açılışta işletme profilinizi seçin.')) ?></p>
            <h3 id="web"><?= site_e(site_text('Demo bağlantısını kur')) ?></h3>
            <p><?= site_e(site_text('Ayarlar → Web bağlantısı alanına demo adresini ve anahtarını girip Bağlan düğmesine basın. Bağlantı doğrulandıktan sonra otomatik eşitlemeyi açıp kaydedin.')) ?></p>
            <p><?= site_e(site_text('Görünür alanlar seçilen işletme yeteneklerine ve cihaz izinlerine göre değişir.')) ?></p>
            <a class="text-link" href="/#kurulum"><?= site_e(site_text('Paketler ve demo bağlantısı →')) ?></a>
        </section>
        <?php foreach ($tasks as $task): $imageSize = $imageSizes[$task['image']]; ?>
            <section class="guide-task" id="<?= site_e($task['id']) ?>">
                <h2><?= site_e(site_text($task['title'])) ?></h2>
                <figure>
                    <a href="<?= site_e(site_asset('showcase/' . $task['image'])) ?>" data-gallery-image data-gallery-title="<?= site_e(site_text($task['title'])) ?>" data-gallery-caption="<?= site_e(site_text('Gerçek uygulama ekranı · örnek veriler')) ?>" aria-label="<?= site_e(site_text('Görüntüyü büyüt')) ?>: <?= site_e(site_text($task['alt'])) ?>">
                        <img src="<?= site_e(site_asset('showcase/' . $task['image'])) ?>" alt="<?= site_e(site_text($task['alt'])) ?>" width="<?= (int)$imageSize['width'] ?>" height="<?= (int)$imageSize['height'] ?>" loading="lazy" decoding="async">
                    </a>
                    <figcaption><?= site_e(site_text('Gerçek uygulama ekranı · örnek veriler')) ?></figcaption>
                </figure>
                <ol><?php foreach ($task['steps'] as $step): ?><li><?= site_e(site_text($step)) ?></li><?php endforeach; ?></ol>
            </section>
        <?php endforeach; ?>
    </article>
</div></section>
<?php require dirname(__DIR__) . '/inc/footer.php'; ?>
