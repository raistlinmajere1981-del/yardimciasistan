<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/storage.php';
require_once __DIR__ . '/../lib/online-catalog.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    ya_catalog_response(405, ['ok' => false, 'message' => 'Ürün kataloğu için GET isteği gerekli.']);
}
try {
    $stored = ya_storage_get_publication('online_catalog', []);
    $catalog = ya_online_catalog_projection($stored);
    $publication = is_array($stored['_publication'] ?? null) ? $stored['_publication'] : [];
} catch (Throwable $error) {
    ya_catalog_response(503, ['ok' => false, 'message' => 'Ürün kataloğu şu anda okunamıyor.']);
}
$serverRevision = (int)($publication['server_revision'] ?? 0);
$etag = '"ya-online-catalog-' . $serverRevision . '"';
header('ETag: ' . $etag);
header('Cache-Control: no-cache, must-revalidate');
if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}
ya_catalog_response(200, [
    'ok' => true, ...$catalog,
    'source_revision' => (int)($publication['source_revision'] ?? 0),
    'server_revision' => $serverRevision
]);

function ya_catalog_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
