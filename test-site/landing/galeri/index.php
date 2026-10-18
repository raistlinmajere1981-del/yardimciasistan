<?php
$pageTitle = 'Galeri | Yardımcı Asistan';
$pageDescription = 'İşletme fotoğraf galerisi.';
require dirname(__DIR__) . '/inc/header.php';
$images = site_gallery_images();
render_site_hero('İşletmemiz', 'Galeri');
?>
<section class="section"><div class="shell">
<?php if ($images !== []): ?>
<div class="demo-public-gallery" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem">
<?php foreach ($images as $image): ?>
<figure style="margin:0"><img style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:.8rem" src="<?= site_e($image['url']) ?>" alt="<?= site_e($image['title'] ?: 'İşletme fotoğrafı') ?>" loading="lazy">
<?php if ($image['title'] !== ''): ?><figcaption><?= site_e($image['title']) ?></figcaption><?php endif; ?></figure>
<?php endforeach; ?></div>
<?php else: ?><p>Henüz yayınlanmış galeri fotoğrafı bulunmuyor.</p><?php endif; ?>
</div></section>
<?php require dirname(__DIR__) . '/inc/footer.php'; ?>
