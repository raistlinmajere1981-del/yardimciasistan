<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';
const YA_REQUESTS_FILE = YA_BASE_DIR . '/data/requests.json';
const YA_MENU_FILE = YA_BASE_DIR . '/data/menu.json';
const YA_ANDROID_SNAPSHOT_FILE = YA_BASE_DIR . '/data/android-snapshot.json';
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
    $limit = ya_sync_int($payload['limit'] ?? $_GET['limit'] ?? 5, 5);
    $limit = max(1, min($limit, 20));
    $records = ya_sync_load_json(YA_REQUESTS_FILE, []);

    if (!is_array($records)) {
        $records = [];
    }

    $publicRequests = [];
    $totalRequests = 0;
    $newRequests = 0;
    $pendingRequests = 0;
    $syncedRequests = 0;
    $latestCreatedAt = '';

    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }

        $totalRequests++;
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

        if (count($publicRequests) < $limit && !in_array($status, ['archived', 'cancelled'], true)) {
            $publicRequests[] = ya_sync_public_request($record);
        }
    }

    $now = date(DATE_ATOM);
    $androidSnapshot = ya_sync_load_android_snapshot();
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
            'request_count' => count($publicRequests),
            'latest_created_at' => $latestCreatedAt,
            'pulled_at' => $now,
            'android_snapshot_updated_at' => ya_sync_string($androidSnapshot['updated_at'] ?? '')
        ],
        'operations' => $androidSnapshot['summary'],
        'daily_tasks' => $androidSnapshot['daily_tasks'],
        'requests' => $publicRequests
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
    $updatedAt = ya_sync_string($snapshot['updated_at'] ?? $fallbackTimestamp);

    return [
        'summary' => [
            'pending_daily_tasks' => max(0, ya_sync_int($summary['pending_daily_tasks'] ?? 0, 0)),
            'available_rooms' => max(0, ya_sync_int($summary['available_rooms'] ?? 0, 0)),
            'total_rooms' => max(0, ya_sync_int($summary['total_rooms'] ?? 0, 0)),
            'available_tables' => max(0, ya_sync_int($summary['available_tables'] ?? 0, 0)),
            'pending_reservations' => max(0, ya_sync_int($summary['pending_reservations'] ?? 0, 0)),
            'prepared_whatsapp_messages' => max(0, ya_sync_int($summary['prepared_whatsapp_messages'] ?? 0, 0)),
            'active_menu_categories' => max(0, ya_sync_int($summary['active_menu_categories'] ?? 0, 0)),
            'available_menu_items' => max(0, ya_sync_int($summary['available_menu_items'] ?? 0, 0)),
            'customer_count' => max(0, ya_sync_int($summary['customer_count'] ?? 0, 0))
        ],
        'daily_tasks' => ya_sync_sanitize_android_tasks($tasks),
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

        if (count($records) >= 20) {
            break;
        }
    }

    return $records;
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

    $json = file_get_contents($path);
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
