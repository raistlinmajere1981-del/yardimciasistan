<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';

require_once YA_BASE_DIR . '/lib/storage.php';
require_once YA_BASE_DIR . '/lib/public-room-availability.php';

$businessConfig = ya_availability_load_json(YA_CONFIG_FILE, []);
ya_availability_apply_cors($businessConfig);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    ya_availability_response(405, [
        'ok' => false,
        'live' => false,
        'code' => 'method_not_allowed',
        'message' => 'Müsaitlik sorgusu yalnız okunur GET isteği kabul eder.'
    ]);
}

$startDate = ya_availability_string($_GET['start_date'] ?? $_GET['startDate'] ?? '');
$endDate = ya_availability_string($_GET['end_date'] ?? $_GET['endDate'] ?? '');
$guestCount = ya_availability_int($_GET['guest_count'] ?? $_GET['guestCount'] ?? 1, 1);

try {
    $snapshot = ya_storage_get_publication('android_snapshot', []);
    $result = ya_public_room_availability_query($snapshot, $startDate, $endDate, $guestCount);
    $status = (int) ($result['http_status'] ?? (($result['ok'] ?? false) ? 200 : 409));
    unset($result['http_status']);
    ya_availability_response($status, $result);
} catch (Throwable $error) {
    $storageUnavailable = $error->getMessage() === 'pdo_sqlite_missing';
    ya_availability_response($storageUnavailable ? 503 : 500, [
        'ok' => false,
        'live' => false,
        'code' => $storageUnavailable ? 'storage_unavailable' : 'availability_query_failed',
        'message' => $storageUnavailable
            ? 'Canlı müsaitlik verisi şu anda okunamıyor.'
            : 'Müsaitlik sorgusu tamamlanamadı.'
    ]);
}

function ya_availability_apply_cors(array $businessConfig): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOrigins = $businessConfig['allowed_origins'] ?? [];
    if ($origin !== '' && is_array($allowedOrigins)) {
        $allowAny = in_array('*', $allowedOrigins, true);
        $allowOrigin = in_array($origin, $allowedOrigins, true);
        if ($allowAny || $allowOrigin) {
            header('Access-Control-Allow-Origin: ' . ($allowAny ? '*' : $origin));
            header('Vary: Origin');
        }
    }
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}

function ya_availability_load_json(string $path, mixed $fallback): mixed
{
    if (!is_file($path)) return $fallback;
    $data = json_decode((string) file_get_contents($path), true);
    return $data === null ? $fallback : $data;
}

function ya_availability_string(mixed $value): string
{
    return is_scalar($value) ? trim((string) $value) : '';
}

function ya_availability_int(mixed $value, int $fallback): int
{
    if (is_int($value)) return $value;
    if (is_string($value) && preg_match('/^-?\d+$/', trim($value)) === 1) return (int) $value;
    if (is_float($value)) return (int) $value;
    return $fallback;
}

function ya_availability_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}
