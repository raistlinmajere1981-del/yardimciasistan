<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/online-catalog.php';
require_once __DIR__ . '/customer-account.php';
require_once __DIR__ . '/commerce-order-payment.php';

const YA_DEALER_ERROR = 'Bağlantı geçersiz veya süresi dolmuş.';


/** Strict private allowlist. Desktop owns eligibility, web owns consumption/session state. */
function ya_dealer_projection(array $input): array
{
    if (($input['version'] ?? null) !== 3 || !is_bool($input['online_sales_enabled'] ?? null) || !is_bool($input['enabled'] ?? null)
        || !is_array($input['dealers'] ?? null) || count($input['dealers']) > 10000) {
        throw new InvalidArgumentException('dealer_projection_invalid');
    }
    $rows = []; $ids = []; $refs = [];
    foreach ($input['dealers'] as $row) {
        if (!is_array($row)) throw new InvalidArgumentException('dealer_projection_invalid');
        $id = $row['access_id'] ?? null; $ref = $row['customer_ref'] ?? null;
        $revision = $row['access_revision'] ?? null; $sessionRevision = $row['session_revision'] ?? null;
        $accountId = $row['account_id'] ?? null; $name = $row['display_name'] ?? null;
        if (!is_string($id) || preg_match('/^[a-f0-9-]{36}$/D', $id) !== 1 || isset($ids[$id])
            || !is_string($ref) || preg_match('/^[a-f0-9-]{36}$/D', $ref) !== 1 || isset($refs[$ref])
            || !is_int($sessionRevision) || $sessionRevision < 1 || !is_int($revision) || $revision < 1 || !is_bool($row['enabled'] ?? null)
            || !is_string($accountId) || ($accountId !== '' && preg_match('/^[a-f0-9-]{36}$/D', $accountId) !== 1) || !is_string($name) || strlen($name) > 640
            || preg_match('/[\x00-\x1f\x7f]/', $name)) throw new InvalidArgumentException('dealer_projection_invalid');
        $ids[$id] = true; $refs[$ref] = true;
        $enabled = $input['online_sales_enabled'] && $input['enabled'] && $row['enabled'];
        $rows[] = ['access_id' => $id, 'customer_ref' => $ref, 'display_name' => $name,
            'access_revision' => $revision, 'session_revision' => $sessionRevision, 'enabled' => $enabled, 'account_id' => $accountId];
    }
    $catalogs = []; $catalogIds = []; $owners = array_column($rows, null, 'access_id');
    if (!is_array($input['catalogs'] ?? [])) throw new InvalidArgumentException('dealer_catalog_invalid');
    foreach ($input['catalogs'] ?? [] as $catalog) {
        if (!is_array($catalog)) throw new InvalidArgumentException('dealer_catalog_invalid');
        $id = $catalog['access_id'] ?? '';
        if (!is_string($id)) throw new InvalidArgumentException('dealer_catalog_invalid');
        $owner = $owners[$id] ?? null;
        if (!$owner || !$owner['enabled'] || isset($catalogIds[$id])
            || ($catalog['access_revision'] ?? null) !== $owner['access_revision']
            || !is_string($catalog['catalog_revision'] ?? null)
            || preg_match('/^[a-f0-9]{64}$/D', $catalog['catalog_revision']) !== 1) throw new InvalidArgumentException('dealer_catalog_invalid');
        // Dealer catalogs retain their existing ordering-only delivery contract.
        if (($catalog['delivery_methods'] ?? null) === []) throw new InvalidArgumentException('invalid_delivery_methods');
        $safe = ya_online_catalog_projection(['enabled' => true, 'delivery_methods' => $catalog['delivery_methods'] ?? null, 'products' => $catalog['products'] ?? null]);
        $catalogIds[$id] = true;
        $rawProducts = array_column($catalog['products'], null, 'product_id');
        $catalogs[] = ['access_id' => $id, 'access_revision' => $owner['access_revision'], 'catalog_revision' => $catalog['catalog_revision'],
            'delivery_methods' => $safe['delivery_methods'], 'products' => array_map(static function (array $product) use ($rawProducts): array {
                $raw = $rawProducts[$product['product_id']];
                foreach (['brand', 'category_name'] as $field) $product[$field] = mb_substr(is_string($raw[$field] ?? null) ? $raw[$field] : '', 0, 180);
                $images = $raw['image_urls'] ?? ($product['image_url'] !== '' ? [$product['image_url']] : []);
                if (!is_array($images) || !array_is_list($images) || count($images) > 12) throw new InvalidArgumentException('dealer_images_invalid');
                foreach ($images as $image) if (!is_string($image) || $image === '' || strlen($image) > 2048 || ya_online_catalog_image_url($image) !== $image) throw new InvalidArgumentException('dealer_images_invalid');
                if (($images[0] ?? '') !== $product['image_url']) throw new InvalidArgumentException('dealer_images_invalid');
                $product['image_urls'] = array_values(array_unique($images, SORT_STRING));
                return $product;
            }, $safe['products'])];
    }
    return ['version' => 3, 'online_sales_enabled' => $input['online_sales_enabled'], 'enabled' => $input['enabled'], 'dealers' => $rows, 'catalogs' => $catalogs, 'web_order_statuses' => ya_commerce_status_projection($input['web_order_statuses'] ?? []), 'order_history' => ya_dealer_history_projection($input['order_history'] ?? [], $owners)];
}

/** Called inside the existing versioned publication transaction, only for an accepted new revision. */
function ya_dealer_apply_projection(PDO $db, array $projection, int $sourceEpoch = 0): void
{
    ya_commerce_apply_status_mail($db, $projection['web_order_statuses'] ?? []);
    $find = $db->prepare('SELECT * FROM dealer_access WHERE access_id = ?');
    $accountOwner = $db->prepare("SELECT access_id FROM dealer_access WHERE account_id = ? AND account_id <> ''");
    foreach ($projection['dealers'] as $row) {
        $find->execute([$row['access_id']]); $current = $find->fetch();
        if ($current && ($row['customer_ref'] !== $current['customer_ref']
            || ($current['account_id'] !== '' && $row['account_id'] !== $current['account_id'])
            || ((int)$current['source_epoch'] === $sourceEpoch && ($row['access_revision'] < (int)$current['access_revision']
                || $row['session_revision'] < (int)$current['session_revision'])))) throw new YaStorageConflictException('customer_binding_conflict');
        if ($row['account_id'] !== '') {
            $accountOwner->execute([$row['account_id']]); $owner = $accountOwner->fetchColumn();
            $registered = $db->prepare('SELECT 1 FROM customer_accounts WHERE id = ? AND email_verified = 1'); $registered->execute([$row['account_id']]);
            if (($owner && $owner !== $row['access_id']) || !$registered->fetchColumn()) throw new YaStorageConflictException('customer_binding_conflict');
            if ($current && ($row['session_revision'] > (int)$current['session_revision'] || (int)$current['source_epoch'] !== $sourceEpoch)) {
                $db->prepare('UPDATE customer_accounts SET session_version = session_version + 1 WHERE id = ?')->execute([$row['account_id']]);
            }
        }
    }
    $db->exec('UPDATE dealer_access SET enabled = 0');
    $upsert = $db->prepare('INSERT INTO dealer_access VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(access_id) DO UPDATE SET
        account_id = excluded.account_id, display_name = excluded.display_name, access_revision = excluded.access_revision,
        session_revision = excluded.session_revision, enabled = excluded.enabled, source_epoch = excluded.source_epoch');
    foreach ($projection['dealers'] as $row) $upsert->execute([$row['access_id'], $row['customer_ref'], $row['account_id'], $row['display_name'],
        $row['access_revision'], $row['session_revision'], (int)$row['enabled'], $sourceEpoch]);
    $db->exec('DELETE FROM dealer_catalogs');
    $insert = $db->prepare('INSERT INTO dealer_catalogs VALUES (?, ?, ?, ?)');
    foreach ($projection['catalogs'] as $catalog) $insert->execute([$catalog['access_id'], $catalog['access_revision'], $catalog['catalog_revision'], ya_storage_encode($catalog)]);
}

function ya_dealer_event(string $event, string $category = '', string $accessId = ''): void
{
    // Stable allowlisted event only; never pass input, exceptions, URL, cookies or contacts.
    error_log((string)json_encode(['scope' => 'dealer-access', 'event' => $event,
        'meta' => ['category' => $category, 'access_id' => $accessId]], JSON_UNESCAPED_SLASHES));
}

/** Shared account identity plus the current Desktop commercial projection; sessions survive dealer demotion. */
function ya_dealer_session_access(string $token): ?array
{
    $account = ya_account_session($token);
    if (!$account) return null;
    $find = ya_storage_open()->prepare('SELECT access_id, display_name, access_revision, account_id FROM dealer_access WHERE account_id = ? AND enabled = 1');
    $find->execute([$account['id']]); $access = $find->fetch();
    if (!$access) throw new YaAccountError(403, 'dealer_access_required');
    return $access;
}
function ya_dealer_identity(string $token): ?array
{
    $access = ya_dealer_session_access($token);
    return $access ? ['access_id' => $access['access_id'], 'display_name' => $access['display_name']] : null;
}

function ya_dealer_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
/** Same-origin JSON POST plus custom header: forms and cross-origin scripts cannot mutate sessions. */
function ya_dealer_require_post(): void
{
    try { ya_account_require_post(); }
    catch (YaAccountError $error) { ya_account_response($error->status, ['ok' => false, 'code' => $error->reason]); }
}

/** Private allowlist for a read projection; this never writes canonical order state. */
function ya_dealer_history_projection(mixed $histories, array $owners): array
{
    if (!is_array($histories) || !array_is_list($histories)) throw new InvalidArgumentException('dealer_history_invalid');
    $result = []; $seen = [];
    foreach ($histories as $history) {
        $id = $history['access_id'] ?? null;
        if (!is_string($id) || !isset($owners[$id]) || $owners[$id]['account_id'] === '' || isset($seen[$id])
            || !is_array($history['orders'] ?? null) || !array_is_list($history['orders'])) throw new InvalidArgumentException('dealer_history_invalid');
        $seen[$id] = true; $orders = []; $orderIds = [];
        foreach ($history['orders'] as $order) {
            $orderId = $order['order_id'] ?? null; $total = $order['total'] ?? null;
            if (!is_string($orderId) || strlen($orderId) > 180 || $orderId === '' || isset($orderIds[$orderId])
                || !in_array($order['status'] ?? null, ['placed', 'confirmed', 'fulfilled', 'cancelled', 'rejected'], true)
                || ($total !== null && ((!is_int($total) && !is_float($total)) || !is_finite((float)$total) || $total < 0))
                || !is_string($order['currency'] ?? null) || preg_match('/^(?:[A-Z]{3})?$/D', $order['currency']) !== 1
                || !is_array($order['items'] ?? null) || !array_is_list($order['items'])) throw new InvalidArgumentException('dealer_history_invalid');
            foreach (['created_at', 'updated_at'] as $field) if (!is_string($order[$field] ?? null) || strlen($order[$field]) > 64 || strtotime($order[$field]) === false) throw new InvalidArgumentException('dealer_history_invalid');
            $items = [];
            foreach ($order['items'] as $item) {
                if (!is_string($item['product_id'] ?? null) || strlen($item['product_id']) > 180
                    || !is_string($item['name'] ?? null) || mb_strlen($item['name']) > 180
                    || (!is_int($item['quantity'] ?? null) && !is_float($item['quantity'] ?? null))
                    || !is_finite((float)$item['quantity']) || $item['quantity'] <= 0) throw new InvalidArgumentException('dealer_history_invalid');
                $items[] = ['product_id' => $item['product_id'], 'name' => $item['name'], 'quantity' => $item['quantity']];
            }
            $orderIds[$orderId] = true;
            $orders[] = ['order_id' => $orderId, 'status' => $order['status'], 'created_at' => $order['created_at'],
                'updated_at' => $order['updated_at'], 'total' => $total, 'currency' => $order['currency'], 'items' => $items];
        }
        $result[] = ['access_id' => $id, 'orders' => $orders];
    }
    return $result;
}
