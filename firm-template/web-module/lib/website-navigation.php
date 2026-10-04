<?php
declare(strict_types=1);
/** Registry snapshot is verified against shared WEBSITE_PAGES; customer hosts omit demoOnly pages. */
function ya_website_pages(): array
{
    return json_decode((string)file_get_contents(__DIR__ . '/../config/website-pages.json'), true, 32, JSON_THROW_ON_ERROR);
}
function ya_website_navigation_projection(mixed $value): array
{
    if (!is_array($value) || array_diff(array_keys($value), ['revision', 'items']) !== []
        || !is_int($value['revision'] ?? null) || $value['revision'] < 1
        || !is_array($value['items'] ?? null) || !array_is_list($value['items']) || count($value['items']) > count(ya_website_pages())) {
        throw new InvalidArgumentException('invalid_website_navigation');
    }
    $known = array_column(ya_website_pages(), 'id'); $seen = []; $items = [];
    foreach ($value['items'] as $item) {
        if (!is_array($item) || array_diff(array_keys($item), ['pageId', 'visible', 'order']) !== []
            || !in_array($item['pageId'] ?? null, $known, true) || isset($seen[$item['pageId']])
            || !is_bool($item['visible'] ?? null) || !is_int($item['order'] ?? null) || $item['order'] < 0 || $item['order'] > 1000) {
            throw new InvalidArgumentException('invalid_website_navigation');
        }
        $seen[$item['pageId']] = true;
        $items[] = ['pageId' => $item['pageId'], 'visible' => $item['visible'], 'order' => $item['order']];
    }
    return ['revision' => $value['revision'], 'items' => $items];
}
/** Availability is supplied by the public host; user visibility never overrides it. */
function ya_website_navigation_items(array $publication, array $availability, bool $demo = false): array
{
    $preferences = array_column($publication['items'] ?? [], null, 'pageId'); $result = [];
    foreach (ya_website_pages() as $index => $page) {
        $preference = $preferences[$page['id']] ?? [];
        if (($page['demoOnly'] ?? false) && !$demo) continue;
        if (!($preference['visible'] ?? $page['userVisible']) || !($availability[$page['availability']] ?? false)) continue;
        $page['order'] = $preference['order'] ?? $page['order']; $page['registryOrder'] = $index; $result[] = $page;
    }
    usort($result, static fn(array $a, array $b): int => [$a['order'], $a['registryOrder']] <=> [$b['order'], $b['registryOrder']]);
    return $result;
}
