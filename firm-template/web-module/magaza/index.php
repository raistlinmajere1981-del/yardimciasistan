<?php
declare(strict_types=1);
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src https:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
?>
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mağaza</title>
  <link rel="stylesheet" href="storefront.css">
  <script src="storefront.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#products">Ürünlere geç</a>
  <header class="shell store-header"><div><p class="eyebrow">Online sipariş</p><h1>Mağaza</h1><p>Ürünleri seçin, siparişinizi bize iletin.</p></div><a class="button secondary cart-access" href="#cart">Sepetim <span id="cart-count">0</span></a></header>
  <main class="shell">
    <section id="success" class="state" hidden tabindex="-1" aria-labelledby="success-title">
      <p class="eyebrow">Teşekkür ederiz</p><h2 id="success-title">Siparişiniz alındı</h2>
      <p>Sipariş referansı: <strong id="reference"></strong></p>
      <button id="new-order" type="button">Yeni sipariş başlat</button>
    </section>
    <div id="store-layout" class="store-layout">
      <section aria-labelledby="products-title" id="products" tabindex="-1">
        <div class="section-heading"><h2 id="products-title">Ürünler</h2><button id="refresh" class="quiet" type="button">Ürünleri yenile</button></div>
        <div id="catalog-state" class="state" role="status" aria-live="polite">Ürünler yükleniyor…</div>
        <div id="product-grid" class="product-grid" aria-busy="true"></div>
      </section>
      <aside id="cart" class="cart-panel" aria-labelledby="cart-title" tabindex="-1">
        <div class="section-heading"><h2 id="cart-title">Sepetim</h2><button id="clear-cart" class="quiet" type="button">Temizle</button></div>
        <p id="cart-message" role="status" aria-live="polite"></p>
        <ul id="cart-lines" class="cart-lines"></ul>
        <div id="subtotal" class="subtotal"></div>
        <button id="open-checkout" type="button" disabled>İletişim bilgilerini gir</button>
        <section id="checkout" hidden aria-labelledby="checkout-title">
          <h3 id="checkout-title">Sipariş bilgileri</h3>
          <p>Adınızı ve ulaşabileceğimiz telefonu yazın.</p>
          <form id="checkout-form" novalidate>
            <fieldset id="buyer-fields">
              <label for="buyer-name">Ad / ad-soyad <span>(zorunlu)</span></label>
              <input id="buyer-name" name="name" autocomplete="name" maxlength="160" required aria-describedby="name-error">
              <p id="name-error" class="field-error"></p>
              <label for="buyer-phone">Telefon <span>(zorunlu)</span></label>
              <input id="buyer-phone" name="phone" type="tel" autocomplete="tel" maxlength="40" required aria-describedby="phone-error" placeholder="+90 555 123 45 67">
              <p id="phone-error" class="field-error"></p>
              <label for="buyer-email">E-posta <span>(isteğe bağlı)</span></label>
              <input id="buyer-email" name="email" type="email" autocomplete="email" maxlength="254" aria-describedby="email-error">
              <p id="email-error" class="field-error"></p>
              <label for="order-note">Sipariş notu <span>(isteğe bağlı)</span></label>
              <textarea id="order-note" name="note" rows="3" maxlength="2000" aria-describedby="note-error"></textarea>
              <p id="note-error" class="field-error"></p>
            </fieldset>
            <fieldset id="delivery-fields">
              <legend>Teslimat</legend>
              <p id="delivery-summary"></p>
              <div id="delivery-choice" hidden>
                <label for="delivery-method">Teslimat yöntemi</label>
                <select id="delivery-method"><option value="pickup">İşletmeden teslim</option><option value="shipping">Kargo ile gönderim</option></select>
              </div>
              <fieldset id="shipping-fields" hidden>
                <legend>Teslimat adresi</legend>
                <label for="delivery-recipientName">Teslim alacak kişi</label>
                <input id="delivery-recipientName" name="recipientName" maxlength="160" autocomplete="shipping name" aria-describedby="delivery-recipientName-error">
                <p id="delivery-recipientName-error" class="field-error"></p>
                <label for="delivery-addressLine1">Adres</label>
                <input id="delivery-addressLine1" name="addressLine1" maxlength="300" autocomplete="shipping address-line1" aria-describedby="delivery-addressLine1-error">
                <p id="delivery-addressLine1-error" class="field-error"></p>
                <label for="delivery-addressLine2">Adres devamı (isteğe bağlı)</label>
                <input id="delivery-addressLine2" name="addressLine2" maxlength="300" autocomplete="shipping address-line2" aria-describedby="delivery-addressLine2-error">
                <p id="delivery-addressLine2-error" class="field-error"></p>
                <label for="delivery-district">İlçe</label>
                <input id="delivery-district" name="district" maxlength="120" autocomplete="shipping address-level2" aria-describedby="delivery-district-error">
                <p id="delivery-district-error" class="field-error"></p>
                <label for="delivery-city">İl / şehir</label>
                <input id="delivery-city" name="city" maxlength="120" autocomplete="shipping address-level1" aria-describedby="delivery-city-error">
                <p id="delivery-city-error" class="field-error"></p>
                <label for="delivery-postalCode">Posta kodu (isteğe bağlı)</label>
                <input id="delivery-postalCode" name="postalCode" maxlength="32" autocomplete="shipping postal-code" aria-describedby="delivery-postalCode-error">
                <p id="delivery-postalCode-error" class="field-error"></p>
                <label for="delivery-countryCode">Ülke kodu (TR, GB, DE gibi)</label>
                <input id="delivery-countryCode" name="countryCode" maxlength="2" autocomplete="shipping country" aria-describedby="delivery-countryCode-error" value="TR">
                <p id="delivery-countryCode-error" class="field-error"></p>
                <label for="delivery-note">Teslimat notu (isteğe bağlı)</label>
                <textarea id="delivery-note" name="deliveryNote" rows="2" maxlength="500" autocomplete="off" aria-describedby="delivery-note-error"></textarea>
                <p id="delivery-note-error" class="field-error"></p>
                <p>Kargo ücreti ayrıca belirlenecektir.</p>
              </fieldset>
            </fieldset>
            <p id="submission-message" role="alert"></p>
            <button id="submit-order" type="submit">Siparişi gönder</button>
          </form>
        </section>
      </aside>
    </div>
    <noscript><p class="state">Mağazayı kullanmak için tarayıcınızda JavaScript'i etkinleştirin.</p></noscript>
  </main>
</body>
</html>
