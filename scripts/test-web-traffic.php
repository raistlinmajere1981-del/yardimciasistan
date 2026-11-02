<?php
declare(strict_types=1);

require_once __DIR__ . '/../firm-template/web-module/lib/traffic.php';

$failures = 0;
function check(bool $condition, string $label): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        fwrite(STDERR, "FAIL: $label\n");
    }
}

$file = sys_get_temp_dir() . '/ya-traffic-test-' . bin2hex(random_bytes(4)) . '.sqlite';
$database = new PDO('sqlite:' . $file, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
]);
ya_traffic_ensure_schema($database);

check(ya_traffic_enabled([]) === true, 'collection defaults on');
check(ya_traffic_enabled(['traffic_enabled' => false]) === false, 'explicit false disables');
check(ya_traffic_enabled(['traffic_enabled' => '0']) === false, 'string zero disables');
check(ya_traffic_source('social') === 'social', 'source allowlist');
check(ya_traffic_source('arbitrary') === 'direct', 'unknown source is direct');
check(ya_traffic_page('catalog', 'product_1') === 'catalog:product_1', 'catalog item page');
check(ya_traffic_page('account') === null, 'account page rejected');
check(ya_traffic_page('home', '../secret') === null, 'path-like item rejected');
check(ya_traffic_is_bot('Mozilla Googlebot/2.1') === true, 'known bot rejected');
check(ya_traffic_is_bot('Mozilla/5.0 Firefox/140') === false, 'normal browser accepted');
check(ya_traffic_origin_allowed([], 'https://shop.example', 'shop.example', 'same-origin') === true, 'same-origin accepted');
check(ya_traffic_origin_allowed([], 'https://evil.example', 'shop.example', 'same-origin') === false, 'foreign origin rejected');
check(ya_traffic_origin_allowed([], '', 'shop.example', 'cross-site') === false, 'cross-site fetch rejected');
check(ya_traffic_origin_allowed(['allowed_origins' => ['https://preview.example']], 'https://preview.example', 'shop.example', 'same-site') === true, 'configured origin accepted');

$valid = ya_traffic_validate_event(['event' => 'view', 'page' => 'home', 'src' => 'search', 'session' => 'session_12345', 'id' => 'event_12345678']);
check(($valid['ok'] ?? false) === true && ($valid['source'] ?? '') === 'search', 'valid event');
check((ya_traffic_validate_event(['event' => 'order_created', 'page' => 'home', 'session' => 'session_12345', 'id' => 'event_12345678'])['ok'] ?? true) === false, 'arbitrary event rejected');
check((ya_traffic_validate_event(['event' => 'view', 'page' => '../admin', 'session' => 'session_12345', 'id' => 'event_12345678'])['ok'] ?? true) === false, 'path page rejected');
check((ya_traffic_validate_event(['event' => 'view', 'page' => 'home', 'session' => 'x', 'id' => 'event_12345678'])['ok'] ?? true) === false, 'short session rejected');

$now = new DateTimeImmutable('2026-11-02T10:00:00Z', new DateTimeZone('UTC'));
$view = static fn (string $session, string $id, string $page, string $src): array => [
    'event' => 'view', 'page' => $page, 'source' => $src, 'session' => $session, 'id' => $id
];

$first = ya_traffic_record($database, $view('session_alpha', 'event_alpha1', 'home', 'direct'), $now, 'Europe/Istanbul');
check(($first['accepted'] ?? false) === true, 'first view accepted');
$replay = ya_traffic_record($database, $view('session_alpha', 'event_alpha1', 'home', 'direct'), $now->modify('+1 minute'), 'Europe/Istanbul');
check(($replay['deduplicated'] ?? false) === true, 'retry is idempotent');
check(ya_traffic_record($database, $view('session_bravo', 'event_bravo1', 'about', 'search'), $now->modify('+5 minutes'), 'Europe/Istanbul')['accepted'] === true, 'second session accepted');
check(ya_traffic_record($database, [
    'event' => 'intent_contact', 'page' => 'contact', 'source' => 'search',
    'session' => 'session_bravo', 'id' => 'event_bravo2'
], $now->modify('+6 minutes'), 'Europe/Istanbul')['accepted'] === true, 'contact intent accepted');

// Canonical conversion rows: only desktop-acknowledged records inside the window.
$database->exec(<<<'SQL'
    CREATE TABLE web_requests (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE web_orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT '');
SQL);
$insertRequest = $database->prepare('INSERT INTO web_requests (id, status, created_at, imported_at) VALUES (?, ?, ?, ?)');
$insertRequest->execute(['request_confirmed', 'seen', '2026-11-02T01:30:00+03:00', '2026-11-02T01:35:00+00:00']);
$insertRequest->execute(['request_pending', 'new', '2026-11-02T02:00:00+00:00', '']);
$insertRequest->execute(['request_rejected', 'rejected', '2026-11-02T03:00:00+00:00', '2026-11-02T03:05:00+00:00']);
$insertRequest->execute(['request_old', 'seen', '2026-09-01T00:00:00+00:00', '2026-09-01T00:05:00+00:00']);
$insertOrder = $database->prepare('INSERT INTO web_orders (id, created_at, imported_at) VALUES (?, ?, ?)');
$insertOrder->execute(['order_confirmed', '2026-11-02T04:00:00+00:00', '2026-11-02T04:05:00+00:00']);
$insertOrder->execute(['order_pending', '2026-11-02T05:00:00+00:00', '']);

$snapshot = ya_traffic_snapshot($database, 7, 'Europe/Istanbul', $now);
check($snapshot['has_data'] === true, 'snapshot reports observed data');
check(($snapshot['conversions']['requests'] ?? null) === 1, 'only imported non-rejected requests convert');
check(($snapshot['conversions']['orders'] ?? null) === 1, 'only imported web orders convert');
check($snapshot['sessions'] === 2, 'unique daily sessions');
check($snapshot['views'] === 2, 'replayed view counted once');
check($snapshot['intents'] === 1, 'intent total');
check($snapshot['top_pages'][0]['page'] === 'about' || in_array('about', array_column($snapshot['top_pages'], 'page'), true), 'top pages include observed page');
check($snapshot['sources'][0]['source'] === 'search' && $snapshot['sources'][0]['sessions'] === 1, 'grouped source sessions');
check($snapshot['daily'][count($snapshot['daily']) - 1]['date'] === '2026-11-02', 'business-timezone day bucket');
check($snapshot['last_collected_at'] !== '', 'last collection timestamp exposed');
check(($snapshot['conversions']['requests'] ?? -1) === 1, 'only imported, non-rejected requests in window count once');
check(($snapshot['conversions']['orders'] ?? -1) === 1, 'only imported orders in window count once');
$thirty = ya_traffic_snapshot($database, 30, 'Europe/Istanbul', $now);
check(($thirty['conversions']['requests'] ?? -1) === 1 && ($thirty['conversions']['orders'] ?? -1) === 1, '30 day conversions exclude old rows');

$empty = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
ya_traffic_ensure_schema($empty);
$emptySnapshot = ya_traffic_snapshot($empty, 7, 'Europe/Istanbul', $now);
check($emptySnapshot['has_data'] === false && $emptySnapshot['last_collected_at'] === '', 'no data is explicit');
check($emptySnapshot['conversions'] === null, 'missing conversion tables are explicit');
try {
    ya_traffic_snapshot($empty, 14, 'Europe/Istanbul', $now);
    check(false, 'invalid period rejected');
} catch (InvalidArgumentException $error) {
    check($error->getMessage() === 'invalid_traffic_period', 'invalid period rejected');
}

check(ya_traffic_day(new DateTimeImmutable('2026-11-01T21:30:00Z'), 'Europe/Istanbul') === '2026-11-02', 'UTC to business day boundary');
check(ya_traffic_day(new DateTimeImmutable('2026-11-02T10:00:00Z'), 'Invalid/Zone') === '2026-11-02', 'invalid timezone falls back safely');

$database->exec("INSERT INTO traffic_daily (day, views, intents, created_at, updated_at) VALUES ('2025-01-01', 9, 9, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')");
$database->exec("INSERT INTO traffic_events (event_key, created_at) VALUES ('old_event', '2026-10-01T00:00:00Z')");
ya_traffic_prune($database, $now, 'Europe/Istanbul');
check((int) $database->query("SELECT COUNT(*) FROM traffic_daily WHERE day = '2025-01-01'")->fetchColumn() === 0, 'daily retention prunes older than 90 days');
check((int) $database->query("SELECT COUNT(*) FROM traffic_events WHERE event_key = 'old_event'")->fetchColumn() === 0, 'dedupe retention prunes after 48 hours');
check((int) $database->query("SELECT COUNT(*) FROM traffic_daily WHERE day = '2026-11-02'")->fetchColumn() === 1, 'recent aggregates retained');

$database = null;
@unlink($file);
@unlink($file . '-wal');
@unlink($file . '-shm');
if ($failures > 0) {
    fwrite(STDERR, "$failures traffic assertion(s) failed\n");
    exit(1);
}
echo "traffic-php-tests-ok\n";
