<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/dealer-order.php';
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET'); ya_dealer_response(405, ['ok' => false]);
}
try {
    $token = $_COOKIE['ya_dealer_session'] ?? '';
    $db = ya_storage_open(); $db->exec('BEGIN'); $reading = true;
    $history = ya_dealer_orders(is_string($token) ? $token : '');
    $db->exec('COMMIT'); $reading = false;
    ya_dealer_response(200, ['ok' => true, ...$history]);
} catch (YaOnlineOrderRejection $error) {
    if ($reading ?? false) $db->exec('ROLLBACK');
    ya_dealer_response($error->status, ['ok' => false, 'message' => $error->getMessage()]);
} catch (Throwable) {
    if ($reading ?? false) $db->exec('ROLLBACK');
    ya_dealer_response(503, ['ok' => false, 'message' => 'Siparişler alınamadı.']);
}
