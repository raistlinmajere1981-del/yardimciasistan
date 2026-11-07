<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
// Optional generic presentation. Sites replace this page and site/catalog.js independently.
?>
<section class="ya-commerce-default" data-commerce>
  <h1><?= e($view['title']) ?></h1>
  <p data-commerce-status role="status" aria-live="polite"></p>
  <div data-commerce-products class="collection">
    <?php foreach (array_slice($view['publication']['products'], 0, 18) as $record) render_view('components/product-card', ['record' => $record], $site); ?>
  </div>
  <a class="button secondary" href="<?= e(page_url($site, 'cart')) ?>"><?= e(t($site, 'cart.title')) ?></a>
  <noscript><p class="state"><?= e(t($site, 'account.noscript')) ?></p></noscript>
</section>
