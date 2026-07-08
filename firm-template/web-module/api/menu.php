<?php
declare(strict_types=1);

const YA_MENU_FILE = __DIR__ . '/../data/menu.json';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    ya_menu_response(405, [
        'ok' => false,
        'message' => 'Menü bilgisi için sayfayı yenileyin.'
    ]);
}

$menu = ya_read_menu();
$categories = array_values(array_filter($menu['categories'] ?? [], static function ($category): bool {
    return ($category['is_active'] ?? true) === true;
}));
$categories = ya_sort_records($categories);
$activeCategoryIds = array_flip(array_map(static function ($category): string {
    return (string) ($category['id'] ?? '');
}, $categories));

$items = array_values(array_filter($menu['items'] ?? [], static function ($item): bool {
    return ($item['is_available'] ?? true) === true;
}));
$items = array_values(array_filter($items, static function ($item) use ($activeCategoryIds): bool {
    return isset($activeCategoryIds[(string) ($item['category_id'] ?? '')]);
}));
$items = ya_sort_records($items);

ya_menu_response(200, [
    'ok' => true,
    'categories' => $categories,
    'items' => $items,
    'updated_at' => $menu['updated_at'] ?? ''
]);

function ya_read_menu(): array
{
    if (!is_file(YA_MENU_FILE)) {
        return [
            'categories' => [],
            'items' => [],
            'updated_at' => ''
        ];
    }

    $json = file_get_contents(YA_MENU_FILE);
    $data = json_decode($json ?: '{}', true);

    return is_array($data) ? $data : [
        'categories' => [],
        'items' => [],
        'updated_at' => ''
    ];
}

function ya_sort_records(array $records): array
{
    usort($records, static function (array $left, array $right): int {
        $leftOrder = (int) ($left['sort_order'] ?? 0);
        $rightOrder = (int) ($right['sort_order'] ?? 0);

        if ($leftOrder !== $rightOrder) {
            return $leftOrder <=> $rightOrder;
        }

        return strcmp((string) ($left['name'] ?? ''), (string) ($right['name'] ?? ''));
    });

    return $records;
}

function ya_menu_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
