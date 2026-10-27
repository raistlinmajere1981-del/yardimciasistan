<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

$record = $view['record'];
$photos = array_values(array_filter(records($record['media'] ?? []), static fn (array $item): bool => in_array($item['kind'] ?? '', ['cover', 'photo'], true) && published($item)));
usort($photos, static fn (array $a, array $b): int => (($a['kind'] === 'cover' ? 0 : 1) <=> ($b['kind'] === 'cover' ? 0 : 1)) ?: (($a['sort_order'] ?? 0) <=> ($b['sort_order'] ?? 0)));
$image = media_url($photos[0]['url'] ?? '', $site['module_path']);
$resourcePage = in_array($record['id'], array_column($view['rooms'] ?? [], 'id'), true) ? 'rooms' : (($view['resource_type'] ?? '') === 'table' ? 'restaurant' : '');
$detailUrl = empty($view['detail']) && $resourcePage !== '' ? page_url($site, $resourcePage) . '&id=' . rawurlencode($record['id']) : '';
?>
<article class="content-card">
  <?php if ($image !== '' && empty($view['detail'])): ?><?php if ($detailUrl !== ''): ?><a href="<?= e($detailUrl) ?>"><?php endif; ?><img src="<?= e($image) ?>" alt="<?= e($record['name']) ?>" loading="lazy" decoding="async"><?php if ($detailUrl !== ''): ?></a><?php endif; ?><?php endif; ?>
  <?php if (empty($view['detail'])): ?><h2><?php if ($detailUrl !== ''): ?><a href="<?= e($detailUrl) ?>"><?= e($record['name']) ?></a><?php else: ?><?= e($record['name']) ?><?php endif; ?></h2><?php endif; ?>
  <?php if (is_numeric($record['capacity'] ?? null) && $record['capacity'] > 0): ?><p data-format-number="<?= e($record['capacity']) ?>" data-format-key="content.capacity" data-format-value="count"><?= e(t($site, 'content.capacity', ['count' => number_text($site, (int) $record['capacity'])])) ?></p><?php endif; ?>
  <?php foreach (['area', 'bed_info', 'description', 'price_note'] as $field): if (text($record[$field] ?? '') !== ''): ?><p><?= nl2br(e($record[$field])) ?></p><?php endif; endforeach; ?>
  <?php foreach (['number', 'floor'] as $field): if (text($record[$field] ?? '') !== ''): ?><p><strong><?= e(t($site, 'room.' . $field)) ?>:</strong> <?= e($record[$field]) ?></p><?php endif; endforeach; ?>
  <?php if (is_numeric($record['nightly_price_minor'] ?? null)):
      $price = price_text($site, $record['nightly_price_minor'] / 100, $record['currency'] ?? '');
      if ($price !== ''): ?><p data-format-currency="<?= e($record['nightly_price_minor'] / 100) ?>" data-currency="<?= e($record['currency']) ?>" data-format-key="content.nightly" data-format-value="price"><?= e(t($site, 'content.nightly', ['price' => $price])) ?></p><?php endif;
  endif; ?>
  <?php if (($view['resource_type'] ?? '') === 'table'): ?>
    <?php render_view('components/resource-features', ['record'=>$record, 'type'=>'table'], $site); ?>
    <?php render_view('components/resource-media', ['record'=>$record], $site); ?>
    <?php if (!empty($view['request_enabled'])): ?><button class="button" data-ya-action="food.reserve" data-ya-resource-type="table" data-ya-resource-id="<?= e($record['id']) ?>" data-ya-resource-name="<?= e($record['name']) ?>" data-ya-image-url="<?= e($image) ?>"><?= e(t($site, 'table.reserve')) ?></button><?php endif; ?>
  <?php endif; ?>
</article>
