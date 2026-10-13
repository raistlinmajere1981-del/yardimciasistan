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
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ya_android_gate_response(405, [
        'ok' => false,
        'code' => 'method_not_allowed',
        'message' => 'Telefon senkronu için POST isteği gerekli.'
    ]);
}

$deviceId = trim((string) ($_SERVER['HTTP_X_YA_DEVICE_ID'] ?? ''));
if (!ya_android_auth_request_authorized($businessConfig, $deviceId)) {
    ya_android_gate_response(401, [
        'ok' => false,
        'code' => 'android_auth_failed',
        'message' => 'Telefon bağlantısı doğrulanamadı. Cihazı masaüstünden yeniden eşleştirin.'
    ]);
}
if (!ya_android_auth_snapshot_has_capabilities(['service.android'])) {
    ya_android_gate_response(403, [
        'ok' => false,
        'code' => 'android_capability_disabled',
        'message' => 'Android bağlantısı bu işletmede etkin değil.'
    ]);
}

// This request-local flag is set only after token validation, never from request payload.
define('YA_ANDROID_DEVICE_AUTHENTICATED', trim((string)($_SERVER['HTTP_X_YA_DEVICE_TOKEN'] ?? '')) !== '');

// Device tokens are intentionally not general sync credentials. They may only
// call the narrow Android transport actions required by the companion.
$rawBody = file_get_contents('php://input') ?: '';
$decodedBody = json_decode($rawBody, true);
if (!is_array($decodedBody)) {
    ya_android_gate_response(400, [
        'ok' => false,
        'code' => 'invalid_json',
        'message' => 'Telefon isteği okunamadı.'
    ]);
}
$action = trim((string) ($decodedBody['action'] ?? ''));
if (!in_array($action, ['android_summary', 'enqueue_android_action', 'local_pairing_ticket'], true)) {
    ya_android_gate_response(403, [
        'ok' => false,
        'code' => 'android_action_scope_denied',
        'message' => 'Bu telefon anahtarı istenen işlemi çalıştıramaz.'
    ]);
}

// Bind the authenticated token to the same device id used by sync.php. This
// prevents a valid staff token from submitting an action as another device.
$payloadDeviceId = trim((string) ($decodedBody['device_id'] ?? ''));
if ($payloadDeviceId === '' || !hash_equals($deviceId, $payloadDeviceId)) {
    ya_android_gate_response(403, [
        'ok' => false,
        'code' => 'device_identity_mismatch',
        'message' => 'Telefon kimliği doğrulanamadı.'
    ]);
}

// Inactive/pending phones may still fetch their empty approval summary, but
// they cannot create queue traffic that the desktop would only reject later.
if ($action === 'enqueue_android_action' && !ya_android_gate_device_active($deviceId)) {
    ya_android_gate_response(403, [
        'ok' => false,
        'code' => 'device_approval_required',
        'message' => 'Bu telefon masaüstünden onaylanmadan işlem gönderemez.'
    ]);
}

// If the included endpoint cannot reopen php://input on a given PHP build, its
// normal $_POST fallback still receives the exact validated payload.
$_POST = $decodedBody;

// Existing sync.php remains the authoritative transport implementation. The
// Android gate authenticates the per-device credential first, then supplies the
// business secret only inside the same PHP request; the token is never exposed
// to sync.php or returned to the client.
$_SERVER['HTTP_X_YA_SYNC_SECRET'] = trim((string) ($businessConfig['sync_secret'] ?? ''));
unset($_SERVER['HTTP_X_YA_DEVICE_TOKEN']);

require __DIR__ . '/sync.php';

function ya_android_gate_device_active(string $deviceId): bool
{
    $snapshot = ya_storage_get_publication('android_snapshot', []);
    $profile = ya_android_auth_device_profile($snapshot, $deviceId);
    $active = $profile['is_active'] ?? false;
    if (is_bool($active)) {
        return $active;
    }
    if (is_string($active)) {
        return in_array(strtolower($active), ['1', 'true', 'yes', 'on'], true);
    }
    return (bool) $active;
}

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
