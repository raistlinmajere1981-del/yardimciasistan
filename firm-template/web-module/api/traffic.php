<?php
declare(strict_types=1);

const YA_TRAFFIC_BASE_DIR = __DIR__ . '/..';
const YA_TRAFFIC_CONFIG_FILE = YA_TRAFFIC_BASE_DIR . '/config/business.json';

require_once YA_TRAFFIC_BASE_DIR . '/lib/storage.php';
require_once YA_TRAFFIC_BASE_DIR . '/lib/traffic.php';

function ya_traffic_json(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ya_traffic_no_content(): void
{
    http_response_code(204);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    exit;
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if ($method !== 'POST') {
    header('Allow: POST');
    ya_traffic_json(405, ['ok' => false, 'code' => 'method_not_allowed']);
}

$config = [];
$configJson = @file_get_contents(YA_TRAFFIC_CONFIG_FILE);
if (is_string($configJson)) {
    $decoded = json_decode($configJson, true);
    if (is_array($decoded)) {
        $config = $decoded;
    }
}

// Explicitly disabled collection is a silent no-op for the site.
if (!ya_traffic_enabled(ya_traffic_effective_config($config))) {
    ya_traffic_no_content();
}

if (!ya_traffic_origin_allowed(
    $config,
    (string) ($_SERVER['HTTP_ORIGIN'] ?? ''),
    (string) ($_SERVER['HTTP_HOST'] ?? ''),
    (string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')
)) {
    ya_traffic_json(403, ['ok' => false, 'code' => 'origin_not_allowed']);
}

$contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
if (!str_starts_with($contentType, 'application/json')) {
    ya_traffic_json(415, ['ok' => false, 'code' => 'json_required']);
}

$declaredLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($declaredLength > YA_TRAFFIC_MAX_BODY_BYTES) {
    ya_traffic_json(413, ['ok' => false, 'code' => 'payload_too_large']);
}
$rawBody = file_get_contents('php://input', false, null, 0, YA_TRAFFIC_MAX_BODY_BYTES + 1);
if (!is_string($rawBody) || $rawBody === '' || strlen($rawBody) > YA_TRAFFIC_MAX_BODY_BYTES) {
    ya_traffic_json(413, ['ok' => false, 'code' => 'payload_too_large']);
}

if (ya_traffic_is_bot((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''))) {
    ya_traffic_json(403, ['ok' => false, 'code' => 'automated_client']);
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    ya_traffic_json(400, ['ok' => false, 'code' => 'malformed_json']);
}
$event = ya_traffic_validate_event($payload);
if (($event['ok'] ?? false) !== true) {
    ya_traffic_json(422, ['ok' => false, 'code' => 'invalid_event']);
}

try {
    $result = ya_traffic_record(ya_storage_open(), $event, null, ya_traffic_timezone($config));
    if (($result['ok'] ?? false) !== true) {
        ya_traffic_json((int) ($result['status'] ?? 429), ['ok' => false, 'code' => (string) ($result['code'] ?? 'rate_limited')]);
    }
    // The beacon never needs a response body; keep browser runtime failures private.
    ya_traffic_no_content();
} catch (Throwable $error) {
    ya_traffic_json(503, ['ok' => false, 'code' => 'traffic_unavailable']);
}
