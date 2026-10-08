<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/online-catalog.php';

final class YaOnlineOrderRejection extends RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $responseCode, string $message)
    {
        parent::__construct($message);
    }
}

function ya_online_order_invalid(): never
{
    throw new YaOnlineOrderRejection(422, 'invalid_order', 'Lütfen ürünleri, iletişim ve teslimat bilgilerini kontrol edin.');
}

function ya_online_order_text(mixed $value, int $maximum, bool $multiline = false): string
{
    if (!is_string($value)) ya_online_order_invalid();
    $value = trim($value);
    $controls = $multiline ? '/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/' : '/[\x00-\x1f\x7f]/';
    if (mb_strlen($value) > $maximum || preg_match($controls, $value)) ya_online_order_invalid();
    return $value;
}

/** Address/contact are independent snapshots. Carrier/price fields are excluded. */
function ya_online_order_delivery(mixed $input): array
{
    if (!is_array($input) || array_is_list($input)) ya_online_order_invalid();
    if (($input['method'] ?? '') === 'pickup') return ['method' => 'pickup', 'address' => null];
    if (($input['method'] ?? '') !== 'shipping' || !is_array($input['address'] ?? null) || array_is_list($input['address'])) ya_online_order_invalid();
    $raw = $input['address'];
    $address = [];
    foreach (['recipientName' => 160, 'addressLine1' => 300, 'district' => 120, 'city' => 120, 'countryCode' => 2] as $key => $limit) {
        $value = ya_online_order_text($raw[$key] ?? null, $limit);
        if ($value === '') ya_online_order_invalid();
        $address[$key] = $value;
    }
    $address['countryCode'] = strtoupper($address['countryCode']);
    if (preg_match('/^[A-Z]{2}$/D', $address['countryCode']) !== 1) ya_online_order_invalid();
    foreach (['addressLine2' => 300, 'postalCode' => 32, 'note' => 500] as $key => $limit) {
        $value = ya_online_order_text($raw[$key] ?? '', $limit, $key === 'note');
        if ($value !== '') $address[$key] = $value;
    }
    return ['method' => 'shipping', 'address' => $address];
}

/** Semantic allowlist. Extra client fields, including prices, have no authority. */
function ya_online_order_items(mixed $items): array
{
    if (!is_array($items) || !array_is_list($items) || count($items) < 1 || count($items) > 50) ya_online_order_invalid();
    $normalized = [];
    $totalQuantity = 0;
    foreach ($items as $item) {
        if (!is_array($item)) ya_online_order_invalid();
        $productId = ya_online_order_text($item['productId'] ?? null, 180);
        $quantity = $item['quantity'] ?? null;
        if ($productId === '' || (!is_int($quantity) && !is_float($quantity))
            || !is_finite((float)$quantity) || $quantity <= 0 || $quantity > 1000
            || abs($quantity - round($quantity, 4)) > 0.00000001 || isset($normalized[$productId])) ya_online_order_invalid();
        $quantity = round($quantity, 4);
        $totalQuantity += $quantity;
        if ($totalQuantity > 10000) ya_online_order_invalid();
        $normalized[$productId] = ['productId' => $productId, 'quantity' => $quantity];
    }
    ksort($normalized, SORT_STRING); // Row order is not part of request identity.
    return array_values($normalized);
}

function ya_online_order_normalize(array $input): array
{
    $items = ya_online_order_items($input['items'] ?? null);
    $buyer = $input['buyer'] ?? null;
    if (!is_array($buyer)) ya_online_order_invalid();
    $name = ya_online_order_text($buyer['name'] ?? null, 160);
    $phone = ya_online_order_text($buyer['phone'] ?? null, 40);
    $digits = preg_replace('/\D/', '', $phone);
    if ($name === '' || preg_match('/^\+?[0-9 ().\/-]+$/', $phone) !== 1
        || strlen($digits) < 7 || strlen($digits) > 15) ya_online_order_invalid();
    $email = ya_online_order_text($buyer['email'] ?? '', 254);
    if ($email !== '' && preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/u', $email) !== 1) ya_online_order_invalid();
    return [
        'delivery' => ya_online_order_delivery($input['delivery'] ?? null),
        'items' => $items,
        'buyer' => ['name' => $name, 'phone' => $phone, ...($email !== '' ? ['email' => $email] : [])],
        'note' => ya_online_order_text($input['note'] ?? '', 2000, true)
    ];
}

/** Catalog gate + queue + receipt share one transaction; Desktop remains business authority. */
function ya_online_order_submit(array $input): array
{
    $key = $input['idempotencyKey'] ?? null;
    if (!is_string($key) || preg_match('/^[A-Za-z0-9_-]{16,128}$/D', $key) !== 1) {
        throw new YaOnlineOrderRejection(422, 'invalid_idempotency_key', 'Tekrar deneme kimliği gerekli veya geçersiz.');
    }
    $request = ya_online_order_normalize($input);
    $keyHash = hash('sha256', $key);
    $database = ya_storage_open();
    $database->exec('BEGIN IMMEDIATE');
    try {
        $requestHash = ya_storage_web_order_submission_fingerprint($request);
        $receipt = ya_storage_get_web_order_submission_receipt($keyHash);
        if ($receipt !== null && !hash_equals($receipt['request_hash'], $requestHash)) {
            throw new YaOnlineOrderRejection(409, 'idempotency_conflict', 'Tekrar deneme kimliği farklı bir sipariş için kullanılmış.');
        }
        if ($receipt !== null) {
            // Replay a prior acceptance even if publication changed; no new submission.
            $database->exec('COMMIT');
            return $receipt['response'];
        }
        $catalog = ya_online_catalog_projection(ya_storage_get_publication('online_catalog', []));
        if (!$catalog['enabled']) {
            throw new YaOnlineOrderRejection(403, 'online_sales_disabled', 'Web siparişleri şu anda kapalı.');
        }
        if ($catalog['delivery_methods'] === []) {
            throw new YaOnlineOrderRejection(403, 'online_ordering_disabled', 'Web siparişleri şu anda kapalı.');
        }
        if (!in_array($request['delivery']['method'], $catalog['delivery_methods'], true)) {
            throw new YaOnlineOrderRejection(422, 'delivery_method_unavailable', 'Seçilen teslimat yöntemi artık sunulmuyor.');
        }
        $publishedIds = array_fill_keys(array_column($catalog['products'], 'product_id'), true);
        foreach ($request['items'] as $item) {
            if (!isset($publishedIds[$item['productId']])) {
                throw new YaOnlineOrderRejection(422, 'product_not_published', 'Siparişteki ürünlerden biri web satışında yayınlanmıyor.');
            }
        }
        $now = date(DATE_ATOM);
        $id = 'web_order_' . bin2hex(random_bytes(16));
        ya_storage_enqueue_web_order(['id' => $id, ...$request, 'createdAt' => $now]);
        $response = ['ok' => true, 'order_id' => $id, 'accepted_at' => $now, 'message' => 'Sipariş talebiniz alındı.'];
        ya_storage_insert_web_order_submission_receipt($keyHash, $requestHash, $response);
        $database->exec('COMMIT');
        return $response;
    } catch (Throwable $error) {
        $database->exec('ROLLBACK');
        throw $error;
    }
}
