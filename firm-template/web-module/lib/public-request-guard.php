<?php
declare(strict_types=1);

const YA_PUBLIC_GUARD_MAX_BODY_BYTES = 65536;
const YA_PUBLIC_GUARD_RETENTION_SECONDS = 86400;
const YA_PUBLIC_ORDER_MAX_BODY_BYTES = 16384;

/**
 * Applies a lightweight, privacy-preserving abuse guard to public endpoints.
 *
 * The guard stores only an HMAC-SHA256 digest derived from REMOTE_ADDR, never
 * the raw client IP. It is intentionally independent from cookies and
 * JavaScript so it also protects direct endpoint calls.
 *
 * Storage failures fail open: the business must not lose legitimate requests
 * because a defensive counter could not be written. Normal endpoint storage
 * still performs its own error handling afterwards.
 */
function ya_public_guard_enforce(string $bucket): void
{
    if ($bucket === 'order') {
        ya_public_guard_apply_cors();
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            header('Allow: POST');
            ya_public_guard_reject(405, 'Sipariş göndermek için POST isteği gerekli.', 0, 'method_not_allowed');
        }
        if (strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0])) !== 'application/json') {
            ya_public_guard_reject(415, 'Sipariş bilgileri JSON biçiminde gönderilmeli.', 0, 'unsupported_content_type');
        }
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > YA_PUBLIC_ORDER_MAX_BODY_BYTES) {
            ya_public_guard_reject(413, 'Gönderilen sipariş verisi çok büyük.', 0);
        }
    }
    if (PHP_SAPI === 'cli') {
        return;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        return;
    }

    ya_public_guard_apply_cors();

    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > YA_PUBLIC_GUARD_MAX_BODY_BYTES) {
        ya_public_guard_reject(413, 'Gönderilen veri çok büyük. Lütfen daha kısa bir içerikle tekrar deneyin.', 0);
    }

    $policy = ya_public_guard_policy($bucket);
    if ($policy === null) {
        return;
    }

    try {
        $database = ya_public_guard_open_database();
        if (!$database instanceof PDO) {
            return;
        }

        $now = time();
        $subjectHash = ya_public_guard_subject_hash();
        $database->exec('BEGIN IMMEDIATE');
        try {
            $prune = $database->prepare(
                'DELETE FROM public_request_guard_events WHERE created_at < :cutoff'
            );
            $prune->execute([':cutoff' => $now - YA_PUBLIC_GUARD_RETENTION_SECONDS]);

            foreach ($policy['subject_windows'] as $window) {
                $count = ya_public_guard_count(
                    $database,
                    $bucket,
                    $subjectHash,
                    $now - $window['seconds'],
                    true
                );
                if ($count >= $window['limit']) {
                    $database->exec('ROLLBACK');
                    ya_public_guard_reject(
                        429,
                        'Çok kısa sürede fazla istek alındı. Lütfen biraz sonra tekrar deneyin.',
                        $window['retry_after']
                    );
                }
            }

            foreach ($policy['global_windows'] as $window) {
                $count = ya_public_guard_count(
                    $database,
                    $bucket,
                    '',
                    $now - $window['seconds'],
                    false
                );
                if ($count >= $window['limit']) {
                    $database->exec('ROLLBACK');
                    ya_public_guard_reject(
                        429,
                        'İşletmenin çevrimiçi hizmeti şu anda yoğun. Lütfen biraz sonra tekrar deneyin.',
                        $window['retry_after']
                    );
                }
            }

            $insert = $database->prepare(
                'INSERT INTO public_request_guard_events (bucket, subject_hash, created_at) VALUES (:bucket, :subject_hash, :created_at)'
            );
            $insert->execute([
                ':bucket' => $bucket,
                ':subject_hash' => $subjectHash,
                ':created_at' => $now
            ]);
            $database->exec('COMMIT');
        } catch (Throwable $error) {
            if ($database->inTransaction()) {
                $database->exec('ROLLBACK');
            }
            throw $error;
        }
    } catch (Throwable) {
        // Defensive throttling must not become a single point of failure.
        return;
    }
}

function ya_public_guard_policy(string $bucket): ?array
{
    if ($bucket === 'chat') {
        return [
            'subject_windows' => [
                ['seconds' => 60, 'limit' => 12, 'retry_after' => 60],
                ['seconds' => 3600, 'limit' => 60, 'retry_after' => 300],
                ['seconds' => 86400, 'limit' => 150, 'retry_after' => 900]
            ],
            'global_windows' => [
                ['seconds' => 3600, 'limit' => 300, 'retry_after' => 120],
                ['seconds' => 86400, 'limit' => 1500, 'retry_after' => 900]
            ]
        ];
    }

    if ($bucket === 'request' || $bucket === 'order') {
        return [
            'subject_windows' => [
                ['seconds' => 600, 'limit' => 8, 'retry_after' => 120],
                ['seconds' => 86400, 'limit' => 60, 'retry_after' => 900]
            ],
            'global_windows' => [
                ['seconds' => 3600, 'limit' => 500, 'retry_after' => 120],
                ['seconds' => 86400, 'limit' => 2000, 'retry_after' => 900]
            ]
        ];
    }

    return null;
}

function ya_public_guard_open_database(): ?PDO
{
    if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        return null;
    }

    $dataDirectory = dirname(__DIR__) . '/data';
    if (!is_dir($dataDirectory)
        && !mkdir($dataDirectory, 0775, true)
        && !is_dir($dataDirectory)) {
        return null;
    }

    $databasePath = $dataDirectory . '/yardimci-asistan.sqlite';
    $database = new PDO('sqlite:' . $databasePath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
    $database->exec('PRAGMA busy_timeout = 1500');
    $database->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS public_request_guard_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bucket TEXT NOT NULL,
          subject_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
    SQL);
    $database->exec(
        'CREATE INDEX IF NOT EXISTS idx_public_request_guard_lookup ON public_request_guard_events(bucket, subject_hash, created_at)'
    );
    $database->exec(
        'CREATE INDEX IF NOT EXISTS idx_public_request_guard_global ON public_request_guard_events(bucket, created_at)'
    );
    if (is_file($databasePath)) {
        @chmod($databasePath, 0600);
    }
    return $database;
}

function ya_public_guard_count(
    PDO $database,
    string $bucket,
    string $subjectHash,
    int $since,
    bool $subjectScoped
): int {
    if ($subjectScoped) {
        $statement = $database->prepare(<<<'SQL'
            SELECT COUNT(*)
            FROM public_request_guard_events
            WHERE bucket = :bucket AND subject_hash = :subject_hash AND created_at >= :since
        SQL);
        $statement->execute([
            ':bucket' => $bucket,
            ':subject_hash' => $subjectHash,
            ':since' => $since
        ]);
        return (int) $statement->fetchColumn();
    }

    $statement = $database->prepare(<<<'SQL'
        SELECT COUNT(*)
        FROM public_request_guard_events
        WHERE bucket = :bucket AND created_at >= :since
    SQL);
    $statement->execute([
        ':bucket' => $bucket,
        ':since' => $since
    ]);
    return (int) $statement->fetchColumn();
}

function ya_public_guard_subject_hash(): string
{
    $remoteAddress = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $businessConfig = ya_public_guard_business_config();
    $key = trim((string) ($businessConfig['sync_secret'] ?? ''));
    if ($key === '') {
        $key = hash('sha256', dirname(__DIR__));
    }
    return hash_hmac('sha256', $remoteAddress, $key);
}

function ya_public_guard_business_config(): array
{
    static $businessConfig = null;
    if (is_array($businessConfig)) {
        return $businessConfig;
    }

    $configPath = dirname(__DIR__) . '/config/business.json';
    if (!is_file($configPath)) {
        $businessConfig = [];
        return $businessConfig;
    }

    $decoded = json_decode((string) file_get_contents($configPath), true);
    $businessConfig = is_array($decoded) ? $decoded : [];
    return $businessConfig;
}

function ya_public_guard_apply_cors(): void
{
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin === '') {
        return;
    }

    $businessConfig = ya_public_guard_business_config();
    $allowedOrigins = $businessConfig['allowed_origins'] ?? [];
    if (!is_array($allowedOrigins)) {
        return;
    }

    $allowAny = in_array('*', $allowedOrigins, true);
    if (!$allowAny && !in_array($origin, $allowedOrigins, true)) {
        return;
    }

    header('Access-Control-Allow-Origin: ' . ($allowAny ? '*' : $origin));
    header('Vary: Origin');
}

function ya_public_guard_reject(int $status, string $message, int $retryAfter, ?string $code = null): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if ($retryAfter > 0) {
        header('Retry-After: ' . $retryAfter);
    }
    echo json_encode([
        'ok' => false,
        'message' => $message,
        'code' => $code ?? ($status === 429 ? 'rate_limited' : 'payload_too_large'),
        'retry_after_seconds' => $retryAfter > 0 ? $retryAfter : null
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
