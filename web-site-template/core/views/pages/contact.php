<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 $contact = $view['publication']['contact']; ?>
<h1><?= e($view['title']) ?></h1>
<dl class="contact-list">
  <?php if ($contact['tel'] !== ''): ?><dt><?= e(t($site, 'contact.phone')) ?></dt><dd><a href="<?= e($contact['tel']) ?>"><?= e($contact['phone']) ?></a></dd><?php endif; ?>
  <?php if ($contact['email'] !== ''): ?><dt><?= e(t($site, 'contact.email')) ?></dt><dd><a href="mailto:<?= e($contact['email']) ?>"><?= e($contact['email']) ?></a></dd><?php endif; ?>
  <?php if ($contact['address'] !== ''): ?><dt><?= e(t($site, 'contact.address')) ?></dt><dd><?= nl2br(e($contact['address'])) ?></dd><?php endif; ?>
</dl>
<?php if ($contact['whatsapp'] !== ''): ?><p><a href="<?= e($contact['whatsapp']) ?>" target="_blank" rel="noopener noreferrer"><?= e(t($site, 'contact.whatsapp')) ?></a></p><?php endif; ?>
<?php if ($contact['embed'] !== ''): ?>
<section class="contact-map" aria-label="<?= e(t($site, 'contact.map_title')) ?>">
  <h2><?= e(t($site, 'contact.map_title')) ?></h2>
  <iframe src="<?= e($contact['embed']) ?>" title="<?= e(t($site, 'contact.map_title')) ?>"
    loading="lazy" referrerpolicy="strict-origin-when-cross-origin"
    allowfullscreen></iframe>
  <?php if ($contact['mapProvider'] === 'osm'): ?>
    <small class="contact-map-attribution"><?= e(t($site, 'contact.map_attribution')) ?></small>
  <?php endif; ?>
</section>
<?php endif; ?>
<?php if ($contact['map'] !== ''): ?><p><a href="<?= e($contact['map']) ?>" target="_blank" rel="noopener noreferrer"><?= e(t($site, $contact['map'] === $contact['embed'] ? 'contact.open_map' : 'contact.directions')) ?></a></p><?php endif; ?>
<?php if (text($view['publication']['info']['directions_note'] ?? '') !== ''): ?><p><?= nl2br(e($view['publication']['info']['directions_note'])) ?></p><?php endif; ?>
<?php foreach ($contact['social'] as $social): ?><p><a href="<?= e(web_url($social['url'])) ?>" target="_blank" rel="noopener noreferrer"><?= e(text($social['platform'] ?? '') ?: t($site, 'contact.social')) ?></a></p><?php endforeach; ?>
