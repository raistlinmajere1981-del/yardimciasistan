<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 $publication = $view['publication'];
 render_view('components/page-header', ['title' => $view['title'], 'eyebrow' => t($site, 'page.about')], $site); ?>
<div class="page-sections">
  <?php if ($publication['about'] !== ''): ?>
  <section class="content-card prose-card">
    <h2><?= e(t($site, 'about.story')) ?></h2>
    <p><?= nl2br(e($publication['about'])) ?></p>
  </section>
  <?php endif; ?>
  <?php $notes = array_filter(['policy_note' => t($site, 'about.policy'), 'payment_note' => t($site, 'about.payment')], static fn (string $label, string $key): bool => text($publication['info'][$key] ?? '') !== '', ARRAY_FILTER_USE_BOTH); ?>
  <?php if ($notes !== []): ?>
  <section class="content-card prose-card">
    <h2><?= e(t($site, 'about.good_to_know')) ?></h2>
    <?php foreach ($notes as $key => $label): ?><h3><?= e($label) ?></h3><p><?= nl2br(e($publication['info'][$key])) ?></p><?php endforeach; ?>
  </section>
  <?php endif; ?>
  <?php if (has_business_details($publication)): ?>
  <section class="content-card prose-card">
    <h2><?= e(t($site, 'about.practical')) ?></h2>
    <?php render_view('components/business-details', $view, $site); ?>
  </section>
  <?php endif; ?>
</div>
