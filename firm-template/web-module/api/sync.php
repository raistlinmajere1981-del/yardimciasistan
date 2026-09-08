<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';
const YA_AI_SETTINGS_FILE = YA_BASE_DIR . '/data/ai-settings.local.php';

require_once YA_BASE_DIR . '/lib/storage.php';
require_once YA_BASE_DIR . '/lib/android-device-auth.php';

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
    if ($action === 'capabilities') {
        ya_sync_capabilities();
    }

    if ($action === 'pull_requests') {
        ya_sync_pull_requests($payload);
    }

    if ($action === 'android_summary') {
        ya_sync_android_summary($payload, $businessConfig);
    }

    if ($action === 'mark_requests_synced') {
        ya_sync_mark_requests_synced($payload);
    }

    if ($action === 'acknowledge_requests') {
        ya_sync_acknowledge_requests($payload);
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
} catch (YaStorageConflictException $error) {
    ya_sync_response(409, [
        'ok' => false,
        'message' => 'Daha eski bir yayın güncel verinin üzerine yazılamaz.',
        'error' => $error->getMessage()
    ]);
} catch (Throwable $error) {
    $storageUnavailable = $error->getMessage() === 'pdo_sqlite_missing';
    ya_sync_response($storageUnavailable ? 503 : 500, [
        'ok' => false,
        'message' => $storageUnavailable
            ? 'Hostingde PHP SQLite desteği etkin değil. PDO_SQLITE eklentisini açıp tekrar deneyin.'
            : 'Güncelleme sırasında bir sorun oldu. Biraz sonra tekrar deneyin.',
        'error' => $storageUnavailable ? 'pdo_sqlite_missing' : 'sync_failed'
    ]);
}

function ya_sync_capabilities(): void
{
    $now = date(DATE_ATOM);
    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Senkron özellikleri alındı.',
        ...ya_storage_capabilities(),
        'server_time' => $now,
        'server_revision' => ya_storage_server_revision()
    ]);
}

function ya_sync_android_summary(array $payload, array $businessConfig): void
{
    $limit = ya_sync_int($payload['limit'] ?? $_GET['limit'] ?? 100, 100);
    $limit = max(1, min($limit, 200));
    $deviceId = ya_sync_string($payload['device_id'] ?? $_GET['device_id'] ?? '');
    if (preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $deviceId) !== 1) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'Telefon kimliği geçersiz.'
        ]);
    }

    $androidSnapshot = ya_sync_load_android_snapshot();
    if (!ya_android_auth_snapshot_has_capabilities(['service.android'], $androidSnapshot)) {
        ya_sync_response(403, [
            'ok' => false,
            'code' => 'android_capability_disabled',
            'message' => 'Android bağlantısı bu işletmede etkin değil.'
        ]);
    }
    ya_storage_record_android_device([
        'device_id' => $deviceId,
        'device_name' => ya_sync_string($payload['device_name'] ?? $_GET['device_name'] ?? ''),
        'app_version' => ya_sync_string($payload['app_version'] ?? $_GET['app_version'] ?? ''),
        'last_seen_at' => date(DATE_ATOM)
    ]);
    $businessCapabilities = array_fill_keys($androidSnapshot['business_capabilities'], true);
    $customersEnabled = isset($businessCapabilities['core.customers']);
    $aiEnabled = isset($businessCapabilities['service.ai']);
    $whatsAppEnabled = isset($businessCapabilities['service.whatsapp']);
    $permissionProfile = is_array($androidSnapshot['androidPermissions'][$deviceId] ?? null)
        ? $androidSnapshot['androidPermissions'][$deviceId]
        : [];
    $permissionList = is_array($permissionProfile['permissions'] ?? null) ? $permissionProfile['permissions'] : [];
    $deviceActive = ya_sync_bool($permissionProfile['is_active'] ?? false);
    $serverRevision = ya_storage_server_revision();

    if (!$deviceActive) {
        $now = date(DATE_ATOM);
        ya_sync_update_state(['last_android_summary_at' => $now]);
        $role = ya_sync_string($permissionProfile['role'] ?? 'staff');
        if (!in_array($role, ['admin', 'staff'], true)) {
            $role = 'staff';
        }
        ya_sync_response(200, [
            'ok' => true,
            'code' => 'device_approval_required',
            'message' => 'Bu cihaz masaüstünden onay bekliyor.',
            'approval_required' => true,
            'business' => [
                'display_name' => ya_sync_string($businessConfig['display_name'] ?? $businessConfig['name'] ?? ''),
                'phone' => ya_sync_string($businessConfig['phone'] ?? ''),
                'whatsapp' => $whatsAppEnabled ? ya_sync_string($businessConfig['whatsapp'] ?? '') : ''
            ],
            'summary' => [
                'total_requests' => 0,
                'new_requests' => 0,
                'pending_requests' => 0,
                'synced_requests' => 0,
                'request_count' => 0,
                'latest_created_at' => '',
                'pulled_at' => $now,
                'android_snapshot_updated_at' => ya_sync_string($androidSnapshot['updated_at'] ?? ''),
                'pending_action_count' => 0
            ],
            'operations' => [
                'pending_daily_tasks' => 0,
                'today_tasks' => 0,
                'available_rooms' => 0,
                'total_rooms' => 0,
                'available_tables' => 0,
                'occupied_tables' => 0,
                'bill_waiting_tables' => 0,
                'active_table_orders' => 0,
                'pending_reservations' => 0,
                'prepared_whatsapp_messages' => 0,
                'waiting_responses' => 0,
                'active_menu_categories' => 0,
                'available_menu_items' => 0,
                'customer_count' => 0
            ],
            'business_capabilities' => $androidSnapshot['business_capabilities'],
            'daily_tasks' => [],
            'requests' => [],
            'customers' => [],
            'customer_room_stays' => [],
            'room_folios' => [],
            'reservations' => [],
            'rooms' => [],
            'tables' => [],
            'menu' => ['categories' => [], 'items' => [], 'updated_at' => ''],
            'admin_menu' => ['categories' => [], 'items' => [], 'updated_at' => ''],
            'trackedStockItems' => [],
            'appliedStockImageHashes' => [],
            'table_orders' => [],
            'messages' => [],
            'androidPermissions' => [
                $deviceId => [
                    'role' => $role,
                    'is_active' => false,
                    'permissions' => []
                ]
            ],
            'finance' => [],
            'reports' => [],
            'market' => ya_sync_empty_android_market(),
            'actions' => [],
            'server_revision' => $serverRevision
        ]);
    }

    $visibleActionHistory = ya_sync_get_visible_android_actions(
        $deviceId,
        200,
        $androidSnapshot,
        $permissionProfile
    );
    $pendingActionCount = count(array_filter(
        $visibleActionHistory,
        static fn (array $action): bool => ya_sync_string($action['status'] ?? '') === 'pending'
    ));

    $knownServerRevision = max(0, ya_sync_int($payload['known_server_revision'] ?? 0, 0));
    if ($knownServerRevision > 0 && $knownServerRevision === $serverRevision) {
        $now = date(DATE_ATOM);
        ya_sync_update_state(['last_android_summary_at' => $now]);
        ya_sync_response(200, [
            'ok' => true,
            'message' => 'Android verisi zaten güncel.',
            'approval_required' => false,
            'not_modified' => true,
            'server_revision' => $serverRevision,
            'pulled_at' => $now,
            'pending_action_count' => $pendingActionCount
        ]);
    }
    $records = $customersEnabled ? ya_storage_all_requests() : [];

    $deletedRequestIds = array_fill_keys($androidSnapshot['deleted_request_ids'], true);
    $requestsById = [];
    foreach ($customersEnabled ? $androidSnapshot['requests'] : [] as $snapshotRequest) {
        if (!is_array($snapshotRequest)) {
            continue;
        }
        $requestId = ya_sync_string($snapshotRequest['id'] ?? '');
        if ($requestId !== '' && !isset($deletedRequestIds[$requestId])) {
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
        if (
            $requestId !== ''
            && !isset($deletedRequestIds[$requestId])
            && !isset($requestsById[$requestId])
        ) {
            $requestsById[$requestId] = ya_sync_sanitize_android_request($publicRequest);
        }
    }

    $publicRequests = array_values($requestsById);
    foreach ($publicRequests as &$publicRequest) {
        if (!$aiEnabled) {
            $publicRequest['ai_summary'] = '';
            $publicRequest['ai_suggested_reply'] = '';
        }
        if (!$whatsAppEnabled) {
            $publicRequest['whatsapp_message'] = '';
        }
    }
    unset($publicRequest);
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
    $actions = array_slice($visibleActionHistory, 0, 40);
    $reportsAllowed = ($permissionProfile['role'] ?? 'staff') === 'admin'
        && isset($businessCapabilities['core.reports']);
    $financeAllowed = isset($businessCapabilities['core.finance'])
        && in_array('finance.view', $permissionList, true);
    $roomFolioAllowed = in_array('room_folio.view', $permissionList, true);
    $customerManagementAllowed = $customersEnabled
        && ($permissionProfile['role'] ?? 'staff') === 'admin'
        && in_array('customer.manage', $permissionList, true);
    ya_sync_update_state([
        'last_android_summary_at' => $now
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Android özeti alındı.',
        'approval_required' => false,
        'business' => [
            'display_name' => ya_sync_string($businessConfig['display_name'] ?? $businessConfig['name'] ?? ''),
            'phone' => ya_sync_string($businessConfig['phone'] ?? ''),
            'whatsapp' => $whatsAppEnabled ? ya_sync_string($businessConfig['whatsapp'] ?? '') : ''
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
        'business_capabilities' => $androidSnapshot['business_capabilities'],
        'daily_tasks' => $androidSnapshot['daily_tasks'],
        'requests' => $visibleRequests,
        'customers' => $customerManagementAllowed ? $androidSnapshot['customers'] : [],
        'customer_room_stays' => $customerManagementAllowed ? $androidSnapshot['customer_room_stays'] : [],
        'room_folios' => $roomFolioAllowed ? $androidSnapshot['room_folios'] : [],
        'reservations' => $androidSnapshot['reservations'],
        'rooms' => $androidSnapshot['rooms'],
        'tables' => $androidSnapshot['tables'],
        'menu' => $androidSnapshot['menu'],
        'admin_menu' => $androidSnapshot['admin_menu'],
        'trackedStockItems' => $androidSnapshot['trackedStockItems'],
        'appliedStockImageHashes' => $androidSnapshot['appliedStockImageHashes'],
        'table_orders' => $androidSnapshot['table_orders'],
        'messages' => $androidSnapshot['messages'],
        'androidPermissions' => [
            $deviceId => [
                'role' => in_array(ya_sync_string($permissionProfile['role'] ?? ''), ['admin', 'staff'], true)
                    ? ya_sync_string($permissionProfile['role'])
                    : 'staff',
                'is_active' => true,
                'permissions' => $permissionList
            ]
        ],
        'finance' => $financeAllowed ? $androidSnapshot['finance'] : [],
        'reports' => $reportsAllowed ? $androidSnapshot['reports'] : [],
        'market' => ya_sync_android_market_for_permissions($androidSnapshot['market'], $permissionList),
        'actions' => $actions,
        'server_revision' => ya_storage_server_revision()
    ]);
}

function ya_sync_pull_requests(array $payload): void
{
    $limit = ya_sync_int($payload['limit'] ?? $_GET['limit'] ?? 50, 50);
    $limit = max(1, min($limit, 200));
    $includeSynced = ya_sync_bool($payload['include_synced'] ?? $_GET['include_synced'] ?? false);
    $afterSeq = array_key_exists('after_seq', $payload)
        ? max(0, ya_sync_int($payload['after_seq'], 0))
        : null;
    $pulled = ya_storage_pull_requests($limit, $includeSynced, $afterSeq);
    $requests = array_map('ya_sync_public_request', $pulled['requests']);

    $now = date(DATE_ATOM);
    ya_sync_update_state([
        'last_request_pull_at' => $now
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Talepler alındı.',
        'requests' => $requests,
        'count' => count($requests),
        'pulled_at' => $now,
        'next_cursor' => $pulled['next_cursor'],
        'has_more' => $pulled['has_more'],
        'server_revision' => ya_storage_server_revision()
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
    $updatedCount = ya_storage_mark_requests_synced($requestIds, $now);

    ya_sync_update_state([
        'last_request_mark_at' => $now
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Talepler güncellendi.',
        'updated_count' => $updatedCount,
        'synced_at' => $now,
        'request_ids' => $requestIds,
        'total_records' => count(ya_storage_all_requests())
    ]);
}

function ya_sync_acknowledge_requests(array $payload): void
{
    $clientId = ya_sync_string($payload['client_id'] ?? '');
    $throughSeq = ya_sync_int($payload['through_seq'] ?? -1, -1);
    if (!preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $clientId) || $throughSeq < 0) {
        ya_sync_response(422, [
            'ok' => false,
            'message' => 'Talep onay cursor bilgisi geçersiz.'
        ]);
    }
    $now = date(DATE_ATOM);
    $updatedCount = ya_storage_acknowledge_requests($clientId, $throughSeq, $now);
    ya_storage_update_state(['last_request_ack_at' => $now]);
    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Talep cursor bilgisi onaylandı.',
        'updated_count' => $updatedCount,
        'acknowledged_cursor' => $throughSeq,
        'acknowledged_at' => $now,
        'server_revision' => ya_storage_server_revision()
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
    $updatedRequest = ya_storage_update_request_status($requestId, $nextStatus, $now);

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
        'total_records' => count(ya_storage_all_requests())
    ]);
}

function ya_sync_enqueue_android_action(array $payload): void
{
    $actionId = ya_sync_string($payload['action_id'] ?? $payload['id'] ?? '');
    $actionType = ya_sync_string($payload['action_type'] ?? '');
    $deviceId = ya_sync_string($payload['device_id'] ?? '');
    $deviceName = ya_sync_string($payload['device_name'] ?? '');
    $appVersion = ya_sync_string($payload['app_version'] ?? '');
    $actionPayload = $payload['payload'] ?? null;
    $snapshot = ya_sync_load_android_snapshot();
    if (!ya_android_auth_snapshot_has_capabilities(['service.android'], $snapshot)) {
        ya_sync_response(403, [
            'ok' => false,
            'code' => 'android_capability_disabled',
            'message' => 'Android bağlantısı bu işletmede etkin değil.'
        ]);
    }

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

    $permissionProfile = is_array($snapshot['androidPermissions'][$deviceId] ?? null)
        ? $snapshot['androidPermissions'][$deviceId]
        : [];
    if (!ya_sync_bool($permissionProfile['is_active'] ?? false)) {
        ya_sync_response(403, [
            'ok' => false,
            'code' => 'device_approval_required',
            'message' => 'Bu telefon masaüstünden onaylanmadan işlem gönderemez.'
        ]);
    }
    $permissions = is_array($permissionProfile['permissions'] ?? null)
        ? $permissionProfile['permissions']
        : [];
    $managementPermission = ya_sync_android_management_action_permission($actionType);
    if ($managementPermission !== '') {
        if (
            ya_sync_string($permissionProfile['role'] ?? '') !== 'admin'
            || !in_array($managementPermission, $permissions, true)
            || (
                in_array($actionType, ['customer_room_assign', 'customer_room_stay_status'], true)
                && !in_array('customer.manage', $permissions, true)
            )
        ) {
            ya_sync_response(403, [
                'ok' => false,
                'code' => 'customer_management_permission_denied',
                'message' => 'Müşteri ve konaklama yönetimi yalnız yetkili yönetici cihazlarda kullanılabilir.'
            ]);
        }
    }
    $requiredPermission = ya_sync_android_action_permission($actionType, $actionPayload);
    if ($requiredPermission === '' || !in_array($requiredPermission, $permissions, true)) {
        ya_sync_response(403, [
            'ok' => false,
            'code' => 'android_action_permission_denied',
            'message' => 'Bu telefonun bu işlem için etkin yetkisi yok.'
        ]);
    }
    if (!ya_sync_android_action_capability_allowed($actionType, $actionPayload, $snapshot)) {
        ya_sync_response(403, [
            'ok' => false,
            'code' => 'android_action_capability_disabled',
            'message' => 'Bu işlem işletmenin etkin yeteneklerinde kullanılamıyor.'
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
    ya_storage_record_android_device([
        'device_id' => $deviceId,
        'device_name' => $deviceName,
        'app_version' => $appVersion,
        'last_seen_at' => $now
    ]);
    $stored = ya_storage_enqueue_android_action([
            'id' => $actionId,
            'action_type' => $actionType,
            'payload' => $actionPayload,
            'created_at' => $now,
            'device_id' => $deviceId,
            'status' => 'pending',
            'error_message' => '',
            'processed_at' => ''
    ]);
    $created = $stored['created'] === true;
    $storedAction = ya_sync_public_android_action($stored['action']);

    ya_sync_update_state([
        'last_android_action_enqueue_at' => $now,
        'android_action_count' => ya_storage_count_pending_android_actions()
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
    $actions = array_map('ya_sync_public_android_action', ya_storage_pull_android_actions($limit));

    $now = date(DATE_ATOM);
    ya_sync_update_state(['last_android_action_pull_at' => $now]);
    ya_sync_response(200, [
        'ok' => true,
        'message' => $actions === [] ? 'Bekleyen telefon işlemi yok.' : 'Telefon işlemleri alındı.',
        'actions' => $actions,
        'devices' => ya_storage_get_android_device_sightings(),
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
    $currentAction = ya_storage_get_android_action($actionId);
    $currentStatus = ya_sync_string($currentAction['status'] ?? '');
    if ($currentAction !== null && $currentStatus !== 'pending' && $currentStatus !== $status) {
        ya_sync_response(409, [
            'ok' => false,
            'message' => 'İşlem sonucu daha önce farklı bir durumla kaydedilmiş.'
        ]);
    }
    $updatedAction = ya_storage_mark_android_action($actionId, $status, $errorMessage, $now);

    if ($updatedAction === null) {
        ya_sync_response(404, [
            'ok' => false,
            'message' => 'Telefon işlemi bulunamadı.'
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

    $publication = ya_storage_publish(
        'menu',
        $publishedMenu,
        ya_sync_string($payload['client_id'] ?? 'legacy-desktop'),
        array_key_exists('source_revision', $payload) ? ya_sync_int($payload['source_revision'], 0) : null,
        ya_sync_string($payload['idempotency_key'] ?? ''),
        $now
    );
    ya_sync_update_state([
        'last_menu_publish_at' => $now
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Menü yayınlandı.',
        'published_at' => $now,
        'updated_at' => $now,
        'category_count' => count($categories),
        'item_count' => count($items),
        'source_revision' => $publication['source_revision'],
        'server_revision' => $publication['server_revision'],
        'deduplicated' => $publication['deduplicated']
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
    $publication = ya_storage_publish(
        'android_snapshot',
        $publishedSnapshot,
        ya_sync_string($payload['client_id'] ?? 'legacy-desktop'),
        array_key_exists('source_revision', $payload) ? ya_sync_int($payload['source_revision'], 0) : null,
        ya_sync_string($payload['idempotency_key'] ?? ''),
        $now
    );
    ya_sync_update_state([
        'last_android_snapshot_at' => $now
    ]);

    ya_sync_response(200, [
        'ok' => true,
        'message' => 'Android özeti yayınlandı.',
        'published_at' => $now,
        'updated_at' => $publishedSnapshot['updated_at'],
        'task_count' => count($publishedSnapshot['daily_tasks']),
        'source_revision' => $publication['source_revision'],
        'server_revision' => $publication['server_revision'],
        'deduplicated' => $publication['deduplicated']
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
        'sync_seq',
        'synced_at',
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
        'customer_request_delete',
        'customer_create',
        'customer_update',
        'customer_delete',
        'customer_room_assign',
        'customer_room_stay_status',
        'reservation_room_create',
        'reservation_room_update',
        'reservation_table_create',
        'reservation_table_update',
        'reservation_approve',
        'reservation_reject',
        'reservation_cancel',
        'room_status_update',
        'daily_task_create',
        'daily_task_update',
        'daily_task_delete',
        'daily_task_complete',
        'daily_task_reopen',
        'daily_task_cancel',
        'finance_manual_create',
        'room_folio_payment_add',
        'room_folio_checkout',
        'table_status_update',
        'table_order_open',
        'table_order_add_item',
        'table_order_update_item_quantity',
        'table_order_remove_item',
        'table_order_set_preparing',
        'table_order_set_served',
        'table_order_set_payment_waiting',
        'table_order_close_paid',
        'table_order_cancel',
        'table_order_set_status',
        'table_order_close',
        'menu_stock_add',
        'menu_stock_set',
        'menu_stock_adjust',
        'menu_stock_image_import_apply',
        'market_stock_count',
        'market_purchase_receive',
        'market_product_draft_create',
        'market_cart_draft_create',
        'market_barcode_scan',
        'menu_category_delete',
        'menu_item_delete',
        'message_delete'
    ];
}

function ya_sync_android_management_action_permission(string $actionType): string
{
    if (in_array($actionType, ['customer_create', 'customer_update', 'customer_delete'], true)) {
        return $actionType === 'customer_delete' ? 'customer.delete' : 'customer.manage';
    }
    if (in_array($actionType, ['customer_room_assign', 'customer_room_stay_status'], true)) {
        return 'room.assign_customer';
    }
    return '';
}

function ya_sync_android_action_permission(string $actionType, array $payload): string
{
    $permissions = [
        'customer_request_mark_answered' => 'customer.mark_answered',
        'customer_request_reopen' => 'customer.respond',
        'customer_request_approve' => 'customer.respond',
        'customer_request_reject' => 'customer.reject',
        'customer_request_convert_to_reservation' => 'customer.convert_to_reservation',
        'customer_request_delete' => 'request.delete',
        'customer_create' => 'customer.manage',
        'customer_update' => 'customer.manage',
        'customer_delete' => 'customer.delete',
        'customer_room_assign' => 'room.assign_customer',
        'customer_room_stay_status' => 'room.assign_customer',
        'reservation_room_create' => 'reservation.create',
        'reservation_room_update' => 'reservation.update',
        'reservation_table_create' => 'reservation.create',
        'reservation_table_update' => 'reservation.update',
        'reservation_approve' => 'reservation.approve',
        'reservation_reject' => 'reservation.reject',
        'reservation_cancel' => 'reservation.cancel',
        'room_status_update' => 'room.update_status',
        'daily_task_create' => 'daily_task.create',
        'daily_task_update' => 'daily_task.update',
        'daily_task_delete' => 'daily_task.delete',
        'daily_task_complete' => 'daily_task.complete',
        'daily_task_reopen' => 'daily_task.reopen',
        'daily_task_cancel' => 'daily_task.update',
        'finance_manual_create' => 'finance.create',
        'room_folio_payment_add' => 'room_folio.payment',
        'room_folio_checkout' => 'room_folio.checkout',
        'table_status_update' => 'table.update_status',
        'table_order_open' => 'table_order.open',
        'table_order_add_item' => 'table_order.add_item',
        'table_order_update_item_quantity' => 'table_order.update_item',
        'table_order_remove_item' => 'table_order.remove_item',
        'table_order_set_preparing' => 'table_order.set_preparing',
        'table_order_set_served' => 'table_order.set_served',
        'table_order_set_payment_waiting' => 'table_order.set_payment_waiting',
        'table_order_close_paid' => 'table_order.close_paid',
        'table_order_cancel' => 'table_order.cancel',
        'menu_category_delete' => 'menu.delete',
        'menu_item_delete' => 'menu.delete',
        'message_delete' => 'message.delete',
        'menu_stock_add' => 'menu.stock_update',
        'menu_stock_set' => 'menu.stock_update',
        'menu_stock_adjust' => 'menu.stock_update',
        'menu_stock_image_import_apply' => 'menu.stock_update',
        'market_stock_count' => 'market.stock_count',
        'market_purchase_receive' => 'market.receiving',
        'market_product_draft_create' => 'market.product_draft',
        'market_cart_draft_create' => 'market.cart_draft',
        'market_barcode_scan' => 'market.scan_to_desktop'
    ];
    if (isset($permissions[$actionType])) {
        return $permissions[$actionType];
    }
    if ($actionType === 'table_order_set_status') {
        return match (ya_sync_string($payload['status'] ?? '')) {
            'preparing' => 'table_order.set_preparing',
            'served' => 'table_order.set_served',
            'payment' => 'table_order.set_payment_waiting',
            default => ''
        };
    }
    if ($actionType === 'table_order_close') {
        return match (ya_sync_string($payload['status'] ?? '')) {
            'paid' => 'table_order.close_paid',
            'cancelled' => 'table_order.cancel',
            default => ''
        };
    }
    return '';
}

function ya_sync_android_action_capability_allowed(string $actionType, array $payload, array $snapshot): bool
{
    $capabilities = array_fill_keys(
        is_array($snapshot['business_capabilities'] ?? null) ? $snapshot['business_capabilities'] : [],
        true
    );
    if (str_starts_with($actionType, 'reservation_room_')) {
        return isset($capabilities['accommodation.reservations']);
    }
    if (str_starts_with($actionType, 'reservation_table_')) {
        return isset($capabilities['food_service.reservations']);
    }
    if ($actionType === 'customer_request_convert_to_reservation') {
        $request = ya_sync_android_snapshot_record(
            $snapshot['requests'] ?? [],
            'id',
            ya_sync_string($payload['request_id'] ?? '')
        );
        $requestType = ya_sync_string($request['request_type'] ?? '');
        if ($requestType === 'pension_reservation') {
            return isset($capabilities['core.customers'], $capabilities['accommodation.reservations']);
        }
        if (in_array($requestType, ['restaurant_reservation', 'breakfast_request'], true)) {
            return isset($capabilities['core.customers'], $capabilities['food_service.reservations']);
        }
        return false;
    }
    if (in_array($actionType, ['reservation_approve', 'reservation_reject', 'reservation_cancel'], true)) {
        $reservation = ya_sync_android_snapshot_record(
            $snapshot['reservations'] ?? [],
            'id',
            ya_sync_string($payload['reservation_id'] ?? '')
        );
        return $reservation !== []
            && ya_sync_android_reservation_capability_allowed($reservation, $capabilities);
    }
    if (str_starts_with($actionType, 'daily_task_')) {
        if ($actionType === 'daily_task_create') {
            return ya_sync_android_task_capability_allowed($payload, $snapshot, $capabilities);
        }
        $task = ya_sync_android_snapshot_record(
            $snapshot['daily_tasks'] ?? [],
            'id',
            ya_sync_string($payload['task_id'] ?? '')
        );
        return $task !== [] && ya_sync_android_task_capability_allowed($task, $snapshot, $capabilities);
    }
    if ($actionType === 'room_status_update'
        && ya_sync_string($payload['status'] ?? '') === 'reserved') {
        return isset($capabilities['accommodation.rooms'], $capabilities['accommodation.reservations']);
    }
    if ($actionType === 'table_status_update') {
        $status = ya_sync_string($payload['status'] ?? '');
        if ($status === 'reserved') {
            return isset($capabilities['food_service.tables'], $capabilities['food_service.reservations']);
        }
        if (in_array($status, ['bill_waiting', 'waiting_bill', 'checkout', 'payment'], true)) {
            return isset($capabilities['food_service.tables'], $capabilities['food_service.orders']);
        }
    }

    $requirements = [
        'customer_request_mark_answered' => ['core.customers'],
        'customer_request_reopen' => ['core.customers'],
        'customer_request_approve' => ['core.customers'],
        'customer_request_reject' => ['core.customers'],
        'customer_request_delete' => ['core.customers'],
        'customer_create' => ['core.customers'],
        'customer_update' => ['core.customers'],
        'customer_delete' => ['core.customers'],
        'customer_room_assign' => ['core.customers', 'accommodation.stays'],
        'customer_room_stay_status' => ['core.customers', 'accommodation.stays'],
        'room_status_update' => ['accommodation.rooms'],
        'finance_manual_create' => ['core.finance'],
        'room_folio_payment_add' => ['accommodation.folio'],
        'room_folio_checkout' => ['accommodation.folio'],
        'table_status_update' => ['food_service.tables'],
        'table_order_open' => ['food_service.orders'],
        'table_order_add_item' => ['food_service.orders', 'food_service.menu'],
        'table_order_update_item_quantity' => ['food_service.orders'],
        'table_order_remove_item' => ['food_service.orders'],
        'table_order_set_preparing' => ['food_service.orders'],
        'table_order_set_served' => ['food_service.orders'],
        'table_order_set_payment_waiting' => ['food_service.orders'],
        'table_order_close_paid' => ['food_service.orders'],
        'table_order_cancel' => ['food_service.orders'],
        'table_order_set_status' => ['food_service.orders'],
        'table_order_close' => ['food_service.orders'],
        'menu_category_delete' => ['food_service.menu'],
        'menu_item_delete' => ['food_service.menu'],
        'menu_stock_add' => ['food_service.menu', 'commerce.inventory'],
        'menu_stock_set' => ['food_service.menu', 'commerce.inventory'],
        'menu_stock_adjust' => ['food_service.menu', 'commerce.inventory'],
        'menu_stock_image_import_apply' => ['food_service.menu', 'commerce.inventory', 'service.ai'],
        'market_stock_count' => ['commerce.inventory'],
        'market_purchase_receive' => ['retail.purchasing'],
        'market_product_draft_create' => ['commerce.catalog'],
        'market_cart_draft_create' => ['commerce.sales', 'commerce.catalog'],
        'market_barcode_scan' => ['retail.barcode', 'commerce.catalog', 'commerce.sales'],
        'message_delete' => ['core.customers', 'service.whatsapp']
    ];
    if (!isset($requirements[$actionType])) {
        return false;
    }
    return ya_sync_android_capabilities_include($capabilities, $requirements[$actionType]);
}

function ya_sync_android_capabilities_include(array $capabilities, array $required): bool
{
    foreach ($required as $capability) {
        if (!isset($capabilities[$capability])) {
            return false;
        }
    }
    return true;
}

function ya_sync_android_reservation_capability_allowed(array $reservation, array $capabilities): bool
{
    $reservationType = ya_sync_string($reservation['reservation_type'] ?? '');
    $hasRooms = in_array($reservationType, ['room', 'room_and_table', 'mixed'], true)
        || ya_sync_string_array($reservation['room_ids'] ?? []) !== [];
    $hasTables = in_array($reservationType, ['table', 'breakfast', 'room_and_table', 'mixed'], true)
        || ya_sync_string_array($reservation['table_ids'] ?? []) !== [];
    if ($hasRooms && $hasTables) {
        return isset($capabilities['accommodation.reservations'], $capabilities['food_service.reservations']);
    }
    if ($hasRooms) {
        return isset($capabilities['accommodation.reservations']);
    }
    if ($hasTables) {
        return isset($capabilities['food_service.reservations']);
    }
    return isset($capabilities['accommodation.reservations'])
        || isset($capabilities['food_service.reservations']);
}

function ya_sync_android_task_capability_allowed(array $payload, array $snapshot, array $capabilities): bool
{
    if (!isset($capabilities['core.tasks'])) {
        return false;
    }
    $taskType = ya_sync_string($payload['task_type'] ?? '');
    $relatedType = ya_sync_string($payload['related_type'] ?? '');
    if ($relatedType === 'reservation') {
        $reservation = ya_sync_android_snapshot_record(
            $snapshot['reservations'] ?? [],
            'id',
            ya_sync_string($payload['related_id'] ?? '')
        );
        $reservationType = ya_sync_string($payload['related_reservation_type'] ?? '');
        if ($reservationType === '') {
            $reservationType = ya_sync_string($reservation['reservation_type'] ?? '');
        }
        $hasRooms = in_array($reservationType, ['room', 'room_and_table', 'mixed'], true)
            || ya_sync_string_array($reservation['room_ids'] ?? []) !== [];
        $hasTables = in_array($reservationType, ['table', 'breakfast', 'room_and_table', 'mixed'], true)
            || ya_sync_string_array($reservation['table_ids'] ?? []) !== [];
        if ($hasRooms && $hasTables) {
            return isset($capabilities['accommodation.rooms'], $capabilities['food_service.tables']);
        }
        if ($hasRooms) {
            return isset($capabilities['accommodation.rooms']);
        }
        if ($hasTables) {
            return isset($capabilities['food_service.tables']);
        }
    }
    if (in_array($taskType, ['check_in', 'check_out', 'room_cleaning', 'room_maintenance', 'reservation', 'manual_pension'], true)
        || $relatedType === 'room') {
        return isset($capabilities['accommodation.rooms']);
    }
    if (in_array($taskType, ['table_reservation', 'breakfast', 'service', 'table_service', 'restaurant', 'table_check', 'payment', 'manual_restaurant'], true)
        || $relatedType === 'table') {
        return isset($capabilities['food_service.tables']);
    }
    return isset($capabilities['core.tasks']);
}

function ya_sync_android_snapshot_record(mixed $records, string $key, string $value): array
{
    if (!is_array($records) || $value === '') {
        return [];
    }
    foreach ($records as $record) {
        if (is_array($record) && hash_equals(ya_sync_string($record[$key] ?? ''), $value)) {
            return $record;
        }
    }
    return [];
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
    return array_map(
        'ya_sync_public_android_action',
        ya_storage_get_android_actions($deviceId, max(1, min($limit, 200)))
    );
}

function ya_sync_get_visible_android_actions(
    string $deviceId,
    int $limit,
    array $snapshot,
    array $permissionProfile
): array
{
    $permissions = is_array($permissionProfile['permissions'] ?? null)
        ? $permissionProfile['permissions']
        : [];
    $role = ya_sync_string($permissionProfile['role'] ?? '');
    return array_values(array_filter(
        ya_sync_get_android_actions($deviceId, $limit),
        static function (array $action) use ($snapshot, $permissions, $role): bool {
            $actionType = ya_sync_string($action['action_type'] ?? '');
            $payload = is_array($action['payload'] ?? null) ? $action['payload'] : [];
            $requiredPermission = ya_sync_android_action_permission($actionType, $payload);
            if (
                $requiredPermission === ''
                || !in_array($requiredPermission, $permissions, true)
                || !ya_sync_android_action_capability_allowed($actionType, $payload, $snapshot)
            ) {
                return false;
            }
            $managementPermission = ya_sync_android_management_action_permission($actionType);
            if ($managementPermission === '') {
                return true;
            }
            return $role === 'admin'
                && in_array($managementPermission, $permissions, true)
                && (
                    !in_array($actionType, ['customer_room_assign', 'customer_room_stay_status'], true)
                    || in_array('customer.manage', $permissions, true)
                );
        }
    ));
}

function ya_sync_count_pending_android_actions(string $deviceId): int
{
    if ($deviceId === '') {
        return 0;
    }

    return ya_storage_count_pending_android_actions($deviceId);
}

function ya_sync_load_android_snapshot(): array
{
    $snapshot = ya_storage_get_publication('android_snapshot', []);
    unset($snapshot['_publication']);
    return ya_sync_sanitize_android_snapshot($snapshot, ya_sync_string($snapshot['updated_at'] ?? ''));
}

function ya_sync_sanitize_android_snapshot(array $snapshot, string $fallbackTimestamp): array
{
    $summary = is_array($snapshot['summary'] ?? null) ? $snapshot['summary'] : [];
    $tasks = is_array($snapshot['daily_tasks'] ?? null) ? $snapshot['daily_tasks'] : [];
    $menu = is_array($snapshot['menu'] ?? null) ? $snapshot['menu'] : [];
    $adminMenu = is_array($snapshot['admin_menu'] ?? null) ? $snapshot['admin_menu'] : $menu;
    $updatedAt = ya_sync_string($snapshot['updated_at'] ?? $fallbackTimestamp);
    $categories = ya_sync_sanitize_menu_categories($menu['categories'] ?? [], $updatedAt);
    $categoryIds = array_map(static function (array $category): string {
        return ya_sync_string($category['id'] ?? '');
    }, $categories);
    $adminCategories = ya_sync_sanitize_menu_categories($adminMenu['categories'] ?? [], $updatedAt);
    $adminCategoryIds = array_map(static function (array $category): string {
        return ya_sync_string($category['id'] ?? '');
    }, $adminCategories);

    return [
        'business_capabilities' => ya_sync_sanitize_business_capabilities(
            $snapshot['business_capabilities'] ?? []
        ),
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
        'customer_room_stays' => ya_sync_sanitize_android_customer_room_stays($snapshot['customer_room_stays'] ?? []),
        'room_folios' => ya_sync_sanitize_android_room_folios($snapshot['room_folios'] ?? []),
        'reservations' => ya_sync_sanitize_android_reservations($snapshot['reservations'] ?? []),
        'rooms' => ya_sync_sanitize_android_rooms($snapshot['rooms'] ?? []),
        'tables' => ya_sync_sanitize_android_tables($snapshot['tables'] ?? []),
        'menu' => [
            'categories' => $categories,
            'items' => ya_sync_sanitize_menu_items($menu['items'] ?? [], $categoryIds, $updatedAt),
            'updated_at' => ya_sync_string($menu['updated_at'] ?? $updatedAt) ?: $updatedAt
        ],
        'admin_menu' => [
            'categories' => $adminCategories,
            'items' => ya_sync_sanitize_menu_items($adminMenu['items'] ?? [], $adminCategoryIds, $updatedAt),
            'updated_at' => ya_sync_string($adminMenu['updated_at'] ?? $updatedAt) ?: $updatedAt
        ],
        'deleted_request_ids' => ya_sync_sanitize_deleted_request_ids($snapshot['deleted_request_ids'] ?? []),
        'trackedStockItems' => ya_sync_sanitize_tracked_stock_items($snapshot['trackedStockItems'] ?? []),
        'appliedStockImageHashes' => ya_sync_sanitize_stock_image_hashes($snapshot['appliedStockImageHashes'] ?? []),
        'table_orders' => ya_sync_sanitize_android_table_orders($snapshot['table_orders'] ?? []),
        'messages' => ya_sync_sanitize_android_messages($snapshot['messages'] ?? []),
        'androidPermissions' => ya_sync_sanitize_android_permissions($snapshot['androidPermissions'] ?? []),
        'finance' => ya_sync_sanitize_android_finance($snapshot['finance'] ?? []),
        'reports' => ya_sync_sanitize_android_reports($snapshot['reports'] ?? []),
        'market' => ya_sync_sanitize_android_market($snapshot['market'] ?? []),
        'updated_at' => $updatedAt
    ];
}

function ya_sync_sanitize_business_capabilities(mixed $value): array
{
    $allowed = [
        'core.customers',
        'core.tasks',
        'core.calendar',
        'core.notifications',
        'core.finance',
        'core.reports',
        'core.web',
        'core.sync',
        'core.backups',
        'core.devices',
        'service.whatsapp',
        'service.ai',
        'service.android',
        'accommodation.rooms',
        'accommodation.reservations',
        'accommodation.stays',
        'accommodation.folio',
        'food_service.tables',
        'food_service.reservations',
        'food_service.orders',
        'food_service.menu',
        'channel.qr_menu',
        'commerce.catalog',
        'commerce.inventory',
        'commerce.sales',
        'retail.barcode',
        'retail.purchasing',
        'retail.suppliers',
        'retail.labels'
    ];

    return array_values(array_unique(array_filter(
        ya_sync_string_array($value),
        static fn(string $capability): bool => in_array($capability, $allowed, true)
    )));
}

function ya_sync_empty_android_market(): array
{
    return [
        'summary' => [
            'today_sale_count' => 0,
            'today_sales_total' => 0.0,
            'currency' => 'TRY',
            'critical_stock_count' => 0,
            'recent_stock_adjustments' => [],
            'recent_receiving_count' => 0
        ],
        'products' => [],
        'suppliers' => [],
        'recent_purchases' => [],
        'product_drafts' => [],
        'cart_drafts' => []
    ];
}

function ya_sync_sanitize_android_market(mixed $value): array
{
    $market = is_array($value) ? $value : [];
    $summary = is_array($market['summary'] ?? null) ? $market['summary'] : [];

    $adjustments = [];
    foreach (array_slice(is_array($summary['recent_stock_adjustments'] ?? null)
        ? $summary['recent_stock_adjustments']
        : [], 0, 20) as $rawAdjustment) {
        if (!is_array($rawAdjustment)) {
            continue;
        }
        $id = mb_substr(ya_sync_string($rawAdjustment['id'] ?? ''), 0, 220);
        $productId = mb_substr(ya_sync_string($rawAdjustment['product_id'] ?? ''), 0, 220);
        $type = ya_sync_string($rawAdjustment['type'] ?? '');
        if ($id === '' || $productId === '' || !in_array($type, ['count', 'adjust'], true)) {
            continue;
        }
        $adjustments[] = [
            'id' => $id,
            'product_id' => $productId,
            'product_name' => mb_substr(ya_sync_string($rawAdjustment['product_name'] ?? ''), 0, 240),
            'type' => $type,
            'quantity_delta' => ya_sync_float($rawAdjustment['quantity_delta'] ?? 0, 0),
            'quantity_after' => max(0, ya_sync_float($rawAdjustment['quantity_after'] ?? 0, 0)),
            'note' => mb_substr(ya_sync_string($rawAdjustment['note'] ?? ''), 0, 1000),
            'created_at' => ya_sync_string($rawAdjustment['created_at'] ?? '')
        ];
    }

    $products = [];
    foreach (array_slice(is_array($market['products'] ?? null) ? $market['products'] : [], 0, 500) as $rawProduct) {
        if (!is_array($rawProduct)) {
            continue;
        }
        $id = mb_substr(ya_sync_string($rawProduct['id'] ?? ''), 0, 220);
        $name = mb_substr(ya_sync_string($rawProduct['name'] ?? ''), 0, 240);
        if ($id === '' || $name === '') {
            continue;
        }
        $products[] = [
            'id' => $id,
            'name' => $name,
            'sku' => mb_substr(ya_sync_string($rawProduct['sku'] ?? ''), 0, 120),
            'barcode' => mb_substr(ya_sync_string($rawProduct['barcode'] ?? ''), 0, 120),
            'unit' => ya_sync_commerce_unit($rawProduct['unit'] ?? 'piece'),
            'sale_price' => max(0, ya_sync_float($rawProduct['sale_price'] ?? 0, 0)),
            'currency' => mb_substr(ya_sync_string($rawProduct['currency'] ?? 'TRY') ?: 'TRY', 0, 8),
            'is_active' => ya_sync_bool($rawProduct['is_active'] ?? false),
            'track_inventory' => ya_sync_bool($rawProduct['track_inventory'] ?? false),
            'current_quantity' => max(0, ya_sync_float($rawProduct['current_quantity'] ?? 0, 0)),
            'minimum_quantity' => max(0, ya_sync_float($rawProduct['minimum_quantity'] ?? 0, 0)),
            'inventory_updated_at' => ya_sync_string($rawProduct['inventory_updated_at'] ?? '')
        ];
    }

    $suppliers = [];
    foreach (array_slice(is_array($market['suppliers'] ?? null) ? $market['suppliers'] : [], 0, 300) as $rawSupplier) {
        if (!is_array($rawSupplier)) {
            continue;
        }
        $id = mb_substr(ya_sync_string($rawSupplier['id'] ?? ''), 0, 220);
        $name = mb_substr(ya_sync_string($rawSupplier['name'] ?? ''), 0, 240);
        if ($id !== '' && $name !== '') {
            $suppliers[] = [
                'id' => $id,
                'name' => $name,
                'is_active' => ya_sync_bool($rawSupplier['is_active'] ?? false)
            ];
        }
    }

    $purchases = [];
    foreach (array_slice(is_array($market['recent_purchases'] ?? null) ? $market['recent_purchases'] : [], 0, 20) as $rawPurchase) {
        if (!is_array($rawPurchase) || ya_sync_string($rawPurchase['status'] ?? '') !== 'received') {
            continue;
        }
        $id = mb_substr(ya_sync_string($rawPurchase['id'] ?? ''), 0, 220);
        if ($id === '') {
            continue;
        }
        $purchases[] = [
            'id' => $id,
            'supplier_id' => mb_substr(ya_sync_string($rawPurchase['supplier_id'] ?? ''), 0, 220),
            'supplier_name' => mb_substr(ya_sync_string($rawPurchase['supplier_name'] ?? ''), 0, 240),
            'status' => 'received',
            'received_at' => ya_sync_string($rawPurchase['received_at'] ?? ''),
            'total' => max(0, ya_sync_float($rawPurchase['total'] ?? 0, 0)),
            'currency' => mb_substr(ya_sync_string($rawPurchase['currency'] ?? 'TRY') ?: 'TRY', 0, 8),
            'line_count' => max(0, ya_sync_int($rawPurchase['line_count'] ?? 0, 0))
        ];
    }

    $productDrafts = [];
    foreach (array_slice(is_array($market['product_drafts'] ?? null) ? $market['product_drafts'] : [], 0, 100) as $rawDraft) {
        if (!is_array($rawDraft)) {
            continue;
        }
        $id = mb_substr(ya_sync_string($rawDraft['id'] ?? ''), 0, 220);
        $name = mb_substr(ya_sync_string($rawDraft['proposed_name'] ?? ''), 0, 240);
        $status = ya_sync_string($rawDraft['status'] ?? 'pending');
        if ($id === '' || $name === '' || !in_array($status, ['pending', 'reviewed'], true)) {
            continue;
        }
        $productDrafts[] = [
            'id' => $id,
            'barcode' => mb_substr(ya_sync_string($rawDraft['barcode'] ?? ''), 0, 120),
            'proposed_name' => $name,
            'sku' => mb_substr(ya_sync_string($rawDraft['sku'] ?? ''), 0, 120),
            'proposed_category' => mb_substr(ya_sync_string($rawDraft['proposed_category'] ?? ''), 0, 180),
            'proposed_purchase_price' => max(0, ya_sync_float($rawDraft['proposed_purchase_price'] ?? 0, 0)),
            'proposed_sale_price' => max(0, ya_sync_float($rawDraft['proposed_sale_price'] ?? 0, 0)),
            'currency' => mb_substr(ya_sync_string($rawDraft['currency'] ?? 'TRY') ?: 'TRY', 0, 8),
            'unit' => ya_sync_commerce_unit($rawDraft['unit'] ?? 'piece'),
            'note' => mb_substr(ya_sync_string($rawDraft['note'] ?? ''), 0, 2000),
            'source' => mb_substr(ya_sync_string($rawDraft['source'] ?? ''), 0, 80),
            'created_by_device' => mb_substr(ya_sync_string($rawDraft['created_by_device'] ?? ''), 0, 120),
            'status' => $status,
            'created_at' => ya_sync_string($rawDraft['created_at'] ?? ''),
            'updated_at' => ya_sync_string($rawDraft['updated_at'] ?? '')
        ];
    }

    $cartDrafts = [];
    foreach (array_slice(is_array($market['cart_drafts'] ?? null) ? $market['cart_drafts'] : [], 0, 100) as $rawDraft) {
        if (!is_array($rawDraft)) {
            continue;
        }
        $id = mb_substr(ya_sync_string($rawDraft['id'] ?? ''), 0, 220);
        $status = ya_sync_string($rawDraft['status'] ?? 'pending');
        if ($id === '' || !in_array($status, ['pending', 'reviewed'], true)) {
            continue;
        }
        $lines = [];
        foreach (array_slice(is_array($rawDraft['lines'] ?? null) ? $rawDraft['lines'] : [], 0, 200) as $rawLine) {
            if (!is_array($rawLine)) {
                continue;
            }
            $lineId = mb_substr(ya_sync_string($rawLine['id'] ?? ''), 0, 220);
            $productId = mb_substr(ya_sync_string($rawLine['product_id'] ?? ''), 0, 220);
            $quantity = ya_sync_float($rawLine['quantity'] ?? 0, 0);
            if ($lineId === '' || $productId === '' || $quantity <= 0) {
                continue;
            }
            $lines[] = [
                'id' => $lineId,
                'product_id' => $productId,
                'product_name' => mb_substr(ya_sync_string($rawLine['product_name'] ?? ''), 0, 240),
                'quantity' => $quantity
            ];
        }
        if ($lines === []) {
            continue;
        }
        $cartDrafts[] = [
            'id' => $id,
            'status' => $status,
            'source' => mb_substr(ya_sync_string($rawDraft['source'] ?? ''), 0, 80),
            'created_by_device' => mb_substr(ya_sync_string($rawDraft['created_by_device'] ?? ''), 0, 120),
            'note' => mb_substr(ya_sync_string($rawDraft['note'] ?? ''), 0, 2000),
            'lines' => $lines,
            'created_at' => ya_sync_string($rawDraft['created_at'] ?? ''),
            'updated_at' => ya_sync_string($rawDraft['updated_at'] ?? '')
        ];
    }

    return [
        'summary' => [
            'today_sale_count' => max(0, ya_sync_int($summary['today_sale_count'] ?? 0, 0)),
            'today_sales_total' => max(0, ya_sync_float($summary['today_sales_total'] ?? 0, 0)),
            'currency' => mb_substr(ya_sync_string($summary['currency'] ?? 'TRY') ?: 'TRY', 0, 8),
            'critical_stock_count' => max(0, ya_sync_int($summary['critical_stock_count'] ?? 0, 0)),
            'recent_stock_adjustments' => $adjustments,
            'recent_receiving_count' => count($purchases)
        ],
        'products' => $products,
        'suppliers' => $suppliers,
        'recent_purchases' => $purchases,
        'product_drafts' => $productDrafts,
        'cart_drafts' => $cartDrafts
    ];
}

function ya_sync_android_market_for_permissions(array $market, array $permissions): array
{
    $result = ya_sync_empty_android_market();
    if (in_array('market.summary.view', $permissions, true)) {
        $result['summary'] = $market['summary'];
    }
    if (in_array('market.product.view', $permissions, true)) {
        $result['products'] = $market['products'];
    }
    if (in_array('market.receiving', $permissions, true)) {
        $result['suppliers'] = $market['suppliers'];
        $result['recent_purchases'] = $market['recent_purchases'];
    }
    if (in_array('market.product_draft', $permissions, true)) {
        $result['product_drafts'] = $market['product_drafts'];
    }
    if (in_array('market.cart_draft', $permissions, true)) {
        $result['cart_drafts'] = $market['cart_drafts'];
    }
    return $result;
}

function ya_sync_sanitize_android_room_folios(mixed $value): array
{
    $records = [];
    foreach (array_slice(is_array($value) ? $value : [], 0, 100) as $rawFolio) {
        if (!is_array($rawFolio)) {
            continue;
        }
        $id = mb_substr(ya_sync_string($rawFolio['id'] ?? ''), 0, 220);
        $stayId = mb_substr(ya_sync_string($rawFolio['stay_id'] ?? ''), 0, 220);
        $roomId = mb_substr(ya_sync_string($rawFolio['room_id'] ?? ''), 0, 220);
        $status = ya_sync_string($rawFolio['status'] ?? 'open');
        if ($id === '' || $stayId === '' || $roomId === '' || $status !== 'open') {
            continue;
        }
        $records[] = [
            'id' => $id,
            'stay_id' => $stayId,
            'room_id' => $roomId,
            'room_name' => mb_substr(ya_sync_string($rawFolio['room_name'] ?? 'Oda') ?: 'Oda', 0, 180),
            'room_number' => mb_substr(ya_sync_string($rawFolio['room_number'] ?? ''), 0, 80),
            'customer_id' => mb_substr(ya_sync_string($rawFolio['customer_id'] ?? ''), 0, 220),
            'customer_name' => mb_substr(ya_sync_string($rawFolio['customer_name'] ?? ''), 0, 180),
            'status' => 'open',
            'guest_count' => max(1, min(50, ya_sync_int($rawFolio['guest_count'] ?? 1, 1))),
            'check_in_date' => ya_sync_string($rawFolio['check_in_date'] ?? ''),
            'planned_check_out_date' => ya_sync_string($rawFolio['planned_check_out_date'] ?? ''),
            'nights' => max(1, ya_sync_int($rawFolio['nights'] ?? 1, 1)),
            'nightly_price_minor' => max(0, ya_sync_int($rawFolio['nightly_price_minor'] ?? 0, 0)),
            'currency' => mb_substr(ya_sync_string($rawFolio['currency'] ?? 'TRY') ?: 'TRY', 0, 8),
            'lodging_total_minor' => max(0, ya_sync_int($rawFolio['lodging_total_minor'] ?? 0, 0)),
            'extras_total_minor' => ya_sync_int($rawFolio['extras_total_minor'] ?? 0, 0),
            'charge_total_minor' => max(0, ya_sync_int($rawFolio['charge_total_minor'] ?? 0, 0)),
            'paid_total_minor' => max(0, ya_sync_int($rawFolio['paid_total_minor'] ?? 0, 0)),
            'remaining_minor' => max(0, ya_sync_int($rawFolio['remaining_minor'] ?? 0, 0)),
            'opened_at' => ya_sync_string($rawFolio['opened_at'] ?? '')
        ];
    }
    return $records;
}

function ya_sync_sanitize_android_finance(mixed $value): array
{
    $finance = is_array($value) ? $value : [];
    $entries = [];
    foreach (array_slice(is_array($finance['recent_entries'] ?? null) ? $finance['recent_entries'] : [], 0, 50) as $rawEntry) {
        if (!is_array($rawEntry)) {
            continue;
        }
        $direction = ya_sync_string($rawEntry['direction'] ?? '');
        $amountMinor = max(0, ya_sync_int($rawEntry['amount_minor'] ?? 0, 0));
        if (!in_array($direction, ['income', 'expense'], true) || $amountMinor <= 0) {
            continue;
        }
        $entries[] = [
            'id' => mb_substr(ya_sync_string($rawEntry['id'] ?? ''), 0, 220),
            'direction' => $direction,
            'amount_minor' => $amountMinor,
            'currency' => mb_substr(ya_sync_string($rawEntry['currency'] ?? 'TRY') ?: 'TRY', 0, 8),
            'payment_method' => mb_substr(ya_sync_string($rawEntry['payment_method'] ?? 'unspecified'), 0, 32),
            'category' => mb_substr(ya_sync_string($rawEntry['category'] ?? ''), 0, 64),
            'description' => mb_substr(ya_sync_string($rawEntry['description'] ?? ''), 0, 180),
            'occurred_at' => ya_sync_string($rawEntry['occurred_at'] ?? ''),
            'source_type' => mb_substr(ya_sync_string($rawEntry['source_type'] ?? ''), 0, 64),
            'source_id' => mb_substr(ya_sync_string($rawEntry['source_id'] ?? ''), 0, 220),
            'note' => mb_substr(ya_sync_string($rawEntry['note'] ?? ''), 0, 500),
            'created_at' => ya_sync_string($rawEntry['created_at'] ?? '')
        ];
    }

    return [
        'generated_at' => ya_sync_string($finance['generated_at'] ?? ''),
        'currency' => mb_substr(ya_sync_string($finance['currency'] ?? 'TRY') ?: 'TRY', 0, 8),
        'today_income_minor' => max(0, ya_sync_int($finance['today_income_minor'] ?? 0, 0)),
        'today_expense_minor' => max(0, ya_sync_int($finance['today_expense_minor'] ?? 0, 0)),
        'today_net_minor' => ya_sync_int($finance['today_net_minor'] ?? 0, 0),
        'outstanding_pension_minor' => max(0, ya_sync_int($finance['outstanding_pension_minor'] ?? 0, 0)),
        'recent_entries' => $entries
    ];
}

function ya_sync_sanitize_android_permissions(mixed $profiles): array
{
    if (!is_array($profiles)) {
        return [];
    }
    $allowedPermissions = ya_sync_android_permissions();
    $result = [];
    foreach ($profiles as $deviceId => $profile) {
        $normalizedDeviceId = ya_sync_string($deviceId);
        if (!preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $normalizedDeviceId) || !is_array($profile)) {
            continue;
        }
        $role = ya_sync_string($profile['role'] ?? 'staff');
        if (!in_array($role, ['admin', 'staff'], true)) {
            $role = 'staff';
        }
        $permissions = array_values(array_unique(array_filter(
            ya_sync_string_array($profile['permissions'] ?? []),
            static fn(string $permission): bool => in_array($permission, $allowedPermissions, true)
        )));
        $result[$normalizedDeviceId] = [
            'role' => $role,
            'is_active' => ya_sync_bool($profile['is_active'] ?? false),
            'permissions' => $permissions
        ];
    }
    return $result;
}

function ya_sync_sanitize_android_reports(mixed $reports): array
{
    if (!is_array($reports)) {
        return [];
    }
    $result = [];
    foreach (['today', 'yesterday', 'last7', 'last30'] as $key) {
        $report = $reports[$key] ?? null;
        if (!is_array($report)) {
            continue;
        }
        $period = is_array($report['period'] ?? null) ? $report['period'] : [];
        $start = ya_sync_string($period['start'] ?? '');
        $end = ya_sync_string($period['end'] ?? '');
        if (
            preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) !== 1
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $end) !== 1
            || $start > $end
        ) {
            continue;
        }
        $summary = is_array($report['summary'] ?? null) ? $report['summary'] : [];
        $restaurant = is_array($report['restaurant'] ?? null) ? $report['restaurant'] : [];
        $attention = is_array($report['attention'] ?? null) ? $report['attention'] : [];
        $topItems = [];
        foreach (array_slice(is_array($restaurant['top_items'] ?? null) ? $restaurant['top_items'] : [], 0, 3) as $item) {
            if (!is_array($item)) {
                continue;
            }
            $name = mb_substr(ya_sync_string($item['name'] ?? ''), 0, 180);
            if ($name === '') {
                continue;
            }
            $topItems[] = [
                'name' => $name,
                'quantity' => max(0, ya_sync_float($item['quantity'] ?? 0, 0)),
                'revenue' => max(0, ya_sync_float($item['revenue'] ?? 0, 0))
            ];
        }
        $dailyRevenue = [];
        foreach (array_slice(is_array($restaurant['daily_revenue'] ?? null) ? $restaurant['daily_revenue'] : [], 0, 31) as $day) {
            if (!is_array($day)) {
                continue;
            }
            $date = ya_sync_string($day['date'] ?? '');
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) !== 1) {
                continue;
            }
            $dailyRevenue[] = [
                'date' => $date,
                'revenue' => max(0, ya_sync_float($day['revenue'] ?? 0, 0)),
                'closed_orders' => max(0, ya_sync_int($day['closed_orders'] ?? 0, 0))
            ];
        }
        $attentionItems = [];
        foreach (array_slice(is_array($attention['items'] ?? null) ? $attention['items'] : [], 0, 20) as $item) {
            if (!is_array($item)) {
                continue;
            }
            $title = mb_substr(ya_sync_string($item['title'] ?? ''), 0, 220);
            if ($title === '') {
                continue;
            }
            $attentionItems[] = [
                'kind' => mb_substr(ya_sync_string($item['kind'] ?? ''), 0, 80),
                'title' => $title,
                'detail' => mb_substr(ya_sync_string($item['detail'] ?? ''), 0, 320)
            ];
        }
        $result[$key] = [
            'period' => [
                'key' => $key,
                'label' => mb_substr(ya_sync_string($period['label'] ?? ''), 0, 80),
                'start' => $start,
                'end' => $end
            ],
            'summary' => [
                'restaurant_revenue' => max(0, ya_sync_float($summary['restaurant_revenue'] ?? 0, 0)),
                'closed_orders' => max(0, ya_sync_int($summary['closed_orders'] ?? 0, 0)),
                'average_order' => max(0, ya_sync_float($summary['average_order'] ?? 0, 0)),
                'approved_reservations' => max(0, ya_sync_int($summary['approved_reservations'] ?? 0, 0)),
                'approved_accommodation_reservations' => max(0, ya_sync_int($summary['approved_accommodation_reservations'] ?? 0, 0)),
                'approved_food_reservations' => max(0, ya_sync_int($summary['approved_food_reservations'] ?? 0, 0)),
                'approved_mixed_reservations' => max(0, ya_sync_int($summary['approved_mixed_reservations'] ?? 0, 0)),
                'approved_generic_reservations' => max(0, ya_sync_int($summary['approved_generic_reservations'] ?? 0, 0)),
                'new_requests' => max(0, ya_sync_int($summary['new_requests'] ?? 0, 0)),
                'attention_count' => max(0, ya_sync_int($summary['attention_count'] ?? 0, 0))
            ],
            'restaurant' => [
                'sold_item_count' => max(0, ya_sync_int($restaurant['sold_item_count'] ?? 0, 0)),
                'cancelled_orders' => max(0, ya_sync_int($restaurant['cancelled_orders'] ?? 0, 0)),
                'top_items' => $topItems,
                'daily_revenue' => $dailyRevenue
            ],
            'attention' => [
                'pending_requests' => max(0, ya_sync_int($attention['pending_requests'] ?? 0, 0)),
                'pending_reservations' => max(0, ya_sync_int($attention['pending_reservations'] ?? 0, 0)),
                'payment_waiting_tables' => max(0, ya_sync_int($attention['payment_waiting_tables'] ?? 0, 0)),
                'overdue_tasks' => max(0, ya_sync_int($attention['overdue_tasks'] ?? 0, 0)),
                'incomplete_tasks' => max(0, ya_sync_int($attention['incomplete_tasks'] ?? 0, 0)),
                'out_of_stock_items' => max(0, ya_sync_int($attention['out_of_stock_items'] ?? 0, 0)),
                'low_stock_items' => max(0, ya_sync_int($attention['low_stock_items'] ?? 0, 0)),
                'items' => $attentionItems
            ]
        ];
    }
    return $result;
}

function ya_sync_android_permissions(): array
{
    return [
        'customer.view',
        'customer.manage',
        'customer.respond',
        'customer.mark_answered',
        'customer.reject',
        'customer.convert_to_reservation',
        'customer.delete',
        'request.delete',
        'reservation.view',
        'reservation.create',
        'reservation.update',
        'reservation.approve',
        'reservation.reject',
        'reservation.cancel',
        'room.view',
        'room.update_status',
        'room.assign_customer',
        'room_folio.view',
        'room_folio.payment',
        'room_folio.checkout',
        'daily_task.view',
        'daily_task.create',
        'daily_task.update',
        'daily_task.delete',
        'daily_task.complete',
        'daily_task.reopen',
        'table.view',
        'table.update_status',
        'table_order.view',
        'table_order.open',
        'table_order.add_item',
        'table_order.update_item',
        'table_order.remove_item',
        'table_order.set_preparing',
        'table_order.set_served',
        'table_order.set_payment_waiting',
        'table_order.close_paid',
        'table_order.cancel',
        'menu.view',
        'menu.edit',
        'menu.stock_view',
        'menu.stock_update',
        'finance.view',
        'finance.create',
        'menu.delete',
        'message.delete',
        'settings.view',
        'settings.edit',
        'android_devices.view',
        'android_devices.manage',
        'market.summary.view',
        'market.product.view',
        'market.stock_count',
        'market.receiving',
        'market.product_draft',
        'market.cart_draft',
        'market.scan_to_desktop'
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
            'related_reservation_type' => ya_sync_string($task['related_reservation_type'] ?? ''),
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
            'identity_type' => ya_sync_customer_identity_type($record['identity_type'] ?? ''),
            'identity_number' => mb_substr(ya_sync_string($record['identity_number'] ?? ''), 0, 32),
            'nationality' => mb_substr(ya_sync_string($record['nationality'] ?? ''), 0, 80),
            'birth_date' => ya_sync_iso_date_or_empty($record['birth_date'] ?? ''),
            'gender' => ya_sync_customer_gender($record['gender'] ?? ''),
            'document_serial_number' => mb_substr(ya_sync_string($record['document_serial_number'] ?? ''), 0, 80),
            'document_expiry_date' => ya_sync_iso_date_or_empty($record['document_expiry_date'] ?? ''),
            'birth_place' => mb_substr(ya_sync_string($record['birth_place'] ?? ''), 0, 160),
            'mother_name' => mb_substr(ya_sync_string($record['mother_name'] ?? ''), 0, 160),
            'father_name' => mb_substr(ya_sync_string($record['father_name'] ?? ''), 0, 160),
            'issuing_authority' => mb_substr(ya_sync_string($record['issuing_authority'] ?? ''), 0, 160),
            'address' => mb_substr(ya_sync_string($record['address'] ?? ''), 0, 2000),
            'request_count' => max(0, ya_sync_int($record['request_count'] ?? 0, 0)),
            'reservation_count' => max(0, ya_sync_int($record['reservation_count'] ?? 0, 0)),
            'stay_count' => max(0, ya_sync_int($record['stay_count'] ?? 0, 0)),
            'updated_at' => ya_sync_string($record['updated_at'] ?? '')
        ];
        if (count($result) >= 500) {
            break;
        }
    }
    return array_values($result);
}

function ya_sync_sanitize_android_customer_room_stays(mixed $records): array
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
        $customerId = ya_sync_string($record['customer_id'] ?? '');
        $roomId = ya_sync_string($record['room_id'] ?? '');
        $status = ya_sync_string($record['status'] ?? '');
        if (
            $id === ''
            || $customerId === ''
            || $roomId === ''
            || !in_array($status, ['planned', 'checked_in', 'checked_out', 'cancelled'], true)
        ) {
            continue;
        }
        $result[$id] = [
            'id' => $id,
            'customer_id' => $customerId,
            'customer_name' => mb_substr(ya_sync_string($record['customer_name'] ?? ''), 0, 160),
            'customer_phone' => mb_substr(ya_sync_string($record['customer_phone'] ?? ''), 0, 40),
            'room_id' => $roomId,
            'room_name' => mb_substr(ya_sync_string($record['room_name'] ?? ''), 0, 160),
            'room_number' => mb_substr(ya_sync_string($record['room_number'] ?? ''), 0, 40),
            'reservation_id' => ya_sync_string($record['reservation_id'] ?? ''),
            'status' => $status,
            'check_in_date' => ya_sync_iso_date_or_empty($record['check_in_date'] ?? ''),
            'check_out_date' => ya_sync_iso_date_or_empty($record['check_out_date'] ?? ''),
            'guest_count' => max(1, min(50, ya_sync_int($record['guest_count'] ?? 1, 1))),
            'notes' => mb_substr(ya_sync_string($record['notes'] ?? ''), 0, 2000),
            'source' => mb_substr(ya_sync_string($record['source'] ?? 'manual'), 0, 80),
            'checked_in_at' => ya_sync_string($record['checked_in_at'] ?? ''),
            'checked_out_at' => ya_sync_string($record['checked_out_at'] ?? ''),
            'created_at' => ya_sync_string($record['created_at'] ?? ''),
            'updated_at' => ya_sync_string($record['updated_at'] ?? '')
        ];
        if (count($result) >= 500) {
            break;
        }
    }
    return array_values($result);
}

function ya_sync_customer_identity_type(mixed $value): string
{
    $type = ya_sync_string($value);
    return in_array($type, ['tc_identity_card', 'passport', 'other'], true) ? $type : '';
}

function ya_sync_customer_gender(mixed $value): string
{
    $gender = ya_sync_string($value);
    return in_array($gender, ['female', 'male', 'unspecified'], true) ? $gender : '';
}

function ya_sync_iso_date_or_empty(mixed $value): string
{
    $date = ya_sync_string($value);
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $matches) !== 1) {
        return '';
    }
    return checkdate((int) $matches[2], (int) $matches[3], (int) $matches[1]) ? $date : '';
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

        $stockQuantity = ya_sync_nullable_nonnegative_float($record['stock_quantity'] ?? null);
        $stockMinQuantity = ya_sync_nullable_nonnegative_float($record['stock_min_quantity'] ?? null);
        $stockUnit = ya_sync_stock_unit($record['stock_unit'] ?? 'piece');
        $stockConsumptionQuantity = ya_sync_positive_float($record['stock_consumption_quantity'] ?? 1, 1);
        $stockNote = ya_sync_string($record['stock_note'] ?? '');

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
            'stock_quantity' => $stockQuantity,
            'stock_min_quantity' => $stockMinQuantity,
            'stock_unit' => $stockUnit,
            'stock_consumption_quantity' => $stockConsumptionQuantity,
            'hide_when_out_of_stock' => ya_sync_bool($record['hide_when_out_of_stock'] ?? false),
            'stock_note' => $stockNote === '' ? null : $stockNote,
            'sort_order' => ya_sync_int($record['sort_order'] ?? 0, 0),
            'created_at' => ya_sync_string($record['created_at'] ?? $fallbackTimestamp) ?: $fallbackTimestamp,
            'updated_at' => ya_sync_string($record['updated_at'] ?? $fallbackTimestamp) ?: $fallbackTimestamp
        ];
    }

    return array_values($itemsById);
}

function ya_sync_sanitize_tracked_stock_items(mixed $records): array
{
    if (!is_array($records)) {
        return [];
    }

    $itemsById = [];
    foreach ($records as $record) {
        if (!is_array($record)) {
            continue;
        }
        $menuItemId = ya_sync_string($record['menu_item_id'] ?? '');
        $name = ya_sync_string($record['name'] ?? '');
        $quantity = ya_sync_nullable_nonnegative_float($record['stock_quantity'] ?? null);
        if ($menuItemId === '' || $name === '' || $quantity === null) {
            continue;
        }
        $minimum = ya_sync_nullable_nonnegative_float($record['stock_min_quantity'] ?? null);
        $consumption = ya_sync_positive_float($record['stock_consumption_quantity'] ?? 1, 1);
        $status = ya_sync_string($record['stock_status'] ?? '');
        if (!in_array($status, ['out_of_stock', 'low_stock', 'in_stock'], true)) {
            $status = $quantity < $consumption
                ? 'out_of_stock'
                : ($minimum !== null && $quantity <= $minimum ? 'low_stock' : 'in_stock');
        }
        $itemsById[$menuItemId] = [
            'menu_item_id' => $menuItemId,
            'name' => $name,
            'category' => ya_sync_string($record['category'] ?? 'Menü') ?: 'Menü',
            'price' => max(0, ya_sync_float($record['price'] ?? 0, 0)),
            'stock_quantity' => $quantity,
            'stock_min_quantity' => $minimum,
            'stock_unit' => ya_sync_stock_unit($record['stock_unit'] ?? 'piece'),
            'stock_consumption_quantity' => $consumption,
            'hide_when_out_of_stock' => ya_sync_bool($record['hide_when_out_of_stock'] ?? false),
            'stock_status' => $status
        ];
        if (count($itemsById) >= 500) {
            break;
        }
    }
    return array_values($itemsById);
}

function ya_sync_sanitize_stock_image_hashes(mixed $hashes): array
{
    if (!is_array($hashes)) {
        return [];
    }
    $result = [];
    foreach ($hashes as $hash) {
        $normalized = strtolower(ya_sync_string($hash));
        if (preg_match('/^[a-f0-9]{64}$/', $normalized) !== 1) {
            continue;
        }
        $result[$normalized] = true;
        if (count($result) >= 500) {
            break;
        }
    }
    return array_keys($result);
}

function ya_sync_sanitize_deleted_request_ids(mixed $ids): array
{
    if (!is_array($ids)) {
        return [];
    }

    $result = [];
    foreach ($ids as $id) {
        $normalized = ya_sync_string($id);
        if (
            $normalized === ''
            || strlen($normalized) > 200
            || preg_match('/^[A-Za-z0-9._:-]+$/', $normalized) !== 1
        ) {
            continue;
        }
        $result[$normalized] = true;
        if (count($result) >= 5000) {
            break;
        }
    }

    return array_keys($result);
}

function ya_sync_is_authorized(array $businessConfig, array $payload): bool
{
    $configuredSecret = ya_sync_string($businessConfig['sync_secret'] ?? '');
    if ($configuredSecret === '') {
        return false;
    }

    // Body authentication remains for one compatibility release. Query-string
    // secrets are deliberately rejected because URLs can be logged by proxies.
    $providedSecret = ya_sync_string($payload['sync_secret'] ?? '');
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
    ya_storage_update_state(array_merge($changes, [
        'updated_at' => date(DATE_ATOM)
    ]));
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

function ya_sync_nullable_nonnegative_float(mixed $value): ?float
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    $number = (float) $value;
    return is_finite($number) && $number >= 0 ? $number : null;
}

function ya_sync_positive_float(mixed $value, float $fallback): float
{
    if (!is_numeric($value)) {
        return $fallback;
    }
    $number = (float) $value;
    return is_finite($number) && $number > 0 ? $number : $fallback;
}

function ya_sync_stock_unit(mixed $value): string
{
    return ya_sync_string($value) === 'gram' ? 'gram' : 'piece';
}

function ya_sync_commerce_unit(mixed $value): string
{
    $unit = ya_sync_string($value);
    return in_array($unit, ['piece', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'meter', 'other'], true)
        ? $unit
        : 'piece';
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
