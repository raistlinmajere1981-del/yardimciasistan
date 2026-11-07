<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/public-request-guard.php';
require_once __DIR__ . '/../lib/online-order.php';
require_once __DIR__ . '/../lib/customer-account.php';
header('Cache-Control: no-store');
header('Content-Type: application/json; charset=utf-8');
ya_public_guard_enforce('checkout_quote');
try {
    $raw = file_get_contents('php://input', false, null, 0, YA_PUBLIC_ORDER_MAX_BODY_BYTES + 1);
    if (!is_string($raw) || strlen($raw) > YA_PUBLIC_ORDER_MAX_BODY_BYTES) throw new YaOnlineOrderRejection(413, 'body_too_large', 'Sepet çok büyük.');
    $input = json_decode($raw, true);
    if (!is_array($input) || array_is_list($input)) throw new YaOnlineOrderRejection(400, 'invalid_json', 'Sepet okunamadı.');
    // A dealer session never changes public checkout prices or binds its customer.
    if (ya_account_token() !== '' || ya_account_token('ya_account_refresh') !== '') ya_account_require_session();
    $db = ya_storage_open();
    $db->exec('BEGIN');
    try {
        $catalog=ya_online_catalog_projection(ya_storage_get_publication('online_catalog', []));
        if(defined('YA_DEALER_CHECKOUT') && YA_DEALER_CHECKOUT) {
            require_once __DIR__ . '/../lib/dealer-order.php';
            ya_account_require_post();
            $private=ya_dealer_catalog(ya_account_token());
            if(!$private)throw new YaOnlineOrderRejection(503,'catalog_unavailable','Bayi kataloğu henüz hazır değil.');
            $catalog=[...$catalog,'enabled'=>true,'products'=>$private['products'],'delivery_methods'=>$private['delivery_methods']];
        }
        $quote = ya_commerce_checkout_quote(ya_online_order_items($input['items'] ?? null),ya_online_order_delivery($input['delivery'] ?? null),$catalog);
        $db->exec('COMMIT');
    } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
    echo json_encode(['ok' => true, 'quote' => $quote], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (YaOnlineOrderRejection $error) {
    http_response_code($error->status); echo json_encode(['ok' => false, 'code' => $error->responseCode, 'message' => $error->getMessage()]);
} catch (YaAccountError $error) {
    http_response_code($error->status); echo json_encode(['ok' => false, 'code' => $error->reason]);
} catch (Throwable) {
    http_response_code(503); echo json_encode(['ok' => false, 'code' => 'quote_unavailable']);
}
