<?php
require_once dirname(__DIR__) . '/inc/site.php';
if (!demo_qr_menu_available()) {
    header('Location: /', true, 302);
    exit;
}

$pageTitle = 'QR Menü | Yardımcı Asistan Canlı Referans';
$pageDescription = 'Masaüstünden yayınlanan QR menünün public site örneği.';
$pageScript = 'qr-menu.js';
require dirname(__DIR__) . '/inc/header.php';
render_demo_hero(
    'QR Menü',
    'Güncel ürünler ve fiyatlar',
    'Kategori, ürün, fiyat ve görseller doğrudan Yardımcı Asistan menü yayınından okunur.'
);
?>
<section class="section qr-menu-section" data-qr-menu-root><div class="shell"><div class="qr-menu-toolbar"><div class="qr-menu-tabs" data-qr-menu-tabs aria-label="Menü kategorileri"></div><p class="qr-menu-updated" data-qr-menu-updated>Menü hazırlanıyor.</p></div><p class="qr-menu-status" data-qr-menu-status role="status">Menü yükleniyor...</p><div class="qr-menu-list" data-qr-menu-list></div></div></section>
<?php require dirname(__DIR__) . '/inc/footer.php'; ?>
