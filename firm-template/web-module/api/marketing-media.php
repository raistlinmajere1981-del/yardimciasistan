<?php
declare(strict_types=1);
function ya_marketing_media_response(int $status, array $data): never {
    http_response_code($status); header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit;
}
$config = json_decode((string) @file_get_contents(__DIR__ . '/../config/business.json'), true) ?: [];
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? ''); $allowed = $config['allowed_origins'] ?? [];
if ($origin !== '' && (in_array($origin, $allowed, true) || in_array('*', $allowed, true))) {
    header('Access-Control-Allow-Origin: ' . (in_array('*', $allowed, true) ? '*' : $origin)); header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, X-YA-Sync-Secret'); header('Access-Control-Allow-Methods: POST, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST, OPTIONS'); ya_marketing_media_response(405, ['ok' => false]); }
$secret = trim((string) ($config['sync_secret'] ?? '')); $provided = trim((string) ($_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? ''));
if ($secret === '' || $provided === '' || !hash_equals($secret, $provided)) ya_marketing_media_response(401, ['ok' => false]);
$business = $_POST['business_id'] ?? ''; $id = $_POST['media_id'] ?? ''; $hash = $_POST['content_hash'] ?? '';
if (!is_string($business) || preg_match('/^[A-Za-z0-9_-]{1,100}$/', $business) !== 1 || !is_string($id) || preg_match('/^asset_[A-Za-z0-9_-]{1,90}$/', $id) !== 1
    || !is_string($hash) || preg_match('/^[a-f0-9]{64}$/', $hash) !== 1 || ($_POST['kind'] ?? '') !== 'image') ya_marketing_media_response(422, ['ok' => false]);
$file = $_FILES['file'] ?? null; $tmp = is_array($file) ? (string) ($file['tmp_name'] ?? '') : '';
if (!is_array($file) || ($file['error'] ?? -1) !== UPLOAD_ERR_OK || !is_uploaded_file($tmp) || filesize($tmp) < 1 || filesize($tmp) > 31457280) ya_marketing_media_response(422, ['ok' => false]);
$size = getimagesize($tmp);
if ($size === false || $size[2] !== IMAGETYPE_PNG || $size[0] * $size[1] > 40000000 || !hash_equals($hash, hash_file('sha256', $tmp))) ya_marketing_media_response(422, ['ok' => false]);
$directory = __DIR__ . '/../media/marketing/' . $business;
if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) ya_marketing_media_response(500, ['ok' => false]);
$name = $id . '.' . $hash . '.png'; $target = $directory . '/' . $name;
if (!is_file($target) && !move_uploaded_file($tmp, $target)) ya_marketing_media_response(500, ['ok' => false]);
@chmod($target, 0644);
$base = rtrim(dirname(dirname(str_replace('\\', '/', (string) $_SERVER['SCRIPT_NAME']))), '/');
ya_marketing_media_response(200, ['ok' => true, 'url' => $base . '/media/marketing/' . $business . '/' . $name, 'message' => 'Pazarlama görseli yüklendi.']);
