<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<?php render_view('components/page-header', ['title' => $view['title'], 'eyebrow' => t($site, 'page.menu'), 'lede' => t($site, 'menu.lede')], $site); ?>
<form class="menu-filter" method="get" action="<?= e($site['base_path'] . '/') ?>">
  <input type="hidden" name="page" value="menu"><input type="hidden" name="lang" value="<?= e($site['language']['code']) ?>">
  <?php if ($view['table_token'] !== ''): ?><input type="hidden" name="table" value="<?= e($view['table_token']) ?>"><?php endif; ?>
  <label for="menu-category"><?= e(t($site, 'menu.category')) ?></label>
  <select id="menu-category" name="category" data-menu-category>
    <option value=""><?= e(t($site, 'menu.all')) ?></option>
    <?php foreach ($view['menu_categories'] as $category): ?><option value="<?= e($category['id']) ?>"<?= $view['menu_category'] === $category['id'] ? ' selected' : '' ?>><?= e($category['name']) ?></option><?php endforeach; ?>
  </select><button type="submit"><?= e(t($site, 'menu.apply')) ?></button>
</form>
<?php $menuUpdatedAt = public_datetime($view['publication']['menu_updated_at']); ?>
<p class="menu-publication-note"><?php if ($menuUpdatedAt !== null): ?><span><?= e(t($site, 'menu.updated')) ?> </span><time data-menu-updated data-format-date-time data-format-date="<?= e($menuUpdatedAt->format(\DateTimeInterface::ATOM)) ?>" datetime="<?= e($menuUpdatedAt->format(\DateTimeInterface::ATOM)) ?>"><?= e(date_text($site, $menuUpdatedAt, true)) ?></time> · <?php endif; ?><a href="<?= e(page_url($site, 'menu') . ($view['menu_category'] !== '' ? '&category=' . rawurlencode($view['menu_category']) : '') . ($view['table_token'] !== '' ? '&table=' . rawurlencode($view['table_token']) : '')) ?>"><?= e(t($site, 'publication.refresh')) ?></a></p>
<?php foreach ($view['publication']['categories'] as $category):
    if ($view['menu_category'] !== '' && $view['menu_category'] !== $category['id']) continue;
    $items = array_filter($view['publication']['menu'], static fn (array $item): bool => $item['category_id'] === $category['id']);
    if ($items === []) continue; ?>
<section class="menu-category"><h2><?= e($category['name']) ?></h2>
  <?php if (text($category['description'] ?? '') !== ''): ?><p><?= e($category['description']) ?></p><?php endif; ?>
  <ul class="menu-list"><?php foreach ($items as $record): ?>
    <li data-menu-entry-id="<?= e($record['id']) ?>" data-menu-name="<?= e($record['name']) ?>" data-menu-price="<?= e($record['price'] ?? '') ?>" data-menu-currency="<?= e($record['currency'] ?? '') ?>"><div>
      <?php $image = media_url($record['image_url'] ?? '', $site['module_path']); if ($image !== ''): ?><img class="menu-image" src="<?= e($image) ?>" alt="<?= e($record['name']) ?>" loading="lazy"><?php endif; ?>
      <h3><?= e($record['name']) ?></h3>
      <?php if (($record['is_featured'] ?? false) === true): ?><span class="menu-featured"><?= e(t($site, 'menu.featured')) ?></span><?php endif; ?>
      <?php if (text($record['description'] ?? '') !== ''): ?><p><?= e($record['description']) ?></p><?php endif; ?>
      <?php foreach (['allergens', 'tags'] as $field): $values = array_values(array_filter($record[$field] ?? [], static fn (mixed $v): bool => text($v) !== '')); if ($values === []) continue; ?>
      <p class="menu-<?= e($field) ?>"><strong><?= e(t($site, 'menu.' . $field)) ?>:</strong> <?= e(implode(', ', $values)) ?></p>
      <?php endforeach; ?>
    </div>
    <?php $price = price_text($site, $record['price'] ?? null, $record['currency'] ?? ''); if ($price !== ''): ?><span data-format-currency="<?= e($record['price']) ?>" data-currency="<?= e($record['currency']) ?>"><?= e($price) ?></span><?php endif; ?></li>
  <?php endforeach; ?></ul>
</section>
<?php endforeach; ?>

<?php if (($view['publication']['features']['table_orders'] ?? false) && ($view['table_token'] ?? '') !== ''): ?>
<section class="menu-table-order" data-table-order data-table-token="<?= e($view['table_token']) ?>">
  <p data-table-order-status role="status"></p>
  <h2><?= e(t($site, 'table_order.cart_title')) ?></h2>
  <div data-table-order-cart></div>
  <label for="table-order-note"><?= e(t($site, 'table_order.note')) ?></label>
  <textarea id="table-order-note" data-table-order-note maxlength="500" rows="2"></textarea>
  <p data-table-order-total></p>
  <button type="button" data-table-order-submit disabled><?= e(t($site, 'table_order.submit')) ?></button>
</section>
<?php endif; ?>
