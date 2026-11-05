<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 $publication = $view['publication']; ?>
<!doctype html>
<html lang="<?= e($site['language']['code']) ?>" dir="<?= e($site['language']['direction']) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= e($view['title']) ?> · <?= e($publication['name'] ?: t($site, 'site.title')) ?></title>
  <?php $favicon = favicon_url($site, $site['favicon'] ?? ''); if ($favicon !== ''): ?><link rel="icon" href="<?= e($favicon) ?>"><?php endif; ?>
  <?php if ($publication['description'] !== ''): ?><meta name="description" content="<?= e($publication['description']) ?>"><?php endif; ?>
  <?php if ($view['canonical'] !== ''): ?><link rel="canonical" href="<?= e($view['canonical']) ?>"><?php endif; ?>
  <?php if (in_array($view['page'], ['missing','account'], true)): ?><meta name="robots" content="noindex, nofollow"><?php endif; ?>
  <?php $structured = structured_data($site, $view); if ($structured !== []): ?><script type="application/ld+json"><?= json_html($structured) ?></script><?php endif; ?>
  <link rel="stylesheet" href="<?= e(asset($site, 'core/site.css')) ?>">
  <?php if ($view['page'] === 'catalog' && is_file($site['root'] . '/public/assets/site/catalog.css')): ?>
    <link rel="stylesheet" href="<?= e(asset($site, 'site/catalog.css')) ?>">
  <?php endif; ?>
  <link rel="stylesheet" href="<?= e(asset($site, 'site/theme.css')) ?>">
</head>
<body>
  <a class="skip-link" href="#content"><?= e(t($site, 'nav.skip')) ?></a>
  <?php render_view('components/header', $view, $site); ?>
  <main id="content" class="shell main-content" tabindex="-1">
    <?php render_view('pages/' . $view['page'], $view, $site); ?>
  </main>
  <?php render_view('components/footer', $view, $site); ?>
  <script type="application/json" id="site-context"><?= json_html([
      'language' => ['code' => $site['language']['code'], 'locale' => $site['language']['locale'], 'direction' => $site['language']['direction'],
          'available' => array_keys($site['language']['catalogs']), 'messages' => $site['language']['messages']],
      'apiBasePath' => $site['module_path'], 'features' => $publication['features'], 'effects' => $view['effects'],
      'themeModule' => asset($site, 'site/theme.mjs'), 'sourceKeys' => source_keys($site['root']),
  ]) ?></script>
  <script src="<?= e(asset($site, 'core/interaction-language.js')) ?>"></script>
  <script type="module" src="<?= e(asset($site, 'core/site.mjs')) ?>"></script>
  <?php if (!empty($view['room']) || $view['page'] === 'restaurant'): ?><script type="module" src="<?= e(asset($site, 'core/panorama.mjs')) ?>"></script><?php endif; ?>
  <?php if (!empty($publication['features']['account'])): ?>
    <script src="<?= e(asset($site, 'core/account-session.js')) ?>" defer></script>
  <?php endif; ?>
  <?php if (!empty($publication['features']['account']) || $view['page'] === 'catalog'): ?>
    <script src="<?= e(asset($site, 'core/cart-draft.js')) ?>" defer></script>
  <?php endif; ?>
  <?php if ($view['page'] === 'account'): ?>
    <script src="<?= e(asset($site, 'core/portal.js')) ?>" defer></script>
  <?php endif; ?>
  <?php if ($view['page'] === 'catalog'): ?>
    <script src="<?= e(asset($site, 'core/commerce.js')) ?>" defer></script>
    <script src="<?= e(catalog_runtime($site)) ?>" data-api-base="<?= e($site['module_path']) ?>/api/" defer></script>
  <?php endif; ?>
  <?php if (!empty($publication['features']['chat']) || !empty($publication['features']['requests']) || $publication['contact']['available'] || !empty($view['demo_widget_visible'])): ?>
    <script src="<?= e(asset($site, 'core/widget.js')) ?>" data-api-base-url="<?= e($site['module_path']) ?>" data-business-name="<?= e($publication['name']) ?>" data-whatsapp-phone="<?= e($publication['contact']['whatsapp'] !== '' ? text($publication['info']['whatsapp'] ?? '') : '') ?>" data-ai-enabled="<?= $publication['features']['chat'] ? 'true' : 'false' ?>" data-requests-enabled="<?= $publication['features']['requests'] ? 'true' : 'false' ?>" data-request-types="<?= e(json_html($publication['info']['request_types'] ?? [])) ?>" data-public-surfaces="<?= e(json_html($publication['info']['public_surfaces'] ?? [])) ?>" data-force-visible="<?= !empty($view['demo_widget_visible']) ? 'true' : 'false' ?>" data-whatsapp-enabled="<?= $publication['contact']['whatsapp'] !== '' ? 'true' : 'false' ?>" defer></script>
  <?php endif; ?>
</body>
</html>
