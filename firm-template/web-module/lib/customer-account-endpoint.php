<?php
declare(strict_types=1);
require_once __DIR__ . '/customer-account-oauth.php';

try {
    if (YA_ACCOUNT_ACTION === 'browser') {
        $ticket = $_GET['ticket'] ?? '';
        $redirect = ya_account_browser_start(is_string($ticket) ? $ticket : '');
        header('Cache-Control: no-store'); header('Referrer-Policy: no-referrer'); header('Location: ' . $redirect, true, 303); exit;
    }
    if (YA_ACCOUNT_ACTION === 'callback') {
        $redirect = ya_account_oauth_callback($_GET);
        header('Cache-Control: no-store'); header('Referrer-Policy: no-referrer'); header('Location: ' . $redirect, true, 303); exit;
    }
    if (YA_ACCOUNT_ACTION === 'config') {
        $enabled = ya_account_enabled();
        ya_account_response(200, ['ok' => true, 'enabled' => $enabled, 'passwordRegistration' => $enabled && ya_account_mail_configured(),
            'site_url' => $enabled && getenv('YA_ACCOUNT_SITE_URL') ? ya_account_site_url() : '',
            'providers' => $enabled ? array_values(array_filter(['google', 'facebook'], static fn(string $p): bool => ya_account_provider($p) !== null)) : []]);
    }
    if (YA_ACCOUNT_ACTION === 'orders') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') throw new YaAccountError(405, 'get_required');
        $account = ya_account_require_session();
        require_once __DIR__ . '/dealer-order.php';
        $find = ya_storage_open()->prepare('SELECT access_id, account_id FROM dealer_access WHERE account_id = ?'); $find->execute([$account['id']]);
        $access = $find->fetch() ?: ['access_id' => '', 'account_id' => $account['id']];
        ya_account_response(200, ['ok' => true, ...ya_customer_order_history($access)]);
    }
    if (YA_ACCOUNT_ACTION === 'session') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') throw new YaAccountError(405, 'get_required');
        ya_account_response(200, ['ok' => true, 'account' => ya_account_profile(ya_account_require_session())]);
    }
    ya_account_require_post();
    // Local/global logout remains possible after the capability is withdrawn.
    if (YA_ACCOUNT_ACTION === 'logout-all') { ya_account_logout(true); ya_account_response(200, ['ok' => true]); }
    if (YA_ACCOUNT_ACTION === 'logout') { ya_account_logout(); ya_account_response(200, ['ok' => true]); }
    ya_account_require_enabled(); $input = ya_account_input();
    switch (YA_ACCOUNT_ACTION) {
        case 'register': ya_account_register($input); break;
        case 'login': ya_account_login($input); break;
        case 'refresh': ya_account_refresh(); break;
        case 'recover': ya_account_recovery($input); break;
        case 'verify': ya_account_consume_token($input, 'verify'); break;
        case 'reset': ya_account_consume_token($input, 'reset'); break;
        case 'profile':
            $account = ya_account_require_session(); $name = ya_account_name($input['fullName'] ?? null);
            ya_storage_open()->prepare('UPDATE customer_accounts SET full_name = ? WHERE id = ?')->execute([$name, $account['id']]); break;
        case 'oauth': ya_account_response(200, ['ok' => true, 'url' => ya_account_oauth_start($input)]);
        case 'exchange': ya_account_native_exchange($input); break;
        default: throw new YaAccountError(404, 'not_found');
    }
    ya_account_response(200, ['ok' => true]);
} catch (YaAccountError $error) {
    if (in_array(YA_ACCOUNT_ACTION, ['callback', 'browser'], true) && $error->reason !== 'online_sales_disabled') {
        try {
            header('Cache-Control: no-store'); header('Referrer-Policy: no-referrer');
            header('Location: ' . ya_account_site_url() . '?account_error=' . rawurlencode($error->reason), true, 303); exit;
        } catch (Throwable) { /* Missing configuration has no trusted redirect target. */ }
    }
    ya_account_response($error->status, ['ok' => false, 'code' => $error->reason]);
} catch (Throwable) {
    // Never log provider response, credential, token or submitted customer data.
    ya_account_response(503, ['ok' => false, 'code' => 'account_unavailable']);
}
