<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 $publication = $view['publication']; ?>
<h1><?= e($view['title']) ?></h1>
<div class="prose">
  <?php if ($publication['about'] !== ''): ?><p><?= nl2br(e($publication['about'])) ?></p><?php endif; ?>
  <?php foreach (['policy_note', 'payment_note'] as $key): if (text($publication['info'][$key] ?? '') !== ''): ?><p><?= nl2br(e($publication['info'][$key])) ?></p><?php endif; endforeach; ?>
  <?php render_view('components/business-details', $view, $site); ?>
</div>
