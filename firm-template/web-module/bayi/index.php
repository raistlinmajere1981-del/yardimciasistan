<?php
declare(strict_types=1);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src https:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
?>
<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bayi paneli</title><link rel="stylesheet" href="../magaza/storefront.css"><link rel="stylesheet" href="portal.css"><script src="portal.js" defer></script></head>
<body><main class="shell dealer-shell"><section class="state" aria-labelledby="portal-title">
<p class="eyebrow">Bayi erişimi</p><h1 id="portal-title">Bayi erişimi gerekli</h1>
<p id="dealer-name" hidden></p><p id="portal-message" role="status" aria-live="polite">Erişim durumunuz kontrol ediliyor…</p>
<button id="claim" type="button" hidden>Daveti kullan</button><button id="logout" class="secondary" type="button" hidden>Oturumu kapat</button>
</section>
<section id="success" class="state" hidden tabindex="-1" aria-labelledby="success-title">
<h2 id="success-title">Siparişiniz alındı</h2><p>Sipariş referansı: <strong id="reference"></strong></p>
<p>İşletme siparişinizi güncel bayi fiyatlarıyla kaydedecektir.</p><button id="new-order" type="button">Yeni sipariş başlat</button></section>
<div id="dealer-store" class="store-layout" hidden>
<section aria-labelledby="products-title"><div class="section-heading"><h2 id="products-title">Ürünler</h2><button id="refresh" class="quiet" type="button">Ürünleri yenile</button></div>
<p id="catalog-state" role="status"></p><div id="product-grid" class="product-grid"></div></section>
<aside id="cart" class="cart-panel" aria-labelledby="cart-title"><div class="section-heading"><h2 id="cart-title">Sepetim</h2><button id="clear-cart" class="quiet" type="button">Temizle</button></div>
<ul id="cart-lines" class="cart-lines"></ul><div id="subtotal" class="subtotal"></div>
<p>Fiyatlar güncellenebilir. Sipariş, işletmenin güncel bayi fiyatlarıyla kaydedilir.</p>
<form id="checkout-form">
<fieldset id="checkout-fields">
<label for="delivery-method">Teslimat yöntemi</label><select id="delivery-method"></select>
<fieldset id="shipping-fields" hidden><legend>Teslimat adresi</legend>
<label for="delivery-recipientName">Teslim alacak kişi</label><input id="delivery-recipientName" maxlength="160" autocomplete="shipping name">

<label for="delivery-addressLine1">Adres</label><input id="delivery-addressLine1" maxlength="300" autocomplete="shipping address-line1">

<label for="delivery-addressLine2">Adres devamı (isteğe bağlı)</label><input id="delivery-addressLine2" maxlength="300" autocomplete="shipping address-line2">

<label for="delivery-district">İlçe</label><input id="delivery-district" maxlength="120" autocomplete="shipping address-level2">

<label for="delivery-city">İl / şehir</label><input id="delivery-city" maxlength="120" autocomplete="shipping address-level1">

<label for="delivery-postalCode">Posta kodu (isteğe bağlı)</label><input id="delivery-postalCode" maxlength="32" autocomplete="shipping postal-code">

<label for="delivery-countryCode">Ülke kodu</label><input id="delivery-countryCode" maxlength="2" autocomplete="shipping country" value="TR">
<label for="delivery-note">Teslimat notu (isteğe bağlı)</label><textarea id="delivery-note" maxlength="500" rows="2"></textarea>
<p>Kargo ücreti ayrıca belirlenecektir.</p></fieldset>
<label for="order-note">Sipariş notu (isteğe bağlı)</label><textarea id="order-note" maxlength="2000" rows="3"></textarea>
</fieldset><p id="submission-message" role="alert"></p><button id="submit-order" type="submit" disabled>Siparişi gönder</button>
</form></aside></div>
<noscript><p class="state">Bayi portalını kullanmak için JavaScript'i etkinleştirin.</p></noscript>
</main></body></html>
