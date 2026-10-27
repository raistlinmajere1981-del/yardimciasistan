<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
$labels = [];
foreach ($view['record']['features'] ?? [] as $feature) {
    if (!is_string($feature)) continue;
    $label = t($site, $view['type'] . '.feature.' . $feature);
    if ($label !== '') $labels[] = $label;
}
if ($view['type'] === 'table') {
    $smoking = text($view['record']['smoking_policy'] ?? '');
    $label = t($site, 'table.smoking.' . $smoking);
    if ($label !== '') $labels[] = $label;
}
if ($labels): ?><ul class="resource-features"><?php foreach ($labels as $label): ?><li><?= e($label) ?></li><?php endforeach; ?></ul><?php endif; ?>
