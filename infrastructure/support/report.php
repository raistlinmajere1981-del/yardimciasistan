<?php
declare(strict_types=1);

const YA_SUPPORT_FORMAT = 'yardimci-asistan-support-report';
const YA_SUPPORT_VERSION = 1;
const YA_SUPPORT_MAX_COMPRESSED_BYTES = 20 * 1024 * 1024;
const YA_SUPPORT_MAX_DECODED_BYTES = 36 * 1024 * 1024;
const YA_SUPPORT_MAX_SCREENSHOT_BYTES = 12 * 1024 * 1024;
const YA_SUPPORT_MAX_NOTE_BYTES = 2000;
const YA_SUPPORT_MAX_SESSIONS = 3;
const YA_SUPPORT_MAX_EVENTS = 120000;
const YA_SUPPORT_HOURLY_LIMIT = 10;
const YA_SUPPORT_DAILY_LIMIT = 30;
const YA_SUPPORT_MIN_FREE_BYTES = 512 * 1024 * 1024;

function ya_support_json(int $status, array $payload): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ya_support_storage_root(): string {
    $configured = trim((string) getenv('YARDIMCI_ASISTAN_SUPPORT_DIR'));
    if ($configured !== '') {
        return rtrim($configured, DIRECTORY_SEPARATOR);
    }
    return '/home/yardimciasistan/support-reports';
}

function ya_support_ensure_dir(string $path): void {
    if (is_dir($path)) return;
    if (!mkdir($path, 0700, true) && !is_dir($path)) {
        throw new RuntimeException('Destek raporu dizini oluşturulamadı.');
    }
    @chmod($path, 0700);
}

function ya_support_header(string $name): string {
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return trim((string) ($_SERVER[$serverKey] ?? ''));
}

function ya_support_safe_client_id(string $value): string {
    return preg_match('/^[a-f0-9-]{20,80}$/i', $value) === 1 ? strtolower($value) : '';
}

function ya_support_safe_app_version(string $value): string {
    return preg_match('/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/', $value) === 1 ? $value : '';
}

function ya_support_rate_bucket(string $rateDir, string $bucketValue): void {
    $file = $rateDir . DIRECTORY_SEPARATOR . hash('sha256', $bucketValue) . '.json';
    $now = time();
    $handle = fopen($file, 'c+');
    if ($handle === false) {
        throw new RuntimeException('Rate-limit kaydı açılamadı.');
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            throw new RuntimeException('Rate-limit kilidi alınamadı.');
        }
        rewind($handle);
        $raw = stream_get_contents($handle);
        $state = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
        $timestamps = is_array($state['timestamps'] ?? null) ? $state['timestamps'] : [];
        $timestamps = array_values(array_filter(
            array_map('intval', $timestamps),
            static fn(int $stamp): bool => $stamp >= $now - 86400
        ));

        $hourCount = count(array_filter($timestamps, static fn(int $stamp): bool => $stamp >= $now - 3600));
        if ($hourCount >= YA_SUPPORT_HOURLY_LIMIT || count($timestamps) >= YA_SUPPORT_DAILY_LIMIT) {
            ya_support_json(429, [
                'ok' => false,
                'message' => 'Kısa sürede çok fazla hata raporu gönderildi. Bir süre sonra tekrar deneyin.'
            ]);
        }

        $timestamps[] = $now;
        $encoded = json_encode(['timestamps' => $timestamps], JSON_UNESCAPED_SLASHES);
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, $encoded === false ? '{"timestamps":[]}' : $encoded);
        fflush($handle);
        flock($handle, LOCK_UN);
    } finally {
        if (is_resource($handle)) fclose($handle);
    }
    @chmod($file, 0600);
}

function ya_support_rate_limit(string $root, string $clientId): void {
    $rateDir = $root . DIRECTORY_SEPARATOR . '.rate';
    ya_support_ensure_dir($rateDir);
    $remoteIp = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    ya_support_rate_bucket($rateDir, 'ip:' . $remoteIp);
    ya_support_rate_bucket($rateDir, 'client:' . $clientId);
}

function ya_support_validate_session(array $session): array {
    $manifest = $session['session'] ?? null;
    $events = $session['events'] ?? null;
    if (!is_array($manifest) || !is_array($events)) {
        throw new InvalidArgumentException('Tanılama oturumu biçimi geçersiz.');
    }
    if (!is_string($manifest['sessionId'] ?? null) || !preg_match('/^[0-9A-Z_-]{12,80}$/i', $manifest['sessionId'])) {
        throw new InvalidArgumentException('Tanılama oturum kimliği geçersiz.');
    }
    if (!is_string($manifest['startedAt'] ?? null) || strtotime($manifest['startedAt']) === false) {
        throw new InvalidArgumentException('Tanılama oturum zamanı geçersiz.');
    }
    $warnCount = 0;
    $errorCount = 0;
    foreach ($events as $event) {
        if (!is_array($event)) throw new InvalidArgumentException('Tanılama kaydı geçersiz.');
        if (!is_int($event['sequence'] ?? null)) throw new InvalidArgumentException('Tanılama sırası geçersiz.');
        if (!in_array($event['level'] ?? null, ['INFO', 'WARN', 'ERROR'], true)) {
            throw new InvalidArgumentException('Tanılama seviyesi geçersiz.');
        }
        if (!is_string($event['event'] ?? null) || strlen($event['event']) > 120) {
            throw new InvalidArgumentException('Tanılama olay adı geçersiz.');
        }
        if (($event['level'] ?? null) === 'WARN') $warnCount++;
        if (($event['level'] ?? null) === 'ERROR') $errorCount++;
    }
    return [
        'event_count' => count($events),
        'warn_count' => $warnCount,
        'error_count' => $errorCount,
        'abrupt' => empty($manifest['endedAt'])
    ];
}

function ya_support_validate_bundle(array $bundle): array {
    if (($bundle['format'] ?? null) !== YA_SUPPORT_FORMAT || ($bundle['version'] ?? null) !== YA_SUPPORT_VERSION) {
        throw new InvalidArgumentException('Destek raporu biçimi tanınmıyor.');
    }
    if (!is_string($bundle['clientReportId'] ?? null) || !preg_match('/^[a-f0-9-]{20,80}$/i', $bundle['clientReportId'])) {
        throw new InvalidArgumentException('İstemci rapor kimliği geçersiz.');
    }
    if (!is_string($bundle['createdAt'] ?? null) || strtotime($bundle['createdAt']) === false) {
        throw new InvalidArgumentException('Rapor zamanı geçersiz.');
    }

    $app = $bundle['app'] ?? null;
    if (!is_array($app) || !is_string($app['version'] ?? null) || strlen($app['version']) > 80) {
        throw new InvalidArgumentException('Uygulama bilgisi geçersiz.');
    }

    $note = (string) ($bundle['note'] ?? '');
    if (strlen($note) > YA_SUPPORT_MAX_NOTE_BYTES) {
        throw new InvalidArgumentException('Rapor notu çok uzun.');
    }

    $sessions = $bundle['sessions'] ?? null;
    if (!is_array($sessions) || count($sessions) < 1 || count($sessions) > YA_SUPPORT_MAX_SESSIONS) {
        throw new InvalidArgumentException('Rapor 1 ile 3 tanılama oturumu içermeli.');
    }
    $eventCount = 0;
    $warnCount = 0;
    $errorCount = 0;
    $abruptSessionCount = 0;
    foreach ($sessions as $session) {
        if (!is_array($session)) throw new InvalidArgumentException('Tanılama oturumu geçersiz.');
        $sessionFacts = ya_support_validate_session($session);
        $eventCount += $sessionFacts['event_count'];
        $warnCount += $sessionFacts['warn_count'];
        $errorCount += $sessionFacts['error_count'];
        if ($sessionFacts['abrupt']) $abruptSessionCount++;
        if ($eventCount > YA_SUPPORT_MAX_EVENTS) {
            throw new InvalidArgumentException('Destek raporunda çok fazla tanılama kaydı var.');
        }
    }

    $screenshotBytes = 0;
    $screenshot = $bundle['screenshot'] ?? null;
    if ($screenshot !== null) {
        if (!is_array($screenshot) || ($screenshot['mimeType'] ?? null) !== 'image/png') {
            throw new InvalidArgumentException('Ekran görüntüsü biçimi geçersiz.');
        }
        $base64 = (string) ($screenshot['base64'] ?? '');
        if ($base64 === '' || strlen($base64) > (int) ceil(YA_SUPPORT_MAX_SCREENSHOT_BYTES * 4 / 3) + 8) {
            throw new InvalidArgumentException('Ekran görüntüsü boyutu geçersiz.');
        }
        $png = base64_decode($base64, true);
        if ($png === false || strlen($png) > YA_SUPPORT_MAX_SCREENSHOT_BYTES || !str_starts_with($png, "\x89PNG\r\n\x1a\n")) {
            throw new InvalidArgumentException('Ekran görüntüsü PNG olarak doğrulanamadı.');
        }
        $screenshotBytes = strlen($png);
    }

    return [
        'session_count' => count($sessions),
        'event_count' => $eventCount,
        'warn_count' => $warnCount,
        'error_count' => $errorCount,
        'abrupt_session_count' => $abruptSessionCount,
        'screenshot_bytes' => $screenshotBytes,
        'note_present' => $note !== ''
    ];
}

function ya_support_report_id(): string {
    return 'YA-' . gmdate('ymd-His') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    ya_support_json(405, ['ok' => false, 'message' => 'Yalnız POST desteklenir.']);
}

if (strtolower(ya_support_header('Content-Encoding')) !== 'gzip') {
    ya_support_json(415, ['ok' => false, 'message' => 'Destek raporu gzip biçiminde gönderilmeli.']);
}

$clientId = ya_support_safe_client_id(ya_support_header('X-YA-Support-Client'));
$appVersionHeader = ya_support_safe_app_version(ya_support_header('X-YA-App-Version'));
if ($clientId === '' || $appVersionHeader === '') {
    ya_support_json(400, ['ok' => false, 'message' => 'Destek istemci bilgisi eksik veya geçersiz.']);
}

$raw = file_get_contents('php://input');
if (!is_string($raw) || $raw === '' || strlen($raw) > YA_SUPPORT_MAX_COMPRESSED_BYTES) {
    ya_support_json(413, ['ok' => false, 'message' => 'Destek raporu boş veya çok büyük.']);
}

try {
    $decoded = gzdecode($raw, YA_SUPPORT_MAX_DECODED_BYTES + 1);
    if (!is_string($decoded) || $decoded === '' || strlen($decoded) > YA_SUPPORT_MAX_DECODED_BYTES) {
        ya_support_json(413, ['ok' => false, 'message' => 'Destek raporu açıldığında izin verilen boyutu aşıyor.']);
    }

    $bundle = json_decode($decoded, true, 128, JSON_THROW_ON_ERROR);
    if (!is_array($bundle)) {
        throw new InvalidArgumentException('Destek raporu JSON nesnesi olmalı.');
    }
    $facts = ya_support_validate_bundle($bundle);

    $root = ya_support_storage_root();
    ya_support_ensure_dir($root);
    $freeBytes = @disk_free_space($root);
    if (is_float($freeBytes) && $freeBytes < YA_SUPPORT_MIN_FREE_BYTES) {
        ya_support_json(507, ['ok' => false, 'message' => 'Destek sunucusunda geçici olarak yeterli depolama alanı yok.']);
    }
    ya_support_rate_limit($root, $clientId);

    $reportId = ya_support_report_id();
    $reportDir = $root . DIRECTORY_SEPARATOR . $reportId;
    ya_support_ensure_dir($reportDir);

    $reportPath = $reportDir . DIRECTORY_SEPARATOR . 'report.json.gz';
    $metaPath = $reportDir . DIRECTORY_SEPARATOR . 'meta.json';
    if (file_put_contents($reportPath, $raw, LOCK_EX) === false) {
        throw new RuntimeException('Destek raporu kaydedilemedi.');
    }
    @chmod($reportPath, 0600);

    $meta = [
        'version' => 1,
        'report_id' => $reportId,
        'received_at' => gmdate('c'),
        'status' => 'new',
        'app_version' => (string) ($bundle['app']['version'] ?? $appVersionHeader),
        'platform' => (string) ($bundle['app']['platform'] ?? ''),
        'arch' => (string) ($bundle['app']['arch'] ?? ''),
        'session_count' => $facts['session_count'],
        'event_count' => $facts['event_count'],
        'warn_count' => $facts['warn_count'],
        'error_count' => $facts['error_count'],
        'abrupt_session_count' => $facts['abrupt_session_count'],
        'screenshot_bytes' => $facts['screenshot_bytes'],
        'note_present' => $facts['note_present'],
        'compressed_bytes' => strlen($raw),
        'client_hash' => substr(hash('sha256', $clientId), 0, 16)
    ];
    $metaEncoded = json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($metaEncoded === false || file_put_contents($metaPath, $metaEncoded . "\n", LOCK_EX) === false) {
        @unlink($reportPath);
        @rmdir($reportDir);
        throw new RuntimeException('Destek raporu özeti kaydedilemedi.');
    }
    @chmod($metaPath, 0600);

    ya_support_json(201, [
        'ok' => true,
        'report_id' => $reportId,
        'message' => 'Hata raporu alındı.'
    ]);
} catch (JsonException|InvalidArgumentException $error) {
    ya_support_json(400, ['ok' => false, 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('support-report failure: ' . $error->getMessage());
    ya_support_json(500, ['ok' => false, 'message' => 'Hata raporu sunucuda kaydedilemedi.']);
}
