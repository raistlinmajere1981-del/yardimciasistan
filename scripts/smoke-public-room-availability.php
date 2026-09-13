<?php
declare(strict_types=1);

require_once __DIR__ . '/../firm-template/web-module/lib/public-room-availability.php';
require_once __DIR__ . '/../firm-template/web-module/lib/public-room-availability-intent.php';

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "public-room-availability-smoke-failed: {$message}\n");
        exit(1);
    }
}

$now = strtotime('2026-09-13T12:00:00+03:00');
$publication = [
    '_publication' => ['updated_at' => '2026-09-13T11:58:00+03:00'],
    'schema_version' => 1,
    'enabled' => true,
    'generated_at' => '2026-09-13T11:58:00+03:00',
    'rooms' => [
        ['id' => 'room-1', 'name' => 'Bahçe Oda', 'number' => '1', 'capacity' => 2, 'status' => 'available'],
        ['id' => 'room-2', 'name' => 'Aile Oda', 'number' => '2', 'capacity' => 4, 'status' => 'available'],
        ['id' => 'room-3', 'name' => 'Bakım Oda', 'number' => '3', 'capacity' => 4, 'status' => 'maintenance'],
        ['id' => 'room-4', 'name' => 'Temizlik Oda', 'number' => '4', 'capacity' => 4, 'status' => 'cleaning']
    ],
    'blocks' => [
        ['room_id' => 'room-1', 'start_date' => '2026-09-20', 'end_date' => '2026-09-22'],
        ['room_id' => 'room-2', 'start_date' => '2026-09-25', 'end_date' => '2026-09-27']
    ]
];

$blocked = ya_public_room_availability_query($publication, '2026-09-20', '2026-09-21', 2, $now);
assert_true($blocked['ok'] === true && $blocked['live'] === true, 'fresh query should be live');
assert_true($blocked['available_room_count'] === 1, 'overlap and operational room states should leave only room-2');
assert_true(($blocked['available_rooms'][0]['number'] ?? '') === '2', 'room-2 should remain available outside its own block');
$publicJson = json_encode($blocked, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
assert_true(!str_contains((string) $publicJson, 'Temizlik Oda'), 'cleaning rooms must never be offered');

$checkoutBoundary = ya_public_room_availability_query($publication, '2026-09-22', '2026-09-23', 2, $now);
assert_true($checkoutBoundary['available_room_count'] === 2, 'checkout day must be available for a new stay');

$stayBlocked = ya_public_room_availability_query($publication, '2026-09-25', '2026-09-26', 3, $now);
assert_true($stayBlocked['available_room_count'] === 0, 'room-2 block should apply and room-1 is below capacity');

$stalePublication = $publication;
$stalePublication['_publication']['updated_at'] = '2026-09-13T10:00:00+03:00';
$stale = ya_public_room_availability_query($stalePublication, '2026-09-20', '2026-09-21', 2, $now);
assert_true($stale['ok'] === false && $stale['code'] === 'availability_stale', 'stale stored publication must not confirm availability');
assert_true(!array_key_exists('available_rooms', $stale), 'stale result must not expose stale room claims');

$staleGenerated = $publication;
$staleGenerated['generated_at'] = '2026-09-13T10:00:00+03:00';
$generatedStale = ya_public_room_availability_query($staleGenerated, '2026-09-20', '2026-09-21', 2, $now);
assert_true($generatedStale['ok'] === false && $generatedStale['code'] === 'availability_stale', 'stale desktop generation time must not confirm availability');

$disabled = $publication;
$disabled['enabled'] = false;
$disabledResult = ya_public_room_availability_query($disabled, '2026-09-20', '2026-09-21', 2, $now);
assert_true($disabledResult['ok'] === false && $disabledResult['code'] === 'availability_not_supported', 'disabled capability tombstone must stop live availability');

$invalid = ya_public_room_availability_query($publication, '2026-09-21', '2026-09-20', 2, $now);
assert_true($invalid['ok'] === false && $invalid['code'] === 'invalid_date_range', 'reversed range must be rejected');

$intentNow = new DateTimeImmutable('2026-09-13T12:00:00+03:00');
$rangeIntent = ya_public_room_availability_extract_intent('20-22 Eylül 2 kişilik oda müsait mi?', $intentNow);
assert_true(($rangeIntent['complete'] ?? false) === true, 'Turkish month range should resolve');
assert_true(($rangeIntent['start_date'] ?? '') === '2026-09-20', 'range start should resolve');
assert_true(($rangeIntent['end_date'] ?? '') === '2026-09-22', 'range end should resolve');
assert_true(($rangeIntent['guest_count'] ?? 0) === 2, 'guest count should resolve');

$relativeIntent = ya_public_room_availability_extract_intent('Yarın 3 kişi için boş oda var mı?', $intentNow);
assert_true(($relativeIntent['start_date'] ?? '') === '2026-09-14', 'tomorrow should resolve in Istanbul time');
assert_true(($relativeIntent['end_date'] ?? '') === '2026-09-15', 'single-night relative query should resolve checkout');

$tableIntent = ya_public_room_availability_extract_intent('Bu akşam 4 kişilik masa var mı?', $intentNow);
assert_true(($tableIntent['applicable'] ?? true) === false, 'restaurant/table question must not enter room availability');

$incompleteIntent = ya_public_room_availability_extract_intent('20 Eylül oda var mı?', $intentNow);
assert_true(($incompleteIntent['applicable'] ?? false) === true, 'room availability intent should be recognized');
assert_true(($incompleteIntent['complete'] ?? true) === false, 'missing guest count should remain incomplete');
assert_true(in_array('guest_count', $incompleteIntent['missing'] ?? [], true), 'guest count should be requested instead of assumed');

$answer = ya_public_room_availability_answer($blocked);
assert_true(str_contains($answer, 'canlı kayıttan'), 'live answer should identify live-record source');
assert_true(str_contains($answer, 'rezervasyon oluşturulmadı'), 'read-only answer must state that no reservation was created');

fwrite(STDOUT, "public-room-availability-smoke-ok\n");
