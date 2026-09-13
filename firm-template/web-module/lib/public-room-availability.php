<?php
declare(strict_types=1);

const YA_PUBLIC_ROOM_AVAILABILITY_MAX_AGE_SECONDS = 900;

function ya_public_room_availability_query(
    array $publication,
    string $startDate,
    string $endDate,
    int $guestCount = 1,
    ?int $nowTimestamp = null,
    int $maxAgeSeconds = YA_PUBLIC_ROOM_AVAILABILITY_MAX_AGE_SECONDS
): array {
    $validation = ya_public_room_availability_validate_query($startDate, $endDate, $guestCount);
    if (!$validation['ok']) return $validation;

    if ((int) ($publication['schema_version'] ?? 0) !== 1) {
        return ya_public_room_availability_failure(
            'availability_not_ready',
            'Canlı müsaitlik verisi henüz hazır değil.',
            $startDate,
            $endDate,
            $guestCount
        );
    }
    if (($publication['enabled'] ?? false) !== true) {
        return ya_public_room_availability_failure(
            'availability_not_supported',
            'Canlı oda müsaitliği bu işletmede etkin değil.',
            $startDate,
            $endDate,
            $guestCount
        );
    }

    $metadata = is_array($publication['_publication'] ?? null) ? $publication['_publication'] : [];
    $sourceUpdatedAt = ya_public_room_availability_string($metadata['updated_at'] ?? '');
    $generatedAt = ya_public_room_availability_string($publication['generated_at'] ?? '');
    if ($sourceUpdatedAt === '' || $generatedAt === '') {
        return ya_public_room_availability_failure(
            'availability_not_ready',
            'Canlı müsaitlik verisi henüz hazır değil.',
            $startDate,
            $endDate,
            $guestCount
        );
    }

    $now = $nowTimestamp ?? time();
    $sourceTimestamp = strtotime($sourceUpdatedAt);
    $generatedTimestamp = strtotime($generatedAt);
    $sourceAgeSeconds = $sourceTimestamp === false ? PHP_INT_MAX : max(0, $now - $sourceTimestamp);
    $generatedAgeSeconds = $generatedTimestamp === false ? PHP_INT_MAX : max(0, $now - $generatedTimestamp);
    $ageSeconds = max($sourceAgeSeconds, $generatedAgeSeconds);
    if ($ageSeconds > max(0, $maxAgeSeconds)) {
        $result = ya_public_room_availability_failure(
            'availability_stale',
            'Müsaitlik verisi güncel değil; işletme tarafından doğrulanması gerekiyor.',
            $startDate,
            $endDate,
            $guestCount
        );
        $result['source_updated_at'] = $sourceUpdatedAt;
        $result['generated_at'] = $generatedAt;
        $result['age_seconds'] = $ageSeconds;
        return $result;
    }

    $rooms = is_array($publication['rooms'] ?? null) ? $publication['rooms'] : [];
    $blocks = is_array($publication['blocks'] ?? null) ? $publication['blocks'] : [];
    $availableRooms = [];
    $eligibleRoomCount = 0;

    foreach ($rooms as $room) {
        if (!is_array($room)) continue;
        $roomId = ya_public_room_availability_string($room['id'] ?? '');
        $capacity = max(0, (int) ($room['capacity'] ?? 0));
        $status = ya_public_room_availability_string($room['status'] ?? 'out_of_service');
        if ($roomId === ''
            || in_array($status, ['cleaning', 'maintenance', 'out_of_service'], true)
            || $capacity < $guestCount) {
            continue;
        }
        $eligibleRoomCount++;
        if (ya_public_room_availability_room_is_blocked($roomId, $startDate, $endDate, $blocks)) {
            continue;
        }
        $availableRooms[] = [
            'name' => ya_public_room_availability_string($room['name'] ?? ''),
            'number' => ya_public_room_availability_string($room['number'] ?? ''),
            'capacity' => $capacity
        ];
    }

    usort($availableRooms, static function (array $left, array $right): int {
        $numberCompare = strnatcasecmp(
            ya_public_room_availability_string($left['number'] ?? ''),
            ya_public_room_availability_string($right['number'] ?? '')
        );
        return $numberCompare !== 0 ? $numberCompare : strcasecmp(
            ya_public_room_availability_string($left['name'] ?? ''),
            ya_public_room_availability_string($right['name'] ?? '')
        );
    });

    return [
        'ok' => true,
        'live' => true,
        'code' => 'availability_confirmed',
        'message' => $availableRooms === []
            ? 'Seçilen tarih aralığı için uygun oda görünmüyor.'
            : 'Seçilen tarih aralığı için müsait oda bulundu.',
        'http_status' => 200,
        'query' => ya_public_room_availability_query_summary($startDate, $endDate, $guestCount),
        'source_updated_at' => $sourceUpdatedAt,
        'generated_at' => $generatedAt,
        'eligible_room_count' => $eligibleRoomCount,
        'available_room_count' => count($availableRooms),
        'available_rooms' => $availableRooms
    ];
}

function ya_public_room_availability_room_is_blocked(
    string $roomId,
    string $startDate,
    string $endDate,
    array $blocks
): bool {
    foreach ($blocks as $block) {
        if (!is_array($block)
            || ya_public_room_availability_string($block['room_id'] ?? '') !== $roomId) {
            continue;
        }
        $existingStart = ya_public_room_availability_string($block['start_date'] ?? '');
        $existingEnd = ya_public_room_availability_string($block['end_date'] ?? '');
        if ($existingStart !== ''
            && $existingEnd !== ''
            && ya_public_room_availability_overlaps($startDate, $endDate, $existingStart, $existingEnd)) {
            return true;
        }
    }
    return false;
}

function ya_public_room_availability_overlaps(
    string $startDate,
    string $endDate,
    string $existingStart,
    string $existingEnd
): bool {
    return $existingStart < $endDate && $startDate < $existingEnd;
}

function ya_public_room_availability_validate_query(string $startDate, string $endDate, int $guestCount): array
{
    if (!ya_public_room_availability_valid_date($startDate)
        || !ya_public_room_availability_valid_date($endDate)
        || $endDate <= $startDate) {
        return [
            'ok' => false,
            'live' => false,
            'code' => 'invalid_date_range',
            'message' => 'Giriş ve çıkış tarihleri YYYY-MM-DD biçiminde ve çıkış tarihi girişten sonra olmalı.',
            'http_status' => 422
        ];
    }
    if ($guestCount < 1 || $guestCount > 99) {
        return [
            'ok' => false,
            'live' => false,
            'code' => 'invalid_guest_count',
            'message' => 'Kişi sayısı 1 ile 99 arasında olmalı.',
            'http_status' => 422
        ];
    }
    return ['ok' => true];
}

function ya_public_room_availability_failure(
    string $code,
    string $message,
    string $startDate,
    string $endDate,
    int $guestCount
): array {
    return [
        'ok' => false,
        'live' => false,
        'code' => $code,
        'message' => $message,
        'http_status' => 409,
        'query' => ya_public_room_availability_query_summary($startDate, $endDate, $guestCount),
        'source_updated_at' => ''
    ];
}

function ya_public_room_availability_valid_date(string $value): bool
{
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) return false;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date instanceof DateTimeImmutable && $date->format('Y-m-d') === $value;
}

function ya_public_room_availability_query_summary(string $startDate, string $endDate, int $guestCount): array
{
    return [
        'start_date' => $startDate,
        'end_date' => $endDate,
        'guest_count' => $guestCount
    ];
}

function ya_public_room_availability_string(mixed $value): string
{
    return is_scalar($value) ? trim((string) $value) : '';
}
