<?php
require_once __DIR__ . '/inc/site.php';
require_once __DIR__ . '/inc/showcase-content.php';
$pageTitle = 'Yardımcı Asistan | Keşfet ve Dene';
$pageScript = '';
$isShowcaseHome = true;
$features = showcase_features(); $profiles = showcase_profiles();
require __DIR__ . '/inc/header.php';
?>
<div class="showcase-v2">
<section class="showcase-hero" data-showcase-section="welcome"><div class="shell showcase-hero-grid">
    <div class="hero-copy"><p class="eyebrow"><?= site_e(site_text('Tanıtım ve test merkezi')) ?></p>
        <h1><?= site_e(site_text('Yardımcı Asistan’ı tanıyın,')) ?><br><?= site_e(site_text('uygulamadan deneyin.')) ?></h1>
        <p class="hero-lead"><?= site_e(site_text('Konaklama, restoran, perakende ve toptan işlemlerini örnek ekranlarda inceleyin. Desktop’ı bağlayın, kendi yayınlarınızı web ve Android ile test edin.')) ?></p>
        <div class="hero-actions"><a class="button button-primary" href="#profiller"><?= site_e(site_text('Profilleri incele')) ?> <span aria-hidden="true">↗</span></a><a class="button button-outline" href="#kurulum"><?= site_e(site_text('İndir ve Kur')) ?></a></div>
        <p class="hero-caption"><?= site_e(site_text('Gerçek uygulama ekranları. Örnek verilerle, yakından inceleyin.')) ?></p>
    </div>
    <figure class="hero-workspace"><div class="hero-visuals">
        <a class="hero-image-frame showcase-image" href="<?= site_e(site_hero_image()) ?>" data-gallery-image data-gallery-title="<?= site_e(site_text('Günlük çalışma ekranı')) ?>" aria-label="<?= site_e(site_text('Günlük çalışma ekranı') . ' · ' . site_text('Görseli büyüt')) ?>"><img class="showcase-hero-image" src="<?= site_e(site_hero_image()) ?>" alt="<?= site_e(site_text('Yardımcı Asistan günlük çalışma ekranı')) ?>" width="1116" height="663" fetchpriority="high"><span class="image-zoom" aria-hidden="true">↗</span></a>
        <a class="hero-phone showcase-image" href="<?= site_e(site_asset('showcase/dealer.webp')) ?>" data-gallery-image data-gallery-title="<?= site_e(site_text('Bayi Android · Pilot giriş ekranı')) ?>" aria-label="<?= site_e(site_text('Bayi Android · Pilot giriş ekranı') . ' · ' . site_text('Görseli büyüt')) ?>"><img src="<?= site_e(site_asset('showcase/dealer.webp')) ?>" alt="<?= site_e(site_text('Bayi Android · Pilot giriş ekranı')) ?>" width="500" height="889"><span><?= site_e(site_text('Bayi Android · Pilot')) ?></span></a>
    </div><div class="hero-connections"><div data-showcase-avatar data-showcase-size="144"></div><figcaption><span class="platform-labels"><span>Desktop</span><i aria-hidden="true">↔</i><span>Android</span><i aria-hidden="true">↔</i><span>Web</span></span><p><?= site_e(site_text('Aynı işin farklı yüzleri.')) ?></p><a class="text-link" href="#canli-yuzeyler"><?= site_e(site_text('Web bağlantısını incele')) ?> →</a></figcaption></div></figure>
</div></section>

<section class="section profile-section" id="profiller" data-showcase-section="profiles"><div class="shell">
    <div class="section-heading split-heading"><div><p class="eyebrow"><?= site_e(site_text('İşiniz farklı, yardımcınız aynı')) ?></p><h2><?= site_e(site_text('İşletmene göre şekillenir')) ?></h2></div><p><?= site_e(site_text('Bir profil seçin, çalışma alanlarına bakın.')) ?></p></div>
    <div class="profile-grid"><?php $index = 0; foreach ($profiles as $id=>$profile): $index++; ?>
        <button type="button" class="profile-card" data-profile="<?= site_e($id) ?>" aria-controls="profile-details" aria-expanded="false"><span class="profile-number">0<?= $index ?></span><img src="<?= site_e(site_asset('showcase/' . $profile['cover'] . '.webp')) ?>" alt="" width="1116" height="663" loading="lazy"><strong><?= site_e(site_text($profile['title'])) ?></strong><span><?= site_e(site_text($profile['text'])) ?></span><span class="profile-open"><?= site_e(site_text('Ekranları keşfet')) ?> <i aria-hidden="true">↗</i></span></button>
    <?php endforeach; ?></div>
    <div class="profile-details" id="profile-details" hidden tabindex="-1"><button type="button" class="profile-close" data-profile-close aria-label="<?= site_e(site_text('Profil detayını kapat')) ?>">×</button>
        <?php foreach ($profiles as $id=>$profile): ?><div data-profile-panel="<?= site_e($id) ?>" hidden><div class="section-heading"><p class="eyebrow"><?= site_e(site_text('Bu profilde')) ?></p><h3><?= site_e(site_text($profile['title'])) ?></h3><p><?= site_e(site_text($profile['optional'])) ?></p></div><div class="profile-screens"><?php foreach ($profile['features'] as $featureId): $feature = $features[$featureId]; ?><figure><?php showcase_image($feature['image'], $feature['title']); ?><figcaption><?= site_e(site_text($feature['title'])) ?></figcaption></figure><?php endforeach; ?></div></div><?php endforeach; ?>
    </div>
</div></section>

<section class="section feature-section" id="ozellikler" data-showcase-section="features"><div class="shell">
    <div class="section-heading"><p class="eyebrow"><?= site_e(site_text('Daha az dağınıklık, daha çok iş')) ?></p><h2><?= site_e(site_text('Günlük işlerini tek yerden yönet')) ?></h2></div>
    <div class="feature-filters" role="group" aria-label="<?= site_e(site_text('Özellikleri filtrele')) ?>"><button type="button" data-feature-filter="featured" aria-pressed="false" hidden><?= site_e(site_text('Öne çıkanlar')) ?></button><?php foreach (['all'=>'Tümü','daily'=>'Günlük iş','hospitality'=>'Konaklama ve servis','sales'=>'Satış ve stok','mobile'=>'Android'] as $filter=>$label): ?><button type="button" data-feature-filter="<?= site_e($filter) ?>" aria-pressed="<?= $filter === 'all' ? 'true' : 'false' ?>"><?= site_e(site_text($label)) ?></button><?php endforeach; ?></div>
    <div class="feature-grid"><?php foreach ($features as $id=>$feature): ?><article class="feature-card" data-feature-id="<?= site_e($id) ?>" data-featured="<?= !empty($feature['featured']) ? 'true' : 'false' ?>" data-feature-group="<?= site_e($feature['group']) ?>"><?php showcase_image($feature['image'], $feature['title']); ?><div class="feature-copy"><?php if (!empty($feature['note'])): ?><span class="content-tag"><?= site_e(site_text($feature['note'])) ?></span><?php endif; ?><h3><?= site_e(site_text($feature['title'])) ?></h3><p><?= site_e(site_text($feature['text'])) ?></p><?php if ($feature['guide'] !== ''): ?><a class="text-link" href="/kullanim-kilavuzu/#<?= site_e($feature['guide']) ?>"><?= site_e(site_text('Nasıl yapılır?')) ?> →</a><?php endif; ?></div></article><?php endforeach; ?></div>
</div></section>

<section class="section live-section" id="canli-yuzeyler" data-showcase-section="web"><div class="shell">
    <div class="section-heading split-heading"><div><p class="eyebrow"><?= site_e(site_text('Uygulamadan web’e')) ?></p><h2><?= site_e(site_text('Web siten de sistemin bir parçası')) ?></h2></div><p><?= site_e(site_text('Yayınlanan içerik web’de görünür; talepler ve siparişler işinize geri döner.')) ?></p></div>
    <div class="web-story"><?php showcase_store_image(); ?><div class="web-path"><span>Desktop</span><i aria-hidden="true">↓</i><strong><?= site_e(site_text('Menü · oda · ürün · duyuru')) ?></strong><i aria-hidden="true">↓</i><span>Web</span><p><?= site_e(site_text('Rezervasyon talebi · müşteri talebi · sipariş')) ?></p><i aria-hidden="true">↩ Desktop</i></div></div>
    <div class="sample-catalog" data-showcase-catalog aria-labelledby="sample-catalog-title">
        <div class="section-heading split-heading"><div><p class="eyebrow"><?= site_e(site_text('Örnek katalog · 18 ürün')) ?></p><h3 id="sample-catalog-title"><?= site_e(site_text('Mağaza görünümünü inceleyin')) ?></h3></div><p><?= site_e(site_text('Bu ürünler yalnızca tanıtım örneğidir; canlı mağazaya eklenmez ve sipariş oluşturmaz. Ürün çizimleri temsilidir.')) ?></p></div>
        <ul class="sample-product-grid"><?php foreach (showcase_sample_products() as $product): ?><li data-showcase-product><div class="sample-product-visual" data-product-kind="<?= site_e($product['kind']) ?>"><?php showcase_product_icon($product['kind']); ?><span><?= site_e(site_text($product['group'])) ?></span></div><strong><?= site_e(site_text($product['name'])) ?></strong><small><?= site_e(site_text($product['unit'])) ?></small></li><?php endforeach; ?></ul>
    </div>
    <div class="section-heading"><h3><?= site_e(site_text('Kendi yayınlarınızla test edin')) ?></h3><p><?= site_e(site_text('Aşağıdaki sayfalar yalnız Desktop’tan yayınladığınız verileri gösterir. Yayın yoksa boş görünür; içerik kaldırıldığında sayfadan da kalkar. Hesap işlemleri Online Satış gerektirir; bayi yetkisi müşteri kartından yönetilir.')) ?></p></div>
    <div class="demo-surface-grid"><?php foreach (showcase_web_surfaces() as $surface): ?><article class="demo-surface-card"><span class="demo-status-chip"><?= site_e(site_text('Desktop yayınıyla test')) ?></span><h3><?= site_e(site_text($surface['title'])) ?></h3><p><?= site_e(site_text($surface['text'])) ?></p><a class="text-link" href="<?= site_e($surface['path']) ?>"><?= site_e(site_text('Test sayfasını aç')) ?> →</a></article><?php endforeach; ?></div>
</div></section>

<section class="section service-section" id="servisler" data-showcase-section="services"><div class="shell">
    <div class="section-heading"><p class="eyebrow"><?= site_e(site_text('İhtiyacınız olduğunda, yanınızda')) ?></p><h2><?= site_e(site_text('Akıllı yardımcı ve servisler')) ?></h2><p><?= site_e(site_text('Servisler kendi hesaplarınız, bağlantılarınız ve izinlerinizle etkinleşir.')) ?></p></div>
    <div class="service-grid"><?php foreach (showcase_services() as $service): ?><article><span class="content-tag"><?= site_e(site_text($service['status'])) ?></span><h3><?= site_e(site_text($service['title'])) ?></h3><p><?= site_e(site_text($service['text'])) ?></p></article><?php endforeach; ?></div>
    <div class="showcase-tools"><?php foreach (showcase_tools() as $tool): ?><article><h3><?= site_e(site_text($tool['title'])) ?></h3><p><?= site_e(site_text($tool['text'])) ?></p></article><?php endforeach; ?></div>
    <div class="service-assistant"><p><?= site_e(site_text('Sağ alttaki yardımcıya sorun veya canlı örneklerden birini açın.')) ?></p><a class="text-link" href="/iletisim/"><?= site_e(site_text('Birlikte deneyelim.')) ?> →</a></div>
</div></section>
<?php require __DIR__ . '/inc/demo-installation.php'; render_demo_installation(); ?>
</div>
<?php require __DIR__ . '/inc/footer.php'; ?>
