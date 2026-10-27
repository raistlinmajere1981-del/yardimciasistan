<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<h1><?= e($view['title']) ?></h1>
<div class="collection gallery">
  <?php foreach ($view['publication']['gallery'] as $image): ?>
  <figure><img src="<?= e($image['url']) ?>" alt="<?= e($image['title']) ?>" data-effect-slot="<?= e('gallery.' . $image['id']) ?>" loading="lazy" decoding="async">
    <?php if ($image['title'] !== ''): ?><figcaption><?= e($image['title']) ?></figcaption><?php endif; ?>
  </figure>
  <?php endforeach; ?>
</div>
