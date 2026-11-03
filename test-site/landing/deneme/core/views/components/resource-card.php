<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

$record = $view['record'];
$isTable = ($view['resource_type'] ?? '') === 'table';
$photos = array_values(array_filter(records($record['media'] ?? []), static fn (array $item): bool => in_array($item['kind'] ?? '', ['cover', 'photo'], true) && published($item)));
usort($photos, static fn (array $a, array $b): int => (($a['kind'] === 'cover' ? 0 : 1) <=> ($b['kind'] === 'cover' ? 0 : 1)) ?: (($a['sort_order'] ?? 0) <=> ($b['sort_order'] ?? 0)));
$image = media_url($photos[0]['url'] ?? '', $site['module_path']);
$resourcePage = $isTable ? 'restaurant' : (in_array($record['id'], array_column($view['rooms'] ?? [], 'id'), true) ? 'rooms' : '');
$detailUrl = $resourcePage !== '' ? page_url($site, $resourcePage) . '&id=' . rawurlencode($record['id']) : '';
$summary = excerpt_text($record['description'] ?? '');
$price = '';
if (!$isTable && is_numeric($record['nightly_price_minor'] ?? null) && (int) $record['nightly_price_minor'] > 0) {
    $price = price_text($site, ((int) $record['nightly_price_minor']) / 100, $record['currency'] ?? '');
}
$smoking = $isTable ? t($site, 'table.smoking.' . text($record['smoking_policy'] ?? '')) : '';
$badge = $isTable ? text($record['area'] ?? '') : (text($record['number'] ?? '') !== '' ? '#' . text($record['number']) : '');
$featureLabels = [];
foreach ($record['features'] ?? [] as $feature) {
    if (!is_string($feature)) continue;
    $label = t($site, ($isTable ? 'table' : 'room') . '.feature.' . $feature);
    if ($label !== '') $featureLabels[] = $label;
}
$featureLabels = array_values(array_unique($featureLabels));
$requestEnabled = !empty($view['request_enabled']);
?>
<article class="content-card resource-card">
  <?php if ($image !== ''): ?>
  <div class="resource-card-media">
    <?php if ($detailUrl !== ''): ?><a href="<?= e($detailUrl) ?>" tabindex="-1" aria-hidden="true"><?php endif; ?>
      <img src="<?= e($image) ?>" alt="<?= e($record['name']) ?>" loading="lazy" decoding="async">
    <?php if ($detailUrl !== ''): ?></a><?php endif; ?>
    <?php if ($badge !== ''): ?><span class="resource-badge"><?= e($badge) ?></span><?php endif; ?>
  </div>
  <?php endif; ?>
  <div class="resource-card-body">
    <h2 class="resource-card-title"><?php if ($detailUrl !== ''): ?><a href="<?= e($detailUrl) ?>"><?= e($record['name']) ?></a><?php else: ?><?= e($record['name']) ?><?php endif; ?></h2>
    <?php if ($summary !== ''): ?><p class="resource-card-summary"><?= e($summary) ?></p><?php endif; ?>
    <dl class="resource-facts">
      <?php if (is_numeric($record['capacity'] ?? null) && $record['capacity'] > 0): ?>
      <div><dt><?= e(t($site, 'content.capacity_label')) ?></dt><dd data-format-number="<?= e($record['capacity']) ?>" data-format-key="content.capacity_value" data-format-value="count"><?= e(t($site, 'content.capacity_value', ['count' => number_text($site, (int) $record['capacity'])])) ?></dd></div>
      <?php endif; ?>
      <?php if (!$isTable && text($record['bed_info'] ?? '') !== ''): ?>
      <div><dt><?= e(t($site, 'room.bed_info')) ?></dt><dd><?= e($record['bed_info']) ?></dd></div>
      <?php endif; ?>
      <?php if (!$isTable && text($record['floor'] ?? '') !== ''): ?>
      <div><dt><?= e(t($site, 'room.floor')) ?></dt><dd><?= e($record['floor']) ?></dd></div>
      <?php endif; ?>
      <?php if ($isTable && text($record['area'] ?? '') !== ''): ?>
      <div><dt><?= e(t($site, 'table.area')) ?></dt><dd><?= e($record['area']) ?></dd></div>
      <?php endif; ?>
      <?php if ($isTable && $smoking !== ''): ?>
      <div><dt><?= e(t($site, 'table.smoking')) ?></dt><dd><?= e($smoking) ?></dd></div>
      <?php endif; ?>
      <?php if ($price !== ''): ?>
      <div class="resource-price"><dt><?= e(t($site, 'room.nightly_price')) ?></dt><dd><span data-format-currency="<?= e(((int) $record['nightly_price_minor']) / 100) ?>" data-currency="<?= e($record['currency']) ?>"><?= e($price) ?></span></dd></div>
      <?php endif; ?>
    </dl>
    <?php if ($featureLabels !== []): ?>
    <ul class="resource-chips" aria-label="<?= e(t($site, 'content.features')) ?>"><?php foreach ($featureLabels as $label): ?><li><?= e($label) ?></li><?php endforeach; ?></ul>
    <?php endif; ?>
    <div class="resource-card-actions">
      <?php if ($detailUrl !== ''): ?><a class="button secondary" href="<?= e($detailUrl) ?>"><?= e(t($site, 'resource.details')) ?></a><?php endif; ?>
      <?php if ($requestEnabled && $isTable): ?><button class="button" data-ya-action="food.reserve" data-ya-resource-type="table" data-ya-resource-id="<?= e($record['id']) ?>" data-ya-resource-name="<?= e($record['name']) ?>" data-ya-image-url="<?= e($image) ?>"><?= e(t($site, 'table.reserve')) ?></button><?php endif; ?>
      <?php if ($requestEnabled && !$isTable): ?><button class="button" data-ya-action="accommodation.reserve" data-ya-resource-type="room" data-ya-resource-id="<?= e($record['id']) ?>" data-ya-resource-name="<?= e($record['name']) ?>" data-ya-image-url="<?= e($image) ?>"><?= e(t($site, 'room.reserve')) ?></button><?php endif; ?>
    </div>
  </div>
</article>
