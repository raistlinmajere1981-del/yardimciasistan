<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 $contact = $view['publication']['contact'];
 render_view('components/page-header', ['title' => $view['title'], 'eyebrow' => t($site, 'page.contact'), 'lede' => t($site, 'contact.lede')], $site); ?>
<div class="contact-layout">
  <section class="content-card contact-card">
    <h2><?= e(t($site, 'contact.reach_us')) ?></h2>
    <dl class="contact-list">
      <?php if ($contact['tel'] !== ''): ?><dt><?= e(t($site, 'contact.phone')) ?></dt><dd><a href="<?= e($contact['tel']) ?>"><?= e($contact['phone']) ?></a></dd><?php endif; ?>
      <?php if ($contact['email'] !== ''): ?><dt><?= e(t($site, 'contact.email')) ?></dt><dd><a href="mailto:<?= e($contact['email']) ?>"><?= e($contact['email']) ?></a></dd><?php endif; ?>
      <?php if ($contact['address'] !== ''): ?><dt><?= e(t($site, 'contact.address')) ?></dt><dd><?= nl2br(e($contact['address'])) ?></dd><?php endif; ?>
    </dl>
    <?php if ($contact['whatsapp'] !== '' || $contact['map'] !== ''): ?>
    <div class="contact-actions">
      <?php if ($contact['whatsapp'] !== ''): ?><a class="button" href="<?= e($contact['whatsapp']) ?>" target="_blank" rel="noopener noreferrer"><?= e(t($site, 'contact.whatsapp')) ?></a><?php endif; ?>
      <?php if ($contact['map'] !== ''): ?><a class="button secondary" href="<?= e($contact['map']) ?>" target="_blank" rel="noopener noreferrer"><?= e(t($site, $contact['map'] === $contact['embed'] ? 'contact.open_map' : 'contact.directions')) ?></a><?php endif; ?>
    </div>
    <?php endif; ?>
    <?php if (text($view['publication']['info']['directions_note'] ?? '') !== ''): ?><p class="contact-note"><?= nl2br(e($view['publication']['info']['directions_note'])) ?></p><?php endif; ?>
    <?php if ($contact['social'] !== []): ?>
    <h3><?= e(t($site, 'contact.social')) ?></h3>
    <ul class="contact-social"><?php foreach ($contact['social'] as $social): ?><li><a href="<?= e(web_url($social['url'])) ?>" target="_blank" rel="noopener noreferrer"><?= e(text($social['platform'] ?? '') ?: t($site, 'contact.social')) ?></a></li><?php endforeach; ?></ul>
    <?php endif; ?>
  </section>
  <?php if ($contact['embed'] !== ''): ?>
  <section class="contact-map content-card" aria-labelledby="contact-map-title">
    <h2 id="contact-map-title"><?= e(t($site, 'contact.map_title')) ?></h2>
    <iframe src="<?= e($contact['embed']) ?>" title="<?= e(t($site, 'contact.map_title')) ?>"
      loading="lazy" referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen></iframe>
    <?php if ($contact['mapProvider'] === 'osm'): ?>
      <small class="contact-map-attribution"><?= e(t($site, 'contact.map_attribution')) ?></small>
    <?php endif; ?>
  </section>
  <?php endif; ?>
</div>
