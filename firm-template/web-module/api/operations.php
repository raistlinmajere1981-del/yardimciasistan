<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';

require_once YA_BASE_DIR . '/lib/storage.php';

$config = ya_operations_load_json(YA_CONFIG_FILE);
ya_operations_apply_cors($config);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    ya_operations_response(405, [
        'ok' => false,
        'message' => 'Operasyon özeti için GET isteği gerekli.'
    ]);
}

$configuredSecret = ya_operations_string($config['sync_secret'] ?? '');
$providedSecret = ya_operations_string($_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? '');
if ($configuredSecret === '' || $providedSecret === '' || !hash_equals($configuredSecret, $providedSecret)) {
    ya_operations_response(401, [
        'ok' => false,
        'message' => 'Güncelleme izni alınamadı. Güvenlik anahtarını kontrol edin.'
    ]);
}

try {
    $snapshot = ya_storage_get_publication('android_snapshot', []);
    $publication = is_array($snapshot['_publication'] ?? null) ? $snapshot['_publication'] : [];
    unset($snapshot['_publication']);

    $summary = is_array($snapshot['summary'] ?? null) ? $snapshot['summary'] : [];
    $updatedAt = ya_operations_string($snapshot['updated_at'] ?? '');

    ya_operations_response(200, [
        'ok' => true,
        'message' => $updatedAt === '' ? 'Masaüstü operasyon özeti henüz yayınlanmadı.' : 'Canlı operasyon özeti alındı.',
        'published' => $updatedAt !== '',
        'updated_at' => $updatedAt,
        'operations' => [
            'pending_daily_tasks' => ya_operations_nonnegative_int($summary['pending_daily_tasks'] ?? 0),
            'today_tasks' => ya_operations_nonnegative_int($summary['today_tasks'] ?? 0),
            'available_rooms' => ya_operations_nonnegative_int($summary['available_rooms'] ?? 0),
            'total_rooms' => ya_operations_nonnegative_int($summary['total_rooms'] ?? 0),
            'available_tables' => ya_operations_nonnegative_int($summary['available_tables'] ?? 0),
            'occupied_tables' => ya_operations_nonnegative_int($summary['occupied_tables'] ?? 0),
            'bill_waiting_tables' => ya_operations_nonnegative_int($summary['bill_waiting_tables'] ?? 0),
            'active_table_orders' => ya_operations_nonnegative_int($summary['active_table_orders'] ?? 0),
            'pending_reservations' => ya_operations_nonnegative_int($summary['pending_reservations'] ?? 0),
            'prepared_whatsapp_messages' => ya_operations_nonnegative_int($summary['prepared_whatsapp_messages'] ?? 0),
            'waiting_responses' => ya_operations_nonnegative_int($summary['waiting_responses'] ?? 0),
            'active_menu_categories' => ya_operations_nonnegative_int($summary['active_menu_categories'] ?? 0),
            'available_menu_items' => ya_operations_nonnegative_int($summary['available_menu_items'] ?? 0),
            'customer_count' => ya_operations_nonnegative_int($summary['customer_count'] ?? 0)
        ],
        'source_revision' => ya_operations_nonnegative_int($publication['source_revision'] ?? 0),
        'server_revision' => ya_storage_server_revision()
    ]);
} catch (Throwable $error) {
    $storageUnavailable = $error->getMessage() === 'pdo_sqlite_missing';
    ya_operations_response($storageUnavailable ? 503 : 500, [
        'ok' => false,
        'message' => $storageUnavailable
            ? 'Hostingde PHP SQLite desteği etkin değil.'
            : 'Operasyon özeti şu anda okunamıyor.'
    ]);
}

function ya_operations_load_json(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $json = file_get_contents($path);
    $value = json_decode($json ?: '', true);
    return is_array($value) ? $value : [];
}

function ya_operations_apply_cors(array $config): void
{
    $origin = ya_operations_string($_SERVER['HTTP_ORIGIN'] ?? '');
    $allowedOrigins = $config['allowed_origins'] ?? [];
    if ($origin !== '' && is_array($allowedOrigins)) {
        $allowAny = in_array('*', $allowedOrigins, true);
        if ($allowAny || in_array($origin, $allowedOrigins, true)) {
            header('Access-Control-Allow-Origin: ' . ($allowAny ? '*' : $origin));
            header('Vary: Origin');
        }
    }
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-YA-Sync-Secret');
    header('Access-Control-Max-Age: 86400');
}

function ya_operations_nonnegative_int(mixed $value): int
{
    return max(0, is_numeric($value) ? (int) $value : 0);
}

function ya_operations_string(mixed $value): string
{
    return trim((string) $value);
}

function ya_operations_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
