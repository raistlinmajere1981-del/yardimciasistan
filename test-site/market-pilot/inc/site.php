<?php
declare(strict_types=1);
require_once __DIR__ . '/flag-language.php';
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
$requested = $_GET['lang'] ?? $_COOKIE['market_language'] ?? 'tr';
$requested = $requested === 'en' ? 'en' : 'tr';
if (isset($_GET['lang']) && is_string($_GET['lang']) && in_array($_GET['lang'], ['tr', 'en'], true)) {
    setcookie('market_language', $requested, ['expires'=>time()+31536000, 'path'=>'/',
        'secure'=>($_SERVER['HTTPS'] ?? '') === 'on', 'httponly'=>true, 'samesite'=>'Lax']);
}
function market_escape(mixed $value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function market_header(string $page): void {
    global $requested;
    ?>
<!-- market-pilot-site -->
<!doctype html><html lang="tr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><meta name="theme-color" content="#17352d">
<title>Market Pilot</title>
<link rel="stylesheet" href="/assets/market.css"><link rel="stylesheet" href="/assets/flag-language.css">
<script id="market-config" type="application/json"><?= json_encode(['requestedLanguage'=>$requested,
    'english'=>json_decode((string)file_get_contents(dirname(__DIR__).'/assets/i18n/en.json'),true)], JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_THROW_ON_ERROR) ?></script>
<script src="/assets/flag-language.js" defer></script><script src="/assets/market.js" defer></script>
</head><body data-page="<?= market_escape($page) ?>">
<a class="skip-link" href="#icerik" data-ui="İçeriğe geç">İçeriğe geç</a>
<header class="site-header"><div class="wrap header-inner">
<a class="brand" href="/"><span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span><span data-business-name>Market Pilot</span></a>
<nav aria-label="Ana menü" data-ui-aria="Ana menü"><a href="/magaza/" data-catalog-link hidden data-ui="Ürün kataloğu">Ürün kataloğu</a><a href="/#iletisim" data-ui="İletişim">İletişim</a></nav>
<div data-language-picker hidden><?php render_flag_language('tr', ['tr','en']); ?></div>
</div></header>
<noscript><p class="wrap">Yayın verilerini görüntülemek için JavaScript gereklidir. / JavaScript is required to view published content.</p></noscript>
<main id="icerik">
<?php }
function market_footer(): void { ?>
</main>
<section id="asistan" class="assistant wrap" aria-labelledby="assistant-title">
<h2 id="assistant-title" data-ui="Market asistanı">Market asistanı</h2>
<p data-chat-state role="status" data-ui="Hizmet bilgileri yükleniyor…">Hizmet bilgileri yükleniyor…</p>
<form data-chat-form hidden><label for="message" data-ui="Sorunuz">Sorunuz</label>
<textarea id="message" name="message" maxlength="1200" required rows="3"></textarea>
<button class="button primary" type="submit" data-ui="Gönder">Gönder</button></form>
<p data-chat-answer class="chat-answer" aria-live="polite"></p>
</section>
<footer class="footer"><div class="wrap footer-inner"><span data-business-name>Market Pilot</span><a href="/#iletisim" data-ui="İletişim">İletişim</a></div></footer>
</body></html>
<?php }
function market_catalog(): void { ?>
<section class="section wrap catalog" aria-labelledby="catalog-title">
<h1 id="catalog-title" data-ui="Ürün kataloğu">Ürün kataloğu</h1>
<form data-filter-form class="catalog-filters" role="search">
<div class="filter-field"><label for="catalog-search" data-ui="Ürün ara">Ürün ara</label><input id="catalog-search" name="q" type="search" maxlength="180" autocomplete="off"></div>
<div class="filter-field"><label for="catalog-category" data-ui="Kategori">Kategori</label><select id="catalog-category" name="category"><option value="" data-ui="Tüm kategoriler">Tüm kategoriler</option></select></div>
<button class="button subtle" type="button" data-reload data-ui="Ürünleri yenile">Ürünleri yenile</button>
</form>
<p data-catalog-state role="status" data-ui="Katalog yükleniyor…">Katalog yükleniyor…</p>
<div class="product-grid" data-product-grid></div>
<nav class="pagination" data-pagination hidden aria-label="Katalog sayfaları" data-ui-aria="Katalog sayfaları">
<button class="button subtle" data-previous data-ui="Önceki">Önceki</button><span data-page-number aria-live="polite"></span><button class="button subtle" data-next data-ui="Sonraki">Sonraki</button>
</nav>
</section>
<?php }
