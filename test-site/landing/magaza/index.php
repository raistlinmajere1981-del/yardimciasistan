<?php
require_once dirname(__DIR__) . '/inc/site.php';
$pageTitle = 'Mağaza | Yardımcı Asistan';
$pageDescription = 'Ürünleri inceleyin ve siparişinizi bize iletin.';
require dirname(__DIR__) . '/inc/header.php';
?>
<link rel="stylesheet" href="/yardimci-asistan/magaza/storefront.css">
<?php require dirname(__DIR__) . '/yardimci-asistan/magaza/storefront.php'; ?>
<script src="/yardimci-asistan/magaza/storefront.js" data-api-base="/yardimci-asistan/api/" defer></script>
<?php require dirname(__DIR__) . '/inc/footer.php'; ?>
