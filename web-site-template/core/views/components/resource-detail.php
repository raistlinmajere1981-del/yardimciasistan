<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

$record = $view['record'];
$type = ($view['type'] ?? '') === 'table' ? 'table' : 'room';
$isTable = $type === 'table';
$page = $isTable ? 'restaurant' : 'rooms';
$backUrl = page_url($site, $page);

$mediaItems = array_values(array_filter(records($record['media'] ?? []), static fn (array $item): bool => in_array($item['kind'] ?? '', ['cover', 'photo', 'panorama_180', 'panorama_360', 'video'], true) && published($item)));
usort($mediaItems, static fn (array $a, array $b): int => (($a['kind'] ?? '') === 'cover' ? 0 : 1) <=> (($b['kind'] ?? '') === 'cover' ? 0 : 1) ?: (($a['sort_order'] ?? 0) <=> ($b['sort_order'] ?? 0)));
$cover = null;
foreach ($mediaItems as $item) {
    if (in_array($item['kind'] ?? '', ['cover', 'photo'], true) && media_url($item['url'] ?? '', $site['module_path']) !== '') {
        $cover = $item;
        break;
    }
}
$coverUrl = $cover !== null ? media_url($cover['url'] ?? '', $site['module_path']) : '';
$badge = $isTable
    ? (text($record['area'] ?? '') !== '' ? text($record['area']) : t($site, 'page.restaurant'))
    : (text($record['number'] ?? '') !== '' ? t($site, 'room.number') . ' ' . text($record['number']) : t($site, 'page.rooms'));
$smoking = $isTable ? t($site, 'table.smoking.' . text($record['smoking_policy'] ?? '')) : '';
$price = '';
if (!$isTable && is_numeric($record['nightly_price_minor'] ?? null) && (int) $record['nightly_price_minor'] > 0) {
    $price = price_text($site, ((int) $record['nightly_price_minor']) / 100, $record['currency'] ?? '');
}
$features = [];
foreach ($record['features'] ?? [] as $feature) {
    if (!is_string($feature)) continue;
    $label = t($site, $type . '.feature.' . $feature);
    if ($label !== '') $features[] = $label;
}
$features = array_values(array_unique($features));
$description = text($record['description'] ?? '');
$priceNote = text($record['price_note'] ?? '');
$requestEnabled = !empty($view['request_enabled']);
$requestAction = $isTable ? 'food.reserve' : 'accommodation.reserve';
$requestLabel = $isTable ? t($site, 'table.reserve') : t($site, 'room.reserve');
// Legacy publications may omit media IDs. Exclude only the selected cover record,
// not every image whose missing ID happens to compare equal to an empty string.
$gallery = array_values(array_filter($mediaItems, static fn (array $item): bool => $cover === null || $item !== $cover));
?>
<article class="resource-detail">
  <p class="resource-back"><a href="<?= e($backUrl) ?>">← <?= e(t($site, 'page.' . $page)) ?></a></p>
  <header class="resource-detail-hero<?= $coverUrl === '' ? ' resource-detail-hero--text' : '' ?>">
    <div class="resource-detail-intro">
      <p class="eyebrow"><?= e($badge) ?></p>
      <h1><?= e($record['name']) ?></h1>
      <?php if ($description !== ''): ?><p class="lede"><?= e(excerpt_text($description, 240)) ?></p><?php endif; ?>
      <?php if ($requestEnabled): ?><button class="button" data-ya-action="<?= e($requestAction) ?>" data-ya-resource-type="<?= e($type) ?>" data-ya-resource-id="<?= e($record['id']) ?>" data-ya-resource-name="<?= e($record['name']) ?>" data-ya-image-url="<?= e($coverUrl) ?>"><?= e($requestLabel) ?></button><?php endif; ?>
    </div>
    <?php if ($coverUrl !== ''): ?>
    <figure class="resource-detail-cover">
      <a href="<?= e($coverUrl) ?>" target="_blank" rel="noopener"><img src="<?= e($coverUrl) ?>" alt="<?= e($record['name']) ?>" decoding="async"></a>
    </figure>
    <?php endif; ?>
  </header>

  <div class="resource-detail-body">
    <div class="resource-detail-main">
      <?php if ($description !== ''): ?>
      <section class="resource-section" aria-labelledby="resource-description">
        <h2 id="resource-description"><?= e(t($site, 'resource.description')) ?></h2>
        <p><?= nl2br(e($description)) ?></p>
      </section>
      <?php endif; ?>
      <?php if ($gallery !== []): ?>
      <section class="resource-section" aria-labelledby="resource-gallery">
        <h2 id="resource-gallery"><?= e(t($site, 'resource.gallery')) ?></h2>
        <?php render_view('components/resource-media', ['record' => $record, 'items' => $gallery], $site); ?>
      </section>
      <?php endif; ?>
      <?php if ($features !== []): ?>
      <section class="resource-section" aria-labelledby="resource-features">
        <h2 id="resource-features"><?= e(t($site, 'content.features')) ?></h2>
        <ul class="resource-features"><?php foreach ($features as $label): ?><li><?= e($label) ?></li><?php endforeach; ?></ul>
      </section>
      <?php endif; ?>
      <?php if ($priceNote !== ''): ?>
      <section class="resource-section" aria-labelledby="resource-price-note">
        <h2 id="resource-price-note"><?= e(t($site, 'resource.price_note')) ?></h2>
        <p><?= nl2br(e($priceNote)) ?></p>
      </section>
      <?php endif; ?>
    </div>
    <aside class="resource-detail-aside">
      <div class="resource-panel">
        <h2><?= e(t($site, 'resource.info')) ?></h2>
        <dl class="resource-facts resource-facts--stacked">
          <?php if (is_numeric($record['capacity'] ?? null) && $record['capacity'] > 0): ?>
          <div><dt><?= e(t($site, 'content.capacity_label')) ?></dt><dd data-format-number="<?= e($record['capacity']) ?>" data-format-key="content.capacity_value" data-format-value="count"><?= e(t($site, 'content.capacity_value', ['count' => number_text($site, (int) $record['capacity'])])) ?></dd></div>
          <?php endif; ?>
          <?php if (!$isTable && text($record['bed_info'] ?? '') !== ''): ?>
          <div><dt><?= e(t($site, 'room.bed_info')) ?></dt><dd><?= e($record['bed_info']) ?></dd></div>
          <?php endif; ?>
          <?php if (!$isTable && text($record['floor'] ?? '') !== ''): ?>
          <div><dt><?= e(t($site, 'room.floor')) ?></dt><dd><?= e($record['floor']) ?></dd></div>
          <?php endif; ?>
          <?php if (!$isTable && text($record['number'] ?? '') !== ''): ?>
          <div><dt><?= e(t($site, 'room.number')) ?></dt><dd><?= e($record['number']) ?></dd></div>
          <?php endif; ?>
          <?php if ($isTable && text($record['area'] ?? '') !== ''): ?>
          <div><dt><?= e(t($site, 'table.area')) ?></dt><dd><?= e($record['area']) ?></dd></div>
          <?php endif; ?>
          <?php if ($isTable && $smoking !== ''): ?>
          <div><dt><?= e(t($site, 'table.smoking')) ?></dt><dd><?= e($smoking) ?></dd></div>
          <?php endif; ?>
        </dl>
        <?php if ($price !== ''): ?>
        <p class="resource-detail-price"><span data-format-currency="<?= e(((int) $record['nightly_price_minor']) / 100) ?>" data-currency="<?= e($record['currency']) ?>" data-format-key="content.nightly" data-format-value="price"><?= e(t($site, 'content.nightly', ['price' => $price])) ?></span></p>
        <?php endif; ?>
        <?php if ($requestEnabled): ?><button class="button" data-ya-action="<?= e($requestAction) ?>" data-ya-resource-type="<?= e($type) ?>" data-ya-resource-id="<?= e($record['id']) ?>" data-ya-resource-name="<?= e($record['name']) ?>" data-ya-image-url="<?= e($coverUrl) ?>"><?= e($requestLabel) ?></button><?php endif; ?>
      </div>
    </aside>
  </div>
</article>
