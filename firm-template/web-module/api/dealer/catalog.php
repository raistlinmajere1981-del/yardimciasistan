<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/dealer-order.php';
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET'); ya_dealer_response(405, ['ok' => false]);
}
try {
    $token = $_COOKIE['ya_account_session'] ?? '';
    $db = ya_storage_open(); $db->exec('BEGIN'); $reading = true;
    $catalog = ya_dealer_catalog(is_string($token) ? $token : '');
    $db->exec('COMMIT'); $reading = false;
    if (!$catalog) ya_dealer_response(503, ['ok' => false, 'message' => 'Bayi kataloğu henüz hazır değil.']);
    ya_dealer_response(200, ['ok' => true, 'catalog' => $catalog]);
} catch (YaOnlineOrderRejection $error) {
    if (($reading ?? false) && isset($db)) $db->exec('ROLLBACK');
    ya_dealer_response($error->status, ['ok' => false, 'message' => $error->getMessage()]);
} catch (YaAccountError $error) {
    if (($reading ?? false) && isset($db)) $db->exec('ROLLBACK');
    ya_account_response($error->status, ['ok' => false, 'code' => $error->reason]);
} catch (Throwable) {
    if (($reading ?? false) && isset($db)) $db->exec('ROLLBACK');
    ya_dealer_response(503, ['ok' => false, 'message' => 'Bayi kataloğu alınamadı.']);
}
