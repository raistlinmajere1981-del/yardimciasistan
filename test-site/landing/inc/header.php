<?php
require_once __DIR__ . '/site.php';
$pageTitle = $pageTitle ?? SITE_NAME;
$pageDescription = $pageDescription ?? 'Yardımcı Asistan’ı keşfedin, canlı örneklerini inceleyin ve kendi bilgisayarınızda deneyin.';
$pageScript = $pageScript ?? '';
header('X-Content-Type-Options: nosniff');
?>
<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="<?= site_e($pageDescription) ?>"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#18776b"><title><?= site_e($pageTitle) ?></title><link rel="icon" href="/favicon.png"><link rel="stylesheet" href="<?= site_e(site_asset('css/site.css')) ?>"></head><body>
<a class="skip-link" href="#content">İçeriğe geç</a>
<header class="site-header" data-site-header><div class="shell header-inner"><a class="brand" href="/" aria-label="Yardımcı Asistan ana sayfa"><span class="brand-mark" aria-hidden="true"><img src="/assets/yardimci-asistan-symbol.png" alt="" width="46" height="46"></span><span class="brand-copy"><strong>Yardımcı Asistan</strong><small>Keşfet ve dene</small></span></a><button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="website-nav">Menü</button><nav class="site-nav" id="website-nav" data-site-nav aria-label="Site menüsü"><?php render_site_links(); ?></nav></div></header><main id="content">
