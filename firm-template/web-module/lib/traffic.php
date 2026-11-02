<?php
declare(strict_types=1);

/**
 * Anonymous, aggregate-only site traffic.
 *
 * Only canonical page names, coarse source classes and event counters are
 * persisted. The endpoint never stores IP addresses, user agents, referrer
 * URLs, e-mail addresses, phone numbers or raw session tokens.
 */
const YA_TRAFFIC_PAGES = ['home', 'about', 'rooms', 'restaurant', 'menu', 'catalog', 'gallery', 'announcements', 'reviews', 'contact'];
const YA_TRAFFIC_EVENTS = ['view', 'intent_contact', 'intent_call', 'intent_route'];
const YA_TRAFFIC_SOURCES = ['search', 'social', 'referral', 'direct'];
const YA_TRAFFIC_MAX_BODY_BYTES = 512;
const YA_TRAFFIC_DEDUP_SECONDS = 172800;
const YA_TRAFFIC_RETENTION_DAYS = 90;
const YA_TRAFFIC_MAX_EVENTS_PER_SESSION_DAY = 400;

/** Published business context owns the operator switch; config is the fallback. */
function ya_traffic_effective_config(array $config): array
{
    try {
        $publication = ya_storage_get_publication('business_context', []);
        if (is_array($publication) && array_key_exists('traffic_enabled', $publication)) {
            $config['traffic_enabled'] = $publication['traffic_enabled'];
        }
    } catch (Throwable) {
        // An unavailable publication must not turn a working site into an error.
    }
    return $config;
}

/** Staging defaults to collection on; an explicit false disables the endpoint. */
function ya_traffic_enabled(array $config): bool
{
    if (!array_key_exists('traffic_enabled', $config)) {
        return true;
    }
    $value = $config['traffic_enabled'];
    if (is_bool($value)) {
        return $value;
    }
    if (is_int($value) || is_float($value)) {
        return $value !== 0;
    }
    if (is_string($value)) {
        return !in_array(strtolower(trim($value)), ['', '0', 'false', 'off', 'no', 'disabled'], true);
    }
    return (bool) $value;
}

function ya_traffic_timezone(array $config): string
{
    $timezone = trim((string) ($config['timezone'] ?? ''));
    if ($timezone === '' || !in_array($timezone, timezone_identifiers_list(), true)) {
        return 'Europe/Istanbul';
    }
    return $timezone;
}

/** Coarse referrer class only; unknown/missing never claims a real source. */
function ya_traffic_source(mixed $value): string
{
    $source = is_string($value) ? strtolower(trim($value)) : '';
    return in_array($source, YA_TRAFFIC_SOURCES, true) ? $source : 'direct';
}

/** Canonical page + optional published catalog id. Never accepts a path or query. */
function ya_traffic_page(mixed $page, mixed $item = ''): ?string
{
    $page = is_string($page) ? strtolower(trim($page)) : '';
    if (!in_array($page, YA_TRAFFIC_PAGES, true)) {
        return null;
    }
    $item = is_string($item) ? trim($item) : '';
    if ($item === '') {
        return $page;
    }
    if (preg_match('/^[A-Za-z0-9._:-]{1,80}$/D', $item) !== 1) {
        return null;
    }
    return $page . ':' . $item;
}

function ya_traffic_is_bot(string $userAgent): bool
{
    if ($userAgent === '') {
        return false;
    }
    return preg_match('/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|phantomjs|python-requests|curl\/|wget\//i', $userAgent) === 1;
}

/**
 * Same-origin (or explicitly allowed origin) browser writes only.
 * Fetch Metadata is checked when the browser sends it.
 */
function ya_traffic_origin_allowed(array $config, string $origin, string $host, string $fetchSite): bool
{
    $fetchSite = strtolower(trim($fetchSite));
    if ($fetchSite === 'cross-site') {
        return false;
    }
    $origin = strtolower(rtrim(trim($origin), '/'));
    if ($origin === '') {
        return true;
    }
    $allowed = is_array($config['allowed_origins'] ?? null) ? $config['allowed_origins'] : [];
    if (in_array('*', $allowed, true)) {
        return true;
    }
    foreach ($allowed as $candidate) {
        if (is_string($candidate) && strtolower(rtrim(trim($candidate), '/')) === $origin) {
            return true;
        }
    }
    $originHost = parse_url($origin, PHP_URL_HOST);
    if (!is_string($originHost) || $originHost === '') {
        return false;
    }
    $requestHost = strtolower(trim($host));
    if (str_starts_with($requestHost, '[')) {
        $requestHost = (string) preg_replace('/^\[([^\]]+)\](?::\d+)?$/D', '$1', $requestHost);
    } else {
        $requestHost = (string) preg_replace('/:\d+$/D', '', $requestHost);
    }
    return strtolower($originHost) === $requestHost;
}

function ya_traffic_validate_event(array $payload): array
{
    $event = is_string($payload['event'] ?? null) ? strtolower(trim($payload['event'])) : '';
    $page = ya_traffic_page($payload['page'] ?? null, $payload['item'] ?? '');
    $session = is_string($payload['session'] ?? null) ? trim($payload['session']) : '';
    $id = is_string($payload['id'] ?? null) ? trim($payload['id']) : '';
    if (!in_array($event, YA_TRAFFIC_EVENTS, true)
        || $page === null
        || preg_match('/^[A-Za-z0-9_-]{8,120}$/D', $session) !== 1
        || preg_match('/^[A-Za-z0-9_-]{8,120}$/D', $id) !== 1) {
        return ['ok' => false, 'code' => 'invalid_event'];
    }
    return [
        'ok' => true,
        'event' => $event,
        'page' => $page,
        'source' => ya_traffic_source($payload['src'] ?? 'direct'),
        'session' => $session,
        'id' => $id
    ];
}

function ya_traffic_ensure_schema(PDO $database): void
{
    $database->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS sync_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS traffic_daily (
          day TEXT PRIMARY KEY,
          views INTEGER NOT NULL DEFAULT 0,
          intents INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS traffic_pages (
          day TEXT NOT NULL,
          page TEXT NOT NULL,
          views INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (day, page)
        );
        CREATE TABLE IF NOT EXISTS traffic_sources (
          day TEXT NOT NULL,
          source TEXT NOT NULL,
          sessions INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (day, source)
        );
        CREATE TABLE IF NOT EXISTS traffic_sessions (
          day TEXT NOT NULL,
          session_hash TEXT NOT NULL,
          source TEXT NOT NULL,
          event_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (day, session_hash)
        );
        CREATE INDEX IF NOT EXISTS traffic_sessions_day_source ON traffic_sessions(day, source);
        CREATE TABLE IF NOT EXISTS traffic_events (
          event_key TEXT PRIMARY KEY,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS traffic_events_created_at ON traffic_events(created_at);
    SQL);
}

function ya_traffic_session_salt(PDO $database): string
{
    $database->exec("INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('traffic_session_salt', '')");
    $statement = $database->prepare("SELECT value FROM sync_meta WHERE key = 'traffic_session_salt'");
    $statement->execute();
    $salt = (string) ($statement->fetchColumn() ?: '');
    if ($salt === '') {
        $salt = bin2hex(random_bytes(32));
        $database->prepare("UPDATE sync_meta SET value = :value WHERE key = 'traffic_session_salt'")
            ->execute([':value' => $salt]);
    }
    return $salt;
}

function ya_traffic_session_hash(PDO $database, string $session): string
{
    return hash_hmac('sha256', $session, ya_traffic_session_salt($database));
}

function ya_traffic_day(DateTimeImmutable $now, string $timezone): string
{
    try {
        $zone = new DateTimeZone($timezone);
    } catch (Throwable $error) {
        $zone = new DateTimeZone('Europe/Istanbul');
    }
    return $now->setTimezone($zone)->format('Y-m-d');
}

/**
 * Idempotent write. The dedupe row and aggregate updates share one IMMEDIATE
 * transaction so a retried browser beacon can never double-count.
 */
function ya_traffic_record(PDO $database, array $event, ?DateTimeImmutable $now = null, string $timezone = 'Europe/Istanbul'): array
{
    ya_traffic_ensure_schema($database);
    $now = $now ?? new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $utc = $now->setTimezone(new DateTimeZone('UTC'));
    $stamp = $utc->format('Y-m-d\TH:i:s\Z');
    $day = ya_traffic_day($now, $timezone);
    $sessionHash = ya_traffic_session_hash($database, (string) $event['session']);
    $eventKey = hash('sha256', $day . '|' . $sessionHash . '|' . (string) $event['id']);
    $source = ya_traffic_source($event['source'] ?? 'direct');

    $database->exec('BEGIN IMMEDIATE');
    try {
        $dedupe = $database->prepare('INSERT INTO traffic_events (event_key, created_at) VALUES (:key, :created_at) ON CONFLICT(event_key) DO NOTHING');
        $dedupe->execute([':key' => $eventKey, ':created_at' => $stamp]);
        if ($dedupe->rowCount() === 0) {
            $database->exec('COMMIT');
            return ['ok' => true, 'accepted' => false, 'deduplicated' => true];
        }

        $session = $database->prepare('SELECT event_count FROM traffic_sessions WHERE day = :day AND session_hash = :hash');
        $session->execute([':day' => $day, ':hash' => $sessionHash]);
        $existingCount = $session->fetchColumn();
        if ($existingCount !== false && (int) $existingCount >= YA_TRAFFIC_MAX_EVENTS_PER_SESSION_DAY) {
            $database->exec('ROLLBACK');
            return ['ok' => false, 'code' => 'rate_limited', 'status' => 429];
        }
        $newSession = $existingCount === false;

        $database->prepare(<<<'SQL'
            INSERT INTO traffic_sessions (day, session_hash, source, event_count, created_at, updated_at)
            VALUES (:day, :hash, :source, 1, :created_at, :updated_at)
            ON CONFLICT(day, session_hash) DO UPDATE SET
              event_count = traffic_sessions.event_count + 1,
              updated_at = excluded.updated_at
        SQL)->execute([
            ':day' => $day, ':hash' => $sessionHash, ':source' => $source,
            ':created_at' => $stamp, ':updated_at' => $stamp
        ]);

        $daily = $database->prepare(<<<'SQL'
            INSERT INTO traffic_daily (day, views, intents, created_at, updated_at)
            VALUES (:day, :views, :intents, :created_at, :updated_at)
            ON CONFLICT(day) DO UPDATE SET
              views = traffic_daily.views + excluded.views,
              intents = traffic_daily.intents + excluded.intents,
              updated_at = excluded.updated_at
        SQL);
        $isView = ($event['event'] ?? '') === 'view';
        $daily->execute([
            ':day' => $day,
            ':views' => $isView ? 1 : 0,
            ':intents' => $isView ? 0 : 1,
            ':created_at' => $stamp,
            ':updated_at' => $stamp
        ]);

        if ($isView) {
            $database->prepare(<<<'SQL'
                INSERT INTO traffic_pages (day, page, views) VALUES (:day, :page, 1)
                ON CONFLICT(day, page) DO UPDATE SET views = traffic_pages.views + 1
            SQL)->execute([':day' => $day, ':page' => (string) $event['page']]);
        }
        if ($newSession) {
            $database->prepare(<<<'SQL'
                INSERT INTO traffic_sources (day, source, sessions) VALUES (:day, :source, 1)
                ON CONFLICT(day, source) DO UPDATE SET sessions = traffic_sources.sessions + 1
            SQL)->execute([':day' => $day, ':source' => $source]);
        }

        ya_traffic_prune($database, $now, $timezone);
        $database->exec('COMMIT');
        return ['ok' => true, 'accepted' => true, 'deduplicated' => false];
    } catch (Throwable $error) {
        if ($database->inTransaction()) {
            $database->rollBack();
        } else {
            $database->exec('ROLLBACK');
        }
        throw $error;
    }
}

function ya_traffic_prune(PDO $database, ?DateTimeImmutable $now = null, string $timezone = 'Europe/Istanbul'): void
{
    $now = $now ?? new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $dedupeCutoff = $now->setTimezone(new DateTimeZone('UTC'))
        ->sub(new DateInterval('PT' . YA_TRAFFIC_DEDUP_SECONDS . 'S'))->format('Y-m-d\TH:i:s\Z');
    $dayCutoff = ya_traffic_day($now->sub(new DateInterval('P' . YA_TRAFFIC_RETENTION_DAYS . 'D')), $timezone);

    $database->prepare('DELETE FROM traffic_events WHERE created_at < :cutoff')->execute([':cutoff' => $dedupeCutoff]);
    foreach (['traffic_daily', 'traffic_pages', 'traffic_sources', 'traffic_sessions'] as $table) {
        $database->prepare('DELETE FROM ' . $table . ' WHERE day < :cutoff')->execute([':cutoff' => $dayCutoff]);
    }
}

/**
 * Desktop-confirmed web conversions only: rows acknowledged by the canonical
 * desktop sync. Client clicks are never converted into requests/orders here.
 */
function ya_traffic_confirmed_conversions(PDO $database, string $startUtc, string $endUtc): ?array
{
    try {
        $tables = $database->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('web_requests', 'web_orders')")
            ->fetchAll(PDO::FETCH_COLUMN);
    } catch (Throwable) {
        return null;
    }
    if (!is_array($tables) || count(array_unique($tables)) < 2) {
        return null;
    }
    $request = $database->prepare(<<<'SQL'
        SELECT COUNT(*) FROM web_requests
        WHERE imported_at <> ''
          AND status NOT IN ('rejected', 'cancelled', 'archived')
          AND datetime(created_at) >= datetime(:start)
          AND datetime(created_at) < datetime(:end)
    SQL);
    $request->execute([':start' => $startUtc, ':end' => $endUtc]);
    $order = $database->prepare(<<<'SQL'
        SELECT COUNT(*) FROM web_orders
        WHERE imported_at <> ''
          AND datetime(created_at) >= datetime(:start)
          AND datetime(created_at) < datetime(:end)
    SQL);
    $order->execute([':start' => $startUtc, ':end' => $endUtc]);
    return ['requests' => (int) $request->fetchColumn(), 'orders' => (int) $order->fetchColumn()];
}

/** Read-only aggregate report. Missing observation is explicit, never zero-filled as fact. */
function ya_traffic_snapshot(PDO $database, int $days, string $timezone = 'Europe/Istanbul', ?DateTimeImmutable $now = null): array
{
    if (!in_array($days, [7, 30], true)) {
        throw new InvalidArgumentException('invalid_traffic_period');
    }
    ya_traffic_ensure_schema($database);
    $now = $now ?? new DateTimeImmutable('now', new DateTimeZone('UTC'));
    try {
        $zone = new DateTimeZone($timezone);
    } catch (Throwable $error) {
        $zone = new DateTimeZone('Europe/Istanbul');
    }
    $today = $now->setTimezone($zone)->setTime(0, 0);
    $start = $today->sub(new DateInterval('P' . ($days - 1) . 'D'))->format('Y-m-d');
    $end = $today->format('Y-m-d');
    $utc = new DateTimeZone('UTC');
    $startUtc = $today->sub(new DateInterval('P' . ($days - 1) . 'D'))->setTimezone($utc)->format('Y-m-d H:i:s');
    $endUtc = $today->add(new DateInterval('P1D'))->setTimezone($utc)->format('Y-m-d H:i:s');

    $dailyStatement = $database->prepare('SELECT day, views, intents FROM traffic_daily WHERE day BETWEEN :start AND :end');
    $dailyStatement->execute([':start' => $start, ':end' => $end]);
    $observed = [];
    $views = 0;
    $intents = 0;
    foreach ($dailyStatement->fetchAll() as $row) {
        $observed[(string) $row['day']] = ['views' => (int) $row['views'], 'intents' => (int) $row['intents']];
        $views += (int) $row['views'];
        $intents += (int) $row['intents'];
    }

    $sessionsStatement = $database->prepare('SELECT COUNT(*) FROM traffic_sessions WHERE day BETWEEN :start AND :end');
    $sessionsStatement->execute([':start' => $start, ':end' => $end]);
    $sessions = (int) $sessionsStatement->fetchColumn();

    $daily = [];
    for ($offset = 0; $offset < $days; $offset++) {
        $day = $today->sub(new DateInterval('P' . ($days - 1 - $offset) . 'D'))->format('Y-m-d');
        $daily[] = [
            'date' => $day,
            'observed' => isset($observed[$day]),
            'sessions' => 0,
            'views' => $observed[$day]['views'] ?? 0,
            'intents' => $observed[$day]['intents'] ?? 0
        ];
    }
    $sessionByDay = $database->prepare('SELECT day, COUNT(*) AS sessions FROM traffic_sessions WHERE day BETWEEN :start AND :end GROUP BY day');
    $sessionByDay->execute([':start' => $start, ':end' => $end]);
    $dailySessions = [];
    foreach ($sessionByDay->fetchAll() as $row) {
        $dailySessions[(string) $row['day']] = (int) $row['sessions'];
    }
    foreach ($daily as &$entry) {
        $entry['sessions'] = $dailySessions[$entry['date']] ?? 0;
    }
    unset($entry);

    $sourcesStatement = $database->prepare('SELECT source, SUM(sessions) AS sessions FROM traffic_sources WHERE day BETWEEN :start AND :end GROUP BY source');
    $sourcesStatement->execute([':start' => $start, ':end' => $end]);
    $sourceCounts = [];
    foreach ($sourcesStatement->fetchAll() as $row) {
        $source = ya_traffic_source($row['source'] ?? 'direct');
        $sourceCounts[$source] = ($sourceCounts[$source] ?? 0) + (int) $row['sessions'];
    }
    $sources = [];
    foreach (YA_TRAFFIC_SOURCES as $source) {
        $sources[] = ['source' => $source, 'sessions' => $sourceCounts[$source] ?? 0];
    }

    $pagesStatement = $database->prepare(<<<'SQL'
        SELECT page, SUM(views) AS views FROM traffic_pages
        WHERE day BETWEEN :start AND :end
        GROUP BY page ORDER BY views DESC, page ASC LIMIT 10
    SQL);
    $pagesStatement->execute([':start' => $start, ':end' => $end]);
    $topPages = array_map(static fn (array $row): array => [
        'page' => (string) $row['page'],
        'views' => (int) $row['views']
    ], $pagesStatement->fetchAll());

    $lastStatement = $database->query('SELECT MAX(updated_at) FROM traffic_daily');
    $lastCollected = (string) ($lastStatement->fetchColumn() ?: '');
    $hasData = $sessions > 0 || $views > 0 || $intents > 0 || $lastCollected !== '';

    return [
        'days' => $days,
        'has_data' => $hasData,
        'sessions' => $sessions,
        'views' => $views,
        'intents' => $intents,
        'daily' => $daily,
        'top_pages' => $topPages,
        'sources' => $sources,
        'conversions' => ya_traffic_confirmed_conversions($database, $startUtc, $endUtc),
        'last_collected_at' => $lastCollected
    ];
}
