<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

/** Freshness uses ordered receipts without invalidating Android's global cache. */
function ya_public_room_availability_store_publication(array $payload, string $clientId, string $now, int $revision, string $key, int $epoch, string $hash): array
{
    return ya_storage_publish('public_room_availability', $payload, $clientId, $revision, $key, $now, $epoch, $hash, null, false);
}
