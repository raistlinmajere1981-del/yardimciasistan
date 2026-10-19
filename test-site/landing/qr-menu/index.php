<?php require_once dirname(__DIR__) . '/inc/site.php';
if (!site_qr_menu_available()) {
    header('Location: /', true, 302);
    exit;
}

$pageTitle = site_text('QR Menü | Yardımcı Asistan');
$pageDescription = site_text('Güncel menüyü, ürünleri ve fiyatları inceleyin.');
$pageScript = 'qr-menu.js';
require dirname(__DIR__) . '/inc/header.php';
render_site_hero(
    site_text('QR Menü'),
    site_text('Güncel ürünler ve fiyatlar'),
    site_text('Kategorileri keşfedin, ürünleri ve güncel fiyatları inceleyin.')
);
?>
<section class="section qr-menu-section" data-qr-menu-root><div class="shell"><div class="qr-menu-toolbar"><div class="qr-menu-tabs" data-qr-menu-tabs aria-label="<?= site_e(site_text('Menü kategorileri')) ?>"></div><p class="qr-menu-updated" data-qr-menu-updated><?= site_e(site_text('Menü hazırlanıyor.')) ?></p></div><p class="qr-menu-status" data-qr-menu-status role="status"><?= site_e(site_text('Menü yükleniyor...')) ?></p><div class="qr-menu-list" data-qr-menu-list></div></div></section>
<?php require dirname(__DIR__) . '/inc/footer.php'; ?>
