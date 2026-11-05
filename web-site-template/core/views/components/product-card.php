<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

$record = $view['record']; $image = media_url($record['image_url'] ?? '', $site['module_path']);
$price = price_text($site, $record['price'] ?? null, $record['currency'] ?? ''); ?>
<article class="content-card">
  <?php if ($image !== ''): ?><img src="<?= e($image) ?>" alt="<?= e($record['name']) ?>" loading="lazy" decoding="async"><?php endif; ?>
  <h2><?= e($record['name']) ?></h2>
  <?php if ($price !== ''): ?><p data-format-currency="<?= e($record['price']) ?>" data-currency="<?= e($record['currency']) ?>"><?= e($price) ?></p><?php endif; ?>
</article>
