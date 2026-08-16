<?php
declare(strict_types=1);

const YA_ANDROID_GATE_BASE_DIR = __DIR__ . '/..';

require_once YA_ANDROID_GATE_BASE_DIR . '/lib/android-device-auth.php';

$businessConfig = ya_android_gate_load_config(YA_ANDROID_GATE_BASE_DIR . '/config/business.json');
ya_android_gate_apply_cors($businessConfig);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$deviceId = trim((string) ($_SERVER['HTTP_X_YA_DEVICE_ID'] ?? ''));
if (!ya_android_auth_request_authorized($businessConfig, $deviceId)) {
    ya_android_gate_response(401, [
        'ok' => false,
        'code' => 'android_auth_failed',
        'message' => 'Telefon bağlantısı doğrulanamadı. Cihazı masaüstünden yeniden eşleştirin.'
    ]);
}

// Existing sync.php remains the authoritative transport implementation. The
// Android gate authenticates the per-device credential first, then supplies the
// business secret only inside the same PHP request; the token is never exposed
// to sync.php or returned to the client.
$_SERVER['HTTP_X_YA_SYNC_SECRET'] = trim((string) ($businessConfig['sync_secret'] ?? ''));
unset($_SERVER['HTTP_X_YA_DEVICE_TOKEN']);

require __DIR__ . '/sync.php';

function ya_android_gate_load_config(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    return is_array($decoded) ? $decoded : [];
}

function ya_android_gate_apply_cors(array $businessConfig): void
{
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    $allowed = is_array($businessConfig['allowed_origins'] ?? null) ? $businessConfig['allowed_origins'] : [];
    if ($origin !== '' && (in_array('*', $allowed, true) || in_array($origin, $allowed, true))) {
        header('Access-Control-Allow-Origin: ' . (in_array('*', $allowed, true) ? '*' : $origin));
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-YA-Sync-Secret, X-YA-Device-Token, X-YA-Device-Id');
    header('Access-Control-Max-Age: 86400');
}

function ya_android_gate_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
