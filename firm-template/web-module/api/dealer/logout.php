<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/dealer-access.php';
ya_dealer_require_post();
try {
    $token = $_COOKIE['ya_dealer_session'] ?? '';
    if (is_string($token)) ya_dealer_logout($token);
    setcookie('ya_dealer_session', '', ya_dealer_cookie_options(true));
    ya_dealer_response(200, ['ok' => true]);
} catch (Throwable) { ya_dealer_response(503, ['ok' => false]); }
