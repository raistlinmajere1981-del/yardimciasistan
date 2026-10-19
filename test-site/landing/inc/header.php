<?php
require_once __DIR__ . '/site.php';
require_once __DIR__ . '/flag-language.php';
$pageTitle = $pageTitle ?? SITE_NAME;
$pageDescription = $pageDescription ?? site_text('Yardımcı Asistan’ı keşfedin, canlı örneklerini inceleyin ve kendi bilgisayarınızda deneyin.');
$pageScript = $pageScript ?? '';
header('X-Content-Type-Options: nosniff');
?>
<!doctype html><html lang="<?= site_e(site_language()) ?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="<?= site_e(site_text($pageDescription)) ?>"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#18776b"><title><?= site_e(site_text($pageTitle)) ?></title><link rel="icon" href="/favicon.png"><link rel="stylesheet" href="<?= site_e(site_asset('css/site.css')) ?>"><link rel="stylesheet" href="<?= site_e(site_asset('css/flag-language.css')) ?>"><script>window.DemoEnglish=<?= json_encode(site_english_dictionary(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE) ?>;</script><script src="<?= site_e(site_asset('js/language.js')) ?>" defer></script></head><body>
<a class="skip-link" href="#content"><?= site_e(site_text('İçeriğe geç')) ?></a>
<header class="site-header" data-site-header><div class="shell header-inner"><a class="brand" href="/" aria-label="<?= site_e(site_text('Yardımcı Asistan ana sayfa')) ?>"><span class="brand-mark" aria-hidden="true"><img src="/assets/yardimci-asistan-symbol.png" alt="" width="46" height="46"></span><span class="brand-copy"><strong>Yardımcı Asistan</strong><small><?= site_e(site_text('Keşfet ve dene')) ?></small></span></a><button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="website-nav"><?= site_e(site_text('Menü')) ?></button><nav class="site-nav" id="website-nav" data-site-nav aria-label="<?= site_e(site_text('Site menüsü')) ?>"><?php render_site_links(); ?></nav><?php render_flag_language(site_language(), ['tr', 'en']); ?></div></header><main id="content">
