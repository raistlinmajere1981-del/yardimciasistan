<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
?>
<section class="shopping-page" id="shopping-cart" aria-labelledby="cart-page-title">
  <header><h1 id="cart-page-title"><?= e(t($site, 'cart.title')) ?></h1><a href="<?= e(page_url($site, 'catalog')) ?>"><?= e(t($site, 'checkout.continue_shopping')) ?></a></header>
  <p data-cart-message role="status"></p>
  <div class="shopping-columns"><div data-cart-lines></div><aside class="shopping-summary"><h2><?= e(t($site, 'checkout.summary')) ?></h2><div data-cart-total></div><p><?= e(t($site, 'checkout.shipping_next')) ?></p><a class="button" data-checkout-link href="<?= e(page_url($site, 'checkout-customer')) ?>"><?= e(t($site, 'cart.checkout')) ?></a></aside></div>
  <noscript><?= e(t($site, 'account.noscript')) ?></noscript>
</section>
