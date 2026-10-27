<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<h1><?= e($view['title']) ?></h1>
<div class="collection">
  <?php foreach ($view['publication']['announcements'] as $item): ?>
  <article class="content-card"><h2><?= e($item['title']) ?></h2><p><?= nl2br(e($item['text'])) ?></p>
    <?php foreach (records($item['images'] ?? []) as $image): $url = media_url($image['url'] ?? '', $site['module_path']); if ($url === '' || !published($image)) continue; ?>
    <img src="<?= e($url) ?>" alt="<?= e(text($image['altText'] ?? '')) ?>" loading="lazy" decoding="async">
    <?php endforeach; ?>
  </article>
  <?php endforeach; ?>
</div>
