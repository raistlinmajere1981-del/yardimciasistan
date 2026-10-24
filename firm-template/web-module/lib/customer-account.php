<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/customer-account-store.php';
require_once __DIR__ . '/customer-account-mail.php';

final class YaAccountError extends RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $reason) { parent::__construct($reason); }
}
function ya_account_enabled(): bool
{
    $publication = ya_storage_get_publication('dealer_access_private', []);
    return ($publication['version'] ?? null) === 3 && ($publication['online_sales_enabled'] ?? false) === true;
}
function ya_account_require_enabled(): void
{
    if (!ya_account_enabled()) throw new YaAccountError(403, 'online_sales_disabled');
}
function ya_account_site_url(): string
{
    $site = (string)getenv('YA_ACCOUNT_SITE_URL'); $parts = parse_url($site);
    $local = PHP_SAPI === 'cli-server' && in_array($parts['host'] ?? '', ['localhost', '127.0.0.1', '::1'], true);
    if (!$parts || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
        || (($parts['scheme'] ?? '') !== 'https' && !($local && ($parts['scheme'] ?? '') === 'http'))) throw new YaAccountError(503, 'account_unconfigured');
    return rtrim($site, '/') . '/';
}
function ya_account_origin(): string
{
    $parts = parse_url(ya_account_site_url());
    return $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
}
function ya_account_cookie_options(int $expires): array
{
    $local = PHP_SAPI === 'cli-server' && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
    $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/api/account/index.php');
    $root = explode('/api/', $script, 2)[0] . '/';
    return ['expires' => $expires, 'path' => $root, 'secure' => !$local, 'httponly' => true, 'samesite' => 'Lax'];
}
function ya_account_token(string $cookie = 'ya_account_session'): string
{
    $value = $_COOKIE[$cookie] ?? '';
    return is_string($value) && preg_match('/^[A-Za-z0-9_-]{43}$/D', $value) === 1 ? $value : '';
}
function ya_account_require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new YaAccountError(405, 'post_required');
    if (($_SERVER['HTTP_X_YA_ACCOUNT'] ?? $_SERVER['HTTP_X_YA_DEALER'] ?? '') !== '1'
        || strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json'
        || in_array($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '', ['cross-site', 'same-site'], true)) throw new YaAccountError(403, 'csrf_failed');
    if (isset($_SERVER['HTTP_ORIGIN']) && !hash_equals(ya_account_origin(), $_SERVER['HTTP_ORIGIN'])) throw new YaAccountError(403, 'csrf_failed');
}
function ya_account_input(): array
{
    $raw = file_get_contents('php://input', false, null, 0, 16385);
    $input = is_string($raw) && strlen($raw) <= 16384 ? json_decode($raw, true) : null;
    if (!is_array($input) || array_is_list($input) && $input !== []) throw new YaAccountError(400, 'invalid_input');
    return $input;
}
function ya_account_email(mixed $value): string
{
    if (!is_string($value) || strlen($value) > 254 || !filter_var($value, FILTER_VALIDATE_EMAIL)) throw new YaAccountError(422, 'invalid_email');
    return strtolower(trim($value));
}
function ya_account_name(mixed $value): string
{
    if (!is_string($value) || mb_strlen(trim($value)) < 2 || mb_strlen($value) > 160 || preg_match('/[\x00-\x1f\x7f]/', $value)) throw new YaAccountError(422, 'invalid_name');
    return trim($value);
}
function ya_account_password(mixed $value): string
{
    if (!is_string($value) || strlen($value) < 12 || strlen($value) > 72 || str_contains($value, "\0")) throw new YaAccountError(422, 'invalid_password');
    return $value;
}
function ya_account_rate(string $operation, string $identity = ''): void
{
    $db = ya_storage_open(); $now = time();
    foreach (['ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 'identity:' . $identity] as $scope) {
        if ($scope === 'identity:') continue;
        $bucket = ya_account_hash($operation . ':' . $scope);
        $db->prepare('INSERT INTO customer_account_attempts VALUES (?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET
            attempts = CASE WHEN started_at < ? THEN 1 ELSE attempts + 1 END,
            started_at = CASE WHEN started_at < ? THEN excluded.started_at ELSE started_at END')->execute([$bucket, $now, $now - 900, $now - 900]);
        $find = $db->prepare('SELECT attempts FROM customer_account_attempts WHERE bucket = ?'); $find->execute([$bucket]);
        if ((int)$find->fetchColumn() > (str_starts_with($scope, 'ip:') ? 40 : 10)) throw new YaAccountError(429, 'try_later');
    }
    $db->prepare('DELETE FROM customer_account_attempts WHERE started_at < ?')->execute([$now - 86400]);
}
function ya_account_session(string $token): ?array
{
    ya_account_require_enabled();
    if ($token === '') return null;
    $query = ya_storage_open()->prepare('SELECT a.*, s.created_at AS authenticated_at, s.session_hash, s.client FROM customer_account_sessions s
        JOIN customer_accounts a ON a.id = s.account_id WHERE s.session_hash = ? AND s.expires_at > ? AND s.revoked_at = 0
        AND s.session_version = a.session_version AND a.email_verified = 1');
    $query->execute([ya_account_hash($token), time()]); $account = $query->fetch();
    return $account ?: null;
}
function ya_account_require_session(bool $recent = false): array
{
    $account = ya_account_session(ya_account_token());
    if (!$account) throw new YaAccountError(401, 'login_required');
    if ($recent && (int)$account['authenticated_at'] < time() - 600) throw new YaAccountError(401, 'reauthentication_required');
    return $account;
}
function ya_account_order_owner(): array
{
    $account = ya_account_require_session();
    $find = ya_storage_open()->prepare("SELECT 1 FROM dealer_access WHERE account_id = ?"); $find->execute([$account['id']]);
    if (!$find->fetchColumn()) throw new YaAccountError(409, 'customer_link_pending');
    return $account;
}
function ya_account_issue_session(PDO $db, string $id, string $client = 'web', ?int $authenticatedAt = null): void
{
    $find = $db->prepare('SELECT session_version, email_verified FROM customer_accounts WHERE id = ?'); $find->execute([$id]); $account = $find->fetch();
    if (!$account || !(bool)$account['email_verified']) throw new YaAccountError(403, 'email_verification_required');
    $token = ya_account_random(); $refresh = ya_account_random(); $now = time();
    $db->prepare('INSERT INTO customer_account_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)')->execute([
        ya_account_hash($token), ya_account_hash($refresh), $id, $account['session_version'], $client, $authenticatedAt ?? $now, $now + 1800, $now + 2592000]);
    setcookie('ya_account_session', $token, ya_account_cookie_options($now + 1800));
    setcookie('ya_account_refresh', $refresh, ya_account_cookie_options($now + 2592000));
}
function ya_account_logout(bool $all = false): void
{
    $db = ya_storage_open();
    if ($all) {
        // Revocation-only authorization remains available while Online Sales is disabled.
        $find = $db->prepare('SELECT a.id FROM customer_accounts a JOIN customer_account_sessions s ON s.account_id = a.id WHERE s.revoked_at = 0 AND s.session_version = a.session_version AND ((s.session_hash = ? AND s.expires_at > ?) OR (s.refresh_hash = ? AND s.refresh_expires_at > ?))');
        $find->execute([ya_account_hash(ya_account_token()), time(), ya_account_hash(ya_account_token('ya_account_refresh')), time()]);
        $account = $find->fetch();
        if (!$account) throw new YaAccountError(401, 'login_required');
        $db->prepare('UPDATE customer_accounts SET session_version = session_version + 1 WHERE id = ?')->execute([$account['id']]);
    }
    $db->prepare('UPDATE customer_account_sessions SET revoked_at = ? WHERE session_hash = ? OR refresh_hash = ?')
        ->execute([time(), ya_account_hash(ya_account_token()), ya_account_hash(ya_account_token('ya_account_refresh'))]);
    foreach (['ya_account_session', 'ya_account_refresh'] as $name) setcookie($name, '', ya_account_cookie_options(time() - 3600));
}
function ya_account_refresh(): void
{
    ya_account_require_enabled();
    $db = ya_storage_open(); $db->exec('BEGIN IMMEDIATE');
    try {
        $find = $db->prepare('SELECT s.* FROM customer_account_sessions s JOIN customer_accounts a ON a.id = s.account_id
            WHERE refresh_hash = ? AND refresh_expires_at > ? AND revoked_at = 0 AND s.session_version = a.session_version AND a.email_verified = 1');
        $find->execute([ya_account_hash(ya_account_token('ya_account_refresh')), time()]); $session = $find->fetch();
        if (!$session) throw new YaAccountError(401, 'login_required');
        $db->prepare('UPDATE customer_account_sessions SET revoked_at = ? WHERE session_hash = ?')->execute([time(), $session['session_hash']]);
        ya_account_issue_session($db, $session['account_id'], $session['client'], (int)$session['created_at']);
        $db->exec('COMMIT');
    } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
}
function ya_account_send_token(array $account, string $purpose): void
{
    if (!ya_account_mail_configured()) throw new YaAccountError(503, 'mail_unconfigured');
    $db = ya_storage_open(); $token = ya_account_random();
    $db->prepare('DELETE FROM customer_account_tokens WHERE account_id = ? AND purpose = ?')->execute([$account['id'], $purpose]);
    $db->prepare('INSERT INTO customer_account_tokens VALUES (?, ?, ?, ?, 0)')->execute([ya_account_hash($token), $account['id'], $purpose, time() + 1800]);
    try { ya_account_mail($account['email'], $purpose, $token); }
    catch (Throwable $error) { $db->prepare('DELETE FROM customer_account_tokens WHERE token_hash = ?')->execute([ya_account_hash($token)]); throw $error; }
}
function ya_account_register(array $input): void
{
    ya_account_require_enabled();
    $email = ya_account_email($input['email'] ?? null); $password = ya_account_password($input['password'] ?? null); $name = ya_account_name($input['fullName'] ?? null);
    ya_account_rate('register', $email);
    if (!ya_account_mail_configured()) throw new YaAccountError(503, 'mail_unconfigured');
    $db = ya_storage_open(); $hash = password_hash($password, PASSWORD_ARGON2ID);
    $db->prepare('INSERT OR IGNORE INTO customer_accounts(id, email, full_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([ya_account_uuid(), $email, $name, $hash, time()]);
    $find = $db->prepare('SELECT * FROM customer_accounts WHERE email = ?'); $find->execute([$email]); $account = $find->fetch();
    // Never replace an existing pending password/profile: resubmission cannot take ownership.
    if (!(bool)$account['email_verified']) ya_account_send_token($account, 'verify');
}
function ya_account_login(array $input): void
{
    ya_account_require_enabled(); $email = ya_account_email($input['email'] ?? null); ya_account_rate('login', $email);
    $password = $input['password'] ?? ''; if (!is_string($password) || strlen($password) > 72) throw new YaAccountError(401, 'invalid_credentials');
    $db = ya_storage_open(); $find = $db->prepare('SELECT * FROM customer_accounts WHERE email = ?'); $find->execute([$email]); $account = $find->fetch();
    $dummy = '$argon2id$v=19$m=65536,t=4,p=1$U2U0UUYwejk2RTlqTjd4cA$vfzcmlpu5Zec+AHdv14TQdKB8VI+rzQ3hY7Rz4LDyBU';
    $valid = password_verify($password, ($account['password_hash'] ?? '') !== '' ? $account['password_hash'] : $dummy);
    if (!$valid || !$account || $account['password_hash'] === '') throw new YaAccountError(401, 'invalid_credentials');
    if (!(bool)$account['email_verified']) throw new YaAccountError(403, 'email_verification_required');
    if (password_needs_rehash($account['password_hash'], PASSWORD_ARGON2ID)) $db->prepare('UPDATE customer_accounts SET password_hash = ? WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_ARGON2ID), $account['id']]);
    ya_account_issue_session($db, $account['id'], ($_SERVER['HTTP_X_YA_CLIENT'] ?? '') === 'android' ? 'android' : 'web');
}
function ya_account_recovery(array $input): void
{
    $email = ya_account_email($input['email'] ?? null); ya_account_rate('recover', $email);
    if (!ya_account_mail_configured()) throw new YaAccountError(503, 'mail_unconfigured');
    $query = ya_storage_open()->prepare('SELECT * FROM customer_accounts WHERE email = ?'); $query->execute([$email]); $account = $query->fetch();
    if ($account) ya_account_send_token($account, (bool)$account['email_verified'] ? 'reset' : 'verify');
}
function ya_account_consume_token(array $input, string $purpose): void
{
    $token = $input['token'] ?? ''; if (!is_string($token) || strlen($token) !== 43) throw new YaAccountError(400, 'invalid_token');
    ya_account_rate('token');
    $password = password_hash(ya_account_password($input['password'] ?? null), PASSWORD_ARGON2ID);
    $db = ya_storage_open(); $db->exec('BEGIN IMMEDIATE');
    try {
        $query = $db->prepare('SELECT * FROM customer_account_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > ? AND consumed_at = 0');
        $query->execute([ya_account_hash($token), $purpose, time()]); $row = $query->fetch();
        if (!$row) throw new YaAccountError(400, 'invalid_token');
        $db->prepare('UPDATE customer_account_tokens SET consumed_at = ? WHERE token_hash = ?')->execute([time(), $row['token_hash']]);
        if ($purpose === 'verify') {
            // Activation never logs in automatically. The registered password may have been submitted by someone else.
            // A provider identity attached before mailbox proof must not survive on someone else's email account.
            $db->prepare('DELETE FROM customer_account_identities WHERE account_id = ? AND EXISTS (SELECT 1 FROM customer_accounts a WHERE a.id = account_id AND a.email_verified = 0)')->execute([$row['account_id']]);
            $db->prepare('UPDATE customer_accounts SET email_verified = 1, password_hash = ?, session_version = session_version + 1 WHERE id = ?')->execute([$password, $row['account_id']]);
            ya_account_enqueue($db, $row['account_id']);
        } else {
            $db->prepare('UPDATE customer_accounts SET password_hash = ?, session_version = session_version + 1 WHERE id = ?')->execute([$password, $row['account_id']]);
        }
        $db->exec('COMMIT');
    } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
}
function ya_account_profile(array $account): array
{
    $db = ya_storage_open();
    $methods = $db->prepare('SELECT provider FROM customer_account_identities WHERE account_id = ? ORDER BY provider'); $methods->execute([$account['id']]);
    $dealer = $db->prepare('SELECT access_id, display_name FROM dealer_access WHERE account_id = ? AND enabled = 1'); $dealer->execute([$account['id']]); $access = $dealer->fetch();
    return ['id' => $account['id'], 'email' => $account['email'], 'fullName' => $account['full_name'],
        'methods' => [...($account['password_hash'] !== '' ? ['password'] : []), ...$methods->fetchAll(PDO::FETCH_COLUMN)],
        'dealer' => $access ?: null];
}
function ya_account_response(int $status, array $payload): never
{
    http_response_code($status); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff'); header('Referrer-Policy: no-referrer');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit;
}
