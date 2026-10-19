<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/storage.php';
require_once __DIR__ . '/../lib/public-localization.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    ya_rooms_response(405, [
        'ok' => false,
        'message' => 'Oda kataloğu için GET isteği gerekli.'
    ]);
}

try {
    $catalog = ya_storage_get_publication('room_catalog', [
        'version' => 1,
        'enabled' => false,
        'updated_at' => '',
        'rooms' => []
    ]);
} catch (Throwable $error) {
    ya_rooms_response(503, [
        'ok' => false,
        'message' => $error->getMessage() === 'pdo_sqlite_missing'
            ? 'Oda kataloğu için hostingde PDO_SQLITE eklentisi etkinleştirilmeli.'
            : 'Oda kataloğu şu anda okunamıyor.'
    ]);
}

$publication = is_array($catalog['_publication'] ?? null) ? $catalog['_publication'] : [];
unset($catalog['_publication']);
$serverRevision = (int) ($publication['server_revision'] ?? 0);
$etag = '"ya-rooms-' . $serverRevision . '"';
header('ETag: ' . $etag);
header('Cache-Control: no-cache, must-revalidate');
if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}

$hasPublication = $publication !== [];
$enabled = array_key_exists('enabled', $catalog)
    ? ($catalog['enabled'] === true)
    : $hasPublication;
$rooms = $enabled && is_array($catalog['rooms'] ?? null) ? array_values($catalog['rooms']) : [];
usort($rooms, static function (array $left, array $right): int {
    $order = ((int) ($left['sort_order'] ?? 0)) <=> ((int) ($right['sort_order'] ?? 0));
    return $order !== 0 ? $order : strcmp((string) ($left['name'] ?? ''), (string) ($right['name'] ?? ''));
});

ya_rooms_response(200, [
    'ok' => true,
    'version' => (int) ($catalog['version'] ?? 1),
    'enabled' => $enabled,
    'updated_at' => (string) ($catalog['updated_at'] ?? ''),
    'rooms' => $rooms,
    'localization' => ya_public_localization($catalog['localization'] ?? null, ['room' => ya_localization_records($rooms, 'id', ['name','bed_info','description','price_note'])]),
    'source_revision' => (int) ($publication['source_revision'] ?? 0),
    'server_revision' => $serverRevision
]);

function ya_rooms_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
