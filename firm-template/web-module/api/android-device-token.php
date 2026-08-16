<?php
declare(strict_types=1);

const YA_ANDROID_TOKEN_BASE_DIR = __DIR__ . '/..';

require_once YA_ANDROID_TOKEN_BASE_DIR . '/lib/android-device-auth.php';

$businessConfig = ya_android_token_load_config(YA_ANDROID_TOKEN_BASE_DIR . '/config/business.json');
ya_android_token_apply_cors($businessConfig);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ya_android_token_response(405, [
        'ok' => false,
        'code' => 'method_not_allowed',
        'message' => 'Cihaz eşleştirmesi için POST isteği gerekli.'
    ]);
}

$configuredSecret = trim((string) ($businessConfig['sync_secret'] ?? ''));
$providedSecret = trim((string) ($_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? ''));
if ($configuredSecret === '' || $providedSecret === '' || !hash_equals($configuredSecret, $providedSecret)) {
    ya_android_token_response(401, [
        'ok' => false,
        'code' => 'bootstrap_auth_failed',
        'message' => 'İlk cihaz eşleştirme anahtarı doğrulanamadı.'
    ]);
}

$deviceId = trim((string) ($_SERVER['HTTP_X_YA_DEVICE_ID'] ?? ''));
if (preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $deviceId) !== 1) {
    ya_android_token_response(422, [
        'ok' => false,
        'code' => 'invalid_device_id',
        'message' => 'Telefon kimliği geçersiz.'
    ]);
}

$snapshot = ya_storage_get_publication('android_snapshot', []);
$profiles = is_array($snapshot['androidPermissions'] ?? null) ? $snapshot['androidPermissions'] : [];
$profile = is_array($profiles[$deviceId] ?? null) ? $profiles[$deviceId] : [];
if (!ya_android_token_bool($profile['is_active'] ?? false)) {
    ya_android_token_response(403, [
        'ok' => false,
        'code' => 'device_approval_required',
        'message' => 'Bu telefon masaüstünden onay bekliyor.'
    ]);
}

$deviceToken = ya_android_auth_issue_token($deviceId);
ya_android_token_response(201, [
    'ok' => true,
    'message' => 'Telefon için kişisel bağlantı anahtarı oluşturuldu.',
    'device_id' => $deviceId,
    'device_token' => $deviceToken,
    'issued_at' => date(DATE_ATOM)
]);

function ya_android_token_bool(mixed $value): bool
{
    if (is_bool($value)) {
        return $value;
    }
    if (is_string($value)) {
        return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
    }
    return (bool) $value;
}

function ya_android_token_load_config(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    return is_array($decoded) ? $decoded : [];
}

function ya_android_token_apply_cors(array $businessConfig): void
{
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    $allowed = is_array($businessConfig['allowed_origins'] ?? null) ? $businessConfig['allowed_origins'] : [];
    if ($origin !== '' && (in_array('*', $allowed, true) || in_array($origin, $allowed, true))) {
        header('Access-Control-Allow-Origin: ' . (in_array('*', $allowed, true) ? '*' : $origin));
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-YA-Sync-Secret, X-YA-Device-Id');
    header('Access-Control-Max-Age: 86400');
}

function ya_android_token_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
