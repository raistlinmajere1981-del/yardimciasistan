<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<header class="site-header">
  <div class="shell header-content">
    <a class="site-name" href="<?= e(page_url($site, 'home')) ?>"><?= e($view['publication']['name'] ?: t($site, 'site.title')) ?></a>
    <button type="button" class="menu-toggle" aria-expanded="true" aria-controls="main-navigation" data-menu-toggle hidden><?= e(t($site, 'nav.close')) ?></button>
    <nav id="main-navigation" class="main-navigation" aria-label="<?= e(t($site, 'nav.main')) ?>"><?php render_navigation($view, $site); ?></nav>
    <?php if (isset($view['pages']['catalog'])): ?><a class="header-cart-link" data-cart-open aria-controls="mini-cart" aria-haspopup="dialog" href="<?= e(page_url($site, 'cart')) ?>"><?= e(t($site,'cart.title')) ?> <span id="header-cart-count" hidden>0</span></a><?php endif; ?>
    <?php if (count($site['language']['catalogs']) > 1): ?>
    <form method="get" class="language-picker">
      <?php foreach (language_query_fields($view) as $key => $value): ?><input type="hidden" name="<?= e($key) ?>" value="<?= e($value) ?>"><?php endforeach; ?>
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
