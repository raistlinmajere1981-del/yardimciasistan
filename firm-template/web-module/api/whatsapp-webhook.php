<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/business-messaging.php';
require_once __DIR__ . '/../lib/storage.php';
header('Cache-Control: no-store');
$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'GET') {
    $challenge = ya_messaging_verify_challenge($_GET, (string)(getenv('YA_WHATSAPP_VERIFY_TOKEN') ?: ''));
    http_response_code($challenge === null ? 403 : 200);
    header('Content-Type: text/plain; charset=utf-8'); echo $challenge ?? 'Verification rejected'; exit;
}
if ($method !== 'POST') { header('Allow: GET, POST'); http_response_code(405); exit; }
$appSecret = (string)(getenv('YA_WHATSAPP_APP_SECRET') ?: '');
if ($appSecret === '') { http_response_code(503); exit; }
$stream = fopen('php://input', 'rb');
$body = $stream === false ? false : stream_get_contents($stream, 1048577);
if ($stream !== false) fclose($stream);
if ($body === false || strlen($body) > 1048576) { http_response_code(413); exit; }
if (!ya_messaging_valid_signature($body, (string)($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? ''), $appSecret)) { http_response_code(401); exit; }
try { $statuses = ya_messaging_statuses($body); }
catch (Throwable $error) { http_response_code(400); exit; }
try { ya_messaging_enqueue(ya_storage_open(), $statuses); }
catch (Throwable $error) { http_response_code(503); exit; } // Let Meta retry; never expose/log raw payloads.
http_response_code(200); header('Content-Type: application/json'); echo '{"ok":true}';
