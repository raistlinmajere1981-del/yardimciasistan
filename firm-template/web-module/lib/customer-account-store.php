<?php
declare(strict_types=1);

/** Hosting owns credentials and sessions. Desktop publishes only opaque customer bindings. */
function ya_account_create_schema(PDO $db): void
{
    $db->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS customer_accounts (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '', email_verified INTEGER NOT NULL DEFAULT 0,
    session_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_account_identities (
    provider TEXT NOT NULL, subject TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES customer_accounts(id),
    PRIMARY KEY(provider, subject), UNIQUE(account_id, provider)
);
CREATE TABLE IF NOT EXISTS customer_account_sessions (
    session_hash TEXT PRIMARY KEY, refresh_hash TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL REFERENCES customer_accounts(id), session_version INTEGER NOT NULL,
    client TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    refresh_expires_at INTEGER NOT NULL, revoked_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS account_sessions_owner ON customer_account_sessions(account_id);
CREATE TABLE IF NOT EXISTS customer_account_tokens (
    token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES customer_accounts(id),
    purpose TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS customer_account_registrations (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL UNIQUE REFERENCES customer_accounts(id),
    email TEXT NOT NULL, full_name TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_account_oauth (
    state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, provider TEXT NOT NULL,
    verifier TEXT NOT NULL, link_account_id TEXT NOT NULL, link_session_hash TEXT NOT NULL,
    native_challenge TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_account_handoffs (
    code_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES customer_accounts(id),
    challenge TEXT NOT NULL, session_version INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_account_browser_starts (
    ticket_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, challenge TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_account_attempts (
    bucket TEXT PRIMARY KEY, started_at INTEGER NOT NULL, attempts INTEGER NOT NULL
);
SQL);
}

function ya_account_random(): string { return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '='); }
function ya_account_hash(string $value): string { return hash('sha256', $value); }
function ya_account_uuid(): string
{
    $hex = bin2hex(random_bytes(16));
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}
function ya_account_enqueue(PDO $db, string $id): void
{
    $db->prepare('INSERT OR IGNORE INTO customer_account_registrations(account_id, email, full_name, created_at)
        SELECT id, email, full_name, created_at FROM customer_accounts WHERE id = ? AND email_verified = 1')->execute([$id]);
}

function ya_account_pull(PDO $db, int $cursor, int $limit): array
{
    $limit = max(1, min(100, $limit));
    $query = $db->prepare('SELECT seq, account_id, email, full_name FROM customer_account_registrations WHERE seq > ? ORDER BY seq LIMIT ?');
    $query->bindValue(1, max(0, $cursor), PDO::PARAM_INT); $query->bindValue(2, $limit + 1, PDO::PARAM_INT); $query->execute();
    $rows = $query->fetchAll(); $more = count($rows) > $limit; $rows = array_slice($rows, 0, $limit);
    return ['accounts' => array_map(static fn(array $row): array => ['syncSeq' => (int)$row['seq'],
        'accountId' => $row['account_id'], 'email' => $row['email'], 'fullName' => $row['full_name'], 'emailVerified' => true], $rows),
        'next_cursor' => $rows ? (int)$rows[count($rows) - 1]['seq'] : $cursor, 'has_more' => $more];
}
