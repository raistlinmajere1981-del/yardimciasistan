<?php
require_once __DIR__ . '/inc/site.php';
require_once __DIR__ . '/inc/showcase-content.php';
$pageTitle = 'Yardımcı Asistan | Keşfet ve Dene';
$pageScript = 'rooms.js';
$features = showcase_features(); $profiles = showcase_profiles(); $available = site_availability();
require __DIR__ . '/inc/header.php';
?>
<div class="showcase-v2">
<section class="showcase-hero" data-showcase-section="welcome"><div class="shell showcase-hero-grid">
    <div class="hero-copy"><p class="eyebrow"><?= site_e(site_text('İşletmenizin günlük yardımcısı')) ?></p>
        <h1><?= site_e(site_text('İşinizin her günü,')) ?><br><?= site_e(site_text('biraz daha kolay.')) ?></h1>
        <p class="hero-lead"><?= site_e(site_text('Müşteriler, odalar, masalar ve satışlar. İşinize uygun bir çalışma alanı; Desktop, Android ve web ile birlikte.')) ?></p>
        <div class="hero-actions"><a class="button button-primary" href="#profiller"><?= site_e(site_text('İşletmeni keşfet')) ?> <span aria-hidden="true">↗</span></a><a class="button button-outline" href="#kurulum"><?= site_e(site_text('İndir ve Kur')) ?></a></div>
        <p class="hero-caption"><?= site_e(site_text('Gerçek uygulama ekranları. Örnek verilerle, yakından inceleyin.')) ?></p>
    </div>
    <figure class="hero-workspace"><div class="hero-visuals">
        <a class="hero-image-frame showcase-image" href="<?= site_e(site_hero_image()) ?>" data-gallery-image data-gallery-title="<?= site_e(site_text('Günlük çalışma ekranı')) ?>" aria-label="<?= site_e(site_text('Günlük çalışma ekranı') . ' · ' . site_text('Görseli büyüt')) ?>"><img class="showcase-hero-image" src="<?= site_e(site_hero_image()) ?>" alt="<?= site_e(site_text('Yardımcı Asistan günlük çalışma ekranı')) ?>" width="1116" height="663" fetchpriority="high"><span class="image-zoom" aria-hidden="true">↗</span></a>
        <a class="hero-phone showcase-image" href="<?= site_e(site_asset('showcase/dealer.webp')) ?>" data-gallery-image data-gallery-title="<?= site_e(site_text('Bayi Android · Pilot giriş ekranı')) ?>" aria-label="<?= site_e(site_text('Bayi Android · Pilot giriş ekranı') . ' · ' . site_text('Görseli büyüt')) ?>"><img src="<?= site_e(site_asset('showcase/dealer.webp')) ?>" alt="<?= site_e(site_text('Bayi Android · Pilot giriş ekranı')) ?>" width="500" height="889"><span><?= site_e(site_text('Bayi Android · Pilot')) ?></span></a>
    </div><div class="hero-connections"><div data-showcase-avatar data-showcase-size="144"></div><figcaption><span class="platform-labels"><span>Desktop</span><i aria-hidden="true">↔</i><span>Android</span><i aria-hidden="true">↔</i><span>Web</span></span><p><?= site_e(site_text('Aynı işin farklı yüzleri.')) ?></p><a class="text-link" href="#canli-yuzeyler"><?= site_e(site_text('Çalışan örnekleri gör')) ?> →</a></figcaption></div></figure>
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
    <div class="feature-filters" role="group" aria-label="<?= site_e(site_text('Özellikleri filtrele')) ?>"><?php foreach (['all'=>'Tümü','daily'=>'Günlük iş','hospitality'=>'Konaklama ve servis','sales'=>'Satış ve stok','mobile'=>'Android'] as $filter=>$label): ?><button type="button" data-feature-filter="<?= site_e($filter) ?>" aria-pressed="<?= $filter === 'all' ? 'true' : 'false' ?>"><?= site_e(site_text($label)) ?></button><?php endforeach; ?></div>
    <div class="feature-grid"><?php foreach ($features as $id=>$feature): ?><article class="feature-card" data-feature-group="<?= site_e($feature['group']) ?>"><?php showcase_image($feature['image'], $feature['title']); ?><div class="feature-copy"><?php if (!empty($feature['note'])): ?><span class="content-tag"><?= site_e(site_text($feature['note'])) ?></span><?php endif; ?><h3><?= site_e(site_text($feature['title'])) ?></h3><p><?= site_e(site_text($feature['text'])) ?></p><?php if ($feature['guide'] !== ''): ?><a class="text-link" href="/kullanim-kilavuzu/#<?= site_e($feature['guide']) ?>"><?= site_e(site_text('Nasıl yapılır?')) ?> →</a><?php endif; ?></div></article><?php endforeach; ?></div>
</div></section>

<section class="section live-section" id="canli-yuzeyler" data-showcase-section="web"><div class="shell">
    <div class="section-heading split-heading"><div><p class="eyebrow"><?= site_e(site_text('Uygulamadan web’e')) ?></p><h2><?= site_e(site_text('Web siten de sistemin bir parçası')) ?></h2></div><p><?= site_e(site_text('Yayınlanan içerik web’de görünür; talepler ve siparişler işinize geri döner.')) ?></p></div>
    <div class="web-story"><?php showcase_image('web-store', 'Online mağaza örneği'); ?><div class="web-path"><span>Desktop</span><i aria-hidden="true">↓</i><strong><?= site_e(site_text('Menü · oda · ürün · duyuru')) ?></strong><i aria-hidden="true">↓</i><span>Web</span><p><?= site_e(site_text('Rezervasyon talebi · müşteri talebi · sipariş')) ?></p><i aria-hidden="true">↩ Desktop</i></div></div>
    <div class="demo-surface-grid"><?php $live = false; foreach (site_live_navigation() as $page): $live = true; ?><article class="demo-surface-card"><span class="demo-status-chip"><?= site_e(site_text('Canlı · Uygulamaya bağlı')) ?></span><h3><?= site_e(site_text($page['label'])) ?></h3><a class="text-link" href="<?= site_e($page['path']) ?>"><?= site_e(site_text('Canlı örneği aç')) ?> →</a></article><?php endforeach; ?><?php if (!$live): ?><p class="surface-empty"><?= site_e(site_text('Etkin ve yayınlanmış örnekler burada görünür.')) ?></p><?php endif; ?></div>
    <?php if ($available['rooms'] && !empty(site_publication('room_catalog')['rooms'])): ?><div class="live-extras"><h3><?= site_e(site_text('Odalar')) ?></h3><div class="room-grid" data-room-list data-room-limit="3"></div></div><?php endif; ?>
    <div class="live-extras homepage-campaigns" data-marketing-wrapper hidden><div class="split-heading"><h3><?= site_e(site_text('Kampanyalar ve duyurular')) ?></h3><a class="text-link" href="/duyurular/"><?= site_e(site_text('Tüm kampanyalar →')) ?></a></div><div data-marketing-surface data-marketing-limit="3" data-marketing-heading="false" hidden aria-label="<?= site_e(site_text('Kampanyalar ve duyurular')) ?>"></div></div>
    <div class="live-extras" data-google-reviews data-review-limit="3" hidden><div class="split-heading"><h3><?= site_e(site_text('Google yorumları')) ?></h3><div class="rating-pill" data-google-rating></div></div><div class="review-grid" data-google-review-list></div><a class="text-link" href="/yorumlar/"><?= site_e(site_text('Tüm yorumlar →')) ?></a></div>
</div></section>

<section class="section service-section" id="servisler" data-showcase-section="services"><div class="shell">
    <div class="section-heading"><p class="eyebrow"><?= site_e(site_text('İhtiyacınız olduğunda, yanınızda')) ?></p><h2><?= site_e(site_text('Akıllı yardımcı ve servisler')) ?></h2><p><?= site_e(site_text('Servisler kendi hesaplarınız, bağlantılarınız ve izinlerinizle etkinleşir.')) ?></p></div>
    <div class="service-grid"><?php foreach (showcase_services() as $service): ?><article><span class="content-tag"><?= site_e(site_text($service['status'])) ?></span><h3><?= site_e(site_text($service['title'])) ?></h3><p><?= site_e(site_text($service['text'])) ?></p></article><?php endforeach; ?></div>
    <div class="service-assistant"><p><?= site_e(site_text('Sağ alttaki yardımcıya sorun veya canlı örneklerden birini açın.')) ?></p><a class="text-link" href="/iletisim/"><?= site_e(site_text('Birlikte deneyelim.')) ?> →</a></div>
</div></section>
<?php require __DIR__ . '/inc/demo-installation.php'; render_demo_installation(); ?>
</div>
<link rel="stylesheet" href="<?= site_e(site_asset('css/marketing.css')) ?>"><script src="<?= site_e(site_asset('js/marketing.js')) ?>" data-api-base="/yardimci-asistan/" defer></script>
<?php require __DIR__ . '/inc/footer.php'; ?>
