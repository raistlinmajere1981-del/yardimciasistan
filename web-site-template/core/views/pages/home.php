<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 render_view('components/hero', $view, $site); ?>
<?php if (count($view['pages']) === 1): $key = $view['status'] === 'ok' ? 'empty' : 'unavailable'; ?>
  <section class="empty-state" role="status">
    <h2><?= e(t($site, 'state.' . $key . '.title')) ?></h2>
    <p><?= e(t($site, 'state.' . $key . '.text')) ?></p>
  </section>
<?php else: ?>
  <section class="home-links" aria-labelledby="home-links-title">
    <h2 id="home-links-title"><?= e(t($site, 'home.explore')) ?></h2>
    <div class="page-grid">
      <?php foreach ($view['pages'] as $id => $page): if ($id === 'home') continue; ?>
      <a class="page-link" href="<?= e(page_url($site, $id)) ?>"><span><?= e(t($site, $page['key'])) ?></span><span aria-hidden="true">→</span></a>
      <?php endforeach; ?>
    </div>
  </section>
<?php endif; ?>
