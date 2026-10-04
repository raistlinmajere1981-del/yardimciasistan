<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/online-catalog.php';

const YA_DEALER_ERROR = 'Bağlantı geçersiz veya süresi dolmuş.';
const YA_DEALER_SESSION_LIFETIME = 28800;

/** Strict private allowlist. Desktop owns eligibility, web owns consumption/session state. */
function ya_dealer_projection(array $input): array
{
    if (($input['version'] ?? null) !== 1 || !is_bool($input['enabled'] ?? null)
        || !is_array($input['dealers'] ?? null) || count($input['dealers']) > 10000) {
        throw new InvalidArgumentException('dealer_projection_invalid');
    }
    $rows = []; $ids = []; $refs = [];
    foreach ($input['dealers'] as $row) {
        if (!is_array($row)) throw new InvalidArgumentException('dealer_projection_invalid');
        $id = $row['access_id'] ?? null; $ref = $row['customer_ref'] ?? null;
        $revision = $row['access_revision'] ?? null; $hash = $row['invite_hash'] ?? null;
        $expires = $row['invite_expires_at'] ?? null; $name = $row['display_name'] ?? null;
        if (!is_string($id) || preg_match('/^[a-f0-9-]{36}$/D', $id) !== 1 || isset($ids[$id])
            || !is_string($ref) || preg_match('/^[a-f0-9-]{36}$/D', $ref) !== 1 || isset($refs[$ref])
            || !is_int($revision) || $revision < 1 || !is_bool($row['enabled'] ?? null)
            || !is_string($hash) || ($hash !== '' && preg_match('/^[a-f0-9]{64}$/D', $hash) !== 1)
            || !is_int($expires) || $expires < 0 || !is_string($name) || strlen($name) > 640
            || preg_match('/[\x00-\x1f\x7f]/', $name)) throw new InvalidArgumentException('dealer_projection_invalid');
        $ids[$id] = true; $refs[$ref] = true;
        $enabled = $input['enabled'] && $row['enabled'];
        $rows[] = ['access_id' => $id, 'customer_ref' => $ref, 'display_name' => $name,
            'access_revision' => $revision, 'enabled' => $enabled,
            'invite_hash' => $enabled ? $hash : '', 'invite_expires_at' => $enabled ? $expires : 0];
    }
    $catalogs = []; $catalogIds = []; $owners = array_column($rows, null, 'access_id');
    if (!is_array($input['catalogs'] ?? [])) throw new InvalidArgumentException('dealer_catalog_invalid');
    foreach ($input['catalogs'] ?? [] as $catalog) {
        if (!is_array($catalog)) throw new InvalidArgumentException('dealer_catalog_invalid');
        $id = $catalog['access_id'] ?? '';
        if (!is_string($id)) throw new InvalidArgumentException('dealer_catalog_invalid');
        $owner = $owners[$id] ?? null;
        if (!$owner || !$owner['enabled'] || isset($catalogIds[$id])
            || ($catalog['access_revision'] ?? null) !== $owner['access_revision']
            || !is_string($catalog['catalog_revision'] ?? null)
            || preg_match('/^[a-f0-9]{64}$/D', $catalog['catalog_revision']) !== 1) throw new InvalidArgumentException('dealer_catalog_invalid');
        $safe = ya_online_catalog_projection(['enabled' => true, 'delivery_methods' => $catalog['delivery_methods'] ?? null, 'products' => $catalog['products'] ?? null]);
        $catalogIds[$id] = true;
        $catalogs[] = ['access_id' => $id, 'access_revision' => $owner['access_revision'], 'catalog_revision' => $catalog['catalog_revision'],
            'delivery_methods' => $safe['delivery_methods'], 'products' => $safe['products']];
    }
    return ['version' => 1, 'enabled' => $input['enabled'], 'dealers' => $rows, 'catalogs' => $catalogs];
}

/** Called inside the existing versioned publication transaction, only for an accepted new revision. */
function ya_dealer_apply_projection(PDO $db, array $projection): void
{
    $find = $db->prepare('SELECT * FROM dealer_access WHERE access_id = ?');
    foreach ($projection['dealers'] as $row) {
        $find->execute([$row['access_id']]); $current = $find->fetch();
        if ($current && ($row['access_revision'] < (int)$current['access_revision']
            || $row['customer_ref'] !== $current['customer_ref']
            || ($row['access_revision'] === (int)$current['access_revision']
                && $row['enabled'] && ($row['invite_hash'] !== $current['invite_hash'] || !(bool)$current['enabled'])))) {
            throw new YaStorageConflictException('stale_dealer_revision');
        }
    }
    // Missing/disabled rows are tombstones, not authority to resurrect a session.
    $db->exec('UPDATE dealer_access SET enabled = 0');
    $upsert = $db->prepare('INSERT INTO dealer_access
        (access_id, customer_ref, display_name, access_revision, enabled, invite_hash, invite_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(access_id) DO UPDATE SET
        display_name = excluded.display_name, access_revision = excluded.access_revision,
        enabled = excluded.enabled, invite_hash = excluded.invite_hash, invite_expires_at = excluded.invite_expires_at,
        consumed_at = CASE WHEN dealer_access.access_revision <> excluded.access_revision THEN 0 ELSE dealer_access.consumed_at END');
    foreach ($projection['dealers'] as $row) $upsert->execute([$row['access_id'], $row['customer_ref'], $row['display_name'],
        $row['access_revision'], (int)$row['enabled'], $row['invite_hash'], $row['invite_expires_at']]);
    $db->exec('DELETE FROM dealer_catalogs');
    $catalogInsert = $db->prepare('INSERT INTO dealer_catalogs (dealer_access_id, access_revision, catalog_revision, payload_json) VALUES (?, ?, ?, ?)');
    foreach ($projection['catalogs'] as $catalog) $catalogInsert->execute([$catalog['access_id'], $catalog['access_revision'],
        $catalog['catalog_revision'], ya_storage_encode($catalog)]);
    $revoke = $db->prepare('UPDATE dealer_sessions SET revoked_at = ? WHERE revoked_at = 0 AND EXISTS
        (SELECT 1 FROM dealer_access a WHERE a.access_id = dealer_sessions.dealer_access_id
        AND (a.enabled = 0 OR a.access_revision <> dealer_sessions.access_revision))');
    $revoke->execute([time()]);
    $db->prepare('DELETE FROM dealer_sessions WHERE expires_at < ?')->execute([time()]);
}

function ya_dealer_event(string $event, string $category = '', string $accessId = ''): void
{
    // Stable allowlisted event only; never pass input, exceptions, URL, cookies or contacts.
    error_log((string)json_encode(['scope' => 'dealer-access', 'event' => $event,
        'meta' => ['category' => $category, 'access_id' => $accessId]], JSON_UNESCAPED_SLASHES));
}

function ya_dealer_claim(string $token): ?string
{
    $db = ya_storage_open();
    $db->exec('BEGIN IMMEDIATE');
    try {
        $find = $db->prepare('SELECT * FROM dealer_access WHERE invite_hash = ? AND enabled = 1 AND consumed_at = 0 AND invite_expires_at > ?');
        $find->execute([hash('sha256', $token), time()]); $access = $find->fetch();
        if (!$access || preg_match('/^[A-Za-z0-9_-]{43}$/D', $token) !== 1) {
            $db->exec('ROLLBACK');
            ya_dealer_event('dealer.session.claim.failed', 'invalid_or_expired');
            return null;
        }
        $db->prepare('UPDATE dealer_access SET consumed_at = ? WHERE access_id = ?')->execute([time(), $access['access_id']]);
        $session = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        // Replace any existing cookie's session: never adopt a supplied session id.
        $existing = $_COOKIE['ya_dealer_session'] ?? '';
        if (is_string($existing)) $db->prepare('UPDATE dealer_sessions SET revoked_at = ? WHERE session_hash = ?')
            ->execute([time(), hash('sha256', $existing)]);
        $db->prepare('DELETE FROM dealer_sessions WHERE expires_at < ?')->execute([time()]);
        $db->prepare('INSERT INTO dealer_sessions (session_hash, dealer_access_id, access_revision, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([hash('sha256', $session), $access['access_id'], $access['access_revision'], time(), time() + YA_DEALER_SESSION_LIFETIME]);
        $db->exec('COMMIT');
        ya_dealer_event('dealer.session.claim.succeeded', '', $access['access_id']);
        return $session;
    } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
}

function ya_dealer_session_access(string $token): ?array
{
    if (preg_match('/^[A-Za-z0-9_-]{43}$/D', $token) !== 1) return null;
    $find = ya_storage_open()->prepare('SELECT a.access_id, a.display_name, a.access_revision FROM dealer_sessions s JOIN dealer_access a ON a.access_id = s.dealer_access_id
        WHERE s.session_hash = ? AND s.expires_at > ? AND s.revoked_at = 0 AND a.enabled = 1 AND a.access_revision = s.access_revision');
    $find->execute([hash('sha256', $token), time()]); $row = $find->fetch();
    return $row ?: null;
}

function ya_dealer_identity(string $token): ?array
{
    $access = ya_dealer_session_access($token);
    return $access ? ['access_id' => $access['access_id'], 'display_name' => $access['display_name']] : null;
}

function ya_dealer_logout(string $token): void
{
    ya_storage_open()->prepare('UPDATE dealer_sessions SET revoked_at = ? WHERE session_hash = ? AND revoked_at = 0')
        ->execute([time(), hash('sha256', $token)]);
    ya_dealer_event('dealer.session.logout');
}

function ya_dealer_cookie_options(bool $expire = false): array
{
    // HTTP is permitted only by the local PHP development server on loopback.
    // Production always uses Secure, without trusting spoofable forwarded headers.
    $local = PHP_SAPI === 'cli-server' && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
    $path = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api/dealer/session.php')) . '/';
    return ['expires' => $expire ? time() - 3600 : time() + YA_DEALER_SESSION_LIFETIME,
        'path' => $path, 'secure' => !$local || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true, 'samesite' => 'Strict'];
}
function ya_dealer_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
/** Same-origin JSON POST plus custom header: forms and cross-origin scripts cannot mutate sessions. */
function ya_dealer_require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST'); ya_dealer_response(405, ['ok' => false, 'message' => YA_DEALER_ERROR]);
    }
    if (($_SERVER['HTTP_X_YA_DEALER'] ?? '') !== '1'
        || strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json'
        || in_array($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '', ['cross-site', 'same-site'], true)) {
        ya_dealer_response(403, ['ok' => false, 'message' => YA_DEALER_ERROR]);
    }
}
