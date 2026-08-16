<?php
declare(strict_types=1);

const YA_ANDROID_IDENTITY_GATE_BASE_DIR = __DIR__ . '/..';

require_once YA_ANDROID_IDENTITY_GATE_BASE_DIR . '/lib/android-device-auth.php';

$businessConfig = ya_android_identity_gate_load_config(YA_ANDROID_IDENTITY_GATE_BASE_DIR . '/config/business.json');
$deviceId = trim((string) ($_SERVER['HTTP_X_YA_DEVICE_ID'] ?? ''));
if (!ya_android_auth_request_authorized($businessConfig, $deviceId)) {
    ya_android_identity_gate_response(401, [
        'ok' => false,
        'code' => 'android_auth_failed',
        'message' => 'Telefon bağlantısı doğrulanamadı. Cihazı masaüstünden yeniden eşleştirin.'
    ]);
}

$formDeviceId = trim((string) ($_POST['device_id'] ?? ''));
if ($formDeviceId === '' || !hash_equals($deviceId, $formDeviceId)) {
    ya_android_identity_gate_response(403, [
        'ok' => false,
        'code' => 'device_identity_mismatch',
        'message' => 'Telefon kimliği doğrulanamadı.'
    ]);
}

$_SERVER['HTTP_X_YA_SYNC_SECRET'] = trim((string) ($businessConfig['sync_secret'] ?? ''));
unset($_SERVER['HTTP_X_YA_DEVICE_TOKEN']);
require __DIR__ . '/identity-image-analysis.php';

function ya_android_identity_gate_load_config(string $path): array
{
    if (!is_file($path)) return [];
    $decoded = json_decode((string) file_get_contents($path), true);
    return is_array($decoded) ? $decoded : [];
}

function ya_android_identity_gate_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
