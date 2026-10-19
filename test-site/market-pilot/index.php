<?php
require_once __DIR__ . '/inc/site.php';
market_header('home');
?>
<section class="hero"><div class="wrap hero-grid"><div class="hero-copy">
<span class="eyebrow" data-ui="Günlük alışveriş">Günlük alışveriş</span>
<h1 data-ui="Günlük ihtiyaçlar, hemen yakınınızda.">Günlük ihtiyaçlar, hemen yakınınızda.</h1>
<p data-business-description></p>
<div class="hero-actions"><a class="button primary" href="/magaza/" data-catalog-link hidden data-ui="Kataloğa göz at">Kataloğa göz at</a><a class="button subtle" href="#iletisim" data-ui="Bize ulaşın">Bize ulaşın</a></div>
</div><?php require __DIR__ . '/inc/hero.php'; ?></div></section>
<section class="section products"><div class="wrap"><h2 data-ui="Ürün grupları">Ürün grupları</h2><p data-category-state role="status" data-ui="Katalog yükleniyor…">Katalog yükleniyor…</p><div class="category-grid" data-category-grid></div></div></section>
<section class="section wrap" data-marketing-section hidden><h2 data-ui="Kampanyalar">Kampanyalar</h2><div class="category-grid" data-marketing-grid></div></section>
<section id="iletisim" class="contact section"><div class="wrap contact-grid"><div><span class="section-kicker" data-ui="İletişim">İletişim</span><h2 data-business-name>Market Pilot</h2><p data-business-about></p></div><div class="contact-details" data-contact><p data-ui="İletişim bilgileri yükleniyor…">İletişim bilgileri yükleniyor…</p></div></div></section>
<?php market_footer(); ?>
