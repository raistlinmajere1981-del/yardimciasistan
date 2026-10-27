<?php
declare(strict_types=1);

if (($_GET['resource'] ?? '') === 'translation-source') {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') { http_response_code(405); header('Allow: GET'); exit; }
    require_once __DIR__ . '/deneme/core/i18n.php';
    echo json_encode(\YaSite\source_catalog(__DIR__), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

require_once __DIR__ . '/inc/upper-shell.php';
require_once __DIR__ . '/inc/discovery.php';
use function YaLanding\t;
use function YaLanding\e;

$bizPath = __DIR__ . '/yardimci-asistan/config/business.json';
$bizConfig = is_file($bizPath) ? json_decode((string)@file_get_contents($bizPath), true) : [];
$demoSecret = is_array($bizConfig) ? trim((string)($bizConfig['sync_secret'] ?? '')) : '';

$lang = YaLanding\resolve_language();
$pageTitle = t('landing.title');

YaLanding\render_header(
    'home',
    $pageTitle,
    t('landing.lead')
);
?>
<section class="hero-section" aria-labelledby="intro-title">
  <div class="shell hero-grid">
    <div class="hero-content">
      <span class="eyebrow"><span class="status-dot" aria-hidden="true"></span><?= e(t('intro.eyebrow')) ?></span>
      <h1 id="intro-title"><?= e(t('intro.headline_a')) ?><br><?= e(t('intro.headline_b')) ?><br><em><?= e(t('intro.headline_c')) ?></em></h1>
      <p class="hero-lead"><?= e(t('landing.lead')) ?></p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#ai-ile-calis"><?= e(t('intro.explore')) ?><?= YaLanding\icon('arrow') ?></a>
        <a class="btn btn-secondary" href="/kurulum/"><?= e(t('landing.cta_install')) ?></a>
        <a class="text-link hero-demo-link" href="/deneme/" target="_blank" rel="noopener noreferrer"><?= e(t('landing.cta_demo')) ?> ↗</a>
      </div>
      <p class="hero-reassurance"><?= YaLanding\icon('check') ?><a href="#ucretsiz-ai"><?= e(t('intro.free_link')) ?></a><span><?= e(t('intro.local')) ?></span></p>
    </div>
    <div class="nexa-workbench">
      <div class="workbench-label"><span class="status-dot" aria-hidden="true"></span><strong><?= e(t('intro.meet')) ?></strong><span class="workbench-index" aria-hidden="true">YA / 01</span></div>
      <div class="nexa-scene">
        <span class="scene-orbit" aria-hidden="true"></span>
        <span class="scene-tag scene-tag-one"><?= YaLanding\icon('people') ?><?= e(t('intro.scene_customers')) ?></span>
        <span class="scene-tag scene-tag-two"><?= YaLanding\icon('box') ?><?= e(t('intro.scene_stock')) ?></span>
        <span class="scene-tag scene-tag-three"><?= YaLanding\icon('chart') ?><?= e(t('intro.scene_reports')) ?></span>
        <div data-showcase-avatar data-showcase-size="240" data-greeting="<?= e(t('intro.greeting')) ?>"><p class="nexa-static-greeting"><?= e(t('intro.greeting')) ?></p><img src="/assets/assistant/assets/nexa/states/nexa-ready-256.webp" width="240" height="240" alt="Nexa"></div>
      </div>
      <div class="nexa-topics" data-nexa-topics hidden>
        <?php foreach (['ai', 'tree', 'devices'] as $topic): ?><button type="button" data-nexa-message="<?= e(t('intro.message_' . $topic)) ?>" aria-pressed="false"><?= e(t('intro.prompt_' . $topic)) ?><span aria-hidden="true">↗</span></button><?php endforeach; ?>
      </div>
      <p class="scripted-note"><?= e(t('intro.scripted')) ?></p>
    </div>
  </div>
  <nav class="shell chapter-nav" aria-label="<?= e(t('intro.explore')) ?>">
    <?php foreach (['ai' => 'ai-ile-calis', 'tree' => 'yetenekler', 'devices' => 'cihazlar', 'free' => 'ucretsiz-ai'] as $key => $anchor): ?><a href="#<?= e($anchor) ?>"><span aria-hidden="true">0<?= array_search($key, ['ai', 'tree', 'devices', 'free']) + 1 ?></span><?= e(t('intro.chapter_' . $key)) ?><?= YaLanding\icon('arrow') ?></a><?php endforeach; ?>
  </nav>
</section>

<section class="section ai-section" id="ai-ile-calis" aria-labelledby="ai-title">
  <div class="shell">
    <div class="section-heading"><span class="eyebrow"><?= e(t('ai.eyebrow')) ?></span><h2 id="ai-title"><?= e(t('ai.title')) ?></h2><p><?= e(t('ai.lead')) ?></p></div>
    <div class="ai-story-grid">
      <?php foreach (['identity' => 'people', 'stock' => 'box', 'report' => 'chart', 'marketing' => 'message', 'translation' => 'language', 'daily' => 'calendar'] as $story => $symbol): ?>
      <article class="ai-story">
        <div class="story-top"><span class="icon-tile"><?= YaLanding\icon($symbol) ?></span><span class="ai-label"><?= YaLanding\icon('spark') ?><?= e(t('tree.ai')) ?></span></div>
        <p class="story-quote"><?= e(t('ai.' . $story . '.quote')) ?></p>
        <h3><?= e(t('ai.' . $story . '.title')) ?></h3><p><?= e(t('ai.' . $story . '.body')) ?></p>
        <span class="story-platform"><?= e(t(in_array($story, ['identity', 'stock'], true) ? 'ai.platform_camera' : 'ai.platform_desktop')) ?></span>
      </article>
      <?php endforeach; ?>
    </div>
    <div class="human-control"><?= YaLanding\icon('check') ?><div><strong><?= e(t('ai.control')) ?></strong><p><?= e(t('ai.requirement')) ?></p></div></div>
  </div>
</section>

<section class="section discovery-section" id="yetenekler" aria-labelledby="tree-title">
  <div class="shell">
    <div class="section-heading"><span class="eyebrow"><?= e(t('tree.eyebrow')) ?></span><h2 id="tree-title"><?= e(t('tree.title')) ?></h2><p><?= e(t('tree.lead')) ?></p></div>
    <?php YaLanding\render_discovery_tree(); ?>
  </div>
</section>

<section class="section devices-section" id="cihazlar" aria-labelledby="devices-title">
  <div class="shell">
    <div class="section-heading"><span class="eyebrow"><?= e(t('devices.eyebrow')) ?></span><h2 id="devices-title"><?= e(t('devices.title')) ?></h2><p><?= e(t('devices.lead')) ?></p></div>
    <div class="connection-selector" data-connection-selector hidden role="group" aria-label="<?= e(t('devices.diagram_label')) ?>"><?php foreach (['local', 'internet', 'cloud'] as $connection): ?><button type="button" data-connection="<?= e($connection) ?>" aria-pressed="false"><?= e(t('devices.' . $connection)) ?></button><?php endforeach; ?></div>
    <div class="ecosystem" role="group" aria-label="<?= e(t('devices.diagram_label')) ?>">
      <article class="device-hub"><span class="icon-tile"><?= YaLanding\icon('desktop') ?></span><span class="eyebrow"><?= e(t('devices.center_label')) ?></span><h3><?= e(t('platform.desktop')) ?></h3><p><?= e(t('devices.desktop_desc')) ?></p><span class="hub-line" aria-hidden="true"></span></article>
      <div class="device-branches">
        <?php foreach (['companion' => 'phone', 'web' => 'web', 'dealer' => 'phone'] as $device => $symbol): ?>
        <article class="device-card" data-device-path="<?= $device === 'companion' ? 'local' : 'internet' ?>"><div class="connection-label <?= $device === 'companion' ? 'local-line' : '' ?>"><span aria-hidden="true"><?= $device === 'companion' ? '↔' : '↗' ?></span><?= e(t($device === 'companion' ? 'devices.link_local' : 'devices.link_web')) ?></div><span class="icon-tile"><?= YaLanding\icon($symbol) ?></span><h3><?= e(t('platform.' . $device)) ?></h3><p><?= e(t('devices.' . $device . '_desc')) ?></p></article>
        <?php endforeach; ?>
      </div>
    </div>
    <p class="diagram-note"><?= e(t('devices.diagram_note')) ?></p>
    <div class="connection-notes"><?php foreach (['local', 'internet', 'cloud'] as $connection): ?><div data-connection-note="<?= e($connection) ?>"><h3><span class="connection-dot dot-<?= e($connection) ?>" aria-hidden="true"></span><?= e(t('devices.' . $connection)) ?></h3><p><?= e(t('devices.' . $connection . '_desc')) ?></p></div><?php endforeach; ?></div>
  </div>
</section>

<section class="section free-section" id="ucretsiz-ai" aria-labelledby="free-title">
  <div class="shell free-layout">
    <div class="section-heading"><span class="eyebrow"><?= e(t('free.eyebrow')) ?></span><h2 id="free-title"><?= e(t('free.title')) ?></h2><p><?= e(t('free.lead')) ?></p><a class="btn btn-primary" href="/kullanim-kilavuzu/#ai-baslangic"><?= e(t('free.setup')) ?><?= YaLanding\icon('arrow') ?></a></div>
    <div class="provider-list">
      <?php foreach (['gemini' => 'https://ai.google.dev/gemini-api/docs/pricing', 'cloudflare' => 'https://developers.cloudflare.com/workers-ai/platform/pricing/', 'other' => null] as $provider => $url): ?><article class="provider-card"><span class="provider-symbol" aria-hidden="true"><?= $provider === 'gemini' ? '✳' : ($provider === 'cloudflare' ? '☁' : '+') ?></span><div><h3><?= e(t('free.' . $provider)) ?></h3><p><?= e(t('free.' . $provider . '_desc')) ?></p><?php if ($url): ?><a href="<?= e($url) ?>" target="_blank" rel="noopener"><?= e(t('free.provider_docs')) ?> ↗</a><?php endif; ?></div></article><?php endforeach; ?>
    </div>
    <div class="free-notes"><p><?= e(t('free.limits')) ?></p><p><?= e(t('free.data')) ?></p></div>
  </div>
</section>

<section class="closing-section"><div class="shell closing-inner"><div><span class="eyebrow"><?= e(t('landing.tagline')) ?></span><h2><?= e(t('close.title')) ?></h2><p><?= e(t('close.body')) ?></p></div><div class="closing-actions"><a class="btn btn-primary" href="/kurulum/"><?= e(t('landing.cta_install')) ?><?= YaLanding\icon('arrow') ?></a><a class="text-link" href="/deneme/" target="_blank" rel="noopener noreferrer"><?= e(t('landing.cta_demo')) ?> ↗</a></div></div></section>
<input id="demo-sync-secret" readonly value="<?= e($demoSecret) ?>" hidden>
<script src="/assets/assistant/showcase.js" defer></script>
<?php YaLanding\render_footer(); ?>
