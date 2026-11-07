<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/storage.php';
require_once __DIR__ . '/../lib/public-request-guard.php';
require_once __DIR__ . '/../lib/public-request-policy.php';
require_once __DIR__ . '/../lib/public-request-submission.php';

/** Public guest ingress; all authoritative product and table data comes from desktop publications. */
function ya_table_order_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST'], true)) {
    ya_table_order_response(405, ['ok'=>false, 'message'=>'Yöntem desteklenmiyor.']);
}
if ($method === 'POST') ya_public_guard_enforce('table_order');

try {
    $menu = ya_storage_get_publication('menu', []);
    $tableCatalog = ya_storage_get_publication('table_catalog', []);
    $caps = ya_public_runtime_capabilities();
} catch (Throwable) {
    ya_table_order_response(503, ['ok'=>false, 'message'=>'Sipariş servisi geçici olarak kullanılamıyor.']);
}
$allowed = ($menu['enabled'] ?? false) === true
    && ($menu['table_orders_enabled'] ?? false) === true
    && ($tableCatalog['orderEnabled'] ?? false) === true
    && ya_public_requests_enabled($caps)
    && in_array('channel.qr_menu', $caps, true)
    && in_array('food_service.tables', $caps, true)
    && in_array('food_service.orders', $caps, true);
if (!$allowed) ya_table_order_response(403, ['ok'=>false, 'message'=>'Masadan sipariş şu anda kapalı.']);

$payload = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || strlen($raw) > 16384) ya_table_order_response(413, ['ok'=>false, 'message'=>'Sipariş çok büyük.']);
    $payload = json_decode($raw, true);
    if (!is_array($payload)) ya_table_order_response(400, ['ok'=>false, 'message'=>'Sipariş verisi geçersiz.']);
}

$token = $method === 'POST' ? ($payload['table_token'] ?? '') : ($_GET['table'] ?? '');
if (!is_string($token) || !preg_match('/^[A-Za-z0-9_-]{24}$/D', $token)) {
    ya_table_order_response(404, ['ok'=>false, 'message'=>'Masa QR kodu geçersiz.']);
}
$tokenHash = hash('sha256', $token);
$table = null;
foreach ($tableCatalog['tables'] ?? [] as $candidate) {
    if (!is_array($candidate) || !is_string($candidate['orderTokenHash'] ?? null)) continue;
    if (hash_equals($candidate['orderTokenHash'], $tokenHash)) { $table = $candidate; break; }
}
if (!is_array($table) || !is_string($table['id'] ?? null) || !is_string($table['name'] ?? null)) {
    ya_table_order_response(404, ['ok'=>false, 'message'=>'Bu masa için sipariş alınamıyor.']);
}
if ($method === 'GET') {
    ya_table_order_response(200, ['ok'=>true, 'table'=>['id'=>$table['id'], 'name'=>$table['name'], 'area'=>(string)($table['area'] ?? '')]]);
}

$rawItems = $payload['items'] ?? null;
if (!is_array($rawItems) || !array_is_list($rawItems) || count($rawItems) < 1 || count($rawItems) > 20) {
    ya_table_order_response(422, ['ok'=>false, 'message'=>'Sepette 1 ile 20 ürün satırı olmalı.']);
}
$available = [];
$activeCategories = [];
foreach ($menu['categories'] ?? [] as $category) {
    if (is_array($category) && ($category['is_active'] ?? false) === true) $activeCategories[(string)($category['id'] ?? '')] = true;
}
foreach ($menu['items'] ?? [] as $item) {
    if (!is_array($item) || ($item['is_available'] ?? false) !== true
        || !isset($activeCategories[(string)($item['category_id'] ?? '')])) continue;
    $available[(string)($item['id'] ?? '')] = $item;
}
$items = []; $count = 0; $orderCurrency = '';
foreach ($rawItems as $row) {
    if (!is_array($row) || !is_string($row['id'] ?? null) || !isset($available[$row['id']])
        || !is_int($row['quantity'] ?? null) || $row['quantity'] < 1 || $row['quantity'] > 20) {
        ya_table_order_response(422, ['ok'=>false, 'message'=>'Sepette geçersiz veya artık satılmayan ürün var.']);
    }
    $product = $available[$row['id']];
    $stock = $product['stock_quantity'] ?? null;
    $consumption = max(0.000001, (float)($product['stock_consumption_quantity'] ?? 1));
    if (($product['hide_when_out_of_stock'] ?? false) === true && is_numeric($stock)
        && (float)$stock < $consumption * $row['quantity']) {
        ya_table_order_response(422, ['ok'=>false, 'message'=>'Seçilen ürünün stoğu yeterli değil.']);
    }
    $note = $row['note'] ?? '';
    if (!is_string($note) || mb_strlen($note) > 300) ya_table_order_response(422, ['ok'=>false, 'message'=>'Ürün notu çok uzun.']);
    $price = $product['price'] ?? null;
    $currency = $product['currency'] ?? '';
    if (!is_numeric($price) || !is_finite((float)$price) || (float)$price < 0
        || !is_string($currency) || !preg_match('/^[A-Z]{3}$/D', $currency)) {
        ya_table_order_response(422, ['ok'=>false, 'message'=>'Ürün fiyatı doğrulanamadı.']);
    }
    if ($orderCurrency !== '' && $orderCurrency !== $currency) {
        ya_table_order_response(422, ['ok'=>false, 'message'=>'Siparişte farklı para birimleri birlikte kullanılamaz.']);
    }
    $orderCurrency = $currency;
    $count += $row['quantity'];
    if ($count > 60) ya_table_order_response(422, ['ok'=>false, 'message'=>'Sipariş adedi sınırı aşıldı.']);
    $items[] = [
        'menu_entry_id'=>$row['id'], 'quantity'=>$row['quantity'], 'note'=>trim($note),
        'name'=>(string)($product['name'] ?? ''), 'unit_price'=>round((float)$price, 2), 'currency'=>$currency
    ];
}
$orderNote = $payload['note'] ?? '';
if (!is_string($orderNote) || mb_strlen($orderNote) > 500) ya_table_order_response(422, ['ok'=>false, 'message'=>'Sipariş notu çok uzun.']);

$now = date(DATE_ATOM);
$request = [
    'id'=>'request_' . bin2hex(random_bytes(12)), 'customer_id'=>'', 'source'=>'web_form',
    'request_type'=>'table_order', 'status'=>'new', 'customer_name'=>$table['name'],
    'customer_phone'=>'', 'date_text'=>'', 'start_date'=>'', 'end_date'=>'', 'time'=>'',
    'guest_count'=>1, 'adult_count'=>0, 'child_count'=>0, 'message'=>trim($orderNote),
    'table_id'=>$table['id'], 'order_items'=>$items, 'accepted_order_id'=>'',
    'ai_summary'=>'', 'ai_suggested_reply'=>'', 'whatsapp_message'=>'', 'assigned_to'=>'',
    'priority'=>'normal', 'sync_status'=>'pending', 'created_at'=>$now, 'updated_at'=>$now
];
try {
    $result = ya_public_request_submit($payload['idempotency_key'] ?? null, $request, [
        'ok'=>true, 'message'=>'Sipariş talebiniz işletmeye iletildi. Henüz onaylanmadı.',
        'request_id'=>$request['id']
    ], '', []);
} catch (YaPublicRequestRejection $error) {
    ya_table_order_response($error->status, ['ok'=>false, 'code'=>$error->responseCode, 'message'=>$error->getMessage()]);
} catch (Throwable) {
    ya_table_order_response(503, ['ok'=>false, 'message'=>'Sipariş kaydedilemedi. Lütfen tekrar deneyin.']);
}
ya_table_order_response(201, $result);
