<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

function ya_android_auth_snapshot(): array
{
    $snapshot = ya_storage_get_publication('android_snapshot', []);
    unset($snapshot['_publication']);
    return is_array($snapshot) ? $snapshot : [];
}

function ya_android_auth_snapshot_has_capabilities(array $required, ?array $snapshot = null): bool
{
    $source = $snapshot ?? ya_android_auth_snapshot();
    $stored = is_array($source['business_capabilities'] ?? null)
        ? $source['business_capabilities']
        : [];
    $enabled = array_fill_keys(array_values(array_filter($stored, static function (mixed $value): bool {
        return is_string($value) && $value !== '';
    })), true);
    foreach ($required as $capability) {
        if (!is_string($capability) || !isset($enabled[$capability])) {
            return false;
        }
    }
    return true;
}

function ya_android_auth_ensure_schema(): void
{
    ya_storage_open()->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS android_device_tokens (
          device_id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL,
          issued_at TEXT NOT NULL,
          last_used_at TEXT NOT NULL DEFAULT '',
          revoked_at TEXT NOT NULL DEFAULT ''
        )
    SQL);
}

function ya_android_auth_has_token(string $deviceId): bool
{
    $deviceId = trim($deviceId);
    if ($deviceId === '') {
        return false;
    }
    ya_android_auth_ensure_schema();
    $statement = ya_storage_open()->prepare(<<<'SQL'
        SELECT 1
        FROM android_device_tokens
        WHERE device_id = :device_id AND revoked_at = ''
        LIMIT 1
    SQL);
    $statement->execute([':device_id' => $deviceId]);
    return $statement->fetchColumn() !== false;
}

function ya_android_auth_issue_token(string $deviceId): string
{
    $deviceId = trim($deviceId);
    if (preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $deviceId) !== 1) {
        throw new InvalidArgumentException('invalid_device_id');
    }

    ya_android_auth_ensure_schema();
    $token = 'yat_' . bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $now = date(DATE_ATOM);
    $statement = ya_storage_open()->prepare(<<<'SQL'
        INSERT INTO android_device_tokens (
          device_id, token_hash, issued_at, last_used_at, revoked_at
        ) VALUES (
          :device_id, :token_hash, :issued_at, '', ''
        )
        ON CONFLICT(device_id) DO UPDATE SET
          token_hash = excluded.token_hash,
          issued_at = excluded.issued_at,
          last_used_at = '',
          revoked_at = ''
    SQL);
    $statement->execute([
        ':device_id' => $deviceId,
        ':token_hash' => $tokenHash,
        ':issued_at' => $now
    ]);
    return $token;
}

function ya_android_auth_validate_token(string $deviceId, string $token): bool
{
    $deviceId = trim($deviceId);
    $token = trim($token);
    if (
        preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $deviceId) !== 1
        || preg_match('/^yat_[a-f0-9]{64}$/', $token) !== 1
    ) {
        return false;
    }

    ya_android_auth_ensure_schema();
    $statement = ya_storage_open()->prepare(<<<'SQL'
        SELECT token_hash
        FROM android_device_tokens
        WHERE device_id = :device_id AND revoked_at = ''
        LIMIT 1
    SQL);
    $statement->execute([':device_id' => $deviceId]);
    $storedHash = (string) ($statement->fetchColumn() ?: '');
    if ($storedHash === '' || !hash_equals($storedHash, hash('sha256', $token))) {
        return false;
    }

    $touch = ya_storage_open()->prepare(<<<'SQL'
        UPDATE android_device_tokens
        SET last_used_at = :last_used_at
        WHERE device_id = :device_id AND revoked_at = ''
    SQL);
    $touch->execute([
        ':device_id' => $deviceId,
        ':last_used_at' => date(DATE_ATOM)
    ]);
    return true;
}

/**
 * Android requests prefer their per-device token. Once a token has been issued
 * for a device, the shared sync secret is no longer accepted for that device.
 * Devices that have not yet upgraded remain compatible with the old header.
 */
function ya_android_auth_request_authorized(array $businessConfig, string $deviceId): bool
{
    $deviceId = trim($deviceId);
    if (preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $deviceId) !== 1) {
        return false;
    }

    $deviceToken = trim((string) ($_SERVER['HTTP_X_YA_DEVICE_TOKEN'] ?? ''));
    if ($deviceToken !== '') {
        return ya_android_auth_validate_token($deviceId, $deviceToken);
    }

    if (ya_android_auth_has_token($deviceId)) {
        return false;
    }

    $configured = trim((string) ($businessConfig['sync_secret'] ?? ''));
    $provided = trim((string) ($_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? ''));
    return $configured !== '' && $provided !== '' && hash_equals($configured, $provided);
}

function ya_android_auth_revoke_token(string $deviceId): void
{
    $deviceId = trim($deviceId);
    if ($deviceId === '') {
        return;
    }
    ya_android_auth_ensure_schema();
    $statement = ya_storage_open()->prepare(<<<'SQL'
        UPDATE android_device_tokens
        SET revoked_at = :revoked_at
        WHERE device_id = :device_id AND revoked_at = ''
    SQL);
    $statement->execute([
        ':device_id' => $deviceId,
        ':revoked_at' => date(DATE_ATOM)
    ]);
}
