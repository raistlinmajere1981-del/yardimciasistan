<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
$eyebrow = text($view['eyebrow'] ?? '');
$lede = text($view['lede'] ?? '');
?>
<header class="page-header">
  <?php if ($eyebrow !== ''): ?><p class="eyebrow"><?= e($eyebrow) ?></p><?php endif; ?>
  <h1><?= e($view['title'] ?? '') ?></h1>
  <?php if ($lede !== ''): ?><p class="lede"><?= e($lede) ?></p><?php endif; ?>
</header>
