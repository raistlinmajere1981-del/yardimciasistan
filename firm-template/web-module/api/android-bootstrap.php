<?php
declare(strict_types=1);

const YA_ANDROID_BOOTSTRAP_BASE_DIR = __DIR__ . '/..';

require_once YA_ANDROID_BOOTSTRAP_BASE_DIR . '/lib/android-device-auth.php';

$businessConfig = ya_android_bootstrap_load_config(YA_ANDROID_BOOTSTRAP_BASE_DIR . '/config/business.json');
ya_android_bootstrap_apply_cors($businessConfig);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ya_android_bootstrap_response(405, [
        'ok' => false,
        'code' => 'method_not_allowed',
        'message' => 'Android kurulum eşleştirmesi için POST isteği gerekli.'
    ]);
}

$rawBody = file_get_contents('php://input') ?: '';
$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    ya_android_bootstrap_response(400, [
        'ok' => false,
        'code' => 'invalid_json',
        'message' => 'Kurulum eşleştirme isteği okunamadı.'
    ]);
}

$ticket = trim((string) ($payload['bootstrap_ticket'] ?? ''));
$parts = explode('.', $ticket);
if (count($parts) !== 3 || $parts[0] !== 'yab1') {
    ya_android_bootstrap_response(401, [
        'ok' => false,
        'code' => 'bootstrap_ticket_invalid',
        'message' => 'Kurulum eşleştirme bileti geçersiz.'
    ]);
}
$encoded = (string) ($parts[1] ?? '');
$signature = strtolower((string) ($parts[2] ?? ''));
$syncSecret = trim((string) ($businessConfig['sync_secret'] ?? ''));
if ($encoded === '' || preg_match('/^[a-f0-9]{64}$/', $signature) !== 1 || $syncSecret === '') {
    ya_android_bootstrap_response(401, [
        'ok' => false,
        'code' => 'bootstrap_ticket_invalid',
        'message' => 'Kurulum eşleştirme bileti doğrulanamadı.'
    ]);
}
$expectedSignature = hash_hmac('sha256', $encoded, $syncSecret);
if (!hash_equals($expectedSignature, $signature)) {
    ya_android_bootstrap_response(401, [
        'ok' => false,
        'code' => 'bootstrap_ticket_invalid',
        'message' => 'Kurulum eşleştirme bileti doğrulanamadı.'
    ]);
}

$decodedText = base64_decode(strtr($encoded, '-_', '+/'), true);
$ticketPayload = is_string($decodedText) ? json_decode($decodedText, true) : null;
if (!is_array($ticketPayload)) {
    ya_android_bootstrap_response(401, [
        'ok' => false,
        'code' => 'bootstrap_ticket_invalid',
        'message' => 'Kurulum eşleştirme bileti okunamadı.'
    ]);
}

$version = (int) ($ticketPayload['v'] ?? 0);
$desktopId = trim((string) ($ticketPayload['desktop_id'] ?? ''));
$issuedAt = (int) ($ticketPayload['iat'] ?? 0);
$expiresAt = (int) ($ticketPayload['exp'] ?? 0);
$nonce = trim((string) ($ticketPayload['nonce'] ?? ''));
$now = time();

if (
    $version !== 1
    || preg_match('/^desktop-[A-Za-z0-9._:-]{8,120}$/', $desktopId) !== 1
    || preg_match('/^[a-f0-9]{32}$/', $nonce) !== 1
    || $issuedAt <= 0
    || $expiresAt <= $issuedAt
    || ($expiresAt - $issuedAt) > 300
    || $issuedAt > ($now + 30)
    || $expiresAt < $now
) {
    ya_android_bootstrap_response(401, [
        'ok' => false,
        'code' => 'bootstrap_ticket_invalid',
        'message' => 'Kurulum eşleştirme biletinin süresi veya içeriği geçersiz.'
    ]);
}

$snapshot = ya_storage_get_publication('android_snapshot', []);
if (!ya_android_auth_snapshot_has_capabilities(['service.android'], $snapshot)) {
    ya_android_bootstrap_response(403, [
        'ok' => false,
        'code' => 'android_capability_disabled',
        'message' => 'Android bağlantısı bu işletmede etkin değil.'
    ]);
}
$metadata = is_array($snapshot['_publication'] ?? null) ? $snapshot['_publication'] : [];
$publishedDesktopId = trim((string) ($metadata['source_client_id'] ?? ''));
if ($publishedDesktopId === '' || !hash_equals($publishedDesktopId, $desktopId)) {
    ya_android_bootstrap_response(409, [
        'ok' => false,
        'code' => 'desktop_identity_mismatch',
        'message' => 'Kurulum bileti bu işletmenin güncel masaüstüyle eşleşmiyor.'
    ]);
}

if (!ya_android_auth_consume_bootstrap_nonce($nonce)) {
    ya_android_bootstrap_response(409, [
        'ok' => false,
        'code' => 'bootstrap_ticket_replayed',
        'message' => 'Kurulum eşleştirme bileti daha önce kullanılmış.'
    ]);
}

$deviceId = trim((string) ($_SERVER['HTTP_X_YA_DEVICE_ID'] ?? ''));
if (preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $deviceId) !== 1) {
    ya_android_bootstrap_response(422, [
        'ok' => false,
        'code' => 'invalid_device_id',
        'message' => 'Telefon kimliği geçersiz.'
    ]);
}

$deviceName = trim((string) ($payload['device_name'] ?? ''));
$appVersion = trim((string) ($payload['app_version'] ?? ''));
ya_storage_record_android_device([
    'device_id' => $deviceId,
    'device_name' => $deviceName,
    'app_version' => $appVersion,
    'last_seen_at' => date(DATE_ATOM)
]);

$deviceToken = ya_android_auth_issue_token($deviceId);
ya_android_bootstrap_response(201, [
    'ok' => true,
    'message' => 'Android kurulumu güvenli biçimde işletmeye bağlandı.',
    'device_id' => $deviceId,
    'device_token' => $deviceToken,
    'approval_required' => true,
    'issued_at' => date(DATE_ATOM)
]);

function ya_android_bootstrap_load_config(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    return is_array($decoded) ? $decoded : [];
}

function ya_android_bootstrap_apply_cors(array $businessConfig): void
{
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    $allowed = is_array($businessConfig['allowed_origins'] ?? null) ? $businessConfig['allowed_origins'] : [];
    if ($origin !== '' && (in_array('*', $allowed, true) || in_array($origin, $allowed, true))) {
        header('Access-Control-Allow-Origin: ' . (in_array('*', $allowed, true) ? '*' : $origin));
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-YA-Device-Id');
    header('Access-Control-Max-Age: 86400');
}

function ya_android_bootstrap_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
