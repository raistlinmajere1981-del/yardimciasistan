<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/inc/upper-shell.php';
require_once dirname(__DIR__) . '/inc/discovery.php';
use function YaLanding\t;
use function YaLanding\e;

$pageTitle = t('guide.page_title');

YaLanding\render_header(
    'guide',
    $pageTitle,
    t('guide.lead')
);
?>
<div class="shell guide-container">
  <div class="guide-heading section-heading"><span class="eyebrow"><?= e(t('landing.brand')) ?></span><h1><?= e(t('guide.title')) ?></h1><p><?= e(t('guide.lead')) ?></p></div>
  <div class="guide-layout">
    <aside class="guide-sidebar">
      <div class="guide-search" data-guide-search hidden><label for="guide-search"><?= e(t('guide.search')) ?></label><input type="search" id="guide-search" placeholder="<?= e(t('guide.placeholder')) ?>" autocomplete="off"><div class="search-status"><span role="status" data-guide-count data-count-template="<?= e(t('guide.count')) ?>"></span><button type="button" data-guide-reset hidden><?= e(t('guide.reset')) ?></button></div></div>
      <nav aria-label="<?= e(t('guide.topics')) ?>"><h2><?= e(t('guide.topics')) ?></h2>
        <?php foreach (['kurulum' => 'start', 'web-baglantisi' => 'web', 'hizmetler' => 'operations', 'satis' => 'sales', 'android' => 'android', 'ai-baslangic' => 'ai'] as $anchor => $topic): ?><a href="#<?= e($anchor) ?>" data-guide-link="<?= e($anchor) ?>"><?= e(t('guide.' . $topic . '.title')) ?><span aria-hidden="true">↗</span></a><?php endforeach; ?>
      </nav>
      <a class="guide-install" href="/kurulum/"><?= e(t('landing.cta_install')) ?><?= YaLanding\icon('arrow') ?></a>
    </aside>
    <div class="guide-content"><p class="guide-note"><?= e(t('guide.note')) ?></p><p data-guide-empty role="status" hidden><?= e(t('guide.empty')) ?></p>
  <article class="guide-article" id="kurulum" data-guide-topic>
    <span class="eyebrow">01</span><h2><?= e(t('guide.start.title')) ?></h2><p class="guide-description"><?= e(t('guide.start.desc')) ?></p>
    <p><?= e(t('guide.copy.1a07b637d0ff')) ?> <a href="/kurulum/"><?= e(t('guide.copy.0cfe616e1108')) ?></a> <?= e(t('guide.copy.5877fe945e1d')) ?></p>
    <ul>
      <li><?= e(t('guide.copy.758bc0874b7c')) ?></li>
      <li><?= e(t('guide.copy.0a336bfd1618')) ?></li>
      <li><?= e(t('guide.copy.7a8a3af48357')) ?></li>
    </ul>
    <figure class="guide-figure"><a href="/assets/guide/dashboard.webp" data-guide-image data-image-title="<?= e(t('guide.start.title')) ?>" aria-label="<?= e(t('guide.start.title') . ' · ' . t('guide.zoom')) ?>"><img src="/assets/guide/dashboard.webp" alt="<?= e(t('guide.setup_alt')) ?>" width="1116" height="663" loading="lazy" decoding="async"><span class="image-zoom" aria-hidden="true">↗</span></a><figcaption><?= e(t('guide.start.image')) ?></figcaption></figure>
  </article>

  <article class="guide-article" id="web-baglantisi" data-guide-topic>
    <span class="eyebrow">02</span><h2><?= e(t('guide.web.title')) ?></h2><p class="guide-description"><?= e(t('guide.web.desc')) ?></p>
    <p><?= e(t('guide.copy.6db4ee80b472')) ?></p>
    <ul>
      <li><?= e(t('guide.copy.748a50834dc3')) ?> <strong><?= e(t('guide.copy.30fac0c2c4ed')) ?></strong> <?= e(t('guide.copy.66a7fc641fef')) ?></li>
      <li><a href="/kurulum/"><?= e(t('guide.copy.c7636f41058d')) ?></a> <?= e(t('guide.copy.1075767742b8')) ?></li>
      <li><strong><?= e(t('guide.copy.9c1e6baacfc7')) ?></strong> <?= e(t('guide.copy.b5acaae3ad3b')) ?></li>
      <li><?= e(t('guide.copy.7f8d0eb78eb5')) ?> <a href="/deneme/" target="_blank" rel="noopener"><?= e(t('guide.copy.cffc1234755f')) ?></a> <?= e(t('guide.copy.3def5c37fd4f')) ?></li>
    </ul>
    <p><?= e(t('guide.web.translation')) ?></p>
    <figure class="guide-figure"><a href="/assets/guide/translations.webp" data-guide-image data-image-title="<?= e(t('guide.web.title')) ?>" aria-label="<?= e(t('guide.web.title') . ' · ' . t('guide.zoom')) ?>"><img src="/assets/guide/translations.webp" alt="<?= e(t('guide.web_alt')) ?>" width="1200" height="885" loading="lazy" decoding="async"><span class="image-zoom" aria-hidden="true">↗</span></a><figcaption><?= e(t('guide.image_note')) ?></figcaption></figure>
  </article>

  <article class="guide-article" id="hizmetler" data-guide-topic>
    <span class="eyebrow">03</span><h2><?= e(t('guide.operations.title')) ?></h2><p class="guide-description"><?= e(t('guide.operations.desc')) ?></p>
    <p><?= e(t('guide.copy.19894d31b234')) ?></p>
    <ul>
      <li><strong><?= e(t('guide.copy.f4a88ff83519')) ?></strong> <?= e(t('guide.copy.e826ebd74422')) ?></li>
      <li><strong><?= e(t('guide.copy.00416c50d6af')) ?></strong> <?= e(t('guide.copy.e06481907fc3')) ?></li>
      <li><strong><?= e(t('guide.copy.d1a93c4f23f7')) ?></strong> <?= e(t('guide.copy.9cf5e31ecedb')) ?></li>
    </ul>
    <figure class="guide-figure"><a href="/assets/guide/pension.webp" data-guide-image data-image-title="<?= e(t('guide.operations.title')) ?>" aria-label="<?= e(t('guide.operations.title') . ' · ' . t('guide.zoom')) ?>"><img src="/assets/guide/pension.webp" alt="<?= e(t('guide.operations_alt')) ?>" width="1116" height="663" loading="lazy" decoding="async"><span class="image-zoom" aria-hidden="true">↗</span></a><figcaption><?= e(t('guide.image_note')) ?></figcaption></figure>
  </article>

  <article class="guide-article" id="satis" data-guide-topic>
    <span class="eyebrow">04</span><h2><?= e(t('guide.sales.title')) ?></h2><p class="guide-description"><?= e(t('guide.sales.desc')) ?></p>
    <p><?= e(t('guide.copy.142f606a3377')) ?></p>
    <ul>
      <li><?= e(t('guide.copy.c4dea7b0f052')) ?></li>
      <li><?= e(t('guide.copy.bd6a2319a8ee')) ?></li>
      <li><?= e(t('guide.copy.f44bb734f33f')) ?></li>
      <li><?= e(t('guide.copy.53a0b0d32d64')) ?></li>
    </ul>
    <figure class="guide-figure"><a href="/assets/guide/products.webp" data-guide-image data-image-title="<?= e(t('guide.sales.title')) ?>" aria-label="<?= e(t('guide.sales.title') . ' · ' . t('guide.zoom')) ?>"><img src="/assets/guide/products.webp" alt="<?= e(t('guide.sales_alt')) ?>" width="1200" height="797" loading="lazy" decoding="async"><span class="image-zoom" aria-hidden="true">↗</span></a><figcaption><?= e(t('guide.image_note')) ?></figcaption></figure>
  </article>

  <article class="guide-article" id="android" data-guide-topic>
    <span class="eyebrow">05</span><h2><?= e(t('guide.android.title')) ?></h2><p class="guide-description"><?= e(t('guide.android.desc')) ?></p>
    <p><?= e(t('guide.copy.ff66083511bb')) ?></p>
    <ul>
      <li><strong><?= e(t('guide.copy.28cd242648ed')) ?></strong> <?= e(t('guide.copy.c528db2fe7fd')) ?></li>
      <li><strong><?= e(t('guide.copy.698775ce4989')) ?></strong> <?= e(t('guide.copy.7208fe126a01')) ?></li>
    </ul>
    <figure class="guide-figure"><a href="/assets/guide/android-pairing.webp" data-guide-image data-image-title="<?= e(t('guide.android.title')) ?>" aria-label="<?= e(t('guide.android.title') . ' · ' . t('guide.zoom')) ?>"><img src="/assets/guide/android-pairing.webp" alt="<?= e(t('guide.android_alt')) ?>" width="1000" height="734" loading="lazy" decoding="async"><span class="image-zoom" aria-hidden="true">↗</span></a><figcaption><?= e(t('guide.image_note')) ?></figcaption></figure>
  </article>

  <article class="guide-article" id="ai-baslangic" data-guide-topic><span class="eyebrow">06</span><h2><?= e(t('guide.ai.title')) ?></h2><p class="guide-description"><?= e(t('guide.ai.desc')) ?></p><ol><?php for ($step = 1; $step <= 4; $step++): ?><li><?= e(t('guide.ai.step' . $step)) ?></li><?php endfor; ?></ol><p><?= e(t('free.limits')) ?></p><a class="text-link" href="/#ucretsiz-ai"><?= e(t('intro.free_link')) ?> →</a></article>
  <div class="setup-box"><h2><?= e(t('guide.copy.0908c6ea0142')) ?></h2><p class="setup-lead"><?= e(t('close.body')) ?></p><div class="hero-actions"><a href="/kurulum/" class="btn btn-primary"><?= e(t('landing.cta_install')) ?></a><a href="/deneme/" target="_blank" rel="noopener noreferrer" class="btn btn-secondary"><?= e(t('landing.cta_demo')) ?> ↗</a></div></div>
    </div>
  </div>
</div>
<dialog class="image-dialog" data-image-dialog aria-labelledby="image-dialog-title"><div class="image-dialog-toolbar"><h2 id="image-dialog-title"></h2><button type="button" data-image-close><?= e(t('guide.close')) ?> <span aria-hidden="true">×</span></button></div><img alt=""></dialog>
<?php YaLanding\render_footer(); ?>
