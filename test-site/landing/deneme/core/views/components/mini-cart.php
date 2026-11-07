<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
?>
<dialog id="mini-cart" class="shopping-mini" aria-labelledby="mini-cart-title">
  <header><h2 id="mini-cart-title"><?= e(t($site, 'cart.title')) ?></h2><button type="button" data-cart-close aria-label="<?= e(t($site, 'checkout.close')) ?>">×</button></header>
  <div data-cart-lines></div><p data-cart-message role="status"></p><div data-cart-total></div>
  <footer><a class="button secondary" href="<?= e(page_url($site, 'cart')) ?>"><?= e(t($site, 'checkout.go_cart')) ?></a><a class="button" data-checkout-link href="<?= e(page_url($site, 'checkout-customer')) ?>"><?= e(t($site, 'cart.checkout')) ?></a></footer>
</dialog>
