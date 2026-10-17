<?php
declare(strict_types=1);

$site = [
    'name' => 'Market',
    'eyebrow' => 'Mahallenizin marketi',
    'headline' => 'Günlük ihtiyaçlar, hemen yakınınızda.',
    'description' => 'Günlük alışverişiniz için pratik ve sade bir durak.',
    'phone' => '',
    'address' => '',
    'hours' => '',
];
$localConfig = __DIR__ . '/site.local.php';
if (is_file($localConfig)) {
    $overrides = require $localConfig;
    if (is_array($overrides)) {
        $site = array_replace($site, array_intersect_key($overrides, $site));
    }
}
function market_escape(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
$catalogReady = is_file(__DIR__ . '/yardimci-asistan/magaza/index.php');
$phoneDigits = preg_replace('/[^+0-9]/', '', (string) $site['phone']) ?: '';
?>
<!-- market-pilot-site -->
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#17352d">
  <meta name="description" content="<?= market_escape($site['description']) ?>">
  <title><?= market_escape($site['name']) ?> · Mahallenizin marketi</title>
  <link rel="stylesheet" href="/assets/market.css">
</head>
<body>
  <a class="skip-link" href="#icerik">İçeriğe geç</a>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="brand" href="/" aria-label="<?= market_escape($site['name']) ?> ana sayfa">
        <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
        <span><?= market_escape($site['name']) ?><small>SEMT MARKETİ</small></span>
      </a>
      <nav aria-label="Ana menü">
        <a href="#urunler">Ürün grupları</a>
        <a href="#iletisim">İletişim</a>
        <?php if ($catalogReady): ?><a class="nav-market" href="/yardimci-asistan/magaza/">Ürün kataloğu <span aria-hidden="true">↗</span></a><?php endif; ?>
      </nav>
    </div>
  </header>
  <main id="icerik">
    <section class="hero">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <span class="eyebrow"><span class="live-dot" aria-hidden="true"></span><?= market_escape($site['eyebrow']) ?></span>
          <h1><?= market_escape($site['headline']) ?></h1>
          <p><?= market_escape($site['description']) ?></p>
          <div class="hero-actions">
            <a class="button primary" href="#urunler">Neler var? <span aria-hidden="true">↗</span></a>
            <a class="button subtle" href="#iletisim">Bize ulaşın <span aria-hidden="true">→</span></a>
          </div>
          <p class="hero-note">Yakınınızda. İhtiyacınız olduğunda.</p>
        </div>
        <div class="hero-art" role="img" aria-label="Market rafında günlük ihtiyaç ürünlerini temsil eden sade çizim">
          <div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div>
          <div class="art-label"><span class="art-label-dot"></span> Sade alışveriş</div>
          <div class="shelf">
            <div class="shelf-row">
              <div class="package tall peach"><i></i><b></b></div>
              <div class="package bottle"><i></i></div>
              <div class="package carton yellow"><i></i><b></b></div>
              <div class="package small cream"><i></i></div>
            </div>
            <div class="shelf-bar"></div>
            <div class="shelf-row second">
              <div class="package carton sage"><i></i><b></b></div>
              <div class="package small orange"><i></i></div>
              <div class="package tall cream"><i></i><b></b></div>
              <div class="package bottle pale"><i></i></div>
            </div>
            <div class="shelf-bar"></div>
          </div>
        </div>
      </div>
    </section>
    <section id="urunler" class="products section">
      <div class="wrap">
        <div class="section-heading">
          <div><span class="section-kicker">GÜNLÜK ALIŞVERİŞ</span><h2>Aradığınız şeyler,<br>bir arada.</h2></div>
          <p>İhtiyaçlar değişir. Yakınınızdaki market hep işinizi kolaylaştırır.</p>
        </div>
        <div class="category-grid">
          <article class="category-card"><span class="category-icon icon-snack" aria-hidden="true">◒</span><span class="category-number">01 /</span><h3>Atıştırmalıklar</h3><p>Günün küçük molaları için.</p></article>
          <article class="category-card"><span class="category-icon icon-drink" aria-hidden="true">◉</span><span class="category-number">02 /</span><h3>İçecekler</h3><p>Serinletici ve günlük seçenekler.</p></article>
          <article class="category-card"><span class="category-icon icon-home" aria-hidden="true">▦</span><span class="category-number">03 /</span><h3>Temel ihtiyaçlar</h3><p>Ev ve günlük yaşam için.</p></article>
        </div>
        <?php if ($catalogReady): ?>
          <div class="catalog-callout"><div><strong>Ürün kataloğu</strong><p>Yayımlanmış ürünlerimizi çevrimiçi görüntüleyebilirsiniz.</p></div><a class="button dark" href="/yardimci-asistan/magaza/">Kataloğa göz at <span aria-hidden="true">↗</span></a></div>
        <?php endif; ?>
      </div>
    </section>
    <section id="iletisim" class="contact section">
      <div class="wrap contact-grid">
        <div><span class="section-kicker">İLETİŞİM</span><h2>Uğramak için<br>bir sebep yeter.</h2><p>Konum ve iletişim bilgilerini buradan takip edebilirsiniz.</p></div>
        <div class="contact-details">
          <?php if (trim((string) $site['address']) !== ''): ?><div class="detail"><span>ADRES</span><strong><?= market_escape($site['address']) ?></strong></div><?php endif; ?>
          <?php if (trim((string) $site['hours']) !== ''): ?><div class="detail"><span>ÇALIŞMA SAATLERİ</span><strong><?= market_escape($site['hours']) ?></strong></div><?php endif; ?>
          <?php if ($phoneDigits !== ''): ?><div class="detail"><span>TELEFON</span><a href="tel:<?= market_escape($phoneDigits) ?>"><?= market_escape($site['phone']) ?></a></div><?php endif; ?>
          <?php if (trim((string) $site['address']) === '' && trim((string) $site['hours']) === '' && $phoneDigits === ''): ?><div class="detail"><span>YAKINDA</span><strong>İletişim bilgileri eklenecek.</strong></div><?php endif; ?>
        </div>
      </div>
    </section>
  </main>
  <footer class="footer"><div class="wrap footer-inner"><span><?= market_escape($site['name']) ?></span><span>Mahallenizdeki market · <?= date('Y') ?></span></div></footer>
</body>
</html>
