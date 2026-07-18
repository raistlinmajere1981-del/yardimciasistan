<?php
declare(strict_types=1);

const YA_STORAGE_BASE_DIR = __DIR__ . '/..';
const YA_STORAGE_DATA_DIR = YA_STORAGE_BASE_DIR . '/data';
const YA_STORAGE_DATABASE_FILE = YA_STORAGE_DATA_DIR . '/yardimci-asistan.sqlite';
const YA_STORAGE_SCHEMA_VERSION = 1;

/**
 * Opens and migrates the hosting-side SQLite store.
 *
 * @throws RuntimeException when PDO SQLite is unavailable or the store cannot be opened.
 */
function ya_storage_open(): PDO
{
    static $database = null;
    if ($database instanceof PDO) {
        return $database;
    }

    if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        throw new RuntimeException('pdo_sqlite_missing');
    }

    if (!is_dir(YA_STORAGE_DATA_DIR)
        && !mkdir(YA_STORAGE_DATA_DIR, 0775, true)
        && !is_dir(YA_STORAGE_DATA_DIR)) {
        throw new RuntimeException('data_directory_missing');
    }

    try {
        $database = new PDO('sqlite:' . YA_STORAGE_DATABASE_FILE, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]);
        $database->exec('PRAGMA foreign_keys = ON');
        $database->exec('PRAGMA busy_timeout = 5000');
        $journalMode = strtolower((string) $database->query('PRAGMA journal_mode = WAL')->fetchColumn());
        if ($journalMode !== 'wal') {
            $database->exec('PRAGMA journal_mode = DELETE');
        }
        ya_storage_create_schema($database);
        ya_storage_import_legacy_json($database);
        if (is_file(YA_STORAGE_DATABASE_FILE)) {
            @chmod(YA_STORAGE_DATABASE_FILE, 0600);
        }
        return $database;
    } catch (Throwable $error) {
        $database = null;
        if ($error instanceof RuntimeException) {
            throw $error;
        }
        throw new RuntimeException('sqlite_open_failed', 0, $error);
    }
}

function ya_storage_capabilities(): array
{
    ya_storage_open();
    return [
        'protocol_version' => 2,
        'storage' => 'sqlite',
        'schema_version' => YA_STORAGE_SCHEMA_VERSION,
        'features' => [
            'request_cursor',
            'request_acknowledgement',
            'android_action_queue',
            'versioned_publications',
            'idempotent_publications',
            'server_revision'
        ]
    ];
}

function ya_storage_insert_request(array $request): array
{
    $database = ya_storage_open();
    $id = ya_storage_string($request['id'] ?? '');
    if ($id === '') {
        throw new RuntimeException('request_id_missing');
    }
    $now = ya_storage_string($request['created_at'] ?? '') ?: date(DATE_ATOM);
    $request['created_at'] = $now;
    $request['updated_at'] = ya_storage_string($request['updated_at'] ?? '') ?: $now;
    $request['status'] = ya_storage_string($request['status'] ?? '') ?: 'new';
    $request['sync_status'] = ya_storage_string($request['sync_status'] ?? '') ?: 'pending';

    $statement = $database->prepare(<<<'SQL'
        INSERT INTO web_requests (
          id, payload_json, status, sync_status, created_at, updated_at, imported_at
        ) VALUES (
          :id, :payload_json, :status, :sync_status, :created_at, :updated_at, ''
        )
        ON CONFLICT(id) DO NOTHING
    SQL);
    $statement->execute([
        ':id' => $id,
        ':payload_json' => ya_storage_encode($request),
        ':status' => $request['status'],
        ':sync_status' => $request['sync_status'],
        ':created_at' => $request['created_at'],
        ':updated_at' => $request['updated_at']
    ]);
    if ($statement->rowCount() > 0) {
        ya_storage_bump_revision($database, 'server_revision');
    }

    $stored = ya_storage_get_request($id);
    if ($stored === null) {
        throw new RuntimeException('request_not_stored');
    }
    return $stored;
}

function ya_storage_get_request(string $id): ?array
{
    $statement = ya_storage_open()->prepare('SELECT seq, payload_json FROM web_requests WHERE id = :id');
    $statement->execute([':id' => $id]);
    $row = $statement->fetch();
    return is_array($row) ? ya_storage_request_from_row($row) : null;
}

function ya_storage_all_requests(): array
{
    $rows = ya_storage_open()
        ->query('SELECT seq, payload_json FROM web_requests ORDER BY seq ASC')
        ->fetchAll();
    return array_values(array_filter(array_map('ya_storage_request_from_row', $rows), 'is_array'));
}

function ya_storage_pull_requests(int $limit, bool $includeSynced, ?int $afterSeq): array
{
    $database = ya_storage_open();
    $limit = max(1, min($limit, 200));
    if ($afterSeq !== null) {
        $statement = $database->prepare(
            'SELECT seq, payload_json FROM web_requests WHERE seq > :after_seq ORDER BY seq ASC LIMIT :limit'
        );
        $statement->bindValue(':after_seq', max(0, $afterSeq), PDO::PARAM_INT);
    } elseif ($includeSynced) {
        $statement = $database->prepare(
            'SELECT seq, payload_json FROM web_requests ORDER BY seq ASC LIMIT :limit'
        );
    } else {
        $statement = $database->prepare(
            "SELECT seq, payload_json FROM web_requests WHERE sync_status != 'synced' ORDER BY seq ASC LIMIT :limit"
        );
    }
    $statement->bindValue(':limit', $limit + 1, PDO::PARAM_INT);
    $statement->execute();
    $rows = $statement->fetchAll();
    $hasMore = count($rows) > $limit;
    if ($hasMore) {
        $rows = array_slice($rows, 0, $limit);
    }
    $requests = array_values(array_filter(array_map('ya_storage_request_from_row', $rows), 'is_array'));
    $nextCursor = $afterSeq ?? 0;
    foreach ($rows as $row) {
        $nextCursor = max($nextCursor, (int) ($row['seq'] ?? 0));
    }
    return [
        'requests' => $requests,
        'next_cursor' => $nextCursor,
        'has_more' => $hasMore
    ];
}

function ya_storage_mark_requests_synced(array $requestIds, string $now): int
{
    $database = ya_storage_open();
    $requestIds = array_values(array_unique(array_filter(array_map('ya_storage_string', $requestIds))));
    if ($requestIds === []) {
        return 0;
    }

    $database->exec('BEGIN IMMEDIATE');
    try {
        $updated = 0;
        foreach ($requestIds as $requestId) {
            $updated += ya_storage_mark_request_row_synced($database, $requestId, $now);
        }
        if ($updated > 0) {
            ya_storage_bump_revision($database, 'server_revision');
        }
        $database->exec('COMMIT');
        return $updated;
    } catch (Throwable $error) {
        $database->exec('ROLLBACK');
        throw $error;
    }
}

function ya_storage_acknowledge_requests(string $clientId, int $throughSeq, string $now): int
{
    $database = ya_storage_open();
    $clientId = ya_storage_normalize_client_id($clientId);
    $throughSeq = max(0, $throughSeq);
    $database->exec('BEGIN IMMEDIATE');
    try {
        $statement = $database->prepare(
            "SELECT id, payload_json FROM web_requests WHERE seq <= :through_seq AND sync_status != 'synced' ORDER BY seq ASC"
        );
        $statement->execute([':through_seq' => $throughSeq]);
        $rows = $statement->fetchAll();
        foreach ($rows as $row) {
            ya_storage_mark_request_row_synced($database, ya_storage_string($row['id'] ?? ''), $now);
        }
        $client = $database->prepare(<<<'SQL'
            INSERT INTO sync_clients (client_id, client_type, request_ack_seq, last_seen_at)
            VALUES (:client_id, 'desktop', :request_ack_seq, :last_seen_at)
            ON CONFLICT(client_id) DO UPDATE SET
              request_ack_seq = MAX(sync_clients.request_ack_seq, excluded.request_ack_seq),
              last_seen_at = excluded.last_seen_at
        SQL);
        $client->execute([
            ':client_id' => $clientId,
            ':request_ack_seq' => $throughSeq,
            ':last_seen_at' => $now
        ]);
        if ($rows !== []) {
            ya_storage_bump_revision($database, 'server_revision');
        }
        $database->exec('COMMIT');
        return count($rows);
    } catch (Throwable $error) {
        $database->exec('ROLLBACK');
        throw $error;
    }
}

function ya_storage_update_request_status(string $requestId, string $status, string $now): ?array
{
    $database = ya_storage_open();
    $statement = $database->prepare('SELECT payload_json FROM web_requests WHERE id = :id');
    $statement->execute([':id' => $requestId]);
    $row = $statement->fetch();
    if (!is_array($row)) {
        return null;
    }
    $request = ya_storage_decode($row['payload_json'] ?? '{}', []);
    $request['status'] = $status;
    $request['updated_at'] = $now;
    $update = $database->prepare(<<<'SQL'
        UPDATE web_requests
        SET payload_json = :payload_json, status = :status, updated_at = :updated_at
        WHERE id = :id
    SQL);
    $update->execute([
        ':payload_json' => ya_storage_encode($request),
        ':status' => $status,
        ':updated_at' => $now,
        ':id' => $requestId
    ]);
    ya_storage_bump_revision($database, 'server_revision');
    return $request;
}

function ya_storage_enqueue_android_action(array $action): array
{
    $database = ya_storage_open();
    $statement = $database->prepare(<<<'SQL'
        INSERT INTO android_actions (
          id, action_type, payload_json, device_id, status, error_message, created_at, processed_at
        ) VALUES (
          :id, :action_type, :payload_json, :device_id, :status, :error_message, :created_at, :processed_at
        )
        ON CONFLICT(id) DO NOTHING
    SQL);
    $statement->execute([
        ':id' => ya_storage_string($action['id'] ?? ''),
        ':action_type' => ya_storage_string($action['action_type'] ?? ''),
        ':payload_json' => ya_storage_encode($action['payload'] ?? []),
        ':device_id' => ya_storage_string($action['device_id'] ?? ''),
        ':status' => ya_storage_string($action['status'] ?? '') ?: 'pending',
        ':error_message' => ya_storage_string($action['error_message'] ?? ''),
        ':created_at' => ya_storage_string($action['created_at'] ?? '') ?: date(DATE_ATOM),
        ':processed_at' => ya_storage_string($action['processed_at'] ?? '')
    ]);
    $created = $statement->rowCount() > 0;
    if ($created) {
        ya_storage_bump_revision($database, 'server_revision');
        ya_storage_trim_android_actions($database);
    }
    $stored = ya_storage_get_android_action(ya_storage_string($action['id'] ?? ''));
    if ($stored === null) {
        throw new RuntimeException('android_action_not_stored');
    }
    return ['action' => $stored, 'created' => $created];
}

function ya_storage_pull_android_actions(int $limit): array
{
    $statement = ya_storage_open()->prepare(
        "SELECT * FROM android_actions WHERE status = 'pending' ORDER BY seq ASC LIMIT :limit"
    );
    $statement->bindValue(':limit', max(1, min($limit, 200)), PDO::PARAM_INT);
    $statement->execute();
    return array_values(array_filter(array_map('ya_storage_android_action_from_row', $statement->fetchAll()), 'is_array'));
}

function ya_storage_get_android_actions(string $deviceId, int $limit): array
{
    $statement = ya_storage_open()->prepare(
        'SELECT * FROM android_actions WHERE device_id = :device_id ORDER BY seq DESC LIMIT :limit'
    );
    $statement->bindValue(':device_id', $deviceId);
    $statement->bindValue(':limit', max(1, min($limit, 200)), PDO::PARAM_INT);
    $statement->execute();
    return array_values(array_filter(array_map('ya_storage_android_action_from_row', $statement->fetchAll()), 'is_array'));
}

function ya_storage_count_pending_android_actions(string $deviceId = ''): int
{
    if ($deviceId === '') {
        return (int) ya_storage_open()
            ->query("SELECT COUNT(*) FROM android_actions WHERE status = 'pending'")
            ->fetchColumn();
    }
    $statement = ya_storage_open()->prepare(
        "SELECT COUNT(*) FROM android_actions WHERE status = 'pending' AND device_id = :device_id"
    );
    $statement->execute([':device_id' => $deviceId]);
    return (int) $statement->fetchColumn();
}

function ya_storage_mark_android_action(string $actionId, string $status, string $errorMessage, string $now): ?array
{
    $database = ya_storage_open();
    $statement = $database->prepare(<<<'SQL'
        UPDATE android_actions
        SET status = :status, error_message = :error_message, processed_at = :processed_at
        WHERE id = :id
    SQL);
    $statement->execute([
        ':status' => $status,
        ':error_message' => $errorMessage,
        ':processed_at' => $now,
        ':id' => $actionId
    ]);
    if ($statement->rowCount() > 0) {
        ya_storage_bump_revision($database, 'server_revision');
    }
    return ya_storage_get_android_action($actionId);
}

function ya_storage_get_android_action(string $actionId): ?array
{
    $statement = ya_storage_open()->prepare('SELECT * FROM android_actions WHERE id = :id');
    $statement->execute([':id' => $actionId]);
    $row = $statement->fetch();
    return is_array($row) ? ya_storage_android_action_from_row($row) : null;
}

function ya_storage_publish(
    string $name,
    array $payload,
    string $clientId,
    ?int $sourceRevision,
    string $idempotencyKey,
    string $now
): array {
    $database = ya_storage_open();
    $clientId = ya_storage_normalize_client_id($clientId);
    $database->exec('BEGIN IMMEDIATE');
    try {
        if ($idempotencyKey !== '') {
            $receipt = $database->prepare(
                'SELECT response_json FROM publication_receipts WHERE idempotency_key = :key AND publication_name = :name'
            );
            $receipt->execute([':key' => $idempotencyKey, ':name' => $name]);
            $storedReceipt = $receipt->fetchColumn();
            if (is_string($storedReceipt) && $storedReceipt !== '') {
                $response = ya_storage_decode($storedReceipt, []);
                if (is_array($response)) {
                    $response['deduplicated'] = true;
                }
                $database->exec('COMMIT');
                return $response;
            }
        }

        $currentStatement = $database->prepare(
            'SELECT source_client_id, source_revision, server_revision FROM publications WHERE name = :name'
        );
        $currentStatement->execute([':name' => $name]);
        $current = $currentStatement->fetch();
        $currentSourceRevision = is_array($current) ? (int) ($current['source_revision'] ?? 0) : 0;
        $effectiveSourceRevision = $sourceRevision ?? ($currentSourceRevision + 1);
        if (is_array($current)
            && ya_storage_string($current['source_client_id'] ?? '') === $clientId
            && $effectiveSourceRevision < $currentSourceRevision) {
            throw new YaStorageConflictException('stale_publication_revision');
        }

        if (is_array($current)
            && ya_storage_string($current['source_client_id'] ?? '') === $clientId
            && $effectiveSourceRevision === $currentSourceRevision) {
            $response = [
                'accepted' => true,
                'deduplicated' => true,
                'source_revision' => $currentSourceRevision,
                'server_revision' => (int) ($current['server_revision'] ?? 0),
                'published_at' => $now
            ];
        } else {
            $serverRevision = ya_storage_bump_revision($database, 'server_revision');
            $upsert = $database->prepare(<<<'SQL'
                INSERT INTO publications (
                  name, source_client_id, source_revision, server_revision, payload_json, updated_at
                ) VALUES (
                  :name, :source_client_id, :source_revision, :server_revision, :payload_json, :updated_at
                )
                ON CONFLICT(name) DO UPDATE SET
                  source_client_id = excluded.source_client_id,
                  source_revision = excluded.source_revision,
                  server_revision = excluded.server_revision,
                  payload_json = excluded.payload_json,
                  updated_at = excluded.updated_at
            SQL);
            $upsert->execute([
                ':name' => $name,
                ':source_client_id' => $clientId,
                ':source_revision' => $effectiveSourceRevision,
                ':server_revision' => $serverRevision,
                ':payload_json' => ya_storage_encode($payload),
                ':updated_at' => $now
            ]);
            $response = [
                'accepted' => true,
                'deduplicated' => false,
                'source_revision' => $effectiveSourceRevision,
                'server_revision' => $serverRevision,
                'published_at' => $now
            ];
        }

        if ($idempotencyKey !== '') {
            $receiptInsert = $database->prepare(<<<'SQL'
                INSERT INTO publication_receipts (
                  idempotency_key, publication_name, response_json, created_at
                ) VALUES (
                  :idempotency_key, :publication_name, :response_json, :created_at
                ) ON CONFLICT(idempotency_key, publication_name) DO NOTHING
            SQL);
            $receiptInsert->execute([
                ':idempotency_key' => $idempotencyKey,
                ':publication_name' => $name,
                ':response_json' => ya_storage_encode($response),
                ':created_at' => $now
            ]);
        }
        $database->exec('COMMIT');
        return $response;
    } catch (Throwable $error) {
        $database->exec('ROLLBACK');
        throw $error;
    }
}

function ya_storage_get_publication(string $name, array $fallback): array
{
    $statement = ya_storage_open()->prepare(
        'SELECT payload_json, source_revision, server_revision, updated_at FROM publications WHERE name = :name'
    );
    $statement->execute([':name' => $name]);
    $row = $statement->fetch();
    if (!is_array($row)) {
        return $fallback;
    }
    $payload = ya_storage_decode($row['payload_json'] ?? '{}', $fallback);
    $payload['_publication'] = [
        'source_revision' => (int) ($row['source_revision'] ?? 0),
        'server_revision' => (int) ($row['server_revision'] ?? 0),
        'updated_at' => ya_storage_string($row['updated_at'] ?? '')
    ];
    return $payload;
}

function ya_storage_server_revision(): int
{
    return ya_storage_meta_int(ya_storage_open(), 'server_revision');
}

function ya_storage_update_state(array $changes): void
{
    $database = ya_storage_open();
    $statement = $database->prepare(<<<'SQL'
        INSERT INTO sync_meta (key, value) VALUES (:key, :value)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    SQL);
    foreach ($changes as $key => $value) {
        $statement->execute([
            ':key' => 'state:' . ya_storage_string($key),
            ':value' => is_scalar($value) || $value === null ? (string) ($value ?? '') : ya_storage_encode($value)
        ]);
    }
}

function ya_storage_create_schema(PDO $database): void
{
    $database->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS sync_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS web_requests (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          sync_status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          imported_at TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_web_requests_sync_seq ON web_requests(sync_status, seq);

        CREATE TABLE IF NOT EXISTS android_actions (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          action_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          device_id TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          processed_at TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_android_actions_pending ON android_actions(status, seq);
        CREATE INDEX IF NOT EXISTS idx_android_actions_device ON android_actions(device_id, seq DESC);

        CREATE TABLE IF NOT EXISTS publications (
          name TEXT PRIMARY KEY,
          source_client_id TEXT NOT NULL,
          source_revision INTEGER NOT NULL,
          server_revision INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS publication_receipts (
          idempotency_key TEXT NOT NULL,
          publication_name TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (idempotency_key, publication_name)
        );

        CREATE TABLE IF NOT EXISTS sync_clients (
          client_id TEXT PRIMARY KEY,
          client_type TEXT NOT NULL,
          request_ack_seq INTEGER NOT NULL DEFAULT 0,
          last_seen_at TEXT NOT NULL
        );
    SQL);
    $database->prepare(<<<'SQL'
        INSERT INTO sync_meta (key, value) VALUES ('schema_version', :version)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    SQL)->execute([':version' => (string) YA_STORAGE_SCHEMA_VERSION]);
}

function ya_storage_import_legacy_json(PDO $database): void
{
    $marker = $database->prepare("SELECT value FROM sync_meta WHERE key = 'legacy_json_import_v1'");
    $marker->execute();
    if ($marker->fetchColumn() === 'complete') {
        return;
    }

    $legacyFiles = [
        'requests' => YA_STORAGE_DATA_DIR . '/requests.json',
        'android_actions' => YA_STORAGE_DATA_DIR . '/android-actions.json',
        'menu' => YA_STORAGE_DATA_DIR . '/menu.json',
        'android_snapshot' => YA_STORAGE_DATA_DIR . '/android-snapshot.json',
        'sync_state' => YA_STORAGE_DATA_DIR . '/sync-state.json'
    ];
    foreach ($legacyFiles as $path) {
        if (is_file($path)) {
            $backupPath = $path . '.legacy-backup-v1';
            if (!is_file($backupPath) && !copy($path, $backupPath)) {
                throw new RuntimeException('legacy_backup_failed');
            }
        }
    }

    $database->exec('BEGIN IMMEDIATE');
    try {
        if ((int) $database->query('SELECT COUNT(*) FROM web_requests')->fetchColumn() === 0) {
            $records = ya_storage_load_legacy_json($legacyFiles['requests'], []);
            foreach (is_array($records) ? $records : [] as $record) {
                if (!is_array($record) || ya_storage_string($record['id'] ?? '') === '') {
                    continue;
                }
                ya_storage_import_request($database, $record);
            }
        }
        if ((int) $database->query('SELECT COUNT(*) FROM android_actions')->fetchColumn() === 0) {
            $actions = ya_storage_load_legacy_json($legacyFiles['android_actions'], []);
            foreach (is_array($actions) ? $actions : [] as $action) {
                if (!is_array($action) || ya_storage_string($action['id'] ?? '') === '') {
                    continue;
                }
                ya_storage_import_android_action($database, $action);
            }
        }
        if ((int) $database->query('SELECT COUNT(*) FROM publications')->fetchColumn() === 0) {
            $menu = ya_storage_load_legacy_json($legacyFiles['menu'], []);
            if (is_array($menu) && $menu !== []) {
                ya_storage_import_publication($database, 'menu', $menu);
            }
            $snapshot = ya_storage_load_legacy_json($legacyFiles['android_snapshot'], []);
            if (is_array($snapshot) && $snapshot !== []) {
                ya_storage_import_publication($database, 'android_snapshot', $snapshot);
            }
        }
        $state = ya_storage_load_legacy_json($legacyFiles['sync_state'], []);
        if (is_array($state)) {
            $statement = $database->prepare(
                'INSERT INTO sync_meta (key, value) VALUES (:key, :value) ON CONFLICT(key) DO NOTHING'
            );
            foreach ($state as $key => $value) {
                $statement->execute([
                    ':key' => 'state:' . ya_storage_string($key),
                    ':value' => is_scalar($value) || $value === null ? (string) ($value ?? '') : ya_storage_encode($value)
                ]);
            }
        }
        $database->prepare(
            "INSERT INTO sync_meta (key, value) VALUES ('legacy_json_import_v1', 'complete') "
            . "ON CONFLICT(key) DO UPDATE SET value = 'complete'"
        )->execute();
        if (ya_storage_meta_int($database, 'server_revision') === 0) {
            ya_storage_set_meta($database, 'server_revision', '1');
        }
        $database->exec('COMMIT');
    } catch (Throwable $error) {
        $database->exec('ROLLBACK');
        throw $error;
    }
}

function ya_storage_import_request(PDO $database, array $request): void
{
    $statement = $database->prepare(<<<'SQL'
        INSERT OR IGNORE INTO web_requests (
          id, payload_json, status, sync_status, created_at, updated_at, imported_at
        ) VALUES (
          :id, :payload_json, :status, :sync_status, :created_at, :updated_at, :imported_at
        )
    SQL);
    $statement->execute([
        ':id' => ya_storage_string($request['id'] ?? ''),
        ':payload_json' => ya_storage_encode($request),
        ':status' => ya_storage_string($request['status'] ?? '') ?: 'new',
        ':sync_status' => ya_storage_string($request['sync_status'] ?? '') ?: 'pending',
        ':created_at' => ya_storage_string($request['created_at'] ?? '') ?: date(DATE_ATOM),
        ':updated_at' => ya_storage_string($request['updated_at'] ?? '') ?: date(DATE_ATOM),
        ':imported_at' => ya_storage_string($request['synced_at'] ?? '')
    ]);
}

function ya_storage_import_android_action(PDO $database, array $action): void
{
    $statement = $database->prepare(<<<'SQL'
        INSERT OR IGNORE INTO android_actions (
          id, action_type, payload_json, device_id, status, error_message, created_at, processed_at
        ) VALUES (
          :id, :action_type, :payload_json, :device_id, :status, :error_message, :created_at, :processed_at
        )
    SQL);
    $statement->execute([
        ':id' => ya_storage_string($action['id'] ?? ''),
        ':action_type' => ya_storage_string($action['action_type'] ?? ''),
        ':payload_json' => ya_storage_encode($action['payload'] ?? []),
        ':device_id' => ya_storage_string($action['device_id'] ?? ''),
        ':status' => ya_storage_string($action['status'] ?? '') ?: 'pending',
        ':error_message' => ya_storage_string($action['error_message'] ?? ''),
        ':created_at' => ya_storage_string($action['created_at'] ?? '') ?: date(DATE_ATOM),
        ':processed_at' => ya_storage_string($action['processed_at'] ?? '')
    ]);
}

function ya_storage_import_publication(PDO $database, string $name, array $payload): void
{
    $statement = $database->prepare(<<<'SQL'
        INSERT OR IGNORE INTO publications (
          name, source_client_id, source_revision, server_revision, payload_json, updated_at
        ) VALUES (
          :name, 'legacy', 1, 1, :payload_json, :updated_at
        )
    SQL);
    $statement->execute([
        ':name' => $name,
        ':payload_json' => ya_storage_encode($payload),
        ':updated_at' => ya_storage_string($payload['updated_at'] ?? '') ?: date(DATE_ATOM)
    ]);
}

function ya_storage_mark_request_row_synced(PDO $database, string $requestId, string $now): int
{
    if ($requestId === '') {
        return 0;
    }
    $statement = $database->prepare('SELECT payload_json FROM web_requests WHERE id = :id');
    $statement->execute([':id' => $requestId]);
    $row = $statement->fetch();
    if (!is_array($row)) {
        return 0;
    }
    $request = ya_storage_decode($row['payload_json'] ?? '{}', []);
    $request['sync_status'] = 'synced';
    $request['synced_at'] = $now;
    // Import acknowledgement is metadata and must not supersede a newer
    // operational updated_at value used for stale-action checks.
    $update = $database->prepare(<<<'SQL'
        UPDATE web_requests
        SET payload_json = :payload_json, sync_status = 'synced', imported_at = :imported_at
        WHERE id = :id
    SQL);
    $update->execute([
        ':payload_json' => ya_storage_encode($request),
        ':imported_at' => $now,
        ':id' => $requestId
    ]);
    return $update->rowCount();
}

function ya_storage_request_from_row(mixed $row): ?array
{
    if (!is_array($row)) {
        return null;
    }
    $request = ya_storage_decode($row['payload_json'] ?? '{}', []);
    if (!is_array($request) || ya_storage_string($request['id'] ?? '') === '') {
        return null;
    }
    $request['sync_seq'] = (int) ($row['seq'] ?? 0);
    return $request;
}

function ya_storage_android_action_from_row(mixed $row): ?array
{
    if (!is_array($row) || ya_storage_string($row['id'] ?? '') === '') {
        return null;
    }
    return [
        'id' => ya_storage_string($row['id'] ?? ''),
        'action_type' => ya_storage_string($row['action_type'] ?? ''),
        'payload' => ya_storage_decode($row['payload_json'] ?? '{}', []),
        'created_at' => ya_storage_string($row['created_at'] ?? ''),
        'device_id' => ya_storage_string($row['device_id'] ?? ''),
        'status' => ya_storage_string($row['status'] ?? '') ?: 'pending',
        'error_message' => ya_storage_string($row['error_message'] ?? ''),
        'processed_at' => ya_storage_string($row['processed_at'] ?? '')
    ];
}

function ya_storage_trim_android_actions(PDO $database): void
{
    $count = (int) $database->query('SELECT COUNT(*) FROM android_actions')->fetchColumn();
    if ($count <= 2000) {
        return;
    }
    $database->exec(<<<'SQL'
        DELETE FROM android_actions
        WHERE status != 'pending'
          AND seq NOT IN (
            SELECT seq FROM android_actions WHERE status != 'pending' ORDER BY seq DESC LIMIT 1000
          )
    SQL);
}

function ya_storage_bump_revision(PDO $database, string $key): int
{
    // Keep increments atomic across concurrent PHP workers. Publication writes
    // already hold an IMMEDIATE transaction, while standalone request/action
    // writes still benefit from SQLite serializing this UPDATE statement.
    $database->prepare(
        'INSERT OR IGNORE INTO sync_meta (key, value) VALUES (:key, \'0\')'
    )->execute([':key' => $key]);
    $database->prepare(
        'UPDATE sync_meta SET value = CAST(value AS INTEGER) + 1 WHERE key = :key'
    )->execute([':key' => $key]);
    return ya_storage_meta_int($database, $key);
}

function ya_storage_meta_int(PDO $database, string $key): int
{
    $statement = $database->prepare('SELECT value FROM sync_meta WHERE key = :key');
    $statement->execute([':key' => $key]);
    return (int) ($statement->fetchColumn() ?: 0);
}

function ya_storage_set_meta(PDO $database, string $key, string $value): void
{
    $statement = $database->prepare(<<<'SQL'
        INSERT INTO sync_meta (key, value) VALUES (:key, :value)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    SQL);
    $statement->execute([':key' => $key, ':value' => $value]);
}

function ya_storage_normalize_client_id(string $clientId): string
{
    $normalized = preg_replace('/[^A-Za-z0-9._:-]/', '', trim($clientId)) ?: '';
    return strlen($normalized) >= 6 ? substr($normalized, 0, 120) : 'legacy-desktop';
}

function ya_storage_load_legacy_json(string $path, mixed $fallback): mixed
{
    if (!is_file($path)) {
        return $fallback;
    }
    $decoded = json_decode(file_get_contents($path) ?: '', true);
    return $decoded === null && json_last_error() !== JSON_ERROR_NONE ? $fallback : $decoded;
}

function ya_storage_encode(mixed $value): string
{
    $encoded = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        throw new RuntimeException('json_encode_failed');
    }
    return $encoded;
}

function ya_storage_decode(mixed $value, mixed $fallback): mixed
{
    $decoded = json_decode((string) $value, true);
    return $decoded === null && json_last_error() !== JSON_ERROR_NONE ? $fallback : $decoded;
}

function ya_storage_string(mixed $value): string
{
    return trim((string) $value);
}

final class YaStorageConflictException extends RuntimeException
{
}
