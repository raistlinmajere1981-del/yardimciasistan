<?php
declare(strict_types=1);

require_once __DIR__ . '/../firm-template/web-module/lib/public-room-availability.php';

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "public-room-availability-smoke-failed: {$message}\n");
        exit(1);
    }
}

$now = strtotime('2026-09-13T12:00:00+03:00');
$snapshot = [
    '_publication' => ['updated_at' => '2026-09-13T11:58:00+03:00'],
    'business_capabilities' => [
        'accommodation.rooms',
        'accommodation.reservations',
        'accommodation.stays'
    ],
    'rooms' => [
        ['id' => 'room-1', 'name' => 'Bahçe Oda', 'number' => '1', 'capacity' => 2, 'status' => 'available'],
        ['id' => 'room-2', 'name' => 'Aile Oda', 'number' => '2', 'capacity' => 4, 'status' => 'available'],
        ['id' => 'room-3', 'name' => 'Bakım Oda', 'number' => '3', 'capacity' => 4, 'status' => 'maintenance']
    ],
    'reservations' => [
        [
            'id' => 'reservation-secret',
            'customer_name' => 'Gizli Müşteri',
            'customer_phone' => '+905551112233',
            'status' => 'approved',
            'start_date' => '2026-09-20',
            'end_date' => '2026-09-22',
            'room_ids' => ['room-1']
        ],
        [
            'status' => 'cancelled',
            'start_date' => '2026-09-20',
            'end_date' => '2026-09-25',
            'room_ids' => ['room-2']
        ]
    ],
    'customer_room_stays' => [
        [
            'customer_name' => 'Başka Gizli Müşteri',
            'status' => 'planned',
            'room_id' => 'room-2',
            'check_in_date' => '2026-09-25',
            'check_out_date' => '2026-09-27'
        ]
    ]
];

$blocked = ya_public_room_availability_query($snapshot, '2026-09-20', '2026-09-21', 2, $now);
assert_true($blocked['ok'] === true && $blocked['live'] === true, 'fresh query should be live');
assert_true($blocked['available_room_count'] === 1, 'approved overlap should block room-1 and maintenance should block room-3');
assert_true(($blocked['available_rooms'][0]['number'] ?? '') === '2', 'cancelled reservation must not block room-2');
$publicJson = json_encode($blocked, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
assert_true(!str_contains((string) $publicJson, 'Gizli'), 'customer names must never leak');
assert_true(!str_contains((string) $publicJson, '+90555'), 'customer phones must never leak');
assert_true(!str_contains((string) $publicJson, 'reservation-secret'), 'reservation ids must never leak');

$checkoutBoundary = ya_public_room_availability_query($snapshot, '2026-09-22', '2026-09-23', 2, $now);
assert_true($checkoutBoundary['available_room_count'] === 2, 'checkout day must be available for a new stay');

$stayBlocked = ya_public_room_availability_query($snapshot, '2026-09-25', '2026-09-26', 3, $now);
assert_true($stayBlocked['available_room_count'] === 0, 'planned stay must block room-2 and room-1 is below capacity');

$staleSnapshot = $snapshot;
$staleSnapshot['_publication']['updated_at'] = '2026-09-13T10:00:00+03:00';
$stale = ya_public_room_availability_query($staleSnapshot, '2026-09-20', '2026-09-21', 2, $now);
assert_true($stale['ok'] === false && $stale['code'] === 'availability_stale', 'stale source must not confirm availability');
assert_true(!array_key_exists('available_rooms', $stale), 'stale result must not expose stale room claims');

$invalid = ya_public_room_availability_query($snapshot, '2026-09-21', '2026-09-20', 2, $now);
assert_true($invalid['ok'] === false && $invalid['code'] === 'invalid_date_range', 'reversed range must be rejected');

fwrite(STDOUT, "public-room-availability-smoke-ok\n");
