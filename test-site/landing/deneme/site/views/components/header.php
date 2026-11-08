<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
$visitor = ($_GET['view'] ?? '') === 'visitor';
$home = page_url($site, 'home') . ($visitor ? '&view=visitor' : '');
?>
<header class="site-header lab-header">
  <div class="shell header-content">
    <a class="site-name" href="<?= e($home) ?>">
      <span class="lab-brand-mark" aria-hidden="true">YA</span>
      <span><?= e($visitor && $view['publication']['name'] !== '' ? $view['publication']['name'] : t($site, 'lab.brand')) ?></span>
    </a>
    <?php if (!$visitor): ?><span class="lab-test-label"><?= e(t($site, 'lab.test')) ?></span><?php endif; ?>
    <button type="button" class="menu-toggle" aria-expanded="true" aria-controls="main-navigation" data-menu-toggle hidden><?= e(t($site, 'nav.close')) ?></button>
    <nav id="main-navigation" class="main-navigation" aria-label="<?= e(t($site, 'nav.main')) ?>">
      <?php foreach ($view['pages'] as $id => $page): ?>
      <?php if (!empty($page['internal'])) continue; // Checkout steps are direct routes, never primary navigation. ?>
      <a href="<?= e(page_url($site, $id) . ($visitor ? '&view=visitor' : '')) ?>"<?= $view['page'] === $id ? ' aria-current="page"' : '' ?>><?= e(t($site, $page['key'])) ?></a>
      <?php endforeach; ?>
    </nav>
    <?php if (isset($view['pages']['catalog'])): ?><a class="header-cart-link" data-cart-open aria-controls="mini-cart" aria-haspopup="dialog" href="<?= e(page_url($site, 'cart')) ?>"><?= e(t($site, 'cart.title')) ?> <span id="header-cart-count" hidden>0</span></a><?php endif; ?>
    <a class="lab-exit" href="/"><?= e(t($site, 'lab.back')) ?><span aria-hidden="true">↗</span></a>
    <?php if (count($site['language']['catalogs']) > 1): ?>
    <form method="get" class="language-picker">
      <?php foreach (language_query_fields($view) as $key => $value): ?><input type="hidden" name="<?= e($key) ?>" value="<?= e($value) ?>"><?php endforeach; ?>
      <?php if ($visitor): ?><input type="hidden" name="view" value="visitor"><?php endif; ?>
      <label for="site-language"><?= e(t($site, 'language.label')) ?></label>
      <select id="site-language" name="lang" data-language-select>
        <?php foreach ($site['language']['catalogs'] as $code => $catalog): ?>
        <option value="<?= e($code) ?>"<?= $site['language']['code'] === $code ? ' selected' : '' ?>><?= e($catalog['_meta']['label']) ?></option>
        <?php endforeach; ?>
      </select>
      <button type="submit"><?= e(t($site, 'language.apply')) ?></button>
    </form>
    <?php endif; ?>
  </div>
</header>
