<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
$info = $view['publication']['info'];
$times = [];
foreach (['check_in_time', 'check_out_time', 'breakfast_start_time', 'breakfast_end_time'] as $field) {
    $value = text($info[$field] ?? '');
    if (preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D', $value)) $times[$field] = $value;
}
if ($times): ?>
<dl class="business-times">
<?php foreach ($times as $field => $value): ?><dt><?= e(t($site, 'business.' . $field)) ?></dt><dd><time datetime="<?= e($value) ?>"><?= e(time_text($site, $value)) ?></time></dd><?php endforeach; ?>
</dl>
<?php endif;
$features = business_feature_labels($info, $site);
if ($features): ?>
<h2><?= e(t($site, 'content.features')) ?></h2><ul class="feature-list"><?php foreach (array_unique($features) as $label): ?><li><?= e($label) ?></li><?php endforeach; ?></ul>
<?php endif;
$languages = array_values(array_filter($info['languages'] ?? [], static fn (mixed $value): bool => text($value) !== ''));
if ($languages): ?>
<h2><?= e(t($site, 'content.languages')) ?></h2><ul><?php foreach ($languages as $language): ?><li><?= e($language) ?></li><?php endforeach; ?></ul>
<?php endif; ?>
