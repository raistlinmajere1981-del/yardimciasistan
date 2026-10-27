<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<h1><?= e($view['title']) ?></h1>
<div class="collection">
  <?php foreach ($view['publication']['reviews'] as $review): ?>
  <figure class="content-card">
    <blockquote><?= nl2br(e(text($review['text'] ?? ''))) ?></blockquote>
    <figcaption><?= e(text($review['author'] ?? '') ?: t($site, 'content.review.author')) ?></figcaption>
    <?php if (is_numeric($review['rating'] ?? null) && $review['rating'] >= 0 && $review['rating'] <= 5): ?><p data-format-number="<?= e($review['rating']) ?>" data-format-key="content.rating" data-format-value="rating"><?= e(t($site, 'content.rating', ['rating' => number_text($site, (float) $review['rating'])])) ?></p><?php endif; ?>
    <?php $url = web_url($review['google_maps_uri'] ?? ''); if ($url !== ''): ?><a href="<?= e($url) ?>" target="_blank" rel="noopener noreferrer"><?= e(t($site, 'content.review.source')) ?></a><?php endif; ?>
  </figure>
  <?php endforeach; ?>
</div>
