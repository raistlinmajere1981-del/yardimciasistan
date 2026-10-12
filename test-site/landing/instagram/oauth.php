<?php
declare(strict_types=1);
/**
 * Instagram Business Login: central OAuth callback and short-lived one-time
 * handoff to the desktop main process. No Meta secret/token in public HTML.
 */
ini_set('display_errors', '0');
ini_set('log_errors', '0');
header('Cache-Control: no-store, max-age=0');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
const IG_CLIENT_ID = '3022570838106676';
const IG_REDIRECT = 'https://yardimciasistan.alwaysdata.net/instagram/oauth.php';
const IG_SCOPES = 'instagram_business_basic,instagram_business_content_publish';
const IG_TTL = 600;
function ig_cfg(): ?array {
    $path = getenv('YA_INSTAGRAM_OAUTH_CONFIG') ?: dirname(__DIR__, 2) . '/.config/yardimci-asistan/instagram-oauth.json';
    $json = is_file($path) ? json_decode((string)@file_get_contents($path), true) : null;
    return is_array($json) && is_string($json['app_secret'] ?? null) && strlen($json['app_secret']) >= 16
        ? ['id' => IG_CLIENT_ID, 'secret' => $json['app_secret']] : null;
}
function ig_dir(): string {
    $dir = getenv('YA_INSTAGRAM_OAUTH_PENDING_DIR') ?: dirname(__DIR__, 2) . '/.local/share/yardimci-instagram-oauth';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) throw new RuntimeException('storage');
    return $dir;
}
function ig_fail(int $code, string $type): never {
    http_response_code($code); header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'code' => $type]); exit;
}
function ig_json(array $body): never {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true] + $body, JSON_UNESCAPED_SLASHES); exit;
}
function ig_path(string $id): string {
    if (!preg_match('/^[a-f0-9]{64}$/D', $id)) throw new InvalidArgumentException('id');
    return ig_dir() . '/' . $id . '.json';
}
function ig_atomic(string $id, callable $fn): mixed {
    $path = ig_path($id);
    if (!is_file($path)) throw new InvalidArgumentException('expired');
    $fp = @fopen($path, 'r+');
    if (!$fp) throw new InvalidArgumentException('expired');
    try {
        if (!flock($fp, LOCK_EX)) throw new RuntimeException('lock');
        rewind($fp); $row = json_decode((string)stream_get_contents($fp), true);
        if (!is_array($row) || ($row['expires'] ?? 0) < time()) {
            @unlink($path); throw new InvalidArgumentException('expired');
        }
        $action = $fn($row);
        if (($action['delete'] ?? false) === true) {
            // Truncate before unlink: an already-open concurrent claim must not replay the grant.
            rewind($fp); ftruncate($fp, 0); fflush($fp); @unlink($path);
        }
        else {
            rewind($fp); ftruncate($fp, 0);
            fwrite($fp, json_encode($row, JSON_THROW_ON_ERROR)); fflush($fp);
        }
        return $action['value'] ?? null;
    } finally { flock($fp, LOCK_UN); fclose($fp); }
}
function ig_encrypt(array $value, string $secret): array {
    $iv = random_bytes(12); $tag = '';
    $bytes = openssl_encrypt(json_encode($value, JSON_THROW_ON_ERROR), 'aes-256-gcm',
        hash('sha256', 'instagram-grant-v1:' . $secret, true), OPENSSL_RAW_DATA, $iv, $tag);
    if ($bytes === false) throw new RuntimeException('encryption');
    return ['data' => base64_encode($bytes), 'iv' => base64_encode($iv), 'tag' => base64_encode($tag)];
}
function ig_decrypt(array $row, string $secret): array {
    $bytes = openssl_decrypt(base64_decode((string)$row['data'], true), 'aes-256-gcm',
        hash('sha256', 'instagram-grant-v1:' . $secret, true), OPENSSL_RAW_DATA,
        base64_decode((string)$row['iv'], true), base64_decode((string)$row['tag'], true));
    $result = $bytes === false ? null : json_decode($bytes, true);
    if (!is_array($result)) throw new RuntimeException('decryption');
    return $result;
}
function ig_http(string $url, ?array $form = null, ?string $token = null): array {
    $ch = curl_init($url); if (!$ch) throw new RuntimeException('provider');
    $buf = '';
    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 7, CURLOPT_TIMEOUT => 17,
        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => $token ? ['Authorization: Bearer ' . $token] : [],
        CURLOPT_WRITEFUNCTION => static function ($h, string $chunk) use (&$buf): int {
            if (strlen($buf) + strlen($chunk) > 65536) return 0;
            $buf .= $chunk; return strlen($chunk);
        }
    ]);
    if ($form !== null) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($form, '', '&', PHP_QUERY_RFC3986));
    }
    $ok = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
    if (!$ok || $status !== 200) throw new RuntimeException('provider');
    $result = json_decode($buf, true);
    if (!is_array($result)) throw new RuntimeException('provider');
    return $result;
}
function ig_exchange(string $code, array $cfg): array {
    $short = ig_http('https://api.instagram.com/oauth/access_token', [
        'client_id' => $cfg['id'], 'client_secret' => $cfg['secret'],
        'grant_type' => 'authorization_code', 'redirect_uri' => IG_REDIRECT, 'code' => $code
    ]);
    // Meta returns either a flat token or a one-element data[] result.
    // A mixed/multi-user response is rejected rather than choosing an account.
    if (isset($short['data'])) {
        if (isset($short['access_token']) || !is_array($short['data']) || count($short['data']) !== 1 ||
            !is_array($short['data'][0])) throw new RuntimeException('ambiguous_token');
        $short = $short['data'][0];
    }
    $first = $short['access_token'] ?? null;
    if (!is_string($first) || !preg_match('/^[A-Za-z0-9_.|=\-]{1,4096}$/D', $first)) throw new RuntimeException('token');
    $long = ig_http('https://graph.instagram.com/access_token?' . http_build_query([
        'grant_type' => 'ig_exchange_token', 'client_secret' => $cfg['secret'],
        'access_token' => $first
    ], '', '&', PHP_QUERY_RFC3986));
    $token = $long['access_token'] ?? null;
    if (!is_string($token) || !preg_match('/^[A-Za-z0-9_.|=\-]{1,4096}$/D', $token)) throw new RuntimeException('token');
    $account = ig_http('https://graph.instagram.com/v25.0/me?fields=id,user_id,username,account_type', null, $token);
    if (!is_string($account['id'] ?? null) || !preg_match('/^\d{1,40}$/D', $account['id']) ||
        !is_string($account['username'] ?? null) || !preg_match('/^[A-Za-z0-9_.]{1,64}$/D', $account['username']) ||
        !in_array($account['account_type'] ?? null, ['BUSINESS', 'MEDIA_CREATOR'], true))
        throw new RuntimeException('professional_account_required');
    return ['accountId' => $account['id'], 'username' => $account['username'],
        'accountType' => $account['account_type'], 'accessToken' => $token,
        'expiresAt' => gmdate('c', time() + max(1, min(5184000, (int)($long['expires_in'] ?? 5184000))))];
}
function ig_done(bool $ok): never {
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    header('Content-Type: text/html; charset=utf-8');
    http_response_code($ok ? 200 : 400);
    $title = $ok ? 'Instagram bağlantısı tamamlandı' : 'Instagram bağlantısı tamamlanamadı';
    $message = $ok ? 'Yardımcı Asistan uygulamasına geri dönebilirsiniz. Bu sekmeyi kapatabilirsiniz.'
        : 'Yardımcı Asistan uygulamasına geri dönüp yeniden deneyin.';
    echo '<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'
        . $title . '</title><body style="font:16px system-ui;max-width:36rem;margin:12vh auto;padding:2rem"><h1>'
        . $title . '</h1><p>' . $message . '</p></body></html>'; exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 2048) ig_fail(413, 'invalid_request');
    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body)) ig_fail(400, 'invalid_request');
    $cfg = ig_cfg();
    if ($cfg === null) ig_fail(503, 'setup_pending');
    try {
        if (($body['action'] ?? '') === 'start') {
            $challenge = $body['challenge'] ?? null;
            if (!is_string($challenge) || !preg_match('/^[a-f0-9]{64}$/D', $challenge)) throw new InvalidArgumentException('challenge');
            $dir = ig_dir();
            foreach (glob($dir . '/*.json') ?: [] as $file) {
                if ((int)@filemtime($file) < time() - 1200) @unlink($file);
            }
            if (count(glob($dir . '/*.json') ?: []) >= 400) throw new RuntimeException('capacity');
            // Bound unauthenticated starts per IP. The session challenge is still mandatory to claim.
            $ratePath = $dir . '/rate-' . hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? '')) . '.json';
            $rate = fopen($ratePath, 'c+');
            if (!$rate || !flock($rate, LOCK_EX)) throw new RuntimeException('rate');
            try {
                $old = json_decode((string)stream_get_contents($rate), true) ?: [];
                $hour = intdiv(time(), 3600);
                $count = ($old['hour'] ?? null) === $hour ? (int)($old['count'] ?? 0) : 0;
                if ($count >= 20) throw new RuntimeException('rate');
                rewind($rate); ftruncate($rate, 0);
                fwrite($rate, json_encode(['hour' => $hour, 'count' => $count + 1])); fflush($rate);
                @chmod($ratePath, 0600);
            } finally { flock($rate, LOCK_UN); fclose($rate); }
            $id = bin2hex(random_bytes(32));
            $path = ig_path($id);
            file_put_contents($path, json_encode(['challenge' => $challenge, 'expires' => time() + IG_TTL, 'phase' => 'pending'], JSON_THROW_ON_ERROR), LOCK_EX);
            chmod($path, 0600);
            ig_json(['sessionId' => $id, 'expiresIn' => IG_TTL,
                'authorizationUrl' => 'https://www.instagram.com/oauth/authorize?' . http_build_query([
                    'client_id' => IG_CLIENT_ID, 'redirect_uri' => IG_REDIRECT,
                    'response_type' => 'code', 'scope' => IG_SCOPES, 'state' => $id
                ], '', '&', PHP_QUERY_RFC3986)]);
        }
        if (($body['action'] ?? '') === 'claim') {
            $id = $body['sessionId'] ?? null; $verifier = $body['verifier'] ?? null;
            if (!is_string($id) || !is_string($verifier) || !preg_match('/^[A-Za-z0-9_-]{43}$/D', $verifier))
                throw new InvalidArgumentException('claim');
            $result = ig_atomic($id, static function (array &$row) use ($verifier, $cfg): array {
                if (!hash_equals((string)($row['challenge'] ?? ''), hash('sha256', $verifier)))
                    throw new InvalidArgumentException('verifier');
                if ($row['phase'] === 'ready') return ['delete' => true,
                    'value' => ['status' => 'connected', 'connection' => ig_decrypt($row['grant'], $cfg['secret'])]];
                if ($row['phase'] === 'failed') return ['delete' => true,
                    'value' => ['status' => 'failed', 'code' => 'authorization_failed']];
                return ['value' => ['status' => 'pending']];
            });
            ig_json($result);
        }
        throw new InvalidArgumentException('action');
    } catch (InvalidArgumentException) { ig_fail(400, 'invalid_request'); }
    catch (Throwable) { ig_fail(503, 'temporarily_unavailable'); }
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') { header('Allow: GET, POST'); ig_fail(405, 'method_not_allowed'); }
$id = $_GET['state'] ?? null;
if (!is_string($id) || !preg_match('/^[a-f0-9]{64}$/D', $id)) ig_done(false);
try {
    ig_atomic($id, static function (array &$row): array {
        if ($row['phase'] !== 'pending') throw new InvalidArgumentException('used');
        $row['phase'] = 'processing'; return ['value' => true];
    });
    $cfg = ig_cfg(); $code = $_GET['code'] ?? null;
    if (!$cfg || !is_string($code) || strlen($code) < 8 || strlen($code) > 2048 ||
        !preg_match('/^[A-Za-z0-9_#.-]+$/D', $code)) throw new RuntimeException('code');
    $grant = ig_exchange($code, $cfg);
    ig_atomic($id, static function (array &$row) use ($grant, $cfg): array {
        $row['phase'] = 'ready'; $row['grant'] = ig_encrypt($grant, $cfg['secret']);
        return ['value' => true];
    });
    ig_done(true);
} catch (Throwable) {
    try { ig_atomic($id, static function (array &$row): array {
        $row['phase'] = 'failed'; return ['value' => true];
    }); } catch (Throwable) {}
    ig_done(false);
}
