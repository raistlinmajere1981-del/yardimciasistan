<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/public-localization.php';

/** Whitelist projection; web never stores canonical content, private metadata or local paths. */
function ya_marketing_projection(array $candidate): array
{
    if (($candidate['version'] ?? null) !== 1 || !is_bool($candidate['enabled'] ?? null)
        || !is_array($candidate['publications'] ?? null) || count($candidate['publications']) > 1000) {
        throw new InvalidArgumentException('invalid_marketing_projection');
    }
    $items = []; $seen = [];
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/api/sync.php'));
    $base = rtrim(dirname(dirname($script)), '/');
    foreach ($candidate['publications'] as $item) {
        if (!is_array($item) || !is_string($item['id'] ?? null) || preg_match('/^[A-Za-z0-9_-]{1,100}$/', $item['id']) !== 1
            || isset($seen[$item['id']]) || ($item['channel'] ?? '') !== 'website'
            || ($item['placement'] ?? '') !== 'homepage_feature' || !is_int($item['revision'] ?? null) || $item['revision'] < 1
            || !is_bool($item['published'] ?? null) || !is_array($item['images'] ?? null) || count($item['images']) > 20) {
            throw new InvalidArgumentException('invalid_marketing_publication');
        }
        $seen[$item['id']] = true;
        $title = ya_marketing_text($item['title'] ?? null, 240);
        $text = ya_marketing_text($item['text'] ?? null, 12000);
        $images = []; $seenAssets = [];
        foreach ($item['images'] as $index => $image) {
            if (!is_array($image) || !is_string($image['assetId'] ?? null) || preg_match('/^asset_[A-Za-z0-9_-]+$/', $image['assetId']) !== 1
                || isset($seenAssets[$image['assetId']]) || !is_string($image['url'] ?? null) || ($image['sortOrder'] ?? null) !== $index) {
                throw new InvalidArgumentException('invalid_marketing_media');
            }
            $pattern = '~^' . preg_quote($base, '~') . '/media/marketing/([A-Za-z0-9_-]{1,100})/(' . preg_quote($image['assetId'], '~') . '\.[a-f0-9]{64}\.png)$~';
            if (preg_match($pattern, $image['url'], $matches) !== 1) throw new InvalidArgumentException('invalid_marketing_url');
            $file = __DIR__ . '/../media/marketing/' . $matches[1] . '/' . $matches[2];
            $size = is_file($file) ? getimagesize($file) : false;
            if ($size === false || $size[2] !== IMAGETYPE_PNG || $size[0] !== ($image['width'] ?? null) || $size[1] !== ($image['height'] ?? null)) {
                throw new InvalidArgumentException('missing_marketing_media');
            }
            $seenAssets[$image['assetId']] = true;
            $images[] = ['assetId' => $image['assetId'], 'url' => $image['url'], 'altText' => ya_marketing_text($image['altText'] ?? '', 500),
                'width' => $size[0], 'height' => $size[1], 'sortOrder' => $index];
        }
        $items[] = ['id' => $item['id'], 'channel' => 'website', 'placement' => 'homepage_feature', 'revision' => $item['revision'],
            'published' => $item['published'], 'title' => $title, 'text' => $text, 'images' => $item['published'] ? $images : []];
    }
    return ['version' => 1, 'enabled' => $candidate['enabled'], 'publications' => $items,
        'localization' => ya_public_localization($candidate['localization'] ?? null, ['marketing' => ya_localization_records($candidate['enabled'] ? array_filter($items, fn($p) => $p['published']) : [], 'id', ['title','text'])])];
}
function ya_marketing_text(mixed $value, int $max): string
{
    if (!is_string($value) || !mb_check_encoding($value, 'UTF-8') || mb_strlen($value) > $max || str_contains($value, "\0")) {
        throw new InvalidArgumentException('invalid_marketing_text');
    }
    return trim($value);
}
function ya_marketing_publications(): array
{
    $projection = ya_storage_get_publication('marketing_website', ['version' => 1, 'enabled' => false, 'publications' => []]);
    if (!($projection['enabled'] ?? false)) return [];
    return array_values(array_filter($projection['publications'] ?? [], fn(array $item): bool => ($item['published'] ?? false) === true));
}
