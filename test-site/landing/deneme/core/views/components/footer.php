<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<footer class="site-footer"><div class="shell">
  <nav class="footer-navigation" aria-label="<?= e(t($site, 'nav.footer')) ?>"><?php render_navigation($view, $site); ?></nav>
  <?php if ($view['publication']['name'] !== ''): ?><small>© <?= e(number_text($site, (int) date('Y'))) ?> <?= e($view['publication']['name']) ?></small><?php endif; ?>
</div></footer>
