<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/storage.php';
require_once __DIR__ . '/../lib/business-messaging.php';
header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
$config = json_decode((string)@file_get_contents(__DIR__ . '/../config/business.json'), true);
$secret = is_array($config) ? ($config['sync_secret'] ?? '') : '';
$provided = $_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? '';
if (!is_string($secret) || $secret === '' || !is_string($provided) || !hash_equals($secret, $provided)) { http_response_code(401); exit; }
$method = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($method, ['GET', 'POST'], true)) { header('Allow: GET, POST'); http_response_code(405); exit; }
try {
    $accountKey = $_GET['account_key'] ?? '';
    if (!is_string($accountKey) || !preg_match('/^[a-f0-9]{64}$/D', $accountKey)) { http_response_code(400); exit; }
    if ($method === 'GET') { echo json_encode(['ok' => true, 'statuses' => ya_messaging_pull(ya_storage_open(), $accountKey)], JSON_THROW_ON_ERROR); exit; }
    $body = file_get_contents('php://input', false, null, 0, 8193);
    if ($body === false || strlen($body) > 8192) { http_response_code(413); exit; }
    $input = json_decode($body, true, 8, JSON_THROW_ON_ERROR);
    if (!is_array($input) || !is_array($input['ack'] ?? null)) { http_response_code(400); exit; }
    ya_messaging_ack(ya_storage_open(), $accountKey, $input['ack']); echo '{"ok":true}';
} catch (JsonException $error) { http_response_code(400); }
catch (RuntimeException $error) { http_response_code($error->getMessage() === 'invalid_ack' ? 400 : 503); }
catch (Throwable $error) { http_response_code(503); }
