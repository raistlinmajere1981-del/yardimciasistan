<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 render_view('components/hero', $view, $site); ?>
<?php if (count($view['pages']) === 1): $key = $view['status'] === 'ok' ? 'empty' : 'unavailable'; ?>
  <section class="empty-state" role="status">
    <h2><?= e(t($site, 'state.' . $key . '.title')) ?></h2>
    <p><?= e(t($site, 'state.' . $key . '.text')) ?></p>
  </section>
<?php else: ?>
  <div class="page-grid">
    <?php foreach ($view['pages'] as $id => $page): if ($id === 'home') continue; ?>
    <a class="page-link" href="<?= e(page_url($site, $id)) ?>"><?= e(t($site, $page['key'])) ?></a>
    <?php endforeach; ?>
  </div>
<?php endif; ?>
