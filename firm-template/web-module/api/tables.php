<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/storage.php';
require_once __DIR__ . '/../lib/public-localization.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    ya_tables_response(405, [
        'ok' => false,
        'message' => 'Masa kataloğu için GET isteği gerekli.'
    ]);
}

try {
    $catalog = ya_storage_get_publication('table_catalog', [
        'version' => 1,
        'enabled' => false,
        'updated_at' => '',
        'tables' => []
    ]);
} catch (Throwable $error) {
    ya_tables_response(503, [
        'ok' => false,
        'message' => $error->getMessage() === 'pdo_sqlite_missing'
            ? 'Masa kataloğu için hostingde PDO_SQLITE eklentisi etkinleştirilmeli.'
            : 'Masa kataloğu şu anda okunamıyor.'
    ]);
}

$publication = is_array($catalog['_publication'] ?? null) ? $catalog['_publication'] : [];
unset($catalog['_publication']);
$serverRevision = (int) ($publication['server_revision'] ?? 0);
$etag = '"ya-tables-' . $serverRevision . '"';
header('ETag: ' . $etag);
header('Cache-Control: no-cache, must-revalidate');
if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}

$enabled = ($catalog['enabled'] ?? false) === true;
$tables = $enabled && is_array($catalog['tables'] ?? null) ? array_values($catalog['tables']) : [];
// Order token digests are private routing material, never a public table field.
$tables = array_map(static function (array $table): array {
    unset($table['orderTokenHash']);
    return $table;
}, $tables);
usort($tables, static function (array $left, array $right): int {
    $order = ((int) ($left['sort_order'] ?? 0)) <=> ((int) ($right['sort_order'] ?? 0));
    return $order !== 0 ? $order : strcmp((string) ($left['name'] ?? ''), (string) ($right['name'] ?? ''));
});

ya_tables_response(200, [
    'ok' => true,
    'version' => (int) ($catalog['version'] ?? 1),
    'enabled' => $enabled,
    'updated_at' => (string) ($catalog['updated_at'] ?? ''),
    'tables' => $tables,
    'localization' => ya_public_localization($catalog['localization'] ?? null, ['table' => ya_localization_records($tables, 'id', ['name','area','description'])]),
    'source_revision' => (int) ($publication['source_revision'] ?? 0),
    'server_revision' => $serverRevision
]);

function ya_tables_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
