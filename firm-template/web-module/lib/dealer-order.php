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
        $now = date(DATE_ATOM); $id = 'web_dealer_order_' . bin2hex(random_bytes(16));
        $hint = $input['catalogRevision'] ?? $catalog['catalog_revision'];
        if (!is_string($hint) || preg_match('/^[a-f0-9]{64}$/D', $hint) !== 1) ya_online_order_invalid();
        ya_storage_enqueue_web_order(['id' => $id, ...$request, 'catalogRevision' => $hint, 'createdAt' => $now]);
        $response = ['ok' => true, 'order_id' => $id, 'accepted_at' => $now, 'message' => 'Sipariş talebiniz alındı.'];
        ya_storage_insert_web_order_submission_receipt($keyHash, $fingerprint, $response);
        $db->exec('COMMIT');
        return $response;
    } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
}
