<?php
declare(strict_types=1);

const YA_IDENTITY_IMAGE_BASE_DIR = __DIR__ . '/..';
const YA_IDENTITY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

require_once YA_IDENTITY_IMAGE_BASE_DIR . '/lib/storage.php';
require_once YA_IDENTITY_IMAGE_BASE_DIR . '/lib/android-device-auth.php';
require_once YA_IDENTITY_IMAGE_BASE_DIR . '/lib/stock-image-analysis.php';
require_once YA_IDENTITY_IMAGE_BASE_DIR . '/lib/identity-image-analysis.php';

$businessConfig = ya_identity_endpoint_load_config(YA_IDENTITY_IMAGE_BASE_DIR . '/config/business.json');
ya_identity_endpoint_apply_cors($businessConfig);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ya_identity_endpoint_response(405, [
        'ok' => false,
        'code' => 'method_not_allowed',
        'message' => 'Kimlik görseli analizi için POST isteği gerekli.'
    ]);
}
if (!ya_identity_endpoint_authorized($businessConfig)) {
    ya_identity_endpoint_response(401, [
        'ok' => false,
        'code' => 'unauthorized',
        'message' => 'Kimlik görseli analizi izni alınamadı. Güvenlik anahtarını kontrol edin.'
    ]);
}

$contentType = strtolower(ya_stock_image_string($_SERVER['CONTENT_TYPE'] ?? ''));
$contentLength = max(0, (int) ($_SERVER['CONTENT_LENGTH'] ?? 0));
if (str_starts_with($contentType, 'multipart/form-data')
    && $_POST === []
    && $_FILES === []
    && $contentLength > 1024 * 1024) {
    ya_identity_endpoint_response(413, [
        'ok' => false,
        'code' => 'image_too_large',
        'message' => 'Kimlik görseli çok büyük.'
    ]);
}

$source = ya_stock_image_string($_POST['source'] ?? '');
$deviceId = ya_stock_image_string($_POST['device_id'] ?? '');
if (!in_array($source, ['desktop', 'android'], true)) {
    ya_identity_endpoint_response(422, [
        'ok' => false,
        'code' => 'invalid_request',
        'message' => 'Kimlik görseli analiz bilgileri geçersiz.'
    ]);
}
$requiredCapabilities = ['service.ai', 'core.customers'];
if ($source === 'android') {
    $requiredCapabilities[] = 'service.android';
}
if (!ya_android_auth_snapshot_has_capabilities($requiredCapabilities)) {
    ya_identity_endpoint_response(403, [
        'ok' => false,
        'code' => 'identity_capability_disabled',
        'message' => 'AI kimlik analizi bu işletmede etkin değil.'
    ]);
}
if ($source === 'android' && !ya_identity_endpoint_android_admin_authorized($deviceId)) {
    ya_identity_endpoint_response(403, [
        'ok' => false,
        'code' => 'customer_management_permission_denied',
        'message' => 'Kimlik görseli analizi yalnız aktif yönetici cihazlarda kullanılabilir.'
    ]);
}

$upload = $_FILES['image'] ?? null;
if (!is_array($upload)) {
    ya_identity_endpoint_response(422, [
        'ok' => false,
        'code' => 'image_missing',
        'message' => 'Analiz edilecek kimlik görseli seçilmedi.'
    ]);
}
$uploadError = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);
if (in_array($uploadError, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
    ya_identity_endpoint_response(413, [
        'ok' => false,
        'code' => 'image_too_large',
        'message' => 'Kimlik görseli çok büyük.'
    ]);
}
if ($uploadError !== UPLOAD_ERR_OK) {
    ya_identity_endpoint_response(422, [
        'ok' => false,
        'code' => 'image_unreadable',
        'message' => 'Kimlik görseli okunamadı.'
    ]);
}
$temporaryPath = ya_stock_image_string($upload['tmp_name'] ?? '');
$size = (int) ($upload['size'] ?? 0);
if ($temporaryPath === '' || !is_uploaded_file($temporaryPath) || $size <= 0) {
    ya_identity_endpoint_response(422, [
        'ok' => false,
        'code' => 'image_unreadable',
        'message' => 'Kimlik görseli okunamadı.'
    ]);
}
if ($size > YA_IDENTITY_IMAGE_MAX_BYTES) {
    @unlink($temporaryPath);
    ya_identity_endpoint_response(413, [
        'ok' => false,
        'code' => 'image_too_large',
        'message' => 'Kimlik görseli çok büyük.'
    ]);
}

$status = 500;
$payload = ['ok' => false, 'code' => 'analysis_failed', 'message' => 'Kimlik görseli analiz edilemedi.'];
try {
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = strtolower((string) $finfo->file($temporaryPath));
    if ($mimeType === 'image/jpg') {
        $mimeType = 'image/jpeg';
    }
    if (!in_array($mimeType, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        $status = 415;
        $payload = ['ok' => false, 'code' => 'unsupported_image_type', 'message' => 'Desteklenmeyen kimlik görseli türü.'];
    } elseif (@getimagesize($temporaryPath) === false) {
        $status = 422;
        $payload = ['ok' => false, 'code' => 'image_unreadable', 'message' => 'Kimlik görseli okunamadı.'];
    } else {
        $imageHash = strtolower((string) hash_file('sha256', $temporaryPath));
        $providedHash = strtolower(ya_stock_image_string($_POST['image_hash'] ?? ''));
        if ($providedHash !== '' && (preg_match('/^[a-f0-9]{64}$/', $providedHash) !== 1 || !hash_equals($imageHash, $providedHash))) {
            $status = 422;
            $payload = ['ok' => false, 'code' => 'image_hash_mismatch', 'message' => 'Kimlik görseli güvenli biçimde doğrulanamadı.'];
        } else {
            $aiConfig = is_file(YA_IDENTITY_IMAGE_BASE_DIR . '/config/ai.php')
                ? require YA_IDENTITY_IMAGE_BASE_DIR . '/config/ai.php'
                : [];
            $aiConfig = is_array($aiConfig) ? $aiConfig : [];
            if (!ya_stock_image_bool($aiConfig['enabled'] ?? false)) {
                $status = 422;
                $payload = ['ok' => false, 'code' => 'ai_disabled', 'message' => 'AI görsel analizi işletme ayarlarında kapalı.'];
            } else {
                $result = ya_identity_image_analyze($aiConfig, $temporaryPath, $mimeType);
                if (!($result['ok'] ?? false)) {
                    $status = 502;
                    $payload = [
                        'ok' => false,
                        'code' => ya_stock_image_string($result['code'] ?? 'analysis_failed'),
                        'message' => ya_stock_image_string($result['message'] ?? 'Kimlik görseli analiz edilemedi.'),
                        'provider_status' => max(0, (int) ($result['provider_status'] ?? 0))
                    ];
                } else {
                    $analysis = ya_identity_image_sanitize_analysis($result['analysis'] ?? []);
                    $status = 200;
                    $payload = [
                        'ok' => true,
                        'message' => 'Kimlik alanları okundu. Kaydetmeden önce bilgileri kontrol edin.',
                        'image_hash' => $imageHash,
                        'analysis' => $analysis
                    ];
                }
            }
        }
    }
} catch (Throwable) {
    $status = 500;
    $payload = ['ok' => false, 'code' => 'analysis_failed', 'message' => 'Kimlik görseli analiz edilemedi.'];
} finally {
    if (is_file($temporaryPath)) {
        @unlink($temporaryPath);
    }
}

ya_identity_endpoint_response($status, $payload);

function ya_identity_endpoint_android_admin_authorized(string $deviceId): bool
{
    if (preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $deviceId) !== 1) {
        return false;
    }
    $snapshot = ya_storage_get_publication('android_snapshot', []);
    $profiles = is_array($snapshot['androidPermissions'] ?? null) ? $snapshot['androidPermissions'] : [];
    $profile = $profiles[$deviceId] ?? null;
    return is_array($profile)
        && ya_stock_image_bool($profile['is_active'] ?? false)
        && ya_stock_image_string($profile['role'] ?? '') === 'admin'
        && in_array('customer.manage', is_array($profile['permissions'] ?? null) ? $profile['permissions'] : [], true);
}

function ya_identity_endpoint_authorized(array $businessConfig): bool
{
    $configured = ya_stock_image_string($businessConfig['sync_secret'] ?? '');
    $provided = ya_stock_image_string($_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? '');
    return $configured !== '' && $provided !== '' && hash_equals($configured, $provided);
}

function ya_identity_endpoint_load_config(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    return is_array($decoded) ? $decoded : [];
}

function ya_identity_endpoint_apply_cors(array $businessConfig): void
{
    $origin = ya_stock_image_string($_SERVER['HTTP_ORIGIN'] ?? '');
    $allowed = is_array($businessConfig['allowed_origins'] ?? null) ? $businessConfig['allowed_origins'] : [];
    if ($origin !== '' && (in_array('*', $allowed, true) || in_array($origin, $allowed, true))) {
        header('Access-Control-Allow-Origin: ' . (in_array('*', $allowed, true) ? '*' : $origin));
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-YA-Sync-Secret');
    header('Access-Control-Max-Age: 86400');
}

function ya_identity_endpoint_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
