<?php
declare(strict_types=1);
require_once __DIR__ . '/dealer-access.php';
require_once __DIR__ . '/online-order.php';

/** Always derive catalog ownership from a currently valid session; never from request ids. */
function ya_dealer_catalog(string $token): ?array
{
    $access = ya_dealer_session_access($token);
    if (!$access) throw new YaOnlineOrderRejection(401, 'dealer_access_required', 'Bayi erişimi gerekli.');
    $query = ya_storage_open()->prepare('SELECT payload_json FROM dealer_catalogs WHERE dealer_access_id = ? AND access_revision = ?');
    $query->execute([$access['access_id'], $access['access_revision']]);
    $payload = $query->fetchColumn();
    return is_string($payload) ? json_decode($payload, true, 512, JSON_THROW_ON_ERROR) : null;
}

function ya_dealer_order_submit(string $token, array $input): array
{
    // Identity fields are rejected. All monetary fields are excluded by the semantic allowlist.
    foreach (['customerId', 'dealerAccessId', 'accessRevision', 'priceGroup', 'buyer', 'kind'] as $field) {
        if (array_key_exists($field, $input)) ya_online_order_invalid();
    }
    $key = $input['idempotencyKey'] ?? null;
    if (!is_string($key) || preg_match('/^[A-Za-z0-9_-]{16,128}$/D', $key) !== 1) ya_online_order_invalid();
    $semantic = ['items' => ya_online_order_items($input['items'] ?? null),
        'delivery' => ya_online_order_delivery($input['delivery'] ?? null),
        'note' => ya_online_order_text($input['note'] ?? '', 2000, true)];
    $db = ya_storage_open();
    $db->exec('BEGIN IMMEDIATE');
    try {
        $access = ya_dealer_session_access($token);
        if (!$access) throw new YaOnlineOrderRejection(401, 'dealer_access_required', 'Bayi erişimi gerekli.');
        $identity = ['kind' => 'dealer', 'dealerAccessId' => $access['access_id'], 'accessRevision' => (int)$access['access_revision']];
        $request = [...$identity, ...$semantic];
        $keyHash = hash('sha256', 'dealer:' . $access['access_id'] . ':' . $key);
        $fingerprint = ya_storage_web_order_submission_fingerprint($request);
        $receipt = ya_storage_get_web_order_submission_receipt($keyHash);
        if ($receipt && !hash_equals($receipt['request_hash'], $fingerprint)) {
            throw new YaOnlineOrderRejection(409, 'idempotency_conflict', 'Tekrar deneme kimliği farklı bir sipariş için kullanılmış.');
        }
        if ($receipt) { $db->exec('COMMIT'); return $receipt['response']; }
        $catalog = ya_dealer_catalog($token);
        if (!$catalog) throw new YaOnlineOrderRejection(503, 'catalog_unavailable', 'Bayi kataloğu henüz hazır değil.');
        if (!in_array($semantic['delivery']['method'], $catalog['delivery_methods'], true)) {
            throw new YaOnlineOrderRejection(422, 'delivery_method_unavailable', 'Seçilen teslimat yöntemi artık sunulmuyor.');
        }
        $ids = array_fill_keys(array_column($catalog['products'], 'product_id'), true);
        foreach ($semantic['items'] as $item) if (!isset($ids[$item['productId']])) {
            throw new YaOnlineOrderRejection(422, 'product_unavailable', 'Siparişteki ürünlerden biri artık sunulmuyor.');
        }
        $quote = ya_commerce_quote($semantic['items'], $catalog['products']);
        $now = date(DATE_ATOM); $id = 'web_dealer_order_' . bin2hex(random_bytes(16));
        $hint = $input['catalogRevision'] ?? $catalog['catalog_revision'];
        if (!is_string($hint) || preg_match('/^[a-f0-9]{64}$/D', $hint) !== 1) ya_online_order_invalid();
        ya_storage_enqueue_web_order(['id' => $id, ...$request, 'catalogRevision' => $hint, 'quote' => $quote, 'createdAt' => $now]);
        $response = ['ok' => true, 'order_id' => $id, 'accepted_at' => $now, 'quoted_total' => $quote['subtotal_minor'] / 100, 'currency' => $quote['currency'], 'message' => 'Sipariş talebiniz alındı.'];
        ya_storage_insert_web_order_submission_receipt($keyHash, $fingerprint, $response);
        $db->exec('COMMIT');
        return $response;
    } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
}

/** Session-scoped union of canonical read snapshots and retained ingress facts.
 * awaiting_desktop describes transport only, never an invented canonical order status.
 */
function ya_dealer_orders(string $token): array
{
    $access = ya_dealer_session_access($token);
    if (!$access) throw new YaOnlineOrderRejection(401, 'dealer_access_required', 'Bayi erişimi gerekli.');
    return ya_customer_order_history($access);
}

/** Recover the account's accepted attempt even after commercial permission changes.
 * The caller has already required its current account session. Access IDs are
 * resolved here, never accepted from the client; no price or other account leaks.
 */
function ya_customer_order_receipt(string $accountId, string $key): ?array
{
    $receipt = ya_storage_get_web_order_submission_receipt(hash('sha256', 'customer:' . $accountId . ':' . $key));
    if ($receipt !== null) return $receipt['response'];
    $query = ya_storage_open()->prepare('SELECT access_id FROM dealer_access WHERE account_id = ?');
    $query->execute([$accountId]);
    foreach ($query->fetchAll(PDO::FETCH_COLUMN) as $accessId) {
        $receipt = ya_storage_get_web_order_submission_receipt(hash('sha256', 'dealer:' . $accessId . ':' . $key));
        if ($receipt !== null) return $receipt['response'];
    }
    return null;
}

function ya_customer_order_history(array $access): array
{
    $publication = ya_storage_get_publication('dealer_access_private', []);
    $orders = [];
    foreach ($publication['order_history'] ?? [] as $history) if ($history['access_id'] === $access['access_id']) {
        foreach ($history['orders'] as $order) $orders[$order['order_id']] = $order;
    }
    $query = ya_storage_open()->prepare("SELECT payload_json FROM web_orders WHERE (json_extract(payload_json, '$.kind') = 'dealer' AND json_extract(payload_json, '$.dealerAccessId') = ?) OR (json_extract(payload_json, '$.kind') = 'customer' AND json_extract(payload_json, '$.accountId') = ?) ORDER BY seq DESC");
    $query->execute([$access['access_id'], $access['account_id'] ?? '']);
    foreach ($query as $row) {
        $input = json_decode($row['payload_json'], true, 512, JSON_THROW_ON_ERROR);
        if (isset($orders[$input['id']])) continue;
        $orders[$input['id']] = ['order_id' => $input['id'], 'status' => 'awaiting_desktop',
            'created_at' => $input['createdAt'], 'updated_at' => $input['createdAt'], 'total' => null, 'currency' => '',
            'items' => array_map(static fn(array $item): array => ['product_id' => $item['productId'], 'quantity' => $item['quantity'], 'name' => ''], $input['items'])];
    }
    $orders = array_values($orders);
    usort($orders, static fn(array $a, array $b): int => strcmp($b['created_at'], $a['created_at']) ?: strcmp($b['order_id'], $a['order_id']));
    return ['orders' => $orders, 'updated_at' => $publication['_publication']['updated_at'] ?? ''];
}
