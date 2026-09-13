<?php
declare(strict_types=1);

const YA_PUBLIC_ROOM_AVAILABILITY_MAX_AGE_SECONDS = 900;

function ya_public_room_availability_query(array $snapshot, string $startDate, string $endDate, int $guestCount = 1, ?int $nowTimestamp = null, int $maxAgeSeconds = YA_PUBLIC_ROOM_AVAILABILITY_MAX_AGE_SECONDS): array
{
    $validation = ya_public_room_availability_validate_query($startDate, $endDate, $guestCount);
    if (!$validation['ok']) return $validation;

    $capabilities = [];
    foreach (($snapshot['business_capabilities'] ?? []) as $capability) {
        if (is_string($capability) && $capability !== '') $capabilities[$capability] = true;
    }
    if (!isset($capabilities['accommodation.rooms']) || (!isset($capabilities['accommodation.reservations']) && !isset($capabilities['accommodation.stays']))) {
        return ya_public_room_availability_failure('availability_not_supported', 'Canlı oda müsaitliği bu işletmede etkin değil.', $startDate, $endDate, $guestCount);
    }

    $publication = is_array($snapshot['_publication'] ?? null) ? $snapshot['_publication'] : [];
    $sourceUpdatedAt = ya_public_room_availability_string($publication['updated_at'] ?? '');
    if ($sourceUpdatedAt === '') {
        return ya_public_room_availability_failure('availability_not_ready', 'Canlı müsaitlik verisi henüz hazır değil.', $startDate, $endDate, $guestCount);
    }

    $sourceTimestamp = strtotime($sourceUpdatedAt);
    $now = $nowTimestamp ?? time();
    $ageSeconds = $sourceTimestamp === false ? PHP_INT_MAX : max(0, $now - $sourceTimestamp);
    if ($ageSeconds > max(0, $maxAgeSeconds)) {
        $result = ya_public_room_availability_failure('availability_stale', 'Müsaitlik verisi güncel değil; işletme tarafından doğrulanması gerekiyor.', $startDate, $endDate, $guestCount);
        $result['source_updated_at'] = $sourceUpdatedAt;
        $result['age_seconds'] = $ageSeconds;
        return $result;
    }

    $rooms = is_array($snapshot['rooms'] ?? null) ? $snapshot['rooms'] : [];
    $reservations = is_array($snapshot['reservations'] ?? null) ? $snapshot['reservations'] : [];
    $stays = is_array($snapshot['customer_room_stays'] ?? null) ? $snapshot['customer_room_stays'] : [];
    $availableRooms = [];
    $eligibleRoomCount = 0;

    foreach ($rooms as $room) {
        if (!is_array($room)) continue;
        $roomId = ya_public_room_availability_string($room['id'] ?? '');
        $capacity = max(0, (int) ($room['capacity'] ?? 0));
        $status = ya_public_room_availability_string($room['status'] ?? 'available');
        if ($roomId === '' || in_array($status, ['cleaning', 'maintenance', 'out_of_service'], true) || $capacity < $guestCount) continue;
        $eligibleRoomCount++;
        if (ya_public_room_availability_room_is_blocked($roomId, $startDate, $endDate, $reservations, $stays)) continue;
        $availableRooms[] = [
            'name' => ya_public_room_availability_string($room['name'] ?? ''),
            'number' => ya_public_room_availability_string($room['number'] ?? ''),
            'capacity' => $capacity
        ];
    }

    usort($availableRooms, static function (array $left, array $right): int {
        $numberCompare = strnatcasecmp(ya_public_room_availability_string($left['number'] ?? ''), ya_public_room_availability_string($right['number'] ?? ''));
        return $numberCompare !== 0 ? $numberCompare : strcasecmp(ya_public_room_availability_string($left['name'] ?? ''), ya_public_room_availability_string($right['name'] ?? ''));
    });

    return [
        'ok' => true,
        'live' => true,
        'code' => 'availability_confirmed',
        'message' => $availableRooms === [] ? 'Seçilen tarih aralığı için uygun oda görünmüyor.' : 'Seçilen tarih aralığı için müsait oda bulundu.',
        'http_status' => 200,
        'query' => ya_public_room_availability_query_summary($startDate, $endDate, $guestCount),
        'source_updated_at' => $sourceUpdatedAt,
        'eligible_room_count' => $eligibleRoomCount,
        'available_room_count' => count($availableRooms),
        'available_rooms' => $availableRooms
    ];
}

function ya_public_room_availability_room_is_blocked(string $roomId, string $startDate, string $endDate, array $reservations, array $stays): bool
{
    foreach ($stays as $stay) {
        if (!is_array($stay) || ya_public_room_availability_string($stay['room_id'] ?? '') !== $roomId || !in_array(ya_public_room_availability_string($stay['status'] ?? ''), ['planned', 'checked_in'], true)) continue;
        $existingStart = ya_public_room_availability_string($stay['check_in_date'] ?? '');
        $existingEnd = ya_public_room_availability_string($stay['check_out_date'] ?? '') ?: '9999-12-31';
        if ($existingStart !== '' && ya_public_room_availability_overlaps($startDate, $endDate, $existingStart, $existingEnd)) return true;
    }

    foreach ($reservations as $reservation) {
        if (!is_array($reservation) || !in_array(ya_public_room_availability_string($reservation['status'] ?? ''), ['pending', 'approved'], true)) continue;
        $roomIds = is_array($reservation['room_ids'] ?? null) ? array_map('strval', $reservation['room_ids']) : [];
        if (!in_array($roomId, $roomIds, true)) continue;
        $existingStart = ya_public_room_availability_string($reservation['start_date'] ?? '') ?: ya_public_room_availability_string($reservation['end_date'] ?? '');
        $existingEnd = ya_public_room_availability_string($reservation['end_date'] ?? '') ?: ya_public_room_availability_string($reservation['start_date'] ?? '');
        if ($existingStart !== '' && $existingEnd !== '' && ya_public_room_availability_overlaps($startDate, $endDate, $existingStart, $existingEnd)) return true;
    }
    return false;
}

function ya_public_room_availability_overlaps(string $startDate, string $endDate, string $existingStart, string $existingEnd): bool
{
    return $existingStart < $endDate && $startDate < $existingEnd;
}

function ya_public_room_availability_validate_query(string $startDate, string $endDate, int $guestCount): array
{
    if (!ya_public_room_availability_valid_date($startDate) || !ya_public_room_availability_valid_date($endDate) || $endDate <= $startDate) {
        return ['ok' => false, 'live' => false, 'code' => 'invalid_date_range', 'message' => 'Giriş ve çıkış tarihleri YYYY-MM-DD biçiminde ve çıkış tarihi girişten sonra olmalı.', 'http_status' => 422];
    }
    if ($guestCount < 1 || $guestCount > 99) {
        return ['ok' => false, 'live' => false, 'code' => 'invalid_guest_count', 'message' => 'Kişi sayısı 1 ile 99 arasında olmalı.', 'http_status' => 422];
    }
    return ['ok' => true];
}

function ya_public_room_availability_failure(string $code, string $message, string $startDate, string $endDate, int $guestCount): array
{
    return ['ok' => false, 'live' => false, 'code' => $code, 'message' => $message, 'http_status' => 409, 'query' => ya_public_room_availability_query_summary($startDate, $endDate, $guestCount), 'source_updated_at' => ''];
}

function ya_public_room_availability_valid_date(string $value): bool
{
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) return false;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date instanceof DateTimeImmutable && $date->format('Y-m-d') === $value;
}

function ya_public_room_availability_query_summary(string $startDate, string $endDate, int $guestCount): array
{
    return ['start_date' => $startDate, 'end_date' => $endDate, 'guest_count' => $guestCount];
}

function ya_public_room_availability_string(mixed $value): string
{
    return is_scalar($value) ? trim((string) $value) : '';
}
