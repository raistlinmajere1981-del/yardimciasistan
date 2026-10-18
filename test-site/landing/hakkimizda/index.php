<?php
$pageTitle = 'Hakkımızda | Yardımcı Asistan';
$pageDescription = 'İşletme hakkında bilgiler.';
require dirname(__DIR__) . '/inc/header.php';
$text = site_about_text();
render_site_hero('İşletmemiz', 'Hakkımızda');
?>
<section class="section"><div class="shell content-grid">
<?php if ($text !== ''): ?>
  <article class="content-copy"><p><?= nl2br(site_e($text)) ?></p></article>
<?php else: ?>
  <p>İşletme hakkında henüz yayınlanmış bilgi bulunmuyor.</p>
<?php endif; ?>
</div></section>
<?php require dirname(__DIR__) . '/inc/footer.php'; ?>
