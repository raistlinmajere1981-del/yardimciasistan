<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/dealer-access.php';
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET'); ya_dealer_response(405, ['authenticated' => false]);
}
try {
    $token = $_COOKIE['ya_dealer_session'] ?? '';
    $dealer = is_string($token) ? ya_dealer_identity($token) : null;
    if ($dealer === null) ya_dealer_response(401, ['authenticated' => false]);
    ya_dealer_response(200, ['authenticated' => true, 'dealer' => $dealer]);
} catch (Throwable) { ya_dealer_response(503, ['authenticated' => false]); }
