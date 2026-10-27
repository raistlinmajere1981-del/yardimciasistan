<?php
declare(strict_types=1);

namespace YaLanding;

// Both layers use the same catalog, public metadata and per-key hash validation.
require_once dirname(__DIR__) . '/deneme/core/i18n.php';
require_once dirname(__DIR__) . '/deneme/core/api.php';

function resolve_language(): array
{
    static $context = null;
    if ($context !== null) return $context;
    $config = require dirname(__DIR__) . '/deneme/site/config.php';
    $origin = $config['api_origin'];
    $api = new \YaSite\PublicApi($origin, '/yardimci-asistan', $config['local_api_root'] ?? null, $config['php_cli_binary'] ?? '/usr/bin/php');
    $business = $api->read('business');
    return $context = \YaSite\language_context(dirname(__DIR__), $business['data']);
}

function t(string $key, array $values = []): string
{
    return \YaSite\t(['language' => resolve_language()], $key, $values);
}

function e(mixed $val): string
{
    return htmlspecialchars((string) $val, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function handle_cookie(): void
{
    if (isset($_GET['lang'])) {
        $lang = resolve_language();
        $cookieOpts = [
            'expires' => time() + 31536000,
            'path' => '/',
            'secure' => ($_SERVER['HTTPS'] ?? '') === 'on',
            'httponly' => true,
            'samesite' => 'Lax',
        ];
        setcookie('ya_site_language', $lang['code'], $cookieOpts);
    }
}

function render_header(string $activePage, string $pageTitle, string $pageDescription = ''): void
{
    handle_cookie();
    $lang = resolve_language();
    $languages = $lang['catalogs'];
    $currentLang = $lang['code'];
    require_once __DIR__ . '/flag-language.php';
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
?>
<!doctype html>
<html lang="<?= e($currentLang) ?>" dir="<?= e($lang['direction']) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= e($pageTitle) ?></title>
  <?php if ($pageDescription !== ''): ?><meta name="description" content="<?= e($pageDescription) ?>"><?php endif; ?>
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="stylesheet" href="/assets/css/landing.css">
  <link rel="stylesheet" href="/assets/css/flag-language.css">
  <script type="application/json" id="site-context"><?= json_encode(['language' => ['code' => $lang['code'], 'locale' => $lang['locale'], 'direction' => $lang['direction'], 'available' => array_keys($languages), 'messages' => $lang['messages']], 'sourceKeys' => \YaSite\source_keys(dirname(__DIR__))], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE) ?></script>
  <script src="/assets/js/flag-language.js" defer></script>
  <script src="/assets/js/upper.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main-content"><?= e(t('nav.skip')) ?></a>
  <header class="top-header site-header" data-site-header>
    <div class="shell header-inner">
      <a class="brand" href="/" aria-label="<?= e(t('landing.home_label')) ?>">
        <img class="brand-symbol" src="/assets/yardimci-asistan-symbol.png" alt="" width="36" height="36">
        <span class="brand-text">Yardımcı Asistan</span>
      </a>
      <button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="website-nav"><?= e(t('nav.open')) ?></button>
      <nav class="nav-links site-nav" id="website-nav" data-site-nav aria-label="<?= e(t('nav.main')) ?>">
        <a href="/"<?= $activePage === 'home' ? ' aria-current="page"' : '' ?>><?= e(t('page.home')) ?></a>
        <a href="/deneme/" target="_blank" rel="noopener noreferrer"><?= e(t('landing.live_demo')) ?></a>
        <a href="/kullanim-kilavuzu/"<?= $activePage === 'guide' ? ' aria-current="page"' : '' ?>><?= e(t('landing.guide')) ?></a>
        <a href="/kurulum/"<?= $activePage === 'install' ? ' aria-current="page"' : '' ?>><?= e(t('landing.install')) ?></a>
      </nav>
      <?php if (function_exists('render_flag_language')): ?>
        <?php render_flag_language($currentLang, $languages, t('language.label')); ?>
      <?php endif; ?>
    </div>
  </header>
  <main id="main-content" class="main-body" tabindex="-1">
<?php
}

function render_footer(): void
{
    $lang = resolve_language();
    $currentLang = $lang['code'];
?>
  </main>
  <footer class="top-footer site-footer">
    <div class="shell footer-inner">
      <div class="footer-brand">
        <div class="footer-logo">
          <img src="/assets/yardimci-asistan-symbol.png" alt="" width="28" height="28">
          <strong>Yardımcı Asistan</strong>
        </div>
        <p><?= e(t('landing.tagline')) ?></p>
      </div>
      <div class="footer-navs">
        <div class="footer-col">
          <h3><?= e(t('landing.brand')) ?></h3>
          <a href="/"><?= e(t('page.home')) ?></a>
          <a href="/kullanim-kilavuzu/"><?= e(t('landing.guide')) ?></a>
          <a href="/kurulum/"><?= e(t('landing.install')) ?></a>
        </div>
        <div class="footer-col">
          <h3><?= e(t('landing.cta_demo')) ?></h3>
          <a href="/deneme/" target="_blank" rel="noopener noreferrer"><?= e(t('landing.live_demo')) ?></a>
        </div>
      </div>
    </div>
    <div class="shell footer-bottom">
      <p>© <?= date('Y') ?> Yardımcı Asistan. <?= e(t('landing.tagline')) ?></p>
      <p class="footer-prompt"><?= e(t('landing.prompt')) ?></p>
    </div>
  </footer>
</body>
</html>
<?php
}
