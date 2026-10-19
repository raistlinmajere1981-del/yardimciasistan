<?php require_once dirname(__DIR__) . '/inc/site.php';
$pageTitle = site_text('Hakkımızda | Yardımcı Asistan');
$pageDescription = site_text('İşletme hakkında bilgiler.');
require dirname(__DIR__) . '/inc/header.php';
$text = site_about_text();
render_site_hero(site_text('İşletmemiz'), site_text('Hakkımızda'));
?>
<section class="section"><div class="shell content-grid">
<?php if ($text !== ''): ?>
  <article class="content-copy"><p><?= nl2br(site_e($text)) ?></p></article>
<?php else: ?>
  <p><?= site_e(site_text('İşletme hakkında henüz yayınlanmış bilgi bulunmuyor.')) ?></p>
<?php endif; ?>
</div></section>
<?php require dirname(__DIR__) . '/inc/footer.php'; ?>
