<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/public-request-guard.php';
require_once __DIR__ . '/../lib/online-order.php';

header('Cache-Control: no-store');
ya_public_guard_enforce('order');
// Bound actual bytes too: Content-Length may be absent or inaccurate.
$raw = file_get_contents('php://input', false, null, 0, YA_PUBLIC_ORDER_MAX_BODY_BYTES + 1);
if (!is_string($raw) || strlen($raw) > YA_PUBLIC_ORDER_MAX_BODY_BYTES) {
    ya_public_guard_reject(413, 'Gönderilen sipariş verisi çok büyük.', 0);
}
$input = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($input) || array_is_list($input)) {
    ya_order_response(400, ['ok' => false, 'code' => 'invalid_json', 'message' => 'Sipariş bilgileri okunamadı.']);
}
try {
    ya_order_response(201, ya_online_order_submit($input));
} catch (YaOnlineOrderRejection $error) {
    ya_order_response($error->status, ['ok' => false, 'code' => $error->responseCode, 'message' => $error->getMessage()]);
} catch (Throwable) {
    // No payload, contact, key or exception content is exposed or logged.
    ya_order_response(503, ['ok' => false, 'code' => 'order_unavailable', 'message' => 'Sipariş kaydedilemedi. Lütfen aynı kimlikle tekrar deneyin.']);
}

function ya_order_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
