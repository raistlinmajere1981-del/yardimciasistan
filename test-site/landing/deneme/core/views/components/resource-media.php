<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
$record = $view['record'];
$mediaItems = records($record['media'] ?? []);
usort($mediaItems, static fn (array $a, array $b): int => ($a['sort_order'] ?? 0) <=> ($b['sort_order'] ?? 0));
?>
<div class="collection room-media">
<?php foreach ($mediaItems as $media):
$url = media_url($media['url'] ?? '', $site['module_path']);
$kind = $media['kind'] ?? '';
if ($url === '' || !published($media) || !in_array($kind, ['cover','photo','panorama_180','panorama_360','video'], true)) continue;
$title = text($media['title'] ?? '') ?: $record['name']; ?>
<figure>
<?php if ($kind === 'video'): ?><video controls preload="metadata" aria-label="<?= e($title) ?>"><source src="<?= e($url) ?>"></video>
<?php elseif (str_starts_with($kind, 'panorama_')): ?>
<div data-panorama="<?= e($kind) ?>" data-src="<?= e($url) ?>" data-label="<?= e($title) ?>"><img src="<?= e($url) ?>" alt="<?= e($title) ?>" loading="lazy"></div>
<p><?= e(t($site, 'room.panorama.help')) ?></p>
<?php else: ?><a href="<?= e($url) ?>" target="_blank" rel="noopener"><img src="<?= e($url) ?>" alt="<?= e($title) ?>" loading="lazy"></a><?php endif; ?>
<figcaption><a href="<?= e($url) ?>" target="_blank" rel="noopener"><?= e($title) ?></a></figcaption>
</figure>
<?php endforeach; ?>
</div>
