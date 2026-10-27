<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<section class="empty-state">
  <h1><?= e(t($site, 'state.missing.title')) ?></h1>
  <p><?= e(t($site, 'state.missing.text')) ?></p>
  <a href="<?= e(page_url($site, 'home')) ?>"><?= e(t($site, 'page.home')) ?></a>
</section>
