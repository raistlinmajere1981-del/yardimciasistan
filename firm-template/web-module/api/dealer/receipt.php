<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/dealer-order.php';
ya_dealer_require_post();
try {
    $raw = file_get_contents('php://input', false, null, 0, 1025);
    $input = is_string($raw) && strlen($raw) <= 1024 ? json_decode($raw, true) : null;
    $key = is_array($input) ? ($input['idempotencyKey'] ?? null) : null;
    if (!is_string($key) || preg_match('/^[A-Za-z0-9_-]{16,128}$/D', $key) !== 1) ya_online_order_invalid();
    $token = $_COOKIE['ya_account_session'] ?? '';
    $db = ya_storage_open(); $db->exec('BEGIN'); $reading = true;
    $access = is_string($token) ? ya_dealer_session_access($token) : null;
    if (!$access) throw new YaOnlineOrderRejection(401, 'dealer_access_required', 'Bayi erişimi gerekli.');
    // Recovery read after session renewal. No resubmission, mutation or fingerprint bypass.
    $receipt = ya_storage_get_web_order_submission_receipt(hash('sha256', 'dealer:' . $access['access_id'] . ':' . $key));
    $db->exec('COMMIT'); $reading = false;
    ya_dealer_response(200, ['ok' => true, 'receipt' => $receipt['response'] ?? null]);
} catch (YaOnlineOrderRejection $error) {
    if ($reading ?? false) $db->exec('ROLLBACK');
    ya_dealer_response($error->status, ['ok' => false, 'message' => $error->getMessage()]);
} catch (YaAccountError $error) {
    if (($reading ?? false) && isset($db)) $db->exec('ROLLBACK');
    ya_account_response($error->status, ['ok' => false, 'code' => $error->reason]);
} catch (Throwable) {
    if ($reading ?? false) $db->exec('ROLLBACK');
    ya_dealer_response(503, ['ok' => false, 'message' => 'Gönderim sonucu alınamadı.']);
}
