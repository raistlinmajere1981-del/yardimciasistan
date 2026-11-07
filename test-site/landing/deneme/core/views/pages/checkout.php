<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
$steps = ['customer','delivery','payment','review','result'];
$step = substr($view['page'], strlen('checkout-'));
?>
<section class="shopping-page checkout-page" id="checkout-flow" data-step="<?= e($step) ?>" aria-labelledby="checkout-heading">
  <ol class="checkout-progress" aria-label="<?= e(t($site, 'cart.checkout')) ?>"><?php foreach ($steps as $index => $item): ?><li<?= $step === $item ? ' aria-current="step"' : '' ?>><span><?= $index + 1 ?></span><?= e(t($site, 'checkout.' . $item)) ?></li><?php endforeach; ?></ol>
  <h1 id="checkout-heading"><?= e(t($site, 'checkout.' . $step)) ?></h1>
  <p id="checkout-message" role="alert"></p>
  <div id="checkout-body"></div>
  <noscript><?= e(t($site, 'account.noscript')) ?></noscript>
</section>
