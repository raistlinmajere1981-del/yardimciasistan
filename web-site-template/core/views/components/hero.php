<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<section class="hero">
  <h1><?= e($view['publication']['name'] ?: t($site, 'site.title')) ?></h1>
  <?php if ($view['publication']['description'] !== ''): ?><p class="lede"><?= nl2br(e($view['publication']['description'])) ?></p><?php endif; ?>
</section>
