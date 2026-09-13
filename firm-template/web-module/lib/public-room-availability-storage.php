<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

/**
 * Stores the public availability heartbeat without bumping the global server
 * revision. Android/request cursors use that revision to detect operational
 * changes; a freshness heartbeat must not make an otherwise unchanged Android
 * snapshot look modified every 15 seconds.
 */
function ya_public_room_availability_store_publication(
    array $payload,
    string $clientId,
    string $now
): array {
    $database = ya_storage_open();
    $clientId = ya_storage_normalize_client_id($clientId);
    $database->exec('BEGIN IMMEDIATE');
    try {
        $currentStatement = $database->prepare(
            'SELECT source_revision FROM publications WHERE name = :name'
        );
        $currentStatement->execute([':name' => 'public_room_availability']);
        $current = $currentStatement->fetch();
        $sourceRevision = is_array($current)
            ? ((int) ($current['source_revision'] ?? 0) + 1)
            : 1;
        $serverRevision = ya_storage_server_revision();

        $upsert = $database->prepare(<<<'SQL'
            INSERT INTO publications (
              name, source_client_id, source_revision, server_revision, payload_json, updated_at
            ) VALUES (
              'public_room_availability', :source_client_id, :source_revision, :server_revision, :payload_json, :updated_at
            )
            ON CONFLICT(name) DO UPDATE SET
              source_client_id = excluded.source_client_id,
              source_revision = excluded.source_revision,
              server_revision = excluded.server_revision,
              payload_json = excluded.payload_json,
              updated_at = excluded.updated_at
        SQL);
        $upsert->execute([
            ':source_client_id' => $clientId,
            ':source_revision' => $sourceRevision,
            ':server_revision' => $serverRevision,
            ':payload_json' => ya_storage_encode($payload),
            ':updated_at' => $now
        ]);
        $database->exec('COMMIT');
        return [
            'accepted' => true,
            'source_revision' => $sourceRevision,
            'server_revision' => $serverRevision,
            'published_at' => $now
        ];
    } catch (Throwable $error) {
        if ($database->inTransaction()) {
            $database->exec('ROLLBACK');
        }
        throw $error;
    }
}
