<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/instagram-staging.php';
header('X-Content-Type-Options: nosniff'); header('Cache-Control: no-store'); header('Referrer-Policy: no-referrer');
function ya_instagram_stage_response(int $status, array $data): never {
    http_response_code($status); header('Content-Type: application/json'); echo json_encode($data); exit;
}
$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'GET') {
    // No listing, filename input, redirects or arbitrary query params. Public response is image bytes only.
    $path = (string)($_SERVER['PATH_INFO'] ?? '');
    if (($_SERVER['QUERY_STRING'] ?? '') !== '' || preg_match('/^\/([a-f0-9]{64})\.jpg$/D', $path, $match) !== 1) { http_response_code(404); exit; }
    try { $file = ya_instagram_stage_find($match[1], time()); } catch (Throwable) { $file = null; }
    if ($file === null) { http_response_code(404); exit; }
    header('Content-Type: image/jpeg'); header('Content-Length: ' . filesize($file)); readfile($file); exit;
}
if ($method !== 'POST') { header('Allow: GET, POST'); ya_instagram_stage_response(405, ['ok' => false]); }
$config = json_decode((string)@file_get_contents(__DIR__ . '/../config/business.json'), true) ?: [];
$secret = (string)($config['sync_secret'] ?? ''); $provided = (string)($_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? '');
if ($secret === '' || $provided === '' || !hash_equals($secret, $provided)) ya_instagram_stage_response(401, ['ok' => false]);
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > YA_INSTAGRAM_STAGE_MAX_BYTES + 65536) ya_instagram_stage_response(413, ['ok' => false]);
$token = $_POST['token'] ?? ''; $operation = $_POST['operation'] ?? '';
try {
    if (!is_string($token)) throw new InvalidArgumentException();
    ya_instagram_stage_hash($token);
    if ($operation === 'delete') { ya_instagram_stage_delete($token); ya_instagram_stage_response(200, ['ok' => true]); }
    if ($operation !== 'upload') throw new InvalidArgumentException();
    $expires = $_POST['expires'] ?? '';
    if (!is_string($expires) || preg_match('/^\d{10}$/D', $expires) !== 1 || count($_FILES) !== 1) throw new InvalidArgumentException();
    $file = $_FILES['file'] ?? null; $tmp = is_array($file) ? (string)($file['tmp_name'] ?? '') : '';
    if (!is_array($file) || ($file['error'] ?? -1) !== UPLOAD_ERR_OK || !is_uploaded_file($tmp) || filesize($tmp) > YA_INSTAGRAM_STAGE_MAX_BYTES || (new finfo(FILEINFO_MIME_TYPE))->file($tmp) !== 'image/jpeg') throw new InvalidArgumentException();
    ya_instagram_stage_write($token, (string)file_get_contents($tmp), (int)$expires, time());
    ya_instagram_stage_response(200, ['ok' => true]);
} catch (InvalidArgumentException) { ya_instagram_stage_response(422, ['ok' => false]); }
catch (Throwable) { ya_instagram_stage_response(503, ['ok' => false]); }
