<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 $publication = $view['publication']; ?>
<h1><?= e($view['title']) ?></h1>
<figure class="lab-page-photo">
  <img src="<?= e(asset($site, 'site/img/orman-isik.jpg')) ?>" width="1280" height="669" loading="lazy" decoding="async" alt="Ormanda süzülen gün ışığı">
  <figcaption>Sabit sayfa fotoğrafı · <a href="https://commons.wikimedia.org/wiki/File:Sunbeams_through_the_forest.jpg" target="_blank" rel="noopener noreferrer">CLAUDIA DEA / CC BY 2.0</a></figcaption>
</figure>
<div class="prose">
  <?php if ($publication['about'] !== ''): ?><p><?= nl2br(e($publication['about'])) ?></p><?php endif; ?>
  <?php foreach (['policy_note', 'payment_note'] as $key): if (text($publication['info'][$key] ?? '') !== ''): ?><p><?= nl2br(e($publication['info'][$key])) ?></p><?php endif; endforeach; ?>
  <?php render_view('components/business-details', $view, $site); ?>
</div>
