<?php require_once dirname(__DIR__) . '/inc/site.php';
$pageTitle = site_text('Mağaza | Yardımcı Asistan');
$pageDescription = site_text('Ürünleri inceleyin ve siparişinizi bize iletin.');
require dirname(__DIR__) . '/inc/header.php';
?>
<link rel="stylesheet" href="/assets/css/storefront.css">
<?php require dirname(__DIR__) . '/inc/storefront.php'; ?>
<script src="/assets/js/storefront.js" data-api-base="/yardimci-asistan/api/" defer></script>
<?php require dirname(__DIR__) . '/inc/footer.php'; ?>
