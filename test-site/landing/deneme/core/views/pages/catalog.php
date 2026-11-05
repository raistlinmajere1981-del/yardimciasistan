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
  <section class="content-card" aria-labelledby="commerce-cart-title">
    <h2 id="commerce-cart-title"><?= e(t($site, 'cart.title')) ?></h2>
    <p data-commerce-cart-message role="status"></p>
    <ul data-commerce-lines></ul>
    <div data-commerce-totals></div>
    <button type="button" class="button" data-commerce-checkout disabled><?= e(t($site, 'cart.checkout')) ?></button>
    <form data-commerce-form hidden novalidate>
      <fieldset data-commerce-buyer>
        <legend><?= e(t($site, 'order.title')) ?></legend>
        <?php foreach (['name'=>['order.name','text','name'], 'phone'=>['order.phone','tel','tel'], 'email'=>['order.email','email','email'], 'note'=>['order.order_note','text','off']] as $key=>[$label,$type,$autocomplete]): ?>
          <label for="commerce-<?= e($key) ?>"><?= e(t($site, $label)) ?></label>
          <input id="commerce-<?= e($key) ?>" name="<?= e($key) ?>" type="<?= e($type) ?>" autocomplete="<?= e($autocomplete) ?>" aria-describedby="commerce-<?= e($key) ?>-error">
          <p id="commerce-<?= e($key) ?>-error" data-commerce-error="<?= e($key) ?>" class="field-error"></p>
        <?php endforeach; ?>
      </fieldset>
      <fieldset data-commerce-delivery>
        <legend><?= e(t($site, 'order.delivery')) ?></legend>
        <label for="commerce-method"><?= e(t($site, 'order.delivery_method')) ?></label>
        <select id="commerce-method" data-commerce-method>
          <option value="pickup"><?= e(t($site, 'order.pickup')) ?></option>
          <option value="shipping"><?= e(t($site, 'order.shipping')) ?></option>
        </select>
        <fieldset data-commerce-address hidden>
          <legend><?= e(t($site, 'order.delivery_address')) ?></legend>
          <?php foreach (['recipientName'=>'order.recipient_name','addressLine1'=>'order.address','addressLine2'=>'order.address2','district'=>'order.district','city'=>'order.city','postalCode'=>'order.postal_code','countryCode'=>'order.country_code','note'=>'order.delivery_note'] as $key=>$label): ?>
            <label for="commerce-delivery-<?= e($key) ?>"><?= e(t($site, $label)) ?></label>
            <input id="commerce-delivery-<?= e($key) ?>" name="delivery-<?= e($key) ?>" value="<?= $key === 'countryCode' ? 'TR' : '' ?>" aria-describedby="commerce-delivery-<?= e($key) ?>-error">
            <p id="commerce-delivery-<?= e($key) ?>-error" data-commerce-error="delivery-<?= e($key) ?>" class="field-error"></p>
          <?php endforeach; ?>
        </fieldset>
      </fieldset>
      <p data-commerce-message role="alert"></p>
      <button class="button" type="submit" data-commerce-submit disabled><?= e(t($site, 'order.submit')) ?></button>
    </form>
  </section>
  <section data-commerce-success hidden tabindex="-1" class="state">
    <h2><?= e(t($site, 'order.success_title')) ?></h2>
    <p><?= e(t($site, 'order.reference')) ?> <strong data-commerce-reference></strong></p>
    <button type="button" class="button" data-commerce-new><?= e(t($site, 'order.new_order')) ?></button>
  </section>
  <noscript><p class="state"><?= e(t($site, 'account.noscript')) ?></p></noscript>
</section>
