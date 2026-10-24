<?php
declare(strict_types=1);
require_once __DIR__ . '/customer-account.php';

function ya_account_module_url(): string
{
    $url = rtrim((string)getenv('YA_ACCOUNT_MODULE_URL'), '/') . '/'; $parts = parse_url($url);
    if (!$parts || isset($parts['query']) || isset($parts['fragment']) || isset($parts['user']) || isset($parts['pass'])
        || ($parts['scheme'] . '://' . ($parts['host'] ?? '') . (isset($parts['port']) ? ':' . $parts['port'] : '')) !== ya_account_origin()) throw new YaAccountError(503, 'account_unconfigured');
    return $url;
}
function ya_account_provider(string $provider): ?array
{
    if (!in_array($provider, ['google', 'facebook'], true) || !function_exists('curl_init')) return null;
    $prefix = 'YA_ACCOUNT_' . strtoupper($provider);
    $id = (string)getenv($prefix . '_CLIENT_ID'); $secret = (string)getenv($prefix . '_CLIENT_SECRET');
    if ($id === '' || $secret === '' || !getenv('YA_ACCOUNT_MODULE_URL') || !getenv('YA_ACCOUNT_SITE_URL')) return null;
    $version = (string)getenv('YA_ACCOUNT_FACEBOOK_VERSION');
    if ($provider === 'facebook' && preg_match('/^v[0-9]+\.0$/D', $version) !== 1) return null;
    return ['id' => $id, 'secret' => $secret, 'redirect' => ya_account_module_url() . 'api/account/callback.php',
        'authorize' => $provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://www.facebook.com/' . $version . '/dialog/oauth',
        'token' => $provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://graph.facebook.com/' . $version . '/oauth/access_token',
        'userinfo' => $provider === 'google' ? 'https://openidconnect.googleapis.com/v1/userinfo' : 'https://graph.facebook.com/' . $version . '/me'];
}
function ya_account_oauth_start(array $input, bool $browserBound = false): string
{
    ya_account_require_enabled(); ya_account_rate('oauth');
    $provider = $input['provider'] ?? ''; if (!is_string($provider) || !($config = ya_account_provider($provider))) throw new YaAccountError(503, 'provider_unconfigured');
    $link = ($input['link'] ?? false) === true ? ya_account_require_session(true) : null;
    $challenge = $input['nativeChallenge'] ?? '';
    if (!is_string($challenge) || ($challenge !== '' && !preg_match('/^[A-Za-z0-9_-]{43}$/D', $challenge)) || ($link && $challenge !== '')) throw new YaAccountError(400, 'invalid_input');
    if ($challenge !== '' && !$browserBound) {
        // The system browser must receive the state cookie itself. Native HTTP cookies are independent.
        $ticket = ya_account_random(); $db = ya_storage_open();
        $db->prepare('DELETE FROM customer_account_browser_starts WHERE expires_at < ?')->execute([time()]);
        $db->prepare('INSERT INTO customer_account_browser_starts VALUES (?, ?, ?, ?)')->execute([ya_account_hash($ticket), $provider, $challenge, time() + 120]);
        return ya_account_module_url() . 'api/account/browser.php?ticket=' . rawurlencode($ticket);
    }
    $state = ya_account_random(); $browser = ya_account_random(); $verifier = ya_account_random(); $db = ya_storage_open();
    $db->prepare('DELETE FROM customer_account_oauth WHERE expires_at < ?')->execute([time()]);
    $db->prepare('INSERT INTO customer_account_oauth VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([
        ya_account_hash($state), ya_account_hash($browser), $provider, $verifier, $link['id'] ?? '', $link['session_hash'] ?? '', $challenge, time() + 600]);
    setcookie('ya_account_oauth', $browser, ya_account_cookie_options(time() + 600));
    $params = ['client_id' => $config['id'], 'redirect_uri' => $config['redirect'], 'response_type' => 'code', 'state' => $state,
        'scope' => $provider === 'google' ? 'openid email profile' : 'email,public_profile'];
    // Facebook's confidential web code flow is protected with state + client secret; Google additionally supports S256 PKCE.
    if ($provider === 'google') $params += ['code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='), 'code_challenge_method' => 'S256'];
    return $config['authorize'] . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}
function ya_account_browser_start(string $ticket): string
{
    ya_account_require_enabled();
    if (preg_match('/^[A-Za-z0-9_-]{43}$/D', $ticket) !== 1) throw new YaAccountError(400, 'invalid_token');
    $db = ya_storage_open(); $db->exec('BEGIN IMMEDIATE');
    try {
        $find = $db->prepare('SELECT * FROM customer_account_browser_starts WHERE ticket_hash = ? AND expires_at > ?');
        $find->execute([ya_account_hash($ticket), time()]); $pending = $find->fetch();
        if (!$pending) throw new YaAccountError(400, 'invalid_token');
        $db->prepare('DELETE FROM customer_account_browser_starts WHERE ticket_hash = ?')->execute([ya_account_hash($ticket)]);
        $db->exec('COMMIT');
    } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
    return ya_account_oauth_start(['provider' => $pending['provider'], 'nativeChallenge' => $pending['challenge']], true);
}
/** Bounded, verified TLS requests to fixed official endpoints; provider credentials never enter clients. */
function ya_account_oauth_http(string $url, array $fields, string $bearer = ''): array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Accept: application/json', ...($bearer !== '' ? ['Authorization: Bearer ' . $bearer] : [])]]);
    if ($fields) curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($fields, '', '&', PHP_QUERY_RFC3986)]);
    $result = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); curl_close($curl);
    $json = is_string($result) && strlen($result) <= 131072 ? json_decode($result, true) : null;
    if ($status !== 200 || !is_array($json) || isset($json['error'])) throw new YaAccountError(502, 'provider_failed');
    return $json;
}
/** Input here comes only from authenticated official userinfo responses, never callback/browser fields. */
function ya_account_complete_identity(PDO $db, string $provider, array $profile, string $linkId = ''): string
{
    $subject = $profile[$provider === 'google' ? 'sub' : 'id'] ?? '';
    if (!is_string($subject) || $subject === '' || strlen($subject) > 255) throw new YaAccountError(502, 'provider_failed');
    $find = $db->prepare('SELECT account_id FROM customer_account_identities WHERE provider = ? AND subject = ?'); $find->execute([$provider, $subject]); $existing = $find->fetchColumn();
    if ($existing) {
        if ($linkId !== '' && $linkId !== $existing) throw new YaAccountError(409, 'identity_conflict');
        return $existing;
    }
    if ($linkId !== '') {
        $find = $db->prepare('SELECT subject FROM customer_account_identities WHERE account_id = ? AND provider = ?'); $find->execute([$linkId, $provider]);
        if ($find->fetchColumn()) throw new YaAccountError(409, 'identity_conflict');
        $id = $linkId;
    } else {
        if (!is_string($profile['email'] ?? null) || $profile['email'] === '') throw new YaAccountError(422, 'provider_email_required');
        $email = ya_account_email($profile['email']); $name = ya_account_name($profile['name'] ?? null);
        $find = $db->prepare('SELECT id FROM customer_accounts WHERE email = ?'); $find->execute([$email]);
        // Even a verified email match never merges identities. Authenticate the existing account, then explicitly link.
        if ($find->fetchColumn()) throw new YaAccountError(409, 'account_exists_link_required');
        $id = ya_account_uuid(); $verified = $provider === 'google' && ($profile['email_verified'] ?? false) === true;
        if (!$verified && !ya_account_mail_configured()) throw new YaAccountError(503, 'mail_unconfigured');
        $db->prepare('INSERT INTO customer_accounts(id, email, full_name, email_verified, created_at) VALUES (?, ?, ?, ?, ?)')->execute([$id, $email, $name, (int)$verified, time()]);
        ya_account_enqueue($db, $id);
    }
    $db->prepare('INSERT INTO customer_account_identities VALUES (?, ?, ?)')->execute([$provider, $subject, $id]);
    return $id;
}
function ya_account_handoff(PDO $db, string $accountId, string $challenge): string
{
    $code = ya_account_random();
    $db->prepare('DELETE FROM customer_account_handoffs WHERE expires_at < ?')->execute([time()]);
    $db->prepare('INSERT INTO customer_account_handoffs SELECT ?, id, ?, session_version, ? FROM customer_accounts WHERE id = ?')->execute([ya_account_hash($code), $challenge, time() + 60, $accountId]);
    return 'yardimci-bayi://account?code=' . rawurlencode($code);
}
function ya_account_oauth_callback(array $input, ?callable $request = null): string
{
    ya_account_require_enabled(); $state = $input['state'] ?? ''; $code = $input['code'] ?? '';
    $cancelled = ($input['error'] ?? '') === 'access_denied';
    if (!is_string($state) || strlen($state) !== 43 || !is_string($code) || ($code === '' && !$cancelled) || strlen($code) > 4096) throw new YaAccountError(400, 'invalid_oauth_state');
    $db = ya_storage_open(); $db->exec('BEGIN IMMEDIATE');
    try {
        $find = $db->prepare('SELECT * FROM customer_account_oauth WHERE state_hash = ? AND browser_hash = ? AND expires_at > ?');
        $find->execute([ya_account_hash($state), ya_account_hash(ya_account_token('ya_account_oauth')), time()]); $pending = $find->fetch();
        if (!$pending) throw new YaAccountError(400, 'invalid_oauth_state');
        $db->prepare('DELETE FROM customer_account_oauth WHERE state_hash = ?')->execute([ya_account_hash($state)]);
        $db->exec('COMMIT');
    } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
    if ($cancelled) throw new YaAccountError(400, 'provider_cancelled');
    if ($pending['link_account_id'] !== '') {
        $account = ya_account_require_session(true);
        if ($account['id'] !== $pending['link_account_id'] || $account['session_hash'] !== $pending['link_session_hash']) throw new YaAccountError(401, 'reauthentication_required');
    }
    $config = ya_account_provider($pending['provider']); if (!$config) throw new YaAccountError(503, 'provider_unconfigured');
    $fields = ['client_id' => $config['id'], 'client_secret' => $config['secret'], 'redirect_uri' => $config['redirect'], 'code' => $code, 'grant_type' => 'authorization_code'];
    if ($pending['provider'] === 'google') $fields['code_verifier'] = $pending['verifier'];
    $request ??= 'ya_account_oauth_http';
    $tokens = $request($config['token'], $fields); $access = $tokens['access_token'] ?? '';
    if (!is_string($access) || $access === '' || preg_match('/[\x00-\x20\x7f]/', $access)) throw new YaAccountError(502, 'provider_failed');
    $url = $config['userinfo'];
    if ($pending['provider'] === 'facebook') $url .= '?' . http_build_query(['fields' => 'id,name,email', 'appsecret_proof' => hash_hmac('sha256', $access, $config['secret'])]);
    $profile = $request($url, [], $access);
    $db->exec('BEGIN IMMEDIATE'); $writing = true;
    try {
        $id = ya_account_complete_identity($db, $pending['provider'], $profile, $pending['link_account_id']);
        $find = $db->prepare('SELECT * FROM customer_accounts WHERE id = ?'); $find->execute([$id]); $account = $find->fetch();
        if (!(bool)$account['email_verified']) {
            $db->exec('COMMIT'); $writing = false; ya_account_send_token($account, 'verify');
            return ya_account_site_url() . '?notice=email_verification_required';
        }
        if ($pending['native_challenge'] !== '') $redirect = ya_account_handoff($db, $id, $pending['native_challenge']);
        else { if ($pending['link_account_id'] === '') ya_account_issue_session($db, $id); $redirect = ya_account_site_url(); }
        $db->exec('COMMIT');
        return $redirect;
    } catch (Throwable $error) { if ($writing) $db->exec('ROLLBACK'); throw $error; }
}
function ya_account_native_exchange(array $input): void
{
    ya_account_rate('exchange');
    $code = $input['code'] ?? ''; $verifier = $input['verifier'] ?? '';
    if (!is_string($code) || strlen($code) !== 43 || !is_string($verifier) || !preg_match('/^[A-Za-z0-9_-]{43,128}$/D', $verifier)) throw new YaAccountError(400, 'invalid_token');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
    $db = ya_storage_open(); $db->exec('BEGIN IMMEDIATE');
    try {
        $find = $db->prepare('SELECT h.account_id FROM customer_account_handoffs h JOIN customer_accounts a ON a.id = h.account_id WHERE h.code_hash = ? AND h.challenge = ? AND h.expires_at > ? AND h.session_version = a.session_version');
        $find->execute([ya_account_hash($code), $challenge, time()]); $id = $find->fetchColumn();
        if (!$id) throw new YaAccountError(400, 'invalid_token');
        $db->prepare('DELETE FROM customer_account_handoffs WHERE code_hash = ?')->execute([ya_account_hash($code)]);
        ya_account_issue_session($db, $id, 'android'); $db->exec('COMMIT');
    } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
}
