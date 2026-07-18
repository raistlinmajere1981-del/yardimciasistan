<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/storage.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    ya_menu_response(405, [
        'ok' => false,
        'message' => 'Menü bilgisi için sayfayı yenileyin.'
    ]);
}

try {
    $menu = ya_read_menu();
} catch (Throwable $error) {
    ya_menu_response(503, [
        'ok' => false,
        'message' => $error->getMessage() === 'pdo_sqlite_missing'
            ? 'QR menü için hostingde PDO_SQLITE eklentisi etkinleştirilmeli.'
            : 'QR menü verisi şu anda okunamıyor.'
    ]);
}
$publication = is_array($menu['_publication'] ?? null) ? $menu['_publication'] : [];
unset($menu['_publication']);
$serverRevision = (int) ($publication['server_revision'] ?? 0);
$etag = '"ya-menu-' . $serverRevision . '"';
header('ETag: ' . $etag);
header('Cache-Control: no-cache, must-revalidate');
if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}
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
$items = array_values(array_filter($items, static function ($item): bool {
    $stockQuantity = $item['stock_quantity'] ?? null;
    $hideWhenOut = ($item['hide_when_out_of_stock'] ?? false) === true;
    return !($stockQuantity !== null && is_numeric($stockQuantity) && $hideWhenOut && (float) $stockQuantity <= 0);
}));
$items = array_values(array_filter($items, static function ($item) use ($activeCategoryIds): bool {
    return isset($activeCategoryIds[(string) ($item['category_id'] ?? '')]);
}));
$items = ya_sort_records($items);

ya_menu_response(200, [
    'ok' => true,
    'categories' => $categories,
    'items' => $items,
    'updated_at' => $menu['updated_at'] ?? '',
    'source_revision' => (int) ($publication['source_revision'] ?? 0),
    'server_revision' => $serverRevision
]);

function ya_read_menu(): array
{
    return ya_storage_get_publication('menu', [
        'categories' => [],
        'items' => [],
        'updated_at' => ''
    ]);
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
