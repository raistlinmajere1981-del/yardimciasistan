<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/inc/upper-shell.php';
require_once dirname(__DIR__) . '/inc/demo-installation.php';
use function YaLanding\t;
use function YaLanding\e;

$pageTitle = t('install.page_title');

YaLanding\render_header(
    'install',
    $pageTitle,
    t('install.lead')
);

$path = dirname(__DIR__) . '/yardimci-asistan/config/business.json';
$config = is_file($path) ? json_decode((string)@file_get_contents($path), true) : [];
$secret = is_array($config) ? trim((string)($config['sync_secret'] ?? '')) : '';
$downloads = demo_downloads();
$scheme = ($_SERVER['HTTPS'] ?? '') === 'on' ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'yardimciasistan.alwaysdata.net';
$moduleUrl = $scheme . '://' . $host . '/yardimci-asistan';
?>
<div class="shell" style="padding: 3rem 0;">
  <div class="section-header" style="text-align:left; margin-bottom: 2.5rem;">
    <span class="eyebrow"><?= e(t('install.title')) ?></span>
    <h1><?= e(t('install.title')) ?></h1>
    <p><?= e(t('install.lead')) ?></p>
  </div>

  <section class="setup-box" aria-labelledby="secret-title">
    <h2 id="secret-title"><?= e(t('install.secret_title')) ?></h2>
    <p class="setup-lead"><?= e(t('install.secret_help')) ?></p>

    <div class="secret-group">
      <label for="demo-module-url"><?= e(t('install.url_label')) ?></label>
      <input id="demo-module-url" class="secret-input" readonly value="<?= e($moduleUrl) ?>">
    </div>

    <div class="secret-group">
      <label for="demo-sync-secret"><?= e(t('install.key_label')) ?></label>
      <input id="demo-sync-secret" class="secret-input" readonly value="<?= e($secret) ?>">
    </div>

    <p style="font-size:0.9rem; color:var(--muted); margin: 0.5rem 0 0;"> <?= e(t('install.copy.5259191932cf')) ?> <strong><?= e(t('install.copy.9c1e6baacfc7')) ?></strong> <?= e(t('install.copy.d86524436fba')) ?> <a href="/deneme/" target="_blank" rel="noopener"><?= e(t('install.copy.cffc1234755f')) ?></a> <?= e(t('install.copy.1eec4232f8f4')) ?> </p>
  </section>

  <section class="setup-box" aria-labelledby="downloads-title">
    <h2 id="downloads-title"><?= e(t('install.downloads_title')) ?></h2>
    <p class="setup-lead"><?= e(t('install.downloads_help')) ?></p>

    <div class="download-grid">
      <?php foreach ($downloads as $item): ?>
        <?php if (!empty($item['url'])): ?>
          <a class="download-card" href="<?= e($item['url']) ?>">
            <strong><?= e(t($item['label_key'])) ?></strong>
            <span><?= e(t($item['description_key'])) ?></span>
            <span style="font-weight:600; color:var(--primary);"><?= e(t('install.download', ['version' => $item['version']])) ?> ↓</span>
          </a>
        <?php else: ?>
          <div class="download-card download-card-unavailable">
            <strong><?= e(t($item['label_key'])) ?></strong>
            <?php if ($item['label'] !== 'Linux AppImage'): ?><span><?= e(t($item['description_key'])) ?></span><?php endif; ?>
            <span><?= $item['label'] === 'Linux AppImage' ? e(t('install.linux_notice')) : e(t('install.unpublished')) ?></span>
          </div>
        <?php endif; ?>
      <?php endforeach; ?>
    </div>
    <p class="section-footnote"><?= e(t('install.companion_steps')) ?></p>
  </section>

  <section class="setup-box sample-packages-section" aria-labelledby="sample-packages-title">
    <span class="eyebrow"><?= e(t('sample.eyebrow')) ?></span>
    <h2 id="sample-packages-title"><?= e(t('sample.title')) ?></h2>
    <p class="setup-lead"><?= e(t('sample.lead')) ?></p>
    <div class="download-grid sample-package-grid">
      <?php foreach (demo_sample_downloads() as $sample): ?>
      <?php if ($sample['ready']): ?>
      <a class="sample-package-card" href="<?= e($sample['url']) ?>" download>
        <span class="sample-package-icon" aria-hidden="true">ZIP</span>
        <strong><?= e(t('sample.name.' . $sample['key'])) ?></strong>
        <span><?= e(t('sample.ready')) ?></span>
      </a>
      <?php else: ?>
      <div class="sample-package-card sample-package-unavailable">
        <span class="sample-package-icon" aria-hidden="true">ZIP</span>
        <strong><?= e(t('sample.name.' . $sample['key'])) ?></strong>
        <span><?= e(t('sample.pending')) ?></span>
      </div>
      <?php endif; ?>
      <?php endforeach; ?>
    </div>
    <p class="sample-restore-steps"><?= e(t('sample.steps')) ?></p>
    <p class="sample-restore-warning"><?= e(t('sample.warning')) ?></p>
  </section>

  <p class="section-footnote"><?= e(t('install.android_clean_install')) ?></p>
  <section class="setup-box" style="margin-bottom:0;" aria-labelledby="steps-title">
    <h2 id="steps-title"><?= e(t('landing.steps_title')) ?></h2>
    <div class="step-grid" style="margin-top:1.5rem;">
      <div class="step-card">
        <div class="step-number">01</div>
        <h3><?= e(t('landing.step1_title')) ?></h3>
        <p><?= e(t('landing.step1_desc')) ?></p>
      </div>
      <div class="step-card">
        <div class="step-number">02</div>
        <h3><?= e(t('landing.step2_title')) ?></h3>
        <p><?= e(t('landing.step2_desc')) ?></p>
      </div>
      <div class="step-card">
        <div class="step-number">03</div>
        <h3><?= e(t('landing.step3_title')) ?></h3>
        <p><?= e(t('landing.step3_desc')) ?></p>
      </div>
    </div>
    <div style="margin-top:2rem; display:flex; gap:1rem; flex-wrap:wrap;">
      <a href="/deneme/" class="btn btn-primary" target="_blank" rel="noopener"><?= e(t('landing.cta_demo')) ?> ↗</a>
      <a href="/kullanim-kilavuzu/" class="btn btn-secondary"><?= e(t('guide.title')) ?></a>
    </div>
  </section>
</div>
<?php YaLanding\render_footer(); ?>
