<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }


?>
  <div class="ya-storefront">
    <a class="skip-link" href="#products"><?= e(t($site, 'nav.skip')) ?></a>
    <header class="store-header">
      <div>
        <h1><?= e($view['title']) ?></h1><p id="catalog-account" hidden></p>
      </div>
    </header>

    <section id="success" class="state" hidden tabindex="-1" aria-labelledby="success-title">
      <p class="eyebrow"><?= e(t($site, 'order.title')) ?></p>
      <h2 id="success-title"><?= e(t($site, 'order.success_title')) ?></h2>
      <p><?= e(t($site, 'order.reference')) ?> <strong id="reference"></strong></p>
      <button id="new-order" class="button" type="button"><?= e(t($site, 'order.new_order')) ?></button>
    </section>

    <div id="store-layout" class="store-layout">
      <aside id="catalog-filter-rail" class="catalog-filter-rail" aria-label="<?= e(t($site, 'catalog.category')) ?>">
        <div class="rail-heading"><strong><?= e(t($site, 'catalog.category')) ?></strong><span aria-hidden="true">☷</span></div>
        <form class="catalog-filters" id="catalog-filters" role="search">
          <label for="catalog-search"><span class="sr-only"><?= e(t($site, 'catalog.search')) ?></span><input id="catalog-search" type="search" maxlength="180" autocomplete="off" placeholder="<?= e(t($site, 'catalog.search')) ?>"></label>
          <div class="category-picker" id="catalog-category-field">
            <label for="catalog-category" class="sr-only"><?= e(t($site, 'catalog.category')) ?></label>
            <select id="catalog-category" class="catalog-native-select" tabindex="-1" aria-hidden="true"><option value=""><?= e(t($site, 'catalog.categories_all')) ?></option></select>
            <label for="category-query" class="sr-only"><?= e(t($site, 'catalog.category')) ?></label>
            <input id="category-query" type="search" autocomplete="off" aria-controls="category-options" placeholder="<?= e(t($site, 'catalog.category')) ?>" aria-label="<?= e(t($site, 'catalog.category')) ?>">
            <div id="category-selected" class="category-selected" hidden></div>
            <div id="category-options" class="category-options" role="group" aria-label="<?= e(t($site, 'catalog.category')) ?>"></div>
          </div>
          <label for="catalog-sku"><span class="sr-only"><?= e(t($site, 'catalog.sku')) ?></span><input id="catalog-sku" type="search" maxlength="80" autocomplete="off" placeholder="<?= e(t($site, 'catalog.sku')) ?>"></label>
          <label for="catalog-brand" id="catalog-brand-field" hidden><span class="sr-only"><?= e(t($site, 'catalog.brand')) ?></span><select id="catalog-brand"><option value=""><?= e(t($site, 'catalog.brands_all')) ?></option></select></label>
          <label for="favorites-only" class="favorites-filter"><input id="favorites-only" type="checkbox"> <?= e(t($site, 'catalog.favorites_only')) ?></label>
          <button id="catalog-reset" type="button" class="quiet"><?= e(t($site, 'catalog.reset')) ?></button>
        </form>
      </aside>
      <section aria-label="<?= e(t($site, 'page.catalog')) ?>" id="products" tabindex="-1">
        <div class="catalog-results-bar">
          <button id="filter-panel-toggle" type="button" class="button secondary mobile-rail-toggle" aria-expanded="false" aria-controls="catalog-filter-rail"><?= e(t($site, 'catalog.category')) ?></button>
          <p id="catalog-count" role="status" aria-live="polite"></p>
          <div class="catalog-result-actions">
            <button id="refresh" class="quiet" type="button"><?= e(t($site, 'account.refresh_products')) ?></button>
            <button id="compare-open" class="button secondary" type="button" disabled><?= e(t($site, 'catalog.compare')) ?></button>
            <button id="cart-panel-toggle" type="button" class="button secondary mobile-rail-toggle" aria-expanded="false" aria-controls="cart"><?= e(t($site, 'cart.title')) ?></button>
          </div>
        </div>
        <div id="catalog-state" class="state" role="status" aria-live="polite"></div>

        <section id="product-detail" class="content-card" hidden tabindex="-1" aria-labelledby="product-detail-title"></section>
        <section id="comparison-panel" class="content-card" hidden tabindex="-1" aria-labelledby="comparison-title"></section>
        <div id="product-grid" class="product-grid" aria-busy="true">
          <?php foreach (array_slice($view['publication']['products'], 0, 18) as $record) render_view('components/product-card', ['record' => $record], $site); ?>
        </div>
        <nav id="catalog-pagination" class="section-heading" aria-label="<?= e(t($site, 'catalog.pagination')) ?>" hidden>
          <button id="catalog-prev" class="quiet" type="button" aria-controls="product-grid"><?= e(t($site, 'catalog.previous')) ?></button>
          <p id="catalog-page-status" role="status" aria-live="polite"></p>
          <button id="catalog-next" class="quiet" type="button" aria-controls="product-grid"><?= e(t($site, 'catalog.next')) ?></button>
        </nav>
      </section>

      <aside id="cart" class="cart-panel" aria-labelledby="cart-title" tabindex="-1">
        <div class="section-heading">
          <h2 id="cart-title"><?= e(t($site, 'cart.title')) ?> <span id="cart-count" class="cart-rail-count">0</span></h2>
          <button id="clear-cart" class="quiet" type="button"><?= e(t($site, 'cart.clear')) ?></button>
        </div>
        <p id="cart-message" role="status" aria-live="polite"></p>
        <ul id="cart-lines" class="cart-lines"></ul>
        <div id="subtotal" class="subtotal"></div>
        <button id="open-checkout" class="button" type="button" disabled><?= e(t($site, 'cart.checkout')) ?></button>

        <section id="checkout" hidden aria-labelledby="checkout-title">
          <h3 id="checkout-title"><?= e(t($site, 'order.title')) ?></h3>
          <p><?= e(t($site, 'order.lead')) ?></p>
          <form id="checkout-form" novalidate>
            <fieldset id="buyer-fields">
              <label for="buyer-name"><?= e(t($site, 'order.name')) ?> <span>(zorunlu)</span></label>
              <input id="buyer-name" name="name" autocomplete="name" maxlength="160" required aria-describedby="name-error">
              <p id="name-error" class="field-error"></p>

              <label for="buyer-phone"><?= e(t($site, 'order.phone')) ?> <span>(zorunlu)</span></label>
              <input id="buyer-phone" name="phone" type="tel" autocomplete="tel" maxlength="40" required aria-describedby="phone-error" placeholder="+90 555 123 45 67">
              <p id="phone-error" class="field-error"></p>

              <label for="buyer-email"><?= e(t($site, 'order.email')) ?> <span>(isteğe bağlı)</span></label>
              <input id="buyer-email" name="email" type="email" autocomplete="email" maxlength="254" aria-describedby="email-error">
              <p id="email-error" class="field-error"></p>

              <label for="order-note"><?= e(t($site, 'order.order_note')) ?> <span>(isteğe bağlı)</span></label>
              <textarea id="order-note" name="note" rows="3" maxlength="2000" aria-describedby="note-error"></textarea>
              <p id="note-error" class="field-error"></p>
            </fieldset>

            <fieldset id="delivery-fields">
              <legend><?= e(t($site, 'order.delivery')) ?></legend>
              <p id="delivery-summary"></p>
              <div id="delivery-choice" hidden>
                <label for="delivery-method"><?= e(t($site, 'order.delivery_method')) ?></label>
                <select id="delivery-method">
                  <option value="pickup"><?= e(t($site, 'order.pickup')) ?></option>
                  <option value="shipping"><?= e(t($site, 'order.shipping')) ?></option>
                </select>
              </div>
              <fieldset id="shipping-fields" hidden>
                <legend><?= e(t($site, 'order.delivery_address')) ?></legend>
                <label for="delivery-recipientName"><?= e(t($site, 'order.recipient_name')) ?></label>
                <input id="delivery-recipientName" name="recipientName" maxlength="160" autocomplete="shipping name" aria-describedby="delivery-recipientName-error">
                <p id="delivery-recipientName-error" class="field-error"></p>

                <label for="delivery-addressLine1"><?= e(t($site, 'order.address')) ?></label>
                <input id="delivery-addressLine1" name="addressLine1" maxlength="300" autocomplete="shipping address-line1" aria-describedby="delivery-addressLine1-error">
                <p id="delivery-addressLine1-error" class="field-error"></p>

                <label for="delivery-addressLine2"><?= e(t($site, 'order.address2')) ?></label>
                <input id="delivery-addressLine2" name="addressLine2" maxlength="300" autocomplete="shipping address-line2" aria-describedby="delivery-addressLine2-error">
                <p id="delivery-addressLine2-error" class="field-error"></p>

                <label for="delivery-district"><?= e(t($site, 'order.district')) ?></label>
                <input id="delivery-district" name="district" maxlength="120" autocomplete="shipping address-level2" aria-describedby="delivery-district-error">
                <p id="delivery-district-error" class="field-error"></p>

                <label for="delivery-city"><?= e(t($site, 'order.city')) ?></label>
                <input id="delivery-city" name="city" maxlength="120" autocomplete="shipping address-level1" aria-describedby="delivery-city-error">
                <p id="delivery-city-error" class="field-error"></p>

                <label for="delivery-postalCode"><?= e(t($site, 'order.postal_code')) ?></label>
                <input id="delivery-postalCode" name="postalCode" maxlength="32" autocomplete="shipping postal-code" aria-describedby="delivery-postalCode-error">
                <p id="delivery-postalCode-error" class="field-error"></p>

                <label for="delivery-countryCode"><?= e(t($site, 'order.country_code')) ?></label>
                <input id="delivery-countryCode" name="countryCode" maxlength="2" autocomplete="shipping country" aria-describedby="delivery-countryCode-error" value="TR">
                <p id="delivery-countryCode-error" class="field-error"></p>

                <label for="delivery-note"><?= e(t($site, 'order.delivery_note')) ?></label>
                <textarea id="delivery-note" name="deliveryNote" rows="2" maxlength="500" autocomplete="off" aria-describedby="delivery-note-error"></textarea>
                <p id="delivery-note-error" class="field-error"></p>
                <p><?= e(t($site, 'order.shipping_notice')) ?></p>
              </fieldset>
            </fieldset>

            <p id="submission-message" role="alert"></p>
            <button id="submit-order" class="button" type="submit"><?= e(t($site, 'order.submit')) ?></button>
          </form>
        </section>
      </aside>
    </div>
    <noscript><p class="state"><?= e(t($site, 'account.noscript')) ?></p></noscript>
  </div>
