<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/dealer-access.php';
require_once __DIR__ . '/../../lib/public-request-guard.php';
ya_dealer_require_post();
try {
    ya_public_guard_enforce('dealer_claim');
    $raw = file_get_contents('php://input', false, null, 0, 1025);
    if (!is_string($raw) || strlen($raw) > 1024) ya_dealer_response(400, ['ok' => false, 'message' => YA_DEALER_ERROR]);
    $input = json_decode($raw, true);
    $token = is_array($input) && is_string($input['invite_token'] ?? null) ? $input['invite_token'] : '';
    $session = ya_dealer_claim($token);
    if ($session === null) ya_dealer_response(400, ['ok' => false, 'message' => YA_DEALER_ERROR]);
    setcookie('ya_dealer_session', $session, ya_dealer_cookie_options());
    ya_dealer_response(200, ['ok' => true]);
} catch (Throwable) {
    ya_dealer_event('dealer.session.claim.failed', 'unavailable');
    ya_dealer_response(503, ['ok' => false, 'message' => YA_DEALER_ERROR]);
}
