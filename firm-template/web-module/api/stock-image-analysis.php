<?php
declare(strict_types=1);

const YA_STOCK_IMAGE_BASE_DIR = __DIR__ . '/..';
const YA_STOCK_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

require_once YA_STOCK_IMAGE_BASE_DIR . '/lib/storage.php';
require_once YA_STOCK_IMAGE_BASE_DIR . '/lib/stock-image-analysis.php';

$businessConfig = ya_stock_endpoint_load_config(YA_STOCK_IMAGE_BASE_DIR . '/config/business.json');
ya_stock_endpoint_apply_cors($businessConfig);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ya_stock_endpoint_response(405, ['ok' => false, 'code' => 'method_not_allowed', 'message' => 'Görsel analizi için POST isteği gerekli.']);
}
if (!ya_stock_endpoint_authorized($businessConfig)) {
    ya_stock_endpoint_response(401, ['ok' => false, 'code' => 'unauthorized', 'message' => 'Görsel analizi izni alınamadı. Güvenlik anahtarını kontrol edin.']);
}

$contentType = strtolower(ya_stock_image_string($_SERVER['CONTENT_TYPE'] ?? ''));
$contentLength = max(0, (int) ($_SERVER['CONTENT_LENGTH'] ?? 0));
if (str_starts_with($contentType, 'multipart/form-data')
    && $_POST === []
    && $_FILES === []
    && $contentLength > 1024 * 1024) {
    ya_stock_endpoint_response(413, ['ok' => false, 'code' => 'image_too_large', 'message' => 'Görsel çok büyük.']);
}

$source = ya_stock_image_string($_POST['source'] ?? '');
$deviceId = ya_stock_image_string($_POST['device_id'] ?? '');
$importId = ya_stock_image_string($_POST['import_id'] ?? '');
if (!in_array($source, ['desktop', 'android'], true)
    || preg_match('/^[A-Za-z0-9._:-]{8,160}$/', $importId) !== 1) {
    ya_stock_endpoint_response(422, ['ok' => false, 'code' => 'invalid_request', 'message' => 'Görsel içe aktarma bilgileri geçersiz.']);
}
if ($source === 'android' && !ya_stock_endpoint_android_authorized($deviceId)) {
    ya_stock_endpoint_response(403, ['ok' => false, 'code' => 'stock_permission_denied', 'message' => 'Bu cihazın stok güncelleme yetkisi yok.']);
}

$candidatePayload = json_decode(ya_stock_image_string($_POST['menu_items'] ?? ''), true);
$menuItems = ya_stock_image_sanitize_candidates($candidatePayload);
if ($source === 'android') {
    $menuItems = ya_stock_endpoint_authoritative_android_candidates($menuItems);
}
if ($menuItems === []) {
    ya_stock_endpoint_response(422, ['ok' => false, 'code' => 'no_tracked_items', 'message' => 'Stok takip edilen menü ürünü bulunamadı.']);
}

$upload = $_FILES['image'] ?? null;
if (!is_array($upload)) {
    ya_stock_endpoint_response(422, ['ok' => false, 'code' => 'image_missing', 'message' => 'Analiz edilecek görsel seçilmedi.']);
}
$uploadError = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);
if (in_array($uploadError, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
    ya_stock_endpoint_response(413, ['ok' => false, 'code' => 'image_too_large', 'message' => 'Görsel çok büyük.']);
}
if ($uploadError !== UPLOAD_ERR_OK) {
    ya_stock_endpoint_response(422, ['ok' => false, 'code' => 'image_unreadable', 'message' => 'Görsel okunamadı.']);
}
$temporaryPath = ya_stock_image_string($upload['tmp_name'] ?? '');
$size = (int) ($upload['size'] ?? 0);
if ($temporaryPath === '' || !is_uploaded_file($temporaryPath) || $size <= 0) {
    ya_stock_endpoint_response(422, ['ok' => false, 'code' => 'image_unreadable', 'message' => 'Görsel okunamadı.']);
}
if ($size > YA_STOCK_IMAGE_MAX_BYTES) {
    @unlink($temporaryPath);
    ya_stock_endpoint_response(413, ['ok' => false, 'code' => 'image_too_large', 'message' => 'Görsel çok büyük.']);
}

$responseStatus = 500;
$responsePayload = ['ok' => false, 'code' => 'analysis_failed', 'message' => 'Görsel analiz edilemedi.'];
try {
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = strtolower((string) $finfo->file($temporaryPath));
    if ($mimeType === 'image/jpg') {
        $mimeType = 'image/jpeg';
    }
    $supportedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!in_array($mimeType, $supportedMimeTypes, true)) {
        $responseStatus = 415;
        $responsePayload = ['ok' => false, 'code' => 'unsupported_image_type', 'message' => 'Desteklenmeyen dosya türü.'];
    } elseif (@getimagesize($temporaryPath) === false) {
        $responseStatus = 422;
        $responsePayload = ['ok' => false, 'code' => 'image_unreadable', 'message' => 'Görsel okunamadı.'];
    } else {
        $imageHash = strtolower((string) hash_file('sha256', $temporaryPath));
        $providedHash = strtolower(ya_stock_image_string($_POST['image_hash'] ?? ''));
        if ($providedHash !== '' && (preg_match('/^[a-f0-9]{64}$/', $providedHash) !== 1 || !hash_equals($imageHash, $providedHash))) {
            $responseStatus = 422;
            $responsePayload = ['ok' => false, 'code' => 'image_hash_mismatch', 'message' => 'Görsel güvenli biçimde doğrulanamadı.'];
        } else {
            $aiConfig = is_file(YA_STOCK_IMAGE_BASE_DIR . '/config/ai.php')
                ? require YA_STOCK_IMAGE_BASE_DIR . '/config/ai.php'
                : [];
            $aiConfig = is_array($aiConfig) ? $aiConfig : [];
            if (!ya_stock_image_bool($aiConfig['enabled'] ?? false)) {
                $responseStatus = 422;
                $responsePayload = ['ok' => false, 'code' => 'ai_disabled', 'message' => 'AI görsel analizi işletme ayarlarında kapalı.'];
            } else {
                $analyzer = ya_stock_image_create_analyzer($aiConfig);
                if (!$analyzer->supports($aiConfig)) {
                    $responseStatus = 422;
                    $responsePayload = ['ok' => false, 'code' => 'vision_not_supported', 'message' => 'Mevcut AI hizmeti görsel analizini desteklemiyor.'];
                } else {
                    $result = $analyzer->analyze($aiConfig, $temporaryPath, $mimeType, $menuItems);
                    if (!($result['ok'] ?? false)) {
                        $responseStatus = 502;
                        $responsePayload = [
                            'ok' => false,
                            'code' => ya_stock_image_string($result['code'] ?? 'analysis_failed'),
                            'message' => ya_stock_image_string($result['message'] ?? 'Görsel analiz edilemedi.'),
                            'provider_status' => max(0, (int) ($result['provider_status'] ?? 0))
                        ];
                    } else {
                        $analysis = ya_stock_image_sanitize_analysis($result['analysis'] ?? [], $menuItems);
                        $matchedLineCount = count(array_filter($analysis['lines'], static function (array $line): bool {
                            return $line['matched_menu_item_id'] !== null;
                        }));
                        $responseStatus = 200;
                        $responsePayload = [
                            'ok' => true,
                            'message' => $matchedLineCount > 0
                                ? 'Görsel analiz edildi. Stoklar değişmeden önce satırları kontrol edin.'
                                : 'Faturada mevcut menü ürünleriyle eşleşen satır bulunamadı.',
                            'import_id' => $importId,
                            'image_hash' => $imageHash,
                            'analysis' => $analysis,
                            'matched_line_count' => $matchedLineCount
                        ];
                    }
                }
            }
        }
    }
} catch (Throwable) {
    $responseStatus = 500;
    $responsePayload = ['ok' => false, 'code' => 'analysis_failed', 'message' => 'Görsel analiz edilemedi.'];
} finally {
    if (is_file($temporaryPath)) {
        @unlink($temporaryPath);
    }
}

ya_stock_endpoint_response($responseStatus, $responsePayload);

function ya_stock_endpoint_android_authorized(string $deviceId): bool
{
    if (preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $deviceId) !== 1) {
        return false;
    }
    $snapshot = ya_storage_get_publication('android_snapshot', []);
    $profiles = is_array($snapshot['androidPermissions'] ?? null) ? $snapshot['androidPermissions'] : [];
    $profile = $profiles[$deviceId] ?? null;
    return is_array($profile)
        && ya_stock_image_bool($profile['is_active'] ?? false)
        && in_array('menu.stock_update', is_array($profile['permissions'] ?? null) ? $profile['permissions'] : [], true);
}

function ya_stock_endpoint_authoritative_android_candidates(array $provided): array
{
    $snapshot = ya_storage_get_publication('android_snapshot', []);
    $tracked = ya_stock_image_sanitize_candidates(array_map(static function (mixed $item): array {
        $record = is_array($item) ? $item : [];
        return [
            'id' => $record['menu_item_id'] ?? '',
            'name' => $record['name'] ?? '',
            'category' => $record['category'] ?? 'Menü',
            'current_stock' => $record['stock_quantity'] ?? null,
            'stock_unit' => $record['stock_unit'] ?? 'piece'
        ];
    }, is_array($snapshot['trackedStockItems'] ?? null) ? $snapshot['trackedStockItems'] : []));
    $providedIds = array_fill_keys(array_map(static fn(array $item): string => ya_stock_image_string($item['id'] ?? ''), $provided), true);
    return array_values(array_filter($tracked, static function (array $item) use ($providedIds): bool {
        return isset($providedIds[ya_stock_image_string($item['id'] ?? '')]);
    }));
}

function ya_stock_endpoint_authorized(array $businessConfig): bool
{
    $configured = ya_stock_image_string($businessConfig['sync_secret'] ?? '');
    $provided = ya_stock_image_string($_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? '');
    return $configured !== '' && $provided !== '' && hash_equals($configured, $provided);
}

function ya_stock_endpoint_load_config(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    return is_array($decoded) ? $decoded : [];
}

function ya_stock_endpoint_apply_cors(array $businessConfig): void
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

function ya_stock_endpoint_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
