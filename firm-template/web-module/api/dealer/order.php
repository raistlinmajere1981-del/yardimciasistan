<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/dealer-order.php';
require_once __DIR__ . '/../../lib/public-request-guard.php';
ya_dealer_require_post();
try {
    $token = $_COOKIE['ya_account_session'] ?? '';
    if (!is_string($token) || !ya_dealer_session_access($token)) ya_dealer_response(401, ['ok' => false, 'message' => 'Bayi erişimi gerekli.']);
    ya_public_guard_enforce('dealer_order');
    $raw = file_get_contents('php://input', false, null, 0, YA_PUBLIC_ORDER_MAX_BODY_BYTES + 1);
    if (!is_string($raw) || strlen($raw) > YA_PUBLIC_ORDER_MAX_BODY_BYTES) ya_dealer_response(413, ['ok' => false, 'message' => 'Sipariş verisi çok büyük.']);
    $input = json_decode($raw, true);
    if (!is_array($input) || array_is_list($input)) ya_dealer_response(400, ['ok' => false, 'message' => 'Sipariş bilgileri okunamadı.']);
    ya_dealer_response(201, ya_dealer_order_submit($token, $input));
} catch (YaOnlineOrderRejection $error) {
    ya_dealer_response($error->status, ['ok' => false, 'code' => $error->responseCode, 'message' => $error->responseCode === 'invalid_order' ? 'Lütfen ürünleri ve teslimat bilgilerini kontrol edin.' : $error->getMessage()]);
} catch (YaAccountError $error) {
    if (($reading ?? false) && isset($db)) $db->exec('ROLLBACK');
    ya_account_response($error->status, ['ok' => false, 'code' => $error->reason]);
} catch (Throwable) {
    ya_dealer_response(503, ['ok' => false, 'message' => 'Sipariş kaydedilemedi. Lütfen aynı kimlikle tekrar deneyin.']);
}
