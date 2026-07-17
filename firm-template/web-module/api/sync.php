<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';
const YA_REQUESTS_FILE = YA_BASE_DIR . '/data/requests.json';
const YA_MENU_FILE = YA_BASE_DIR . '/data/menu.json';
const YA_ANDROID_SNAPSHOT_FILE = YA_BASE_DIR . '/data/android-snapshot.json';
const YA_ANDROID_ACTIONS_FILE = YA_BASE_DIR . '/data/android-actions.json';
const YA_SYNC_STATE_FILE = YA_BASE_DIR . '/data/sync-state.json';
const YA_AI_SETTINGS_FILE = YA_BASE_DIR . '/data/ai-settings.local.php';

$businessConfig = ya_sync_load_json(YA_CONFIG_FILE, []);
ya_sync_apply_cors($businessConfig);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$payload = ya_sync_read_payload();
$action = ya_sync_string($payload['action'] ?? $_GET['action'] ?? 'pull_requests');

if ($action === 'publish_ai_settings' && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    ya_sync_response(405, [
        'ok' => false,
        'message' => 'AI ayarlarını yayınlamak için POST isteği gerekli.'
    ]);
}

$isAuthorized = $action === 'publish_ai_settings'
    ? ya_sync_is_header_authorized($businessConfig)
    : ya_sync_is_authorized($businessConfig, $payload);

if (!$isAuthorized) {
    ya_sync_response(401, [
        'ok' => false,
        'message' => 'Güncelleme izni alınamadı. Güvenlik anahtarını kontrol edin.'
    ]);
}

try {
    if ($action === 'pull_requests') {
        ya_sync_pull_requests($payload);
    }

    if ($action === 'android_summary') {
        ya_sync_android_summary($payload, $businessConfig);
    }

    if ($action === 'mark_requests_synced') {
        ya_sync_mark_requests_synced($payload);
    }

    if ($action === 'update_request_status') {
        ya_sync_update_request_status($payload);
    }

    if ($action === 'enqueue_android_action') {
        ya_sync_enqueue_android_action($payload);
    }

    if ($action === 'pull_android_actions') {
        ya_sync_pull_android_actions($payload);
    }

    if ($action === 'mark_android_action_result') {
        ya_sync_mark_android_action_result($payload);
    }

    if ($action === 'publish_menu') {
        ya_sync_publish_menu($payload);
    }

    if ($action === 'publish_android_snapshot') {
        ya_sync_publish_android_snapshot($payload);
    }

    if ($action === 'publish_ai_settings') {
        ya_sync_publish_ai_settings($payload);
    }

    ya_sync_response(400, [
        'ok' => false,
        'message' => 'Güncelleme isteği anlaşılamadı.'
    ]);
} catch (Throwable $error) {
    ya_sync_response(500, [
        'ok' => false,
        'message' => 'Güncelleme sırasında bir sorun oldu. Biraz sonra tekrar deneyin.'
    ]);
}

function ya_sync_android_summary(array $payload, array $businessConfig): void
{
    $limit = ya_sync_int($payload['limit'] ?? $_GET['limit'] ?? 100, 100);
    $limit = max(1, min($limit, 200));
    $deviceId = ya_sync_string($payload['device_id'] ?? $_GET['device_id'] ?? '');
    $records = ya_sync_load_json(YA_REQUESTS_FILE, []);
    if (!is_array($records)) {
        $records = [];
    }

    $androidSnapshot = ya_sync_load_android_snapshot();
    $requestsById = [];
    foreach ($androidSnapshot['requests'] as $snapshotRequest) {
        if (!is_array($snapshotRequest)) {
            continue;
        }
        $requestId = ya_sync_string($snapshotRequest['id'] ?? '');
        if ($requestId !== '') {
            $requestsById[$requestId] = $snapshotRequest;
        }
    }

    // Hosting-only web requests remain visible until the desktop imports and
    // republishes them. For duplicate ids the desktop snapshot wins because it
    // contains the authoritative post-action state.
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }
        $publicRequest = ya_sync_public_request($record);
        $requestId = ya_sync_string($publicRequest['id'] ?? '');
        if ($requestId !== '' && !isset($requestsById[$requestId])) {
            $requestsById[$requestId] = ya_sync_sanitize_android_request($publicRequest);
        }
    }

    $publicRequests = array_values($requestsById);
    usort($publicRequests, static function (array $left, array $right): int {
        return strcmp(ya_sync_string($right['created_at'] ?? ''), ya_sync_string($left['created_at'] ?? ''));
    });
    $totalRequests = count($publicRequests);
    $newRequests = 0;
    $pendingRequests = 0;
    $syncedRequests = 0;
    $latestCreatedAt = '';

    foreach ($publicRequests as $record) {
        $status = ya_sync_string($record['status'] ?? 'new');
        $syncStatus = ya_sync_string($record['sync_status'] ?? 'pending');
        $createdAt = ya_sync_string($record['created_at'] ?? '');

        if ($status === 'new') {
            $newRequests++;
        }

        if (in_array($status, ['new', 'seen', 'waiting_owner', 'waiting_customer'], true)) {
            $pendingRequests++;
        }

        if ($syncStatus === 'synced') {
            $syncedRequests++;
        }

        if ($createdAt !== '' && ($latestCreatedAt === '' || strcmp($createdAt, $latestCreatedAt) > 0)) {
            $latestCreatedAt = $createdAt;
        }

    }

    $visibleRequests = array_values(array_filter($publicRequests, static function (array $record): bool {
        return !in_array(ya_sync_string($record['status'] ?? ''), ['archived', 'cancelled'], true);
    }));
    $visibleRequests = array_slice($visibleRequests, 0, $limit);

    $now = date(DATE_ATOM);
    $actions = ya_sync_get_android_actions($deviceId, 40);
    $pendingActionCount = ya_sync_count_pending_android_actions($deviceId);
    ya_sync_update_state([
        'last_android_summary_at' => $now
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Android özeti alındı.',
        'business' => [
            'display_name' => ya_sync_string($businessConfig['display_name'] ?? $businessConfig['name'] ?? ''),
            'phone' => ya_sync_string($businessConfig['phone'] ?? ''),
            'whatsapp' => ya_sync_string($businessConfig['whatsapp'] ?? '')
        ],
        'summary' => [
            'total_requests' => $totalRequests,
            'new_requests' => $newRequests,
            'pending_requests' => $pendingRequests,
            'synced_requests' => $syncedRequests,
            'request_count' => count($visibleRequests),
            'latest_created_at' => $latestCreatedAt,
            'pulled_at' => $now,
            'android_snapshot_updated_at' => ya_sync_string($androidSnapshot['updated_at'] ?? ''),
            'pending_action_count' => $pendingActionCount
        ],
        'operations' => $androidSnapshot['summary'],
        'daily_tasks' => $androidSnapshot['daily_tasks'],
        'requests' => $visibleRequests,
        'customers' => $androidSnapshot['customers'],
        'reservations' => $androidSnapshot['reservations'],
        'rooms' => $androidSnapshot['rooms'],
        'tables' => $androidSnapshot['tables'],
        'menu' => $androidSnapshot['menu'],
        'table_orders' => $androidSnapshot['table_orders'],
        'messages' => $androidSnapshot['messages'],
        'actions' => $actions
    ]);
}

function ya_sync_pull_requests(array $payload): void
{
    $limit = ya_sync_int($payload['limit'] ?? $_GET['limit'] ?? 50, 50);
    $limit = max(1, min($limit, 200));
    $includeSynced = ya_sync_bool($payload['include_synced'] ?? $_GET['include_synced'] ?? false);
    $records = ya_sync_load_json(YA_REQUESTS_FILE, []);

    if (!is_array($records)) {
        $records = [];
    }

    $requests = [];
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }

        $syncStatus = ya_sync_string($record['sync_status'] ?? 'pending');
        if (!$includeSynced && $syncStatus === 'synced') {
            continue;
        }

        $requests[] = ya_sync_public_request($record);
        if (count($requests) >= $limit) {
            break;
        }
    }

    $now = date(DATE_ATOM);
    ya_sync_update_state([
        'last_request_pull_at' => $now
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Talepler alındı.',
        'requests' => $requests,
        'count' => count($requests),
        'pulled_at' => $now
    ]);
}

function ya_sync_mark_requests_synced(array $payload): void
{
    $requestIds = $payload['request_ids'] ?? [];
    if (!is_array($requestIds) || $requestIds === []) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'İşaretlenecek talep bulunamadı.'
        ]);
    }

    $requestIds = array_values(array_unique(array_map('ya_sync_string', $requestIds)));
    $now = date(DATE_ATOM);
    $updatedCount = 0;

    $records = ya_sync_edit_json_array(YA_REQUESTS_FILE, static function (array $records) use ($requestIds, $now, &$updatedCount): array {
        foreach ($records as &$record) {
            if (!is_array($record)) {
                continue;
            }

            if (in_array(ya_sync_string($record['id'] ?? ''), $requestIds, true)) {
                $record['sync_status'] = 'synced';
                $record['synced_at'] = $now;
                $record['updated_at'] = $now;
                $updatedCount++;
            }
        }
        unset($record);

        return $records;
    });

    ya_sync_update_state([
        'last_request_mark_at' => $now
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Talepler güncellendi.',
        'updated_count' => $updatedCount,
        'synced_at' => $now,
        'request_ids' => $requestIds,
        'total_records' => count($records)
    ]);
}

function ya_sync_update_request_status(array $payload): void
{
    $requestId = ya_sync_string($payload['request_id'] ?? '');
    $nextStatus = ya_sync_string($payload['status'] ?? '');
    $allowedStatuses = ['seen', 'waiting_owner', 'waiting_customer', 'approved', 'rejected', 'answered', 'cancelled', 'archived'];

    if ($requestId === '') {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'Güncellenecek talep bulunamadı.'
        ]);
    }

    if (!in_array($nextStatus, $allowedStatuses, true)) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'Talep durumu anlaşılamadı.'
        ]);
    }

    $now = date(DATE_ATOM);
    $updatedRequest = null;

    $records = ya_sync_edit_json_array(YA_REQUESTS_FILE, static function (array $records) use ($requestId, $nextStatus, $now, &$updatedRequest): array {
        foreach ($records as &$record) {
            if (!is_array($record)) {
                continue;
            }

            if (ya_sync_string($record['id'] ?? '') === $requestId) {
                $record['status'] = $nextStatus;
                $record['updated_at'] = $now;
                $updatedRequest = ya_sync_public_request($record);
                break;
            }
        }
        unset($record);

        return $records;
    });

    if ($updatedRequest === null) {
        ya_sync_response(404, [
            'ok' => false,
            'message' => 'Talep kaydı bulunamadı.'
        ]);
    }

    ya_sync_update_state([
        'last_request_status_update_at' => $now
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Talep durumu güncellendi.',
        'request' => $updatedRequest,
        'request_id' => $requestId,
        'status' => $nextStatus,
        'updated_at' => $now,
        'total_records' => count($records)
    ]);
}

function ya_sync_enqueue_android_action(array $payload): void
{
    $actionId = ya_sync_string($payload['action_id'] ?? $payload['id'] ?? '');
    $actionType = ya_sync_string($payload['action_type'] ?? '');
    $deviceId = ya_sync_string($payload['device_id'] ?? '');
    $actionPayload = $payload['payload'] ?? null;

    if (!preg_match('/^[A-Za-z0-9_-]{12,120}$/', $actionId)) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'İşlem kimliği geçersiz.'
        ]);
    }

    if (!in_array($actionType, ya_sync_android_action_types(), true)) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'Telefon işlemi desteklenmiyor.'
        ]);
    }

    if (!preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $deviceId)) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'Telefon kimliği geçersiz.'
        ]);
    }

    if (!is_array($actionPayload)) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'İşlem bilgileri eksik.'
        ]);
    }

    $encodedPayload = json_encode($actionPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encodedPayload === false || strlen($encodedPayload) > 32768) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'İşlem bilgileri çok büyük veya geçersiz.'
        ]);
    }

    $now = date(DATE_ATOM);
    $created = false;
    $storedAction = null;
    $actions = ya_sync_edit_json_array(YA_ANDROID_ACTIONS_FILE, static function (array $actions) use (
        $actionId,
        $actionType,
        $deviceId,
        $actionPayload,
        $now,
        &$created,
        &$storedAction
    ): array {
        foreach ($actions as $action) {
            if (is_array($action) && ya_sync_string($action['id'] ?? '') === $actionId) {
                $storedAction = ya_sync_public_android_action($action);
                return $actions;
            }
        }

        $storedAction = [
            'id' => $actionId,
            'action_type' => $actionType,
            'payload' => $actionPayload,
            'created_at' => $now,
            'device_id' => $deviceId,
            'status' => 'pending',
            'error_message' => '',
            'processed_at' => ''
        ];
        $actions[] = $storedAction;
        $created = true;

        // Retain every pending command and a bounded recent result history.
        if (count($actions) > 2000) {
            $pending = array_values(array_filter($actions, static function ($action): bool {
                return is_array($action) && ya_sync_string($action['status'] ?? '') === 'pending';
            }));
            $finished = array_values(array_filter($actions, static function ($action): bool {
                return is_array($action) && ya_sync_string($action['status'] ?? '') !== 'pending';
            }));
            $actions = array_merge(array_slice($finished, -1000), $pending);
        }

        return $actions;
    });

    if ($storedAction === null) {
        throw new RuntimeException('android_action_not_stored');
    }

    ya_sync_update_state([
        'last_android_action_enqueue_at' => $now,
        'android_action_count' => count($actions)
    ]);

    ya_sync_response($created ? 201 : 200, [
        'ok' => true,
        'message' => $created ? 'İşlem masaüstüne gönderildi.' : 'İşlem daha önce gönderilmiş.',
        'action' => $storedAction,
        'deduplicated' => !$created,
        'queued_at' => ya_sync_string($storedAction['created_at'] ?? $now)
    ]);
}

function ya_sync_pull_android_actions(array $payload): void
{
    $limit = max(1, min(ya_sync_int($payload['limit'] ?? 50, 50), 200));
    $records = ya_sync_load_json(YA_ANDROID_ACTIONS_FILE, []);
    if (!is_array($records)) {
        $records = [];
    }

    $actions = [];
    foreach ($records as $record) {
        if (!is_array($record) || ya_sync_string($record['status'] ?? '') !== 'pending') {
            continue;
        }
        $actions[] = ya_sync_public_android_action($record);
        if (count($actions) >= $limit) {
            break;
        }
    }

    $now = date(DATE_ATOM);
    ya_sync_update_state(['last_android_action_pull_at' => $now]);
    ya_sync_response(200, [
        'ok' => true,
        'message' => $actions === [] ? 'Bekleyen telefon işlemi yok.' : 'Telefon işlemleri alındı.',
        'actions' => $actions,
        'count' => count($actions),
        'pulled_at' => $now
    ]);
}

function ya_sync_mark_android_action_result(array $payload): void
{
    $actionId = ya_sync_string($payload['action_id'] ?? '');
    $status = ya_sync_string($payload['status'] ?? '');
    $errorMessage = mb_substr(ya_sync_string($payload['error_message'] ?? ''), 0, 500);
    if ($actionId === '' || !in_array($status, ['applied', 'failed'], true)) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'İşlem sonucu geçersiz.'
        ]);
    }

    if ($status === 'failed' && $errorMessage === '') {
        $errorMessage = 'İşlem masaüstü tarafından uygulanamadı.';
    }
    if ($status === 'applied') {
        $errorMessage = '';
    }

    $now = date(DATE_ATOM);
    $updatedAction = null;
    $conflict = false;
    ya_sync_edit_json_array(YA_ANDROID_ACTIONS_FILE, static function (array $actions) use (
        $actionId,
        $status,
        $errorMessage,
        $now,
        &$updatedAction,
        &$conflict
    ): array {
        foreach ($actions as &$action) {
            if (!is_array($action) || ya_sync_string($action['id'] ?? '') !== $actionId) {
                continue;
            }

            $currentStatus = ya_sync_string($action['status'] ?? 'pending') ?: 'pending';
            if ($currentStatus !== 'pending' && $currentStatus !== $status) {
                $conflict = true;
                $updatedAction = ya_sync_public_android_action($action);
                break;
            }

            $action['status'] = $status;
            $action['error_message'] = $errorMessage;
            $action['processed_at'] = ya_sync_string($action['processed_at'] ?? '') ?: $now;
            $updatedAction = ya_sync_public_android_action($action);
            break;
        }
        unset($action);
        return $actions;
    });

    if ($updatedAction === null) {
        ya_sync_response(404, [
            'ok' => false,
            'message' => 'Telefon işlemi bulunamadı.'
        ]);
    }
    if ($conflict) {
        ya_sync_response(409, [
            'ok' => false,
            'message' => 'İşlem sonucu daha önce farklı bir durumla kaydedilmiş.'
        ]);
    }

    ya_sync_update_state(['last_android_action_result_at' => $now]);
    ya_sync_response(200, [
        'ok' => true,
        'message' => $status === 'applied' ? 'Telefon işlemi uygulandı.' : 'Telefon işlemi hata olarak kaydedildi.',
        'action' => $updatedAction,
        'updated_at' => $now
    ]);
}

function ya_sync_publish_menu(array $payload): void
{
    $menu = $payload['menu'] ?? null;
    if (!is_array($menu)) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'Yayınlanacak menü bulunamadı.'
        ]);
    }

    $now = date(DATE_ATOM);
    $categories = ya_sync_sanitize_menu_categories($menu['categories'] ?? [], $now);
    $categoryIds = array_map(static function (array $category): string {
        return ya_sync_string($category['id'] ?? '');
    }, $categories);
    $items = ya_sync_sanitize_menu_items($menu['items'] ?? [], $categoryIds, $now);

    $publishedMenu = [
        'categories' => $categories,
        'items' => $items,
        'updated_at' => $now
    ];

    ya_sync_write_json(YA_MENU_FILE, $publishedMenu);
    ya_sync_update_state([
        'last_menu_publish_at' => $now
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Menü yayınlandı.',
        'published_at' => $now,
        'updated_at' => $now,
        'category_count' => count($categories),
        'item_count' => count($items)
    ]);
}

function ya_sync_publish_android_snapshot(array $payload): void
{
    $snapshot = $payload['snapshot'] ?? null;
    if (!is_array($snapshot)) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'Yayınlanacak Android özeti bulunamadı.'
        ]);
    }

    $now = date(DATE_ATOM);
    $publishedSnapshot = ya_sync_sanitize_android_snapshot($snapshot, $now);
    ya_sync_write_json(YA_ANDROID_SNAPSHOT_FILE, $publishedSnapshot);
    ya_sync_update_state([
        'last_android_snapshot_at' => $now
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Android özeti yayınlandı.',
        'published_at' => $now,
        'updated_at' => $publishedSnapshot['updated_at'],
        'task_count' => count($publishedSnapshot['daily_tasks'])
    ]);
}

function ya_sync_publish_ai_settings(array $payload): void
{
    $candidate = $payload['ai_settings'] ?? null;
    if (!is_array($candidate)) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'Yayınlanacak AI ayarları bulunamadı.'
        ]);
    }

    $requiredStringFields = ['provider', 'service', 'base_url', 'model', 'api_key'];
    foreach ($requiredStringFields as $field) {
        if (!array_key_exists($field, $candidate) || !is_string($candidate[$field])) {
            ya_sync_response(422, [
                'ok' => false,
                'message' => 'AI ayar alanları eksik veya geçersiz.'
            ]);
        }
    }

    if (!array_key_exists('enabled', $candidate) || !is_bool($candidate['enabled'])) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'AI etkinlik ayarı geçersiz.'
        ]);
    }

    $timeoutSeconds = $candidate['timeout_seconds'] ?? null;
    if (!is_int($timeoutSeconds) || $timeoutSeconds < 5 || $timeoutSeconds > 120) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'AI zaman aşımı 5 ile 120 saniye arasında olmalı.'
        ]);
    }

    $enabled = $candidate['enabled'];
    $provider = trim($candidate['provider']);
    $service = trim($candidate['service']);
    $baseUrl = trim($candidate['base_url']);
    $model = trim($candidate['model']);
    $apiKey = trim($candidate['api_key']);
    $allowedServices = ['openai', 'openrouter', 'groq', 'gemini', 'custom'];

    if ($provider !== 'openai_compatible') {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'Yalnız OpenAI uyumlu AI sağlayıcısı destekleniyor.'
        ]);
    }

    if (!in_array($service, $allowedServices, true)) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'AI servisi desteklenmiyor.'
        ]);
    }

    if ($baseUrl !== '' && !ya_sync_is_valid_ai_base_url($baseUrl)) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'AI servis adresi geçerli bir HTTP veya HTTPS adresi olmalı.'
        ]);
    }

    if ($service === 'gemini' && rtrim($baseUrl, '/') !== 'https://generativelanguage.googleapis.com/v1beta') {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'Google AI Studio için resmi Gemini API bağlantı adresi kullanılmalı.'
        ]);
    }

    if (strlen($baseUrl) > 2048 || mb_strlen($model) > 255 || strlen($apiKey) > 8192) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'AI ayar alanlarından biri izin verilen uzunluğu aşıyor.'
        ]);
    }

    if (preg_match('/[\x00-\x1F\x7F]/', $model . $apiKey) === 1) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'AI model veya API anahtarı geçersiz karakter içeriyor.'
        ]);
    }

    if ($enabled && ($baseUrl === '' || $model === '' || $apiKey === '')) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'AI açıkken servis adresi, model ve API anahtarı gerekli.'
        ]);
    }

    $settings = [
        'enabled' => $enabled,
        'provider' => $provider,
        'service' => $service,
        'base_url' => rtrim($baseUrl, '/'),
        'model' => $model,
        'api_key' => $apiKey,
        'timeout_seconds' => $timeoutSeconds
    ];
    $publishedAt = date(DATE_ATOM);

    ya_sync_write_php_array_atomic(YA_AI_SETTINGS_FILE, $settings);
    ya_sync_update_state([
        'last_ai_settings_publish_at' => $publishedAt
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'AI ayarları web modülüne uygulandı.',
        'published_at' => $publishedAt,
        'enabled' => $settings['enabled'],
        'provider' => $settings['provider'],
        'service' => $settings['service'],
        'base_url' => $settings['base_url'],
        'model' => $settings['model'],
        'timeout_seconds' => $settings['timeout_seconds'],
        'has_api_key' => $settings['api_key'] !== ''
    ]);
}

function ya_sync_is_valid_ai_base_url(string $baseUrl): bool
{
    if (filter_var($baseUrl, FILTER_VALIDATE_URL) === false) {
        return false;
    }

    $parts = parse_url($baseUrl);
    if (!is_array($parts)) {
        return false;
    }

    $scheme = strtolower(ya_sync_string($parts['scheme'] ?? ''));
    $host = ya_sync_string($parts['host'] ?? '');

    return in_array($scheme, ['http', 'https'], true)
        && $host !== ''
        && !array_key_exists('user', $parts)
        && !array_key_exists('pass', $parts);
}

function ya_sync_public_request(array $record): array
{
    $allowedFields = [
        'id',
        'customer_id',
        'source',
        'request_type',
        'status',
        'customer_name',
        'customer_phone',
        'date_text',
        'start_date',
        'end_date',
        'time',
        'guest_count',
        'adult_count',
        'child_count',
        'message',
        'ai_summary',
        'ai_suggested_reply',
        'whatsapp_message',
        'assigned_to',
        'priority',
        'sync_status',
        'created_at',
        'updated_at'
    ];

    $public = [];
    foreach ($allowedFields as $field) {
        $public[$field] = $record[$field] ?? '';
    }

    return $public;
}

function ya_sync_android_action_types(): array
{
    return [
        'customer_request_mark_answered',
        'customer_request_reopen',
        'customer_request_approve',
        'customer_request_reject',
        'customer_request_convert_to_reservation',
        'reservation_approve',
        'reservation_reject',
        'reservation_cancel',
        'room_status_update',
        'daily_task_complete',
        'daily_task_reopen',
        'daily_task_cancel',
        'table_status_update',
        'table_order_open',
        'table_order_add_item',
        'table_order_update_item_quantity',
        'table_order_remove_item',
        'table_order_set_status',
        'table_order_close'
    ];
}

function ya_sync_public_android_action(array $record): array
{
    $status = ya_sync_string($record['status'] ?? 'pending');
    if (!in_array($status, ['pending', 'applied', 'failed'], true)) {
        $status = 'pending';
    }

    return [
        'id' => ya_sync_string($record['id'] ?? ''),
        'action_type' => ya_sync_string($record['action_type'] ?? ''),
        'payload' => is_array($record['payload'] ?? null) ? $record['payload'] : [],
        'created_at' => ya_sync_string($record['created_at'] ?? ''),
        'device_id' => ya_sync_string($record['device_id'] ?? ''),
        'status' => $status,
        'error_message' => ya_sync_string($record['error_message'] ?? ''),
        'processed_at' => ya_sync_string($record['processed_at'] ?? '')
    ];
}

function ya_sync_get_android_actions(string $deviceId, int $limit): array
{
    if ($deviceId === '') {
        return [];
    }

    $records = ya_sync_load_json(YA_ANDROID_ACTIONS_FILE, []);
    if (!is_array($records)) {
        return [];
    }

    $actions = [];
    foreach (array_reverse($records) as $record) {
        if (!is_array($record) || ya_sync_string($record['device_id'] ?? '') !== $deviceId) {
            continue;
        }
        $actions[] = ya_sync_public_android_action($record);
        if (count($actions) >= max(1, min($limit, 100))) {
            break;
        }
    }
    return $actions;
}

function ya_sync_count_pending_android_actions(string $deviceId): int
{
    if ($deviceId === '') {
        return 0;
    }

    $records = ya_sync_load_json(YA_ANDROID_ACTIONS_FILE, []);
    if (!is_array($records)) {
        return 0;
    }

    $count = 0;
    foreach ($records as $record) {
        if (is_array($record)
            && ya_sync_string($record['device_id'] ?? '') === $deviceId
            && ya_sync_string($record['status'] ?? '') === 'pending') {
            $count++;
        }
    }
    return $count;
}

function ya_sync_load_android_snapshot(): array
{
    $snapshot = ya_sync_load_json(YA_ANDROID_SNAPSHOT_FILE, []);
    if (!is_array($snapshot)) {
        $snapshot = [];
    }

    return ya_sync_sanitize_android_snapshot($snapshot, ya_sync_string($snapshot['updated_at'] ?? ''));
}

function ya_sync_sanitize_android_snapshot(array $snapshot, string $fallbackTimestamp): array
{
    $summary = is_array($snapshot['summary'] ?? null) ? $snapshot['summary'] : [];
    $tasks = is_array($snapshot['daily_tasks'] ?? null) ? $snapshot['daily_tasks'] : [];
    $menu = is_array($snapshot['menu'] ?? null) ? $snapshot['menu'] : [];
    $updatedAt = ya_sync_string($snapshot['updated_at'] ?? $fallbackTimestamp);
    $categories = ya_sync_sanitize_menu_categories($menu['categories'] ?? [], $updatedAt);
    $categoryIds = array_map(static function (array $category): string {
        return ya_sync_string($category['id'] ?? '');
    }, $categories);

    return [
        'summary' => [
            'pending_daily_tasks' => max(0, ya_sync_int($summary['pending_daily_tasks'] ?? 0, 0)),
            'today_tasks' => max(0, ya_sync_int($summary['today_tasks'] ?? 0, 0)),
            'available_rooms' => max(0, ya_sync_int($summary['available_rooms'] ?? 0, 0)),
            'total_rooms' => max(0, ya_sync_int($summary['total_rooms'] ?? 0, 0)),
            'available_tables' => max(0, ya_sync_int($summary['available_tables'] ?? 0, 0)),
            'occupied_tables' => max(0, ya_sync_int($summary['occupied_tables'] ?? 0, 0)),
            'bill_waiting_tables' => max(0, ya_sync_int($summary['bill_waiting_tables'] ?? 0, 0)),
            'active_table_orders' => max(0, ya_sync_int($summary['active_table_orders'] ?? 0, 0)),
            'pending_reservations' => max(0, ya_sync_int($summary['pending_reservations'] ?? 0, 0)),
            'prepared_whatsapp_messages' => max(0, ya_sync_int($summary['prepared_whatsapp_messages'] ?? 0, 0)),
            'waiting_responses' => max(0, ya_sync_int($summary['waiting_responses'] ?? 0, 0)),
            'active_menu_categories' => max(0, ya_sync_int($summary['active_menu_categories'] ?? 0, 0)),
            'available_menu_items' => max(0, ya_sync_int($summary['available_menu_items'] ?? 0, 0)),
            'customer_count' => max(0, ya_sync_int($summary['customer_count'] ?? 0, 0))
        ],
        'daily_tasks' => ya_sync_sanitize_android_tasks($tasks),
        'requests' => ya_sync_sanitize_android_requests($snapshot['requests'] ?? []),
        'customers' => ya_sync_sanitize_android_customers($snapshot['customers'] ?? []),
        'reservations' => ya_sync_sanitize_android_reservations($snapshot['reservations'] ?? []),
        'rooms' => ya_sync_sanitize_android_rooms($snapshot['rooms'] ?? []),
        'tables' => ya_sync_sanitize_android_tables($snapshot['tables'] ?? []),
        'menu' => [
            'categories' => $categories,
            'items' => ya_sync_sanitize_menu_items($menu['items'] ?? [], $categoryIds, $updatedAt),
            'updated_at' => ya_sync_string($menu['updated_at'] ?? $updatedAt) ?: $updatedAt
        ],
        'table_orders' => ya_sync_sanitize_android_table_orders($snapshot['table_orders'] ?? []),
        'messages' => ya_sync_sanitize_android_messages($snapshot['messages'] ?? []),
        'updated_at' => $updatedAt
    ];
}

function ya_sync_sanitize_android_tasks(array $tasks): array
{
    $records = [];
    foreach ($tasks as $task) {
        if (!is_array($task)) {
            continue;
        }

        $id = ya_sync_string($task['id'] ?? '');
        $title = ya_sync_string($task['title'] ?? '');
        if ($id === '' || $title === '') {
            continue;
        }

        $records[] = [
            'id' => $id,
            'title' => $title,
            'description' => ya_sync_string($task['description'] ?? ''),
            'task_type' => ya_sync_string($task['task_type'] ?? 'note') ?: 'note',
            'status' => ya_sync_string($task['status'] ?? 'pending') ?: 'pending',
            'due_date' => ya_sync_string($task['due_date'] ?? ''),
            'due_time' => ya_sync_string($task['due_time'] ?? ''),
            'related_type' => ya_sync_string($task['related_type'] ?? ''),
            'related_id' => ya_sync_string($task['related_id'] ?? ''),
            'updated_at' => ya_sync_string($task['updated_at'] ?? '')
        ];

        if (count($records) >= 200) {
            break;
        }
    }

    return $records;
}

function ya_sync_sanitize_android_request(array $record): array
{
    return [
        'id' => ya_sync_string($record['id'] ?? ''),
        'customer_id' => ya_sync_string($record['customer_id'] ?? ''),
        'request_type' => ya_sync_string($record['request_type'] ?? 'general_info') ?: 'general_info',
        'status' => ya_sync_string($record['status'] ?? 'new') ?: 'new',
        'customer_name' => ya_sync_string($record['customer_name'] ?? ''),
        'customer_phone' => ya_sync_string($record['customer_phone'] ?? ''),
        'date_text' => ya_sync_string($record['date_text'] ?? ''),
        'start_date' => ya_sync_string($record['start_date'] ?? ''),
        'end_date' => ya_sync_string($record['end_date'] ?? ''),
        'time' => ya_sync_string($record['time'] ?? ''),
        'guest_count' => max(0, ya_sync_int($record['guest_count'] ?? 0, 0)),
        'message' => ya_sync_string($record['message'] ?? ''),
        'ai_summary' => ya_sync_string($record['ai_summary'] ?? ''),
        'ai_suggested_reply' => ya_sync_string($record['ai_suggested_reply'] ?? ''),
        'whatsapp_message' => ya_sync_string($record['whatsapp_message'] ?? ''),
        'priority' => ya_sync_string($record['priority'] ?? 'normal') ?: 'normal',
        'sync_status' => ya_sync_string($record['sync_status'] ?? ''),
        'created_at' => ya_sync_string($record['created_at'] ?? ''),
        'updated_at' => ya_sync_string($record['updated_at'] ?? '')
    ];
}

function ya_sync_sanitize_android_requests(mixed $records): array
{
    if (!is_array($records)) {
        return [];
    }
    $result = [];
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }
        $sanitized = ya_sync_sanitize_android_request($record);
        if ($sanitized['id'] === '' || $sanitized['customer_name'] === '') {
            continue;
        }
        $result[$sanitized['id']] = $sanitized;
        if (count($result) >= 300) {
            break;
        }
    }
    return array_values($result);
}

function ya_sync_sanitize_android_customers(mixed $records): array
{
    if (!is_array($records)) {
        return [];
    }
    $result = [];
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }
        $id = ya_sync_string($record['id'] ?? '');
        $name = ya_sync_string($record['full_name'] ?? '');
        if ($id === '' || $name === '') {
            continue;
        }
        $result[$id] = [
            'id' => $id,
            'full_name' => $name,
            'phone' => ya_sync_string($record['phone'] ?? ''),
            'email' => ya_sync_string($record['email'] ?? ''),
            'notes' => ya_sync_string($record['notes'] ?? ''),
            'tags' => ya_sync_string_array($record['tags'] ?? []),
            'request_count' => max(0, ya_sync_int($record['request_count'] ?? 0, 0)),
            'reservation_count' => max(0, ya_sync_int($record['reservation_count'] ?? 0, 0)),
            'updated_at' => ya_sync_string($record['updated_at'] ?? '')
        ];
        if (count($result) >= 300) {
            break;
        }
    }
    return array_values($result);
}

function ya_sync_sanitize_android_reservations(mixed $records): array
{
    if (!is_array($records)) {
        return [];
    }
    $result = [];
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }
        $id = ya_sync_string($record['id'] ?? '');
        if ($id === '') {
            continue;
        }
        $result[$id] = [
            'id' => $id,
            'request_id' => ya_sync_string($record['request_id'] ?? ''),
            'customer_id' => ya_sync_string($record['customer_id'] ?? ''),
            'customer_name' => ya_sync_string($record['customer_name'] ?? ''),
            'customer_phone' => ya_sync_string($record['customer_phone'] ?? ''),
            'reservation_type' => ya_sync_string($record['reservation_type'] ?? ''),
            'status' => ya_sync_string($record['status'] ?? 'pending') ?: 'pending',
            'title' => ya_sync_string($record['title'] ?? ''),
            'start_date' => ya_sync_string($record['start_date'] ?? ''),
            'end_date' => ya_sync_string($record['end_date'] ?? ''),
            'time' => ya_sync_string($record['time'] ?? ''),
            'guest_count' => max(0, ya_sync_int($record['guest_count'] ?? 0, 0)),
            'room_ids' => ya_sync_string_array($record['room_ids'] ?? []),
            'table_ids' => ya_sync_string_array($record['table_ids'] ?? []),
            'notes' => ya_sync_string($record['notes'] ?? ''),
            'payment_status' => ya_sync_string($record['payment_status'] ?? ''),
            'updated_at' => ya_sync_string($record['updated_at'] ?? '')
        ];
        if (count($result) >= 300) {
            break;
        }
    }
    return array_values($result);
}

function ya_sync_sanitize_android_rooms(mixed $records): array
{
    return ya_sync_sanitize_android_resources($records, 'number');
}

function ya_sync_sanitize_android_tables(mixed $records): array
{
    return ya_sync_sanitize_android_resources($records, 'area');
}

function ya_sync_sanitize_android_resources(mixed $records, string $secondaryField): array
{
    if (!is_array($records)) {
        return [];
    }
    $result = [];
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }
        $id = ya_sync_string($record['id'] ?? '');
        $name = ya_sync_string($record['name'] ?? '');
        if ($id === '' || $name === '') {
            continue;
        }
        $result[$id] = [
            'id' => $id,
            'name' => $name,
            $secondaryField => ya_sync_string($record[$secondaryField] ?? ''),
            'capacity' => max(0, ya_sync_int($record['capacity'] ?? 0, 0)),
            'status' => ya_sync_string($record['status'] ?? 'available') ?: 'available',
            'active_reservation_title' => ya_sync_string($record['active_reservation_title'] ?? ''),
            'updated_at' => ya_sync_string($record['updated_at'] ?? '')
        ];
        if (count($result) >= 300) {
            break;
        }
    }
    return array_values($result);
}

function ya_sync_sanitize_android_table_orders(mixed $records): array
{
    if (!is_array($records)) {
        return [];
    }
    $result = [];
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }
        $id = ya_sync_string($record['id'] ?? '');
        $tableId = ya_sync_string($record['table_id'] ?? '');
        if ($id === '' || $tableId === '') {
            continue;
        }
        $items = [];
        $orderItems = is_array($record['items'] ?? null) ? $record['items'] : [];
        foreach ($orderItems as $item) {
            if (!is_array($item)) {
                continue;
            }
            $itemId = ya_sync_string($item['id'] ?? '');
            if ($itemId === '') {
                continue;
            }
            $items[] = [
                'id' => $itemId,
                'order_id' => $id,
                'menu_item_id' => ya_sync_string($item['menu_item_id'] ?? ''),
                'product_name' => ya_sync_string($item['product_name'] ?? 'Ürün') ?: 'Ürün',
                'unit_price' => max(0, ya_sync_float($item['unit_price'] ?? 0, 0)),
                'currency' => ya_sync_string($item['currency'] ?? 'TRY') ?: 'TRY',
                'quantity' => max(1, ya_sync_int($item['quantity'] ?? 1, 1)),
                'line_total' => max(0, ya_sync_float($item['line_total'] ?? 0, 0)),
                'status' => ya_sync_string($item['status'] ?? 'open') ?: 'open',
                'updated_at' => ya_sync_string($item['updated_at'] ?? '')
            ];
            if (count($items) >= 300) {
                break;
            }
        }
        $result[$id] = [
            'id' => $id,
            'table_id' => $tableId,
            'table_name' => ya_sync_string($record['table_name'] ?? 'Masa') ?: 'Masa',
            'status' => ya_sync_string($record['status'] ?? 'open') ?: 'open',
            'opened_at' => ya_sync_string($record['opened_at'] ?? ''),
            'total' => max(0, ya_sync_float($record['total'] ?? 0, 0)),
            'item_count' => max(0, ya_sync_int($record['item_count'] ?? 0, 0)),
            'items' => $items,
            'updated_at' => ya_sync_string($record['updated_at'] ?? '')
        ];
        if (count($result) >= 150) {
            break;
        }
    }
    return array_values($result);
}

function ya_sync_sanitize_android_messages(mixed $records): array
{
    if (!is_array($records)) {
        return [];
    }
    $result = [];
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }
        $id = ya_sync_string($record['id'] ?? '');
        $message = ya_sync_string($record['message'] ?? '');
        if ($id === '' || $message === '') {
            continue;
        }
        $result[$id] = [
            'id' => $id,
            'request_id' => ya_sync_string($record['request_id'] ?? ''),
            'customer_name' => ya_sync_string($record['customer_name'] ?? ''),
            'customer_phone' => ya_sync_string($record['customer_phone'] ?? ''),
            'message' => $message,
            'status' => ya_sync_string($record['status'] ?? 'prepared') ?: 'prepared',
            'updated_at' => ya_sync_string($record['updated_at'] ?? '')
        ];
        if (count($result) >= 300) {
            break;
        }
    }
    return array_values($result);
}

function ya_sync_sanitize_menu_categories(mixed $records, string $fallbackTimestamp): array
{
    if (!is_array($records)) {
        return [];
    }

    $categoriesById = [];
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }

        $id = ya_sync_string($record['id'] ?? '');
        $name = ya_sync_string($record['name'] ?? '');
        if ($id === '' || $name === '') {
            continue;
        }

        $categoriesById[$id] = [
            'id' => $id,
            'name' => $name,
            'description' => ya_sync_string($record['description'] ?? ''),
            'is_active' => ya_sync_bool($record['is_active'] ?? true),
            'sort_order' => ya_sync_int($record['sort_order'] ?? 0, 0),
            'created_at' => ya_sync_string($record['created_at'] ?? $fallbackTimestamp) ?: $fallbackTimestamp,
            'updated_at' => ya_sync_string($record['updated_at'] ?? $fallbackTimestamp) ?: $fallbackTimestamp
        ];
    }

    return array_values($categoriesById);
}

function ya_sync_sanitize_menu_items(mixed $records, array $categoryIds, string $fallbackTimestamp): array
{
    if (!is_array($records)) {
        return [];
    }

    $validCategoryIds = array_flip($categoryIds);
    $itemsById = [];
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }

        $id = ya_sync_string($record['id'] ?? '');
        $categoryId = ya_sync_string($record['category_id'] ?? '');
        $name = ya_sync_string($record['name'] ?? '');
        if ($id === '' || $categoryId === '' || $name === '' || !isset($validCategoryIds[$categoryId])) {
            continue;
        }

        $itemsById[$id] = [
            'id' => $id,
            'category_id' => $categoryId,
            'name' => $name,
            'description' => ya_sync_string($record['description'] ?? ''),
            'price' => ya_sync_float($record['price'] ?? 0, 0),
            'currency' => ya_sync_string($record['currency'] ?? 'TRY') ?: 'TRY',
            'image_url' => ya_sync_string($record['image_url'] ?? ''),
            'is_available' => ya_sync_bool($record['is_available'] ?? true),
            'is_featured' => ya_sync_bool($record['is_featured'] ?? false),
            'allergens' => ya_sync_string_array($record['allergens'] ?? []),
            'tags' => ya_sync_string_array($record['tags'] ?? []),
            'sort_order' => ya_sync_int($record['sort_order'] ?? 0, 0),
            'created_at' => ya_sync_string($record['created_at'] ?? $fallbackTimestamp) ?: $fallbackTimestamp,
            'updated_at' => ya_sync_string($record['updated_at'] ?? $fallbackTimestamp) ?: $fallbackTimestamp
        ];
    }

    return array_values($itemsById);
}

function ya_sync_is_authorized(array $businessConfig, array $payload): bool
{
    $configuredSecret = ya_sync_string($businessConfig['sync_secret'] ?? '');
    if ($configuredSecret === '') {
        return false;
    }

    $providedSecret = ya_sync_string($payload['sync_secret'] ?? $_GET['sync_secret'] ?? '');
    $headerSecret = ya_sync_header('HTTP_X_YA_SYNC_SECRET');

    if ($providedSecret === '' && $headerSecret !== '') {
        $providedSecret = $headerSecret;
    }

    return $providedSecret !== '' && hash_equals($configuredSecret, $providedSecret);
}

function ya_sync_is_header_authorized(array $businessConfig): bool
{
    $configuredSecret = ya_sync_string($businessConfig['sync_secret'] ?? '');
    $headerSecret = ya_sync_header('HTTP_X_YA_SYNC_SECRET');

    return $configuredSecret !== ''
        && $headerSecret !== ''
        && hash_equals($configuredSecret, $headerSecret);
}

function ya_sync_apply_cors(array $businessConfig): void
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

    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-YA-Sync-Secret');
    header('Access-Control-Max-Age: 86400');
}

function ya_sync_read_payload(): array
{
    $rawBody = file_get_contents('php://input') ?: '';
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (stripos($contentType, 'application/json') !== false || $rawBody !== '') {
        $data = json_decode($rawBody, true);
        if (is_array($data)) {
            return $data;
        }
    }

    if ($_POST !== []) {
        return $_POST;
    }

    return [];
}

function ya_sync_load_json(string $path, mixed $fallback): mixed
{
    if (!is_file($path)) {
        return $fallback;
    }

    $handle = fopen($path, 'rb');
    if ($handle === false) {
        return $fallback;
    }

    try {
        if (!flock($handle, LOCK_SH)) {
            return $fallback;
        }
        $json = stream_get_contents($handle);
        flock($handle, LOCK_UN);
    } finally {
        fclose($handle);
    }
    $data = json_decode($json ?: '', true);

    return $data === null ? $fallback : $data;
}

function ya_sync_edit_json_array(string $path, callable $editor): array
{
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
        throw new RuntimeException('data_directory_missing');
    }

    $handle = fopen($path, 'c+');
    if ($handle === false) {
        throw new RuntimeException('data_file_open_failed');
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            throw new RuntimeException('data_file_lock_failed');
        }

        rewind($handle);
        $contents = stream_get_contents($handle);
        $records = json_decode($contents ?: '[]', true);
        if (!is_array($records)) {
            $records = [];
        }

        $records = $editor($records);
        $json = json_encode($records, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('data_encode_failed');
        }

        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, $json . PHP_EOL);
        fflush($handle);
        flock($handle, LOCK_UN);
    } finally {
        fclose($handle);
    }

    return $records;
}

function ya_sync_write_json(string $path, mixed $data): void
{
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
        throw new RuntimeException('data_directory_missing');
    }

    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('data_encode_failed');
    }

    file_put_contents($path, $json . PHP_EOL, LOCK_EX);
}

function ya_sync_write_php_array_atomic(string $path, array $data): void
{
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
        throw new RuntimeException('data_directory_missing');
    }

    if (!is_writable($directory)) {
        throw new RuntimeException('data_directory_not_writable');
    }

    $temporaryPath = tempnam($directory, '.ai-settings.');
    if ($temporaryPath === false) {
        throw new RuntimeException('ai_settings_temp_file_failed');
    }

    $realDirectory = realpath($directory);
    $realTemporaryDirectory = realpath(dirname($temporaryPath));
    if ($realDirectory === false || $realTemporaryDirectory === false || $realDirectory !== $realTemporaryDirectory) {
        if (is_file($temporaryPath)) {
            unlink($temporaryPath);
        }
        throw new RuntimeException('ai_settings_temp_location_invalid');
    }

    try {
        if (!chmod($temporaryPath, 0600)) {
            throw new RuntimeException('ai_settings_permissions_failed');
        }

        $contents = implode("\n", [
            '<?php',
            'declare(strict_types=1);',
            '',
            'return ' . var_export($data, true) . ';',
            ''
        ]);
        $bytesWritten = file_put_contents($temporaryPath, $contents, LOCK_EX);
        if ($bytesWritten === false || $bytesWritten !== strlen($contents)) {
            throw new RuntimeException('ai_settings_write_failed');
        }

        if (!rename($temporaryPath, $path)) {
            throw new RuntimeException('ai_settings_publish_failed');
        }

        $temporaryPath = '';
    } finally {
        if ($temporaryPath !== '' && is_file($temporaryPath)) {
            unlink($temporaryPath);
        }
    }
}

function ya_sync_update_state(array $changes): void
{
    $state = ya_sync_load_json(YA_SYNC_STATE_FILE, []);
    if (!is_array($state)) {
        $state = [];
    }

    $state = array_merge($state, $changes, [
        'updated_at' => date(DATE_ATOM)
    ]);

    $json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('state_encode_failed');
    }

    file_put_contents(YA_SYNC_STATE_FILE, $json . PHP_EOL, LOCK_EX);
}

function ya_sync_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ya_sync_string(mixed $value): string
{
    return trim((string) $value);
}

function ya_sync_int(mixed $value, int $fallback): int
{
    if (is_numeric($value)) {
        return (int) $value;
    }

    return $fallback;
}

function ya_sync_bool(mixed $value): bool
{
    if (is_bool($value)) {
        return $value;
    }

    if (is_string($value)) {
        return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
    }

    return (bool) $value;
}

function ya_sync_float(mixed $value, float $fallback): float
{
    if (is_numeric($value)) {
        return (float) $value;
    }

    return $fallback;
}

function ya_sync_string_array(mixed $value): array
{
    if (!is_array($value)) {
        return [];
    }

    $items = [];
    foreach ($value as $item) {
        $text = ya_sync_string($item);
        if ($text !== '') {
            $items[] = $text;
        }
    }

    return array_values(array_unique($items));
}

function ya_sync_header(string $name): string
{
    return ya_sync_string($_SERVER[$name] ?? '');
}
