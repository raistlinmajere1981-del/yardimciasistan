<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';
const YA_AVAILABILITY_SYNC_MAX_BODY_BYTES = 2_000_000;

require_once YA_BASE_DIR . '/lib/public-room-availability-storage.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    ya_availability_sync_response(405, [
        'ok' => false,
        'message' => 'Canlı müsaitlik yayını için POST isteği gerekli.'
    ]);
}

$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > YA_AVAILABILITY_SYNC_MAX_BODY_BYTES) {
    ya_availability_sync_response(413, [
        'ok' => false,
        'message' => 'Canlı müsaitlik yayını çok büyük.'
    ]);
}

$businessConfig = ya_availability_sync_load_json(YA_CONFIG_FILE, []);
$expectedSecret = ya_availability_sync_string($businessConfig['sync_secret'] ?? '');
$providedSecret = ya_availability_sync_string($_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? '');
if ($expectedSecret === '' || $providedSecret === '' || !hash_equals($expectedSecret, $providedSecret)) {
    ya_availability_sync_response(401, [
        'ok' => false,
        'message' => 'Canlı müsaitlik yayını için güncelleme izni alınamadı.'
    ]);
}

$raw = (string) file_get_contents('php://input', false, null, 0, YA_AVAILABILITY_SYNC_MAX_BODY_BYTES + 1);
if (strlen($raw) > YA_AVAILABILITY_SYNC_MAX_BODY_BYTES) {
    ya_availability_sync_response(413, ['ok' => false, 'message' => 'Canlı müsaitlik yayını çok büyük.']);
}
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    ya_availability_sync_response(400, [
        'ok' => false,
        'message' => 'Geçerli bir JSON gövdesi gerekli.'
    ]);
}

$clientId = ya_availability_sync_string($payload['client_id'] ?? '');
if (preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $clientId) !== 1) {
    ya_availability_sync_response(422, [
        'ok' => false,
        'message' => 'Masaüstü senkron kimliği geçersiz.'
    ]);
}

try {
    $publication = ya_availability_sync_sanitize_publication(
        is_array($payload['availability'] ?? null) ? $payload['availability'] : []
    );
    $publishedAt = date(DATE_ATOM);
    [$epoch, $hash] = ya_storage_publication_identity($payload, $payload['availability'] ?? []);
    $result = ya_public_room_availability_store_publication(
        $publication,
        $clientId,
        $publishedAt, $payload['source_revision'], $payload['idempotency_key'], $epoch, $hash
    );
    ya_availability_sync_response(200, [
        'ok' => true,
        'message' => 'Canlı oda müsaitliği güncellendi.',
        ...$result,
        'published_at' => $result['published_at'],
        'server_revision' => (int) ($result['server_revision'] ?? ya_storage_server_revision())
    ]);
} catch (InvalidArgumentException $error) {
    ya_availability_sync_response(422, ['ok' => false, 'error' => $error->getMessage(), 'message' => 'Canlı müsaitlik yayını eksik veya çok büyük.']);
} catch (YaStorageConflictException $error) {
    ya_availability_sync_response(409, ['ok' => false, 'message' => 'Publication protocol conflict.', 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    $storageUnavailable = $error->getMessage() === 'pdo_sqlite_missing';
    ya_availability_sync_response($storageUnavailable ? 503 : 500, [
        'ok' => false,
        'message' => $storageUnavailable
            ? 'Hostingde PHP SQLite desteği etkin değil.'
            : 'Canlı müsaitlik yayını kaydedilemedi.'
    ]);
}

function ya_availability_sync_sanitize_publication(array $publication): array
{
    if (($publication['schema_version'] ?? null) !== 1 || !is_bool($publication['enabled'] ?? null)
        || !is_array($publication['rooms'] ?? null) || !is_array($publication['blocks'] ?? null)
        || !array_is_list($publication['rooms']) || !array_is_list($publication['blocks'])
        || count($publication['rooms']) > 500 || count($publication['blocks']) > 5000) {
        throw new InvalidArgumentException('availability_projection_limit');
    }
    $enabled = ya_availability_sync_bool($publication['enabled'] ?? false);
    $generatedAt = substr(ya_availability_sync_string($publication['generated_at'] ?? ''), 0, 80);
    $rooms = [];
    $roomIds = [];

    if ($enabled) {
        $sourceRooms = $publication['rooms'];
        foreach ($sourceRooms as $room) {
            if (!is_array($room)) throw new InvalidArgumentException('invalid_availability_room');
            $id = ya_availability_sync_string($room['id'] ?? '');
            if ($id === '' || strlen($id) > 160 || isset($roomIds[$id])) throw new InvalidArgumentException('invalid_availability_room');
            $status = ya_availability_sync_string($room['status'] ?? 'out_of_service');
            if (!in_array($status, ['available', 'reserved', 'occupied', 'cleaning', 'maintenance', 'out_of_service'], true)) {
                $status = 'out_of_service';
            }
            $roomIds[$id] = true;
            $rooms[] = [
                'id' => $id,
                'name' => substr(ya_availability_sync_string($room['name'] ?? ''), 0, 120),
                'number' => substr(ya_availability_sync_string($room['number'] ?? ''), 0, 40),
                'capacity' => max(0, min(99, (int) ($room['capacity'] ?? 0))),
                'status' => $status
            ];
        }
    }

    $blocks = [];
    if ($enabled) {
        $sourceBlocks = $publication['blocks'];
        foreach ($sourceBlocks as $block) {
            if (!is_array($block)) throw new InvalidArgumentException('invalid_availability_block');
            $roomId = ya_availability_sync_string($block['room_id'] ?? '');
            $startDate = ya_availability_sync_string($block['start_date'] ?? '');
            $endDate = ya_availability_sync_string($block['end_date'] ?? '');
            if (!isset($roomIds[$roomId])
                || !ya_availability_sync_valid_date($startDate)
                || !ya_availability_sync_valid_date($endDate)
                || $endDate <= $startDate) {
                throw new InvalidArgumentException('invalid_availability_block');
            }
            $blocks[] = [
                'room_id' => $roomId,
                'start_date' => $startDate,
                'end_date' => $endDate
            ];
        }
    }

    return [
        'schema_version' => 1,
        'enabled' => $enabled,
        'generated_at' => $generatedAt,
        'rooms' => $rooms,
        'blocks' => $blocks
    ];
}

function ya_availability_sync_valid_date(string $value): bool
{
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) return false;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date instanceof DateTimeImmutable && $date->format('Y-m-d') === $value;
}

function ya_availability_sync_bool(mixed $value): bool
{
    if (is_bool($value)) return $value;
    if (is_int($value)) return $value !== 0;
    if (is_string($value)) return in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'on'], true);
    return false;
}

function ya_availability_sync_string(mixed $value): string
{
    return is_scalar($value) ? trim((string) $value) : '';
}

function ya_availability_sync_load_json(string $path, mixed $fallback): mixed
{
    if (!is_file($path)) return $fallback;
    $decoded = json_decode((string) file_get_contents($path), true);
    return $decoded === null ? $fallback : $decoded;
}

function ya_availability_sync_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}
